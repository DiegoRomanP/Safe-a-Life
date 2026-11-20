// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { press, settle, setupRender, type } from '../../../test/render.js';
import { registerHospitalApi } from '../../../test/hospitalApi.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();
const api = registerHospitalApi();

const button = (view: HTMLElement, text: string) => [...view.querySelectorAll('button')].find((item) => item.textContent === text) ?? null;
function control(view: HTMLElement, label: string) {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
}

describe('HOS-06 Altas asistidas', () => {
  it('pide solo correo y nombre opcional, sin grupo, contraseña ni ubicación', async () => {
    const view = renderRoute('/hospital/altas');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Altas asistidas');
    const labels = [...view.querySelectorAll('form label')].map((label) => label.textContent);
    expect(labels).toEqual(['Correo (obligatorio)', 'Nombre']);
    expect(view.querySelector('nav [aria-current="page"]')?.textContent).toBe('Altas asistidas');
  });

  it('valida el correo y enfoca el campo', async () => {
    const view = renderRoute('/hospital/altas');
    await settle();
    await press(button(view, 'Enviar invitación'));
    expect(view.textContent).toContain('Ingresa el correo de la persona.');
    expect(document.activeElement).toBe(control(view, 'Correo'));
  });

  it('el resultado es neutral, no repite el correo y suma una alta pendiente', async () => {
    const view = renderRoute('/hospital/altas');
    await settle();
    type(control(view, 'Correo'), 'persona@example.test');
    await press(button(view, 'Enviar invitación'));
    expect(api().calls).toContain('POST /hospitals/me/assisted-signups');
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Si corresponde, la persona recibirá un enlace');
    expect(live?.contains(document.activeElement)).toBe(true);
    expect(view.textContent).not.toContain('persona@example.test');
    expect(view.querySelectorAll('main li')).toHaveLength(4);
  });

  it('reenviar un enlace pendiente lo anuncia con el código de la alta', async () => {
    const view = renderRoute('/hospital/altas');
    await settle();
    await press([...view.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Reenviar enlace')) ?? null);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Solicitud de reenvío procesada para ALT-771A');
  });
});
