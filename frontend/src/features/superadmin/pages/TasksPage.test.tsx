// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { press, settle, setupRender, type } from '../../../test/render.js';
import { registerSuperadminApi } from '../../../test/superadminApi.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();
const api = registerSuperadminApi();

describe('SA-01 Tareas administrativas', () => {
  it('cuenta las tareas por tipo y marca «Tareas» como página actual', async () => {
    const view = renderRoute('/superadmin');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Tareas administrativas');
    const stats = [...view.querySelectorAll('section[aria-label="Indicadores"] > div')].map((card) => card.textContent);
    expect(stats).toEqual(['2Solicitudes pendientes', '1Sedes por revisar', '0Fallos de entrega', '0Políticas por moderar']);
    expect(view.querySelector('nav [aria-current="page"]')?.textContent).toBe('Tareas');
  });

  it('ordena por fecha, muestra solo códigos opacos y enlaza cada tarea a su vista', async () => {
    const view = renderRoute('/superadmin');
    await settle();
    const items = [...view.querySelectorAll('main li')];
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain('SOL-91A2');
    expect(items[0]?.textContent).toContain('24 sep 2026, 11:06 · Lima, UTC−5');
    const review = items[0]?.querySelector('a');
    expect(review?.getAttribute('href')).toBe('/superadmin/solicitudes/91a2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c01');
    expect(review?.textContent).toBe('Revisar SOL-91A2');
  });

  it('reintenta una entrega fallida con step-up y la quita de la cola', async () => {
    api().tasks.push({ taskId: 'd3f4a5b6-0004-4c7d-8e9f-0a1b2c3d4e44', kind: 'delivery_failure', createdAt: '2026-09-25T10:00:00Z', resourceCode: 'INV-5C10' });
    const view = renderRoute('/superadmin');
    await settle();
    const retry = [...view.querySelectorAll('button')].find((item) => item.textContent?.startsWith('Reintentar entrega')) ?? null;
    await press(retry);
    type(view.querySelector('input[inputmode="numeric"], input[type="text"]'), '123456');
    await press([...view.querySelectorAll('button')].find((item) => item.textContent === 'Verificar y continuar') ?? null);
    expect(view.textContent).toContain('Reintento aceptado');
    expect(api().requests_).toContain('POST /superadmin/invitations/d3f4a5b6-0004-4c7d-8e9f-0a1b2c3d4e44/delivery-retries');
    expect(view.textContent).not.toContain('INV-5C10');
  });
});
