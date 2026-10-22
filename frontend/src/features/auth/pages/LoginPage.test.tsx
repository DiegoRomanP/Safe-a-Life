// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

describe('AUTH-01 Inicio de sesión', () => {
  it('tiene un solo h1 y el aviso de uso académico', () => {
    const view = renderRoute('/ingresar');
    expect([...view.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Iniciar sesión']);
    expect(view.textContent).toContain('No ingreses datos reales en este prototipo.');
  });

  it('al enviar datos válidos avisa que el acceso real aún no existe, en una región aria-live', () => {
    const view = renderRoute('/ingresar');
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('');
    const [email, password] = [...view.querySelectorAll('input')];
    type(email, 'persona@ejemplo.test');
    type(password, 'clave-demo');
    click(view.querySelector('button[type="submit"]'));
    expect(live?.textContent).toContain('Por ahora no se envían datos.');
  });

  it('en desarrollo ofrece entrar al recorrido del donante de prueba', () => {
    const view = renderRoute('/ingresar');
    expect(view.querySelector('a[href="/donante"]')?.textContent).toBe('Entrar como donante de prueba');
  });

  it('ofrece crear cuenta de donante', () => {
    const view = renderRoute('/ingresar');
    expect(view.querySelector('a[href="/registro"]')?.textContent).toBe('Crear cuenta');
  });
});
