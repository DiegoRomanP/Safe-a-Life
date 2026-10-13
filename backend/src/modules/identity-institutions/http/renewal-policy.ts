import type { Request } from 'express';
import type { RenewalPolicy } from '../../../shared/auth/authenticate.js';

/**
 * Express enruta sin distinguir mayúsculas ni barra final; la política hace lo mismo para que una
 * variante de la ruta no recupere la renovación (y con ella el límite compartido de `/token`).
 */
function canonicalPath(path: string): string {
  return path.toLowerCase().replace(/\/+$/, '');
}

/** Login nunca renueva; logout renueva si puede para poder revocar, sin que un límite lo bloquee. */
export function authRenewalPolicy(req: Request): RenewalPolicy {
  const path = canonicalPath(req.path);
  if (req.method === 'POST' && path === '/v1/auth/sessions') return 'skip';
  if (req.method === 'DELETE' && path === '/v1/auth/sessions/current') return 'lenient';
  return 'normal';
}
