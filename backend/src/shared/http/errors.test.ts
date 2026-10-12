import express from 'express';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
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
