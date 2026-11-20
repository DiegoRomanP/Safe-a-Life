// @vitest-environment jsdom
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../../app/routes.js';
import { clearAuthSession, getAuthSession } from '../session/session.js';
import { click, render, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

// Token sintético armado en código para que gitleaks no lo marque.
const TOKEN = 'tok_sintetico_'.padEnd(45, 'x');

// Rutas de los enlaces de los correos (backend/src/modules/email-delivery/templates/common.ts).
const EMAIL_ROUTES = [
  '/invitaciones',
  '/verificar-correo',
  '/activar-cuenta',
  '/cambiar-correo',
  '/restablecer-contrasena',
  '/invitacion-administrador',
];

function mount(url: string) {
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  const view = render(<RouterProvider router={router} />);
  return { view, router };
}

const PREVIEW = { data: { hospitalName: 'Hospital Sintético Norte', role: 'admin_hospitalario', expiresAt: '2026-10-02T18:00:00Z' } };
const SESSION = { data: { actor: { role: 'admin_hospitalario', displayName: 'Persona sintética', hospitalName: 'Hospital Sintético Norte' }, aal: 1, mfaRequired: true } };
const CSRF = { data: { token: 'token-csrf-invitacion-sintetico-00000' } };

type Call = { url: string; init?: RequestInit };
function stubInvitation(claimStatus = 201, previewStatus = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const reply = (body: unknown, status: number) => ({ ok: status < 300, status, json: async () => body });
    if (url.endsWith('/claim')) return reply(claimStatus < 300 ? SESSION : { error: { code: 'X' } }, claimStatus);
    if (url.endsWith('/csrf-token')) return reply(CSRF, 200);
    return reply(previewStatus < 300 ? PREVIEW : { error: { code: 'X' } }, previewStatus);
  });
  return calls;
}

describe('Invitación de administrador de hospital', () => {
  afterEach(() => clearAuthSession());

  it('abrir el enlace muestra la vista previa real con un GET, sin crear nada y sin pintar el token', async () => {
    const calls = stubInvitation();
    const view = renderRoute(`/invitacion-administrador#${TOKEN}`);
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`/api/v1/hospital-admin-invitation-actions/${TOKEN}`);
    expect(calls[0]?.init?.method ?? 'GET').toBe('GET');
    expect(view.querySelector('h1')?.textContent).toBe('Activa tu acceso de administrador');
    expect(view.textContent).toContain('Hospital Sintético Norte');
    expect(view.textContent).toContain('Administrador de hospital');
    expect(view.innerHTML).not.toContain(TOKEN);
  });

  it.each([[410, 'Enlace vencido'], [404, 'Enlace no disponible']])('un %i en la vista previa muestra «%s»', async (status, title) => {
    stubInvitation(201, status);
    const view = renderRoute(`/invitacion-administrador#${TOKEN}`);
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe(title);
  });

  it('crear la contraseña valida, reclama con POST, guarda la sesión aal 1 y lleva a MFA', async () => {
    const calls = stubInvitation();
    const view = renderRoute(`/invitacion-administrador#${TOKEN}`);
    await settle();
    const password = view.querySelector('input[type="password"]');
    expect(password?.getAttribute('autocomplete')).toBe('new-password');
    type(password, 'corta');
    click(view.querySelector('button[type="submit"]'));
    expect(view.textContent).toContain('al menos 12 caracteres');
    expect(calls).toHaveLength(1);

    type(password, 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(calls[1]?.url).toBe(`/api/v1/hospital-admin-invitation-actions/${TOKEN}/claim`);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ password: 'clave-de-demo-larga' });
    expect(getAuthSession()).toMatchObject({ role: 'admin_hospitalario', aal: 1, mfaRequired: true, csrfToken: CSRF.data.token });
    expect(document.activeElement?.textContent).toBe('Configura tu verificación en dos pasos');
    expect(view.querySelector('a[href="/verificar-identidad"]')).not.toBeNull();
  });

  it('si el CSRF falla tras un reclamo exitoso la cuenta se da por creada y no se abre sesión', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      const reply = (body: unknown, status: number) => ({ ok: status < 300, status, json: async () => body });
      if (url.endsWith('/claim')) return reply(SESSION, 201);
      if (url.endsWith('/csrf-token')) return reply({ error: { code: 'X' } }, 503);
      return reply(PREVIEW, 200);
    });
    const view = renderRoute(`/invitacion-administrador#${TOKEN}`);
    await settle();
    type(view.querySelector('input[type="password"]'), 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(document.activeElement?.textContent).toBe('Configura tu verificación en dos pasos');
    expect(getAuthSession()).toBeNull();
  });

  it('si el reclamo falla no abre sesión', async () => {
    stubInvitation(429);
    const view = renderRoute(`/invitacion-administrador#${TOKEN}`);
    await settle();
    type(view.querySelector('input[type="password"]'), 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(getAuthSession()).toBeNull();
    expect(view.textContent).toContain('demasiados intentos');
  });
});

describe('Rutas de los correos y limpieza del token', () => {
  it.each(EMAIL_ROUTES)('%s existe y borra el token de la dirección', (path) => {
    const { view, router } = mount(`${path}#${TOKEN}`);
    expect(view.querySelector('h1')?.textContent).not.toBe('No pudimos abrir este recurso');
    expect(router.state.location.hash).toBe('');
  });

  it('una ruta inexistente con token también lo borra', () => {
    const { view, router } = mount(`/ruta-mal-escrita#${TOKEN}`);
    expect(view.querySelector('h1')?.textContent).toBe('No pudimos abrir este recurso');
    expect(router.state.location.hash).toBe('');
  });
});
