// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { click, setupRender } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

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

describe('SA-07 Auditoría', () => {
  it('lista eventos con fecha en hora de Lima y solo códigos opacos', () => {
    const view = renderRoute('/superadmin/auditoria');
    expect(view.querySelector('h1')?.textContent).toBe('Auditoría minimizada');
    const first = view.querySelector('tbody tr');
    expect(first?.textContent).toContain('24 sep 2026, 11:12 · Lima, UTC−5');
    expect(first?.textContent).toContain('ACT-81F2');
    expect(view.querySelector('tbody')?.textContent).not.toMatch(/@|example\.test/);
  });

  it('filtra por resultado, anuncia el total y limpia los filtros', () => {
    const view = renderRoute('/superadmin/auditoria');
    choose(control(view, 'Resultado'), 'denegado');
    expect(view.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(view.querySelector('p[aria-live="polite"]')?.textContent).toBe('1 evento');
    expect(view.querySelector('tbody')?.textContent).toContain('Sin step-up reciente.');
    click(button(view, 'Limpiar filtros'));
    expect(view.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('las acciones del superadmin quedan auditadas sin valores', () => {
    const view = renderRoute('/superadmin/sedes');
    click([...view.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Aprobar')) ?? null);
    click(view.querySelector('nav a[href="/superadmin/auditoria"]'));
    const first = view.querySelector('tbody tr');
    expect(first?.textContent).toContain('sede.aprobada');
    expect(first?.textContent).toContain('SED-B4D2');
    expect(first?.textContent).not.toContain('Villa El Salvador');
  });

  it('el filtro de evento ofrece los eventos presentes', () => {
    const view = renderRoute('/superadmin/auditoria');
    const options = [...(control(view, 'Evento') as HTMLSelectElement).options].map((option) => option.value);
    expect(options).toContain('lote.creado');
    choose(control(view, 'Evento'), 'lote.creado');
    expect(view.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});
