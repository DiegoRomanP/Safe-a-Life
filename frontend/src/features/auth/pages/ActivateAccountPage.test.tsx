// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

const TOKEN = 'tok_sintetico_0123456789abcdefghijklmnopqrstu';

describe('AUTH-03 Reclamar cuenta asistida', () => {
  it('sin token muestra «Enlace no disponible»', () => {
    const view = renderRoute('/activar-cuenta');
    expect(view.querySelector('h1')?.textContent).toBe('Enlace no disponible');
  });

  it('con token muestra la invitación válida y nunca pinta el token', () => {
    const view = renderRoute(`/activar-cuenta#${TOKEN}`);
    expect(view.querySelector('h1')?.textContent).toBe('Puedes reclamar la cuenta asistida');
    expect(view.innerHTML).not.toContain(TOKEN);
  });

  it('«Continuar y crear contraseña» lleva al formulario y enfoca su título', () => {
    const view = renderRoute(`/activar-cuenta#${TOKEN}`);
    const next = [...view.querySelectorAll('button')].find((b) => b.textContent === 'Continuar y crear contraseña');
    click(next ?? null);
    const heading = view.querySelector('h1');
    expect(heading?.textContent).toBe('Crea tu contraseña');
    expect(document.activeElement).toBe(heading);
    expect(view.querySelector('input[type="password"]')?.getAttribute('autocomplete')).toBe('new-password');
  });

  it('valida la contraseña y, si es válida, avisa que la activación aún no existe', () => {
    const view = renderRoute(`/activar-cuenta#${TOKEN}`);
    click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Continuar y crear contraseña') ?? null);
    const input = view.querySelector('input[type="password"]');
    type(input, 'corta');
    click(view.querySelector('button[type="submit"]'));
    expect(view.textContent).toContain('al menos 12 caracteres');
    type(input, 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Por ahora no se envían datos.');
  });

  it('en desarrollo, el selector permite ver los demás estados', () => {
    const view = renderRoute(`/activar-cuenta#${TOKEN}`);
    const expired = view.querySelector('input[value="expired"]');
    click(expired);
    expect(view.querySelector('h1')?.textContent).toBe('Enlace vencido');
  });
});
