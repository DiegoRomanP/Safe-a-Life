// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, setupRender } from '../../../test/render.js';
import type { NeedCoverage } from '../types.js';
import { CoverageMap } from './CoverageMap.js';

setupRender();

const COVERAGE: NeedCoverage = {
  site: { latitude: -12.046374, longitude: -77.042793 }, radiusKm: 10, compatibleCount: 6, nextBatchCount: 6,
  rings: [{ fromKm: 0, toKm: 2.5, count: 5 }, { fromKm: 2.5, toKm: 5, count: 1 }, { fromKm: 5, toKm: 7.5, count: 0 }, { fromKm: 7.5, toKm: 10, count: 0 }],
  cells: [{ latitude: -12.065, longitude: -77.045, count: 4 }],
};

describe('CoverageMap', () => {
  it('monta el mapa de Leaflet con la sede, el radio y las celdas, sin iconos ni imágenes de marcador', () => {
    const view = render(<CoverageMap coverage={COVERAGE} />);
    const map = view.querySelector('.leaflet-container');
    expect(map).not.toBeNull();
    // Sede (circleMarker), radio y una celda: tres trazados SVG; ninguna imagen de marcador.
    expect(view.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(3);
    expect(view.querySelector('.leaflet-marker-icon')).toBeNull();
    expect(view.querySelector('.leaflet-control-attribution')?.textContent).toContain('OpenStreetMap');
  });

  it('dice lo mismo en una tabla accesible y deja claro que son agregados', () => {
    const view = render(<CoverageMap coverage={COVERAGE} />);
    expect(view.querySelector('caption')?.textContent).toBe('Donantes compatibles sin invitar, por distancia a la sede');
    const rows = [...view.querySelectorAll('tbody tr')].map((row) => row.textContent);
    expect(rows).toEqual(['0–2.5 km5', '2.5–5 km1', '5–7.5 km0', '7.5–10 km0']);
    expect(view.textContent).toContain('6 donantes compatibles sin invitar dentro de 10 km. Un lote invitaría hoy a 6.');
    expect(view.textContent).toContain('nunca la ubicación de una persona');
    expect(view.textContent).toContain('menos de 3 donantes no se dibujan');
    expect(view.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('radio de 10 km');
  });

  it('el singular y el cero se dicen bien, y al desmontar se elimina el mapa', () => {
    const view = render(<CoverageMap coverage={{ ...COVERAGE, compatibleCount: 1, nextBatchCount: 1, cells: [] }} />);
    expect(view.textContent).toContain('1 donante compatible sin invitar dentro de 10 km');
    expect(view.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(2);
    render(<p>otra pantalla</p>);
    expect(document.querySelector('.leaflet-container')).toBeNull();
  });
});
