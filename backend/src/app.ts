import express from 'express';
import type { AppConfig } from './config/env.js';
import { correlationIdMiddleware } from './shared/http/correlation-id.js';
import { createErrorHandler, notFoundHandler } from './shared/http/errors.js';
import { originGuard } from './shared/http/origin-guard.js';
import { securityHeaders } from './shared/http/security-headers.js';
import type { Logger } from './shared/observability/logger.js';

export interface AppDependencies {
  readonly config: Pick<AppConfig, 'allowedOrigins' | 'trustedProxies'>;
  readonly logger: Logger;
  /** Rutas que necesitan el body crudo (webhook firmado); corren antes de `express.json`. */
  readonly mountBeforeJson?: (app: express.Express) => void;
  /** Los módulos montan aquí sus routers; corren antes del 404 genérico. */
  readonly mount?: (app: express.Express) => void;
}

const JSON_BODY_LIMIT = '16kb';

function requestLogger(logger: Logger): express.RequestHandler {
  return (_req, res, next) => {
    const started = performance.now();
    res.on('finish', () => {
      logger.log('info', {
        event: 'peticion.finalizada',
        correlationId: res.locals.correlationId,
        durationMs: Math.round(performance.now() - started),
      });
    });
    next();
  };
}

/**
 * Compone middlewares comunes y routers de módulos. No abre puertos ni lee el
 * entorno; eso lo hace server.ts.
 */
export function createApp({ config, logger, mountBeforeJson, mount }: AppDependencies): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  // Nunca exponer stacks desde el manejador final de Express, sin importar NODE_ENV.
  app.set('env', 'production');
  app.set('trust proxy', typeof config.trustedProxies === 'object' ? [...config.trustedProxies] : config.trustedProxies);

  app.use(securityHeaders);
  app.use(correlationIdMiddleware);
  app.use(requestLogger(logger));
  app.use(originGuard(config.allowedOrigins));
  mountBeforeJson?.(app);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  mount?.(app);

  app.use(notFoundHandler);
  app.use(
    createErrorHandler((_error, correlationId) => {
      logger.log('error', { event: 'peticion.fallida', code: 'INTERNAL_ERROR', correlationId });
    }),
  );

  return app;
}
