import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shared/http/errors.js';
import { AUTH_QUOTA, AUTH_QUOTA_WINDOW_SECONDS, consumeAuthQuota, requireAuthQuota } from './auth-quota.js';
import type { RateLimiter } from './identity.ports.js';

function limiter(allowed: boolean, retryAfterSeconds = 0) {
  const calls: Array<{ bucket: string; subject: string; limit: number; windowSeconds: number }> = [];
  const port: RateLimiter = {
    consume: async (bucket, subject, limit, windowSeconds) => {
      calls.push({ bucket, subject, limit, windowSeconds });
      return { allowed, retryAfterSeconds };
    },
  };
  return { calls, port };
}

describe('techo global de /token (O1)', () => {
  it('la suma de los techos queda por debajo de los 150 de Supabase Auth, con margen', () => {
    expect(AUTH_QUOTA.login + AUTH_QUOTA.refresh).toBeLessThanOrEqual(130);
    expect(AUTH_QUOTA_WINDOW_SECONDS).toBe(300);
  });

  it('cada flujo usa su propio bucket con sujeto fijo de 64 hexadecimales (un flujo no deja sin cupo al otro)', async () => {
    const { calls, port } = limiter(true);

    await consumeAuthQuota(port, 'login');
    await consumeAuthQuota(port, 'refresh');

    expect(calls.map((call) => call.bucket)).toEqual(['authquota:login', 'authquota:refresh']);
    expect(calls.every((call) => /^[0-9a-f]{64}$/.test(call.subject) && call.windowSeconds === 300)).toBe(true);
    expect(calls.map((call) => call.limit)).toEqual([AUTH_QUOTA.login, AUTH_QUOTA.refresh]);
  });

  it('devuelve los segundos a esperar cuando el techo se agota', async () => {
    expect(await consumeAuthQuota(limiter(false, 77).port, 'login')).toBe(77);
    expect(await consumeAuthQuota(limiter(true).port, 'login')).toBeNull();
  });

  it('requireAuthQuota lanza 429 con Retry-After y el motivo de alerta del flujo', async () => {
    const error = await requireAuthQuota(limiter(false, 12).port, 'login').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 12, reason: 'auth_quota_login' });
    await expect(requireAuthQuota(limiter(true).port, 'refresh')).resolves.toBeUndefined();
  });
});
