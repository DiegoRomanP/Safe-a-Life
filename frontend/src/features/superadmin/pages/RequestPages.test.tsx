// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

const CORRECTION = '7f21a8b3-4e5f-4a71-9c23-3d4e5f6a7b84';
const DELETION = '91a2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c01';

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

describe('SA-05 Solicitudes', () => {
  it('la lista muestra solo metadatos y enlaza al detalle', () => {
    const view = renderRoute('/superadmin/solicitudes');
    expect(view.querySelector('h1')?.textContent).toBe('Solicitudes');
    const first = view.querySelector('tbody tr');
    expect(first?.querySelector('a')?.textContent).toBe('SOL-91A2');
    expect(first?.textContent).toContain('Eliminación de datos');
    expect(first?.textContent).toContain('Pendiente');
  });

  it('el detalle no muestra valores hasta hacer step-up', () => {
    const view = renderRoute(`/superadmin/solicitudes/${CORRECTION}`);
    expect(view.querySelector('h1')?.textContent).toBe('Solicitud SOL-7F21');
    expect(view.textContent).toContain('Acceso contextual protegido');
    expect(view.textContent).not.toContain('A−');
    click(button(view, 'Ver datos de la solicitud'));
    stepUp(view);
    const values = view.querySelector('tbody tr');
    expect(values?.textContent).toBe('Grupo declaradoA+A−');
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Acceso contextual concedido');
  });

  it('decidir exige motivo; aprobar habilita ejecutar, que pide step-up', () => {
    const view = renderRoute(`/superadmin/solicitudes/${CORRECTION}`);
    click(button(view, 'Aprobar'));
    expect(view.textContent).toContain('Indica el motivo de la decisión.');
    expect(document.activeElement).toBe(control(view, 'Motivo'));
    type(control(view, 'Motivo'), 'Corrección documentada.');
    click(button(view, 'Aprobar'));
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('SOL-7F21 aprobada');
    click(button(view, 'Ejecutar solicitud'));
    stepUp(view);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('SOL-7F21 ejecutada');
    expect(view.textContent).toContain('Completada');
  });

  it('una eliminación no ofrece ver datos personales', () => {
    const view = renderRoute(`/superadmin/solicitudes/${DELETION}`);
    expect(view.textContent).toContain('Resolver una eliminación no requiere ver datos personales.');
    expect(button(view, 'Ver datos de la solicitud')).toBeNull();
  });

  it('rechazar cierra la tarea en SA-01', () => {
    const view = renderRoute(`/superadmin/solicitudes/${DELETION}`);
    type(control(view, 'Motivo'), 'Falta confirmar la identidad.');
    click(button(view, 'Rechazar'));
    click(view.querySelector('nav a[href="/superadmin"]'));
    expect(view.querySelector('main')?.textContent).not.toContain('SOL-91A2');
  });
});
