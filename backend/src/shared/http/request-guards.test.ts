import express from 'express';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { originGuard } from './origin-guard.js';
import { createErrorHandler } from './errors.js';
import { noStoreNoReferrer } from './sensitive-response.js';

const ALLOWED = 'https://app.example.test';
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function serve(app: express.Express): Promise<string> {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function buildApp(): express.Express {
  const app = express();
  app.use(originGuard([ALLOWED]));
  app.post('/mutacion', (_req, res) => res.status(204).end());
  app.get('/lectura', (_req, res) => res.status(204).end());
  app.use(createErrorHandler());
  return app;
}

describe('originGuard', () => {
  it('acepta una mutación desde un origen exacto de la allowlist', async () => {
    const base = await serve(buildApp());

    const response = await fetch(`${base}/mutacion`, { method: 'POST', headers: { origin: ALLOWED } });

    expect(response.status).toBe(204);
  });

  it('rechaza una mutación desde un origen ajeno con ACCESS_DENIED', async () => {
    const base = await serve(buildApp());

    const response = await fetch(`${base}/mutacion`, { method: 'POST', headers: { origin: 'https://evil.example.test' } });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('ACCESS_DENIED');
  });

  it('no acepta un origen que solo empieza igual que uno permitido', async () => {
    const base = await serve(buildApp());

    const response = await fetch(`${base}/mutacion`, {
      method: 'POST',
      headers: { origin: `${ALLOWED}.evil.example.test` },
    });

    expect(response.status).toBe(403);
  });

  it('no evalúa el origen en métodos seguros', async () => {
    const base = await serve(buildApp());

    const response = await fetch(`${base}/lectura`, { headers: { origin: 'https://evil.example.test' } });

    expect(response.status).toBe(204);
  });
});

describe('noStoreNoReferrer', () => {
  it('marca la respuesta como no almacenable y sin referrer', async () => {
    const app = express();
    app.get('/token', noStoreNoReferrer, (_req, res) => res.status(204).end());

    const response = await fetch(`${await serve(app)}/token`);

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });
});
