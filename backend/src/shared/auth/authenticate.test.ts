import express from 'express';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { correlationIdMiddleware } from '../http/correlation-id.js';
import { createErrorHandler } from '../http/errors.js';
import { PersistenceError, PersistenceUnavailableError, UpstreamRateLimitedError } from '../persistence/errors.js';
import { authenticate } from './authenticate.js';
import { requireSession } from './guards.js';
import { findPrincipal } from './principal.js';
import type { ActorInfo, ActorResolver, SessionVerifier, TokenPair, VerifiedClaims } from './session-ports.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const CLAIMS: VerifiedClaims = { userId: 'u1', sessionId: 's1', aal: 'aal2', amr: [{ method: 'totp', timestamp: 1 }] };
const ACTOR: ActorInfo = { role: 'admin_hospitalario', displayName: 'Hospital Sintético', hospital: null };

function fakes(options: {
  valid?: Set<string>;
  refresh?: TokenPair | null | Error;
  actor?: ActorInfo | null | Error;
  refreshGate?: () => Promise<number | null>;
} = {}) {
  const calls = { refresh: 0, actor: [] as string[] };
  const verifier: SessionVerifier = {
    verifyAccessToken: async (token) => (options.valid?.has(token) ? CLAIMS : null),
    refresh: async () => {
      calls.refresh += 1;
      if (options.refresh instanceof Error) throw options.refresh;
      return options.refresh ?? null;
    },
  };
  const actors: ActorResolver = {
    currentActor: async (token) => {
      calls.actor.push(token);
      if (options.actor instanceof Error) throw options.actor;
      return options.actor === undefined ? ACTOR : options.actor;
    },
  };
  return { calls, verifier, actors, refreshGate: options.refreshGate };
}

async function start(deps: ReturnType<typeof fakes>): Promise<string> {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(authenticate(deps));
  app.get('/yo', requireSession, (_req, res) => {
    const principal = findPrincipal(res);
    res.json({ role: principal?.role, token: principal?.accessToken });
  });
  app.use(createErrorHandler());
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/yo`;
}

describe('authenticate', () => {
  it('construye el principal con claims válidos y el actor resuelto en esa petición', async () => {
    const deps = fakes({ valid: new Set(['at-1']) });

    const response = await fetch(await start(deps), { headers: { cookie: '__Host-sal_at=at-1; __Host-sal_rt=rt-1' } });

    expect(await response.json()).toEqual({ role: 'admin_hospitalario', token: 'at-1' });
    expect(deps.calls.refresh).toBe(0);
    expect(deps.calls.actor).toEqual(['at-1']);
  });

  it('resuelve el actor otra vez en cada petición (membresía revocada → sin principal)', async () => {
    const deps = fakes({ valid: new Set(['at-1']), actor: null });

    const response = await fetch(await start(deps), { headers: { cookie: '__Host-sal_at=at-1' } });

    expect(response.status).toBe(401);
  });

  it('renueva con el refresh token cuando el access token venció y reescribe ambas cookies', async () => {
    const pair: TokenPair = { accessToken: 'at-nuevo', refreshToken: 'rt-nuevo', expiresIn: 600 };
    const deps = fakes({ valid: new Set(['at-nuevo']), refresh: pair });

    const response = await fetch(await start(deps), { headers: { cookie: '__Host-sal_at=vencido; __Host-sal_rt=rt-1' } });

    expect(response.status).toBe(200);
    expect((await response.json()).token).toBe('at-nuevo');
    const cookies = response.headers.getSetCookie();
    expect(cookies).toContain('__Host-sal_at=at-nuevo; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax');
    expect(cookies).toContain('__Host-sal_rt=rt-nuevo; Max-Age=43200; Path=/; HttpOnly; Secure; SameSite=Lax');
    expect(deps.calls.refresh).toBe(1);
  });

  it('expira ambas cookies y no autentica si el refresh falla', async () => {
    const deps = fakes({ refresh: null });

    const response = await fetch(await start(deps), { headers: { cookie: '__Host-sal_at=vencido; __Host-sal_rt=rt-viejo' } });

    expect(response.status).toBe(401);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  });

  it('sin cookies no intenta refrescar ni resolver actor', async () => {
    const deps = fakes();

    expect((await fetch(await start(deps))).status).toBe(401);
    expect(deps.calls.refresh).toBe(0);
    expect(deps.calls.actor).toEqual([]);
  });

  it('responde 503 genérico si la resolución del actor no está disponible', async () => {
    const deps = fakes({ valid: new Set(['at-1']), actor: new PersistenceUnavailableError() });

    const response = await fetch(await start(deps), { headers: { cookie: '__Host-sal_at=at-1' } });

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('limita las renovaciones por IP ANTES de llamar a Supabase Auth', async () => {
    const deps = fakes({ refresh: null, refreshGate: async () => 42 });

    const response = await fetch(await start(deps), { headers: { cookie: '__Host-sal_at=vencido; __Host-sal_rt=rt-viejo-1' } });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('42');
    expect(deps.calls.refresh).toBe(0);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('consulta el límite solo cuando hay una renovación que intentar', async () => {
    let consulted = 0;
    const deps = fakes({ valid: new Set(['at-1']), refreshGate: async () => { consulted += 1; return null; } });

    await fetch(await start(deps), { headers: { cookie: '__Host-sal_at=at-1; __Host-sal_rt=rt-viejo-1' } });

    expect(consulted).toBe(0);
  });

  it('descarta sin llamar al proveedor un refresh token con forma imposible', async () => {
    const deps = fakes({ refresh: null });

    const response = await fetch(await start(deps), { headers: { cookie: `__Host-sal_rt=${'x'.repeat(300)}` } });

    expect(response.status).toBe(401);
    expect(deps.calls.refresh).toBe(0);
    expect(response.headers.getSetCookie().every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  });

  it('un 429 del proveedor responde 429 y NO borra las cookies de la sesión', async () => {
    const deps = fakes({ refresh: new UpstreamRateLimitedError() });

    const response = await fetch(await start(deps), { headers: { cookie: '__Host-sal_at=vencido; __Host-sal_rt=rt-viejo-1' } });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('trata un token que vence antes de resolver el actor como sin sesión (401), no como fallo', async () => {
    const deps = fakes({ valid: new Set(['at-1']), actor: new PersistenceError('jwt') });

    const response = await fetch(await start(deps), { headers: { cookie: '__Host-sal_at=at-1' } });

    expect(response.status).toBe(401);
  });
});
