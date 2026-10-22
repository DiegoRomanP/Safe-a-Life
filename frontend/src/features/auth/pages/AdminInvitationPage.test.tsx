// @vitest-environment jsdom
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../app/routes.js';
import { click, render, setupRender, type } from '../../../test/render.js';
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

describe('Invitación de administrador de hospital', () => {
  it('abrir el enlace muestra la vista previa sin crear nada y sin pintar el token', () => {
    const view = renderRoute(`/invitacion-administrador#${TOKEN}`);
    expect(view.querySelector('h1')?.textContent).toBe('Activa tu acceso de administrador');
    expect(view.textContent).toContain('Hospital Nacional Central');
    expect(view.textContent).toContain('Administrador de hospital');
    expect(view.innerHTML).not.toContain(TOKEN);
  });

  it('crear la contraseña valida, enfoca el resultado y lleva a MFA', () => {
    const view = renderRoute(`/invitacion-administrador#${TOKEN}`);
    const password = view.querySelector('input[type="password"]');
    expect(password?.getAttribute('autocomplete')).toBe('new-password');
    type(password, 'corta');
    click(view.querySelector('button[type="submit"]'));
    expect(view.textContent).toContain('al menos 12 caracteres');
    type(password, 'clave-de-demo-larga');
    click(view.querySelector('button[type="submit"]'));
    expect(document.activeElement?.textContent).toBe('Configura tu verificación en dos pasos');
    expect(view.querySelector('a[href="/verificar-identidad"]')).not.toBeNull();
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
