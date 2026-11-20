// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

function fill(view: HTMLElement, email: string, password: string) {
  const [emailInput, passwordInput] = [...view.querySelectorAll('input')];
  type(emailInput, email);
  type(passwordInput, password);
  click(view.querySelector('button[type="submit"]'));
  return { emailInput, passwordInput };
}

function stubReply(status: number) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return { ok: status < 300, status, json: async () => (status < 300 ? { data: { message: 'neutral' } } : { error: { code: 'X' } }) };
  });
  return requests;
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
    const { passwordInput } = fill(view, 'persona@example.test', 'corta');
    expect(passwordInput?.getAttribute('autocomplete')).toBe('new-password');
    expect(view.textContent).toContain('La contraseña debe tener al menos 12 caracteres.');
    expect(document.activeElement).toBe(passwordInput);
  });

  it('una contraseña corta no llega al backend', () => {
    const requests = stubReply(202);
    fill(renderRoute('/registro'), 'persona@example.test', 'corta');
    expect(requests).toEqual([]);
  });

  it('con datos válidos hace un POST y muestra el resultado neutral con el foco en el título', async () => {
    const requests = stubReply(202);
    const view = renderRoute('/registro');
    fill(view, ' persona@example.test ', 'clave-de-demo-larga');
    await settle();

    expect(requests.map(({ url, init }) => `${init?.method} ${url}`)).toEqual(['POST /api/v1/donor-registrations']);
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ email: 'persona@example.test', password: 'clave-de-demo-larga' });
    const heading = view.querySelector('h1');
    expect(heading?.textContent).toBe('Revisa tu correo');
    expect(document.activeElement).toBe(heading);
    expect(view.textContent).toContain('Si el correo puede registrarse');
    expect(view.textContent).not.toContain('persona@example.test');
    expect(view.querySelector('input')).toBeNull();
  });

  it.each([[429, 'demasiados intentos'], [503, 'Inténtalo de nuevo']] as const)('un %i avisa sin mostrar éxito y vacía la contraseña', async (status, text) => {
    stubReply(status);
    const view = renderRoute('/registro');
    const { passwordInput } = fill(view, 'persona@example.test', 'clave-de-demo-larga');
    await settle();

    expect(view.textContent?.toLowerCase()).toContain(text.toLowerCase());
    expect(view.querySelector('h1')?.textContent).toBe('Cuenta y correo');
    expect((passwordInput as HTMLInputElement).value).toBe('');
  });

  it('un segundo envío mientras el primero sigue en curso no hace otro POST', async () => {
    let release!: () => void;
    const requests: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Promise((resolve) => { release = () => resolve({ ok: true, status: 202, json: async () => ({ data: {} }) }); });
    });
    const view = renderRoute('/registro');
    fill(view, 'persona@example.test', 'clave-de-demo-larga');
    const [, passwordInput] = [...view.querySelectorAll('input')];
    type(passwordInput, 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    expect(requests).toHaveLength(1);
    release();
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Revisa tu correo');
  });

  it('un 422 marca la contraseña y le lleva el foco', async () => {
    stubReply(422);
    const view = renderRoute('/registro');
    const { passwordInput } = fill(view, 'persona@example.test', 'clave-de-demo-larga');
    await settle();
    expect(view.textContent).toContain('Revisa el correo y elige otra contraseña.');
    expect(document.activeElement).toBe(passwordInput);
  });
});
