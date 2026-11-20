// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { press, settle, setupRender, type } from '../../../test/render.js';
import { registerHospitalApi } from '../../../test/hospitalApi.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();
registerHospitalApi();

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
  it('el componente es fijo y muestra los recordatorios de Penpot', async () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Crear necesidad');
    expect((control(view, 'Componente') as HTMLInputElement).readOnly).toBe(true);
    expect(view.textContent).toContain('Expresa intenciones de asistir, no unidades de sangre.');
  });

  it('valida los obligatorios y los rangos del contrato, y enfoca el primero', async () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    await settle();
    type(control(view, 'Vencimiento en horas'), '75');
    await press(button(view, 'Activar necesidad'));
    expect(view.textContent).toContain('Selecciona el grupo requerido.');
    expect(view.textContent).toContain('Ingresa un número entero de 1 a 50 intenciones.');
    expect(view.textContent).toContain('Usa un valor de 1 a 72 horas.');
    expect(document.activeElement).toBe(control(view, 'Grupo requerido'));
  });

  it('«Guardar borrador» crea un borrador y abre su detalle con el aviso enfocado', async () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    await settle();
    fillNeed(view);
    await press(button(view, 'Guardar borrador'));
    expect(view.querySelector('h1')?.textContent).toMatch(/^Necesidad NEC-[0-9A-F]{4}$/);
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Borrador guardado');
    expect(live?.contains(document.activeElement)).toBe(true);
    expect(view.textContent).toContain('0 de 4');
  });

  it('«Activar necesidad» la crea activa', async () => {
    const view = renderRoute('/hospital/necesidades/nueva');
    await settle();
    fillNeed(view);
    await press(button(view, 'Activar necesidad'));
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Necesidad activada');
    expect(button(view, 'Cancelar necesidad')).not.toBeNull();
  });
});

describe('HOS-03 Detalle de necesidad', () => {
  it('muestra el progreso y los datos de la necesidad, y avisa que las confirmaciones aún no están disponibles', async () => {
    const view = renderRoute(`/hospital/necesidades/${A104}`);
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Necesidad NEC-A104');
    const bar = view.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('2');
    expect(bar?.getAttribute('aria-valuemax')).toBe('3');
    expect(bar?.getAttribute('aria-valuetext')).toBe('2 de 3 intenciones');
    expect(view.querySelector('tbody')).toBeNull();
    expect(view.textContent).toContain('todavía no están disponibles');
  });

  it('cancelar pide confirmación, mueve el foco y vuelve al botón si se desiste', async () => {
    const view = renderRoute(`/hospital/necesidades/${A104}`);
    await settle();
    const cancel = button(view, 'Cancelar necesidad');
    cancel?.focus();
    await press(cancel);
    expect(document.activeElement).toBe(button(view, 'Sí, cancelar necesidad'));
    await press(button(view, 'Volver'));
    expect(document.activeElement).toBe(button(view, 'Cancelar necesidad'));
  });

  it('al confirmar la cancelación cambia el estado y lo anuncia', async () => {
    const view = renderRoute(`/hospital/necesidades/${A104}`);
    await settle();
    await press(button(view, 'Cancelar necesidad'));
    await press(button(view, 'Sí, cancelar necesidad'));
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Necesidad cancelada');
    expect(live?.contains(document.activeElement)).toBe(true);
    expect(button(view, 'Cancelar necesidad')).toBeNull();
  });
});

describe('Lotes y respuestas (dependen de la coordinación de invitaciones)', () => {
  it.each(['respuestas', 'lotes'])('/%s dice que todavía no está disponible y no inventa datos', async (section) => {
    const view = renderRoute(`/hospital/necesidades/${B087}/${section}`);
    await settle();
    expect(view.textContent).toContain('Todavía no disponible');
    expect(view.querySelector('table')).toBeNull();
    expect(view.querySelector(`a[href="/hospital/necesidades/${B087}"]`)).not.toBeNull();
  });
});
