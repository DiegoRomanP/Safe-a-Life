import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { validEnvSource } from '../../test-support/env.js';
import { PersistenceError, PersistenceUnavailableError } from './errors.js';
import { callRpc } from './rpc.js';
import { createSupabaseFactory } from './supabase-client.js';

const config = parseEnv(validEnvSource({
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_JWKS_URL: 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json',
}));

interface Captured {
  url: string;
  headers: Headers;
  body: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function factoryWith(handler: (request: Captured, signal?: AbortSignal | null) => Promise<Response>) {
  const calls: Captured[] = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const request = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    };
    calls.push(request);
    return handler(request, init?.signal);
  };
  return { calls, factory: createSupabaseFactory(config, { fetch: fetchStub }) };
}

describe('callRpc', () => {
  it('llama a la RPC del esquema api con el JWT del usuario y devuelve el valor sin interpretar', async () => {
    const { calls, factory } = factoryWith(async () => json(200, { kind: 'ok' }));

    const value = await callRpc(factory.forUser('jwt-del-usuario'), 'get_thing', { p_id: 'x' });

    expect(value).toEqual({ kind: 'ok' });
    expect(calls[0].url).toBe('http://127.0.0.1:54321/rest/v1/rpc/get_thing');
    expect(calls[0].headers.get('authorization')).toBe('Bearer jwt-del-usuario');
    expect(calls[0].headers.get('content-profile')).toBe('api');
    expect(JSON.parse(calls[0].body)).toEqual({ p_id: 'x' });
  });

  it('crea un cliente nuevo por petición y no mezcla identidades', async () => {
    const { calls, factory } = factoryWith(async () => json(200, { kind: 'ok' }));

    await callRpc(factory.forUser('jwt-a'), 'f', {});
    await callRpc(factory.forUser('jwt-b'), 'f', {});
    await callRpc(factory.anonymous(), 'f', {});

    expect(calls.map(({ headers }) => headers.get('authorization'))).toEqual([
      'Bearer jwt-a', 'Bearer jwt-b', 'Bearer sb_publishable_test',
    ]);
  });

  it('traduce red caída, 5xx y timeout a PersistenceUnavailableError sin mensajes del proveedor', async () => {
    const down = factoryWith(async () => {
      throw new TypeError('fetch failed canario-interno');
    });
    await expect(callRpc(down.factory.anonymous(), 'f', {})).rejects.toBeInstanceOf(PersistenceUnavailableError);

    const serverError = factoryWith(async () => json(503, { message: 'canario-del-proveedor', code: 'XX000' }));
    const failure = await callRpc(serverError.factory.anonymous(), 'f', {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PersistenceUnavailableError);
    expect(String((failure as Error).message)).not.toContain('canario');

    const hang = factoryWith((_request, signal) => new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    await expect(callRpc(hang.factory.anonymous(), 'f', {}, { timeoutMs: 20 })).rejects.toBeInstanceOf(PersistenceUnavailableError);
  });

  it('traduce un 4xx del proveedor a PersistenceError y un 401 a razón jwt', async () => {
    const rejected = factoryWith(async () => json(404, { message: 'canario-no-existe', code: 'PGRST202' }));
    const failure = await callRpc(rejected.factory.anonymous(), 'f', {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PersistenceError);
    expect((failure as PersistenceError).reason).toBe('rejected');
    expect((failure as Error).message).not.toContain('canario');

    const expired = factoryWith(async () => json(401, { message: 'JWT expired', code: 'PGRST301' }));
    const jwt = await callRpc(expired.factory.forUser('x'), 'f', {}).catch((error: unknown) => error);
    expect((jwt as PersistenceError).reason).toBe('jwt');
  });
});
