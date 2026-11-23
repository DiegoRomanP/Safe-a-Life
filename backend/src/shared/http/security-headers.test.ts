import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { correlationIdMiddleware } from './correlation-id.js';
import { createErrorHandler, notFoundHandler } from './errors.js';
import { originGuard } from './origin-guard.js';
import { SECURITY_HEADERS, securityHeaders } from './security-headers.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const ALLOWED = 'https://app.example.test';

async function start(): Promise<string> {
  const app = express();
  app.use(securityHeaders);
  app.use(correlationIdMiddleware);
  app.use(originGuard([ALLOWED]));
  app.get('/api/x', (_req, res) => res.json({ ok: true }));
  app.post('/api/x', (_req, res) => res.json({ ok: true }));
  app.use(notFoundHandler);
  app.use(createErrorHandler());
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('securityHeaders', () => {
  it('fija la lista exacta de cabeceras defensivas', () => {
    expect(SECURITY_HEADERS).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    });
  });

  it('las envía en respuestas correctas, en 404 y en rechazos, y no anuncia Express', async () => {
    const base = await start();

    const responses = [
      await fetch(`${base}/api/x`),
      await fetch(`${base}/no-existe`),
      await fetch(`${base}/api/x`, { method: 'POST', headers: { origin: 'https://ajeno.example.test' } }),
    ];
    for (const response of responses) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(response.headers.get(name), name).toBe(value);
    }
    expect(responses[2]!.status).toBe(403);
  });
});

// ADR-004: en producción no hay CORS (el navegador y la API comparten origen por el rewrite). Ninguna respuesta
// debe conceder acceso entre orígenes, ni siquiera al origen que está en la allowlist.
describe('CORS', () => {
  it('nunca emite cabeceras Access-Control-*, tampoco en un preflight', async () => {
    const base = await start();

    const responses = [
      await fetch(`${base}/api/x`, { method: 'OPTIONS', headers: { origin: 'https://ajeno.example.test', 'access-control-request-method': 'POST' } }),
      await fetch(`${base}/api/x`, { method: 'OPTIONS', headers: { origin: ALLOWED, 'access-control-request-method': 'POST' } }),
      await fetch(`${base}/api/x`, { headers: { origin: ALLOWED } }),
    ];
    for (const response of responses) {
      const names = [...response.headers.keys()].filter((name) => name.startsWith('access-control-'));
      expect(names).toEqual([]);
    }
  });
});
