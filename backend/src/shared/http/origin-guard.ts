import type { RequestHandler } from 'express';
import { ApiError } from './errors.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * En mutaciones, un Origin presente debe coincidir exactamente con la allowlist.
 * Sin Origin no hay contexto de navegador; la exigencia de Origin para peticiones
 * con cookie de sesión la aplica la capa de sesión (F2, ADR-004).
 */
export function originGuard(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);

  return (req, _res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get('origin');
    if (origin !== undefined && !allowed.has(origin)) {
      next(new ApiError('ACCESS_DENIED'));
      return;
    }
    next();
  };
}
