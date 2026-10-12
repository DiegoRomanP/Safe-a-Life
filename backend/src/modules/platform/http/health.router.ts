import type { Express } from 'express';
import { sendData } from '../../../shared/http/respond.js';
import { ApiError } from '../../../shared/http/errors.js';
import { compileOperation } from '../../../shared/validation/contract-validator.js';

/** Puerto de readiness: devuelve la versión de migración vigente en la base, o lanza si no hay conexión. */
export interface ReadinessGateway {
  schemaVersion(): Promise<string | null>;
}

export interface HealthDependencies {
  readonly readiness: ReadinessGateway;
  readonly expectedSchemaVersion: string;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
    timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * GET /health/live: sin dependencias ni red (RNF-OPS-01).
 * GET /health/ready: 200 solo si la base responde y las migraciones coinciden con
 * las que este backend espera; cualquier otro caso es 503 sin detalle.
 */
export function registerHealthRoutes(app: Express, { readiness, expectedSchemaVersion, timeoutMs = DEFAULT_TIMEOUT_MS }: HealthDependencies): void {
  const live = compileOperation('getLiveness');
  const ready = compileOperation('getReadiness');

  app.get('/health/live', (req, res, next) => {
    try {
      live.parseQuery(req.query);
      sendData(res, 200, (live.assertSuccess({ data: { status: 'ok' } }) as { data: unknown }).data);
    } catch (error) {
      next(error);
    }
  });

  app.get('/health/ready', async (req, res, next) => {
    try {
      ready.parseQuery(req.query);
      let version: string | null;
      try {
        version = await withTimeout(readiness.schemaVersion(), timeoutMs);
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE');
      }
      if (version !== expectedSchemaVersion) throw new ApiError('SERVICE_UNAVAILABLE');
      sendData(res, 200, (ready.assertSuccess({ data: { status: 'ready' } }) as { data: unknown }).data);
    } catch (error) {
      next(error);
    }
  });
}
