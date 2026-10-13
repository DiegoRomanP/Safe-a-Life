import { ApiError } from '../../../shared/http/errors.js';
import type { RateLimiter } from './identity.ports.js';

/**
 * Supabase Auth limita `/auth/v1/token` a 150 peticiones cada 5 minutos por IP del backend, en un solo
 * bucket para login (password) y renovación (refresh_token); el plan base no permite ampliarlo (O1).
 * Para que el proveedor nunca llegue a su límite, el backend impone techos GLOBALES propios, repartidos
 * por flujo, cuya suma queda por debajo de 150 (20 de margen para llamadas imprevistas). La renovación
 * recibe más cupo porque es el flujo de volumen de los usuarios legítimos. Un flujo
 * saturado no puede dejar sin cuota al otro: una avalancha de logins no impide renovar sesiones vivas.
 * Al agotarse un techo se responde 429 con `Retry-After` sin llamar a Auth y se registra un motivo
 * (`auth_quota_login` / `auth_quota_refresh`) para la alerta operativa.
 */
export const AUTH_QUOTA_WINDOW_SECONDS = 5 * 60;
export const AUTH_QUOTA = Object.freeze({ login: 50, refresh: 80 });
export type AuthQuotaFlow = keyof typeof AUTH_QUOTA;

/** Sujeto fijo del techo global (el limitador exige 64 hexadecimales). */
const GLOBAL_SUBJECT = '0'.repeat(64);

/** Consume un cupo del techo global del flujo. Devuelve los segundos a esperar, o `null`. */
export async function consumeAuthQuota(limiter: RateLimiter, flow: AuthQuotaFlow): Promise<number | null> {
  const decision = await limiter.consume(`authquota:${flow}`, GLOBAL_SUBJECT, AUTH_QUOTA[flow], AUTH_QUOTA_WINDOW_SECONDS);
  return decision.allowed ? null : decision.retryAfterSeconds;
}

/** Igual que `consumeAuthQuota`, pero lanza el 429 con su motivo de alerta. */
export async function requireAuthQuota(limiter: RateLimiter, flow: AuthQuotaFlow): Promise<void> {
  const wait = await consumeAuthQuota(limiter, flow);
  if (wait !== null) throw new ApiError('RATE_LIMITED', undefined, { retryAfterSeconds: wait, reason: `auth_quota_${flow}` });
}
