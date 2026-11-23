// E2E de 3 roles contra el BACKEND REAL (Supabase local + Express + worker con buzón local + frontend Vite) en Chromium.
// Reinicia la base local y siembra cuentas sintéticas (*.example.test). No toca el Supabase remoto: la base remota guarda
// auditoría que no se puede borrar. Uso: `supabase start --workdir backend` y luego `npm run test:e2e:real`.
// Opciones: E2E_HEADED=1 muestra el navegador; E2E_SHOTS=<dir> guarda capturas de cada paso.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import { backendEnvFor, DEMO_PASSWORD, readLocalSupabase, SEED_USERS } from '../backend/test/support/local-env.ts';
import { totpCode } from '../backend/test/support/totp.ts';
import { createDonorAccount } from '../backend/test/support/accounts.ts';
import { resetAuthQuota, sql } from '../backend/test/support/db.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 'http://127.0.0.1:5174';
const mailbox = path.join(root, 'backend/.dev-mailbox');
const shots = process.env.E2E_SHOTS;
const DONOR_PASSWORD = 'Contrasena-Donante-E2E-2026';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}\n`);
  if (!ok) throw new Error(`Falló: ${name}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Falló: ${command} ${args.join(' ')}`);
}

async function waitFor(url, label) {
  for (let i = 0; i < 120; i += 1) {
    try { if ((await fetch(url)).status < 500) return; } catch { /* aún no escucha */ }
    await delay(500);
  }
  throw new Error(`${label} no respondió.`);
}

async function freshCode(secret) {
  // Un mismo usuario no reutiliza la ventana TOTP ya consumida: se espera a que haya margen en la ventana de 30 s.
  const left = 30_000 - (Date.now() % 30_000);
  if (left < 8_000) await delay(left + 200);
  return totpCode(secret);
}

function activeDonor(name) {
  return createDonorAccount(DONOR_PASSWORD).then((email) => {
    sql(`insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
      select id, '${name}', 'O_POS', true, -12.046, -77.043, 'DEMO_ONLY-1', 'activo', now() from auth.users where email = '${email}'`);
    return email;
  });
}

/** Lee del buzón local el primer enlace a `route` (token en el fragmento) enviado a `email`. */
async function mailLinkFor(email, route) {
  for (let i = 0; i < 60; i += 1) {
    let files = [];
    try { files = readdirSync(mailbox); } catch { /* aún no existe */ }
    for (const file of files) {
      const html = readFileSync(path.join(mailbox, file), 'utf8');
      if (!html.includes(`<strong>Para:</strong> ${email}`)) continue;
      const match = new RegExp(`href="([^"]*${route}#[^"]+)"`).exec(html);
      if (match) return match[1].replaceAll('&amp;', '&');
    }
    await delay(500);
  }
  throw new Error(`No llegó el correo ${route} de ${email} al buzón.`);
}
const invitationLinkFor = (email) => mailLinkFor(email, '/invitaciones');

async function snap(page, name) {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
}

async function login(page, email, password, secret) {
  await page.goto(`${WEB}/ingresar`);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  if (secret) {
    await page.waitForURL('**/verificar-identidad');
    await page.getByLabel('Código de 6 dígitos').fill(await freshCode(secret));
    await page.getByRole('button', { name: 'Verificar y continuar' }).click();
  }
}

const children = [];
function start(command, args, env) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit'] });
  children.push(child);
  return child;
}

let browser;
try {
  if (shots) mkdirSync(shots, { recursive: true });
  run('supabase', ['db', 'reset', '--workdir', 'backend']);
  run('node_modules/.bin/tsx', ['backend/scripts/seed-auth-local.ts']);
  rmSync(mailbox, { recursive: true, force: true });
  resetAuthQuota();
  sql("delete from app.rate_limit_events where bucket like 'login:%'");
  const secrets = JSON.parse(readFileSync(path.join(root, 'backend/.local/totp-secrets.json'), 'utf8'));

  const local = readLocalSupabase(root);
  const env = {
    ...backendEnvFor(local, { EMAIL_PROVIDER: 'dev-mailbox', APP_PUBLIC_URL: WEB, ALLOWED_ORIGINS: WEB }),
    NODE_ENV: 'development', PORT: '3000',
  };
  start(process.execPath, ['--import', 'tsx', 'backend/src/server.ts'], env);
  start(process.execPath, ['--import', 'tsx', 'backend/src/worker.ts'], env);
  // Sin token de Mapbox el perfil pide latitud y longitud: el E2E no depende de la red ni del token local.
  start('npm', ['run', 'dev:frontend'], { VITE_MAPBOX_TOKEN: '' });
  await waitFor('http://127.0.0.1:3000/health/live', 'El backend');
  await waitFor(WEB, 'El frontend');

  const donorOne = await activeDonor('Donante Demo Uno');
  const donorTwo = await activeDonor('Donante Demo Dos');

  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1', ...(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {}) });
  const newPage = async () => { const page = await (await browser.newContext()).newPage(); page.setDefaultTimeout(15_000); return page; };

  // 0. Registro de un donante nuevo por la UI (AUTH-02 + DON-01): correo y contraseña, enlace de verificación del buzón,
  // ingreso y perfil obligatorio. Queda `activo` y es candidato real del lote del paso 2.
  const newDonor = `registro-${Date.now()}@example.test`;
  const reg = await newPage();
  await reg.goto(`${WEB}/registro`);
  await reg.getByLabel('Correo electrónico').fill(newDonor);
  await reg.getByLabel('Contraseña de demostración').fill(DONOR_PASSWORD);
  await reg.getByRole('button', { name: 'Continuar' }).click();
  await reg.getByText('Revisa tu correo').waitFor();
  check('registro: la pantalla responde neutra («Revisa tu correo»)', true);
  await snap(reg, '00a-registro-enviado');
  check('registro: la base guarda el perfil en pendiente_verificacion',
    sql(`select p.status from app.donor_profiles p join auth.users u on u.id = p.donor_id where u.email = '${newDonor}'`).trim() === 'pendiente_verificacion');
  await reg.goto(await mailLinkFor(newDonor, '/verificar-correo'));
  await reg.getByRole('button', { name: 'Verificar correo' }).click();
  await reg.getByText('Correo verificado').first().waitFor();
  check('registro: el enlace del correo verifica la cuenta', true);
  await snap(reg, '00b-correo-verificado');
  // Barrera de sesión: verificar cierra las sesiones y exige fijar la contraseña con un segundo enlace antes de ingresar.
  check('registro: tras verificar, la base exige fijar la contraseña',
    sql(`select p.status || ':' || p.password_setup_required from app.donor_profiles p join auth.users u on u.id = p.donor_id where u.email = '${newDonor}'`) === 'incompleto:true');
  await reg.goto(await mailLinkFor(newDonor, '/restablecer-contrasena'));
  await reg.getByLabel('Nueva contraseña').fill(DONOR_PASSWORD);
  await reg.getByRole('button', { name: 'Guardar contraseña' }).click();
  await reg.getByRole('link', { name: /ingresar/i }).first().waitFor();
  check('registro: el segundo enlace fija la contraseña', true);
  await login(reg, newDonor, DONOR_PASSWORD);
  await reg.waitForURL('**/donante/**');
  if (!reg.url().includes('/donante/bienvenida')) await reg.goto(`${WEB}/donante/bienvenida`);
  await reg.getByLabel('Nombre').fill('Donante Registrado E2E');
  await reg.getByLabel('Grupo declarado').selectOption({ label: 'O+' });
  await reg.getByLabel('Latitud').fill('-12.046');
  await reg.getByLabel('Longitud').fill('-77.043');
  await snap(reg, '00c-perfil');
  await reg.getByRole('button', { name: 'Completar perfil' }).click();
  await reg.getByText('Perfil completo').first().waitFor();
  await snap(reg, '00d-perfil-completo');
  check('registro: el perfil obligatorio deja la cuenta activa en la base',
    sql(`select p.status from app.donor_profiles p join auth.users u on u.id = p.donor_id where u.email = '${newDonor}'`).trim() === 'activo');

  // 1. Superadmin: sesión + MFA y vistas reales.
  const sa = await newPage();
  await login(sa, SEED_USERS.superadmin.email, DEMO_PASSWORD, secrets[SEED_USERS.superadmin.email]);
  await sa.waitForURL('**/superadmin');
  // Espera el título: leer el h1 justo tras la navegación competía con la carga de la vista (falla intermitente).
  await sa.getByRole('heading', { level: 1, name: 'Tareas administrativas' }).waitFor();
  check('superadmin: entra con contraseña + TOTP y ve Tareas administrativas', true);
  await snap(sa, '01-superadmin-tareas');
  await sa.goto(`${WEB}/superadmin/hospitales`);
  await sa.getByText('Hospital Demo Uno').first().waitFor();
  check('superadmin: ve los hospitales reales de la siembra', true);

  // 2. Admin de hospital: crea una necesidad y solicita un lote.
  const hospital = await newPage();
  await login(hospital, SEED_USERS.admin1.email, DEMO_PASSWORD, secrets[SEED_USERS.admin1.email]);
  await hospital.waitForURL('**/hospital**');
  await hospital.goto(`${WEB}/hospital/necesidades/nueva`);
  await hospital.getByLabel(/Grupo requerido/).selectOption({ index: 1 });
  const bloodOptions = await hospital.getByLabel(/Grupo requerido/).locator('option').allTextContents();
  await hospital.getByLabel(/Grupo requerido/).selectOption({ label: bloodOptions.find((text) => text.includes('A+')) });
  await hospital.getByLabel(/Meta de intenciones/).fill('2');
  await hospital.getByLabel(/Sede/).selectOption({ index: 1 });
  await hospital.getByLabel(/Vencimiento en horas/).fill('12');
  await snap(hospital, '02-hospital-nueva-necesidad');
  // ADR-008: «Publicar e invitar» activa la necesidad y pide el primer lote en la misma acción (sin pulsar «Solicitar lote»).
  await hospital.getByRole('button', { name: 'Publicar e invitar' }).click();
  await hospital.waitForURL(/\/hospital\/necesidades\/[0-9a-f-]{36}$/);
  check('hospital: crea, publica y envía el primer lote en una sola acción', true);
  await hospital.getByText(/invitaci(ón|ones) creadas?/).waitFor();
  const needUrl = hospital.url();
  // La cobertura es solo agregada: el mapa existe, trae la tabla de anillos y ningún texto de una persona.
  await hospital.getByRole('heading', { name: 'Cobertura de donantes compatibles' }).waitFor();
  await hospital.locator('.leaflet-container').waitFor();
  check('hospital: el mapa de cobertura muestra anillos agregados', (await hospital.locator('table caption', { hasText: 'Donantes compatibles sin invitar' }).isVisible()) && (await hospital.getByText('nunca la ubicación de una persona').isVisible()));
  await snap(hospital, '02b-hospital-cobertura');
  await hospital.goto(`${needUrl}/lotes`);
  await hospital.locator('table tbody tr').first().waitFor();
  check('hospital: el lote automático aparece en la tabla', (await hospital.locator('table tbody tr').count()) >= 1);
  await snap(hospital, '03-hospital-lote');
  check('registro: el donante registrado por la UI recibe la invitación del lote', /\/invitaciones#/.test(await invitationLinkFor(newDonor)));

  // 3. Donante 1: abre el enlace del correo (sin sesión) y confirma con el botón.
  const linkOne = await invitationLinkFor(donorOne);
  const linkOnePage = await newPage();
  await linkOnePage.goto(linkOne);
  await linkOnePage.getByRole('button', { name: /confirmo|confirmar|asistir/i }).first().click();
  await linkOnePage.getByText(/registramos|confirmaste|respuesta/i).first().waitFor();
  check('donante 1: confirma desde el enlace del correo', true);
  await snap(linkOnePage, '04-donante-enlace');

  // 4. Donante 2: confirma con su enlace y luego cambia a «no podré asistir» desde su cuenta (la primera respuesta solo es
  // por enlace; la sesión solo cambia una respuesta ya dada).
  const linkTwoPage = await newPage();
  await linkTwoPage.goto(await invitationLinkFor(donorTwo));
  await linkTwoPage.getByRole('button', { name: /confirmo|confirmar|asistir/i }).first().click();
  await linkTwoPage.getByText(/registramos/i).first().waitFor();
  const donor = await newPage();
  await login(donor, donorTwo, DONOR_PASSWORD);
  await donor.waitForURL('**/donante**');
  await donor.goto(`${WEB}/donante/invitaciones`);
  await donor.getByText('Hospital Demo Uno').first().waitFor();
  check('donante 2: ve su invitación en la sesión', true);
  await snap(donor, '05-donante-invitaciones');
  await donor.getByRole('link', { name: /ver|detalle|abrir/i }).first().click();
  const answered = donor.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/donors/me/invitations/'));
  await donor.getByRole('button', { name: 'No podré asistir' }).click();
  check('donante 2: rechaza desde su sesión (PATCH 200)', (await answered).status() === 200, `status ${(await answered).status()} ${await (await answered).text()}`);

  // 5. El hospital ve la respuesta confirmada del donante 1 (nombre y grupo solo tras confirmar).
  await hospital.goto(`${needUrl}/respuestas`);
  await hospital.getByText('Donante Demo Uno').waitFor();
  check('hospital: ve el nombre del donante que confirmó y no el del que rechazó', !(await hospital.locator('main').textContent()).includes('Donante Demo Dos'));
  await snap(hospital, '06-hospital-respuestas');

  process.stdout.write(`\nE2E real: ${results.filter((r) => r.ok).length}/${results.length} comprobaciones PASS\n`);
} catch (error) {
  process.stderr.write(`\n${error instanceof Error ? error.message : 'Falló el E2E real.'}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of children) child.kill('SIGTERM');
  rmSync(mailbox, { recursive: true, force: true });
}
