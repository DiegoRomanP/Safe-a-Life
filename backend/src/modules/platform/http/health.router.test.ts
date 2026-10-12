import express from 'express';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { correlationIdMiddleware } from '../../../shared/http/correlation-id.js';
import { createErrorHandler } from '../../../shared/http/errors.js';
import { registerHealthRoutes, type ReadinessGateway } from './health.router.js';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function start(readiness: ReadinessGateway, timeoutMs = 2_000): Promise<string> {
  const app = express();
  app.use(correlationIdMiddleware);
  registerHealthRoutes(app, { readiness, expectedSchemaVersion: '20261013010000', timeoutMs });
  app.use(createErrorHandler());
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('GET /health/live', () => {
  it('responde 200 sin consultar la base', async () => {
    let calls = 0;
    const base = await start({ schemaVersion: async () => { calls += 1; return null; } });

    const response = await fetch(`${base}/health/live`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: 'ok' } });
    expect(calls).toBe(0);
  });

  it('rechaza parámetros de query desconocidos con 400', async () => {
    const base = await start({ schemaVersion: async () => null });

    expect((await fetch(`${base}/health/live?x=1`)).status).toBe(400);
  });
});

describe('GET /health/ready', () => {
  it('responde 200 cuando la versión de migración coincide', async () => {
    const base = await start({ schemaVersion: async () => '20261013010000' });

    const response = await fetch(`${base}/health/ready`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: 'ready' } });
  });

  it('responde 503 sin detalle si la versión difiere, falta o la base falla', async () => {
    const cases: ReadinessGateway[] = [
      { schemaVersion: async () => '20250101000000' },
      { schemaVersion: async () => null },
      { schemaVersion: async () => { throw new Error('canario-de-conexion postgres://user:pass@host'); } },
    ];
    for (const gateway of cases) {
      const response = await fetch(`${await start(gateway)}/health/ready`);
      const text = await response.text();
      expect(response.status).toBe(503);
      expect(JSON.parse(text).error.code).toBe('SERVICE_UNAVAILABLE');
      expect(text).not.toContain('canario');
    }
  });

  it('responde 503 si la base no contesta dentro del timeout', async () => {
    const base = await start({ schemaVersion: () => new Promise(() => undefined) }, 30);

    expect((await fetch(`${base}/health/ready`)).status).toBe(503);
  });

  it('reutiliza el resultado 5 s: peticiones directas repetidas no generan una consulta cada una', async () => {
    let calls = 0;
    const base = await start({ schemaVersion: async () => { calls += 1; return '20261013010000'; } });

    for (let i = 0; i < 5; i += 1) expect((await fetch(`${base}/health/ready`)).status).toBe(200);

    expect(calls).toBe(1);
  });
});
