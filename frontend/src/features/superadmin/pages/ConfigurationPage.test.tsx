// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { press, settle, setupRender, type } from '../../../test/render.js';
import { registerSuperadminApi } from '../../../test/superadminApi.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();
registerSuperadminApi();

function control(view: HTMLElement, label: string) {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
}

const button = (view: HTMLElement, text: string) =>
  [...view.querySelectorAll('button')].find((item) => item.textContent === text) ?? null;

describe('SA-06 Configuración', () => {
  it('exige fecha y confirmación explícita antes de guardar', async () => {
    const view = renderRoute('/superadmin/configuracion');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Configuración versionada');
    await press(button(view, 'Guardar fecha final'));
    expect(view.textContent).toContain('Indica la fecha y la hora final de la demo.');
    type(control(view, 'Fecha y hora final'), '2026-12-15T18:00');
    await press(button(view, 'Guardar fecha final'));
    const checkbox = view.querySelector('input[type="checkbox"]');
    expect(checkbox?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(checkbox);
  });

  it('con step-up guarda la fecha en hora de Lima y la deja inmutable', async () => {
    const view = renderRoute('/superadmin/configuracion');
    await settle();
    type(control(view, 'Fecha y hora final'), '2026-12-15T18:00');
    await press(view.querySelector('input[type="checkbox"]'));
    await press(button(view, 'Guardar fecha final'));
    type(control(view, 'Código de 6 dígitos'), '123456');
    await press(button(view, 'Verificar y continuar'));
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('15 dic 2026, 18:00 · Lima, UTC−5');
    expect(view.textContent).toContain('Inmutable');
    expect(view.querySelector('input[type="datetime-local"]')).toBeNull();
  });
});
