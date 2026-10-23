import { afterEach, describe, expect, it, vi } from 'vitest';
import { logout } from './auth.js';

const failure = (status: number, code: string) => new Response(JSON.stringify({ error: { code } }), { status });
afterEach(() => { vi.unstubAllGlobals(); });
describe('cierre de sesión con cookies obsoletas', () => {
  it('CSRF 401 alcanza DELETE y considera terminado solo su 401 de limpieza', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(failure(401, 'AUTHENTICATION_REQUIRED')).mockResolvedValueOnce(failure(401, 'AUTHENTICATION_REQUIRED'));
    vi.stubGlobal('fetch', fetcher);
    await expect(logout('intento-cierre')).resolves.toBeUndefined();
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual(['/api/v1/auth/csrf-token', '/api/v1/auth/sessions/current']);
    expect(fetcher.mock.calls[1][1].method).toBe('DELETE');
    expect(new Headers(fetcher.mock.calls[1][1].headers).get('Idempotency-Key')).toBe('intento-cierre');
  });
  it.each([403, 500])('no simula cierre si DELETE devuelve %s tras CSRF 401', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(failure(401, 'AUTHENTICATION_REQUIRED')).mockResolvedValueOnce(failure(status, 'REQUEST_FAILED')));
    await expect(logout('intento-cierre')).rejects.toMatchObject({ status });
  });
  it('no simula cierre ante desconexión después de CSRF 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(failure(401, 'AUTHENTICATION_REQUIRED')).mockRejectedValueOnce(new TypeError('desconectado')));
    await expect(logout('intento-cierre')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
  it('CSRF 403 impide incluso DELETE de cierre', async () => {
    const fetcher = vi.fn().mockResolvedValue(failure(403, 'ACCESS_DENIED'));
    vi.stubGlobal('fetch', fetcher);
    await expect(logout('intento-cierre')).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
