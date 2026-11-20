// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { press, settle, setupRender, type } from '../../../test/render.js';
import { registerHospitalApi } from '../../../test/hospitalApi.js';
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
  it('muestra el progreso y los datos de la necesidad, y enlaza a los lotes y las respuestas', async () => {
    const view = renderRoute(`/hospital/necesidades/${A104}`);
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Necesidad NEC-A104');
    const bar = view.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('2');
    expect(bar?.getAttribute('aria-valuemax')).toBe('3');
    expect(bar?.getAttribute('aria-valuetext')).toBe('2 de 3 intenciones');
    expect(view.querySelector('tbody')).toBeNull();
    expect(view.textContent).toContain('Lotes de invitación');
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

const BORRADOR = 'ab190f6a-4b5c-4d6e-9f7a-8b9c0d1e2f34';
const api = registerHospitalApi();

describe('Lotes de invitación (reales)', () => {
  it('el detalle de la necesidad enlaza a lotes y respuestas', async () => {
    const view = renderRoute(`/hospital/necesidades/${B087}`);
    await settle();
    expect(view.querySelector(`a[href="/hospital/necesidades/${B087}/lotes"]`)).not.toBeNull();
    expect(view.querySelector(`a[href="/hospital/necesidades/${B087}/respuestas"]`)).not.toBeNull();
  });

  it('sin lotes muestra el estado vacío y permite solicitar uno', async () => {
    const view = renderRoute(`/hospital/necesidades/${B087}/lotes`);
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Lotes de invitación');
    expect(view.textContent).toContain('Todavía no hay lotes');
    await press(button(view, 'Solicitar lote'));
    await settle();
    expect(api().calls).toContain(`POST /hospitals/me/needs/${B087}/invitation-batches`);
    expect(api().bodies[`POST /hospitals/me/needs/${B087}/invitation-batches`]).toBeUndefined();
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Lote creado: 2 invitaciones');
    const row = view.querySelector('tbody tr');
    expect(row?.textContent).toContain('2');
    expect([...view.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Creado', 'Invitaciones', 'Pendientes', 'Enviadas', 'Entregadas', 'Fallidas']);
  });

  it('un lote sin donantes disponibles lo dice y no promete correos', async () => {
    api().nextBatchSize = 0;
    const view = renderRoute(`/hospital/necesidades/${B087}/lotes`);
    await settle();
    await press(button(view, 'Solicitar lote'));
    await settle();
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('No había donantes compatibles disponibles');
  });

  it('una necesidad que no está activa no admite lotes', async () => {
    const view = renderRoute(`/hospital/necesidades/${BORRADOR}/lotes`);
    await settle();
    expect(view.textContent).toContain('Solo una necesidad activa admite nuevos lotes');
    await press(button(view, 'Solicitar lote'));
    expect(api().calls.filter((call) => call.startsWith('POST'))).toEqual([]);
  });

  it('un conflicto al solicitar el lote avisa que no se guardó', async () => {
    const view = renderRoute(`/hospital/necesidades/${B087}/lotes`);
    await settle();
    api().writeStatus = 409;
    await press(button(view, 'Solicitar lote'));
    await settle();
    expect(view.querySelector('main [role="alert"]')?.textContent).toContain('no se guardó');
  });
});

describe('Respuestas (reales)', () => {
  it('las confirmadas muestran nombre y grupo declarado; las demás, solo código y estado', async () => {
    api().responses = [
      { needDonorCode: 'ABCDEFGHJK', donorName: 'Persona Confirmada', declaredBloodType: 'O_POS', response: 'confirmada', responseRecordedAt: '2026-09-25T13:32:00Z' },
      { needDonorCode: 'MNPQRSTVWX', validity: 'activa', delivery: 'entregada', response: 'sin_respuesta' },
      { needDonorCode: 'ZZZZZZZZZZ', validity: 'activa', delivery: 'enviada', response: 'rechazada' },
    ];
    const view = renderRoute(`/hospital/necesidades/${B087}/respuestas`);
    await settle();
    const rows = [...view.querySelectorAll('main ul.divide-y > li')].map((li) => li.textContent ?? '');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('Persona Confirmada');
    expect(rows[0]).toContain('Grupo declarado');
    expect(rows[1]).toContain('MNPQRSTVWX');
    expect(rows[1]).not.toMatch(/Grupo|@/);
    expect(view.textContent).toContain('1 intención confirmada');
    expect(view.textContent).toContain('no confirma aptitud');
  });

  it('sin invitaciones muestra el estado vacío', async () => {
    const view = renderRoute(`/hospital/necesidades/${B087}/respuestas`);
    await settle();
    expect(view.textContent).toContain('Todavía no hay invitaciones');
  });

  it('un campo de más en una respuesta (p. ej. un correo) hace fallar la lectura: nunca se pinta', async () => {
    api().responses = [{ needDonorCode: 'ABCDEFGHJK', validity: 'activa', delivery: 'entregada', response: 'sin_respuesta', email: 'x@example.test' } as never];
    const view = renderRoute(`/hospital/necesidades/${B087}/respuestas`);
    await settle();
    expect(view.textContent).not.toContain('x@example.test');
    expect(view.querySelector('main [role="alert"]')).not.toBeNull();
  });
});
