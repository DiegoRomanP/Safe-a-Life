// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAuthSession, logout } from '../../auth/session/session.js';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';
import { stubDonorApi, type DonorApiStub } from '../../../test/donorApi.js';

setupRender();
// El perfil es real: un backend en memoria responde sus tres operaciones.
let api: DonorApiStub;
beforeEach(() => { api = stubDonorApi(); });
// Un 401 deja la sesión «expirada» en el módulo: se vuelve a reposo (logout sin sesión no llama al backend).
afterEach(async () => { clearAuthSession(); await act(async () => { await logout(); }); });

function save(view: HTMLElement) {
  click(view.querySelector('#perfil-formulario button[type="submit"]'));
}

function inputByLabel(view: HTMLElement, label: string) {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent === label);
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`) as HTMLInputElement | null;
}

describe('DON-02 Mi perfil', () => {
  it('nombre, correo y grupo son de solo lectura', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Mi perfil');
    expect(inputByLabel(view, 'Nombre')?.readOnly).toBe(true);
    expect(inputByLabel(view, 'Correo')?.readOnly).toBe(true);
    expect(inputByLabel(view, 'Grupo declarado')?.value).toBe('A+');
  });

  it('la disponibilidad es un interruptor accesible', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    const toggle = view.querySelector('[role="switch"]');
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    click(toggle);
    await settle();
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(toggle?.textContent).toContain('No disponible');
  });

  it('valida la ubicación con hasta tres decimales y enfoca el error', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    const latitude = inputByLabel(view, 'Latitud');
    type(latitude, '-12.09123');
    save(view);
    await settle();
    expect(view.textContent).toContain('Ingresa la latitud con hasta tres decimales.');
    expect(document.activeElement).toBe(latitude);
  });

  it('guarda disponibilidad y ubicación y lo anuncia', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    click(view.querySelector('[role="switch"]'));
    await settle();
    type(inputByLabel(view, 'Longitud'), '-77.05');
    save(view);
    await settle();
    expect(view.querySelector('.live-slot')?.textContent).toContain('Cambios guardados');
    // Se guardó en el backend (PATCH con CSRF) y la vista volvió a leerlo.
    // La guarda del área y la página leen el perfil; tras guardar, ambas lo vuelven a leer.
    expect(api.requests).toEqual(['GET /donors/me/profile', 'GET /donors/me/profile', 'PATCH /donors/me/profile', 'GET /donors/me/profile', 'GET /donors/me/profile']);
    expect(api.profile).toMatchObject({ isAvailable: false, approximateLocation: { latitude: -12.091, longitude: -77.05 } });
  });

  it('un fallo al guardar no cambia la disponibilidad mostrada', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    api.writeStatus = 503;
    click(view.querySelector('[role="switch"]'));
    save(view);
    await settle();
    expect(view.querySelector('.live-slot')?.textContent).not.toContain('Cambios guardados');
    expect(view.textContent).toContain('No se guardó');
    expect(api.profile?.isAvailable).toBe(true);
  });

  it('un 422 (zona fuera de Lima) explica el rechazo en vez de un fallo de red', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    api.writeStatus = 422;
    save(view);
    await settle();
    expect(view.textContent).toContain('revisa que la ubicación aproximada esté dentro de Lima');
    expect(view.textContent).not.toContain('No pudimos conectar');
  });

  it('un 401 a mitad de uso cierra el área y lleva a /ingresar con aviso', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    api.writeStatus = 401;
    save(view);
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(view.textContent).toContain('Tu sesión terminó');
    expect(view.textContent).not.toContain(api.profile!.name);
  });

  it('ninguna vista del donante lleva el aviso «Datos de ejemplo»: todo es real', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    expect(view.textContent).not.toContain('Datos de ejemplo');
    click(view.querySelector('nav a[href="/donante/invitaciones"]'));
    await settle();
    expect(view.textContent).not.toContain('Datos de ejemplo');
  });

  it('sin perfil activo (404) lleva al onboarding', async () => {
    api.profile = null;
    const view = renderRoute('/donante/perfil');
    await settle();
    expect(view.querySelector('h1')?.textContent).toBe('Te damos la bienvenida');
  });

  it('marcarse no disponible invalida las invitaciones activas sin respuesta', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    click(view.querySelector('[role="switch"]'));
    await settle();
    save(view);
    await settle();
    click(view.querySelector('nav a[href="/donante/invitaciones"]'));
    await settle();
    // Quedan activas solo las ya respondidas (una confirmada en los datos demo).
    expect(view.querySelector('main')?.textContent).toContain('1 activa');
  });

  it('el aviso de guardado desaparece al volver a editar', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    save(view);
    await settle();
    expect(view.querySelector('.live-slot')?.textContent).toContain('Cambios guardados');
    click(view.querySelector('[role="switch"]'));
    await settle();
    expect(view.querySelector('.live-slot')?.textContent).toBe('');
  });

  it('el mapa y los campos de coordenadas se sincronizan en las dos direcciones', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    save(view);
    await settle();
    // En jsdom el contenedor no tiene tamaño: (0, 0) es el centro actual del mapa, el punto guardado.
    type(inputByLabel(view, 'Latitud'), '-12.2');
    expect(view.querySelector('.live-slot')?.textContent).toBe('');
    save(view);
    await settle();
    act(() => { view.querySelector('.leaflet-container')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 20 })); });
    expect(inputByLabel(view, 'Latitud')?.value).toMatch(/^-12\.20\d$/);
    expect(inputByLabel(view, 'Latitud')?.value).not.toBe('-12.2');
    expect(view.querySelector('.live-slot')?.textContent).toBe('');
  });

  it('los enlaces «Crear solicitud» tienen nombres distintos', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    const names = [...view.querySelectorAll('main a[href="/donante/solicitudes/nueva"]')].map((a) => a.textContent);
    expect(new Set(names).size).toBe(3);
  });
});
