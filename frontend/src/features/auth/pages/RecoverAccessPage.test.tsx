// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

const TOKEN = 'tok_sintetico_0123456789abcdefghijklmnop';

describe('AUTH-04 Recuperar acceso', () => {
  it('valida el correo antes de enviar', () => {
    const view = renderRoute('/recuperar-acceso');
    click(view.querySelector('button[type="submit"]'));
    expect(view.textContent).toContain('Ingresa tu correo.');
    expect(document.activeElement).toBe(view.querySelector('input'));
  });

  it('el resultado es neutral, no repite el correo y enfoca el título', () => {
    const view = renderRoute('/recuperar-acceso');
    type(view.querySelector('input'), 'persona@ejemplo.test');
    click(view.querySelector('button[type="submit"]'));
    const heading = view.querySelector('h1');
    expect(heading?.textContent).toBe('Si corresponde, enviaremos instrucciones');
    expect(document.activeElement).toBe(heading);
    expect(view.textContent).toContain('No confirmamos si una cuenta existe.');
    expect(view.textContent).not.toContain('persona@ejemplo.test');
  });
});

describe('AUTH-04 Completar recuperación', () => {
  it('sin token muestra «Enlace no disponible»', () => {
    expect(renderRoute('/restablecer-contrasena').querySelector('h1')?.textContent).toBe('Enlace no disponible');
  });

  it('con token pide la nueva contraseña con autocompletado new-password', () => {
    const view = renderRoute(`/restablecer-contrasena#${TOKEN}`);
    expect(view.querySelector('h1')?.textContent).toBe('Completar recuperación');
    expect(view.querySelector('input[type="password"]')?.getAttribute('autocomplete')).toBe('new-password');
    expect(view.innerHTML).not.toContain(TOKEN);
  });

  it('el enlace vencido pide uno nuevo de recuperación, no al hospital', () => {
    const view = renderRoute(`/restablecer-contrasena#${TOKEN}`);
    click(view.querySelector('input[value="expired"]'));
    expect(view.textContent).toContain('Solicita un nuevo enlace de recuperación para continuar.');
    expect(view.textContent).not.toContain('hospital');
  });

  it('con contraseña válida avisa que el cambio aún no existe', () => {
    const view = renderRoute(`/restablecer-contrasena#${TOKEN}`);
    type(view.querySelector('input[type="password"]'), 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Por ahora no se envían datos.');
  });
});
