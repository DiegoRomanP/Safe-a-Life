// @vitest-environment jsdom
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';
import { stubDonorApi, type DonorApiStub } from '../../../test/donorApi.js';
import { demoProfile } from '../demoData.js';

setupRender();
// El perfil es real: un backend en memoria responde sus tres operaciones; empieza sin perfil (aún sin onboarding).
let api: DonorApiStub;
beforeEach(() => { api = stubDonorApi(null); });

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
  it('muestra una pantalla única de enfoque: el formulario, sin navegación del área', async () => {
    const view = renderRoute('/donante/bienvenida');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Te damos la bienvenida');
    expect(view.querySelector('form')).not.toBeNull();
    expect(view.querySelector('nav[aria-label="Cuenta del donante"]')).toBeNull();
    expect([...view.querySelectorAll('button')].some((b) => b.textContent === 'Cerrar sesión')).toBe(true);
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

  it('completo: guarda el perfil en el backend y lleva a Invitaciones con la navegación completa', async () => {
    const view = renderRoute('/donante/bienvenida');
    await settle();
    type(control(view, 'Nombre'), 'Persona Demo');
    choose(control(view, 'Grupo declarado'), 'O_NEG');
    type(control(view, 'Latitud'), '-12.05');
    type(control(view, 'Longitud'), '-77.04');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    await settle();
    expect(api.requests).toContain('PUT /donors/me/onboarding-profile');
    expect(api.profile).toMatchObject({ name: 'Persona Demo', declaredBloodType: 'O_NEG', isAvailable: true, approximateLocation: { latitude: -12.05, longitude: -77.04 } });
    expect(view.querySelector('main h1')?.textContent).toBe('Mis invitaciones');
    expect(view.querySelector('nav[aria-label="Cuenta del donante"]')).not.toBeNull();
    expect(view.textContent).toContain('Perfil completo');
  });

  it('si el perfil ya estaba activo (409) sale de la pantalla de enfoque en vez de mostrar un conflicto', async () => {
    const view = renderRoute('/donante/bienvenida');
    await settle();
    // Otra pestaña lo completó entre la carga y el envío.
    api.profile = structuredClone(demoProfile);
    api.writeStatus = 409;
    type(control(view, 'Nombre'), 'Persona Demo');
    choose(control(view, 'Grupo declarado'), 'O_NEG');
    type(control(view, 'Latitud'), '-12.05');
    type(control(view, 'Longitud'), '-77.04');
    click(view.querySelector('button[type="submit"]'));
    await settle();
    await settle();
    expect(view.textContent).not.toContain('Otro cambio llegó antes');
    expect(view.querySelector('main h1')?.textContent).toBe('Mis invitaciones');
  });
});
