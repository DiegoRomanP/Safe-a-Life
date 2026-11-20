// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

const TOKEN = 'tok_sintetico_'.padEnd(45, 'x');

describe('AUTH-04 Recuperar acceso', () => {
  it('valida el correo antes de enviar', () => {
    const view = renderRoute('/recuperar-acceso');
    click(view.querySelector('button[type="submit"]'));
    expect(view.textContent).toContain('Ingresa tu correo.');
    expect(document.activeElement).toBe(view.querySelector('input'));
  });

  function stubRecovery(status: number, requests: Array<{ url: string; init?: RequestInit }> = []) {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return { ok: status < 300, status, json: async () => (status < 300 ? null : { error: { code: 'X' } }) };
    });
    return requests;
  }

  it('envía el correo al backend y el resultado es neutral, sin repetirlo y con el título enfocado', async () => {
    const requests = stubRecovery(202);
    const view = renderRoute('/recuperar-acceso');
    type(view.querySelector('input'), 'persona@ejemplo.test');
    click(view.querySelector('button[type="submit"]'));
    await settle();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('/api/v1/auth/password-recovery-requests');
    expect(requests[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ email: 'persona@ejemplo.test' });
    const heading = view.querySelector('h1');
    expect(heading?.textContent).toBe('Si corresponde, enviaremos instrucciones');
    expect(document.activeElement).toBe(heading);
    expect(view.textContent).toContain('No confirmamos si una cuenta existe.');
    expect(view.textContent).not.toContain('persona@ejemplo.test');
  });

  it.each([429, 503])('si el backend falla (%i) no afirma que se envió y conserva el formulario', async (status) => {
    stubRecovery(status);
    const view = renderRoute('/recuperar-acceso');
    type(view.querySelector('input'), 'persona@ejemplo.test');
    click(view.querySelector('button[type="submit"]'));
    await settle();

    expect(view.querySelector('h1')?.textContent).toBe('Solicitar enlace de recuperación');
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('No pudimos enviar la solicitud');
    expect((view.querySelector('input') as HTMLInputElement).value).toBe('persona@ejemplo.test');
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
    expect(view.textContent).toContain('Vencido');
  });

  function stubReply(status: number, requests: Array<{ url: string; init?: RequestInit }> = []) {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return { ok: status < 300, status, json: async () => (status < 300 ? { data: {} } : { error: { code: 'X' } }) };
    });
    return requests;
  }

  it('guarda la contraseña con un POST al enlace y lleva a ingresar', async () => {
    const requests = stubReply(200);
    const view = renderRoute(`/restablecer-contrasena#${TOKEN}`);
    type(view.querySelector('input[type="password"]'), 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    await settle();

    expect(requests.map(({ url, init }) => `${init?.method} ${url}`)).toEqual([`POST /api/v1/auth/password-reset-actions/${TOKEN}`]);
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ newPassword: 'clave-de-demo-larga' });
    const heading = view.querySelector('h1');
    expect(heading?.textContent).toBe('Contraseña guardada');
    expect(document.activeElement).toBe(heading);
    expect(view.querySelector('a[href="/ingresar"]')).not.toBeNull();
  });

  it('una contraseña corta no se envía', () => {
    const requests = stubReply(200);
    const view = renderRoute(`/restablecer-contrasena#${TOKEN}`);
    type(view.querySelector('input[type="password"]'), 'corta');
    click(view.querySelector('button[type="submit"]'));
    expect(requests).toEqual([]);
  });

  it('un 410 muestra el enlace vencido', async () => {
    stubReply(410);
    const view = renderRoute(`/restablecer-contrasena#${TOKEN}`);
    type(view.querySelector('input[type="password"]'), 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(view.textContent).toContain('Solicita un nuevo enlace de recuperación para continuar.');
  });

  it.each([[422, 'no cumple los requisitos'], [503, 'Inténtalo de nuevo'], [429, 'demasiados intentos']] as const)(
    'un %i no se presenta como éxito', async (status, text) => {
      stubReply(status);
      const view = renderRoute(`/restablecer-contrasena#${TOKEN}`);
      type(view.querySelector('input[type="password"]'), 'clave-de-demo-larga');
      click(view.querySelector('button[type="submit"]'));
      await settle();
      expect(view.textContent?.toLowerCase()).toContain(text.toLowerCase());
      expect(view.textContent).not.toContain('Contraseña guardada');
      expect((view.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('');
    },
  );
});
