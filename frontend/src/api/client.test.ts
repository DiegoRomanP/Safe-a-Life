import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError, createMutationIntent, errorMessage } from './client.js';

afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } });

describe('HTTP same-origin', () => {
  it('obtiene CSRF antes de escribir y usa cookie sin exponer tokens', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ token: 'csrf-sintetico' })).mockResolvedValueOnce(json({ id: 'hospital-1' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(apiRequest('/api/v1/superadmin/hospitals', { method: 'POST', body: { publicName: 'Demo' }, idempotencyKey: 'intent-1' })).resolves.toEqual({ id: 'hospital-1' });
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/auth/csrf-token');
    const init = fetcher.mock.calls[1][1] as RequestInit;
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-sintetico');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('intent-1');
  });
  it('login no requiere CSRF ni devuelve la respuesta completa', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ aal: 1 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(apiRequest('/api/v1/auth/sessions', { method: 'POST', body: {}, idempotencyKey: 'login-1' })).resolves.toEqual({ aal: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('no intenta la escritura si CSRF falla', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'nunca mostrar' } }), { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(apiRequest('/api/v1/superadmin/hospitals', { method: 'POST', idempotencyKey: 'a' })).rejects.toMatchObject({ status: 401, code: 'AUTHENTICATION_REQUIRED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('conserva códigos MFA/step-up y Retry-After con mensaje seguro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'STEP_UP_REQUIRED', message: 'token-privado' } }), { status: 403 })));
    const error = await apiRequest('/api/v1/auth/session').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403, code: 'STEP_UP_REQUIRED' });
    expect(errorMessage(error)).not.toContain('token-privado');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '60' } })));
    await expect(apiRequest('/api/v1/auth/session')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 60 });
  });
  it('rechaza respuestas inválidas, redirects y destinos externos sin repetir peticiones', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>error</html>'));
    vi.stubGlobal('fetch', fetcher);
    await expect(apiRequest('/api/v1/auth/session')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(apiRequest('https://evil.example/api/v1/test')).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  });
  it('la intención conserva clave ante reintento y cambia con datos o reset', () => {
    const intent = createMutationIntent();
    const first = intent.keyFor('/a', { name: 'Demo' });
    expect(intent.keyFor('/a', { name: 'Demo' })).toBe(first);
    expect(intent.keyFor('/a', { name: 'Otro' })).not.toBe(first);
    intent.reset();
    expect(intent.keyFor('/a', { name: 'Demo' })).not.toBe(first);
  });
});
