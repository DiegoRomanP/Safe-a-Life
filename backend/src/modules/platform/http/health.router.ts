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
  readonly now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 2_000;
/** Resultado de readiness reutilizable: un acceso directo sin autenticar no genera una RPC por petición. */
const READY_CACHE_MS = 5_000;

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
export function registerHealthRoutes(app: Express, { readiness, expectedSchemaVersion, timeoutMs = DEFAULT_TIMEOUT_MS, now = Date.now }: HealthDependencies): void {
  const live = compileOperation('getLiveness');
  const ready = compileOperation('getReadiness');
  let cached: { ok: boolean; until: number } | undefined;
  /** Comprobación en curso: las peticiones concurrentes la comparten en vez de lanzar una RPC cada una. */
  let inflight: Promise<boolean> | undefined;

  const check = (): Promise<boolean> => {
    // `Promise.resolve().then` también cubre un puerto que lance de forma síncrona; `finally` limpia
    // `inflight` siempre después de asignarlo, así que ninguna ruta de error deja la comprobación colgada.
    inflight ??= Promise.resolve()
      .then(() => withTimeout(readiness.schemaVersion(), timeoutMs))
      .then((version) => version === expectedSchemaVersion, () => false)
      .finally(() => { inflight = undefined; });
    return inflight;
  };

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
      if (!cached || cached.until <= now()) {
        const ok = await check();
        cached = { ok, until: now() + READY_CACHE_MS };
      }
      if (!cached.ok) throw new ApiError('SERVICE_UNAVAILABLE');
      sendData(res, 200, (ready.assertSuccess({ data: { status: 'ready' } }) as { data: unknown }).data);
    } catch (error) {
      next(error);
    }
  });
}
