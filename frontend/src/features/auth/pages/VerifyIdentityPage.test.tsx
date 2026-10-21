// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

describe('AUTH-05 MFA y step-up', () => {
  it('pide un código numérico de un solo uso', () => {
    const view = renderRoute('/verificar-identidad');
    expect(view.querySelector('h1')?.textContent).toBe('Verifica tu identidad');
    const input = view.querySelector('input');
    expect(input?.getAttribute('inputmode')).toBe('numeric');
    expect(input?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(view.textContent).toContain('Acceso administrativo');
  });

  it.each(['12345', '12a456', '123456789'])('rechaza «%s» y enfoca el campo', (code) => {
    const view = renderRoute('/verificar-identidad');
    const input = view.querySelector('input');
    type(input, code);
    click(view.querySelector('button[type="submit"]'));
    expect(view.textContent).toContain('Ingresa el código de 6 dígitos de tu aplicación.');
    expect(document.activeElement).toBe(input);
  });

  it('con un código válido avisa que la verificación aún no existe y limpia el campo', () => {
    const view = renderRoute('/verificar-identidad');
    const input = view.querySelector('input');
    type(input, '123 456');
    click(view.querySelector('button[type="submit"]'));
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Por ahora no se envían datos.');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('«Cancelar» vuelve al ingreso', () => {
    const view = renderRoute('/verificar-identidad');
    expect(view.querySelector('a[href="/ingresar"]')?.textContent).toBe('Cancelar');
  });
});
