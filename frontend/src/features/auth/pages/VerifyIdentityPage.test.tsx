// @vitest-environment jsdom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { clearPendingMfaChallenge, enrollMfa, getSession, pendingMfaChallenge, verifyMfa, verifyStepUp } from '../../../api/auth.js';
import { ApiError } from '../../../api/client.js';
import { click, render, setupRender, type } from '../../../test/render.js';
import { VerifyIdentityPage } from './VerifyIdentityPage.js';

vi.mock('../../../api/auth.js', async (original) => ({ ...await original<typeof import('../../../api/auth.js')>(), clearPendingMfaChallenge: vi.fn(), enrollMfa: vi.fn(), getSession: vi.fn(), pendingMfaChallenge: vi.fn(), verifyMfa: vi.fn(), verifyStepUp: vi.fn() }));
setupRender();
const actor = { role: 'superadmin' as const, displayName: 'SA' };
beforeEach(() => {
  vi.mocked(getSession).mockReset().mockResolvedValue({ actor, aal: 1, mfaRequired: true });
  vi.mocked(pendingMfaChallenge).mockReset().mockReturnValue('reto-1');
  vi.mocked(clearPendingMfaChallenge).mockReset();
  vi.mocked(enrollMfa).mockReset(); vi.mocked(verifyMfa).mockReset(); vi.mocked(verifyStepUp).mockReset();
});
async function view(path = '/verificar-identidad') {
  let container!: HTMLElement;
  await act(async () => {
    container = render(<RouterProvider router={createMemoryRouter([{ path: '/verificar-identidad', element: <VerifyIdentityPage /> }, { path: '/superadmin/tareas', element: <p>Área administrativa</p> }, { path: '/ingresar', element: <p>Ingreso requerido</p> }], { initialEntries: [path] })} />);
    await Promise.resolve();
  });
  return container;
}
describe('AUTH-05 conectado', () => {
  it.each(['12345', '12a456', '123456789'])('rechaza %s antes de llamar al backend y enfoca campo', async (code) => {
    const container = await view();
    type(container.querySelector('input'), code);
    click(container.querySelector('button[type="submit"]'));
    expect(container.textContent).toContain('Ingresa el código de 6 a 8 dígitos');
    expect(verifyMfa).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(container.querySelector('input'));
  });
  it('verifica reto recibido por login y limpia código al enviar', async () => {
    vi.mocked(verifyMfa).mockResolvedValue({ actor, aal: 2, mfaRequired: false });
    const container = await view();
    type(container.querySelector('input'), '123456');
    await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    expect(verifyMfa).toHaveBeenCalledWith('reto-1', '123456', expect.any(String));
    expect(container.textContent).toBe('Área administrativa');
  });
  it('un código rechazado no habilita área ni simula verificación', async () => {
    vi.mocked(verifyMfa).mockRejectedValue(new ApiError(401, 'AUTHENTICATION_REQUIRED'));
    const container = await view(); type(container.querySelector('input'), '123456');
    await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    expect(container.textContent).toContain('No pudimos verificar');
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(container.textContent).not.toContain('Área administrativa');
  });
  it('al recargar sin reto ofrece reiniciar ingreso, sin inventarlo', async () => {
    vi.mocked(pendingMfaChallenge).mockReturnValue(undefined);
    const container = await view();
    expect(container.textContent).toContain('vuelve a ingresar para obtener un reto nuevo');
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(verifyMfa).not.toHaveBeenCalled();
  });
  it('step-up usa operación específica y requiere sesión AAL2', async () => {
    vi.mocked(getSession).mockResolvedValue({ actor, aal: 2, mfaRequired: false });
    vi.mocked(verifyStepUp).mockResolvedValue({ verifiedUntil: '2026-10-22T13:00:00Z' });
    const container = await view('/verificar-identidad?modo=reforzar');
    type(container.querySelector('input'), '123456');
    await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    expect(verifyStepUp).toHaveBeenCalledWith('123456', expect.any(String));
    expect(verifyMfa).not.toHaveBeenCalled();
    expect(container.textContent).toBe('Área administrativa');
  });
  it('reintento de alta después de red usa la misma intención y no otra clave', async () => {
    vi.mocked(pendingMfaChallenge).mockReturnValue(undefined);
    vi.mocked(enrollMfa).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'));
    const container = await view();
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Configurar autenticador')!;
    await act(async () => { click(button); await Promise.resolve(); });
    await act(async () => { click(button); await Promise.resolve(); });
    expect(enrollMfa).toHaveBeenCalledTimes(2);
    expect(vi.mocked(enrollMfa).mock.calls[0][0]).toBe(vi.mocked(enrollMfa).mock.calls[1][0]);
  });
  it('reintentar mismo código conserva clave; un código nuevo crea otra intención', async () => {
    vi.mocked(verifyMfa).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR'));
    const container = await view();
    for (const code of ['123456', '123456', '654321']) {
      type(container.querySelector('input'), code);
      await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    }
    const calls = vi.mocked(verifyMfa).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][2]).toBe(calls[1][2]);
    expect(calls[1][2]).not.toBe(calls[2][2]);
  });
  it.each(['NETWORK_ERROR', 'INVALID_RESPONSE'])('recupera MFA con sesión AAL2 confirmada después de %s', async (code) => {
    vi.mocked(getSession).mockResolvedValueOnce({ actor, aal: 1, mfaRequired: true }).mockResolvedValueOnce({ actor, aal: 2, mfaRequired: false });
    vi.mocked(verifyMfa).mockRejectedValue(new ApiError(code === 'NETWORK_ERROR' ? 0 : 502, code));
    const container = await view(); type(container.querySelector('input'), '123456');
    await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('Área administrativa');
  });
  it('MFA sin confirmación y replay consumido muestra recuperación, nunca acceso falso', async () => {
    vi.mocked(verifyMfa).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR')).mockRejectedValueOnce(new ApiError(409, 'STATE_CONFLICT'));
    const container = await view();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      type(container.querySelector('input'), '123456');
      await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    }
    expect(container.textContent).not.toBe('Área administrativa');
    expect(container.textContent).toContain('Este intento ya no puede reutilizarse');
    expect(container.querySelector('a[href="/ingresar"]')?.textContent).toBe('Volver a ingresar');
    expect(vi.mocked(verifyMfa).mock.calls[0][2]).toBe(vi.mocked(verifyMfa).mock.calls[1][2]);
  });
  it('step-up incierto no se confirma con AAL2; pide otro código para una intención nueva', async () => {
    vi.mocked(getSession).mockResolvedValue({ actor, aal: 2, mfaRequired: false });
    vi.mocked(verifyStepUp).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR')).mockResolvedValueOnce({ verifiedUntil: '2026-10-22T14:00:00Z' });
    const container = await view('/verificar-identidad?modo=reforzar');
    type(container.querySelector('input'), '123456');
    await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    expect(container.textContent).toContain('Espera el siguiente código');
    expect(container.textContent).not.toBe('Área administrativa');
    expect(getSession).toHaveBeenCalledTimes(1);
    type(container.querySelector('input'), '654321');
    await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    expect(container.textContent).toBe('Área administrativa');
    expect(vi.mocked(verifyStepUp).mock.calls[0][1]).not.toBe(vi.mocked(verifyStepUp).mock.calls[1][1]);
  });
  it('alta incierta con replay consumido permite reinicio explícito de factor pendiente', async () => {
    vi.mocked(pendingMfaChallenge).mockReturnValue(undefined);
    vi.mocked(enrollMfa).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR')).mockRejectedValueOnce(new ApiError(409, 'STATE_CONFLICT')).mockResolvedValueOnce({ factorId: 'factor-nuevo', challengeId: 'reto-nuevo', otpauthUri: 'otpauth://totp/SaveALife?secret=SINTETICO' });
    const container = await view();
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Configurar autenticador')!;
    await act(async () => { click(button); await Promise.resolve(); });
    expect(container.textContent).toContain('descartará factores pendientes sin verificar');
    await act(async () => { click(button); await Promise.resolve(); });
    expect(container.textContent).not.toContain('URI de configuración');
    const restart = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Reiniciar configuración pendiente')!;
    await act(async () => { click(restart); await Promise.resolve(); });
    expect(container.textContent).toContain('URI de configuración');
    const calls = vi.mocked(enrollMfa).mock.calls;
    expect(calls[0][0]).toBe(calls[1][0]);
    expect(calls[1][0]).not.toBe(calls[2][0]);
  });
  it('muestra QR local y clave manual solo tras recibir la inscripción pendiente', async () => {
    vi.mocked(pendingMfaChallenge).mockReturnValue(undefined);
    vi.mocked(enrollMfa).mockResolvedValue({ factorId: 'factor-nuevo', challengeId: 'reto-nuevo', otpauthUri: 'otpauth://totp/SaveALife?secret=JBSWY3DPEHPK3PXP&issuer=SaveALife' });
    const container = await view();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    const configure = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Configurar autenticador')!;
    await act(async () => { click(configure); await Promise.resolve(); });
    const qr = container.querySelector('svg[role="img"]');
    expect(qr?.getAttribute('aria-label')).toBe('Código QR para configurar tu autenticador');
    expect(qr?.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(qr?.getAttribute('width')).toBe('224');
    expect(container.querySelector('img')).toBeNull();
    expect((container.querySelector('#mfa-manual-key') as HTMLInputElement).value).toBe('JBSWY3DPEHPK3PXP');
    expect((container.querySelector('#mfa-enrollment-uri') as HTMLInputElement).value).toBe('otpauth://totp/SaveALife?secret=JBSWY3DPEHPK3PXP&issuer=SaveALife');
    expect(verifyMfa).not.toHaveBeenCalled();
  });
  it('un factor configurado no ofrece otro QR ni reinicia la inscripción', async () => {
    const container = await view();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.textContent).toContain('Usa el autenticador que ya configuraste');
    expect(container.textContent).not.toContain('Configurar autenticador');
    expect(enrollMfa).not.toHaveBeenCalled();
  });
  it('no muestra QR ni clave cuando la inscripción falla', async () => {
    vi.mocked(pendingMfaChallenge).mockReturnValue(undefined);
    vi.mocked(enrollMfa).mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE'));
    const container = await view();
    const configure = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Configurar autenticador')!;
    await act(async () => { click(configure); await Promise.resolve(); });
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.querySelector('#mfa-manual-key')).toBeNull();
    expect(container.textContent).toContain('No pudimos verificar');
  });
  it('retira el QR y la clave al finalizar la verificación', async () => {
    vi.mocked(pendingMfaChallenge).mockReturnValue(undefined);
    vi.mocked(enrollMfa).mockResolvedValue({ factorId: 'factor-nuevo', challengeId: 'reto-nuevo', otpauthUri: 'otpauth://totp/SaveALife?secret=JBSWY3DPEHPK3PXP' });
    vi.mocked(verifyMfa).mockResolvedValue({ actor, aal: 2, mfaRequired: false });
    const container = await view();
    const configure = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Configurar autenticador')!;
    await act(async () => { click(configure); await Promise.resolve(); });
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
    type(container.querySelector('input[autocomplete="one-time-code"]'), '123456');
    await act(async () => { click(container.querySelector('button[type="submit"]')); await Promise.resolve(); });
    expect(container.textContent).toBe('Área administrativa');
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.textContent).not.toContain('JBSWY3DPEHPK3PXP');
  });
  it('no ofrece inscripción para un donante', async () => {
    vi.mocked(getSession).mockResolvedValue({ actor: { role: 'donante', displayName: 'Demo' }, aal: 1, mfaRequired: false });
    const container = await view();
    expect(container.textContent).toContain('Acceso restringido');
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.textContent).not.toContain('Configurar autenticador');
    expect(enrollMfa).not.toHaveBeenCalled();
  });
  it('cancelar la inscripción retira el QR y los secretos de la pantalla', async () => {
    vi.mocked(pendingMfaChallenge).mockReturnValue(undefined);
    vi.mocked(enrollMfa).mockResolvedValue({ factorId: 'factor-nuevo', challengeId: 'reto-nuevo', otpauthUri: 'otpauth://totp/SaveALife?secret=JBSWY3DPEHPK3PXP' });
    const container = await view();
    const configure = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Configurar autenticador')!;
    await act(async () => { click(configure); await Promise.resolve(); });
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
    await act(async () => { click(container.querySelector('a[href="/ingresar"]')); await Promise.resolve(); });
    expect(container.textContent).toBe('Ingreso requerido');
    expect(clearPendingMfaChallenge).toHaveBeenCalled();
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(container.querySelector('#mfa-manual-key')).toBeNull();
    expect(container.textContent).not.toContain('JBSWY3DPEHPK3PXP');
  });
  it('una sesión anónima vuelve al ingreso sin ofrecer inscripción ni QR', async () => {
    vi.mocked(getSession).mockRejectedValue(new ApiError(401, 'AUTHENTICATION_REQUIRED'));
    const container = await view();
    expect(container.textContent).toBe('Ingreso requerido');
    expect(container.querySelector('svg[role="img"]')).toBeNull();
    expect(enrollMfa).not.toHaveBeenCalled();
  });
});
