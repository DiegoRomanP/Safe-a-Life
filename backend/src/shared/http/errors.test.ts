import express from 'express';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { correlationIdMiddleware } from './correlation-id.js';
import { ApiError, createErrorHandler, ERROR_STATUS, notFoundHandler, toPublicError } from './errors.js';

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

describe('catálogo de errores públicos', () => {
  it('asigna a cada código el estado HTTP del catálogo', () => {
    expect(ERROR_STATUS).toEqual({
      BAD_REQUEST: 400,
      AUTHENTICATION_REQUIRED: 401,
      ACCESS_DENIED: 403,
      RESOURCE_NOT_FOUND: 404,
      STATE_CONFLICT: 409,
      ACTION_UNAVAILABLE: 410,
      VALIDATION_FAILED: 422,
      RATE_LIMITED: 429,
      INTERNAL_ERROR: 500,
      SERVICE_UNAVAILABLE: 503,
    });
  });

  it('devuelve solo code, message y correlationId dentro del envelope', () => {
    const result = toPublicError(new ApiError('STATE_CONFLICT'), 'corr-1');

    expect(result).toEqual({
      status: 409,
      body: {
        error: {
          code: 'STATE_CONFLICT',
          message: 'La operación entra en conflicto con el estado actual.',
          correlationId: 'corr-1',
        },
      },
    });
  });

  it('mantiene code y message idénticos a los ejemplos de respuesta de docs/openapi.json', () => {
    const spec = JSON.parse(readFileSync(new URL('../../../../docs/openapi.json', import.meta.url), 'utf8'));
    const responses = Object.entries(spec.components.responses as Record<string, any>);

    expect(responses).toHaveLength(Object.keys(ERROR_STATUS).length);
    for (const [name, response] of responses) {
      const example = response.content['application/json'].example.error;
      const actual = toPublicError(new ApiError(example.code), 'x').body.error;
      expect({ name, code: actual.code, message: actual.message }).toEqual({
        name,
        code: example.code,
        message: example.message,
      });
    }
  });

  it('convierte cualquier error no controlado en INTERNAL_ERROR sin su mensaje', () => {
    const result = toPublicError(new Error('canario-interno-de-base'), 'corr-2');

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(result.body)).not.toContain('canario-interno-de-base');
  });
});

describe('manejador de errores de Express', () => {
  it('responde 500 genérico ante un fallo inesperado y avisa al hook de diagnóstico', async () => {
    const unexpected: unknown[] = [];
    const app = express();
    app.use(correlationIdMiddleware);
    app.get('/fallo', () => {
      throw new Error('canario-secreto-del-proveedor');
    });
    app.use(createErrorHandler((error) => unexpected.push(error)));

    const response = await fetch(`${await serve(app)}/fallo`);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(text).not.toContain('canario-secreto-del-proveedor');
    expect(JSON.parse(text).error.code).toBe('INTERNAL_ERROR');
    expect(unexpected).toHaveLength(1);
  });

  it('responde 404 RESOURCE_NOT_FOUND para rutas inexistentes', async () => {
    const app = express();
    app.use(correlationIdMiddleware);
    app.use(notFoundHandler);
    app.use(createErrorHandler());

    const response = await fetch(`${await serve(app)}/no-existe`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(body.error.message).toBe('El recurso no está disponible.');
  });

  it('responde 400 BAD_REQUEST ante JSON malformado, sin eco del cuerpo', async () => {
    const app = express();
    app.use(correlationIdMiddleware);
    app.use(express.json());
    app.post('/datos', (_req, res) => res.status(204).end());
    app.use(createErrorHandler());

    const response = await fetch(`${await serve(app)}/datos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email": canario-no-json',
    });
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(JSON.parse(text).error.code).toBe('BAD_REQUEST');
    expect(text).not.toContain('canario-no-json');
  });

  it('responde 400 ante errores 4xx de body-parser (codificación, charset y tamaño) sin registrarlos como fallo', async () => {
    const unexpected: unknown[] = [];
    const app = express();
    app.use(correlationIdMiddleware);
    app.use(express.json({ limit: '16kb' }));
    app.post('/datos', (_req, res) => res.status(204).end());
    app.use(createErrorHandler((error) => unexpected.push(error)));
    const base = await serve(app);

    const cases: Array<{ headers: Record<string, string>; body: string }> = [
      { headers: { 'content-type': 'application/json', 'content-encoding': 'br-x' }, body: '{}' },
      { headers: { 'content-type': 'application/json; charset=latin1' }, body: '{}' },
      { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ relleno: 'x'.repeat(17 * 1024) }) },
      { headers: { 'content-type': 'application/json' }, body: '{roto' },
    ];
    for (const { headers, body } of cases) {
      const response = await fetch(`${base}/datos`, { method: 'POST', headers, body });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('BAD_REQUEST');
    }
    expect(unexpected).toHaveLength(0);
  });

  it('no escribe en stderr ni usa el manejador final de Express si las cabeceras ya se enviaron', async () => {
    const unexpected: unknown[] = [];
    const stderr = vi.spyOn(process.stderr, 'write');
    const app = express();
    app.use(correlationIdMiddleware);
    app.get('/parcial', (_req, res) => {
      res.write('x');
      throw new Error('canario-tras-cabeceras');
    });
    app.use(createErrorHandler((error) => unexpected.push(error)));

    await fetch(`${await serve(app)}/parcial`).then((r) => r.text()).catch(() => undefined);

    expect(unexpected).toHaveLength(1);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).not.toContain('canario-tras-cabeceras');
    stderr.mockRestore();
  });

  it('incluye un correlationId UUID distinto en cada respuesta', async () => {
    const app = express();
    app.use(correlationIdMiddleware);
    app.use(notFoundHandler);
    app.use(createErrorHandler());
    const base = await serve(app);

    const first = await (await fetch(`${base}/a`)).json();
    const second = await (await fetch(`${base}/b`)).json();

    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(first.error.correlationId).toMatch(uuid);
    expect(second.error.correlationId).toMatch(uuid);
    expect(first.error.correlationId).not.toBe(second.error.correlationId);
  });
});

describe('endurecimiento del manejador (auditoría A11)', () => {
  it('no filtra el stack si el hook de diagnóstico lanza, ni en NODE_ENV de desarrollo', async () => {
    const app = express();
    app.set('env', 'production');
    app.use(correlationIdMiddleware);
    app.get('/fallo', () => {
      throw new Error('canario-original');
    });
    app.use(
      createErrorHandler(() => {
        throw new Error('canario-del-logger secret=abc');
      }),
    );

    const response = await fetch(`${await serve(app)}/fallo`);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text).error.code).toBe('INTERNAL_ERROR');
    expect(text).not.toContain('canario');
    expect(text).not.toMatch(/\bat \S+:\d+/);
  });

  it('responde 400 si un parámetro de ruta no se puede decodificar', async () => {
    const unexpected: unknown[] = [];
    const app = express();
    app.use(correlationIdMiddleware);
    app.get('/n/:id', (_req, res) => res.status(204).end());
    app.use(createErrorHandler((error) => unexpected.push(error)));

    const response = await fetch(`${await serve(app)}/n/%E0%A4%A`);

    expect(response.status).toBe(400);
    expect(unexpected).toHaveLength(0);
  });
});
