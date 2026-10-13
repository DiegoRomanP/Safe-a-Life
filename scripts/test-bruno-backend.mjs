// Bruno contra el BACKEND REAL (Supabase local + Express). No arranca Supabase: si no está levantado, falla
// con instrucciones. Reinicia la base, siembra usuarios, levanta el backend en un puerto efímero y corre
// cada carpeta de bruno/backend/** con el TOTP vigente del usuario. Mismos flags de higiene que test-bruno.mjs.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { backendEnvFor, readLocalSupabase, SEED_USERS } from '../backend/test/support/local-env.ts';
import { totpCode } from '../backend/test/support/totp.ts';
import { createHash } from 'node:crypto';
import { createDonorAccount } from '../backend/test/support/accounts.ts';
import { sealEmailChange } from '../backend/src/modules/donor-records/application/email-change.ts';
import { sql } from '../backend/test/support/db.ts';
import { signWebhook } from '../backend/src/modules/email-delivery/application/webhook-signature.ts';
import { WEBHOOK_SECRET, WEBHOOK_SECRET_ENV, workerConfig } from '../backend/test/support/worker.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';

const SCENARIOS = [
  { folder: 'backend/platform' },
  { folder: 'backend/identity-institutions/hospital', user: SEED_USERS.admin1.email },
  { folder: 'backend/identity-institutions/superadmin', user: SEED_USERS.superadmin.email },
  { folder: 'backend/need-records/hospital', user: SEED_USERS.admin1.email },
  { folder: 'backend/email-delivery/webhook', webhook: true },
  { folder: 'backend/identity-institutions/tokens', tokens: true },
  { folder: 'backend/donor-records/public', donors: true },
  { folder: 'backend/donor-records/hospital', user: SEED_USERS.admin1.email, hospital: true },
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Falló: ${command} ${args[0] ?? ''}`.trim());
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, host, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const usedWindows = new Map();

/**
 * TOTP con al menos 10 s de margen en su ventana de 30 s. Un mismo usuario no reutiliza la ventana de un
 * escenario anterior: Auth rechaza un código ya usado, así que se espera a la ventana siguiente.
 */
async function freshCode(user, secret) {
  const window = () => Math.floor(Date.now() / 30_000);
  const remaining = () => 30_000 - (Date.now() % 30_000);
  if (remaining() < 10_000 || usedWindows.get(user) === window()) await delay(remaining() + 100);
  usedWindows.set(user, window());
  return totpCode(secret);
}

async function waitForServer(server, baseUrl) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('El backend terminó antes de iniciar.');
    const response = await fetch(`${baseUrl}/health/live`).catch(() => null);
    if (response?.ok) return;
    await delay(150);
  }
  throw new Error('El backend no quedó listo dentro del tiempo permitido.');
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => server.once('exit', resolve)), delay(2_000)]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

/** Firmas Svix para los cuerpos exactos de bruno/backend/email-delivery/webhook (se envían como texto, sin reformatear). */
function webhookVars() {
  const bodies = {
    delivered: '{"type":"email.delivered","created_at":"2026-10-13T12:00:00.000Z","data":{"email_id":"prov-bruno-0001"}}',
    badShape: '{"type":"email.sent"}',
    opened: '{"type":"email.opened","data":{"email_id":"prov-bruno-0001"}}',
  };
  const nonce = randomBytes(6).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const sign = (id, timestamp, body) => `v1,${signWebhook(WEBHOOK_SECRET, id, String(timestamp), body)}`;
  const ids = { svixId: `msg_bruno_${nonce}_1`, svixIdBad: `msg_bruno_${nonce}_2`, svixIdOld: `msg_bruno_${nonce}_3`, svixIdBadShape: `msg_bruno_${nonce}_4`, svixIdOpened: `msg_bruno_${nonce}_5` };
  return {
    ...ids,
    svixTimestamp: String(now),
    svixOldTimestamp: String(now - 400),
    sigDelivered: sign(ids.svixId, now, bodies.delivered),
    sigOld: sign(ids.svixIdOld, now - 400, bodies.delivered),
    sigBadShape: sign(ids.svixIdBadShape, now, bodies.badShape),
    sigOpened: sign(ids.svixIdOpened, now, bodies.opened),
  };
}

/**
 * El runner hace de «bandeja de entrada»: crea una invitación y un token de recuperación válidos con tokens que
 * solo él conoce (en la base solo existe el hash) y se los pasa a Bruno, que no puede leer el outbox cifrado.
 */
async function tokenVars() {
  const hash = (token) => createHash('sha256').update(token, 'utf8').digest('hex');
  const adminToken = randomBytes(32).toString('base64url');
  const resetToken = randomBytes(32).toString('base64url');
  const email = `bruno-admin-${randomBytes(4).toString('hex')}@example.test`;
  const invitationId = sql(`insert into app.admin_invitations (hospital_id, email, created_by)
    select '11111111-1111-4111-8111-111111111101', '${email}', id from auth.users where email = 'superadmin@example.test' returning invitation_id`).split('\n')[0];
  sql(`insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values ('${hash(adminToken)}', 'invitacion_admin', '${invitationId}', now() + interval '72 hours')`);
  const donorEmail = await createDonorAccount('Contrasena-Original-Bruno-2026');
  // Otra cuenta para las solicitudes de recuperación: una solicitud nueva anula el token de reset ya emitido.
  const recoveryEmail = await createDonorAccount('Contrasena-Original-Bruno-2026');
  sql(`insert into app.action_tokens (token_hash, kind, subject_id, expires_at)
    select '${hash(resetToken)}', 'recuperacion', id, now() + interval '1 hour' from auth.users where email = '${donorEmail}'`);
  return { adminToken, resetToken, donorEmail, recoveryEmail, unknownToken: randomBytes(32).toString('base64url'), newPassword: 'Contrasena-Nueva-Bruno-2026' };
}

/**
 * Bandeja de entrada de F5: crea con tokens que solo el runner conoce (en la base solo existe el hash) un donante por
 * verificar, un alta asistida por reclamar y un cambio de correo, y las cuentas que usan las pruebas.
 */
async function donorVars() {
  const hash = (token) => createHash('sha256').update(token, 'utf8').digest('hex');
  const donorPassword = 'Contrasena-Donante-Bruno-2026';
  const suffix = randomBytes(4).toString('hex');
  const verifyToken = randomBytes(32).toString('base64url');
  const claimToken = randomBytes(32).toString('base64url');
  const changeToken = randomBytes(32).toString('base64url');

  const verifyEmail = await createDonorAccount(donorPassword);
  sql(`insert into app.donor_profiles (donor_id) select id from auth.users where email = '${verifyEmail}'`);
  sql(`insert into app.action_tokens (token_hash, kind, subject_id, expires_at)
    select '${hash(verifyToken)}', 'verificacion_email', id, now() + interval '24 hours' from auth.users where email = '${verifyEmail}'`);

  // Cuenta distinta para el registro con un correo existente: reemitir la verificación invalida el token anterior.
  const existingEmail = await createDonorAccount(donorPassword);

  const claimEmail = `bruno-alta-${suffix}@example.test`;
  const signupId = sql(`insert into app.assisted_signups (hospital_id, email, name, activation_expires_at, purge_at)
    values ('11111111-1111-4111-8111-111111111101', '${claimEmail}', 'Persona Reclamada', now() + interval '24 hours', now() + interval '30 days') returning signup_id`).split('\n')[0];
  sql(`insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values ('${hash(claimToken)}', 'alta_asistida', '${signupId}', now() + interval '24 hours')`);

  const changeEmail = await createDonorAccount(donorPassword);
  const changeNewEmail = `bruno-nuevo-${suffix}@example.test`;
  const sealedEmail = sealEmailChange(workerConfig().secrets.outboxKeyring, hash(changeToken), changeNewEmail);
  sql(`insert into app.action_tokens (token_hash, kind, subject_id, data, expires_at)
    select '${hash(changeToken)}', 'cambio_email', id, '${JSON.stringify({ sealedEmail })}'::jsonb, now() + interval '24 hours' from auth.users where email = '${changeEmail}'`);

  return {
    donorPassword, verifyEmail, existingEmail, verifyToken, claimToken, changeToken, changeNewEmail,
    regEmail: `bruno-registro-${suffix}@example.test`, unknownToken: randomBytes(32).toString('base64url'),
  };
}

async function hospitalVars() {
  const suffix = randomBytes(4).toString('hex');
  return { signupEmail: `bruno-alta-hospital-${suffix}@example.test`, existingAccountEmail: SEED_USERS.donor1.email };
}

async function runScenario(scenario, baseUrl, mfaCode) {
  const key = `${path.basename(scenario.folder)}-${randomBytes(12).toString('hex')}`;
  const result = spawnSync('bru', [
    'run', scenario.folder, '-r',
    '--env-file', 'environments/local-backend.bru',
    '--env-var', `baseUrl=${baseUrl}`,
    '--env-var', `idempotencyKey=${key}`,
    '--env-var', `mfaCode=${mfaCode}`,
    ...(scenario.webhook ? Object.entries(webhookVars()).flatMap(([name, value]) => ['--env-var', `${name}=${value}`]) : []),
    ...(scenario.donors ? Object.entries(await donorVars()).flatMap(([name, value]) => ['--env-var', `${name}=${value}`]) : []),
    ...(scenario.hospital ? Object.entries(await hospitalVars()).flatMap(([name, value]) => ['--env-var', `${name}=${value}`]) : []),
    ...(scenario.tokens ? Object.entries(await tokenVars()).flatMap(([name, value]) => ['--env-var', `${name}=${value}`]) : []),
    '--tests-only',
    '--reporter-skip-all-headers',
    '--reporter-skip-body',
  ], { cwd: path.join(root, 'bruno'), stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falló el escenario Bruno: ${scenario.folder}`);
}

const status = spawnSync('supabase', ['status', '--workdir', 'backend', '-o', 'json'], { cwd: root, encoding: 'utf8' });
if (status.status !== 0) {
  process.stderr.write('Supabase local no está levantado. Ejecuta: supabase start --workdir backend\n');
  process.exit(1);
}

let server;
try {
  run('supabase', ['db', 'reset', '--workdir', 'backend']);
  run('node_modules/.bin/tsx', ['backend/scripts/seed-auth-local.ts']);
  const secrets = JSON.parse(readFileSync(path.join(root, 'backend/.local/totp-secrets.json'), 'utf8'));

  const port = await freePort();
  const local = readLocalSupabase(root);
  server = spawn(process.execPath, ['--import', 'tsx', 'backend/src/server.ts'], {
    cwd: root,
    env: { ...process.env, ...backendEnvFor(local, { RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET_ENV }), NODE_ENV: 'development', PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const baseUrl = `http://${host}:${port}`;
  await waitForServer(server, baseUrl);

  for (const scenario of SCENARIOS) {
    await runScenario(scenario, baseUrl, scenario.user ? await freshCode(scenario.user, secrets[scenario.user]) : '000000');
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Falló el runner Bruno del backend.'}\n`);
  process.exitCode = 1;
} finally {
  if (server) await stopServer(server);
}
