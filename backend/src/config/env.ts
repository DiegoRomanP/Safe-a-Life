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
  /**
   * Identidad técnica del worker (V13): usuario de Supabase Auth con rol interno `worker`; opera el outbox. Solo la lee el
   * proceso del worker: en el de la API queda vacía.
   */
  readonly worker: Readonly<{ email: string; password: string; pollMs: number }>;
  /**
   * Identidad técnica de la API (rol interno `api_technical`): webhook firmado y RPC de tokens de acción. No puede operar el
   * outbox (F4 M-2). Solo la lee el proceso de la API: en el del worker queda vacía.
   */
  readonly apiTechnical: Readonly<{ email: string; password: string }>;
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

/**
 * Configuración del proceso worker: sin secretos de la API (CSRF, cursor, borde, orígenes, proxies, service_role, JWKS,
 * webhook ni credencial `api_technical`). Conserva `emailHmac` (clave derivada del ledger de purgas) y el keyring del outbox.
 * Un `AppConfig` completo también la satisface (pruebas de integración).
 */
export interface WorkerConfig {
  readonly supabase: Readonly<{ url: string; anonKey: string }>;
  readonly secrets: Readonly<{ emailHmac: string; outboxKeyring: OutboxKeyring }>;
  readonly production: boolean;
  readonly worker: Readonly<{ email: string; password: string; pollMs: number }>;
  readonly appPublicUrl: string;
  readonly email: Readonly<{ provider: EmailProvider; from: string; resendApiKey: string | undefined; inboxAllowlist: readonly string[] }>;
}

/** Configuración de la API: es `AppConfig` con `scope: 'api'` (sin WORKER_*); `all` exige ambas identidades (pruebas). */
export type ApiConfig = AppConfig;

/** Qué configuración de la API se carga: cada proceso exige solo la credencial técnica que usa (mínimo privilegio). */
export type ConfigScope = 'api' | 'all';

function isProduction(source: Source): boolean {
  // RENDER lo define la plataforma: fallar cerrado aunque falte NODE_ENV=production.
  return read(source, 'NODE_ENV') === 'production' || read(source, 'RENDER') !== undefined;
}

/** Parser explícito del worker: valida solo lo que consume (ver `WorkerConfig`). Las reglas de producción aplican igual. */
export function parseWorkerEnv(source: Source): WorkerConfig {
  const failed: string[] = [];
  const reject: Reject = (name) => {
    if (!failed.includes(name)) failed.push(name);
  };
  const supabaseUrl = parseHttpUrl('SUPABASE_URL', required(source, 'SUPABASE_URL', reject), reject);
  const anonKey = parseAnonKey(required(source, 'SUPABASE_ANON_KEY', reject), reject);
  const emailHmac = parseSecret('EMAIL_HMAC_SECRET', required(source, 'EMAIL_HMAC_SECRET', reject), reject);
  const outboxKeyring = parseOutboxKeyring(read(source, 'OUTBOX_KEYS'), read(source, 'OUTBOX_KEY_CURRENT'), reject);
  const email = parseEmailSettings(source, reject);
  const appPublicUrl = parseHttpUrl('APP_PUBLIC_URL', required(source, 'APP_PUBLIC_URL', reject), reject).replace(/\/$/, '');
  const worker = Object.freeze({
    email: parseEmail('WORKER_EMAIL', required(source, 'WORKER_EMAIL', reject), reject),
    password: parseTechnicalPassword('WORKER_PASSWORD', required(source, 'WORKER_PASSWORD', reject), reject),
    pollMs: parseBoundedInt('WORKER_POLL_MS', read(source, 'WORKER_POLL_MS'), 1000, 60000, DEFAULT_WORKER_POLL_MS, reject),
  });
  const production = isProduction(source);
  if (production) {
    if (!supabaseUrl.startsWith('https://')) reject('SUPABASE_URL');
    if (!appPublicUrl.startsWith('https://')) reject('APP_PUBLIC_URL');
    if (email.provider === 'fake') reject('EMAIL_PROVIDER');
    if (worker.password.length < 32) reject('WORKER_PASSWORD');
  }
  if (failed.length > 0) throw new ConfigError(failed);
  return Object.freeze({
    supabase: Object.freeze({ url: supabaseUrl, anonKey }),
    secrets: Object.freeze({ emailHmac, outboxKeyring }),
    production,
    worker,
    appPublicUrl,
    email: Object.freeze(email),
  });
}

/** Parser explícito de la API (no exige WORKER_*). */
export function parseApiEnv(source: Source): ApiConfig {
  return parseEnv(source, 'api');
}

function parseEmailSettings(source: Source, reject: Reject) {
  const provider = parseProvider(read(source, 'EMAIL_PROVIDER'), reject);
  const resendApiKey = provider === 'resend' ? required(source, 'RESEND_API_KEY', reject) : undefined;
  const inboxAllowlist = Object.freeze(parseEmailList(read(source, 'EMAIL_INBOX_ALLOWLIST'), reject));
  const from = parseEmail('EMAIL_FROM', required(source, 'EMAIL_FROM', reject), reject);
  return { provider, from, resendApiKey: resendApiKey || undefined, inboxAllowlist };
}

export function parseEnv(source: Source, scope: ConfigScope = 'all'): AppConfig {
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

  const emailSettings = parseEmailSettings(source, reject);
  const { provider } = emailSettings;
  // Obligatorio con Resend; en modo falso es opcional y, si se define, habilita el webhook (pruebas y demo local).
  const webhookRaw = provider === 'resend' ? required(source, 'RESEND_WEBHOOK_SECRET', reject) : read(source, 'RESEND_WEBHOOK_SECRET');
  const resendWebhookSecret = webhookRaw === undefined ? undefined : parseWebhookSecret(webhookRaw, reject);
  const appPublicUrl = parseHttpUrl('APP_PUBLIC_URL', required(source, 'APP_PUBLIC_URL', reject), reject).replace(/\/$/, '');
  const wantsWorker = scope === 'all';
  const wantsApi = true;
  const worker = Object.freeze({
    email: wantsWorker ? parseEmail('WORKER_EMAIL', required(source, 'WORKER_EMAIL', reject), reject) : '',
    password: wantsWorker ? parseTechnicalPassword('WORKER_PASSWORD', required(source, 'WORKER_PASSWORD', reject), reject) : '',
    pollMs: wantsWorker ? parseBoundedInt('WORKER_POLL_MS', read(source, 'WORKER_POLL_MS'), 1000, 60000, DEFAULT_WORKER_POLL_MS, reject) : DEFAULT_WORKER_POLL_MS,
  });
  const apiTechnical = Object.freeze({
    email: wantsApi ? parseEmail('API_TECHNICAL_EMAIL', required(source, 'API_TECHNICAL_EMAIL', reject), reject) : '',
    password: wantsApi ? parseTechnicalPassword('API_TECHNICAL_PASSWORD', required(source, 'API_TECHNICAL_PASSWORD', reject), reject) : '',
  });
  // Dos usuarios distintos: si fueran el mismo, la API volvería a poder operar el outbox.
  if (wantsWorker && wantsApi && worker.email !== '' && worker.email === apiTechnical.email) reject('API_TECHNICAL_EMAIL');

  // Producción: sin valores de desarrollo (HTTP, sin proxies enumerados, sin guard de borde).
  const production = isProduction(source);
  if (production) {
    if (trustedProxies === false) reject('TRUSTED_PROXIES');
    if (allowedOrigins.length === 0 || !allowedOrigins.every((origin) => origin.startsWith('https://'))) reject('ALLOWED_ORIGINS');
    if (edgeSecret === '') reject('EDGE_SHARED_SECRET');
    if (!supabaseUrl.startsWith('https://')) reject('SUPABASE_URL');
    if (!appPublicUrl.startsWith('https://')) reject('APP_PUBLIC_URL');
    // El remitente falso descarta los correos con resultado «ok»: en producción sería una pérdida silenciosa.
    if (provider === 'fake') reject('EMAIL_PROVIDER');
    // La credencial técnica equivale a operar el outbox y las recuperaciones: en producción, aleatoria y larga.
    if (wantsWorker && worker.password.length < 32) reject('WORKER_PASSWORD');
    if (wantsApi && apiTechnical.password.length < 32) reject('API_TECHNICAL_PASSWORD');
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
    apiTechnical,
    appPublicUrl,
    email: Object.freeze({
      provider,
      from: emailSettings.from,
      resendApiKey: emailSettings.resendApiKey,
      resendWebhookSecret,
      inboxAllowlist: emailSettings.inboxAllowlist,
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

/** Las sesiones técnicas protegen el outbox y los tokens de acción: una contraseña corta no es aceptable (mínimo 12 caracteres). */
function parseTechnicalPassword(name: string, raw: string, reject: Reject): string {
  if (raw !== '' && raw.length < 12) reject(name);
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
