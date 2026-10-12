import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/env.js';
import { PersistenceUnavailableError, UpstreamRateLimitedError } from '../persistence/errors.js';
import { createSupabaseSessionGateway } from './supabase-session.js';

const CONFIG = {
  supabase: { url: 'http://127.0.0.1:54321', anonKey: 'sb_publishable_test', jwksUrl: 'http://127.0.0.1:54321/x', serviceRoleKey: 'sb_secret_test' },
} as Pick<AppConfig, 'supabase'>;

const respond = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;

describe('adaptador de Supabase Auth', () => {
  it('un 429 del proveedor en login o refresh NO es una credencial inválida: lanza UpstreamRateLimitedError', async () => {
    const limited = createSupabaseSessionGateway(CONFIG, {
      fetch: respond(429, { code: 'over_request_rate_limit', error_code: 'over_request_rate_limit', msg: 'canario-del-proveedor' }),
    });

    await expect(limited.signIn('a@example.test', 'x')).rejects.toBeInstanceOf(UpstreamRateLimitedError);
    await expect(limited.refresh('rt-de-prueba')).rejects.toBeInstanceOf(UpstreamRateLimitedError);
  });

  it('un 5xx es indisponibilidad (503); credenciales incorrectas devuelven null', async () => {
    const down = createSupabaseSessionGateway(CONFIG, { fetch: respond(503, { msg: 'caído' }) });
    const wrong = createSupabaseSessionGateway(CONFIG, {
      fetch: respond(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
    });

    await expect(down.signIn('a@example.test', 'x')).rejects.toBeInstanceOf(PersistenceUnavailableError);
    expect(await wrong.signIn('a@example.test', 'x')).toBeNull();
    expect(await wrong.refresh('rt-de-prueba')).toBeNull();
  });

  it('un token ilegible o con algoritmo desconocido es «sin sesión», nunca una excepción', async () => {
    const gateway = createSupabaseSessionGateway(CONFIG, { fetch: respond(500, {}) });
    const header = Buffer.from(JSON.stringify({ alg: 'XX999', typ: 'JWT', kid: 'k' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'x', exp: 9_999_999_999 })).toString('base64url');

    for (const token of ['no-es-un-jwt', `${header}.${payload}.firma`, '...', '']) {
      expect(await gateway.verifyAccessToken(token).catch((error) => (error instanceof PersistenceUnavailableError ? 'down' : 'throw'))).toBeNull();
    }
  });

  it('un 429 en el logout NO cuenta como sesión revocada', async () => {
    const limited = createSupabaseSessionGateway(CONFIG, { fetch: respond(429, { code: 'over_request_rate_limit' }) });

    await expect(limited.signOut('at-de-prueba')).rejects.toBeInstanceOf(UpstreamRateLimitedError);
  });

  it('cada llamada a Auth lleva un límite de tiempo', async () => {
    let signal: AbortSignal | null | undefined;
    const gateway = createSupabaseSessionGateway(CONFIG, {
      fetch: (async (_input, init) => { signal = init?.signal; return new Response('{}', { status: 400 }); }) as typeof fetch,
    });

    await gateway.signIn('a@example.test', 'x');

    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
