import express from 'express';
import type { AppConfig } from './config/env.js';
import { correlationIdMiddleware } from './shared/http/correlation-id.js';
import { createErrorHandler, notFoundHandler } from './shared/http/errors.js';
import { originGuard } from './shared/http/origin-guard.js';
import type { Logger } from './shared/observability/logger.js';

export interface AppDependencies {
  readonly config: Pick<AppConfig, 'allowedOrigins' | 'trustedProxies'>;
  readonly logger: Logger;
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
export function createApp({ config, logger, mount }: AppDependencies): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', [...config.trustedProxies]);

  app.use(correlationIdMiddleware);
  app.use(requestLogger(logger));
  app.use(originGuard(config.allowedOrigins));
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
