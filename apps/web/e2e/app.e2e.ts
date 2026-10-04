import { type APIRequestContext, type Page, expect, test } from '@playwright/test';

async function resetDemo(request: APIRequestContext) {
  const response = await request.post('http://127.0.0.1:4011/__mock/reset', {
    headers: {
      Origin: 'http://127.0.0.1:5173',
      'X-Mock-Reset-Token': process.env.MOCK_RESET_TOKEN!,
    },
  });
  expect(response.status()).toBe(204);
}

const syntheticBatchNeed = {
  needId: '4c117ef2-3ebd-43f2-8629-c06d5c8df68f', component: 'RBC',
  requiredBloodType: 'O_POS', targetConfirmations: 5, confirmedIntentCount: 0,
  siteId: '1d1258c3-b8ab-4cc6-9120-27df68452261', radiusKm: 10,
  urgency: 'Urgente', status: 'activa', expiresAt: '2099-10-03T18:00:00Z',
};
function syntheticBatch(index: number) {
  return {
    batchId: `e2eaec30-1f23-40c7-b986-${String(index).padStart(12, '0')}`,
    createdAt: '2026-10-03T12:00:00Z', createdInvitationCount: 0,
    deliveryCounts: { pendiente: 0, enviada: 0, entregada: 0, fallida: 0 },
  };
}
async function enterBatchPage(page: Page, needs = [syntheticBatchNeed]) {
  await page.route('**/api/v1/hospitals/me/needs', (route) => route.fulfill({
    json: { data: { items: needs, pagination: { nextCursor: null } } },
  }));
  await page.goto('/login');
  await page.getByRole('button', { name: /Hospital Consulta necesidades/ }).press('Enter');
  await page.getByRole('button', { name: /Entrar como hospital/ }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Resumen hospitalario' })).toBeVisible();
  await page.goto('/app/hospital/batches');
  await expect(page.getByRole('heading', { name: 'Lotes de invitación' })).toBeVisible();
}

test('batch POST 201 survives follow-up GET 500; retry reads only', async ({ page, request }, testInfo) => {
  await resetDemo(request);
  await page.setViewportSize({ width: 320, height: 800 });
  let posts = 0;
  const keys: Array<string | undefined> = [];
  let reads = 0;
  let followUpFailed = false;
  const statuses: number[] = [];
  const pageErrors: string[] = [];
  const unexpectedConsole: string[] = [];
  let expectedResourceErrors = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (message.text().includes('Failed to load resource') && message.text().includes('500')) expectedResourceErrors++;
    else unexpectedConsole.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/invitation-batches')) statuses.push(response.status());
  });
  await page.route('**/invitation-batches*', async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      keys.push(route.request().headers()['idempotency-key']);
      return route.fulfill({ status: 201, json: { data: {
        batchId: syntheticBatch(posts).batchId, createdInvitationCount: 0, queuedEmailCount: 0,
      } } });
    }
    reads++;
    if (posts > 0 && !followUpFailed) {
      followUpFailed = true;
      return route.fulfill({ status: 500, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Error sintético.' } } });
    }
    return route.fulfill({ json: { data: { items: Array.from({ length: posts }, (_, index) => syntheticBatch(index + 1)), pagination: { nextCursor: null } } } });
  });
  await enterBatchPage(page);
  await expect(page.getByText('Aún no hay solicitudes de lote registradas.')).toBeVisible();
  const initialReads = reads;
  await page.getByRole('button', { name: 'Solicitar lote', exact: true }).press('Enter');
  const registered = page.getByRole('status').filter({ hasText: 'Solicitud de lote registrada.' });
  await expect(registered).toContainText('Invitaciones creadas: 0; correos en cola: 0.');
  await expect(registered).toContainText('El listado no se pudo actualizar');
  await expect(registered).toBeFocused();
  await expect(page.getByRole('button', { name: 'Solicitar lote', exact: true })).toBeDisabled();
  await expect(page.getByText('No se registró', { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('batch-registered-read-error-320.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reintentar lectura' }).press('Enter');
  await expect(page.locator('.batch-record')).toHaveCount(1);
  await expect(registered).not.toContainText('El listado no se pudo actualizar');
  expect(posts).toBe(1);
  expect(reads).toBe(initialReads + 2);
  expect(statuses.slice(-3)).toEqual([201, 500, 200]);
  await expect(page.getByText('no ejecuta matching', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Preparar otro lote' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Solicitar lote', exact: true })).toBeFocused();
  expect(posts).toBe(1);
  await page.getByRole('button', { name: 'Solicitar lote', exact: true }).press('Enter');
  await expect(page.locator('.batch-record')).toHaveCount(2);
  expect(posts).toBe(2);
  expect(reads).toBe(initialReads + 3);
  expect(keys.every((key) => Boolean(key) && key!.length >= 16)).toBe(true);
  expect(keys[0] !== keys[1]).toBe(true);
  expect(statuses.slice(-5)).toEqual([201, 500, 200, 201, 200]);
  await expect(page.getByRole('button', { name: 'Solicitar lote', exact: true })).toBeDisabled();
  expect(pageErrors.length).toBe(0);
  expect(unexpectedConsole.length).toBe(0);
  expect(expectedResourceErrors).toBe(1);
});

test('failed next batch page retries its cursor, keeps rows and deduplicates without POST', async ({ page, request }, testInfo) => {
  await resetDemo(request);
  await page.setViewportSize({ width: 320, height: 800 });
  const cursors: Array<string | null> = [];
  let pageAttempts = 0;
  let posts = 0;
  let releaseRetry!: () => void;
  const retryGate = new Promise<void>((resolve) => { releaseRetry = resolve; });
  await page.route('**/invitation-batches*', async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      return route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR' } } });
    }
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    cursors.push(cursor);
    if (cursor === 'synthetic-retry-cursor') {
      if (++pageAttempts === 1) return route.fulfill({ status: 500, json: { error: {
        code: 'SERVICE_UNAVAILABLE', message: 'Error sintético.', correlationId: 'synthetic-page-error',
      } } });
      await retryGate;
      return route.fulfill({ json: { data: { items: [syntheticBatch(1), syntheticBatch(2)],
        pagination: { nextCursor: 'synthetic-after-retry' } } } });
    }
    return route.fulfill({ json: { data: { items: cursor ? [syntheticBatch(2), syntheticBatch(3)] : [syntheticBatch(1)],
      pagination: { nextCursor: cursor ? null : 'synthetic-retry-cursor' } } } });
  });
  try {
    await enterBatchPage(page);
    await expect(page.locator('.batch-record')).toHaveCount(1);
    await page.getByRole('button', { name: 'Cargar más lotes' }).press('Enter');
    const error = page.getByRole('status').filter({ hasText: 'No se pudo cargar la siguiente página' });
    await expect(error).toBeFocused();
    await expect(page.locator('.batch-record')).toHaveCount(1);
    await expect(page.getByText('Aún no hay solicitudes de lote registradas.')).toHaveCount(0);
    const retry = page.getByRole('button', { name: 'Reintentar lectura' });
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('batch-page-retry-320.png'), fullPage: true });
    await retry.press('Enter');
    await expect.poll(() => pageAttempts).toBe(2);
    await expect(page.locator('.batch-record')).toHaveCount(1);
    await expect(page.getByRole('status').filter({ hasText: 'Cargando más lotes' })).toBeVisible();
    releaseRetry();
    await expect(page.locator('.batch-record')).toHaveCount(2);
    await expect(page.getByRole('status').filter({ hasText: '2 solicitudes de lote mostradas' })).toBeFocused();
    expect(cursors.filter((cursor) => cursor !== null).every((cursor) => cursor === 'synthetic-retry-cursor')).toBe(true);
    await page.getByRole('button', { name: 'Cargar más lotes' }).press('Enter');
    await expect(page.locator('.batch-record')).toHaveCount(3);
    expect(cursors.at(-1) === 'synthetic-after-retry').toBe(true);
    expect(posts).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { releaseRetry(); }
});

test('batch keys and second-intent controls stay isolated between two needs', async ({ page, request }) => {
  await resetDemo(request);
  const other = { ...syntheticBatchNeed, needId: '86ec9a7c-484f-4478-9a6f-01a21710ce8f', requiredBloodType: 'A_POS' };
  const attempts: Array<{ needId: string; key: string | undefined }> = [];
  const records = new Map<string, ReturnType<typeof syntheticBatch>[]>();
  await page.route('**/invitation-batches*', async (route) => {
    const needId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    if (route.request().method() === 'POST') {
      attempts.push({ needId, key: route.request().headers()['idempotency-key'] });
      const batch = syntheticBatch(attempts.length);
      records.set(needId, [...(records.get(needId) ?? []), batch]);
      return route.fulfill({ status: 201, json: { data: { batchId: batch.batchId, createdInvitationCount: 0, queuedEmailCount: 0 } } });
    }
    return route.fulfill({ json: { data: { items: records.get(needId) ?? [], pagination: { nextCursor: null } } } });
  });
  await enterBatchPage(page, [syntheticBatchNeed, other]);
  const primary = page.getByRole('region', { name: 'O+ · Urgente' });
  const secondary = page.getByRole('region', { name: 'A+ · Urgente' });
  const primarySubmit = primary.getByRole('button', { name: 'Solicitar lote', exact: true });
  const secondarySubmit = secondary.getByRole('button', { name: 'Solicitar lote', exact: true });
  await expect(primarySubmit).toBeEnabled();
  await expect(secondarySubmit).toBeEnabled();
  await primarySubmit.press('Enter');
  await expect(primary.locator('.batch-record')).toHaveCount(1);
  await expect(primarySubmit).toBeDisabled();
  await expect(secondarySubmit).toBeEnabled();
  await secondarySubmit.press('Enter');
  await expect(secondary.locator('.batch-record')).toHaveCount(1);
  await primary.getByRole('button', { name: 'Preparar otro lote' }).press('Enter');
  await expect(primarySubmit).toBeFocused();
  expect(attempts.length).toBe(2);
  await expect(secondarySubmit).toBeDisabled();
  await primarySubmit.press('Enter');
  await expect(primary.locator('.batch-record')).toHaveCount(2);
  await expect(secondary.locator('.batch-record')).toHaveCount(1);
  expect(attempts.length).toBe(3);
  expect(attempts.map((attempt) => attempt.needId)).toEqual([syntheticBatchNeed.needId, other.needId, syntheticBatchNeed.needId]);
  expect(attempts.every((attempt) => Boolean(attempt.key))).toBe(true);
  expect(new Set(attempts.map((attempt) => attempt.key)).size).toBe(3);
});

test('batch pagination is explicit, accessible and fits all target widths', async ({ page, request }, testInfo) => {
  await resetDemo(request);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  const queries: URLSearchParams[] = [];
  await page.route('**/invitation-batches*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    const items = params.has('cursor')
      ? Array.from({ length: 6 }, (_, index) => syntheticBatch(index + 19))
      : Array.from({ length: 20 }, (_, index) => syntheticBatch(index));
    return route.fulfill({ json: { data: { items, pagination: { nextCursor: params.has('cursor') ? null : 'synthetic-next' } } } });
  });
  await enterBatchPage(page);
  await expect(page.locator('.batch-record')).toHaveCount(20);
  const initialReads = queries.length;
  expect(initialReads).toBeLessThanOrEqual(2);
  const moreButton = page.getByRole('button', { name: 'Cargar más lotes' });
  await moreButton.focus();
  await expect(moreButton).toBeFocused();
  expect(await moreButton.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe('3px');
  expect(await moreButton.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await moreButton.press('Enter');
  await expect(page.locator('.batch-record')).toHaveCount(25);
  await expect(page.getByRole('status').filter({ hasText: '25 solicitudes de lote mostradas' })).toBeFocused();
  expect(queries[initialReads]!.get('cursor')).toBe('synthetic-next');
  expect(queries[initialReads]!.get('limit')).toBe('20');
  await expect(page.getByRole('button', { name: 'Cargar más lotes' })).toHaveCount(0);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`batch-pagination-${width}.png`), fullPage: true });
  }
  const snapshot = await page.locator('main').ariaSnapshot();
  expect(snapshot).toContain('Lotes de invitación');
  expect(snapshot).toContain('Actualizar lotes');
  await testInfo.attach('batch-accessibility-tree', { body: snapshot, contentType: 'text/plain' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Actualizar lotes' }).press('Enter');
  await expect(page.locator('.batch-record')).toHaveCount(20);
  expect(queries).toHaveLength(initialReads + 2);
  expect(queries.at(-1)!.has('cursor')).toBe(false);
  expect(errors).toEqual([]);
});

test('batch refresh and need replacement discard late pages without crossing cursors', async ({ page, request }) => {
  await resetDemo(request);
  let refresh = false;
  let finishLate!: () => void;
  let lateRequests = 0;
  const queries: Array<{ needId: string; cursor: string | null }> = [];
  const otherNeed = { ...syntheticBatchNeed, needId: '86ec9a7c-484f-4478-9a6f-01a21710ce8f', requiredBloodType: 'A_POS' };
  await page.route('**/invitation-batches*', async (route) => {
    const url = new URL(route.request().url());
    const needId = url.pathname.split('/').at(-2)!;
    const cursor = url.searchParams.get('cursor');
    queries.push({ needId, cursor });
    if (cursor) {
      lateRequests++;
      await new Promise<void>((resolve) => { finishLate = resolve; });
      return route.fulfill({ json: { data: { items: [syntheticBatch(21), syntheticBatch(22)], pagination: { nextCursor: null } } } });
    }
    const isOther = needId === otherNeed.needId;
    return route.fulfill({ json: { data: {
      items: [syntheticBatch(isOther ? 100 : refresh ? 99 : 0)],
      pagination: { nextCursor: isOther ? null : refresh ? 'fresh-scope' : 'old-scope' },
    } } });
  });
  await enterBatchPage(page);
  await expect(page.locator('.batch-record')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cargar más lotes' }).press('Enter');
  await expect.poll(() => lateRequests).toBe(1);
  await expect(page.getByRole('status').filter({ hasText: 'Cargando más lotes' })).toBeVisible();
  refresh = true;
  await page.getByRole('button', { name: 'Actualizar lotes' }).press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Listado actualizado.' })).toBeVisible();
  const lateFinished = page.waitForResponse((response) => response.url().includes('cursor=old-scope'));
  finishLate();
  await lateFinished;
  await expect(page.locator('.batch-record')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cargar más lotes' }).press('Enter');
  await expect.poll(() => lateRequests).toBe(2);
  expect(queries.at(-1)?.cursor).toBe('fresh-scope');
  await page.route('**/api/v1/hospitals/me/needs', (route) => route.fulfill({
    json: { data: { items: [otherNeed], pagination: { nextCursor: null } } },
  }));
  // Replace the keyed need through existing navigation; no new selection UI.
  await page.getByRole('link', { name: 'Resumen', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Resumen hospitalario' })).toBeVisible();
  await page.getByRole('link', { name: 'Lotes', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'A+ · Urgente' })).toBeVisible();
  const replacedLateFinished = page.waitForResponse((response) => response.url().includes('cursor=fresh-scope'));
  finishLate();
  await replacedLateFinished;
  await expect(page.locator('.batch-record')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Cargar más lotes' })).toHaveCount(0);
  expect(queries.filter((query) => query.needId === otherNeed.needId).every((query) => query.cursor === null)).toBe(true);
});

test('donor response is reflected as a minimized hospital view', async ({ page, request }, testInfo) => {
  const clientErrors: string[] = [];
  page.on('pageerror', (error) => clientErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') clientErrors.push(message.text());
  });
  await resetDemo(request);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Organiza avisos a donantes, con el hospital al centro.' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#public-main')).toBeFocused();
  await page.getByRole('button', { name: 'Entrar a la demostración' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Elige una vista de demostración.' })).toBeVisible();
  await page.getByRole('button', { name: /Entrar como donante/ }).press('Enter');

  await expect(page).toHaveURL(/\/app\/donor\/invitations$/);
  await expect(page.getByRole('heading', { name: 'Tus invitaciones' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('donor-invitations.png'), fullPage: true });
  await page.getByRole('button', { name: 'No asistiré' }).press('Enter');
  await expect(page.getByText('No asistirá', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Registramos que no asistirás; el hospital ya no ve tu nombre ni grupo.');
  await expect(page.getByRole('status')).toBeFocused();
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await page.getByRole('link', { name: 'Mi perfil', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Navegación' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeFocused();
  await expect(page.getByText('Lima · ubicación aproximada')).toBeVisible();
  await expect(page.getByText('-12.046')).toHaveCount(0);

  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await page.getByRole('link', { name: 'Historial', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Historial de respuestas' })).toBeVisible();
  await expect(page.getByText('Respuesta: no asistirá')).toBeVisible();

  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await page.getByRole('link', { name: 'Mis solicitudes', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'No tienes solicitudes' })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva solicitud' }).click();
  await page.getByRole('checkbox', { name: 'Nombre' }).check();
  await page.getByRole('button', { name: 'Registrar solicitud' }).press('Enter');
  await expect(page.getByRole('status')).toHaveText('Solicitud 1 registrada. No se modificó tu perfil.');
  await expect(page.getByRole('status')).toBeFocused();
  await expect(page.getByText('Nombre', { exact: true })).toBeVisible();
  await expect(page.getByText('Nombre sintético actualizado')).toHaveCount(0);
  await expect(page.getByText('cambio.demo@example.test')).toHaveCount(0);

  await page.getByRole('button', { name: 'Nueva solicitud' }).click();
  await page.getByRole('checkbox', { name: 'Nombre' }).check();
  await page.getByRole('button', { name: 'Registrar solicitud' }).press('Enter');
  await expect(page.getByRole('status')).toHaveText('Solicitud 2 registrada. No se modificó tu perfil.');
  await expect(page.getByRole('status')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Nueva solicitud' }).click();
  await page.getByLabel('Tipo de solicitud').selectOption('eliminacion');
  await page.getByRole('button', { name: 'Registrar solicitud' }).press('Enter');
  await expect(page.getByText('Solicitud de eliminación de datos propios', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Solicitud 3 registrada. No se modificó tu perfil.');
  await expect(page.getByRole('status')).toBeFocused();

  await page.getByRole('button', { name: 'Cerrar sesión' }).press('Enter');
  await expect(page).toHaveURL('/login');
  const hospitalOption = page.getByRole('button', { name: /Hospital Consulta necesidades/ });
  await hospitalOption.focus();
  await page.keyboard.press('Space');
  await expect(hospitalOption).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Entrar como hospital/ }).press('Enter');
  await expect(page).toHaveURL(/\/app\/hospital$/);
  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await page.getByRole('link', { name: 'Respuestas', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Respuestas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Respuestas' })).toBeFocused();
  await expect(page.getByText('Donante Alterno')).toBeVisible();
  await expect(page.getByText('Donante Demo', { exact: true })).toHaveCount(0);
  expect(clientErrors).toEqual([]);
});

test('hospital creates a draft and all role shells fit a narrow viewport', async ({ page, request }, testInfo) => {
  await resetDemo(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Elige una vista de demostración.' })).toBeVisible();
  await page.keyboard.press('Tab');
  const loginSkipLink = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(loginSkipLink).toBeFocused();
  expect(await loginSkipLink.evaluate((element) => getComputedStyle(element).outlineColor)).toBe('rgb(3, 105, 161)');
  await page.keyboard.press('Enter');
  await expect(page.locator('#login-main')).toBeFocused();
  await expect(page.getByRole('button', { name: /Hospital Norte Demo/ })).toHaveCount(0);
  const hospitalOption = page.getByRole('button', { name: /Hospital Consulta necesidades/ });
  await hospitalOption.focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /Entrar como hospital/ }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Resumen hospitalario' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('hospital-mobile.png'), fullPage: true });
  const mobileSkipLink = page.getByRole('link', { name: 'Saltar al contenido' });
  await mobileSkipLink.focus();
  expect(await mobileSkipLink.evaluate((element) => getComputedStyle(element).outlineColor)).toBe('rgb(22, 78, 99)');
  let needsMode: 'server' | 'delayed' | 'error' | 'empty' = 'server';
  const demoNeedList = { data: { items: [{
    needId: '4c117ef2-3ebd-43f2-8629-c06d5c8df68f',
    component: 'RBC',
    requiredBloodType: 'O_POS',
    targetConfirmations: 5,
    confirmedIntentCount: 2,
    siteId: '1d1258c3-b8ab-4cc6-9120-27df68452261',
    radiusKm: 10,
    urgency: 'Urgente',
    status: 'activa',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }], pagination: { nextCursor: null } } };
  await page.route('**/api/v1/hospitals/me/needs', async (route) => {
    if (route.request().method() !== 'GET' || needsMode === 'server') return route.continue();
    if (needsMode === 'delayed') {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demoNeedList) });
    }
    if (needsMode === 'error') {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No se pudo completar la solicitud.', correlationId: 'synthetic-hospital-error' } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [], pagination: { nextCursor: null } } }),
    });
  });
  needsMode = 'delayed';
  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  await page.getByRole('link', { name: 'Necesidades', exact: true }).press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Cargando necesidades del hospital' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Necesidades' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Necesidades' })).toBeFocused();
  needsMode = 'server';
  await expect(page.getByRole('button', { name: 'Navegación' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Crear necesidad' }).click();
  await page.getByLabel('Meta de intenciones').fill('3');
  await page.getByRole('button', { name: 'Guardar borrador' }).press('Enter');
  await expect(page.getByText('borrador', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Borrador de necesidad guardado. No se envió ninguna invitación.');
  await expect(page.getByRole('status')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await page.getByRole('link', { name: 'Lotes', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Lotes de invitación' })).toBeVisible();
  await page.getByRole('button', { name: 'Solicitar lote' }).first().press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Solicitud de lote registrada.' })).toContainText('Solicitud de lote registrada. Invitaciones creadas: 0; correos en cola: 0.');
  await expect(page.getByText('no ejecuta matching', { exact: false })).toBeVisible();

  needsMode = 'error';
  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await page.getByRole('link', { name: 'Necesidades', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Necesidades' })).toBeVisible();
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('alert').getByText('No se pudieron cargar las necesidades de esta institución.')).toBeVisible();
  needsMode = 'server';
  await page.getByRole('button', { name: 'Intentar de nuevo' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Urgente · 5 intenciones' })).toBeVisible();

  needsMode = 'empty';
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('heading', { name: 'Aún no hay necesidades' })).toBeVisible();
  needsMode = 'server';

  await page.getByRole('button', { name: 'Cerrar sesión' }).press('Enter');
  await page.goto('/login');
  const superadminOption = page.getByRole('button', { name: /Superadmin Revisa tareas/ });
  await superadminOption.focus();
  await page.keyboard.press('Space');
  let tasksMode: 'delayed' | 'server' = 'delayed';
  await page.route('**/api/v1/superadmin/task-queue', async (route) => {
    if (route.request().method() !== 'GET' || tasksMode === 'server') return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [{
        taskId: '14fc3c52-96b8-4aad-88b7-4e213c17bc97',
        kind: 'correction_request',
        createdAt: new Date().toISOString(),
        resourceCode: 'request-51a8f2',
      }] } }),
    });
  });
  await page.getByRole('button', { name: /Entrar como superadmin/ }).press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Cargando tareas administrativas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tareas administrativas' })).toBeVisible();
  tasksMode = 'server';
  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await page.getByRole('link', { name: 'Hospitales', exact: true }).press('Enter');
  await expect(page.getByText('Hospital Norte Demo', { exact: true })).toBeVisible();
  await page.route('**/api/v1/superadmin/hospitals', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { items: [], pagination: { nextCursor: null } } }),
  }));
  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await page.getByRole('link', { name: 'Tareas', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Tareas administrativas' })).toBeVisible();
  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await page.getByRole('link', { name: 'Hospitales', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'No hay hospitales en el catálogo' })).toBeVisible();
  await page.unroute('**/api/v1/superadmin/hospitals');
  let auditMode: 'error' | 'empty' = 'error';
  await page.route('**/api/v1/superadmin/audit-events', (route) => {
    if (auditMode === 'error') {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'No se pudo completar la solicitud.', correlationId: 'synthetic-audit-error' } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [], pagination: { nextCursor: null } } }),
    });
  });
  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  await page.getByRole('link', { name: 'Auditoría', exact: true }).press('Enter');
  await expect(page.getByRole('alert').getByText('La vista administrativa no está disponible en este momento.')).toBeVisible();
  auditMode = 'empty';
  await page.getByRole('button', { name: 'Intentar de nuevo' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Sin eventos de auditoría' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Navegación' }).press('Enter');
  expect(await page.locator('#mobile-navigation-list').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('donor invitation list provides clear empty and service-error states', async ({ page, request }) => {
  await resetDemo(request);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.route('**/api/v1/donors/me/invitations', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { items: [], pagination: { nextCursor: null } } }),
    });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: /Entrar como donante/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cargando tus invitaciones' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No tienes invitaciones activas' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.unrouteAll();
  await page.route('**/api/v1/donors/me/invitations', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'No se pudo completar la solicitud.',
        correlationId: 'synthetic-correlation-id',
      },
    }),
  }));
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('alert').getByText('Las invitaciones no están disponibles en este momento.')).toBeVisible();
  await expect(page.getByText('synthetic-correlation-id')).toHaveCount(0);
});

test('an expired local session hides previously loaded protected data', async ({ page, request }) => {
  await resetDemo(request);
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        actor: { role: 'donante', displayName: 'Donante Demo' },
        aal: 1,
        mfaRequired: false,
        expiresAt: new Date(Date.now() + 5_000).toISOString(),
      },
    }),
  }));
  await page.route('**/api/v1/donors/me/invitations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        items: [{
          invitationId: '76eb9a7c-484f-4478-9a6f-01a21710ce8f',
          hospitalName: 'Hospital Demo',
          publicSiteName: 'Sede Centro',
          requiredBloodType: 'O_POS',
          urgency: 'Urgente',
          instructions: 'Muestra sintética.',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          validity: 'activa',
          delivery: 'entregada',
          response: 'confirmada',
        }],
        pagination: { nextCursor: null },
      },
    }),
  }));

  await page.goto('/login');
  await page.getByRole('button', { name: /Entrar como donante/ }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Tus invitaciones' })).toBeVisible();
  await expect(page.getByText('Sede Centro', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Elige una vista de demostración.' })).toBeVisible({ timeout: 7000 });
  await expect(page.getByText('Donante Demo', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Sede Centro', { exact: true })).toHaveCount(0);
});

test('session revalidation clears protected data after an API 401', async ({ page, request }) => {
  await resetDemo(request);
  await page.route('**/api/v1/auth/sessions', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        actor: { role: 'donante', displayName: 'Donante Demo' },
        aal: 1,
        mfaRequired: false,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    }),
  }));
  await page.route('**/api/v1/donors/me/invitations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        items: [{
          invitationId: '76eb9a7c-484f-4478-9a6f-01a21710ce8f',
          hospitalName: 'Hospital Demo',
          publicSiteName: 'Sede Centro',
          requiredBloodType: 'O_POS',
          urgency: 'Urgente',
          instructions: 'Muestra sintética.',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          validity: 'activa',
          delivery: 'entregada',
          response: 'confirmada',
        }],
        pagination: { nextCursor: null },
      },
    }),
  }));

  await page.goto('/login');
  await page.getByRole('button', { name: /Entrar como donante/ }).press('Enter');
  await expect(page.getByRole('main').getByText('Donante Demo', { exact: true })).toBeVisible();

  await page.route('**/api/v1/auth/session', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'La sesión no está vigente.', correlationId: 'synthetic-session-expired' },
    }),
  }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Elige una vista de demostración.' })).toBeVisible();
  await expect(page.getByRole('main').getByText('Donante Demo', { exact: true })).toHaveCount(0);
});
