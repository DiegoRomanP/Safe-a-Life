import express from 'express';
import type { AppConfig } from './config/env.js';
import { correlationIdMiddleware } from './shared/http/correlation-id.js';
import { createErrorHandler, notFoundHandler } from './shared/http/errors.js';
import { edgeGuard } from './shared/http/edge-guard.js';
import { originGuard } from './shared/http/origin-guard.js';
import { securityHeaders } from './shared/http/security-headers.js';
import { denialKindFor, type DenialAuditor } from './shared/audit/denial-audit.js';
import { findPrincipal } from './shared/auth/principal.js';
import type { Logger } from './shared/observability/logger.js';

export interface AppDependencies {
  readonly config: Pick<AppConfig, 'allowedOrigins' | 'trustedProxies'> & Partial<Pick<AppConfig, 'edgeSecret'>>;
  readonly logger: Logger;
  /** Rutas que necesitan el body crudo (webhook firmado); corren antes de `express.json`. */
  readonly mountBeforeJson?: (app: express.Express) => void;
  /** Los módulos montan aquí sus routers; corren antes del 404 genérico. */
  readonly mount?: (app: express.Express) => void;
  /** Audita las denegaciones (403, 409, 429) a un actor autenticado. Se llama tras responder y nunca rompe la petición. */
  readonly auditDenial?: DenialAuditor;
}

const JSON_BODY_LIMIT = '16kb';

function requestLogger(logger: Logger, auditDenial: DenialAuditor | undefined): express.RequestHandler {
  return (req, res, next) => {
    const started = performance.now();
    res.on('finish', () => {
      // Solo estado y código público: rechazos de CSRF, Origin, sesión o tasa son visibles sin PII.
      const rejected = res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429;
      logger.log(rejected ? 'warn' : 'info', {
        event: rejected ? 'seguridad.rechazo' : 'peticion.finalizada',
        correlationId: res.locals.correlationId,
        durationMs: Math.round(performance.now() - started),
        status: res.statusCode,
        ...(typeof req.route?.path === 'string' ? { route: `${req.baseUrl}${req.route.path}` } : {}),
        ...(typeof res.locals.rejectReason === 'string' ? { reason: res.locals.rejectReason } : {}),
        ...(typeof res.locals.errorCode === 'string' ? { code: res.locals.errorCode } : {}),
      });

      const kind = denialKindFor(res.statusCode);
      const principal = findPrincipal(res);
      if (auditDenial && kind && principal) {
        const operation = `${req.method} ${typeof req.route?.path === 'string' ? `${req.baseUrl}${req.route.path}` : '/api'}`;
        // Después de responder y sin esperar: un fallo de la auditoría no cambia la respuesta (queda en el log técnico).
        void auditDenial({ userId: principal.userId, kind, operation }).catch(() => {
          logger.log('warn', { event: 'auditoria.denegacion_no_registrada', correlationId: res.locals.correlationId });
        });
      }
    });
    next();
  };
}

/**
 * Compone middlewares comunes y routers de módulos. No abre puertos ni lee el
 * entorno; eso lo hace server.ts.
 */
export function createApp({ config, logger, mountBeforeJson, mount, auditDenial }: AppDependencies): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  // Nunca exponer stacks desde el manejador final de Express, sin importar NODE_ENV.
  app.set('env', 'production');
  app.set('trust proxy', typeof config.trustedProxies === 'object' ? [...config.trustedProxies] : config.trustedProxies);

  app.use(securityHeaders);
  app.use(correlationIdMiddleware);
  app.use(requestLogger(logger, auditDenial));
  app.use(edgeGuard(config.edgeSecret ?? ''));
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
