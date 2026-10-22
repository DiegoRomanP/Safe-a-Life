// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

const A104 = 'a1040c3d-1e2f-4a3b-8c4d-5e6f7a8b9c01';
const B087 = 'b0870e5f-3a4b-4c5d-8e6f-7a8b9c0d1e23';

function control(view: HTMLElement, label: string) {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
}

function choose(select: Element | null, value: string) {
  if (!(select instanceof HTMLSelectElement)) throw new Error('No se encontró el select.');
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const button = (view: HTMLElement, text: string) =>
  [...view.querySelectorAll('button')].find((item) => item.textContent === text) ?? null;

function fillNeed(view: HTMLElement) {
  choose(control(view, 'Grupo requerido'), 'O_POS');
  type(control(view, 'Meta de confirmaciones'), '4');
  choose(control(view, 'Sede'), '5b0a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c21');
}

describe('HOS-02 Crear necesidad', () => {
  it('el componente es fijo y muestra los recordatorios de Penpot', () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    expect(view.querySelector('h1')?.textContent).toBe('Crear necesidad');
    expect((control(view, 'Componente') as HTMLInputElement).readOnly).toBe(true);
    expect(view.textContent).toContain('Expresa intenciones de asistir, no unidades de sangre.');
  });

  it('valida los obligatorios y los rangos del contrato, y enfoca el primero', () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    type(control(view, 'Vencimiento en horas'), '75');
    click(button(view, 'Activar necesidad'));
    expect(view.textContent).toContain('Selecciona el grupo requerido.');
    expect(view.textContent).toContain('Ingresa un número entero de 1 a 50 intenciones.');
    expect(view.textContent).toContain('Usa un valor de 1 a 72 horas.');
    expect(document.activeElement).toBe(control(view, 'Grupo requerido'));
  });

  it('«Guardar borrador» crea un borrador y abre su detalle con el aviso enfocado', () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    fillNeed(view);
    click(button(view, 'Guardar borrador'));
    expect(view.querySelector('h1')?.textContent).toMatch(/^Necesidad NEC-[0-9A-F]{4}$/);
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Borrador guardado');
    expect(live?.contains(document.activeElement)).toBe(true);
    expect(view.textContent).toContain('0 de 4');
  });

  it('«Activar necesidad» la crea activa', () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    fillNeed(view);
    click(button(view, 'Activar necesidad'));
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Necesidad activada');
    expect(button(view, 'Cancelar necesidad')).not.toBeNull();
  });
});

describe('HOS-03 Detalle de necesidad', () => {
  it('muestra el progreso, los datos y solo las confirmaciones afirmativas con hora y zona', () => {
    const view = renderRoute(`/hospital/necesidades/${A104}`);
    expect(view.querySelector('h1')?.textContent).toBe('Necesidad NEC-A104');
    const bar = view.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('2');
    expect(bar?.getAttribute('aria-valuemax')).toBe('3');
    expect(bar?.getAttribute('aria-valuetext')).toBe('2 de 3 intenciones');
    const rows = [...view.querySelectorAll('tbody tr')];
    expect(rows.map((row) => row.querySelector('th')?.textContent)).toEqual(['María Torres', 'Luis Ramírez']);
    expect(rows[0]?.textContent).toContain('24 sep 2026, 12:08 · Lima, UTC−5');
    expect(view.textContent).not.toContain('D-83F2-03');
  });

  it('cancelar pide confirmación, mueve el foco y vuelve al botón si se desiste', () => {
    const view = renderRoute(`/hospital/necesidades/${A104}`);
    const cancel = button(view, 'Cancelar necesidad');
    cancel?.focus();
    click(cancel);
    expect(document.activeElement).toBe(button(view, 'Sí, cancelar necesidad'));
    click(button(view, 'Volver'));
    expect(document.activeElement).toBe(button(view, 'Cancelar necesidad'));
  });

  it('al confirmar la cancelación cambia el estado y lo anuncia', () => {
    const view = renderRoute(`/hospital/necesidades/${A104}`);
    click(button(view, 'Cancelar necesidad'));
    click(button(view, 'Sí, cancelar necesidad'));
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Necesidad cancelada');
    expect(live?.contains(document.activeElement)).toBe(true);
    expect(button(view, 'Cancelar necesidad')).toBeNull();
  });
});

describe('HOS-05 Respuestas', () => {
  it('cuenta las respuestas y oculta la identidad salvo en las confirmadas', () => {
    const view = renderRoute(`/hospital/necesidades/${B087}/respuestas`);
    expect(view.querySelector('h1')?.textContent).toBe('Respuestas · NEC-B087');
    const stats = [...view.querySelectorAll('section[aria-label="Resumen de respuestas"] > div')].map((d) => d.textContent);
    expect(stats).toEqual(['8Invitaciones', '1Confirmadas', '2Rechazadas', '5Sin respuesta']);
    const rows = [...view.querySelectorAll('tbody tr')];
    expect(rows.filter((row) => row.textContent?.includes('Oculta'))).toHaveLength(7);
    const confirmed = rows.find((row) => row.textContent?.includes('Confirmada'));
    expect(confirmed?.textContent).toContain('Ana Quispe · B+');
    expect(confirmed?.textContent).toContain('No informado');
  });

  it('una necesidad inexistente muestra un mensaje neutral', () => {
    const view = renderRoute('/hospital/necesidades/no-existe/respuestas');
    expect(view.querySelector('h1')?.textContent).toBe('No pudimos abrir estas respuestas');
  });
});
