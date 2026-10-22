// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, settle, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

function save(view: HTMLElement) {
  click(view.querySelector('button[form="perfil-formulario"]'));
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
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Cambios guardados');
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
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Cambios guardados');
    click(view.querySelector('[role="switch"]'));
    await settle();
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe('');
  });

  it('los enlaces «Crear solicitud» tienen nombres distintos', async () => {
    const view = renderRoute('/donante/perfil');
    await settle();
    const names = [...view.querySelectorAll('main a[href="/donante/solicitudes/nueva"]')].map((a) => a.textContent);
    expect(new Set(names).size).toBe(3);
  });
});
