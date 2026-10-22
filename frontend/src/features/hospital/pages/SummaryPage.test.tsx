// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

describe('HOS-01 Resumen operativo', () => {
  it('muestra los cuatro indicadores que salen de la lista de necesidades', () => {
    const view = renderRoute('/hospital');
    expect(view.querySelector('h1')?.textContent).toBe('Resumen operativo');
    const stats = [...view.querySelectorAll('section[aria-label="Indicadores"] > div')].map((card) => card.textContent);
    expect(stats).toEqual(['2Necesidades activas', '1Metas alcanzadas', '8Intenciones confirmadas', '1Borradores']);
  });

  it('«Resumen» es la página actual solo en /hospital', () => {
    const nav = (path: string) =>
      renderRoute(path).querySelector('nav[aria-label="Cuenta del hospital"] [aria-current="page"]')?.textContent;
    expect(nav('/hospital')).toBe('Resumen');
  });

  it('la tabla de atención lista activas y borradores con meta en intenciones', () => {
    const view = renderRoute('/hospital');
    const rows = [...view.querySelectorAll('tbody tr')];
    expect(rows.map((row) => row.querySelector('th')?.textContent)).toEqual(['NEC-A104', 'NEC-B087', 'NEC-AB19']);
    expect(rows[0]?.textContent).toContain('A+');
    expect(rows[0]?.textContent).toContain('2 de 3');
    expect(rows[0]?.textContent).toContain('24 sep 2026, 18:00 · Lima, UTC−5');
  });

  it('Necesidades lista todas y marca su enlace como actual', () => {
    const view = renderRoute('/hospital');
    click(view.querySelector('nav a[href="/hospital/necesidades"]'));
    expect(view.querySelector('h1')?.textContent).toBe('Necesidades');
    expect(view.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(view.querySelector('nav [aria-current="page"]')?.textContent).toBe('Necesidades');
  });
});
