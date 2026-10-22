// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

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
  it('lista las sedes con hospital, dirección pública y estado', () => {
    const view = renderRoute('/superadmin/sedes');
    expect(view.querySelector('h1')?.textContent).toBe('Sedes autorizadas');
    expect(rows(view)).toHaveLength(5);
    expect(view.querySelector('tbody')?.textContent).toContain('En revisión');
  });

  it('filtra por estado y por búsqueda, y anuncia cuántas quedan', () => {
    const view = renderRoute('/superadmin/sedes');
    choose(control(view, 'Estado', 'section[aria-label="Filtros"]'), 'revision');
    expect(rows(view)).toEqual(['Sede Villa El Salvador']);
    expect(view.querySelector('p[aria-live="polite"]')?.textContent).toBe('1 sede');
    choose(control(view, 'Estado', 'section[aria-label="Filtros"]'), '');
    type(control(view, 'Buscar sede'), 'cercado');
    expect(rows(view)).toEqual(['Sede Cercado', 'Sede Cercado de Lima']);
  });

  it('aprobar una sede en revisión la activa y lo anuncia', () => {
    const view = renderRoute('/superadmin/sedes');
    click(button(view, 'Aprobar'));
    expect(view.querySelector('div[aria-live="polite"]')?.textContent).toContain('Sede Villa El Salvador aprobada');
    expect(view.querySelector('tbody')?.textContent).not.toContain('En revisión');
  });

  it('crear sede valida y la agrega en revisión', () => {
    const view = renderRoute('/superadmin/sedes');
    click(button(view, 'Crear sede'));
    expect(view.textContent).toContain('Selecciona el hospital.');
    const form = 'form';
    choose(control(view, 'Hospital', form), 'a0c1d2e3-0003-4f5a-8b6c-7d8e9f0a1b33');
    type(control(view, 'Nombre de la sede', form), 'Sede Breña');
    type(control(view, 'Dirección pública', form), 'Av. Demo 9');
    type(control(view, 'Latitud', form), '-12.06');
    type(control(view, 'Longitud', form), '-77.05');
    click(button(view, 'Crear sede'));
    expect(view.querySelector('div[aria-live="polite"]')?.textContent).toContain('Sede Breña creada');
    expect(rows(view)).toContain('Sede Breña');
  });
});
