import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { correlationIdMiddleware } from './correlation-id.js';
import { createErrorHandler } from './errors.js';
import { httpsOnly } from './https-only.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function start(enabled: boolean): Promise<string> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(correlationIdMiddleware);
  app.use(httpsOnly(enabled));
  app.get('/health/live', (_req, res) => res.json({ ok: true }));
  app.get('/api/x', (_req, res) => res.json({ ok: true }));
  app.use(createErrorHandler());
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('httpsOnly', () => {
  it('rechaza con 403 genérico una petición que llegó por HTTP y deja pasar la que el borde marcó como https', async () => {
    const base = await start(true);

    const plain = await fetch(`${base}/api/x`);
    const forwarded = await fetch(`${base}/api/x`, { headers: { 'x-forwarded-proto': 'http' } });
    const secure = await fetch(`${base}/api/x`, { headers: { 'x-forwarded-proto': 'https' } });

    for (const response of [plain, forwarded]) {
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ACCESS_DENIED');
    }
    expect(secure.status).toBe(200);
  });

  it('exime /health/* (con barra final y mayúsculas) para los sondeos del balanceador', async () => {
    const base = await start(true);

    expect((await fetch(`${base}/health/live`)).status).toBe(200);
    expect((await fetch(`${base}/HEALTH/LIVE/`)).status).toBe(200);
    expect((await fetch(`${base}/health/live/../api/x`)).status).toBe(403);
  });

  it('no hace nada fuera de producción', async () => {
    const base = await start(false);

    expect((await fetch(`${base}/api/x`)).status).toBe(200);
  });
});
