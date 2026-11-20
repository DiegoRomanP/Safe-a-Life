// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { press, settle, setupRender, type } from '../../../test/render.js';
import { registerHospitalApi } from '../../../test/hospitalApi.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();
const api = registerHospitalApi();

const A104 = 'a1040c3d-1e2f-4a3b-8c4d-5e6f7a8b9c01';
const SAN_BORJA = '5b0a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c21';
const button = (view: HTMLElement, text: string) => [...view.querySelectorAll('button')].find((item) => item.textContent === text) ?? null;
const alerts = (view: HTMLElement) => view.querySelector('[aria-live="assertive"]')?.textContent ?? '';
const control = (view: HTMLElement, label: string) => {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
};
function choose(select: Element | null, value: string) {
  if (!(select instanceof HTMLSelectElement)) throw new Error('No se encontró el select.');
  act(() => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
}
function fillNeed(view: HTMLElement) {
  choose(control(view, 'Grupo requerido'), 'O_POS');
  type(control(view, 'Meta de confirmaciones'), '4');
  choose(control(view, 'Sede'), SAN_BORJA);
}

describe('Hospital contra el backend', () => {
  it('pide sedes, necesidades y altas al backend', async () => {
    renderRoute('/hospital');
    await settle();
    expect(api().calls).toEqual(expect.arrayContaining(['GET /hospitals/me/sites', 'GET /hospitals/me/needs', 'GET /hospitals/me/assisted-signups']));
  });

  it('un 403 en toda el área (membresía no activa) se trata como «sin acceso», no como lista vacía', async () => {
    api().forbidden = true;
    const view = renderRoute('/hospital/necesidades');
    await settle();
    expect(view.textContent).toContain('Sin acceso');
    expect(view.querySelector('table')).toBeNull();
    expect(view.textContent).not.toContain('Necesidades activas');
  });

  it('si el backend falla al cargar muestra el error con reintento y no pinta datos a medias', async () => {
    api().readStatus = 503;
    const view = renderRoute('/hospital/necesidades');
    await settle();
    expect(view.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar la información');
    api().readStatus = null;
    await press(button(view, 'Reintentar'));
    expect(view.querySelector('h1')?.textContent).toBe('Necesidades');
    expect(view.querySelectorAll('tbody tr')).toHaveLength(api().needs.length);
  });

  it('crear envía un cuerpo cerrado: sin hospital, estado ni propietario, con Idempotency-Key', async () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    await settle();
    fillNeed(view);
    await press(button(view, 'Guardar borrador'));
    const [body] = api().bodies['POST /hospitals/me/needs']!;
    expect(Object.keys(body as object).sort()).toEqual(['component', 'expiresInHours', 'radiusKm', 'requiredBloodType', 'siteId', 'targetConfirmations', 'urgency']);
    expect(api().needs[0]?.status).toBe('borrador');
  });

  it('«Activar necesidad» hace POST y luego PATCH, cada uno con su petición', async () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    await settle();
    fillNeed(view);
    await press(button(view, 'Activar necesidad'));
    const writes = api().calls.filter((call) => !call.startsWith('GET'));
    expect(writes.slice(0, 2)).toEqual(['POST /hospitals/me/needs', `PATCH /hospitals/me/needs/${api().needs[0]!.needId}`]);
    expect(api().needs[0]?.status).toBe('activa');
  });

  it('si la activación falla, el borrador queda creado, se abre su detalle y se explica qué pasó', async () => {
    api().transitionStatus = 409;
    const view = renderRoute('/hospital/necesidades/nueva');
    await settle();
    fillNeed(view);
    await press(button(view, 'Activar necesidad'));
    expect(api().needs[0]?.status).toBe('borrador');
    expect(view.querySelector('h1')?.textContent).toMatch(/^Necesidad NEC-/);
    expect(alerts(view)).toContain('se creó como borrador, pero no se pudo activar');
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Borrador guardado');
  });

  it('un error de una pantalla no reaparece en otra al navegar', async () => {
    const view = renderRoute(`/hospital/necesidades/${A104}`);
    await settle();
    api().needs.find((need) => need.needId === A104)!.status = 'cerrada';
    await press(button(view, 'Cancelar necesidad'));
    await press(button(view, 'Sí, cancelar necesidad'));
    expect(alerts(view)).toContain('El servidor no pudo aplicar el cambio');
    await press(view.querySelector('nav a[href="/hospital/altas"]'));
    expect(view.querySelector('h1')?.textContent).toBe('Altas asistidas');
    expect(alerts(view)).toBe('');
  });

  it('una sede rechazada por el servidor (422) se anuncia y no navega', async () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    await settle();
    fillNeed(view);
    api().sites = [];
    await press(button(view, 'Guardar borrador'));
    expect(alerts(view)).toContain('El servidor rechazó los datos');
    expect(view.querySelector('h1')?.textContent).toBe('Crear necesidad');
  });

  it('un conflicto al cancelar (409) lo dice, no anuncia éxito y refresca el estado', async () => {
    const view = renderRoute(`/hospital/necesidades/${A104}`);
    await settle();
    // Otro dispositivo la cerró antes: cancelar una cerrada es 409.
    api().needs.find((need) => need.needId === A104)!.status = 'cerrada';
    await press(button(view, 'Cancelar necesidad'));
    await press(button(view, 'Sí, cancelar necesidad'));
    expect(alerts(view)).toContain('El servidor no pudo aplicar el cambio');
    expect(view.querySelector('[aria-live="polite"]')?.textContent).not.toContain('Necesidad cancelada');
    expect(button(view, 'Cancelar necesidad')).toBeNull();
  });

  it('reenviar un enlace recarga la lista (el backend responde 202 neutro sin el alta)', async () => {
    const view = renderRoute('/hospital/altas');
    await settle();
    const before = api().calls.filter((call) => call === 'GET /hospitals/me/assisted-signups').length;
    await press([...view.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Reenviar enlace')) ?? null);
    expect(api().calls.some((call) => call.endsWith('/activation-links'))).toBe(true);
    expect(api().calls.filter((call) => call === 'GET /hospitals/me/assisted-signups').length).toBe(before + 1);
  });
});
