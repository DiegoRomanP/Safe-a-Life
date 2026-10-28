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

  it('al recibir el foco, el campo ya tiene el error enlazado', () => {
    const { view, email, submit } = renderForm();
    let atFocus: { describedby: string | null; message: string | null | undefined } | undefined;
    email?.addEventListener('focus', () => {
      const describedby = email.getAttribute('aria-describedby');
      atFocus = { describedby, message: describedby ? view.querySelector(`#${CSS.escape(describedby)}`)?.textContent : null };
    });
    click(submit);
    expect(atFocus).toEqual({ describedby: expect.any(String), message: 'Ingresa tu correo.' });
  });

  it('correo con forma inválida: lo indica sin enviar', () => {
    const { view, email, password, submit, onSubmit } = renderForm();
    type(email, 'sin-arroba');
    type(password, 'clave-sintetica');
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
    type(password, 'clave-sintetica');
    click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ email: 'persona@ejemplo.test', password: 'clave-sintetica' });
    expect(password?.value).toBe('');
  });

  it.each([
    ['menos de 12', '12345678901', 'La contraseña debe tener al menos 12 caracteres.'],
    ['más de 128', 'x'.repeat(129), 'La contraseña no puede superar 128 caracteres.'],
  ] as const)('rechaza contraseñas con %s caracteres y enlaza el error al campo enfocado', (_label, value, error) => {
    const { view, email, password, submit, onSubmit } = renderForm();
    type(email, 'persona@ejemplo.test');
    type(password, value);
    click(submit);
    const messageId = password?.getAttribute('aria-describedby');
    expect.soft(onSubmit).not.toHaveBeenCalled();
    expect(password?.getAttribute('aria-invalid')).toBe('true');
    expect(view.textContent).toContain(error);
    expect(messageId).toBeTruthy();
    expect(messageId && view.querySelector(`#${CSS.escape(messageId)}`)?.textContent).toBe(error);
    expect(document.activeElement).toBe(password);
  });

  it.each([['mínimo', '123456789012'], ['máximo', 'x'.repeat(128)]] as const)(
    'acepta el límite %s del contrato de contraseña', (_label, value) => {
      const { email, password, submit, onSubmit } = renderForm();
      type(email, 'persona@ejemplo.test');
      type(password, value);
      click(submit);
      expect(onSubmit).toHaveBeenCalledWith({ email: 'persona@ejemplo.test', password: value });
    },
  );

  it.each([
    ['6', '😀'.repeat(6), 'La contraseña debe tener al menos 12 caracteres.'],
    ['129', '😀'.repeat(129), 'La contraseña no puede superar 128 caracteres.'],
  ] as const)('rechaza %s puntos de código suplementarios con error accesible', (_count, value, error) => {
    const { view, email, password, submit, onSubmit } = renderForm();
    type(email, 'persona@ejemplo.test');
    type(password, value);
    click(submit);
    const messageId = password?.getAttribute('aria-describedby');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(password?.getAttribute('aria-invalid')).toBe('true');
    expect(view.textContent).toContain(error);
    expect(messageId).toBeTruthy();
    expect(messageId && view.querySelector(`#${CSS.escape(messageId)}`)?.textContent).toBe(error);
    expect(document.activeElement).toBe(password);
  });

  it.each([
    ['65', '😀'.repeat(65)],
    ['12', '😀'.repeat(12)],
    ['128', '😀'.repeat(128)],
  ] as const)('acepta %s puntos de código suplementarios sin cambios y limpia la contraseña', (_count, value) => {
    const { email, password, submit, onSubmit } = renderForm();
    type(email, 'persona@ejemplo.test');
    type(password, value);
    click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ email: 'persona@ejemplo.test', password: value });
    expect(password?.value).toBe('');
  });

  it('enlaza la recuperación de acceso', () => {
    const { view } = renderForm();
    expect(view.querySelector('a[href="/recuperar-acceso"]')?.textContent).toBe('¿Olvidaste tu contraseña?');
  });
});
