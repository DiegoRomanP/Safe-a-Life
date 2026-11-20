import { describe, expect, it } from 'vitest';
import { PersistenceUnavailableError } from '../persistence/errors.js';
import { createJwksCache, decodeJwtHeader } from './jwks-cache.js';

const KEY = { kid: 'clave-1', alg: 'ES256', kty: 'EC', crv: 'P-256', x: 'x', y: 'y' };

function harness(body: unknown, status = 200) {
  let clock = 0;
  let downloads = 0;
  const fetchFn = (async () => {
    downloads += 1;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  const cache = createJwksCache({ url: 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json', fetch: fetchFn, now: () => clock });
  return { cache, downloads: () => downloads, advance: (ms: number) => { clock += ms; } };
}

describe('caché de JWKS (M2)', () => {
  it('devuelve la clave del kid conocido con su algoritmo', async () => {
    const { cache } = harness({ keys: [KEY] });

    expect(await cache.lookup({ alg: 'ES256', kid: 'clave-1' })).toEqual({ mode: 'asymmetric', key: KEY });
  });

  it('rechaza HS256, none, alg distinto al de la clave y kid ausente sin volver a descargar', async () => {
    const { cache, downloads } = harness({ keys: [KEY] });

    for (const header of [{ alg: 'HS256', kid: 'clave-1' }, { alg: 'none', kid: 'clave-1' }, { alg: 'RS256', kid: 'clave-1' }, { alg: 'ES256' }]) {
      expect(await cache.lookup(header)).toEqual({ mode: 'asymmetric', key: null });
    }
    expect(downloads()).toBe(1);
  });

  it('un kid desconocido descarga como mucho una vez por minuto, no en cada petición', async () => {
    const { cache, downloads, advance } = harness({ keys: [KEY] });
    await cache.lookup({ alg: 'ES256', kid: 'clave-1' });

    for (let i = 0; i < 20; i += 1) expect(await cache.lookup({ alg: 'ES256', kid: `aleatorio-${i}` })).toEqual({ mode: 'asymmetric', key: null });
    expect(downloads()).toBe(1);

    advance(61_000);
    await cache.lookup({ alg: 'ES256', kid: 'otro' });
    expect(downloads()).toBe(2);
  });

  it('un JWKS sin claves asimétricas indica proyecto HS256 (modo simétrico)', async () => {
    const { cache } = harness({ keys: [] });

    expect(await cache.lookup({ alg: 'HS256' })).toEqual({ mode: 'symmetric' });
  });

  it('un JWKS inalcanzable sin copia previa es indisponibilidad; con copia previa se sigue usando', async () => {
    await expect(harness({}, 503).cache.lookup({ alg: 'ES256', kid: 'clave-1' })).rejects.toBeInstanceOf(PersistenceUnavailableError);

    let fail = false;
    let clock = 0;
    const cache = createJwksCache({
      url: 'http://127.0.0.1/jwks',
      fetch: (async () => (fail ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ keys: [KEY] })))) as typeof fetch,
      now: () => clock,
    });
    await cache.lookup({ alg: 'ES256', kid: 'clave-1' });
    fail = true;
    clock += 11 * 60 * 1000;
    expect(await cache.lookup({ alg: 'ES256', kid: 'clave-1' })).toEqual({ mode: 'asymmetric', key: KEY });
  });

  it('decodeJwtHeader solo acepta tres segmentos con una cabecera JSON de objeto', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'k' })).toString('base64url');

    expect(decodeJwtHeader(`${header}.e30.firma`)).toEqual({ alg: 'ES256', kid: 'k' });
    for (const token of ['', 'a.b', '...', `${Buffer.from('[1]').toString('base64url')}.e30.f`, 'no-json.e30.f']) {
      expect(decodeJwtHeader(token)).toBeNull();
    }
  });
});
