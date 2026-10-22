// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, setupRender } from '../../../test/render.js';
import { renderRoute } from '../../../test/renderRoute.js';

setupRender();

describe('DON-04 Historial de respuestas', () => {
  it('lista las respuestas con hospital y fecha en hora de Lima', () => {
    const view = renderRoute('/donante/historial');
    expect(view.querySelector('h1')?.textContent).toBe('Historial de respuestas');
    const items = [...view.querySelectorAll('ol > li')];
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('Intención de asistir confirmada');
    expect(items[0]?.textContent).toContain('Hospital Metropolitano Sur');
    expect(items[0]?.textContent).toContain('25 sep 2026, 10:32 · Lima, UTC−5');
    expect(view.textContent).toContain('no confirma asistencia ni donación');
  });

  it('una respuesta nueva aparece primero en el historial', () => {
    const view = renderRoute('/donante/invitaciones/18d4e5c2-3d4e-4f60-8b12-2c3d4e5f6a73');
    click([...view.querySelectorAll('button')].find((b) => b.textContent === 'No podré asistir') ?? null);
    click(view.querySelector('main a[href="/donante/historial"]'));
    const first = view.querySelector('ol > li');
    expect(first?.textContent).toContain('Indicaste que no podrás asistir');
    expect(first?.textContent).toContain('Instituto Regional Lima');
  });
});

describe('DON-05 Mis solicitudes', () => {
  it('muestra una tabla con encabezados de columna y de fila', () => {
    const view = renderRoute('/donante/solicitudes');
    expect(view.querySelector('h1')?.textContent).toBe('Mis solicitudes');
    const headers = [...view.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toEqual(['Solicitud', 'Tipo', 'Estado', 'Creada', 'Última actualización']);
    const first = view.querySelector('tbody tr');
    expect(first?.querySelector('th[scope="row"]')?.textContent).toBe('SOL-7F21');
    expect(first?.textContent).toContain('Corrección de grupo');
    expect(first?.textContent).toContain('Pendiente');
    expect(first?.textContent).toContain('22 sep 2026');
    expect(first?.querySelector('td:last-child')?.textContent).toBe('22 sep 2026, 10:14 · Lima, UTC−5');
  });

  it('describe el cambio de correo y la corrección de nombre', () => {
    const text = renderRoute('/donante/solicitudes').querySelector('tbody')?.textContent ?? '';
    expect(text).toContain('Cambio de correo');
    expect(text).toContain('Corrección de nombre');
  });
});
