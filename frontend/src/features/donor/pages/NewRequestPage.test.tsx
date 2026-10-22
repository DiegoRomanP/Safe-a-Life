// @vitest-environment jsdom
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from '../../../app/routes.js';
import { click, render, setupRender, type } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

function control(view: HTMLElement, label: string) {
  const element = [...view.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  return view.querySelector(`#${CSS.escape(element?.getAttribute('for') ?? '')}`);
}

const submit = (view: HTMLElement) => click(view.querySelector('button[type="submit"]'));

describe('DON-05 Nueva solicitud', () => {
  it('ofrece los tres tipos de Penpot como opciones', () => {
    const view = renderRoute('/donante/solicitudes/nueva');
    expect(view.querySelector('h1')?.textContent).toBe('Nueva solicitud');
    const options = [...view.querySelectorAll('input[name="tipo-solicitud"]')] as HTMLInputElement[];
    expect(options.map((input) => input.value)).toEqual(['correccion', 'correo', 'eliminacion']);
    expect(options[0]?.checked).toBe(true);
  });

  it('una corrección sin cambios pide al menos un valor nuevo', () => {
    const view = renderRoute('/donante/solicitudes/nueva');
    submit(view);
    expect(view.textContent).toContain('Indica un nombre o un grupo nuevo.');
    expect(document.activeElement).toBe(control(view, 'Nombre nuevo'));
  });

  it('el cambio de correo valida el correo nuevo', () => {
    const view = renderRoute('/donante/solicitudes/nueva');
    click(view.querySelector('input[value="correo"]'));
    type(control(view, 'Correo nuevo'), 'sin-arroba');
    submit(view);
    expect(view.textContent).toContain('Ingresa un correo válido.');
  });

  it('la eliminación exige confirmar antes de enviar', () => {
    const view = renderRoute('/donante/solicitudes/nueva');
    click(view.querySelector('input[value="eliminacion"]'));
    submit(view);
    const checkbox = view.querySelector('input[type="checkbox"]');
    expect(checkbox?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(checkbox);
  });

  it('al enviar vuelve a Mis solicitudes, enfoca el aviso y lista la nueva solicitud primero', () => {
    const view = renderRoute('/donante/solicitudes/nueva');
    type(control(view, 'Nombre nuevo'), 'Persona Demo');
    submit(view);
    expect(view.querySelector('h1')?.textContent).toBe('Mis solicitudes');
    const live = view.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toMatch(/Solicitud SOL-[0-9A-F]{4} enviada/);
    expect(live?.contains(document.activeElement)).toBe(true);
    const first = view.querySelector('tbody tr');
    expect(first?.textContent).toContain('Corrección de nombre');
    expect(first?.textContent).toContain('Pendiente');
  });

  it('un tipo desconocido en el estado de navegación vuelve a la corrección', () => {
    const router = createMemoryRouter(routes, {
      initialEntries: [{ pathname: '/donante/solicitudes/nueva', state: { kind: 'otro' } }],
    });
    const view = render(<RouterProvider router={router} />);
    expect((view.querySelector('input[value="correccion"]') as HTMLInputElement).checked).toBe(true);
  });

  it('el perfil abre la solicitud con el tipo ya elegido', () => {
    const view = renderRoute('/donante/perfil');
    const link = [...view.querySelectorAll('main a')].find((a) => a.textContent?.includes('eliminar mis datos'));
    click(link ?? null);
    expect((view.querySelector('input[value="eliminacion"]') as HTMLInputElement).checked).toBe(true);
  });
});
