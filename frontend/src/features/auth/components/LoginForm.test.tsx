// @vitest-environment jsdom
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { click, render, setupRender, type } from '../../../test/render.js';
import { LoginForm } from './LoginForm.js';

setupRender();

function renderForm(onSubmit = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <LoginForm onSubmit={onSubmit} />
    </MemoryRouter>,
  );
  const [email, password] = [...view.querySelectorAll('input')];
  const submit = view.querySelector('button[type="submit"]');
  return { view, email, password, submit, onSubmit };
}

describe('LoginForm', () => {
  it('asocia labels y pide autocompletado de correo y contraseña actual', () => {
    const { view, email, password } = renderForm();
    const labels = [...view.querySelectorAll('label')].map((label) => label.textContent);
    expect(labels).toEqual(['Correo', 'Contraseña']);
    expect(email?.getAttribute('autocomplete')).toBe('email');
    expect(password?.getAttribute('type')).toBe('password');
    expect(password?.getAttribute('autocomplete')).toBe('current-password');
  });

  it('vacío: muestra ambos errores, no envía y lleva el foco al correo', () => {
    const { view, email, submit, onSubmit } = renderForm();
    click(submit);
    expect(view.textContent).toContain('Ingresa tu correo.');
    expect(view.textContent).toContain('Ingresa tu contraseña.');
    expect(email?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(email);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('correo con forma inválida: lo indica sin enviar', () => {
    const { view, email, password, submit, onSubmit } = renderForm();
    type(email, 'sin-arroba');
    type(password, 'clave-demo');
    click(submit);
    expect(view.textContent).toContain('Ingresa un correo válido.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('solo falta la contraseña: el foco va a ese campo', () => {
    const { email, password, submit } = renderForm();
    type(email, 'persona@ejemplo.test');
    click(submit);
    expect(document.activeElement).toBe(password);
  });

  it('válido: entrega el correo sin espacios y limpia la contraseña', () => {
    const { email, password, submit, onSubmit } = renderForm();
    type(email, '  persona@ejemplo.test ');
    type(password, 'clave-demo');
    click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ email: 'persona@ejemplo.test', password: 'clave-demo' });
    expect(password?.value).toBe('');
  });

  it('enlaza la recuperación de acceso', () => {
    const { view } = renderForm();
    expect(view.querySelector('a[href="/recuperar-acceso"]')?.textContent).toBe('¿Olvidaste tu contraseña?');
  });
});
