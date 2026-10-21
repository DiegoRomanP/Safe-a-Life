// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender, type } from '../../../test/render.js';
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
  it('nombre, correo y grupo son de solo lectura', () => {
    const view = renderRoute('/donante/perfil');
    expect(view.querySelector('h1')?.textContent).toBe('Mi perfil');
    expect(inputByLabel(view, 'Nombre')?.readOnly).toBe(true);
    expect(inputByLabel(view, 'Correo')?.readOnly).toBe(true);
    expect(inputByLabel(view, 'Grupo declarado')?.value).toBe('A+');
  });

  it('la disponibilidad es un interruptor accesible', () => {
    const view = renderRoute('/donante/perfil');
    const toggle = view.querySelector('[role="switch"]');
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    click(toggle);
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(toggle?.textContent).toContain('No disponible');
  });

  it('valida la ubicación con hasta tres decimales y enfoca el error', () => {
    const view = renderRoute('/donante/perfil');
    const latitude = inputByLabel(view, 'Latitud');
    type(latitude, '-12.09123');
    save(view);
    expect(view.textContent).toContain('Ingresa la latitud con hasta tres decimales.');
    expect(document.activeElement).toBe(latitude);
  });

  it('guarda disponibilidad y ubicación y lo anuncia', () => {
    const view = renderRoute('/donante/perfil');
    click(view.querySelector('[role="switch"]'));
    type(inputByLabel(view, 'Longitud'), '-77.05');
    save(view);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Cambios guardados');
  });

  it('el aviso de guardado desaparece al volver a editar', () => {
    const view = renderRoute('/donante/perfil');
    save(view);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain('Cambios guardados');
    click(view.querySelector('[role="switch"]'));
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe('');
  });

  it('los enlaces «Crear solicitud» tienen nombres distintos', () => {
    const view = renderRoute('/donante/perfil');
    const names = [...view.querySelectorAll('main a[href="/donante/solicitudes"]')].map((a) => a.textContent);
    expect(new Set(names).size).toBe(3);
  });
});
