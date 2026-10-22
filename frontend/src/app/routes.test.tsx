// @vitest-environment jsdom
import { act } from 'react';
import { Navigate, RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { render, setupRender } from '../test/render.js';
import { renderRoute } from '../test/renderRoute.js';
import type { RouteHandle } from './DocumentTitle.js';
import { routes } from './routes.js';

setupRender();

describe('rutas', () => {
  it('una ruta desconocida muestra SYS-01 sin revelar la ruta pedida', () => {
    const view = renderRoute('/hospitales/secreto-123');
    expect(view.querySelector('h1')?.textContent).toBe('No pudimos abrir este recurso');
    expect(view.textContent).not.toContain('secreto-123');
    expect(view.querySelector('a[href="/"]')).not.toBeNull();
  });

  it('cada vista final tiene título de pestaña', () => {
    const missing: string[] = [];
    const walk = (list: RouteObject[], parent: string) => {
      for (const route of list) {
        const path = [parent, route.path ?? (route.index ? '(índice)' : '')].filter(Boolean).join('/');
        if (route.children) {
          walk(route.children, path);
          continue;
        }
        // Las redirecciones no son vistas; cualquier otra hoja (element,
        // Component o lazy) necesita título.
        const redirect = (route.element as { type?: unknown } | undefined)?.type === Navigate;
        if (!redirect && !(route.handle as RouteHandle)?.title) missing.push(path);
      }
    };
    walk(routes, '');
    expect(missing).toEqual([]);
  });

  it.each([
    ['/', 'Inicio · Save a Life'],
    ['/ingresar', 'Ingresar · Save a Life'],
    ['/donante/perfil', 'Mi perfil · Donante · Save a Life'],
    ['/hospital/necesidades', 'Necesidades · Hospital · Save a Life'],
    ['/superadmin/auditoria', 'Auditoría · Superadmin · Save a Life'],
    ['/no-existe', 'Recurso no disponible · Save a Life'],
  ])('%s se titula «%s»', (path, title) => {
    renderRoute(path);
    expect(document.title).toBe(title);
  });

  it('el título cambia al navegar dentro de la app', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/hospital'] });
    render(<RouterProvider router={router} />);
    expect(document.title).toBe('Resumen · Hospital · Save a Life');
    act(() => {
      void router.navigate('/hospital/altas');
    });
    expect(document.title).toBe('Altas asistidas · Hospital · Save a Life');
  });

  it('el título no lleva el ID de la ruta', () => {
    renderRoute('/superadmin/solicitudes/7f21a8b3-4e5f-4a71-9c23-3d4e5f6a7b84');
    expect(document.title).toBe('Detalle de solicitud · Superadmin · Save a Life');
  });
});
