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
import { signWebhook } from '../backend/src/modules/email-delivery/application/webhook-signature.ts';
import { WEBHOOK_SECRET, WEBHOOK_SECRET_ENV } from '../backend/test/support/worker.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';

const SCENARIOS = [
  { folder: 'backend/platform' },
  { folder: 'backend/identity-institutions/hospital', user: SEED_USERS.admin1.email },
  { folder: 'backend/identity-institutions/superadmin', user: SEED_USERS.superadmin.email },
  { folder: 'backend/need-records/hospital', user: SEED_USERS.admin1.email },
  { folder: 'backend/email-delivery/webhook', webhook: true },
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

function runScenario(scenario, baseUrl, mfaCode) {
  const key = `${path.basename(scenario.folder)}-${randomBytes(12).toString('hex')}`;
  const result = spawnSync('bru', [
    'run', scenario.folder, '-r',
    '--env-file', 'environments/local-backend.bru',
    '--env-var', `baseUrl=${baseUrl}`,
    '--env-var', `idempotencyKey=${key}`,
    '--env-var', `mfaCode=${mfaCode}`,
    ...(scenario.webhook ? Object.entries(webhookVars()).flatMap(([name, value]) => ['--env-var', `${name}=${value}`]) : []),
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
    runScenario(scenario, baseUrl, scenario.user ? await freshCode(scenario.user, secrets[scenario.user]) : '000000');
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Falló el runner Bruno del backend.'}\n`);
  process.exitCode = 1;
} finally {
  if (server) await stopServer(server);
}
