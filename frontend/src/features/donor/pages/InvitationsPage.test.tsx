// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

function buttonByText(view: HTMLElement, text: string) {
  return [...view.querySelectorAll('button')].find((button) => button.textContent === text) ?? null;
}

describe('DON-03 Mis invitaciones', () => {
  it('/donante lleva a invitaciones con la navegación del donante', () => {
    const view = renderRoute('/donante');
    expect(view.querySelector('h1')?.textContent).toBe('Mis invitaciones');
    const active = view.querySelector('nav[aria-label="Cuenta del donante"] [aria-current="page"]');
    expect(active?.textContent).toBe('Invitaciones');
  });

  it('lista cada invitación con hospital, urgencia, respuesta y plazo en hora de Lima', () => {
    const view = renderRoute('/donante/invitaciones');
    const rows = [...view.querySelectorAll('section[aria-label="Invitaciones"] li')];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('Hospital Nacional Central');
    expect(rows[0]?.textContent).toContain('Urgente');
    expect(rows[0]?.textContent).toContain('Sin respuesta');
    expect(rows[0]?.textContent).toContain('24 sep 2026, 18:00 · Lima, UTC−5');
    expect(view.textContent).toContain('3 activas');
    expect(view.textContent).toContain('1 respondida');
  });

  it('cada enlace «Ver invitación» tiene un nombre accesible distinto', () => {
    const view = renderRoute('/donante/invitaciones');
    const names = [...view.querySelectorAll('section[aria-label="Invitaciones"] a')].map((a) => a.textContent);
    expect(new Set(names).size).toBe(3);
    expect(names[0]).toBe('Ver invitación de Hospital Nacional Central');
  });
});

describe('Detalle de invitación', () => {
  it('muestra la invitación sin datos de otras personas', () => {
    const view = renderRoute('/donante/invitaciones/7f21c3a0-1b2c-4d5e-8f90-0a1b2c3d4e51');
    expect(view.querySelector('h1')?.textContent).toBe('¿Deseas registrar tu intención de asistir?');
    expect(view.textContent).toContain('Sede San Borja');
    expect(view.textContent).toContain('Abrir esta invitación no registra una respuesta.');
  });

  it('confirmar registra la intención, lo anuncia y la refleja en la lista', () => {
    const view = renderRoute('/donante/invitaciones/7f21c3a0-1b2c-4d5e-8f90-0a1b2c3d4e51');
    const confirm = buttonByText(view, 'Confirmar intención de asistir');
    confirm?.focus();
    click(confirm);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Confirmaste tu intención de asistir.');
    expect(view.querySelector('[aria-live="polite"] [role]')).toBeNull();
    expect(view.textContent).toContain('Tu respuesta: Intención confirmada');
    // El botón de la respuesta vigente sigue enfocable: no se pierde el foco.
    expect(confirm?.getAttribute('aria-disabled')).toBe('true');
    expect(confirm?.disabled).toBe(false);
    expect(document.activeElement).toBe(confirm);
    click(view.querySelector('a[href="/donante/invitaciones"]'));
    expect(view.textContent).toContain('2 respondidas');
  });

  it('una invitación inexistente muestra un mensaje neutral', () => {
    const view = renderRoute('/donante/invitaciones/no-existe');
    expect(view.querySelector('h1')?.textContent).toBe('No pudimos abrir esta invitación');
    expect(view.textContent).not.toContain('no-existe');
  });
});
