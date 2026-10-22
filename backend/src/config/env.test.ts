import { describe, expect, it } from 'vitest';
import { validEnvSource } from '../test-support/env.js';
import { ConfigError, parseApiEnv, parseEnv, parseWorkerEnv } from './env.js';

const OUTBOX_KEY = Buffer.alloc(32, 7).toString('base64');
const OUTBOX_KEY_B = Buffer.alloc(32, 8).toString('base64');
const CSRF_SECRET = 'c'.repeat(40);
const EMAIL_HMAC_SECRET = 'e'.repeat(40);

function validEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return validEnvSource({ CSRF_SECRET, EMAIL_HMAC_SECRET, OUTBOX_KEYS: `k1:${OUTBOX_KEY}`, ...overrides });
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
    expect(config.secrets.outboxKeyring.currentKid).toBe('k1');
    expect(config.secrets.outboxKeyring.keys.get('k1')).toHaveLength(32);
  });

  it('devuelve una configuración congelada', () => {
    const config = parseEnv(validEnv());

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.supabase)).toBe(true);
    expect(Object.isFrozen(config.secrets)).toBe(true);
  });

  it('informa solo los nombres de las variables obligatorias que faltan', () => {
    const env = validEnv({ CSRF_SECRET: undefined, OUTBOX_KEYS: '', OUTBOX_KEY_CURRENT: undefined });

    expect(errorVariables(env)).toEqual(['CSRF_SECRET', 'OUTBOX_KEYS', 'OUTBOX_KEY_CURRENT']);
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

  it('acepta un keyring con varias claves y una clave actual presente', () => {
    const config = parseEnv(validEnv({ OUTBOX_KEYS: `k1:${OUTBOX_KEY},k2:${OUTBOX_KEY_B}`, OUTBOX_KEY_CURRENT: 'k2' }));

    expect(config.secrets.outboxKeyring.currentKid).toBe('k2');
    expect([...config.secrets.outboxKeyring.keys.keys()]).toEqual(['k1', 'k2']);
  });

  it('rechaza claves del outbox que no decodifican a 32 bytes, kids inválidos o repetidos', () => {
    const short = Buffer.alloc(16, 1).toString('base64');
    for (const invalid of [`k1:${short}`, `K1:${OUTBOX_KEY}`, `sin-separador`, `k1:${OUTBOX_KEY},k1:${OUTBOX_KEY_B}`, `k1:${OUTBOX_KEY}x`]) {
      expect(errorVariables(validEnv({ OUTBOX_KEYS: invalid }))).toContain('OUTBOX_KEYS');
    }
  });

  it('rechaza una OUTBOX_KEY_CURRENT que no está en el keyring', () => {
    expect(errorVariables(validEnv({ OUTBOX_KEY_CURRENT: 'k9' }))).toEqual(['OUTBOX_KEY_CURRENT']);
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
    for (const invalid of ['0', '6', '0.0.0.0/0', '::/0', '10.0.0.0/7', '10.0.0.0/33', '::1/129', '10.0.0.0/', '10.0.0.0/-1', 'abc', 'proxy.example.test', '1,2']) {
      expect(errorVariables(validEnv({ TRUSTED_PROXIES: invalid }))).toEqual(['TRUSTED_PROXIES']);
    }
  });

  it('exige RESEND_API_KEY solo cuando el proveedor de email es resend', () => {
    expect(errorVariables(validEnv({ EMAIL_PROVIDER: 'resend' }))).toEqual(['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET']);

    const config = parseEnv(validEnv({
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_test_key',
      RESEND_WEBHOOK_SECRET: `whsec_${Buffer.alloc(24, 1).toString('base64')}`,
    }));
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

describe('parseEnv: variables de F1', () => {
  it('rechaza una SUPABASE_SERVICE_ROLE_KEY ausente, igual a la anon o que no es una clave secreta', () => {
    expect(errorVariables(validEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }))).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);
    expect(errorVariables(validEnv({ SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_test' }))).toEqual(['SUPABASE_SERVICE_ROLE_KEY']);
    expect(parseEnv(validEnv({ SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ role: 'service_role' }) })).supabase.serviceRoleKey).toContain('.');
  });

  it('exige CURSOR_SECRET distinto de los demás secretos', () => {
    expect(errorVariables(validEnv({ CURSOR_SECRET: CSRF_SECRET }))).toEqual(['CURSOR_SECRET']);
    expect(errorVariables(validEnv({ CURSOR_SECRET: 'corto' }))).toEqual(['CURSOR_SECRET']);
  });

  it('valida EMAIL_FROM, APP_PUBLIC_URL y la identidad del worker', () => {
    expect(errorVariables(validEnv({ EMAIL_FROM: 'no-es-correo' }))).toEqual(['EMAIL_FROM']);
    expect(errorVariables(validEnv({ APP_PUBLIC_URL: 'http://app.example.test' }))).toEqual(['APP_PUBLIC_URL']);
    expect(parseEnv(validEnv({ APP_PUBLIC_URL: 'http://localhost:5173/' })).appPublicUrl).toBe('http://localhost:5173');
    expect(errorVariables(validEnv({ WORKER_EMAIL: undefined, WORKER_PASSWORD: undefined }))).toEqual(['WORKER_EMAIL', 'WORKER_PASSWORD']);
    // La sesión técnica protege el outbox: una contraseña corta se rechaza.
    expect(errorVariables(validEnv({ WORKER_PASSWORD: 'corta' }))).toEqual(['WORKER_PASSWORD']);
    expect(parseEnv(validEnv({ WORKER_PASSWORD: 'doce-caracteres' })).worker.password).toBe('doce-caracteres');
  });

  it('la API y el worker tienen identidades técnicas distintas y cada proceso exige solo la suya', () => {
    expect(errorVariables(validEnv({ API_TECHNICAL_EMAIL: undefined, API_TECHNICAL_PASSWORD: undefined }))).toEqual(['API_TECHNICAL_EMAIL', 'API_TECHNICAL_PASSWORD']);
    expect(errorVariables(validEnv({ API_TECHNICAL_PASSWORD: 'corta' }))).toEqual(['API_TECHNICAL_PASSWORD']);
    // Con el mismo usuario la API volvería a poder operar el outbox.
    expect(errorVariables(validEnv({ API_TECHNICAL_EMAIL: 'worker@example.test' }))).toEqual(['API_TECHNICAL_EMAIL']);

    const apiOnly = validEnv({ WORKER_EMAIL: undefined, WORKER_PASSWORD: undefined });
    const api = parseEnv(apiOnly, 'api');
    expect(api.apiTechnical.email).toBe('api-technical@example.test');
    expect(api.worker.password).toBe('');
    const workerOnly = validEnv({ API_TECHNICAL_EMAIL: undefined, API_TECHNICAL_PASSWORD: undefined });
    const worker = parseWorkerEnv(workerOnly);
    expect(worker.worker.email).toBe('worker@example.test');
    expect(() => parseWorkerEnv(apiOnly)).toThrowError(/WORKER_EMAIL/);
    expect(() => parseEnv(workerOnly, 'api')).toThrowError(/API_TECHNICAL_EMAIL/);
  });

  it('acota WORKER_POLL_MS entre 1000 y 60000 con 5000 por defecto', () => {
    expect(parseEnv(validEnv()).worker.pollMs).toBe(5000);
    expect(parseEnv(validEnv({ WORKER_POLL_MS: '1000' })).worker.pollMs).toBe(1000);
    for (const invalid of ['999', '60001', 'abc', '1.5']) {
      expect(errorVariables(validEnv({ WORKER_POLL_MS: invalid }))).toEqual(['WORKER_POLL_MS']);
    }
  });

  it('exige RESEND_WEBHOOK_SECRET con formato whsec_<base64> solo para el proveedor resend', () => {
    const resend = { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test' };
    expect(errorVariables(validEnv(resend))).toEqual(['RESEND_WEBHOOK_SECRET']);
    expect(errorVariables(validEnv({ ...resend, RESEND_WEBHOOK_SECRET: 'whsec_no base64!' }))).toEqual(['RESEND_WEBHOOK_SECRET']);

    const secret = Buffer.alloc(24, 5);
    const config = parseEnv(validEnv({ ...resend, RESEND_WEBHOOK_SECRET: `whsec_${secret.toString('base64')}` }));
    expect(config.email.resendWebhookSecret?.equals(secret)).toBe(true);
    expect(parseEnv(validEnv()).email.resendWebhookSecret).toBeUndefined();
  });
});

describe('parseEnv: secreto de borde y producción', () => {
  const EDGE = 'b'.repeat(40);

  it('acepta un secreto de borde válido y lo expone; sin él queda vacío', () => {
    expect(parseEnv(validEnvSource({ EDGE_SHARED_SECRET: EDGE })).edgeSecret).toBe(EDGE);
    expect(parseEnv(validEnvSource()).edgeSecret).toBe('');
  });

  it('rechaza un secreto de borde corto o igual a otro secreto, sin imprimir su valor', () => {
    for (const value of ['corto', 'c'.repeat(40)]) {
      expect(() => parseEnv(validEnvSource({ EDGE_SHARED_SECRET: value }))).toThrowError(/EDGE_SHARED_SECRET/);
    }
  });

  it('en producción exige proxies, orígenes https, secreto de borde y URLs https', () => {
    const production = {
      NODE_ENV: 'production', TRUSTED_PROXIES: '1', ALLOWED_ORIGINS: 'https://app.example.test', EDGE_SHARED_SECRET: EDGE,
      WORKER_PASSWORD: 'w'.repeat(40), API_TECHNICAL_PASSWORD: 'a'.repeat(40),
      EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test_key', RESEND_WEBHOOK_SECRET: `whsec_${Buffer.alloc(24, 1).toString('base64')}`,
    };
    expect(parseEnv(validEnvSource(production)).production).toBe(true);

    const cases: Array<[string, Record<string, string | undefined>]> = [
      ['TRUSTED_PROXIES', { TRUSTED_PROXIES: undefined }],
      ['ALLOWED_ORIGINS', { ALLOWED_ORIGINS: undefined }],
      ['ALLOWED_ORIGINS', { ALLOWED_ORIGINS: 'http://127.0.0.1:5173' }],
      ['EDGE_SHARED_SECRET', { EDGE_SHARED_SECRET: undefined }],
      ['SUPABASE_URL', { SUPABASE_URL: 'http://127.0.0.1:54321' }],
      ['APP_PUBLIC_URL', { APP_PUBLIC_URL: 'http://localhost:5173' }],
      // El remitente falso descartaría los correos en silencio.
      ['EMAIL_PROVIDER', { EMAIL_PROVIDER: 'fake' }],
      // La credencial técnica opera el outbox y las recuperaciones: en producción, larga.
      ['WORKER_PASSWORD', { WORKER_PASSWORD: 'solo-veinte-caracteres' }],
      ['API_TECHNICAL_PASSWORD', { API_TECHNICAL_PASSWORD: 'solo-veinte-caracteres' }],
    ];
    for (const [variable, override] of cases) {
      expect(() => parseEnv(validEnvSource({ ...production, ...override }))).toThrowError(new RegExp(variable));
    }
  });

  it('fuera de producción permite localhost sin proxies ni secreto de borde', () => {
    expect(parseEnv(validEnvSource({ SUPABASE_URL: 'http://127.0.0.1:54321' })).production).toBe(false);
  });

  it('en Render (variable RENDER) exige los mismos controles aunque falte NODE_ENV', () => {
    expect(() => parseEnv(validEnvSource({ RENDER: 'true' }))).toThrowError(/TRUSTED_PROXIES/);
    expect(parseEnv(validEnvSource({
      RENDER: 'true', TRUSTED_PROXIES: '1', ALLOWED_ORIGINS: 'https://app.example.test', EDGE_SHARED_SECRET: 'b'.repeat(40),
      WORKER_PASSWORD: 'w'.repeat(40), API_TECHNICAL_PASSWORD: 'a'.repeat(40),
      EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test_key', RESEND_WEBHOOK_SECRET: `whsec_${Buffer.alloc(24, 1).toString('base64')}`,
    })).production).toBe(true);
  });
});

describe('configuración separada por proceso (V8-B2)', () => {
  const API_ONLY = ['CSRF_SECRET', 'CURSOR_SECRET', 'EDGE_SHARED_SECRET', 'ALLOWED_ORIGINS', 'TRUSTED_PROXIES', 'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_JWKS_URL', 'API_TECHNICAL_EMAIL', 'API_TECHNICAL_PASSWORD', 'RESEND_WEBHOOK_SECRET'];
  const WORKER_ONLY = ['WORKER_EMAIL', 'WORKER_PASSWORD', 'WORKER_POLL_MS'];
  const without = (names: string[], extra: Record<string, string | undefined> = {}) =>
    validEnvSource({ ...Object.fromEntries(names.map((name) => [name, undefined])), ...extra });

  it('el worker arranca sin los secretos de la API y no los expone', () => {
    const config = parseWorkerEnv(without(API_ONLY));

    expect(config.worker.email).toBe('worker@example.test');
    expect(config.secrets.emailHmac).toBe('e'.repeat(40));
    expect(config.secrets.outboxKeyring.currentKid).toBe('k1');
    for (const key of ['csrf', 'cursor']) expect(config.secrets).not.toHaveProperty(key);
    for (const key of ['allowedOrigins', 'trustedProxies', 'edgeSecret', 'apiTechnical']) expect(config).not.toHaveProperty(key);
    expect(config.supabase).not.toHaveProperty('serviceRoleKey');
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('el worker sigue exigiendo lo que consume', () => {
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'EMAIL_HMAC_SECRET', 'OUTBOX_KEYS', 'WORKER_EMAIL', 'WORKER_PASSWORD', 'APP_PUBLIC_URL', 'EMAIL_FROM']) {
      expect(() => parseWorkerEnv(without([...API_ONLY, name])), name).toThrowError(new RegExp(name));
    }
  });

  it('la API no exige WORKER_*', () => {
    expect(parseApiEnv(without(WORKER_ONLY)).apiTechnical.email).toBe('api-technical@example.test');
    expect(() => parseApiEnv(without([...WORKER_ONLY, 'CSRF_SECRET']))).toThrowError(/CSRF_SECRET/);
  });

  it('en producción el worker falla cerrado sin pedir las reglas de la API', () => {
    const production = { NODE_ENV: 'production', WORKER_PASSWORD: 'w'.repeat(40), EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_sintetica' };
    expect(parseWorkerEnv(without(API_ONLY, production)).production).toBe(true);
    expect(() => parseWorkerEnv(without(API_ONLY, { ...production, EMAIL_PROVIDER: 'fake' }))).toThrowError(/EMAIL_PROVIDER/);
    expect(() => parseWorkerEnv(without(API_ONLY, { ...production, WORKER_PASSWORD: 'doce-caracteres' }))).toThrowError(/WORKER_PASSWORD/);
    expect(() => parseWorkerEnv(without(API_ONLY, { ...production, APP_PUBLIC_URL: 'http://localhost:5173' }))).toThrowError(/APP_PUBLIC_URL/);
    expect(() => parseWorkerEnv(without(API_ONLY, { ...production, SUPABASE_URL: 'http://127.0.0.1:54321' }))).toThrowError(/SUPABASE_URL/);
  });
});
