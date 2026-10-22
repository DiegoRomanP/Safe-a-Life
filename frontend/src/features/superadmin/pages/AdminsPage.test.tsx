// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
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
  [...view.querySelectorAll('button')].find((item) => item.textContent?.startsWith(text)) ?? null;

function stepUp(view: HTMLElement) {
  type(control(view, 'Código de 6 dígitos'), '123456');
  click(button(view, 'Verificar y continuar'));
}

describe('SA-04 Administradores y membresías', () => {
  it('muestra solo pista de correo, hospital y estado', () => {
    const view = renderRoute('/superadmin/administradores');
    expect(view.querySelector('h1')?.textContent).toBe('Administradores y membresías');
    const headers = [...view.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Correo (pista)', 'Hospital', 'Estado', 'Acciones']);
    expect(view.querySelector('tbody')?.textContent).toContain('a***@example.test');
  });

  it('invitar valida, pide step-up y responde de forma neutral sin repetir el correo', () => {
    const view = renderRoute('/superadmin/administradores');
    click(button(view, 'Enviar invitación'));
    expect(view.textContent).toContain('Ingresa el correo de la persona.');
    type(control(view, 'Correo'), 'nueva.admin@example.test');
    choose(control(view, 'Hospital'), 'a0c1d2e3-0001-4f5a-8b6c-7d8e9f0a1b11');
    click(button(view, 'Enviar invitación'));
    stepUp(view);
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Invitación procesada');
    expect(view.textContent).not.toContain('nueva.admin@example.test');
    expect(view.querySelector('tbody')?.textContent).toContain('n***@example.test');
  });

  it('el selector de hospital solo ofrece hospitales autorizados', () => {
    const view = renderRoute('/superadmin/administradores');
    const options = [...(control(view, 'Hospital') as HTMLSelectElement).options].map((option) => option.textContent);
    expect(options).not.toContain('Clínica Norte Demo');
  });

  it('«Volver» cierra el formulario y devuelve el foco al botón Revocar', () => {
    const view = renderRoute('/superadmin/administradores');
    const revoke = view.querySelector('tbody button') as HTMLButtonElement;
    revoke.focus();
    click(revoke);
    click(button(view, 'Volver'));
    expect(view.querySelector('#revocar-titulo')).toBeNull();
    expect(document.activeElement).toBe(revoke);
  });

  it('revocar pide motivo, enfoca el campo, exige step-up y lo anuncia', () => {
    const view = renderRoute('/superadmin/administradores');
    click(button(view, 'Revocar'));
    const reason = control(view, 'Motivo');
    expect(document.activeElement).toBe(reason);
    click(button(view, 'Revocar membresía'));
    expect(view.textContent).toContain('Indica el motivo de la revocación.');
    type(reason, 'Dejó de trabajar en el hospital.');
    click(button(view, 'Revocar membresía'));
    stepUp(view);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Membresía de a***@example.test revocada');
    expect(view.querySelector('tbody')?.textContent).toContain('Revocado');
  });
});
