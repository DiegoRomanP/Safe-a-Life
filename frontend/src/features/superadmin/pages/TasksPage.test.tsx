// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { setupRender } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

describe('SA-01 Tareas administrativas', () => {
  it('cuenta las tareas por tipo y marca «Tareas» como página actual', () => {
    const view = renderRoute('/superadmin');
    expect(view.querySelector('h1')?.textContent).toBe('Tareas administrativas');
    const stats = [...view.querySelectorAll('section[aria-label="Indicadores"] > div')].map((card) => card.textContent);
    expect(stats).toEqual(['2Solicitudes pendientes', '1Sedes por revisar', '0Fallos de entrega', '0Políticas por moderar']);
    expect(view.querySelector('nav [aria-current="page"]')?.textContent).toBe('Tareas');
  });

  it('ordena por fecha, muestra solo códigos opacos y enlaza cada tarea a su vista', () => {
    const view = renderRoute('/superadmin');
    const items = [...view.querySelectorAll('main li')];
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain('SOL-91A2');
    expect(items[0]?.textContent).toContain('24 sep 2026, 11:06 · Lima, UTC−5');
    const review = items[0]?.querySelector('a');
    expect(review?.getAttribute('href')).toBe('/superadmin/solicitudes/91a2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c01');
    expect(review?.textContent).toBe('Revisar SOL-91A2');
  });
});
