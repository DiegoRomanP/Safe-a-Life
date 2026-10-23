import { expect, test, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { secretFromOtpauthUri, totpCode } from '../../backend/test/support/totp.js';

// Las instantáneas automáticas de errores pueden revelar el URI privado del primer enrolamiento.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

const accountsFile = fileURLToPath(new URL('../../backend/.local/local-accounts.json', import.meta.url));
const factorFile = fileURLToPath(new URL('../../backend/.local/live-superadmin-mfa.json', import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(180_000);
test.skip(process.env.SAVE_A_LIFE_LIVE !== '1', 'Requiere Supabase y backend locales preparados explícitamente; no usa mocks.');

function privateJson(path: string): unknown {
  if (lstatSync(path).isSymbolicLink()) throw new Error('No se leen credenciales mediante enlaces.');
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
function account() {
  const values = privateJson(accountsFile);
  if (!Array.isArray(values)) throw new Error('Falta la cuenta local de pruebas.');
  const value = values.find((entry: unknown) => typeof entry === 'object' && entry !== null && 'role' in entry && entry.role === 'superadmin') as Record<string, unknown> | undefined;
  if (value?.email !== 'superadmin.local@example.test' || typeof value.password !== 'string') throw new Error('La cuenta local de pruebas no es válida.');
  return { email: value.email, password: value.password };
}
function savedFactor(): { secret: string; lastUsedWindow: number } | undefined {
  if (!existsSync(factorFile)) return undefined;
  const value = privateJson(factorFile) as Record<string, unknown>;
  if (value.email !== 'superadmin.local@example.test' || typeof value.secret !== 'string' || !/^[A-Z2-7]+$/.test(value.secret) || typeof value.lastUsedWindow !== 'number') throw new Error('El factor privado de pruebas no es válido.');
  return { secret: value.secret, lastUsedWindow: value.lastUsedWindow };
}
function saveFactor(secret: string, lastUsedWindow: number) {
  if (existsSync(factorFile) && lstatSync(factorFile).isSymbolicLink()) throw new Error('No se escriben credenciales mediante enlaces.');
  writeFileSync(factorFile, JSON.stringify({ email: 'superadmin.local@example.test', secret, lastUsedWindow }), { mode: 0o600 });
}
async function freshCode(page: Page, secret: string) {
  const prior = savedFactor();
  const remaining = 30_000 - Date.now() % 30_000;
  if (prior?.lastUsedWindow === Math.floor(Date.now() / 30_000) || remaining < 5000) await page.waitForTimeout(remaining + 100);
  const window = Math.floor(Date.now() / 30_000);
  saveFactor(secret, window);
  return totpCode(secret);
}
async function data(response: import('@playwright/test').Response): Promise<Record<string, unknown>> {
  if (!response.ok()) throw new Error('El servidor local rechazó una operación de prueba.');
  const value = await response.json() as { data?: unknown };
  if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) throw new Error('El servidor local devolvió una respuesta no válida.');
  return value.data as Record<string, unknown>;
}
async function browserRead(page: Page, path: string) {
  if (!path.startsWith('/api/v1/auth/session') && !path.startsWith('/api/v1/superadmin/')) throw new Error('Destino de lectura de prueba no permitido.');
  return page.evaluate(async (relativePath) => {
    const response = await fetch(relativePath, { credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    const envelope = await response.json() as { data?: unknown };
    return { status: response.status, data: envelope.data };
  }, path);
}
async function browserData(page: Page, path: string): Promise<Record<string, unknown>> {
  const result = await browserRead(page, path);
  if (result.status !== 200 || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw new Error('La lectura autenticada del navegador no respetó el contrato.');
  return result.data as Record<string, unknown>;
}
async function loadHospitalUntilPresent(page: Page, target: Locator) {
  const more = page.getByRole('button', { name: 'Cargar más', exact: true });
  for (let pageIndex = 0; pageIndex < 200; pageIndex++) {
    await expect.poll(async () => await target.count() > 0 || await more.count() > 0).toBe(true);
    if (await target.count() > 0) return;
    const nextPage = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/superadmin/hospitals' && url.searchParams.has('cursor') && response.request().method() === 'GET';
    });
    await more.click();
    await data(await nextPage);
    await expect(page.getByRole('button', { name: 'Cargando…', exact: true })).toHaveCount(0);
  }
  throw new Error('El hospital no apareció dentro del límite de paginación de la prueba.');
}
async function auditOperations(page: Page, since: number) {
  const remaining = new Set(['hospital.creado', 'hospital.actualizado', 'sede.creada']);
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < 200; pageIndex++) {
    const path = '/api/v1/superadmin/audit-events?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const result = await browserData(page, path);
    if (!Array.isArray(result.items) || !result.pagination || typeof result.pagination !== 'object') throw new Error('La página de auditoría no respetó el contrato.');
    for (const value of result.items as unknown[]) {
      if (!value || typeof value !== 'object') throw new Error('El evento de auditoría no respetó el contrato.');
      const entry = value as Record<string, unknown>;
      if (typeof entry.event === 'string' && entry.result === 'ok' && typeof entry.occurredAt === 'string' && Date.parse(entry.occurredAt) >= since - 1000) remaining.delete(entry.event);
    }
    if (!remaining.size) return;
    const next = (result.pagination as Record<string, unknown>).nextCursor;
    if (next === null) break;
    if (typeof next !== 'string' || !next || seen.has(next)) throw new Error('El cursor de auditoría no permite avanzar.');
    seen.add(next); cursor = next;
  }
  throw new Error('No se confirmó la auditoría de la operación sintética dentro del límite de paginación.');
}
async function saveHospital(page: Page, path: string, secret: string) {
  const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  let response = await responsePromise;
  if (response.status() === 403) {
    const body = await response.json() as { error?: { code?: string } };
    if (body.error?.code !== 'STEP_UP_REQUIRED') throw new Error('La autorización local fue rechazada.');
    await page.getByLabel('Código de autenticación reforzada').fill(await freshCode(page, secret));
    await page.getByRole('button', { name: 'Verificar identidad', exact: true }).click();
    await expect(page.getByText('Identidad verificada.', { exact: false })).toBeVisible();
    const retry = page.waitForResponse((next) => new URL(next.url()).pathname === path && next.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    response = await retry;
  }
  return data(response);
}

test('guarda hospital y sede en Supabase, conserva sus identificadores al recargar y cierra la sesión', async ({ page, baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:5174') throw new Error('Esta prueba solo admite el frontend local aprobado.');
  const startedAt = Date.now();
  let stage = 'preparación de la cuenta local';
  try {
    const credentials = account();
    let factor = savedFactor();
    await page.goto('/ingresar');
    await page.getByLabel('Correo', { exact: true }).fill(credentials.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
    stage = 'inicio de sesión real';
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Verifica tu identidad', exact: true })).toBeVisible();
    if (!factor) {
      stage = 'alta real del segundo factor';
      await page.getByRole('button', { name: 'Configurar autenticador', exact: true }).click();
      const uriControl = page.getByLabel('URI de configuración', { exact: true });
      await expect(uriControl).toBeVisible();
      const secret = secretFromOtpauthUri(await uriControl.inputValue());
      saveFactor(secret, -1);
      factor = { secret, lastUsedWindow: -1 };
    }
    stage = 'verificación real del segundo factor';
    await page.getByLabel('Código de un solo uso', { exact: true }).fill(await freshCode(page, factor.secret));
    await page.getByRole('button', { name: 'Verificar y continuar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tareas administrativas', exact: true })).toBeVisible();
    const session = await browserData(page, '/api/v1/auth/session');
    if (session.aal !== 2) throw new Error('La sesión no llegó a AAL2.');

    const suffix = randomUUID().slice(0, 8);
    const name = 'Hospital sintético E2E ' + suffix;
    const siteName = 'Sede sintética E2E ' + suffix;
    stage = 'creación real del hospital';
    await page.goto('/superadmin/hospitales');
    await page.getByRole('button', { name: 'Crear hospital', exact: true }).click();
    await page.getByLabel('Nombre público').fill(name);
    await page.getByLabel('Razón social sintética').fill('Sociedad sintética E2E ' + suffix);
    const hospitalCreated = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/superadmin/hospitals' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    const hospital = await data(await hospitalCreated);
    if (typeof hospital.hospitalId !== 'string' || !uuid.test(hospital.hospitalId) || hospital.isAuthorized !== false) throw new Error('El alta del hospital no respetó el contrato.');
    await loadHospitalUntilPresent(page, page.getByRole('cell', { name, exact: true }));
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
    stage = 'persistencia del hospital tras recarga';
    await page.reload();
    await loadHospitalUntilPresent(page, page.getByRole('cell', { name, exact: true }));
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
    const hospitalPath = '/api/v1/superadmin/hospitals/' + hospital.hospitalId;
    const persistedHospital = await browserData(page, hospitalPath);
    if (persistedHospital.hospitalId !== hospital.hospitalId || persistedHospital.publicName !== name) throw new Error('El hospital no conserva su identidad persistente.');

    stage = 'autorización real del hospital';
    await page.getByRole('button', { name: 'Editar ' + name, exact: true }).click();
    await page.locator('select#institution-authorized').selectOption('true');
    const authorized = await saveHospital(page, hospitalPath, factor.secret);
    if (authorized.hospitalId !== hospital.hospitalId || authorized.isAuthorized !== true) throw new Error('La autorización no se guardó.');
    await loadHospitalUntilPresent(page, page.getByRole('cell', { name, exact: true }));
    await expect(page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) })).toContainText('Autorizado');

    stage = 'creación real de la sede';
    await page.goto('/superadmin/sedes');
    await loadHospitalUntilPresent(page, page.getByRole('option', { name, exact: true }));
    await page.locator('select#sa-site-hospital').selectOption(hospital.hospitalId);
    await page.getByRole('button', { name: 'Nueva sede', exact: true }).click();
    await page.getByLabel('Nombre público').fill(siteName);
    await page.getByLabel('Dirección pública sintética').fill('Dirección sintética de prueba E2E');
    await page.getByLabel('Latitud de la sede sintética').fill('-12.046374');
    await page.getByLabel('Longitud de la sede sintética').fill('-77.042793');
    const sitesPath = hospitalPath + '/sites';
    const siteCreated = page.waitForResponse((response) => new URL(response.url()).pathname === sitesPath && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    const site = await data(await siteCreated);
    if (typeof site.siteId !== 'string' || !uuid.test(site.siteId) || site.hospitalId !== hospital.hospitalId) throw new Error('La sede no respetó el contrato.');
    await expect(page.getByRole('cell', { name: siteName, exact: true })).toBeVisible();
    stage = 'persistencia de la sede tras recarga';
    await page.reload();
    await loadHospitalUntilPresent(page, page.getByRole('option', { name, exact: true }));
    await page.locator('select#sa-site-hospital').selectOption(hospital.hospitalId);
    await expect(page.getByRole('cell', { name: siteName, exact: true })).toBeVisible();
    const persistedSites = await browserData(page, sitesPath);
    if (!Array.isArray(persistedSites.items) || !persistedSites.items.some((value: unknown) => typeof value === 'object' && value !== null && 'siteId' in value && value.siteId === site.siteId)) throw new Error('La sede no conserva su identidad persistente.');

    stage = 'lectura real de auditoría';
    await page.goto('/superadmin/auditoria');
    await expect(page.getByRole('heading', { name: 'Auditoría minimizada', exact: true })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await auditOperations(page, startedAt);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    stage = 'cierre real de sesión y bloqueo de acceso';
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    const ended = await browserRead(page, '/api/v1/auth/session');
    if (ended.status !== 401) throw new Error('La sesión no se cerró.');
    await page.goto('/superadmin/hospitales');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  } catch {
    // Evita que el diagnóstico automático capture un URI de enrolamiento o un código MFA.
    await page.goto('/ingresar').catch(() => undefined);
    throw new Error('Falló la prueba local en la etapa: ' + stage + '. No se adjuntan credenciales ni cuerpos de red.');
  }
});
