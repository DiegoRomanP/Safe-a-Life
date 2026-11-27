// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { press, settle, setupRender, type } from '../../../test/render.js';
import { registerSuperadminApi } from '../../../test/superadminApi.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();
registerSuperadminApi();

function control(view: HTMLElement, label: string, scope = 'main') {
  const element = [...view.querySelectorAll(`${scope} label`)].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
}

function choose(select: Element | null, value: string) {
  if (!(select instanceof HTMLSelectElement)) throw new Error('No se encontró el select.');
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const rows = (view: HTMLElement) => [...view.querySelectorAll('tbody tr')].map((row) => row.querySelector('th')?.textContent);
const button = (view: HTMLElement, text: string) =>
  [...view.querySelectorAll('button')].find((item) => item.textContent?.startsWith(text)) ?? null;

describe('SA-03 Sedes autorizadas', () => {
  it('lista las sedes con hospital, dirección pública y estado', async () => {
    const view = renderRoute('/superadmin/sedes');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Sedes autorizadas');
    expect(rows(view)).toHaveLength(5);
    expect(view.querySelector('tbody')?.textContent).toContain('En revisión');
  });

  it('filtra por estado y por búsqueda, y anuncia cuántas quedan', async () => {
    const view = renderRoute('/superadmin/sedes');
    await settle();
    choose(control(view, 'Estado', 'section[aria-label="Filtros"]'), 'revision');
    expect(rows(view)).toEqual(['Sede Villa El Salvador']);
    expect(view.querySelector('p[aria-live="polite"]')?.textContent).toBe('1 sede');
    choose(control(view, 'Estado', 'section[aria-label="Filtros"]'), '');
    type(control(view, 'Buscar sede'), 'cercado');
    expect(rows(view)).toEqual(['Sede Cercado', 'Sede Cercado de Lima']);
  });

  it('aprobar una sede en revisión la activa y lo anuncia', async () => {
    const view = renderRoute('/superadmin/sedes');
    await settle();
    await press(button(view, 'Aprobar'));
    expect(view.querySelector('div[aria-live="polite"]')?.textContent).toContain('Sede Villa El Salvador aprobada');
    expect(view.querySelector('tbody')?.textContent).not.toContain('En revisión');
  });

  it('crear sede valida y la agrega en revisión', async () => {
    const view = renderRoute('/superadmin/sedes');
    await settle();
    await press(button(view, 'Crear sede'));
    expect(view.textContent).toContain('Selecciona el hospital.');
    expect(view.textContent).toContain('Marca la ubicación de la sede en el mapa.');
    const form = 'form';
    choose(control(view, 'Hospital', form), 'a3c1d2e3-0003-4f5a-8b6c-7d8e9f0a1b33');
    type(control(view, 'Nombre de la sede', form), 'Sede Breña');
    type(control(view, 'Dirección pública', form), 'Av. Demo 9');
    // jsdom no tiene tamaño: un clic en (0, 0) marca el centro del mapa, dentro de Lima.
    act(() => { view.querySelector('.leaflet-container')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 })); });
    expect(view.textContent).toContain('Ubicación de la sede marcada en el mapa');
    expect([...view.querySelectorAll('form label')].some((label) => label.textContent?.startsWith('Latitud'))).toBe(false);
    await press(button(view, 'Crear sede'));
    expect(view.querySelector('div[aria-live="polite"]')?.textContent).toContain('Sede Breña creada');
    expect(rows(view)).toContain('Sede Breña');
  });
});
