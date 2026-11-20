// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';
import { stubDonorApi, type DonorApiStub } from '../../../test/donorApi.js';

setupRender();
// El perfil es real: un backend en memoria responde sus tres operaciones.
let api: DonorApiStub;
beforeEach(() => { api = stubDonorApi(); });

const INVITATION = '/donante/invitaciones/7f21c3a0-1b2c-4d5e-8f90-0a1b2c3d4e51';

// Una sola vuelta: termina la escritura pero la revalidación sigue en curso.
async function tick() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const button = (view: HTMLElement, text: string) =>
  [...view.querySelectorAll('button')].find((item) => item.textContent === text) ?? null;

describe('Estados de carga del área del donante', () => {
  it('mientras llegan los datos anuncia la carga y mantiene la cabecera', async () => {
    const view = renderRoute('/donante/invitaciones');
    expect(view.querySelector('h1')?.textContent).toBe('Mis invitaciones');
    expect(view.querySelector('main [role="status"]')?.textContent).toContain('Cargando tus invitaciones…');
    await settle();
    expect(view.querySelector('main [role="status"]')).toBeNull();
    expect(view.querySelectorAll('section[aria-label="Invitaciones"] li')).toHaveLength(3);
  });

  it('un error de red ofrece reintentar y se recupera al volver la conexión', async () => {
    api.readStatus = 503;
    const view = renderRoute('/donante/solicitudes');
    await settle();
    const alert = view.querySelector('main [role="alert"]');
    expect(alert?.textContent).toContain('No pudimos cargar la información');
    expect(view.querySelector('tbody')).toBeNull();
    // Reintentar vuelve a «Cargando» y, si la red sigue caída, al error.
    const retry = button(view, 'Reintentar');
    retry?.focus();
    click(retry);
    expect(view.querySelector('main [role="status"]')?.textContent).toContain('Cargando tus solicitudes…');
    // El botón desaparece: el foco pasa a la región de la carga, no al body.
    const region = document.activeElement;
    expect(region).not.toBe(document.body);
    expect(region?.contains(view.querySelector('main [role="status"]'))).toBe(true);
    await settle();
    expect(view.querySelector('main [role="alert"]')).not.toBeNull();
    expect(document.activeElement).toBe(region);
    api.readStatus = 200;
    click(button(view, 'Reintentar'));
    await settle();
    expect(view.querySelector('tbody tr th')?.textContent).toBe('SOL-7F21');
  });

  it('una invitación ajena o inexistente muestra el mensaje neutro y ningún dato', async () => {
    const view = renderRoute('/donante/invitaciones/00000000-0000-4000-8000-000000000000');
    await settle();
    expect(view.textContent).toContain('No pudimos abrir este recurso');
    expect(view.textContent).toContain('Por seguridad no mostramos más información.');
    expect(view.textContent).not.toContain('Hospital Nacional Central');
    expect(view.textContent).not.toContain('Sede San Borja');
  });

  it('un conflicto al responder avisa que no se guardó y no cambia la respuesta', async () => {
    const view = renderRoute(INVITATION);
    await settle();
    api.writeStatus = 409; // el backend real responde el conflicto
    click(button(view, 'Confirmar intención de asistir'));
    await settle();
    const alert = view.querySelector('main [role="alert"]');
    expect(alert?.textContent).toContain('El estado cambió');
    expect(alert?.textContent).toContain('el tuyo no se guardó');
    expect(view.textContent).toContain('Tu respuesta: Sin respuesta');
    expect(view.querySelector('[aria-live="polite"]')?.textContent).not.toContain('Confirmaste');
    // «Revisar cambios» recarga la invitación y quita el aviso sin perder el foco.
    const review = button(view, 'Revisar cambios');
    review?.focus();
    click(review);
    await settle();
    expect(view.querySelector('main [role="alert"]')).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.contains(view.querySelector('h1'))).toBe(true);
    api.writeStatus = 200;
    click(view.querySelector('main a[href="/donante/historial"]'));
    await settle();
    expect(view.querySelectorAll('ol > li')).toHaveLength(1);
  });

  it('mientras se guarda no admite un segundo envío', async () => {
    const view = renderRoute(INVITATION);
    await settle();
    const confirm = button(view, 'Confirmar intención de asistir');
    click(confirm);
    expect(confirm?.getAttribute('aria-disabled')).toBe('true');
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Guardando tu respuesta…');
    click(button(view, 'No podré asistir'));
    await settle();
    expect(view.textContent).toContain('Tu respuesta: Intención confirmada');
    click(view.querySelector('main a[href="/donante/historial"]'));
    await settle();
    expect(view.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('tras guardar no admite otra respuesta hasta revalidar la invitación', async () => {
    const view = renderRoute(INVITATION);
    await settle();
    api.readDelayMs = 60; // la revalidación tarda: así se ve el estado intermedio
    click(button(view, 'Confirmar intención de asistir'));
    await tick();
    // La escritura terminó y la invitación se está revalidando.
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Confirmaste tu intención de asistir.');
    expect(button(view, 'No podré asistir')?.getAttribute('aria-disabled')).toBe('true');
    click(button(view, 'No podré asistir'));
    api.readDelayMs = 0;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });
    await settle();
    expect(view.textContent).toContain('Tu respuesta: Intención confirmada');
    expect(button(view, 'No podré asistir')?.getAttribute('aria-disabled')).toBe('false');
    click(view.querySelector('main a[href="/donante/historial"]'));
    await settle();
    expect(view.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('un conflicto al guardar el perfil no marca los cambios como guardados', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    api.writeStatus = 409; // el backend real responde el conflicto
    click(view.querySelector('[role="switch"]'));
    const submit = view.querySelector('#perfil-formulario button[type="submit"]');
    click(submit);
    expect(submit?.getAttribute('aria-disabled')).toBe('true');
    await settle();
    expect(view.querySelector('main [role="alert"]')?.textContent).toContain('El estado cambió');
    expect(view.querySelector('[aria-live="polite"]')?.textContent).not.toContain('Cambios guardados');
    // Revisar vuelve a mostrar los datos actuales: sigue disponible.
    const review = button(view, 'Revisar cambios');
    review?.focus();
    click(review);
    await settle();
    expect(document.activeElement).not.toBe(document.body);
    expect(view.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
  });
});

describe('Envíos de formularios del donante', () => {
  it('un conflicto al crear la solicitud no navega y al revisarlo el foco vuelve al envío', async () => {
    const view = renderRoute('/donante/solicitudes/nueva');
    await settle();
    api.writeStatus = 409;
    const name = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith('Nombre nuevo'));
    type(view.querySelector(`#${CSS.escape(name?.getAttribute('for') ?? '')}`), 'Persona Demo');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Nueva solicitud');
    expect(view.querySelector('main [role="alert"]')?.textContent).toContain('el tuyo no se guardó');
    click(button(view, 'Revisar cambios'));
    expect(document.activeElement).toBe(view.querySelector('button[type="submit"]'));
  });
});
