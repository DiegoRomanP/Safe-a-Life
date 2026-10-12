import type { RequestHandler } from 'express';
import { verifyCsrfToken } from '../crypto/csrf.js';
import { requirePrincipal } from '../auth/principal.js';
import { ApiError } from './errors.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * ADR-004: toda mutación autenticada por cookie exige un `Origin` presente y en
 * la allowlist exacta, y un `X-CSRF-Token` válido para el `session_id` del JWT ya
 * verificado. Falta o fallo → 403 ACCESS_DENIED, sin revelar cuál comprobación falló.
 */
export function requireCsrf(secret: string, allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }
    const principal = requirePrincipal(res);
    const origin = req.get('origin');
    if (origin === undefined || !allowed.has(origin) || !verifyCsrfToken(secret, principal.sessionId, req.get('x-csrf-token'))) {
      next(new ApiError('ACCESS_DENIED'));
      return;
    }
    next();
  };
}
