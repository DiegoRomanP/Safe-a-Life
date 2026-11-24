// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, setupRender } from '../../../test/render.js';
import type { NeedCoverage } from '../types.js';
import { CoverageMap } from './CoverageMap.js';

setupRender();

const COVERAGE: NeedCoverage = {
  site: { latitude: -12.046374, longitude: -77.042793 }, radiusKm: 10, compatibleCount: 5, nextBatchCount: 5,
  rings: [{ fromKm: 0, toKm: 5, count: 5 }, { fromKm: 5, toKm: 10, count: 0 }],
  cells: [{ latitude: -12.065, longitude: -77.045, count: 5 }],
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
    expect(rows).toEqual(['0–5 kmAl menos 5', '5–10 km0']);
    expect(view.textContent).toContain('Al menos 5 donantes compatibles sin invitar dentro de 10 km. Un lote invitaría hoy a al menos 5 personas.');
    expect(view.textContent).toContain('nunca la ubicación de una persona');
    expect(view.textContent).toContain('menos de 5 donantes no se detallan');
    expect(view.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('radio de 10 km');
  });

  it('con menos de 3 candidatos no se dice cuántos ni cuántos invitaría un lote, y al desmontar se elimina el mapa', () => {
    const view = render(<CoverageMap coverage={{ ...COVERAGE, compatibleCount: null, nextBatchCount: null, rings: [{ fromKm: 0, toKm: 10, count: null }], cells: [] }} />);
    expect(view.textContent).toContain('Menos de 5 donantes compatibles sin invitar dentro de 10 km.');
    expect(view.textContent).not.toContain('Un lote invitaría');
    expect([...view.querySelectorAll('tbody tr')].map((row) => row.textContent)).toEqual(['0–10 kmMenos de 5']);
    expect(view.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(2);
    render(<p>otra pantalla</p>);
    expect(document.querySelector('.leaflet-container')).toBeNull();
  });
});
