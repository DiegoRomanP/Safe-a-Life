import { describe, expect, it } from 'vitest';
import { ConfigError, parseEnv } from './env.js';

const OUTBOX_KEY = Buffer.alloc(32, 7).toString('base64');
const CSRF_SECRET = 'c'.repeat(40);
const EMAIL_HMAC_SECRET = 'e'.repeat(40);

function validEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    SUPABASE_URL: 'https://proyecto.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_test',
    SUPABASE_JWKS_URL: 'https://proyecto.supabase.co/auth/v1/.well-known/jwks.json',
    CSRF_SECRET,
    EMAIL_HMAC_SECRET,
    OUTBOX_KEY,
    ...overrides,
  };
}

function errorVariables(env: Record<string, string | undefined>): readonly string[] {
  try {
    parseEnv(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.variables;
    throw error;
  }
  throw new Error('se esperaba ConfigError');
}

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.firma-de-prueba`;
}

describe('parseEnv', () => {
  it('aplica valores por defecto seguros cuando las opcionales faltan', () => {
    const config = parseEnv(validEnv());

    expect(config.port).toBe(3000);
    expect(config.allowedOrigins).toEqual([]);
    expect(config.trustedProxies).toBe(false);
    expect(config.email.provider).toBe('fake');
    expect(config.email.resendApiKey).toBeUndefined();
    expect(config.email.inboxAllowlist).toEqual([]);
    expect(config.secrets.outboxKey).toHaveLength(32);
  });

  it('devuelve una configuración congelada', () => {
    const config = parseEnv(validEnv());

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.supabase)).toBe(true);
    expect(Object.isFrozen(config.secrets)).toBe(true);
  });

  it('informa solo los nombres de las variables obligatorias que faltan', () => {
    const env = validEnv({ CSRF_SECRET: undefined, OUTBOX_KEY: '' });

    expect(errorVariables(env)).toEqual(['CSRF_SECRET', 'OUTBOX_KEY']);
  });

  it('no filtra valores de secretos mal formados en el mensaje de error', () => {
    const canary = 'secreto-canario-demasiado-corto';
    const env = validEnv({ CSRF_SECRET: canary });

    try {
      parseEnv(env);
      throw new Error('se esperaba ConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).not.toContain(canary);
      expect((error as Error).message).toContain('CSRF_SECRET');
    }
  });

  it('exige que los secretos de CSRF y de email sean distintos', () => {
    const env = validEnv({ EMAIL_HMAC_SECRET: CSRF_SECRET });

    expect(errorVariables(env)).toEqual(['EMAIL_HMAC_SECRET']);
  });

  it('rechaza una clave de OUTBOX que no decodifica a 32 bytes', () => {
    const env = validEnv({ OUTBOX_KEY: Buffer.alloc(16, 1).toString('base64') });

    expect(errorVariables(env)).toEqual(['OUTBOX_KEY']);
  });

  it('acepta http solo para localhost en la URL de Supabase local', () => {
    expect(parseEnv(validEnv({ SUPABASE_URL: 'http://127.0.0.1:54321' })).supabase.url).toBe('http://127.0.0.1:54321');
    expect(errorVariables(validEnv({ SUPABASE_URL: 'http://example.com' }))).toEqual(['SUPABASE_URL']);
  });

  it('rechaza una clave anónima que en realidad es service_role', () => {
    const env = validEnv({ SUPABASE_ANON_KEY: fakeJwt({ role: 'service_role' }) });

    expect(errorVariables(env)).toEqual(['SUPABASE_ANON_KEY']);
  });

  it('rechaza una clave secreta de Supabase en la variable publicable', () => {
    expect(errorVariables(validEnv({ SUPABASE_ANON_KEY: 'sb_secret_123' }))).toEqual(['SUPABASE_ANON_KEY']);
  });

  it('acepta solo orígenes exactos, sin comodines, rutas ni barra final', () => {
    const config = parseEnv(validEnv({ ALLOWED_ORIGINS: 'https://app.example.test, http://localhost:5173' }));
    expect(config.allowedOrigins).toEqual(['https://app.example.test', 'http://localhost:5173']);

    for (const invalid of ['*', 'https://app.example.test/', 'https://app.example.test/ruta']) {
      expect(errorVariables(validEnv({ ALLOWED_ORIGINS: invalid }))).toEqual(['ALLOWED_ORIGINS']);
    }
  });

  it('acepta TRUSTED_PROXIES como número de saltos (1 a 5) o como lista de IP y CIDR', () => {
    expect(parseEnv(validEnv({ TRUSTED_PROXIES: '1' })).trustedProxies).toBe(1);
    expect(parseEnv(validEnv({ TRUSTED_PROXIES: '5' })).trustedProxies).toBe(5);
    expect(parseEnv(validEnv({ TRUSTED_PROXIES: '127.0.0.1, ::1' })).trustedProxies).toEqual(['127.0.0.1', '::1']);
    expect(parseEnv(validEnv({ TRUSTED_PROXIES: '10.0.0.0/8, ::1/128' })).trustedProxies).toEqual(['10.0.0.0/8', '::1/128']);
  });

  it('rechaza TRUSTED_PROXIES con saltos fuera de rango, prefijos inválidos o nombres de host', () => {
    for (const invalid of ['0', '6', '10.0.0.0/33', '::1/129', '10.0.0.0/', '10.0.0.0/-1', 'abc', 'proxy.example.test', '1,2']) {
      expect(errorVariables(validEnv({ TRUSTED_PROXIES: invalid }))).toEqual(['TRUSTED_PROXIES']);
    }
  });

  it('exige RESEND_API_KEY solo cuando el proveedor de email es resend', () => {
    expect(errorVariables(validEnv({ EMAIL_PROVIDER: 'resend' }))).toEqual(['RESEND_API_KEY']);

    const config = parseEnv(validEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test_key' }));
    expect(config.email.provider).toBe('resend');
    expect(config.email.resendApiKey).toBe('re_test_key');
  });

  it('rechaza proveedores de email desconocidos', () => {
    expect(errorVariables(validEnv({ EMAIL_PROVIDER: 'smtp' }))).toEqual(['EMAIL_PROVIDER']);
  });

  it('normaliza la allowlist de bandejas a minúsculas y rechaza entradas que no son correos', () => {
    const config = parseEnv(validEnv({ EMAIL_INBOX_ALLOWLIST: 'Bandeja@Example.test' }));
    expect(config.email.inboxAllowlist).toEqual(['bandeja@example.test']);

    expect(errorVariables(validEnv({ EMAIL_INBOX_ALLOWLIST: 'no-es-correo' }))).toEqual(['EMAIL_INBOX_ALLOWLIST']);
  });

  it('valida el puerto como entero entre 1 y 65535', () => {
    expect(parseEnv(validEnv({ PORT: '8080' })).port).toBe(8080);
    for (const invalid of ['0', '65536', '3000.5', 'abc']) {
      expect(errorVariables(validEnv({ PORT: invalid }))).toEqual(['PORT']);
    }
  });
});
