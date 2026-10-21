// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { setupRender } from '../test/render.js';
import { renderRoute } from '../test/renderRoute.js';

setupRender();

describe('rutas', () => {
  it('una ruta desconocida muestra SYS-01 sin revelar la ruta pedida', () => {
    const view = renderRoute('/hospitales/secreto-123');
    expect(view.querySelector('h1')?.textContent).toBe('No pudimos abrir este recurso');
    expect(view.textContent).not.toContain('secreto-123');
    expect(view.querySelector('a[href="/"]')).not.toBeNull();
  });
});
