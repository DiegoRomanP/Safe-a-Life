// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { click, settle, setupRender, type } from '../../../test/render.js';
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

describe('DON-01 Bienvenida y onboarding', () => {
  it('muestra los tres pasos y el formulario de perfil', async () => {
    const view = renderRoute('/donante/bienvenida');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Te damos la bienvenida');
    expect([...view.querySelectorAll('main ol > li h2')].map((h) => h.textContent)).toEqual([
      'Correo verificado',
      'Grupo declarado',
      'Ubicación aproximada',
    ]);
    expect(view.textContent).toContain('Ninguno determina elegibilidad médica.');
  });

  it('vacío: marca los cuatro campos obligatorios y enfoca el nombre', async () => {
    const view = renderRoute('/donante/bienvenida');
    await settle();
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(view.textContent).toContain('Ingresa tu nombre.');
    expect(view.textContent).toContain('Selecciona tu grupo declarado.');
    expect(view.textContent).toContain('Ingresa la latitud con hasta tres decimales.');
    expect(document.activeElement).toBe(control(view, 'Nombre'));
  });

  it('completo: actualiza el perfil, enfoca el resultado y ofrece ver invitaciones', async () => {
    const view = renderRoute('/donante/bienvenida');
    await settle();
    type(control(view, 'Nombre'), 'Persona Demo');
    choose(control(view, 'Grupo declarado'), 'O_NEG');
    type(control(view, 'Latitud'), '-12.05');
    type(control(view, 'Longitud'), '-77.04');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Perfil completo');
    expect(live?.contains(document.activeElement)).toBe(true);
    expect(view.textContent).toContain('O− · Declarado');
    click(view.querySelector('main a[href="/donante/perfil"], nav a[href="/donante/perfil"]'));
    await settle();
    expect((control(view, 'Nombre') as HTMLInputElement).value).toBe('Persona Demo');
  });
});
