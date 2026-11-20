// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupRender } from '../../../test/render.js';
import { TEST_DONOR_SESSION, renderRoute } from '../../../test/renderRoute.js';
import { clearAuthSession, getAuthSession, logout, restoreSession } from './session.js';

setupRender();
afterEach(() => clearAuthSession());

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const csrf = { data: { token: 'token-csrf-restaurado-sintetico-000000' } };

function stubFetch(reply: (url: string) => unknown): string[] {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    return reply(url);
  });
  return urls;
}

async function settleRoute() {
  for (let turn = 0; turn < 4; turn += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('RequireRole (área del donante)', () => {
  it('tras recargar restaura la sesión de las cookies y muestra el área', async () => {
    const urls = stubFetch((url) => (url.endsWith('/auth/session')
      ? json({ data: { actor: { role: 'donante', displayName: 'Persona sintética' }, aal: 1, mfaRequired: false } })
      : json(csrf)));

    const view = renderRoute('/donante/perfil', null);
    expect(view.textContent).toContain('Comprobando tu sesión.');
    expect(view.querySelector('main h1')).toBeNull();
    await settleRoute();

    // Restaura primero; solo entonces el área pide el perfil.
    expect(urls).toEqual(['/api/v1/auth/session', '/api/v1/auth/csrf-token', '/api/v1/donors/me/profile']);
    expect(view.querySelector('main h1')?.textContent).toBe('Mi perfil');
    expect(getAuthSession()).toEqual({ role: 'donante', aal: 1, mfaRequired: false, csrfToken: csrf.data.token });
  });

  it('sin sesión (401) vuelve a /ingresar sin mostrar el área', async () => {
    stubFetch(() => json({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401));

    const view = renderRoute('/donante/perfil', null);
    await settleRoute();

    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(getAuthSession()).toBeNull();
  });

  it('un fallo de red al restaurar también vuelve a /ingresar', async () => {
    stubFetch(() => Promise.reject(new TypeError('sin red')));

    const view = renderRoute('/donante/perfil', null);
    await settleRoute();

    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
  });

  it('una sesión de otro rol no entra al área del donante ni consulta al backend', async () => {
    const urls = stubFetch(() => json({}));

    const view = renderRoute('/donante/perfil', { ...TEST_DONOR_SESSION, role: 'superadmin', aal: 2 });
    await settleRoute();

    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(urls).toEqual([]);
  });

  it('dos restauraciones simultáneas (p. ej. StrictMode) hacen un solo GET de sesión', async () => {
    const urls = stubFetch((url) => (url.endsWith('/auth/session')
      ? json({ data: { actor: { role: 'donante', displayName: 'Persona sintética' }, aal: 1, mfaRequired: false } })
      : json(csrf)));

    const [first, second] = await Promise.all([restoreSession(), restoreSession()]);

    expect(first).toBe(second);
    expect(urls.filter((url) => url.endsWith('/auth/session'))).toHaveLength(1);
  });

  it('un logout durante la restauración gana: la respuesta tardía no repuebla la sesión', async () => {
    let answer!: () => void;
    stubFetch((url) => {
      if (url.endsWith('/auth/session')) {
        return new Promise((resolve) => {
          answer = () => resolve(json({ data: { actor: { role: 'donante', displayName: 'Persona sintética' }, aal: 1, mfaRequired: false } }));
        });
      }
      return json(csrf);
    });

    const pending = restoreSession();
    await logout();
    answer();

    expect(await pending).toBeNull();
    expect(getAuthSession()).toBeNull();
  });
});

describe('RequireRole (áreas administrativas, aal 2)', () => {
  const admin = { ...TEST_DONOR_SESSION, role: 'admin_hospitalario', mfaRequired: true } as const;

  it('un administrador con aal 1 va a verificar su identidad, no al área', async () => {
    const urls = stubFetch(() => json({}));

    const view = renderRoute('/hospital', { ...admin, aal: 1 });
    await settleRoute();

    expect(view.querySelector('h1')?.textContent).toBe('Verifica tu identidad');
    expect(urls).toEqual([]);
  });

  it('un administrador con aal 2 entra a su área', async () => {
    stubFetch(() => json({}));
    const view = renderRoute('/hospital', { ...admin, aal: 2, mfaRequired: false });
    await settleRoute();
    // Llegó al área del hospital (su navegación está montada); sus datos los pide el backend, que estas pruebas no simulan.
    expect(view.querySelector('nav[aria-label="Cuenta del hospital"]')).not.toBeNull();
  });

  it('el superadmin con aal 1 va a verificar su identidad', async () => {
    const view = renderRoute('/superadmin', { ...admin, role: 'superadmin', aal: 1 });
    await settleRoute();
    expect(view.querySelector('h1')?.textContent).toBe('Verifica tu identidad');
  });

  it('un administrador no entra al área del superadmin ni sin sesión a ninguna', async () => {
    stubFetch(() => json({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401));
    const wrongRole = renderRoute('/superadmin', { ...admin, aal: 2 });
    await settleRoute();
    expect(wrongRole.querySelector('h1')?.textContent).toBe('Iniciar sesión');
  });

  it('sin sesión, /hospital vuelve a /ingresar', async () => {
    stubFetch(() => json({ error: { code: 'AUTHENTICATION_REQUIRED' } }, 401));
    const view = renderRoute('/hospital', null);
    await settleRoute();
    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
  });
});
