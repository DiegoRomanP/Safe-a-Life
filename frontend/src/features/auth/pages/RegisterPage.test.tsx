// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

function fill(view: HTMLElement, email: string, password: string) {
  const [emailInput, passwordInput] = [...view.querySelectorAll('input')];
  type(emailInput, email);
  type(passwordInput, password);
  click(view.querySelector('button[type="submit"]'));
  return { emailInput, passwordInput };
}

describe('AUTH-02 Registro', () => {
  it('muestra el paso 1 de 4 y marca el paso actual', () => {
    const view = renderRoute('/registro');
    expect(view.querySelector('h1')?.textContent).toBe('Cuenta y correo');
    expect(view.textContent).toContain('Paso 1 de 4');
    expect(view.querySelector('[aria-current="step"]')?.textContent).toContain('Cuenta y correo');
    expect(view.querySelectorAll('ol[aria-label="Pasos del registro"] > li')).toHaveLength(4);
  });

  it('pide contraseña nueva de al menos 12 caracteres', () => {
    const view = renderRoute('/registro');
    const { passwordInput } = fill(view, 'persona@ejemplo.test', 'corta');
    expect(passwordInput?.getAttribute('autocomplete')).toBe('new-password');
    expect(view.textContent).toContain('La contraseña debe tener al menos 12 caracteres.');
    expect(document.activeElement).toBe(passwordInput);
  });

  it('con datos válidos muestra el resultado neutral y lleva el foco al título', () => {
    const view = renderRoute('/registro');
    fill(view, 'persona@ejemplo.test', 'clave-de-demo-larga');
    const heading = view.querySelector('h1');
    expect(heading?.textContent).toBe('Revisa tu correo');
    expect(document.activeElement).toBe(heading);
    expect(view.textContent).toContain('Si el correo puede registrarse');
    expect(view.textContent).toContain('no envía mensajes ni crea cuentas reales');
    expect(view.querySelector('input')).toBeNull();
  });
});
