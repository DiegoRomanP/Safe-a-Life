// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { DemoScenario } from '../../../lib/demoApi.js';
import { act } from 'react';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

const INVITATION = '/donante/invitaciones/7f21c3a0-1b2c-4d5e-8f90-0a1b2c3d4e51';

// Selector de escenario de desarrollo (en las pruebas import.meta.env.DEV es true).
async function scenario(view: HTMLElement, value: DemoScenario) {
  click(view.querySelector(`input[name="escenario-datos"][value="${value}"]`));
  await settle();
}

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

  it('el escenario «cargando» deja la vista en carga', async () => {
    const view = renderRoute('/donante/historial');
    await settle();
    await scenario(view, 'cargando');
    expect(view.querySelector('main [role="status"]')?.textContent).toContain('Cargando tu historial…');
    expect(view.querySelector('ol')).toBeNull();
  });

  it('un error de red ofrece reintentar y se recupera al volver la conexión', async () => {
    const view = renderRoute('/donante/solicitudes');
    await settle();
    await scenario(view, 'error');
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
    await scenario(view, 'normal');
    expect(view.querySelector('tbody tr th')?.textContent).toBe('SOL-7F21');
  });

  it('sin permiso muestra el mensaje neutro y ningún dato', async () => {
    const view = renderRoute(INVITATION);
    await settle();
    await scenario(view, 'sin_permiso');
    expect(view.textContent).toContain('No pudimos abrir este recurso');
    expect(view.textContent).toContain('Por seguridad no mostramos más información.');
    expect(view.textContent).not.toContain('Hospital Nacional Central');
    expect(view.textContent).not.toContain('Sede San Borja');
    expect(view.querySelector('main a[href="/donante/invitaciones"]')).not.toBeNull();
  });
});

describe('Escrituras del área del donante', () => {
  it('un conflicto al responder avisa que no se guardó y no cambia la respuesta', async () => {
    const view = renderRoute(INVITATION);
    await settle();
    await scenario(view, 'conflicto');
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
    await scenario(view, 'normal');
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
    click(button(view, 'Confirmar intención de asistir'));
    await tick();
    // La escritura terminó y la invitación se está revalidando.
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Confirmaste tu intención de asistir.');
    expect(button(view, 'No podré asistir')?.getAttribute('aria-disabled')).toBe('true');
    click(button(view, 'No podré asistir'));
    await settle();
    expect(view.textContent).toContain('Tu respuesta: Intención confirmada');
    expect(button(view, 'No podré asistir')?.getAttribute('aria-disabled')).toBe('false');
    click(view.querySelector('main a[href="/donante/historial"]'));
    await settle();
    expect(view.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('una invitación inexistente y una sin permiso se ven igual', async () => {
    const missing = renderRoute('/donante/invitaciones/no-existe');
    await settle();
    const missingText = missing.querySelector('main')?.textContent;
    await scenario(missing, 'sin_permiso');
    expect(missing.querySelector('main')?.textContent).toBe(missingText);
  });

  it('un conflicto al guardar el perfil no marca los cambios como guardados', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    await scenario(view, 'conflicto');
    click(view.querySelector('[role="switch"]'));
    const submit = view.querySelector('button[form="perfil-formulario"]');
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
    await scenario(view, 'conflicto');
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
