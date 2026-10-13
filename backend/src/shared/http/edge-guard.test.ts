import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { correlationIdMiddleware } from './correlation-id.js';
import { edgeGuard } from './edge-guard.js';
import { createErrorHandler } from './errors.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function start(secret: string, onReject?: () => void): Promise<string> {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(edgeGuard(secret, onReject));
  app.get('/health/live', (_req, res) => res.json({ ok: true }));
  app.get('/api/x', (_req, res) => res.json({ ok: true }));
  app.use(createErrorHandler());
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const SECRET = 'secreto-de-borde-sintetico-0000000001';

describe('edgeGuard', () => {
  it('rechaza con 403 genérico una petición sin la cabecera o con una incorrecta', async () => {
    let rejected = 0;
    const base = await start(SECRET, () => { rejected += 1; });

    const missing = await fetch(`${base}/api/x`);
    const wrong = await fetch(`${base}/api/x`, { headers: { 'x-edge-secret': 'otro-secreto-de-igual-largo-000000001' } });
    const short = await fetch(`${base}/api/x`, { headers: { 'x-edge-secret': 'corto' } });

    for (const response of [missing, wrong, short]) {
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ACCESS_DENIED');
    }
    expect(rejected).toBe(3);
  });

  it('deja pasar la petición con el secreto correcto y exime /health/*', async () => {
    const base = await start(SECRET);

    expect((await fetch(`${base}/api/x`, { headers: { 'x-edge-secret': SECRET } })).status).toBe(200);
    expect((await fetch(`${base}/health/live`)).status).toBe(200);
  });

  it('la exención de /health sigue el enrutado de Express (barra final y mayúsculas), no una igualdad exacta', async () => {
    const base = await start(SECRET);

    expect((await fetch(`${base}/health/live/`)).status).toBe(200);
    expect((await fetch(`${base}/HEALTH/LIVE`)).status).toBe(200);
    // Lo que NO es salud sigue exigiendo el secreto, también con variantes de ruta.
    expect((await fetch(`${base}/api/x/`)).status).toBe(403);
    expect((await fetch(`${base}/health/live/../api/x`)).status).toBe(403);
    expect((await fetch(`${base}/health/liveness`)).status).toBe(403);
  });

  it('no hace nada si no hay secreto configurado', async () => {
    const base = await start('');

    expect((await fetch(`${base}/api/x`)).status).toBe(200);
  });
});
