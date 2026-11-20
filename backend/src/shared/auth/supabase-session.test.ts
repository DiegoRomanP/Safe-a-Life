import { generateKeyPairSync, sign } from 'node:crypto';
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

  it('un Auth que no contesta dentro del plazo se aborta y se trata como no disponible (503), no como credenciales inválidas', async () => {
    const hanging = ((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('abortado')));
    })) as typeof fetch;
    const gateway = createSupabaseSessionGateway(CONFIG, { fetch: hanging, timeoutMs: 40 });
    const started = Date.now();

    await expect(gateway.signIn('a@example.test', 'x')).rejects.toBeInstanceOf(PersistenceUnavailableError);

    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe('verificación local del access token con el JWKS cacheado (M2)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const KID = '6f1c1e2a-0000-4000-8000-00000000jwks';
  const JWKS = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'ES256', use: 'sig', key_ops: ['verify'] }] };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const CLAIMS = {
    iss: 'http://127.0.0.1:54321/auth/v1', aud: 'authenticated', role: 'authenticated', aal: 'aal1',
    sub: '00000000-0000-4000-8000-0000000000a1', session_id: '00000000-0000-4000-8000-0000000000b1', exp: 9_999_999_999,
  };
  const es256 = (header: Record<string, unknown>, claims: Record<string, unknown> = CLAIMS) => {
    const input = `${b64(header)}.${b64(claims)}`;
    return `${input}.${sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  };

  function harness(jwks: unknown = JWKS) {
    const urls: string[] = [];
    const fetchFn = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      if (url === CONFIG.supabase.jwksUrl) return new Response(JSON.stringify(jwks), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ id: CLAIMS.sub }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    return { urls, gateway: createSupabaseSessionGateway(CONFIG, { fetch: fetchFn }) };
  }

  it('un token ES256 firmado con una clave del JWKS se verifica sin llamar a /auth/v1/user', async () => {
    const { urls, gateway } = harness();

    expect(await gateway.verifyAccessToken(es256({ alg: 'ES256', typ: 'JWT', kid: KID }))).toMatchObject({ userId: CLAIMS.sub, aal: 'aal1' });
    expect(urls).toEqual([CONFIG.supabase.jwksUrl]);
  });

  it('un kid desconocido, HS256 o una firma ajena se rechazan en local, sin Auth ni nuevas descargas del JWKS', async () => {
    const { urls, gateway } = harness();
    const forged = (alg: string, kid?: string) => `${b64({ alg, typ: 'JWT', ...(kid ? { kid } : {}) })}.${b64(CLAIMS)}.ZmlybWE`;

    for (let i = 0; i < 10; i += 1) expect(await gateway.verifyAccessToken(es256({ alg: 'ES256', kid: `aleatorio-${i}` }))).toBeNull();
    expect(await gateway.verifyAccessToken(forged('HS256', KID))).toBeNull();
    expect(await gateway.verifyAccessToken(forged('HS256'))).toBeNull();
    expect(await gateway.verifyAccessToken(forged('ES256', KID))).toBeNull();
    expect(urls).toEqual([CONFIG.supabase.jwksUrl]);
  });

  it('si el proyecto no publica claves asimétricas (HS256 heredado), delega en Auth como antes', async () => {
    const { urls, gateway } = harness({ keys: [] });

    await gateway.verifyAccessToken(`${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(CLAIMS)}.ZmlybWE`);
    expect(urls[0]).toBe(CONFIG.supabase.jwksUrl);
    expect(urls.some((url) => url.endsWith('/auth/v1/user'))).toBe(true);
  });
});
