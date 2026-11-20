// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

const TOKEN = 'tok_sintetico_'.padEnd(45, 'x');

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

  function stubClaim(status: number, requests: Array<{ url: string; init?: RequestInit }> = []) {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return { ok: status < 300, status, json: async () => (status < 300 ? { data: { status: 'reclamada_incompleta', emailVerified: true } } : { error: { code: 'X' } }) };
    });
    return requests;
  }

  function openPasswordStep(view: Element) {
    click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Continuar y crear contraseña') ?? null);
    return view.querySelector('input[type="password"]');
  }

  it('valida la contraseña antes de enviar', () => {
    const requests = stubClaim(201);
    const view = renderRoute(`/activar-cuenta#${TOKEN}`);
    type(openPasswordStep(view), 'corta');
    click(view.querySelector('button[type="submit"]'));
    expect(view.textContent).toContain('al menos 12 caracteres');
    expect(requests).toEqual([]);
  });

  it('reclama la cuenta con un POST al enlace (sin pintar el token) y lleva a ingresar', async () => {
    const requests = stubClaim(201);
    const view = renderRoute(`/activar-cuenta#${TOKEN}`);
    type(openPasswordStep(view), 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    await settle();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`/api/v1/assisted-activation-actions/${TOKEN}/claim`);
    expect(requests[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ password: 'clave-de-demo-larga' });
    expect(view.querySelector('h1')?.textContent).toBe('Cuenta activada');
    expect(view.querySelector('a[href="/ingresar"]')).not.toBeNull();
    expect(view.innerHTML).not.toContain(TOKEN);
  });

  it.each([[410, 'Enlace vencido'], [404, 'Enlace no disponible']])('un %i muestra «%s»', async (status, title) => {
    stubClaim(status);
    const view = renderRoute(`/activar-cuenta#${TOKEN}`);
    type(openPasswordStep(view), 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe(title);
  });

  it('una contraseña rechazada (422) pide otra y conserva el formulario', async () => {
    stubClaim(422);
    const view = renderRoute(`/activar-cuenta#${TOKEN}`);
    type(openPasswordStep(view), 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(view.textContent).toContain('Elige otra contraseña');
    expect(view.querySelector('h1')?.textContent).toBe('Crea tu contraseña');
  });

  it('en desarrollo, el selector permite ver los demás estados', () => {
    const view = renderRoute(`/activar-cuenta#${TOKEN}`);
    const expired = view.querySelector('input[value="expired"]');
    click(expired);
    expect(view.querySelector('h1')?.textContent).toBe('Enlace vencido');
  });
});
