import express, { type Express } from 'express';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { validEnvSource } from './test-support/env.js';
import type { LogEntry, LogLevel, Logger } from './shared/observability/logger.js';

function envBase(): Record<string, string | undefined> {
  return validEnvSource({ ALLOWED_ORIGINS: 'https://app.example.test' });
}

const config = parseEnv(envBase());

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

function fakeLogger() {
  const entries: Array<{ level: LogLevel; entry: LogEntry }> = [];
  const logger: Logger = { log: (level, entry) => entries.push({ level, entry }) };
  return { entries, logger };
}

async function serve(app: Express): Promise<string> {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('createApp', () => {
  it('no anuncia el framework en las cabeceras', async () => {
    const base = await serve(createApp({ config, logger: fakeLogger().logger }));

    const response = await fetch(`${base}/no-existe`);

    expect(response.headers.get('x-powered-by')).toBeNull();
  });

  it('añade las cabeceras de seguridad incluso en errores', async () => {
    const base = await serve(createApp({ config, logger: fakeLogger().logger }));

    const response = await fetch(`${base}/no-existe`);

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    expect(response.headers.get('etag')).toBeNull();
  });

  it('responde 404 con el envelope de error y un correlationId', async () => {
    const base = await serve(createApp({ config, logger: fakeLogger().logger }));

    const response = await fetch(`${base}/no-existe`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(body.error.correlationId.length).toBeGreaterThan(0);
  });

  it('rechaza la mutación de un origen ajeno antes de leer el cuerpo', async () => {
    const base = await serve(createApp({ config, logger: fakeLogger().logger }));

    const response = await fetch(`${base}/cualquiera`, {
      method: 'POST',
      headers: { origin: 'https://evil.example.test', 'content-type': 'application/json' },
      body: '{"malformado',
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('ACCESS_DENIED');
  });

  it('limita el tamaño del cuerpo JSON', async () => {
    const base = await serve(createApp({ config, logger: fakeLogger().logger }));

    const response = await fetch(`${base}/cualquiera`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ relleno: 'x'.repeat(20 * 1024) }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('BAD_REQUEST');
  });

  it('registra la finalización con solo los campos permitidos', async () => {
    const { entries, logger } = fakeLogger();
    const base = await serve(createApp({ config, logger }));

    await fetch(`${base}/no-existe?token=canario-en-query`);

    const finished = entries.find(({ entry }) => entry.event === 'peticion.finalizada');
    expect(finished?.level).toBe('info');
    expect(Object.keys(finished?.entry ?? {}).sort()).toEqual(['code', 'correlationId', 'durationMs', 'event', 'status']);
    expect(finished?.entry.status).toBe(404);
    expect(finished?.entry.code).toBe('RESOURCE_NOT_FOUND');
    expect(typeof finished?.entry.durationMs).toBe('number');
    expect(JSON.stringify(entries)).not.toContain('canario-en-query');
  });

  it('registra como seguridad.rechazo (warn) las respuestas 401, 403 y 429, solo con estado y código', async () => {
    const { entries, logger } = fakeLogger();
    const app = createApp({
      config: { ...config, edgeSecret: 'secreto-de-borde-sintetico-0000000001' },
      logger,
    });
    const base = await serve(app);

    await fetch(`${base}/api/algo?token=canario-en-query`, { headers: { cookie: '__Host-sal_at=canario-cookie' } });

    const rejection = entries.find(({ entry }) => entry.event === 'seguridad.rechazo');
    expect(rejection?.level).toBe('warn');
    expect(rejection?.entry).toMatchObject({ status: 403, code: 'ACCESS_DENIED' });
    expect(JSON.stringify(entries)).not.toMatch(/canario/);
  });

  it('responde 500 genérico ante un fallo de una ruta montada y lo registra sin mensaje', async () => {
    const { entries, logger } = fakeLogger();
    const app = createApp({
      config,
      logger,
      mount: (router) => {
        router.get('/fallo', () => {
          throw new Error('canario-de-base-de-datos');
        });
      },
    });
    const base = await serve(app);

    const response = await fetch(`${base}/fallo`);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text).error.code).toBe('INTERNAL_ERROR');
    expect(text).not.toContain('canario-de-base-de-datos');
    expect(JSON.stringify(entries)).not.toContain('canario-de-base-de-datos');
    expect(entries.some(({ entry }) => entry.event === 'peticion.fallida' && entry.code === 'INTERNAL_ERROR')).toBe(true);
  });
});

describe('createApp: auditoría de denegaciones', () => {
  const principal = { userId: '5e5abebf-64ab-4ac4-a276-d91ca386886f' };

  function audited(failing = false) {
    const denials: Array<{ userId: string; kind: string; operation: string }> = [];
    const { entries, logger } = fakeLogger();
    const app = createApp({
      config, logger,
      auditDenial: async (denial) => {
        denials.push(denial);
        if (failing) throw new Error('canario-secreto');
      },
      mount: (target) => {
        const asUser: express.RequestHandler = (_req, res, next) => { res.locals.principal = principal; next(); };
        target.get('/api/v1/cosas/:id', asUser, (_req, res) => { res.status(403).json({}); });
        target.post('/api/v1/cosas/:id', asUser, (_req, res) => { res.status(409).json({}); });
        target.put('/api/v1/cosas/:id', asUser, (_req, res) => { res.status(429).json({}); });
        target.delete('/api/v1/cosas/:id', asUser, (_req, res) => { res.status(204).end(); });
        target.get('/api/v1/anonimo', (_req, res) => { res.status(403).json({}); });
      },
    });
    return { app, denials, entries };
  }

  it('audita 403, 409 y 429 de un actor autenticado con la ruta sin sustituir, y nada más', async () => {
    const { app, denials } = audited();
    const base = await serve(app);

    await fetch(`${base}/api/v1/cosas/abc`);
    await fetch(`${base}/api/v1/cosas/abc`, { method: 'POST', headers: { origin: 'https://app.example.test' } });
    await fetch(`${base}/api/v1/cosas/abc`, { method: 'PUT', headers: { origin: 'https://app.example.test' } });
    await fetch(`${base}/api/v1/cosas/abc`, { method: 'DELETE', headers: { origin: 'https://app.example.test' } });
    await fetch(`${base}/api/v1/anonimo`);
    await fetch(`${base}/no-existe`);

    expect(denials).toEqual([
      { userId: principal.userId, kind: 'acceso', operation: 'GET /api/v1/cosas/:id' },
      { userId: principal.userId, kind: 'conflicto', operation: 'POST /api/v1/cosas/:id' },
      { userId: principal.userId, kind: 'limite', operation: 'PUT /api/v1/cosas/:id' },
    ]);
    expect(JSON.stringify(denials)).not.toContain('abc');
  });

  it('un fallo de la auditoría no cambia la respuesta y se registra sin el mensaje del error', async () => {
    const { app, entries } = audited(true);
    const base = await serve(app);

    const response = await fetch(`${base}/api/v1/cosas/abc`);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(response.status).toBe(403);
    expect(entries.map(({ entry }) => entry.event)).toContain('auditoria.denegacion_no_registrada');
    expect(JSON.stringify(entries)).not.toContain('canario-secreto');
  });
});

describe('createApp con proxies de confianza', () => {
  it('toma la IP del cliente de X-Forwarded-For solo con un salto de confianza', async () => {
    const trusted = parseEnv({ ...envBase(), TRUSTED_PROXIES: '1' });
    const untrusted = parseEnv(envBase());
    const ips: string[] = [];
    const mount = (router: Express) => {
      router.get('/ip', (req, res) => {
        ips.push(req.ip ?? '');
        res.status(204).end();
      });
    };

    await fetch(`${await serve(createApp({ config: trusted, logger: fakeLogger().logger, mount }))}/ip`, {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    await fetch(`${await serve(createApp({ config: untrusted, logger: fakeLogger().logger, mount }))}/ip`, {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });

    expect(ips[0]).toBe('203.0.113.7');
    expect(ips[1]).not.toBe('203.0.113.7');
  });
});

describe('createApp con mountBeforeJson', () => {
  it('entrega el body crudo a las rutas montadas antes de express.json', async () => {
    const seen: string[] = [];
    const app = createApp({
      config,
      logger: fakeLogger().logger,
      mountBeforeJson: (router) => {
        router.post('/crudo', express.raw({ type: 'application/json', limit: '64kb' }), (req, res) => {
          seen.push(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : 'no-buffer');
          res.status(204).end();
        });
      },
    });

    const response = await fetch(`${await serve(app)}/crudo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"a":  1}',
    });

    expect(response.status).toBe(204);
    expect(seen).toEqual(['{"a":  1}']);
  });
});
