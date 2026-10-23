import { expect, test, type Page } from '@playwright/test';

const hospitalId = '11111111-1111-4111-8111-111111111101';
const hospital = { hospitalId, publicName: 'Hospital sintético QA', legalName: 'Sociedad sintética QA', isAuthorized: true, createdAt: '2026-10-22T10:00:00Z' };
async function contracts(page: Page) {
  let hospitals = [hospital];
  const calls: { method: string; path: string; body: unknown; key: string | undefined }[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const method = request.method(), body: unknown = request.postDataJSON();
    calls.push({ method, path, body, key: request.headers()['idempotency-key'] });
    let data: unknown;
    if (path === '/api/v1/auth/session') data = { actor: { role: 'superadmin', displayName: 'Superadmin sintético' }, aal: 2, mfaRequired: false };
    else if (path === '/api/v1/auth/csrf-token') data = { token: 'csrf-test-only' };
    else if (path === '/api/v1/superadmin/hospitals' && method === 'POST') {
      const values = body as { publicName: string; legalName: string };
      const created = { ...hospital, ...values, hospitalId: '11111111-1111-4111-8111-111111111102', isAuthorized: false };
      hospitals = [...hospitals, created]; data = created;
    } else if (path === '/api/v1/superadmin/hospitals') data = { items: hospitals, pagination: { nextCursor: null } };
    else if (path.endsWith('/task-queue')) data = { items: [] };
    else { await route.fulfill({ status: 404, json: { error: { code: 'RESOURCE_NOT_FOUND' } } }); return; }
    await route.fulfill({ status: method === 'POST' ? 201 : 200, json: { data } });
  });
  return calls;
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}
test.beforeEach(() => {
  test.info().annotations.push({ type: 'contract-interception', description: 'Servidor interceptado con datos sintéticos. No prueba Supabase real.' });
});
for (const width of [320, 360, 768, 1024, 1440]) {
  test('tareas responsive ' + width, async ({ page }) => {
    await contracts(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/superadmin/tareas');
    await expect(page.getByRole('heading', { level: 1, name: 'Tareas administrativas', exact: true })).toBeVisible();
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
    await noOverflow(page);
    await expect(page.getByText('Escenarios de desarrollo · demo local', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    await page.screenshot({ path: test.info().outputPath('tareas-' + width + '.png'), fullPage: true });
  });
}
test('envía los campos reales y vuelve a consultarlos al recargar', async ({ page }) => {
  const calls = await contracts(page);
  await page.goto('/superadmin/hospitales');
  await page.getByRole('button', { name: 'Crear hospital', exact: true }).click();
  await page.getByLabel('Nombre público').fill('Hospital nuevo sintético');
  await page.getByLabel('Razón social sintética').fill('Sociedad nueva sintética');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Hospital nuevo sintético', exact: true })).toBeVisible();
  const save = calls.find((call) => call.method === 'POST' && call.path.endsWith('/hospitals'));
  expect(save?.body).toEqual({ publicName: 'Hospital nuevo sintético', legalName: 'Sociedad nueva sintética' });
  expect(save?.key).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('cell', { name: 'Hospital nuevo sintético', exact: true })).toBeVisible();
});
test('muestra el conflicto y conserva el borrador', async ({ page }) => {
  await contracts(page);
  await page.route('**/api/v1/superadmin/hospitals', async (route) => {
    if (route.request().method() !== 'POST') { await route.fallback(); return; }
    await route.fulfill({ status: 409, json: { error: { code: 'STATE_CONFLICT' } } });
  });
  await page.goto('/superadmin/hospitales');
  await page.getByRole('button', { name: 'Crear hospital', exact: true }).click();
  await page.getByLabel('Nombre público').fill('Hospital borrador');
  await page.getByLabel('Razón social sintética').fill('Sociedad borrador');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('alert').getByText('Conflicto de actualización', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nombre público')).toHaveValue('Hospital borrador');
  await noOverflow(page);
});
test('sesión no vigente vuelve al login sin mostrar registros', async ({ page }) => {
  await contracts(page);
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({ status: 401, json: { error: { code: 'AUTHENTICATION_REQUIRED' } } }));
  await page.goto('/superadmin/hospitales');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: hospital.publicName, exact: true })).toHaveCount(0);
});

