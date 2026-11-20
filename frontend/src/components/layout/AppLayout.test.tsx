// @vitest-environment jsdom
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getAuthSession, restoreSession, setAuthSession } from '../../features/auth/session/session.js';
import { TEST_DONOR_SESSION } from '../../test/renderRoute.js';
import { click, render, setupRender } from '../../test/render.js';
import { AppLayout } from './AppLayout.js';

setupRender();

function mount(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>inicio público</p> },
      { path: '/ingresar', element: <p>ingresar</p> },
      {
        path: '/area',
        element: (
          <AppLayout
            navLabel="Cuenta"
            navItems={[
              { to: '/area/uno', label: 'Uno' },
              { to: '/area/dos', label: 'Dos' },
            ]}
            accountTitle="Cuenta personal"
            accountRole="Donante"
            initials="DP"
          />
        ),
        children: [
          { path: 'uno', element: <h1>Vista uno</h1> },
          { path: 'dos', element: <h1>Vista dos</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return { view: render(<RouterProvider router={router} />), router };
}

describe('AppLayout', () => {
  it('el primer enlace salta al contenido principal', () => {
    const { view } = mount('/area/uno');
    const skip = view.querySelector('a');
    expect(skip?.textContent).toBe('Saltar al contenido');
    expect(skip?.getAttribute('href')).toBe('#contenido');
    expect(view.querySelector('main#contenido h1')?.textContent).toBe('Vista uno');
  });

  it('marca la ruta activa con aria-current dentro de un nav con nombre', () => {
    const { view } = mount('/area/dos');
    const links = [...view.querySelectorAll('nav[aria-label="Cuenta"] a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('aria-current')])).toEqual([
      ['Uno', null],
      ['Dos', 'page'],
    ]);
  });

  it('muestra la cuenta y la etiqueta académica', () => {
    const { view } = mount('/area/uno');
    expect(view.querySelector('header')?.textContent).toContain('Prototipo académico');
    expect(view.querySelector('header')?.textContent).toContain('Cuenta personal');
  });

  it('«Cerrar sesión» borra la sesión en el servidor (DELETE con CSRF) y en memoria, y vuelve a /ingresar', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return { ok: true, status: 204, json: async () => { throw new SyntaxError(); } };
    });
    setAuthSession(TEST_DONOR_SESSION);
    const { view, router } = mount('/area/uno');

    await act(async () => { click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Cerrar sesión') ?? null); });

    expect(requests.map(({ url, init }) => `${init?.method} ${url}`)).toEqual(['DELETE /api/v1/auth/sessions/current']);
    expect(new Headers(requests[0]?.init?.headers).get('x-csrf-token')).toBe(TEST_DONOR_SESSION.csrfToken);
    expect(getAuthSession()).toBeNull();
    expect(router.state.location.pathname).toBe('/ingresar');
  });

  it.each([
    ['sin red', () => Promise.reject(new TypeError('sin red'))],
    ['403 de origen', async () => ({ ok: false, status: 403, json: async () => ({ error: { code: 'FORBIDDEN' } }) })],
  ] as const)('si el servidor no confirma el cierre (%s) avisa y la pestaña no restaura las cookies', async (_caso, reply) => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => { requests.push(String(input)); return reply(); });
    setAuthSession(TEST_DONOR_SESSION);
    const { view, router } = mount('/area/uno');

    await act(async () => { click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Cerrar sesión') ?? null); });

    expect(getAuthSession()).toBeNull();
    expect(router.state.location.pathname).toBe('/ingresar');
    expect(router.state.location.state).toEqual({ logoutFailed: true });
    expect(await restoreSession()).toBeNull();
    expect(requests).toEqual(['/api/v1/auth/sessions/current']);
  });

  it('un 401 al cerrar sesión cuenta como cerrada (el backend ya expiró las cookies)', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'AUTHENTICATION_REQUIRED' } }) }));
    setAuthSession(TEST_DONOR_SESSION);
    const { view, router } = mount('/area/uno');

    await act(async () => { click([...view.querySelectorAll('button')].find((b) => b.textContent === 'Cerrar sesión') ?? null); });

    expect(router.state.location.pathname).toBe('/ingresar');
    expect(router.state.location.state).toBeNull();
  });
});
