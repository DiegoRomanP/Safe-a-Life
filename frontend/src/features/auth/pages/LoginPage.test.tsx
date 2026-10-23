// @vitest-environment jsdom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { login } from '../../../api/auth.js';
import { ApiError } from '../../../api/client.js';
import { click, render, setupRender, type } from '../../../test/render.js';
import { LoginPage } from './LoginPage.js';

vi.mock('../../../api/auth.js', async (original) => ({ ...await original<typeof import('../../../api/auth.js')>(), login: vi.fn() }));
setupRender();
beforeEach(() => { vi.mocked(login).mockReset(); });
function view() {
  return render(<RouterProvider router={createMemoryRouter([{ path: '/ingresar', element: <LoginPage /> }, { path: '/verificar-identidad', element: <p>MFA requerido</p> }, { path: '/superadmin/tareas', element: <p>Área administrativa</p> }], { initialEntries: ['/ingresar'] })} />);
}
function fill(container: HTMLElement) {
  const [email, password] = [...container.querySelectorAll('input')];
  type(email, 'superadmin@example.test'); type(password, 'clave-sintetica');
}
describe('AUTH-01 conectado', () => {
  it('conserva título, aviso académico y registro sin acceso de prueba', () => {
    const container = view();
    expect(container.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect(container.textContent).toContain('No ingreses datos reales');
    expect(container.querySelector('a[href="/registro"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Entrar como donante de prueba');
  });
  it('envía credenciales una vez y dirige al segundo factor solicitado por servidor', async () => {
    vi.mocked(login).mockResolvedValue({ actor: { role: 'superadmin', displayName: 'SA' }, aal: 1, mfaRequired: true, mfaChallengeId: 'reto' });
    const container = view(); fill(container);
    await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    expect(login).toHaveBeenCalledTimes(1);
    expect(vi.mocked(login).mock.calls[0][0]).toEqual({ email: 'superadmin@example.test', password: 'clave-sintetica' });
    expect(container.textContent).toBe('MFA requerido');
  });
  it('un error de red no crea sesión ni redirige y permite reintentar', async () => {
    vi.mocked(login).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'));
    const container = view(); fill(container);
    await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('No hay conexión con el servidor');
    expect(container.querySelector('h1')?.textContent).toBe('Iniciar sesión');
    expect((container.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('');
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });
});
