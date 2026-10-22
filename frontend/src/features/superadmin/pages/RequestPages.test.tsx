// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

const CORRECTION = '7f21a8b3-4e5f-4a71-9c23-3d4e5f6a7b84';
const DELETION = '91a2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c01';
const COMPLETED = '2a09b9c4-5f6a-4b82-8d34-4e5f6a7b8c95';

function control(view: HTMLElement, label: string) {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
}

const button = (view: HTMLElement, text: string) =>
  [...view.querySelectorAll('button')].find((item) => item.textContent === text) ?? null;

function stepUp(view: HTMLElement) {
  type(control(view, 'Código de 6 dígitos'), '123456');
  click(button(view, 'Verificar y continuar'));
}

const live = (view: HTMLElement) => view.querySelector('[aria-live="polite"]')?.textContent ?? '';

describe('SA-05 Solicitudes', () => {
  it('la lista muestra solo metadatos y enlaza al detalle', () => {
    const view = renderRoute('/superadmin/solicitudes');
    expect(view.querySelector('h1')?.textContent).toBe('Solicitudes');
    const first = view.querySelector('tbody tr');
    expect(first?.querySelector('a')?.textContent).toBe('SOL-91A2');
    expect(first?.textContent).toContain('Eliminación de datos');
  });

  it('ver datos exige motivo y step-up, y muestra solo los campos pedidos', () => {
    const view = renderRoute(`/superadmin/solicitudes/${CORRECTION}`);
    expect(view.querySelector('h1')?.textContent).toBe('Solicitud SOL-7F21');
    expect(view.textContent).not.toContain('A−');
    click(button(view, 'Ver datos de la solicitud'));
    expect(view.textContent).toContain('Indica el motivo de la consulta.');
    expect(document.activeElement).toBe(view.querySelector('#acceso-motivo'));
    expect(view.querySelector('#step-up-titulo')).toBeNull();
    type(view.querySelector('#acceso-motivo'), 'Revisar la corrección pedida.');
    click(button(view, 'Ver datos de la solicitud'));
    const code = control(view, 'Código de 6 dígitos');
    expect(code?.getAttribute('aria-describedby')).toContain('step-up-proposito');
    stepUp(view);
    expect([...view.querySelectorAll('tbody tr')].map((row) => row.textContent)).toEqual(['Grupo declaradoA+A−']);
    expect(live(view)).toContain('Acceso contextual concedido');
  });

  it('decidir exige motivo; ejecutar una aprobada exige motivo y step-up', () => {
    const view = renderRoute(`/superadmin/solicitudes/${CORRECTION}`);
    click(button(view, 'Aprobar'));
    expect(view.textContent).toContain('Indica el motivo de la decisión.');
    type(control(view, 'Motivo de la decisión'), 'Corrección documentada.');
    click(button(view, 'Aprobar'));
    expect(live(view)).toContain('SOL-7F21 aprobada');
    expect(view.textContent).toContain('Esta solicitud ya no requiere consultar datos personales.');
    click(button(view, 'Ejecutar solicitud'));
    expect(view.textContent).toContain('Indica el motivo de la ejecución.');
    type(control(view, 'Motivo de la ejecución'), 'Aplicar la corrección aprobada.');
    click(button(view, 'Ejecutar solicitud'));
    stepUp(view);
    expect(live(view)).toContain('SOL-7F21 ejecutada');
    expect(view.querySelector('h1')?.parentElement?.textContent).toContain('Completada');
  });

  it('una solicitud terminal no ofrece consultar datos', () => {
    const view = renderRoute(`/superadmin/solicitudes/${COMPLETED}`);
    expect(view.textContent).toContain('Esta solicitud ya no requiere consultar datos personales.');
    expect(button(view, 'Ver datos de la solicitud')).toBeNull();
  });

  it('una eliminación pendiente no ofrece ver datos personales', () => {
    const view = renderRoute(`/superadmin/solicitudes/${DELETION}`);
    expect(view.textContent).toContain('Resolver una eliminación no requiere ver datos personales.');
    expect(button(view, 'Ver datos de la solicitud')).toBeNull();
  });

  it('rechazar cierra la tarea y deja el motivo en la auditoría', () => {
    const view = renderRoute(`/superadmin/solicitudes/${DELETION}`);
    type(control(view, 'Motivo de la decisión'), 'Falta confirmar la identidad.');
    click(button(view, 'Rechazar'));
    click(view.querySelector('nav a[href="/superadmin"]'));
    expect(view.querySelector('main')?.textContent).not.toContain('SOL-91A2');
    click(view.querySelector('nav a[href="/superadmin/auditoria"]'));
    const first = view.querySelector('tbody tr');
    expect(first?.textContent).toContain('solicitud.rechazada');
    expect(first?.textContent).toContain('Falta confirmar la identidad.');
  });
});
