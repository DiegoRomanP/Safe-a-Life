// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { press, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';
import { registerSuperadminApi } from '../../../test/superadminApi.js';

setupRender();
const api = registerSuperadminApi();

const CORRECTION = '7f21a8b3-4e5f-4a71-9c23-3d4e5f6a7b84';
const button = (view: HTMLElement, text: string) => [...view.querySelectorAll('button')].find((item) => item.textContent?.startsWith(text)) ?? null;
const control = (view: HTMLElement, label: string) => {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
};
const alerts = (view: HTMLElement) => view.querySelector('[aria-live="assertive"]')?.textContent ?? '';
const live = (view: HTMLElement) => view.querySelector('[aria-live="polite"]')?.textContent ?? '';

async function stepUp(view: HTMLElement, code = '123456') {
  type(control(view, 'Código de 6 dígitos'), code);
  await press(button(view, 'Verificar y continuar'));
}

describe('Superadmin contra el backend', () => {
  it('pide cada lista al backend y las sedes por hospital', async () => {
    renderRoute('/superadmin/sedes');
    await settle();
    const requests = api().requests_;
    for (const path of ['/superadmin/task-queue', '/superadmin/hospitals', '/superadmin/memberships', '/superadmin/correction-requests', '/superadmin/configuration', '/superadmin/audit-events']) {
      expect(requests).toContain(`GET ${path}`);
    }
    expect(requests.filter((item) => /\/hospitals\/[^/]+\/sites$/.test(item))).toHaveLength(api().hospitals.length);
  });

  it('si el backend falla al cargar muestra el error con reintento y no pinta datos a medias', async () => {
    api().readStatus = 503;
    const view = renderRoute('/superadmin/hospitales');
    await settle();
    expect(view.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar la información');
    expect(view.querySelector('table')).toBeNull();

    api().readStatus = null;
    await press(button(view, 'Reintentar'));
    expect(view.querySelector('h1')?.textContent).toBe('Hospitales autorizados');
    expect(view.querySelectorAll('tbody tr').length).toBe(api().hospitals.length);
  });

  it('un código de step-up incorrecto lo dice, no ejecuta la acción y deja reintentar', async () => {
    const view = renderRoute('/superadmin/hospitales');
    await settle();
    await press(button(view, 'Autorizar'));
    await stepUp(view, '000000');
    expect(view.textContent).toContain('El código es incorrecto o venció.');
    expect(api().requests_.some((item) => item.startsWith('PATCH /superadmin/hospitals/'))).toBe(false);
    expect(api().hospitals.find((h) => !h.isAuthorized)?.isAuthorized).toBe(false);

    await stepUp(view, '123456');
    expect(api().hospitals.find((h) => h.publicName === 'Clínica Norte Demo')?.isAuthorized).toBe(true);
  });

  it('si el backend dice STEP_UP_REQUIRED (venció en el servidor) lo explica y la siguiente acción vuelve a pedir el código', async () => {
    const view = renderRoute('/superadmin/hospitales');
    await settle();
    await press(button(view, 'Autorizar'));
    await stepUp(view);
    // El servidor olvida el step-up antes que el cliente.
    api().stepUpUntil = 0;
    await press(button(view, 'Desautorizar'));
    expect(alerts(view)).toContain('Tu verificación reforzada venció');
    expect(live(view)).not.toContain('desautorizado');

    await press(button(view, 'Desautorizar'));
    expect(view.querySelector('#step-up-titulo')?.textContent).toBe('Verificación requerida');
  });

  it('un conflicto (409) se anuncia, no muestra éxito y refresca los datos', async () => {
    const view = renderRoute('/superadmin/hospitales');
    await settle();
    await press(button(view, 'Autorizar'));
    api().writeStatus = 409;
    await stepUp(view);
    expect(alerts(view)).toContain('El estado cambió');
    expect(live(view)).not.toContain('autorizado');
    api().writeStatus = null;
  });

  it('ver datos usa el grantId del acceso contextual en la cabecera y los datos viven solo en pantalla', async () => {
    const view = renderRoute(`/superadmin/solicitudes/${CORRECTION}`);
    await settle();
    type(view.querySelector('#acceso-motivo'), 'Revisar la corrección pedida.');
    await press(button(view, 'Ver datos de la solicitud'));
    await stepUp(view);
    expect(api().lastGrantHeader).toMatch(/^[0-9a-f-]{36}$/);
    expect(view.textContent).toContain('A−');
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('A−');
  });

  it('ejecutar emite un grant de ejecución y lo envía en la cabecera, con el step-up exigido', async () => {
    const view = renderRoute(`/superadmin/solicitudes/${CORRECTION}`);
    await settle();
    await press(view.querySelector('input[type="radio"][name="decision"][value="aprobada"]'));
    type(control(view, 'Motivo de la decisión'), 'Corrección documentada.');
    await press(button(view, 'Registrar decisión'));
    type(control(view, 'Motivo de la ejecución'), 'Aplicar la corrección aprobada.');
    await press(button(view, 'Ejecutar solicitud'));
    await stepUp(view);
    expect(api().requests_.filter((item) => item.startsWith('POST /superadmin/access-grants'))).toHaveLength(1);
    expect(api().requests_.some((item) => item.endsWith('/executions'))).toBe(true);
    expect(api().lastGrantHeader).toBeTruthy();
    expect(api().requests.find((item) => item.requestId === CORRECTION)?.status).toBe('completada');
  });
});
