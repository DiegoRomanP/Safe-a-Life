// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { click, settle, setupRender } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

// Token sintético armado en código: un literal largo junto a «token» lo marca
// gitleaks como secreto en el CI.
const TOKEN = 'tok_sintetico_'.padEnd(45, 'x');

function buttonByText(view: HTMLElement, text: string) {
  return [...view.querySelectorAll('button')].find((button) => button.textContent === text) ?? null;
}

function stubFetch(reply: () => Promise<unknown>) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return reply();
  });
  return requests;
}

const json = (body: unknown, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('AUTH-02 paso 2: verificar correo', () => {
  it('sin token muestra «Enlace no disponible»', () => {
    expect(renderRoute('/verificar-correo').querySelector('h1')?.textContent).toBe('Enlace no disponible');
  });

  it('abrir el enlace no verifica nada; el botón hace un solo POST y anuncia el segundo correo', async () => {
    let release!: () => void;
    const requests = stubFetch(() => new Promise((resolve) => {
      release = () => resolve({ ok: true, status: 200, json: async () => ({ data: { status: 'reclamada_incompleta', emailVerified: true } }) });
    }));
    const view = renderRoute(`/verificar-correo#${TOKEN}`);
    expect(view.querySelector('h1')?.textContent).toBe('Verifica tu correo');
    expect(view.querySelector('[aria-current="step"]')?.textContent).toContain('Verificar correo');
    expect(view.innerHTML).not.toContain(TOKEN);
    expect(requests).toEqual([]);

    click(buttonByText(view, 'Verificar correo'));
    click(view.querySelector('button[aria-busy="true"]'));
    expect(requests.map(({ url, init }) => `${init?.method} ${url}`)).toEqual([`POST /api/v1/donor-email-verification-actions/${TOKEN}`]);
    await act(async () => { release(); });
    await settle();

    const heading = view.querySelector('h1');
    expect(heading?.textContent).toBe('Correo verificado');
    expect(document.activeElement).toBe(heading);
    expect(view.textContent).toContain('segundo correo para crear tu contraseña');
    expect(view.textContent).not.toContain('no envía datos');
    expect(view.querySelector('a[href="/ingresar"]')?.textContent).toBe('Ingresar');
  });

  it('un 410 del backend muestra el enlace vencido, no un éxito', async () => {
    stubFetch(() => json({ error: { code: 'GONE' } }, 410));
    const view = renderRoute(`/verificar-correo#${TOKEN}`);
    click(buttonByText(view, 'Verificar correo'));
    await settle();

    expect(view.textContent).toContain('Vuelve a registrarte con tu correo para recibir un nuevo enlace.');
    expect(view.textContent).not.toContain('Correo verificado');
  });

  it('un fallo de red avisa y permite reintentar con el mismo enlace', async () => {
    stubFetch(() => Promise.reject(new TypeError('sin red')));
    const view = renderRoute(`/verificar-correo#${TOKEN}`);
    click(buttonByText(view, 'Verificar correo'));
    await settle();

    expect(view.textContent).toContain('No se pudo completar');
    expect(view.querySelector('h1')?.textContent).toBe('Verifica tu correo');
    expect(buttonByText(view, 'Verificar correo')?.disabled).toBe(false);
  });
});

describe('AUTH-02 paso 2: enlace vencido', () => {
  it('pide registrarse otra vez, sin mencionar al hospital', () => {
    const view = renderRoute(`/verificar-correo#${TOKEN}`);
    click(view.querySelector('input[value="expired"]'));
    expect(view.textContent).toContain('Vuelve a registrarte con tu correo para recibir un nuevo enlace.');
    expect(view.textContent).not.toContain('hospital');
  });
});

describe('Confirmar cambio de correo', () => {
  it('confirma con un botón explícito (POST al enlace) y enfoca el resultado', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return { ok: true, status: 200, json: async () => ({ data: { message: 'ok' } }) };
    });
    const view = renderRoute(`/cambiar-correo#${TOKEN}`);
    expect(view.querySelector('h1')?.textContent).toBe('Confirma tu nuevo correo');
    expect(requests).toEqual([]);
    click(buttonByText(view, 'Confirmar nuevo correo'));
    await settle();
    expect(requests.map(({ url, init }) => [url, init?.method])).toEqual([[`/api/v1/donor-email-change-actions/${TOKEN}`, 'POST']]);
    expect(document.activeElement?.textContent).toBe('Correo actualizado');
  });

  it('un enlace vencido (410) lo muestra y no confirma', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 410, json: async () => ({ error: { code: 'X' } }) }));
    const view = renderRoute(`/cambiar-correo#${TOKEN}`);
    click(buttonByText(view, 'Confirmar nuevo correo'));
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Enlace vencido');
  });

  it('el enlace vencido pide una nueva solicitud desde la cuenta', () => {
    const view = renderRoute(`/cambiar-correo#${TOKEN}`);
    click(view.querySelector('input[value="expired"]'));
    expect(view.textContent).toContain('Crea una nueva solicitud de cambio de correo desde tu cuenta.');
  });
});
