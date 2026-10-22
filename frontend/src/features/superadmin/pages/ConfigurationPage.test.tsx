// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

function control(view: HTMLElement, label: string) {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
}

const button = (view: HTMLElement, text: string) =>
  [...view.querySelectorAll('button')].find((item) => item.textContent === text) ?? null;

describe('SA-06 Configuración', () => {
  it('exige fecha y confirmación explícita antes de guardar', () => {
    const view = renderRoute('/superadmin/configuracion');
    expect(view.querySelector('h1')?.textContent).toBe('Configuración versionada');
    click(button(view, 'Guardar fecha final'));
    expect(view.textContent).toContain('Indica la fecha y la hora final de la demo.');
    type(control(view, 'Fecha y hora final'), '2026-12-15T18:00');
    click(button(view, 'Guardar fecha final'));
    const checkbox = view.querySelector('input[type="checkbox"]');
    expect(checkbox?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(checkbox);
  });

  it('con step-up guarda la fecha en hora de Lima y la deja inmutable', () => {
    const view = renderRoute('/superadmin/configuracion');
    type(control(view, 'Fecha y hora final'), '2026-12-15T18:00');
    click(view.querySelector('input[type="checkbox"]'));
    click(button(view, 'Guardar fecha final'));
    type(control(view, 'Código de 6 dígitos'), '123456');
    click(button(view, 'Verificar y continuar'));
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('15 dic 2026, 18:00 · Lima, UTC−5');
    expect(view.textContent).toContain('Inmutable');
    expect(view.querySelector('input[type="datetime-local"]')).toBeNull();
  });
});
