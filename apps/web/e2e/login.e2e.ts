import { expect, test, type Page } from '@playwright/test';

async function fillLogin(page: Page, role = 'donante') {
  await page.getByLabel('Correo', { exact: true }).fill(`${role}.demo@example.test`);
  await page.getByLabel('Contraseña', { exact: true }).fill('synthetic-demo-only');
}

test.beforeEach(async ({ page }) => { await page.goto('/login'); });

for (const [role, route, heading] of [
  ['donante', 'donor', 'Tus invitaciones'],
  ['hospital', 'hospital', 'Resumen hospitalario'],
  ['superadmin', 'superadmin', 'Tareas administrativas'],
]) {
  test(`synthetic ${role} account opens its assigned role`, async ({ page }) => {
    await fillLogin(page, role);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/app/${route}(?:/|$)`));
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  });
}

test('invalid credentials show a generic error and allow a successful retry', async ({ page }) => {
  await fillLogin(page);
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrect-synthetic-password');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('No se pudo iniciar sesión. Verifica el correo y la contraseña e inténtalo de nuevo.');
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Correo', { exact: true })).toBeEnabled();
  await expect(page).toHaveURL('/login');
  await fillLogin(page);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/donor/);
});

test('required fields and email validity prevent empty or malformed submission', async ({ page }) => {
  let posts = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/auth/sessions')) posts++; });
  const email = page.getByLabel('Correo', { exact: true });
  const password = page.getByLabel('Contraseña', { exact: true });
  const submit = page.getByRole('button', { name: 'Ingresar', exact: true });
  await submit.click();
  await expect(email).toBeFocused();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await email.fill('donante.demo@example.test');
  await submit.click();
  await expect(password).toBeFocused();
  expect(await password.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await password.fill('synthetic-demo-only');
  await email.fill('invalid');
  await submit.click();
  await expect(email).toBeFocused();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);
  expect(posts).toBe(0);
});

test('pending login prevents duplicate submissions and disables related actions', async ({ page }) => {
  let posts = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/auth/sessions', async route => {
    posts++;
    await gate;
    await route.continue();
  });
  await fillLogin(page);
  await page.getByLabel('Contraseña', { exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Ingresando…' })).toBeDisabled();
  await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByLabel('Correo', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '¿Olvidaste tu contraseña?' })).toBeDisabled();
  // Exercise the handler guard as well as the disabled button.
  await page.locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  release();
  await expect(page).toHaveURL(/\/app\/donor/);
  expect(posts).toBe(1);
});

test('registration and recovery clearly announce unavailable demo flows without requests', async ({ page }) => {
  const mutations: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') mutations.push(request.url()); });
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).press('Enter');
  await expect(page.getByRole('status')).toHaveText('La recuperación de contraseña aún está pendiente en esta demostración.');
  await page.getByRole('button', { name: 'Crear cuenta' }).press('Enter');
  await expect(page.getByRole('status')).toHaveText('El registro de donantes aún está pendiente. Por ahora, usa una cuenta sintética de la demostración.');
  await expect(page).toHaveURL('/login');
  expect(mutations).toEqual([]);
});

for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844], ['narrow', 320, 800]] as const) {
  test(`login keyboard navigation and layout at ${name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`login-${name}.png`), fullPage: true });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#login-main')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Correo', { exact: true })).toBeFocused();
    await page.keyboard.type('donante.demo@example.test');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
    await page.keyboard.type('synthetic-demo-only');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '¿Olvidaste tu contraseña?' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByText('Ver credenciales de demostración', { exact: true }).press('Enter');
    await expect(page.getByText('superadmin.demo@example.test', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).press('Enter');
    await expect(page).toHaveURL(/\/app\/donor/);
  });
}