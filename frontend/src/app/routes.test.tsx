// @vitest-environment jsdom
import { Navigate, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { setupRender } from '../test/render.js';
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
        if (route.children) walk(route.children, path);
        else if (route.element && (route.element as { type?: unknown }).type !== Navigate && !(route.handle as RouteHandle)?.title)
          missing.push(path);
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

  it('el título no lleva el ID de la ruta', () => {
    renderRoute('/superadmin/solicitudes/7f21a8b3-4e5f-4a71-9c23-3d4e5f6a7b84');
    expect(document.title).toBe('Detalle de solicitud · Superadmin · Save a Life');
  });
});
