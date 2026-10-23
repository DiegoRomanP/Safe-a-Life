import { expect, test, type Page } from '@playwright/test';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { secretFromOtpauthUri, totpCode } from '../../backend/test/support/totp.js';

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
const accountFile = fileURLToPath(new URL('../../backend/.local/qr-enrollment-account.json', import.meta.url));
const factorFile = fileURLToPath(new URL('../../backend/.local/qa-account-mfa.json', import.meta.url));
const email = 'superadmin.inscripcion@example.test';
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(120_000);
test.skip(process.env.SAVE_A_LIFE_LIVE !== '1', 'Solo se ejecuta explícitamente contra Supabase local, sin mocks.');

function privateJson(path: string): Record<string, unknown> {
  if (lstatSync(path).isSymbolicLink()) throw new Error('No se leen credenciales mediante enlaces.');
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuración privada no válida.');
  return value as Record<string, unknown>;
}
function factor(): { secret: string; lastWindow: number } | undefined {
  if (!existsSync(factorFile)) return undefined;
  const value = privateJson(factorFile);
  if (value.email !== email || typeof value.secret !== 'string' || !/^[A-Z2-7]+$/.test(value.secret) || typeof value.lastWindow !== 'number') throw new Error('Factor de prueba no válido.');
  return { secret: value.secret, lastWindow: value.lastWindow };
}
function remember(secret: string, lastWindow: number) {
  if (existsSync(factorFile) && lstatSync(factorFile).isSymbolicLink()) throw new Error('No se escriben secretos mediante enlaces.');
  writeFileSync(factorFile, JSON.stringify({ email, secret, lastWindow }), { mode: 0o600 });
}
async function freshCode(page: Page, secret: string) {
  const remaining = 30_000 - Date.now() % 30_000;
  if (factor()?.lastWindow === Math.floor(Date.now() / 30_000) || remaining < 5000) await page.waitForTimeout(remaining + 100);
  remember(secret, Math.floor(Date.now() / 30_000));
  return totpCode(secret);
}
async function sessionStatus(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    const envelope = await response.json() as { data?: { aal?: unknown; actor?: { role?: unknown } } };
    return { status: response.status, aal: envelope.data?.aal, role: envelope.data?.actor?.role };
  });
}

test('inscripción QR real o ingreso posterior de la cuenta QA, AAL2 y cierre de sesión', async ({ page, baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:5174') throw new Error('La prueba solo admite el origen local aprobado.');
  let stage = 'preparación';
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const origin = new URL(request.url()).origin;
    if (origin !== baseURL) externalRequests.push(origin);
  });
  try {
    const account = privateJson(accountFile);
    if (account.email !== email || typeof account.password !== 'string') throw new Error('Cuenta local no autorizada.');
    let currentFactor = factor();
    const firstEnrollment = !currentFactor;
    await page.goto('/ingresar');
    await page.getByLabel('Correo', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
    stage = 'login real';
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Verifica tu identidad', exact: true })).toBeVisible();
    const qr = page.getByRole('img', { name: 'Código QR para configurar tu autenticador', exact: true });
    if (firstEnrollment) {
      stage = 'inscripción QR real';
      await expect(qr).toHaveCount(0);
      await page.getByRole('button', { name: 'Configurar autenticador', exact: true }).click();
      await expect(qr).toBeVisible();
      if (await qr.locator('path').count() < 1) throw new Error('El QR no contiene representación vectorial.');
      await page.getByText('No puedo escanear el QR: configuración manual', { exact: true }).click();
      const uri = await page.getByLabel('URI de configuración', { exact: true }).inputValue();
      const secret = secretFromOtpauthUri(uri);
      if (await page.getByLabel('Clave de configuración', { exact: true }).inputValue() !== secret) throw new Error('La alternativa manual no coincide.');
      remember(secret, -1);
      currentFactor = { secret, lastWindow: -1 };
      await page.getByText('No puedo escanear el QR: configuración manual', { exact: true }).click();
    } else {
      await expect(qr).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Configurar autenticador', exact: true })).toHaveCount(0);
    }
    if (!currentFactor) throw new Error('No se obtuvo el factor de prueba.');
    stage = 'verificación TOTP real';
    await page.getByLabel('Código de un solo uso', { exact: true }).fill(await freshCode(page, currentFactor.secret));
    await page.getByRole('button', { name: 'Verificar y continuar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tareas administrativas', exact: true })).toBeVisible();
    await expect(qr).toHaveCount(0);
    const session = await sessionStatus(page);
    if (session.status !== 200 || session.aal !== 2 || session.role !== 'superadmin') throw new Error('El servidor no confirmó AAL2.');
    expect(externalRequests.length).toBe(0);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    stage = 'cierre y guard';
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    if ((await sessionStatus(page)).status !== 401) throw new Error('La sesión no se cerró.');
    await page.goto('/superadmin/tareas');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    console.log(firstEnrollment ? 'QA local: inscripción QR inicial, TOTP y AAL2 confirmados.' : 'QA local: ingreso con factor existente y AAL2 confirmados; no se repitió la inscripción inicial.');
  } catch {
    await page.goto('/ingresar').catch(() => undefined);
    throw new Error('Falló QA local en: ' + stage + '. No se adjuntan datos de acceso ni cuerpos de red.');
  }
});

async function browserCall(page: Page, path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: unknown, extraHeaders: Record<string, string> = {}) {
  if (!/^\/api\/v1\/(auth\/|superadmin\/|hospitals\/me\/sites)/.test(path)) throw new Error('Operación local de prueba no permitida.');
  return page.evaluate(async ({ path, method, body, extraHeaders }) => {
    const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const value = response.status === 204 ? {} : await response.json() as { data?: unknown; error?: { code?: string } };
    return { status: response.status, data: value.data, code: value.error?.code };
  }, { path, method, body, extraHeaders });
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respuesta de prueba no válida.');
  return value as Record<string, unknown>;
}
async function authenticatedMutation(page: Page, path: string, method: 'POST' | 'PATCH', body: unknown, key: string, headers: Record<string, string> = {}) {
  const csrf = await browserCall(page, '/api/v1/auth/csrf-token');
  const token = object(csrf.data).token;
  if (csrf.status !== 200 || typeof token !== 'string') throw new Error('No se obtuvo CSRF local.');
  return browserCall(page, path, method, body, { 'Idempotency-Key': key, 'X-CSRF-Token': token, ...headers });
}
async function loginQa(page: Page) {
  const credentials = privateJson(accountFile);
  const currentFactor = factor();
  if (credentials.email !== email || typeof credentials.password !== 'string' || !currentFactor) throw new Error('Completa primero la inscripción QA.');
  await page.goto('/ingresar');
  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verifica tu identidad', exact: true })).toBeVisible();
  await page.getByLabel('Código de un solo uso', { exact: true }).fill(await freshCode(page, currentFactor.secret));
  await page.getByRole('button', { name: 'Verificar y continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tareas administrativas', exact: true })).toBeVisible();
}
async function savedResponse(response: import('@playwright/test').Response) {
  if (!response.ok()) throw new Error('El servidor rechazó la operación de QA.');
  const envelope = await response.json() as { data?: unknown };
  return object(envelope.data);
}
async function loadUntil(page: Page, target: import('@playwright/test').Locator) {
  for (let index = 0; index < 200; index++) {
    await expect.poll(async () => await target.count() > 0 || await page.getByRole('button', { name: 'Cargar más', exact: true }).count() > 0).toBe(true);
    if (await target.count()) return;
    const before = page.waitForResponse((response) => response.request().method() === 'GET' && new URL(response.url()).searchParams.has('cursor'));
    await page.getByRole('button', { name: 'Cargar más', exact: true }).click();
    await savedResponse(await before);
    await expect(page.getByRole('button', { name: 'Cargando…', exact: true })).toHaveCount(0);
  }
  throw new Error('Límite de paginación de QA alcanzado.');
}
async function uiWrite(page: Page, path: string, method: string, buttonName: string) {
  const response = page.waitForResponse((next) => new URL(next.url()).pathname === path && next.request().method() === method);
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  return savedResponse(await response);
}
const fixturesFile = fileURLToPath(new URL('../../backend/.local/superadmin-operations-fixtures.json', import.meta.url));

test('las siete secciones leen el backend real y caben en cinco anchos', async ({ page, baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:5174') throw new Error('Solo se admite el frontend local.');
  let stage = 'login de QA';
  try {
    await loginQa(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const sections = [
      ['tareas', 'Tareas administrativas', '/task-queue'], ['hospitales', 'Hospitales autorizados', '/hospitals?limit=20'],
      ['sedes', 'Sedes autorizadas', '/hospitals?limit=20'], ['administradores', 'Administradores y membresías', '/memberships?limit=20'],
      ['solicitudes', 'Solicitudes de privacidad', '/correction-requests?limit=20'], ['configuracion', 'Configuración versionada', '/configuration'],
      ['auditoria', 'Auditoría minimizada', '/audit-events?limit=20'],
    ];
    const fixture = privateJson(fixturesFile);
    for (const width of [320, 360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, heading, resource] of sections) {
        stage = 'lectura y responsive de ' + route + ' a ' + width;
        await page.goto('/superadmin/' + route);
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        await expect(page.getByText('Cargando datos…', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('alert')).toHaveCount(0);
        if (route === 'tareas') await expect(page.getByRole('heading', { name: 'Prioridad de revisión', exact: true })).toBeVisible();
        else if (route === 'configuracion') await expect(page.getByLabel('Matriz académica', { exact: true })).toBeVisible();
        else if (route !== 'sedes') await expect.poll(async () => await page.getByRole('table').count() > 0 || await page.getByText('Sin resultados', { exact: true }).count() > 0).toBe(true);
        if ((await browserCall(page, '/api/v1/superadmin' + resource)).status !== 200) throw new Error('Una lectura no fue autorizada.');
        if (route === 'sedes') {
          const option = page.locator('select#sa-site-hospital option[value="' + fixture.hospitalId + '"]');
          await loadUntil(page, option);
          await page.locator('select#sa-site-hospital').selectOption(String(fixture.hospitalId));
          await expect(page.getByText('Cargando datos…', { exact: true })).toHaveCount(0);
          await expect(page.getByRole('alert')).toHaveCount(0);
          await expect.poll(async () => await page.getByRole('table').count() > 0 || await page.getByText('Sin resultados', { exact: true }).count() > 0).toBe(true);
          if ((await browserCall(page, '/api/v1/superadmin/hospitals/' + fixture.hospitalId + '/sites')).status !== 200) throw new Error('Sedes no disponibles.');
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) throw new Error('Desbordamiento horizontal en una sección administrativa.');
        if (!(await page.title()).includes(heading.split(' ')[0])) throw new Error('El título no identifica la sección.');
      }
    }
    stage = 'teclado y cierre';
    await page.locator('a[href="#contenido-superadmin"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#contenido-superadmin')).toBeFocused();
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    console.log('QA local: siete secciones, 35 combinaciones de ancho, lectura real y teclado confirmados.');
  } catch {
    await page.goto('/ingresar').catch(() => undefined);
    throw new Error('Falló QA local en: ' + stage + '. Sin capturas ni datos de acceso.');
  }
});

test('edita sedes conservando sus estados y registra una invitación neutra real', async ({ page, baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:5174') throw new Error('Solo se admite el frontend local.');
  let stage = 'login de QA';
  try {
    await loginQa(page);
    const fixture = privateJson(fixturesFile);
    const suffix = String(Date.now());
    const siteName = 'Sede sintética de operaciones ' + suffix;
    stage = 'alta de sede';
    await page.goto('/superadmin/sedes');
    await expect(page.getByRole('heading', { name: 'Sedes autorizadas', exact: true })).toBeVisible();
    await loadUntil(page, page.locator('select#sa-site-hospital option[value="' + fixture.hospitalId + '"]'));
    await page.locator('select#sa-site-hospital').selectOption(String(fixture.hospitalId));
    await page.getByRole('button', { name: 'Nueva sede', exact: true }).click();
    await page.getByLabel('Nombre público', { exact: false }).fill(siteName);
    await page.getByLabel('Dirección pública sintética', { exact: false }).fill('Dirección sintética de operaciones');
    await page.getByLabel('Latitud de la sede sintética', { exact: false }).fill('-12.046374');
    await page.getByLabel('Longitud de la sede sintética', { exact: false }).fill('-77.042793');
    await page.getByLabel('Instrucciones públicas sintéticas', { exact: true }).fill('Instrucción sintética inicial');
    const path = '/api/v1/superadmin/hospitals/' + fixture.hospitalId + '/sites';
    const site = await uiWrite(page, path, 'POST', 'Guardar');
    if (typeof site.siteId !== 'string' || site.isApproved !== false || site.isActive !== true) throw new Error('Estado inicial de sede no válido.');
    await page.getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
    stage = 'edición de sede';
    await page.getByRole('button', { name: 'Editar sede ' + siteName, exact: true }).click();
    const editedName = siteName + ' editada';
    await page.getByLabel('Nombre público', { exact: false }).fill(editedName);
    await page.getByLabel('Dirección pública sintética', { exact: false }).fill('Dirección sintética corregida');
    await page.getByLabel('Latitud de la sede sintética', { exact: false }).fill('-12.050000');
    await page.getByLabel('Longitud de la sede sintética', { exact: false }).fill('-77.040000');
    await page.getByLabel('Instrucciones públicas sintéticas', { exact: true }).fill('Instrucción sintética corregida');
    const sitePath = '/api/v1/superadmin/sites/' + site.siteId;
    const edited = await uiWrite(page, sitePath, 'PATCH', 'Guardar');
    if (edited.publicName !== editedName || edited.publicInstructions !== 'Instrucción sintética corregida' || edited.isApproved !== false || edited.isActive !== true) throw new Error('La edición no conservó los ejes independientes.');
    await page.getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
    stage = 'aprobación y actividad independientes';
    let row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: editedName, exact: true }) });
    const approvedResponse = page.waitForResponse((response) => new URL(response.url()).pathname === sitePath && response.request().method() === 'PATCH');
    await row.getByRole('button', { name: 'Aprobar', exact: true }).click();
    const approved = await savedResponse(await approvedResponse);
    if (approved.isApproved !== true || approved.isActive !== true) throw new Error('Aprobar alteró la actividad.');
    await expect(page.getByText('Cargando datos…', { exact: true })).toHaveCount(0);
    row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: editedName, exact: true }) });
    const inactiveResponse = page.waitForResponse((response) => new URL(response.url()).pathname === sitePath && response.request().method() === 'PATCH');
    await row.getByRole('button', { name: 'Desactivar', exact: true }).click();
    const inactive = await savedResponse(await inactiveResponse);
    if (inactive.isApproved !== true || inactive.isActive !== false) throw new Error('Desactivar alteró la aprobación.');
    stage = 'persistencia tras recarga';
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sedes autorizadas', exact: true })).toBeVisible();
    await loadUntil(page, page.locator('select#sa-site-hospital option[value="' + fixture.hospitalId + '"]'));
    await page.locator('select#sa-site-hospital').selectOption(String(fixture.hospitalId));
    await expect(page.getByRole('cell', { name: editedName, exact: true })).toBeVisible();
    const persisted = object((await browserCall(page, path)).data);
    const item = (persisted.items as Record<string, unknown>[]).find((entry) => entry.siteId === site.siteId);
    if (!item || item.publicAddress !== 'Dirección sintética corregida' || item.publicInstructions !== 'Instrucción sintética corregida' || item.isActive !== false || item.isApproved !== true) throw new Error('La sede editada no persistió.');
    stage = 'invitación administrativa neutra';
    await page.goto('/superadmin/administradores');
    await expect(page.getByRole('heading', { name: 'Administradores y membresías', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Invitar administrador', exact: true }).click();
    await loadUntil(page, page.locator('select#institution-hospital option[value="' + fixture.hospitalId + '"]'));
    await page.getByLabel('Correo sintético', { exact: false }).fill('admin.invitacion.qa.' + suffix + '@example.test');
    await page.locator('select#institution-hospital').selectOption(String(fixture.hospitalId));
    const invitationResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/superadmin/hospital-admin-invitations' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click();
    const response = await invitationResponse;
    if (response.status() !== 202 || typeof (await savedResponse(response)).message !== 'string') throw new Error('La invitación no devolvió aceptación neutra.');
    await page.getByRole('button', { name: 'Cerrar formulario', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    console.log('QA local: sede creada/editada/recargada, estados independientes e invitación202 confirmados. Correo externo no probado.');
  } catch {
    await page.goto('/ingresar').catch(() => undefined);
    throw new Error('Falló QA local en: ' + stage + '. Sin capturas ni datos de acceso.');
  }
});

async function loginAdministrativeFixture(page: Page, credentials: Record<string, unknown>, factorPath: string) {
  if (credentials.email !== 'admin.revocacion.qa@example.test' || typeof credentials.password !== 'string') throw new Error('Fixture administrativo no autorizado.');
  await page.goto('/ingresar');
  const login = await browserCall(page, '/api/v1/auth/sessions', 'POST', { email: credentials.email, password: credentials.password }, { 'Idempotency-Key': crypto.randomUUID() });
  if (login.status !== 200) throw new Error('No se pudo autenticar el fixture administrativo.');
  let challenge = object(login.data).mfaChallengeId;
  let known = existsSync(factorPath) ? privateJson(factorPath) : undefined;
  if (typeof challenge !== 'string') {
    const enrolled = await authenticatedMutation(page, '/api/v1/auth/mfa-enrollments', 'POST', undefined, crypto.randomUUID());
    if (enrolled.status !== 201 || typeof object(enrolled.data).otpauthUri !== 'string') throw new Error('No se pudo configurar el factor del fixture.');
    const data = object(enrolled.data);
    const secret = secretFromOtpauthUri(String(data.otpauthUri));
    challenge = data.challengeId;
    known = { email: credentials.email, secret, lastWindow: -1 };
    writeFileSync(factorPath, JSON.stringify(known), { mode: 0o600 });
  }
  if (!known || known.email !== credentials.email || typeof known.secret !== 'string' || !/^[A-Z2-7]+$/.test(known.secret) || typeof challenge !== 'string') throw new Error('Falta la configuración privada del fixture.');
  const remaining = 30_000 - Date.now() % 30_000;
  if (known.lastWindow === Math.floor(Date.now() / 30_000) || remaining < 5000) await page.waitForTimeout(remaining + 100);
  const secret = known.secret;
  known.lastWindow = Math.floor(Date.now() / 30_000);
  writeFileSync(factorPath, JSON.stringify(known), { mode: 0o600 });
  const verified = await authenticatedMutation(page, '/api/v1/auth/mfa-verifications', 'POST', { challengeId: challenge, code: totpCode(secret) }, crypto.randomUUID());
  if (verified.status !== 200 || object(verified.data).aal !== 2) throw new Error('El fixture no alcanzó AAL2.');
}

test('revoca una membresía QA y deniega la siguiente operación con la misma sesión', async ({ page, browser, baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:5174') throw new Error('Solo se admite el frontend local.');
  let stage = 'login de QA';
  const adminContext = await browser.newContext({ baseURL, timezoneId: 'America/Lima' });
  const adminPage = await adminContext.newPage();
  try {
    await loginQa(page);
    const credentialsFile = fileURLToPath(new URL('../../backend/.local/revocation-account.json', import.meta.url));
    const credentials = privateJson(credentialsFile);
    if (typeof credentials.membershipId !== 'string' || typeof credentials.hospitalId !== 'string') throw new Error('Fixture de membresía incompleto.');
    stage = 'lectura del fixture';
    let membership: Record<string, unknown> | undefined;
    let cursor: string | null = null;
    for (let index = 0; index < 200; index++) {
      const result = await browserCall(page, '/api/v1/superadmin/memberships?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      const data = object(result.data);
      if (result.status !== 200 || !Array.isArray(data.items)) throw new Error('No se pudo consultar la membresía QA.');
      membership = (data.items as Record<string, unknown>[]).find((entry) => entry.membershipId === credentials.membershipId);
      const next = object(data.pagination).nextCursor;
      if (membership || next === null) break;
      if (typeof next !== 'string' || next === cursor) throw new Error('Paginación no válida.');
      cursor = next;
    }
    if (!membership) throw new Error('Membresía QA no disponible.');
    if (membership.status === 'revocada') {
      test.skip(true, 'El fixture ya estaba revocado: no se repite ni se acredita una nueva transición con sesión activa.');
    }
    const adminFactor = fileURLToPath(new URL('../../backend/.local/revocation-admin-mfa.json', import.meta.url));
    stage = 'sesión administrativa real';
    await loginAdministrativeFixture(adminPage, credentials, adminFactor);
    if ((await browserCall(adminPage, '/api/v1/hospitals/me/sites')).status !== 200) throw new Error('El fixture no tiene acceso inicial.');
    for (const path of ['/task-queue', '/configuration', '/audit-events?limit=20']) {
      if ((await browserCall(adminPage, '/api/v1/superadmin' + path)).status !== 403) throw new Error('Un rol hospitalario accedió a Superadmin.');
    }
    stage = 'protecciones CSRF y contrato';
    const hospitalPath = '/api/v1/superadmin/hospitals/' + credentials.hospitalId;
    const before = object((await browserCall(page, hospitalPath)).data).publicName;
    const missingCsrf = await browserCall(page, hospitalPath, 'PATCH', { publicName: 'No debe aplicarse QA' }, { 'Idempotency-Key': crypto.randomUUID() });
    if (missingCsrf.status !== 403) throw new Error('La escritura sin CSRF no fue rechazada.');
    const wrongCsrf = await browserCall(page, hospitalPath, 'PATCH', { publicName: 'No debe aplicarse QA' }, { 'Idempotency-Key': crypto.randomUUID(), 'X-CSRF-Token': 'token-no-valido' });
    if (wrongCsrf.status !== 403 || object((await browserCall(page, hospitalPath)).data).publicName !== before) throw new Error('CSRF alteró el registro.');
    const injectedRole = await authenticatedMutation(page, '/api/v1/superadmin/hospital-admin-invitations', 'POST', { email: 'rol.manipulado.qa@example.test', hospitalId: credentials.hospitalId, role: 'superadmin' }, crypto.randomUUID());
    if (injectedRole.status !== 400) throw new Error('El contrato aceptó un rol arbitrario.');
    stage = 'revocación desde la interfaz';
    await page.goto('/superadmin/administradores');
    await expect(page.getByRole('heading', { name: 'Administradores y membresías', exact: true })).toBeVisible();
    const row = page.getByRole('row').filter({ has: page.getByText(credentials.membershipId, { exact: true }) });
    await loadUntil(page, row);
    await row.getByRole('button', { name: 'Revocar', exact: true }).click();
    await page.getByLabel('Motivo administrativo', { exact: false }).fill('Cierre de acceso del fixture sintético de QA');
    const response = await uiWrite(page, '/api/v1/superadmin/memberships/' + credentials.membershipId, 'PATCH', 'Confirmar revocación');
    if (response.status !== 'revocada' || response.membershipId !== credentials.membershipId) throw new Error('La revocación no se confirmó.');
    stage = 'rechazo inmediato de la misma sesión';
    if ((await browserCall(adminPage, '/api/v1/hospitals/me/sites')).status !== 403) throw new Error('La sesión revocada conserva acceso.');
    await page.getByRole('button', { name: 'Cerrar revocación', exact: true }).click();
    await expect(row).toContainText('Revocada');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Administradores y membresías', exact: true })).toBeVisible();
    const persistedRow = page.getByRole('row').filter({ has: page.getByText(credentials.membershipId, { exact: true }) });
    await loadUntil(page, persistedRow);
    await expect(persistedRow).toContainText('Revocada');
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    console.log('QA local: revocación persistida, misma sesión denegada, rol y CSRF reales confirmados.');
  } catch (failure) {
    if (test.info().expectedStatus === 'skipped') throw failure;
    await page.goto('/ingresar').catch(() => undefined);
    await adminPage.goto('/ingresar').catch(() => undefined);
    throw new Error('Falló QA local en: ' + stage + '. Sin capturas ni datos de acceso.');
  } finally {
    await adminContext.close();
  }
});

test('revisa campos con grant y ejecuta una corrección sintética aprobada', async ({ page, baseURL }) => {
  if (baseURL !== 'http://127.0.0.1:5174') throw new Error('Solo se admite el frontend local.');
  let stage = 'login de QA';
  try {
    await loginQa(page);
    const fixture = privateJson(fixturesFile);
    if (typeof fixture.requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(fixture.requestId)) throw new Error('Fixture no autorizado.');
    const path = '/api/v1/superadmin/correction-requests/' + fixture.requestId;
    stage = 'solicitud y límites iniciales';
    const initial = await browserCall(page, path);
    if (initial.status !== 200) throw new Error('La solicitud QA no está disponible.');
    if (object(initial.data).status !== 'pendiente') test.skip(true, 'El fixture ya fue resuelto: no se reinicia ni se acredita otra ejecución.');
    if ((await browserCall(page, path + '/donor-data')).status !== 400) throw new Error('Se aceptó una petición sin la cabecera de grant obligatoria.');
    if ((await browserCall(page, path + '/donor-data', 'GET', undefined, { 'X-Contextual-Grant': crypto.randomUUID() })).status !== 403) throw new Error('Se aceptó un grant ajeno.');
    const queue = object((await browserCall(page, '/api/v1/superadmin/task-queue')).data);
    if (!Array.isArray(queue.items) || !queue.items.some((entry: unknown) => object(entry).taskId === fixture.requestId)) throw new Error('La cola omitió la solicitud pendiente.');
    await page.goto('/superadmin/solicitudes/' + fixture.requestId);
    await expect(page.getByRole('heading', { name: 'Detalle de solicitud', exact: true })).toBeVisible();
    await expect(page.locator('#sa-access-submit')).toBeVisible();
    stage = 'grant real de revisión';
    await page.locator('#sa-field-name').check();
    await page.locator('#sa-access-reason').fill('Revisión del fixture sintético de QA');
    const grantResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/superadmin/access-grants' && response.request().method() === 'POST');
    const contextualResponse = page.waitForResponse((response) => new URL(response.url()).pathname === path + '/donor-data' && response.request().method() === 'GET');
    await page.getByRole('button', { name: 'Consultar campos autorizados', exact: true }).click();
    const grant = await savedResponse(await grantResponse);
    const values = await savedResponse(await contextualResponse);
    if (grant.action !== 'review' || grant.requestId !== fixture.requestId || JSON.stringify(grant.allowedFields) !== '["name"]' || Object.keys(object(values.currentValues)).some((field) => field !== 'name') || Object.keys(object(values.proposedValues)).some((field) => field !== 'name')) throw new Error('El acceso excedió los campos autorizados.');
    await expect(page.getByRole('heading', { name: 'Valores actuales autorizados', exact: true })).toBeVisible();
    stage = 'decisión administrativa persistente';
    await page.locator('#sa-request-reason').fill('Aprobación del fixture sintético de QA');
    const approved = await uiWrite(page, path, 'PATCH', 'Guardar decisión');
    if (approved.status !== 'aprobada') throw new Error('La decisión no se guardó.');
    await expect(page.getByRole('heading', { name: 'Valores actuales autorizados', exact: true })).toHaveCount(0);
    const wrongAction = await authenticatedMutation(page, path + '/executions', 'POST', undefined, crypto.randomUUID(), { 'X-Contextual-Grant': String(grant.grantId) });
    if (wrongAction.status !== 403) throw new Error('Un grant de revisión permitió ejecutar.');
    if (object((await browserCall(page, path)).data).status !== 'aprobada') throw new Error('El rechazo alteró la solicitud.');
    stage = 'grant y confirmación de ejecución';
    await page.locator('#sa-access-purpose').selectOption('execute');
    await page.locator('#sa-access-reason').fill('Ejecución del cambio sintético aprobado');
    const executionGrant = await uiWrite(page, '/api/v1/superadmin/access-grants', 'POST', 'Autorizar ejecución');
    if (executionGrant.action !== 'execute' || executionGrant.requestId !== fixture.requestId) throw new Error('Grant de ejecución incorrecto.');
    const executeButton = page.getByRole('button', { name: 'Ejecutar corrección aprobada', exact: true });
    await expect(executeButton).toBeDisabled();
    await page.locator('#sa-execution-confirm').check();
    const completed = await uiWrite(page, path + '/executions', 'POST', 'Ejecutar corrección aprobada');
    if (completed.status !== 'completada') throw new Error('La corrección de nombre no terminó.');
    stage = 'persistencia y cierre del acceso';
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Detalle de solicitud', exact: true })).toBeVisible();
    const persisted = await browserCall(page, path);
    if (persisted.status !== 200 || object(persisted.data).status !== 'completada') throw new Error('El estado no persistió.');
    await expect(page.locator('#sa-access-submit')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Valores actuales autorizados', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    console.log('QA local: grant limitado, decisión persistente y corrección de nombre ejecutada y recargada; sin eliminación ni cambio de email.');
  } catch (failure) {
    if (test.info().expectedStatus === 'skipped') throw failure;
    await page.goto('/ingresar').catch(() => undefined);
    throw new Error('Falló QA local en: ' + stage + '. Sin datos personales ni cuerpos de red.');
  }
});
