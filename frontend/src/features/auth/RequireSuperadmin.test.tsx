// @vitest-environment jsdom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { getSession } from '../../api/auth.js';
import { ApiError } from '../../api/client.js';
import { render, setupRender } from '../../test/render.js';
import { RequireSuperadmin } from './RequireSuperadmin.js';

vi.mock('../../api/auth.js', async (original) => ({ ...await original<typeof import('../../api/auth.js')>(), getSession: vi.fn() }));
setupRender();
beforeEach(() => { vi.mocked(getSession).mockReset(); });
async function view() {
  let container!: HTMLElement;
  await act(async () => {
    container = render(<RouterProvider router={createMemoryRouter([{ path: '/superadmin/tareas', element: <RequireSuperadmin><p>Datos administrativos</p></RequireSuperadmin> }, { path: '/ingresar', element: <p>Ingreso</p> }, { path: '/verificar-identidad', element: <p>Segundo factor</p> }], { initialEntries: ['/superadmin/tareas'] })} />);
    await Promise.resolve();
  });
  return container;
}
describe('guard superadmin', () => {
  it('sin sesión no monta los datos privados', async () => {
    vi.mocked(getSession).mockRejectedValue(new ApiError(401, 'AUTHENTICATION_REQUIRED'));
    expect((await view()).textContent).toBe('Ingreso');
  });
  it('otro rol AAL2 no accede', async () => {
    vi.mocked(getSession).mockResolvedValue({ actor: { role: 'donante', displayName: 'D' }, aal: 2, mfaRequired: false });
    const container = await view();
    expect(container.textContent).toContain('Permiso insuficiente');
    expect(container.textContent).not.toContain('Datos administrativos');
  });
  it('superadmin AAL1 requiere segundo factor', async () => {
    vi.mocked(getSession).mockResolvedValue({ actor: { role: 'superadmin', displayName: 'SA' }, aal: 1, mfaRequired: true });
    expect((await view()).textContent).toBe('Segundo factor');
  });
  it('solo monta superadmin AAL2 confirmado por servidor', async () => {
    vi.mocked(getSession).mockResolvedValue({ actor: { role: 'superadmin', displayName: 'SA' }, aal: 2, mfaRequired: false });
    expect((await view()).textContent).toBe('Datos administrativos');
  });
  it('fallo de red no se confunde con ausencia de sesión', async () => {
    vi.mocked(getSession).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'));
    const container = await view();
    expect(container.textContent).toContain('No hay conexión con el servidor');
    expect(container.textContent).not.toContain('Datos administrativos');
  });
});

