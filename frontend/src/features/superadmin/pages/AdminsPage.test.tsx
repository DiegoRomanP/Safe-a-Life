// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { press, settle, setupRender, type } from '../../../test/render.js';
import { registerSuperadminApi } from '../../../test/superadminApi.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();
registerSuperadminApi();

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

async function stepUp(view: HTMLElement) {
  type(control(view, 'Código de 6 dígitos'), '123456');
  await press(button(view, 'Verificar y continuar'));
}

describe('SA-04 Administradores y membresías', () => {
  it('muestra solo pista de correo, hospital y estado', async () => {
    const view = renderRoute('/superadmin/administradores');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Administradores y membresías');
    const headers = [...view.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Correo (pista)', 'Hospital', 'Estado', 'Acciones']);
    expect(view.querySelector('tbody')?.textContent).toContain('a***@example.test');
  });

  it('invitar valida, pide step-up y responde de forma neutral sin repetir el correo', async () => {
    const view = renderRoute('/superadmin/administradores');
    await settle();
    await press(button(view, 'Enviar invitación'));
    expect(view.textContent).toContain('Ingresa el correo de la persona.');
    type(control(view, 'Correo'), 'nueva.admin@example.test');
    choose(control(view, 'Hospital'), 'a1c1d2e3-0001-4f5a-8b6c-7d8e9f0a1b11');
    await press(button(view, 'Enviar invitación'));
    await stepUp(view);
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Invitación procesada');
    expect(view.textContent).not.toContain('nueva.admin@example.test');
    expect(view.querySelector('tbody')?.textContent).toContain('n***@example.test');
  });

  it('el selector de hospital solo ofrece hospitales autorizados', async () => {
    const view = renderRoute('/superadmin/administradores');
    await settle();
    const options = [...(control(view, 'Hospital') as HTMLSelectElement).options].map((option) => option.textContent);
    expect(options).not.toContain('Clínica Norte Demo');
  });

  it('«Volver» cierra el formulario y devuelve el foco al botón Revocar', async () => {
    const view = renderRoute('/superadmin/administradores');
    await settle();
    const revoke = view.querySelector('tbody button') as HTMLButtonElement;
    revoke.focus();
    await press(revoke);
    await press(button(view, 'Volver'));
    expect(view.querySelector('#revocar-titulo')).toBeNull();
    expect(document.activeElement).toBe(revoke);
  });

  it('revocar pide motivo, enfoca el campo, exige step-up y lo anuncia', async () => {
    const view = renderRoute('/superadmin/administradores');
    await settle();
    await press(button(view, 'Revocar'));
    const reason = control(view, 'Motivo');
    expect(document.activeElement).toBe(reason);
    await press(button(view, 'Revocar membresía'));
    expect(view.textContent).toContain('Indica el motivo de la revocación.');
    type(reason, 'Dejó de trabajar en el hospital.');
    await press(button(view, 'Revocar membresía'));
    await stepUp(view);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Membresía de a***@example.test revocada');
    expect(view.querySelector('tbody')?.textContent).toContain('Revocado');
  });
});
