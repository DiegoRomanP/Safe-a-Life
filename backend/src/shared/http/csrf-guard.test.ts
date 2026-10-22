import express from 'express';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createCsrfToken } from '../crypto/csrf.js';
import { setPrincipal, type Principal } from '../auth/principal.js';
import { correlationIdMiddleware } from './correlation-id.js';
import { requireCsrf } from './csrf-guard.js';
import { createErrorHandler } from './errors.js';

const SECRET = 'c'.repeat(40);
const ORIGIN = 'https://app.example.test';
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

function principalFor(sessionId: string): Principal {
  return {
    userId: 'u1', sessionId, aal: 'aal1', amr: [], accessToken: 't', role: 'donante', displayName: 'Donante', hospital: null,
  };
}

async function start(): Promise<string> {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use((_req, res, next) => {
    setPrincipal(res, principalFor('sesion-1'));
    next();
  });
  app.use(requireCsrf(SECRET, [ORIGIN]));
  app.all('/x', (_req, res) => res.status(204).end());
  app.use(createErrorHandler());
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/x`;
}

const post = (url: string, headers: Record<string, string>) => fetch(url, { method: 'POST', headers });

describe('requireCsrf', () => {
  it('acepta la mutación con Origin permitido y token de la misma sesión', async () => {
    const url = await start();
    const response = await post(url, { origin: ORIGIN, 'x-csrf-token': createCsrfToken(SECRET, 'sesion-1') });

    expect(response.status).toBe(204);
  });

  it('rechaza con 403 sin Origin, con Origin ajeno, sin token o con token de otra sesión', async () => {
    const url = await start();
    const token = createCsrfToken(SECRET, 'sesion-1');
    const cases: Array<Record<string, string>> = [
      { 'x-csrf-token': token },
      { origin: 'https://evil.example.test', 'x-csrf-token': token },
      { origin: 'null', 'x-csrf-token': token },
      { origin: ORIGIN },
      { origin: ORIGIN, 'x-csrf-token': createCsrfToken(SECRET, 'sesion-2') },
      { origin: ORIGIN, 'x-csrf-token': createCsrfToken('o'.repeat(40), 'sesion-1') },
    ];
    for (const headers of cases) {
      const response = await post(url, headers);
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ACCESS_DENIED');
    }
  });

  it('no exige CSRF en lecturas', async () => {
    expect((await fetch(await start())).status).toBe(204);
  });
});
