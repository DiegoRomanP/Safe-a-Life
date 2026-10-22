import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ApiError } from './errors.js';

export const EDGE_HEADER = 'x-edge-secret';

function equalSecrets(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Exige que la petición haya pasado por el borde de confianza (rewrite de Vercel, ADR-004): el borde
 * inyecta una cabecera secreta que un acceso directo al origen (*.onrender.com) no puede conocer.
 * Sin ella no se puede confiar en X-Forwarded-For. `/health/*` queda exento para los sondeos del
 * balanceador. Con `secret` vacío el guard no hace nada (desarrollo y pruebas).
 */
export function edgeGuard(secret: string, onReject?: () => void): RequestHandler {
  return (req, res, next) => {
    // Express enruta sin distinguir mayúsculas ni barra final: la exención debe coincidir con él.
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    if (secret === '' || path === '/health/live' || path === '/health/ready') {
      next();
      return;
    }
    if (equalSecrets(req.get(EDGE_HEADER), secret)) {
      next();
      return;
    }
    res.locals.rejectReason = 'edge';
    onReject?.();
    next(new ApiError('ACCESS_DENIED'));
  };
}
