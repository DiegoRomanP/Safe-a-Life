import type { RequestHandler } from 'express';
import { ApiError } from './errors.js';

/**
 * En producción el TLS termina en el borde (Vercel/Render), así que la API solo ve HTTP plano y se fía de
 * `X-Forwarded-Proto` a través de `trust proxy` (que solo se cree tras pasar `edgeGuard`). Una petición que
 * llegó por HTTP se rechaza con 403 genérico en vez de redirigirla: una API no debe aceptar credenciales por un
 * canal sin cifrar ni invitar al cliente a reintentarlas. `/health/*` queda exento para los sondeos del balanceador.
 * Con `enabled` en false no hace nada (desarrollo y pruebas).
 */
export function httpsOnly(enabled: boolean): RequestHandler {
  return (req, res, next) => {
    // Mismo criterio de ruta que edgeGuard: Express enruta sin distinguir mayúsculas ni barra final.
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    if (!enabled || req.secure || path === '/health/live' || path === '/health/ready') {
      next();
      return;
    }
    res.locals.rejectReason = 'https';
    next(new ApiError('ACCESS_DENIED'));
  };
}
