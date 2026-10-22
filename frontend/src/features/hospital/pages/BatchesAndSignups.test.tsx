// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

const A104 = 'a1040c3d-1e2f-4a3b-8c4d-5e6f7a8b9c01';
const AB19 = 'ab190f6a-4b5c-4d6e-9f7a-8b9c0d1e2f34';

const button = (view: HTMLElement, text: string) =>
  [...view.querySelectorAll('button')].find((item) => item.textContent === text) ?? null;

function control(view: HTMLElement, label: string) {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
}

describe('HOS-04 Lotes y entregas', () => {
  it('lista los lotes con fecha en hora de Lima y conteos de entrega', () => {
    const view = renderRoute(`/hospital/necesidades/${A104}/lotes`);
    expect(view.querySelector('h1')?.textContent).toBe('Lotes y entregas · NEC-A104');
    const rows = [...view.querySelectorAll('tbody tr')];
    expect(rows.map((row) => row.querySelector('th')?.textContent)).toEqual(['LOT-001', 'LOT-002']);
    expect(rows[0]?.textContent).toContain('24 sep 2026, 09:32 · Lima, UTC−5');
  });

  it('solicitar un lote suma invitaciones pendientes, enfoca el aviso y se ve en Respuestas', () => {
    const view = renderRoute(`/hospital/necesidades/${A104}/lotes`);
    click(button(view, 'Solicitar nuevo lote'));
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Lote solicitado: 2 invitaciones nuevas');
    expect(live?.contains(document.activeElement)).toBe(true);
    expect(view.querySelectorAll('tbody tr')).toHaveLength(3);
    click(view.querySelector('main a[href$="/respuestas"]'));
    expect(view.textContent).toContain('6Invitaciones');
  });

  it('con la necesidad en borrador no ofrece solicitar lotes', () => {
    const view = renderRoute(`/hospital/necesidades/${AB19}/lotes`);
    expect(button(view, 'Solicitar nuevo lote')).toBeNull();
    expect(view.textContent).toContain('Para solicitar un lote, la necesidad debe estar activa.');
  });

  it('el detalle de la necesidad enlaza a sus lotes', () => {
    const view = renderRoute(`/hospital/necesidades/${A104}`);
    expect(view.querySelector(`a[href="/hospital/necesidades/${A104}/lotes"]`)?.textContent).toBe('Ver lotes y entregas');
  });
});

describe('HOS-06 Altas asistidas', () => {
  it('pide solo correo y nombre opcional, sin grupo, contraseña ni ubicación', () => {
    const view = renderRoute('/hospital/altas');
    expect(view.querySelector('h1')?.textContent).toBe('Altas asistidas');
    const labels = [...view.querySelectorAll('form label')].map((label) => label.textContent);
    expect(labels).toEqual(['Correo (obligatorio)', 'Nombre']);
    expect(view.querySelector('nav [aria-current="page"]')?.textContent).toBe('Altas asistidas');
  });

  it('valida el correo y enfoca el campo', () => {
    const view = renderRoute('/hospital/altas');
    click(button(view, 'Enviar invitación'));
    expect(view.textContent).toContain('Ingresa el correo de la persona.');
    expect(document.activeElement).toBe(control(view, 'Correo'));
  });

  it('el resultado es neutral, no repite el correo y suma una alta pendiente', () => {
    const view = renderRoute('/hospital/altas');
    type(control(view, 'Correo'), 'persona@example.test');
    click(button(view, 'Enviar invitación'));
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Si corresponde, la persona recibirá un enlace');
    expect(live?.contains(document.activeElement)).toBe(true);
    expect(view.textContent).not.toContain('persona@example.test');
    expect(view.querySelectorAll('main li')).toHaveLength(4);
  });

  it('reenviar un enlace pendiente lo anuncia con el código de la alta', () => {
    const view = renderRoute('/hospital/altas');
    click([...view.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Reenviar enlace')) ?? null);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Solicitud de reenvío procesada para ALT-771A');
  });
});
