// @vitest-environment jsdom
import L from 'leaflet';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import backendPolygon from '../../../../backend/src/modules/donor-records/domain/lima-polygon.ts?raw';
import { render, setupRender } from '../../test/render.js';
import { LocationMap, toApproximate } from './LocationMap.js';
import { LIMA_POLYGON } from './location.js';

setupRender();
afterEach(() => vi.restoreAllMocks());

// jsdom no tiene tamaño: el punto (0, 0) del contenedor es el centro del mapa y cada píxel se aleja de él.
// Devuelve false si el mapa canceló la acción por defecto de la tecla.
function press(element: Element, key: string, keyCode = 0) {
  let allowed = true;
  act(() => { allowed = element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, keyCode })); });
  return allowed;
}

function clickMap(view: HTMLElement, x = 0, y = 0) {
  act(() => { view.querySelector('.leaflet-container')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y })); });
}

describe('toApproximate', () => {
  it('redondea a tres decimales (~110 m)', () => {
    expect(toApproximate(-12.119_456, -77.036_789)).toEqual({ latitude: '-12.119', longitude: '-77.037' });
    expect(toApproximate(-12, -77)).toEqual({ latitude: '-12.000', longitude: '-77.000' });
  });

  it('usa los mismos vértices que el backend', () => {
    const pairs = [...backendPolygon.matchAll(/\[(-\d+\.\d+), (-\d+\.\d+)\]/g)].map(([, lon, lat]) => [Number(lon), Number(lat)]);
    expect(pairs).toHaveLength(7);
    expect(LIMA_POLYGON).toEqual(pairs);
  });

  it.each([
    ['vértice', -12.3, -77.15], ['borde norte', -11.8, -77], ['borde oeste', -12, -77.2], ['borde inclinado', -11.9, -76.875],
    ['borde inclinado suroeste', -12.2, -77.175], ['el redondeo lo mete', -12.3001, -77],
  ])('acepta el polígono con su borde: %s', (_caso, latitude, longitude) => {
    expect(toApproximate(latitude, longitude)).toEqual({ latitude: latitude.toFixed(3), longitude: longitude.toFixed(3) });
  });

  it.each([
    ['esquina suroeste del rectángulo', -12.3, -77.2], ['esquina sureste', -12.3, -76.85], ['esquina noreste', -11.8, -76.85],
    ['junto al borde inclinado', -11.9, -76.874],
    // Dentro del polígono sin redondear (el borde pasa por -76,87425), fuera ya redondeado a -76,874.
    ['el redondeo lo saca', -11.903, -76.8744],
    ['sur', -12.301, -77], ['norte', -11.799, -77], ['oeste', -12, -77.201], ['este', -12, -76.849],
    ['origen', 0, 0], ['latitud no numérica', Number.NaN, -77], ['longitud no numérica', -12, Number.NaN],
  ])('devuelve null fuera del polígono: %s', (_caso, latitude, longitude) => {
    expect(toApproximate(latitude, longitude)).toBeNull();
  });
});

describe('LocationMap', () => {
  it('sin ubicación muestra el mapa etiquetado, el aviso y el texto de privacidad, sin marcador', () => {
    const view = render(<LocationMap latitude="" longitude="" onChange={() => {}} />);
    expect(view.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Mapa de tu ubicación aproximada');
    expect(view.querySelector('.leaflet-container')).not.toBeNull();
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe('Haz clic en el mapa para marcar tu zona aproximada');
    expect(view.textContent).toContain('El mapa se carga desde OpenStreetMap; guardamos solo una zona aproximada (~110 m)');
    expect(view.querySelector('.leaflet-marker-icon')).toBeNull();
    expect(view.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(0);
    expect(view.querySelector('.leaflet-control-attribution')?.textContent).toContain('OpenStreetMap');
  });

  it('con ubicación muestra un marcador arrastrable sin imágenes y el círculo, y los quita si se borra', () => {
    const view = render(<LocationMap latitude="-12.119" longitude="-77.037" onChange={() => {}} />);
    const marker = view.querySelector('.leaflet-marker-icon');
    expect(marker?.classList.contains('leaflet-marker-draggable')).toBe(true);
    expect(marker?.tagName).toBe('DIV');
    expect(view.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(1);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe('Ubicación aproximada marcada en el mapa');
    render(<LocationMap latitude="" longitude="-77.037" onChange={() => {}} />);
    expect(view.querySelector('.leaflet-marker-icon')).toBeNull();
    expect(view.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(0);
  });

  it('un clic dentro de Lima entrega el punto redondeado', () => {
    const onChange = vi.fn();
    const view = render(<LocationMap latitude="" longitude="" onChange={onChange} />);
    clickMap(view);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]).toEqual([expect.stringMatching(/^-1[12]\.\d{3}$/), expect.stringMatching(/^-7[67]\.\d{3}$/)]);
  });

  it('un clic fuera de Lima avisa y no cambia la ubicación; el aviso se quita al llegar otra', () => {
    const onChange = vi.fn();
    const view = render(<LocationMap latitude="" longitude="" onChange={onChange} />);
    clickMap(view, 100_000, 100_000);
    expect(onChange).not.toHaveBeenCalled();
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe('Elige un punto dentro de Lima');
    render(<LocationMap latitude="-12.119" longitude="-77.037" onChange={onChange} />);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe('Ubicación aproximada marcada en el mapa');
  });

  it('la mira del centro aparece con el teclado y desaparece con el ratón o al salir del mapa', () => {
    const view = render(<LocationMap latitude="" longitude="" onChange={() => {}} />);
    const map = view.querySelector<HTMLElement>('.leaflet-container')!;
    const crosshair = () => view.querySelector('[data-map-center]');
    const releaseKey = (element: Element) => act(() => { element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' })); });
    act(() => map.focus());
    expect(crosshair()).toBeNull();
    releaseKey(map);
    expect(crosshair()?.getAttribute('aria-hidden')).toBe('true');
    act(() => { map.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(crosshair()).toBeNull();
    releaseKey(map);
    act(() => map.blur());
    expect(crosshair()).toBeNull();
    releaseKey(view.querySelector('.leaflet-control-zoom a')!);
    expect(crosshair()).toBeNull();
  });

  it('el mapa es una aplicación con nombre e instrucciones visibles', () => {
    const view = render(<LocationMap latitude="" longitude="" onChange={() => {}} />);
    const map = view.querySelector('.leaflet-container')!;
    expect(map.getAttribute('role')).toBe('application');
    expect(map.getAttribute('tabindex')).toBe('0');
    expect(map.getAttribute('aria-label')).toBe('Mapa para marcar tu zona');
    const help = view.querySelector(`#${CSS.escape(map.getAttribute('aria-describedby') ?? '')}`);
    expect(help?.textContent).toBe('Con teclado: flechas para mover el mapa, + y − para el zoom y Enter para marcar el centro.');  });

  it('Enter con el foco en el mapa marca el centro, tras moverlo con las flechas en pasos cortos', () => {
    const onChange = vi.fn();
    const view = render(<LocationMap latitude="" longitude="" onChange={onChange} />);
    const map = view.querySelector<HTMLElement>('.leaflet-container')!;
    act(() => map.focus());
    expect(press(map, 'Enter', 13)).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith('-12.050', '-77.040');
    press(map, 'ArrowRight', 39);
    press(map, 'Enter', 13);
    // A zoom 11, 25 px son unos 0,017°; con los 80 px por defecto serían 0,055°.
    expect(onChange).toHaveBeenLastCalledWith('-12.050', '-77.023');
  });

  it('Enter con el centro fuera de Lima avisa y no cambia la ubicación', () => {
    const onChange = vi.fn();
    const view = render(<LocationMap latitude="" longitude="" onChange={onChange} />);
    vi.spyOn(L.Map.prototype, 'getCenter').mockReturnValue(L.latLng(-12.3, -77.2));
    press(view.querySelector('.leaflet-container')!, 'Enter', 13);
    expect(onChange).not.toHaveBeenCalled();
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe('Elige un punto dentro de Lima');
  });

  it('Enter sobre el zoom o la atribución no marca nada ni cancela su acción', () => {
    const onChange = vi.fn();
    const view = render(<LocationMap latitude="" longitude="" onChange={onChange} />);
    for (const control of view.querySelectorAll('.leaflet-control-container a')) expect(press(control, 'Enter', 13)).toBe(true);
    expect(view.querySelectorAll('.leaflet-control-container a')).toHaveLength(3);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('al desmontar elimina el mapa', () => {
    render(<LocationMap latitude="" longitude="" onChange={() => {}} />);
    render(<p>otra pantalla</p>);
    expect(document.querySelector('.leaflet-container')).toBeNull();
  });
});
