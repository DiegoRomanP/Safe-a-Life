// @vitest-environment jsdom
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';
import { stubDonorApi, type DonorApiStub } from '../../../test/donorApi.js';

setupRender();
// El perfil es real: un backend en memoria responde sus tres operaciones.
let api: DonorApiStub;
beforeEach(() => { api = stubDonorApi(); });

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

  it('completo: guarda el perfil en el backend, enfoca el resultado y lleva al perfil', async () => {
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
    expect(api.requests).toContain('PUT /donors/me/onboarding-profile');
    expect(api.profile).toMatchObject({ name: 'Persona Demo', declaredBloodType: 'O_NEG', isAvailable: true, approximateLocation: { latitude: -12.05, longitude: -77.04 } });
    expect(live?.contains(document.activeElement)).toBe(true);
    expect(view.textContent).toContain('O− · Declarado');
    click(live?.querySelector('a[href="/donante/perfil"]') ?? null);
    await settle();
    expect((control(view, 'Nombre') as HTMLInputElement).value).toBe('Persona Demo');
  });

  it('si el perfil ya está activo (409) ofrece ir al perfil en vez de un conflicto', async () => {
    api.writeStatus = 409;
    const view = renderRoute('/donante/bienvenida');
    await settle();
    type(control(view, 'Nombre'), 'Persona Demo');
    choose(control(view, 'Grupo declarado'), 'O_NEG');
    type(control(view, 'Latitud'), '-12.05');
    type(control(view, 'Longitud'), '-77.04');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    expect(view.textContent).toContain('Tu perfil ya está completo');
    expect(view.textContent).not.toContain('Otro cambio llegó antes');
    expect(view.querySelector('main a[href="/donante/perfil"]')).not.toBeNull();
  });
});
