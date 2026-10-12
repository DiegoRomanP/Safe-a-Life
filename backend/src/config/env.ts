import { isIP } from 'node:net';

export type EmailProvider = 'fake' | 'resend';

export interface AppConfig {
  readonly port: number;
  readonly supabase: Readonly<{ url: string; anonKey: string; jwksUrl: string }>;
  readonly allowedOrigins: readonly string[];
  readonly trustedProxies: readonly string[];
  readonly secrets: Readonly<{ csrf: string; emailHmac: string; outboxKey: Buffer }>;
  readonly email: Readonly<{
    provider: EmailProvider;
    resendApiKey: string | undefined;
    inboxAllowlist: readonly string[];
  }>;
}

type Source = Readonly<Record<string, string | undefined>>;
type Reject = (name: string) => void;

const DEFAULT_PORT = 3000;
const MIN_SECRET_LENGTH = 32;
const OUTBOX_KEY_BYTES = 32;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/**
 * Lista solo los nombres de las variables inválidas. Nunca incluye valores.
 */
export class ConfigError extends Error {
  readonly code = 'ENV_INVALID';
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(`Configuración de entorno inválida: ${variables.join(', ')}.`);
    this.name = 'ConfigError';
    this.variables = variables;
  }
}

export function parseEnv(source: Source): AppConfig {
  const failed: string[] = [];
  const reject: Reject = (name) => {
    if (!failed.includes(name)) failed.push(name);
  };

  const port = parsePort(read(source, 'PORT'), reject);
  const supabaseUrl = parseHttpUrl('SUPABASE_URL', required(source, 'SUPABASE_URL', reject), reject);
  const anonKey = parseAnonKey(required(source, 'SUPABASE_ANON_KEY', reject), reject);
  const jwksUrl = parseHttpUrl('SUPABASE_JWKS_URL', required(source, 'SUPABASE_JWKS_URL', reject), reject);
  const allowedOrigins = parseOrigins(read(source, 'ALLOWED_ORIGINS'), reject);
  const trustedProxies = parseIpList(read(source, 'TRUSTED_PROXIES'), reject);

  const csrf = parseSecret('CSRF_SECRET', required(source, 'CSRF_SECRET', reject), reject);
  const emailHmac = parseSecret('EMAIL_HMAC_SECRET', required(source, 'EMAIL_HMAC_SECRET', reject), reject);
  if (csrf && csrf === emailHmac) reject('EMAIL_HMAC_SECRET');
  const outboxKey = parseOutboxKey(required(source, 'OUTBOX_KEY', reject), reject);

  const provider = parseProvider(read(source, 'EMAIL_PROVIDER'), reject);
  const resendApiKey = provider === 'resend' ? required(source, 'RESEND_API_KEY', reject) : undefined;
  const inboxAllowlist = parseEmailList(read(source, 'EMAIL_INBOX_ALLOWLIST'), reject);

  if (failed.length > 0) throw new ConfigError(failed);

  return Object.freeze({
    port,
    supabase: Object.freeze({ url: supabaseUrl, anonKey, jwksUrl }),
    allowedOrigins: Object.freeze(allowedOrigins),
    trustedProxies: Object.freeze(trustedProxies),
    secrets: Object.freeze({ csrf, emailHmac, outboxKey }),
    email: Object.freeze({
      provider,
      resendApiKey: resendApiKey || undefined,
      inboxAllowlist: Object.freeze(inboxAllowlist),
    }),
  });
}

function read(source: Source, name: string): string | undefined {
  const value = source[name]?.trim();
  return value ? value : undefined;
}

function required(source: Source, name: string, reject: Reject): string {
  const value = read(source, name);
  if (value === undefined) reject(name);
  return value ?? '';
}

function parsePort(raw: string | undefined, reject: Reject): number {
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535) {
    reject('PORT');
    return DEFAULT_PORT;
  }
  return port;
}

function tryUrl(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

/** https siempre; http solo hacia localhost (Supabase local). */
function isAllowedUrl(url: URL): boolean {
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
}

function parseHttpUrl(name: string, raw: string, reject: Reject): string {
  if (raw === '') return '';
  const url = tryUrl(raw);
  if (!url || !isAllowedUrl(url)) {
    reject(name);
    return '';
  }
  return raw;
}

function isServiceRoleJwt(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload === 'object' && payload !== null && (payload as Record<string, unknown>).role === 'service_role';
  } catch {
    return false;
  }
}

function parseAnonKey(raw: string, reject: Reject): string {
  if (raw === '') return '';
  if (raw.startsWith('sb_secret_') || isServiceRoleJwt(raw)) {
    reject('SUPABASE_ANON_KEY');
    return '';
  }
  return raw;
}

function parseOrigins(raw: string | undefined, reject: Reject): string[] {
  if (raw === undefined) return [];
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean).flatMap((origin) => {
    const url = tryUrl(origin);
    if (!url || url.origin !== origin || !isAllowedUrl(url)) {
      reject('ALLOWED_ORIGINS');
      return [];
    }
    return [origin];
  });
}

function parseIpList(raw: string | undefined, reject: Reject): string[] {
  if (raw === undefined) return [];
  return raw.split(',').map((entry) => entry.trim()).filter(Boolean).flatMap((entry) => {
    if (isIP(entry) === 0) {
      reject('TRUSTED_PROXIES');
      return [];
    }
    return [entry];
  });
}

function parseSecret(name: string, raw: string, reject: Reject): string {
  if (raw === '') return '';
  if (raw.length < MIN_SECRET_LENGTH) {
    reject(name);
    return '';
  }
  return raw;
}

function parseOutboxKey(raw: string, reject: Reject): Buffer {
  const key = Buffer.from(raw, 'base64');
  if (raw === '' || key.length !== OUTBOX_KEY_BYTES || key.toString('base64') !== raw) {
    reject('OUTBOX_KEY');
    return Buffer.alloc(OUTBOX_KEY_BYTES);
  }
  return key;
}

function parseProvider(raw: string | undefined, reject: Reject): EmailProvider {
  if (raw === undefined || raw === 'fake') return 'fake';
  if (raw === 'resend') return 'resend';
  reject('EMAIL_PROVIDER');
  return 'fake';
}

function parseEmailList(raw: string | undefined, reject: Reject): string[] {
  if (raw === undefined) return [];
  return raw.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean).flatMap((entry) => {
    if (!EMAIL_PATTERN.test(entry)) {
      reject('EMAIL_INBOX_ALLOWLIST');
      return [];
    }
    return [entry];
  });
}
