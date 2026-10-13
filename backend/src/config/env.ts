import { isIP } from 'node:net';
import { isValidKid, type OutboxKeyring } from '../shared/crypto/outbox-cipher.js';

export type EmailProvider = 'fake' | 'resend';

export interface AppConfig {
  readonly port: number;
  readonly supabase: Readonly<{ url: string; anonKey: string; jwksUrl: string; serviceRoleKey: string }>;
  readonly allowedOrigins: readonly string[];
  /** `false` = ningún proxy; número = saltos de confianza; lista = IP o CIDR. Se pasa tal cual a `trust proxy`. */
  readonly trustedProxies: false | number | readonly string[];
  readonly secrets: Readonly<{ csrf: string; emailHmac: string; cursor: string; outboxKeyring: OutboxKeyring }>;
  /** Secreto compartido con el borde (rewrite de Vercel). Vacío = sin guard (desarrollo y pruebas). Ver ADR-004. */
  readonly edgeSecret: string;
  readonly production: boolean;
  /** Identidad técnica del worker (V13): usuario de Supabase Auth con rol interno `worker`. */
  readonly worker: Readonly<{ email: string; password: string; pollMs: number }>;
  /** Base de los enlaces de los correos (https, o http solo hacia localhost). */
  readonly appPublicUrl: string;
  readonly email: Readonly<{
    provider: EmailProvider;
    from: string;
    resendApiKey: string | undefined;
    /** Secreto de firma del webhook ya decodificado de `whsec_<base64>`. */
    resendWebhookSecret: Buffer | undefined;
    inboxAllowlist: readonly string[];
  }>;
}

type Source = Readonly<Record<string, string | undefined>>;
type Reject = (name: string) => void;

const DEFAULT_PORT = 3000;
const DEFAULT_WORKER_POLL_MS = 5000;
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
  const serviceRoleKey = parseServiceRoleKey(required(source, 'SUPABASE_SERVICE_ROLE_KEY', reject), anonKey, reject);
  const allowedOrigins = parseOrigins(read(source, 'ALLOWED_ORIGINS'), reject);
  const trustedProxies = parseTrustedProxies(read(source, 'TRUSTED_PROXIES'), reject);

  const csrf = parseSecret('CSRF_SECRET', required(source, 'CSRF_SECRET', reject), reject);
  const emailHmac = parseSecret('EMAIL_HMAC_SECRET', required(source, 'EMAIL_HMAC_SECRET', reject), reject);
  if (csrf && csrf === emailHmac) reject('EMAIL_HMAC_SECRET');
  const cursor = parseSecret('CURSOR_SECRET', required(source, 'CURSOR_SECRET', reject), reject);
  if (cursor && (cursor === csrf || cursor === emailHmac)) reject('CURSOR_SECRET');
  const edgeRaw = read(source, 'EDGE_SHARED_SECRET');
  const edgeSecret = edgeRaw === undefined ? '' : parseSecret('EDGE_SHARED_SECRET', edgeRaw, reject);
  if (edgeSecret && [csrf, emailHmac, cursor].includes(edgeSecret)) reject('EDGE_SHARED_SECRET');
  const outboxKeyring = parseOutboxKeyring(read(source, 'OUTBOX_KEYS'), read(source, 'OUTBOX_KEY_CURRENT'), reject);

  const provider = parseProvider(read(source, 'EMAIL_PROVIDER'), reject);
  const resendApiKey = provider === 'resend' ? required(source, 'RESEND_API_KEY', reject) : undefined;
  const inboxAllowlist = parseEmailList(read(source, 'EMAIL_INBOX_ALLOWLIST'), reject);
  const emailFrom = parseEmail('EMAIL_FROM', required(source, 'EMAIL_FROM', reject), reject);
  // Obligatorio con Resend; en modo falso es opcional y, si se define, habilita el webhook (pruebas y demo local).
  const webhookRaw = provider === 'resend' ? required(source, 'RESEND_WEBHOOK_SECRET', reject) : read(source, 'RESEND_WEBHOOK_SECRET');
  const resendWebhookSecret = webhookRaw === undefined ? undefined : parseWebhookSecret(webhookRaw, reject);
  const appPublicUrl = parseHttpUrl('APP_PUBLIC_URL', required(source, 'APP_PUBLIC_URL', reject), reject).replace(/\/$/, '');
  const worker = Object.freeze({
    email: parseEmail('WORKER_EMAIL', required(source, 'WORKER_EMAIL', reject), reject),
    password: required(source, 'WORKER_PASSWORD', reject),
    pollMs: parseBoundedInt('WORKER_POLL_MS', read(source, 'WORKER_POLL_MS'), 1000, 60000, DEFAULT_WORKER_POLL_MS, reject),
  });

  // Producción: sin valores de desarrollo (HTTP, sin proxies enumerados, sin guard de borde).
  // RENDER lo define la plataforma: fallar cerrado aunque falte NODE_ENV=production.
  const production = read(source, 'NODE_ENV') === 'production' || read(source, 'RENDER') !== undefined;
  if (production) {
    if (trustedProxies === false) reject('TRUSTED_PROXIES');
    if (allowedOrigins.length === 0 || !allowedOrigins.every((origin) => origin.startsWith('https://'))) reject('ALLOWED_ORIGINS');
    if (edgeSecret === '') reject('EDGE_SHARED_SECRET');
    if (!supabaseUrl.startsWith('https://')) reject('SUPABASE_URL');
    if (!appPublicUrl.startsWith('https://')) reject('APP_PUBLIC_URL');
  }

  if (failed.length > 0) throw new ConfigError(failed);

  return Object.freeze({
    port,
    supabase: Object.freeze({ url: supabaseUrl, anonKey, jwksUrl, serviceRoleKey }),
    allowedOrigins: Object.freeze(allowedOrigins),
    trustedProxies,
    secrets: Object.freeze({ csrf, emailHmac, cursor, outboxKeyring }),
    edgeSecret,
    production,
    worker,
    appPublicUrl,
    email: Object.freeze({
      provider,
      from: emailFrom,
      resendApiKey: resendApiKey || undefined,
      resendWebhookSecret,
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

function parseServiceRoleKey(raw: string, anonKey: string, reject: Reject): string {
  if (raw === '') return '';
  if (raw === anonKey || !(raw.startsWith('sb_secret_') || isServiceRoleJwt(raw))) {
    reject('SUPABASE_SERVICE_ROLE_KEY');
    return '';
  }
  return raw;
}

function parseEmail(name: string, raw: string, reject: Reject): string {
  if (raw === '') return '';
  if (!EMAIL_PATTERN.test(raw)) {
    reject(name);
    return '';
  }
  return raw;
}

function parseWebhookSecret(raw: string, reject: Reject): Buffer | undefined {
  if (raw === '') return undefined;
  const encoded = raw.startsWith('whsec_') ? raw.slice('whsec_'.length) : '';
  const secret = Buffer.from(encoded, 'base64');
  if (secret.length < 16 || secret.toString('base64') !== encoded) {
    reject('RESEND_WEBHOOK_SECRET');
    return undefined;
  }
  return secret;
}

function parseBoundedInt(name: string, raw: string | undefined, min: number, max: number, fallback: number, reject: Reject): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < min || value > max) {
    reject(name);
    return fallback;
  }
  return value;
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

const MAX_PROXY_HOPS = 5;

function isIpOrCidr(entry: string): boolean {
  const [address, prefix, ...rest] = entry.split('/');
  const family = isIP(address);
  if (family === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  // Un prefijo muy corto (p. ej. /0) confiaría en media Internet y permitiría falsificar X-Forwarded-For.
  const [min, max] = family === 4 ? [8, 32] : [16, 128];
  return Number(prefix) >= min && Number(prefix) <= max;
}

function parseTrustedProxies(raw: string | undefined, reject: Reject): false | number | readonly string[] {
  if (raw === undefined) return false;
  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    if (hops >= 1 && hops <= MAX_PROXY_HOPS) return hops;
    reject('TRUSTED_PROXIES');
    return false;
  }
  const entries = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0 || !entries.every(isIpOrCidr)) {
    reject('TRUSTED_PROXIES');
    return false;
  }
  return Object.freeze(entries);
}

function parseSecret(name: string, raw: string, reject: Reject): string {
  if (raw === '') return '';
  if (raw.length < MIN_SECRET_LENGTH) {
    reject(name);
    return '';
  }
  return raw;
}

function parseOutboxKeyring(rawKeys: string | undefined, currentKid: string | undefined, reject: Reject): OutboxKeyring {
  const keys = new Map<string, Buffer>();
  const fallback: OutboxKeyring = Object.freeze({ currentKid: '', keys });

  if (rawKeys === undefined) reject('OUTBOX_KEYS');
  if (currentKid === undefined) reject('OUTBOX_KEY_CURRENT');
  if (rawKeys === undefined || currentKid === undefined) return fallback;

  for (const entry of rawKeys.split(',').map((item) => item.trim()).filter(Boolean)) {
    const separator = entry.indexOf(':');
    const kid = separator === -1 ? '' : entry.slice(0, separator);
    const encoded = separator === -1 ? '' : entry.slice(separator + 1);
    const key = Buffer.from(encoded, 'base64');
    if (!isValidKid(kid) || keys.has(kid) || key.length !== OUTBOX_KEY_BYTES || key.toString('base64') !== encoded) {
      reject('OUTBOX_KEYS');
      continue;
    }
    keys.set(kid, key);
  }
  if (keys.size === 0) reject('OUTBOX_KEYS');
  if (!keys.has(currentKid)) reject('OUTBOX_KEY_CURRENT');

  return Object.freeze({ currentKid, keys });
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
