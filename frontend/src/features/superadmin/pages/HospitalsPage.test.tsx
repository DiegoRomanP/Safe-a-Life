// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { press, settle, setupRender, type } from '../../../test/render.js';
import { registerSuperadminApi } from '../../../test/superadminApi.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();
registerSuperadminApi();

const button = (view: HTMLElement, text: string) =>
  [...view.querySelectorAll('button')].find((item) => item.textContent?.startsWith(text)) ?? null;

function control(view: HTMLElement, label: string) {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
}

describe('SA-02 Hospitales autorizados', () => {
  it('lista hospitales con autorización y conteos derivados de sedes y membresías', async () => {
    const view = renderRoute('/superadmin/hospitales');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Hospitales autorizados');
    const first = view.querySelector('tbody tr');
    expect(first?.querySelector('th')?.textContent).toBe('Hospital Nacional Central');
    expect(first?.textContent).toContain('Autorizado');
    expect(first?.textContent).toContain('1 sep 2026, 08:30 · Lima, UTC−5');
    const stats = [...view.querySelectorAll('section[aria-labelledby="resumen-institucional"] .grid > div')].map((card) => card.textContent);
    expect(stats).toEqual(['3Hospitales autorizados', '4Sedes activas', '2Administradores activos']);
  });

  it('autorizar pide step-up, enfoca el código y, al verificar, aplica el cambio y lo anuncia', async () => {
    const view = renderRoute('/superadmin/hospitales');
    await settle();
    const authorize = button(view, 'Autorizar');
    authorize?.focus();
    await press(authorize);
    const code = control(view, 'Código de 6 dígitos');
    expect(view.querySelector('#step-up-titulo')?.textContent).toBe('Verificación requerida');
    expect(document.activeElement).toBe(code);
    type(code, '123456');
    await press(button(view, 'Verificar y continuar'));
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Clínica Norte Demo autorizado');
    expect(live?.contains(document.activeElement)).toBe(true);
    expect(view.querySelector('#step-up-titulo')).toBeNull();
  });

  it('con el step-up vigente, la siguiente acción no vuelve a pedirlo', async () => {
    const view = renderRoute('/superadmin/hospitales');
    await settle();
    await press(button(view, 'Autorizar'));
    type(control(view, 'Código de 6 dígitos'), '123456');
    await press(button(view, 'Verificar y continuar'));
    await press(button(view, 'Desautorizar'));
    expect(view.querySelector('#step-up-titulo')).toBeNull();
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('desautorizado');
  });

  it('cancelar el step-up no cambia nada y devuelve el foco al botón', async () => {
    const view = renderRoute('/superadmin/hospitales');
    await settle();
    const authorize = button(view, 'Autorizar');
    authorize?.focus();
    await press(authorize);
    await press(button(view, 'Cancelar'));
    expect(document.activeElement).toBe(authorize);
    expect(view.textContent).toContain('No autorizado');
  });

  it('crear hospital valida los campos y lo agrega sin autorizar', async () => {
    const view = renderRoute('/superadmin/hospitales');
    await settle();
    await press(button(view, 'Crear hospital'));
    expect(view.textContent).toContain('Ingresa el nombre público.');
    expect(document.activeElement).toBe(control(view, 'Nombre público'));
    type(control(view, 'Nombre público'), 'Hospital Demo Este');
    type(control(view, 'Razón social'), 'Hospital Demo Este S.A.');
    await press(button(view, 'Crear hospital'));
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Hospital Demo Este creado');
    const rows = [...view.querySelectorAll('tbody tr')];
    expect(rows.at(-1)?.textContent).toContain('No autorizado');
  });
});
