import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSession, login, pendingMfaChallenge, safeAdminReturn, verifyMfa, mfaSetupSecret, enrollMfa, clearPendingMfaChallenge } from './auth.js';

const actor = { role: 'superadmin', displayName: 'Cuenta de prueba' };
const json = (data: unknown) => new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('sesión de backend', () => {
  it.each([{ actor, aal: '1', mfaRequired: true }, { actor: { role: 'worker', displayName: 'Interno' }, aal: 2, mfaRequired: false }, { actor, aal: 2, mfaRequired: 'false' }])('rechaza forma o rol no público %j', async (value) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(value)));
    await expect(getSession()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('solo devuelve campos públicos, nunca tokens adicionales de una respuesta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ actor, aal: 2, mfaRequired: false, access_token: 'no-exponer' })));
    expect(await getSession()).toEqual({ actor, aal: 2, mfaRequired: false });
  });
  it('conserva reto solo en memoria para verificar y lo borra al completar MFA', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ actor, aal: 1, mfaRequired: true, mfaChallengeId: 'reto-1' })).mockResolvedValueOnce(json({ token: 'csrf' })).mockResolvedValueOnce(json({ actor, aal: 2, mfaRequired: false }));
    vi.stubGlobal('fetch', fetcher);
    await login({ email: 'superadmin@example.test', password: 'sintetica' }, 'login-1');
    expect(pendingMfaChallenge()).toBe('reto-1');
    await verifyMfa('reto-1', '123456', 'verify-1');
    expect(pendingMfaChallenge()).toBeUndefined();
  });
  it.each(['https://evil.example', '//evil.example', '/superadmin/../donante', '/donante', '/superadmin/tareas?token=secret'])('evita redirección arbitraria %s', (path) => {
    expect(safeAdminReturn(path)).toBe('/superadmin/tareas');
  });
  it('permite volver a la solicitud administrativa sin query ni fragmentos', () => {
    expect(safeAdminReturn('/superadmin/solicitudes/id-1')).toBe('/superadmin/solicitudes/id-1');
  });
});

describe('configuración privada de TOTP', () => {
  it('extrae la clave manual de una configuración TOTP válida', () => {
    expect(mfaSetupSecret('otpauth://totp/Save%20a%20Life?secret=JBSWY3DPEHPK3PXP&issuer=Save%20a%20Life')).toBe('JBSWY3DPEHPK3PXP');
  });
  it.each([
    'https://example.test/qr?secret=JBSWY3DPEHPK3PXP',
    'otpauth://hotp/Demo?secret=JBSWY3DPEHPK3PXP',
    'otpauth://totp/Demo?secret=no-valido',
    'otpauth://totp/Demo?secret=JBSWY3DPEHPK3PXP&secret=JBSWY3DPEHPK3PXP',
    'otpauth://totp/Demo?secret=JBSWY3DPEHPK3PXP&digits=8',
    'otpauth://totp/Demo?secret=JBSWY3DPEHPK3PXP&period=60',
    'otpauth://totp/Demo?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256',
  ])('rechaza un formato de inscripción incompatible', (uri) => {
    expect(() => mfaSetupSecret(uri)).toThrow('INVALID_RESPONSE');
  });
});

it('una inscripción tardía no repone un reto después de cancelar', async () => {
  let finish!: (response: Response) => void;
  const deferred = new Promise<Response>((resolve) => { finish = resolve; });
  const fetcher = vi.fn().mockResolvedValueOnce(json({ token: 'csrf' })).mockReturnValueOnce(deferred);
  vi.stubGlobal('fetch', fetcher);
  const enrollment = enrollMfa('intencion-qr');
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  clearPendingMfaChallenge();
  finish(json({ factorId: 'factor-prueba', challengeId: 'reto-prueba', otpauthUri: 'otpauth://totp/Demo?secret=JBSWY3DPEHPK3PXP' }));
  await enrollment;
  expect(pendingMfaChallenge()).toBeUndefined();
});
