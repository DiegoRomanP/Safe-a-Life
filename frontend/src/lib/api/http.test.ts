import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../demoApi.js';
import { apiRequest } from './http.js';

type Call = { url: string; init: RequestInit };

function stubFetch(reply: () => Promise<unknown> | unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit) => {
    calls.push({ url: String(input), init });
    return reply();
  });
  return calls;
}

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  it('GET same-origin, sin caché ni referrer, sin Idempotency-Key ni CSRF', async () => {
    const calls = stubFetch(() => json({ data: { ok: true } }));

    expect(await apiRequest('GET', '/donors/me/profile')).toEqual({ data: { ok: true } });

    expect(calls[0]!.url).toBe('/api/v1/donors/me/profile');
    expect(calls[0]!.init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' });
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('idempotency-key')).toBeNull();
    expect(headers.get('x-csrf-token')).toBeNull();
  });

  it('una mutación lleva JSON, Idempotency-Key nueva y el token CSRF', async () => {
    const calls = stubFetch(() => json({ data: {} }));

    await apiRequest('PATCH', '/donors/me/profile', { body: { isAvailable: false }, csrfToken: 't'.repeat(40) });
    await apiRequest('PATCH', '/donors/me/profile', { body: { isAvailable: true }, csrfToken: 't'.repeat(40) });

    const [first, second] = calls.map((call) => new Headers(call.init.headers));
    expect(first!.get('content-type')).toBe('application/json');
    expect(first!.get('x-csrf-token')).toBe('t'.repeat(40));
    expect(first!.get('idempotency-key')!.length).toBeGreaterThanOrEqual(16);
    expect(first!.get('idempotency-key')).not.toBe(second!.get('idempotency-key'));
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ isAvailable: false });
  });

  it.each([
    [403, 'sin_permiso'], [404, 'sin_permiso'], [409, 'conflicto'], [400, 'validacion'], [401, 'red'], [410, 'red'], [422, 'validacion'], [429, 'red'], [503, 'red'],
  ] as const)('el estado %i se traduce a ApiError %s con status y code', async (status, kind) => {
    stubFetch(() => json({ error: { code: 'CODIGO', message: 'x' } }, status));

    const error = await apiRequest('POST', '/x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind, status, code: 'CODIGO' });
  });

  it('un fallo de red es ApiError red sin status', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    await expect(apiRequest('GET', '/x')).rejects.toMatchObject({ kind: 'red', status: undefined });
  });

  it('una respuesta sin cuerpo JSON resuelve null', async () => {
    stubFetch(() => ({ ok: true, status: 204, json: async () => { throw new SyntaxError(); } }));

    expect(await apiRequest('DELETE', '/auth/sessions/current', { csrfToken: 't'.repeat(40) })).toBeNull();
  });
});
