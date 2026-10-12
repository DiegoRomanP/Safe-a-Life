import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface LocalSupabase {
  readonly apiUrl: string;
  readonly dbUrl: string;
  readonly publishableKey: string;
  readonly secretKey: string;
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/** Lee la URL y las claves del Supabase LOCAL desde `supabase status`. Se niega a usar hosts remotos. */
export function readLocalSupabase(root = resolve(import.meta.dirname, '../../..')): LocalSupabase {
  const raw = execFileSync('supabase', ['status', '-o', 'json', '--workdir', 'backend'], { cwd: root, encoding: 'utf8' });
  const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>;
  const local: LocalSupabase = {
    apiUrl: status.API_URL,
    dbUrl: status.DB_URL,
    publishableKey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    secretKey: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
  };
  if (!LOCAL_HOSTS.has(new URL(local.apiUrl).hostname) || !LOCAL_HOSTS.has(new URL(local.dbUrl).hostname)) {
    throw new Error('Supabase no es local: se aborta.');
  }
  return local;
}

/** Entorno válido del backend apuntando al Supabase local, con secretos sintéticos de prueba. */
export function backendEnvFor(local: LocalSupabase, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    SUPABASE_URL: local.apiUrl,
    SUPABASE_ANON_KEY: local.publishableKey,
    SUPABASE_JWKS_URL: `${local.apiUrl}/auth/v1/.well-known/jwks.json`,
    SUPABASE_SERVICE_ROLE_KEY: local.secretKey,
    CSRF_SECRET: 'integration-csrf-secret-sintetico-0001',
    EMAIL_HMAC_SECRET: 'integration-email-hmac-sintetico-02',
    CURSOR_SECRET: 'integration-cursor-secret-sintetico-3',
    OUTBOX_KEYS: `k1:${Buffer.alloc(32, 11).toString('base64')}`,
    OUTBOX_KEY_CURRENT: 'k1',
    EMAIL_PROVIDER: 'fake',
    EMAIL_FROM: 'no-responder@example.test',
    APP_PUBLIC_URL: 'http://127.0.0.1:5173',
    ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
    WORKER_EMAIL: SEED_USERS.worker.email,
    WORKER_PASSWORD: DEMO_PASSWORD,
    TRUSTED_PROXIES: '',
    ...overrides,
  };
}

export const DEMO_PASSWORD = 'Demo-Password-Sintetica-2026';

export type SeedRole = 'donante' | 'admin_hospitalario' | 'superadmin' | 'worker';

export interface SeedUser {
  readonly email: string;
  readonly role: SeedRole;
  readonly hospitalId?: string;
  readonly mfa: boolean;
}

export const HOSPITAL_IDS = Object.freeze([
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
  '11111111-1111-4111-8111-111111111103',
] as const);

export const SITE_IDS = Object.freeze({
  hospital1Active: '22222222-2222-4222-8222-222222222201',
  hospital1Inactive: '22222222-2222-4222-8222-222222222202',
  hospital2Active: '22222222-2222-4222-8222-222222222203',
  hospital2Unapproved: '22222222-2222-4222-8222-222222222204',
  hospital3Active: '22222222-2222-4222-8222-222222222205',
});

export const SEED_USERS = Object.freeze({
  superadmin: { email: 'superadmin@example.test', role: 'superadmin', mfa: true },
  admin1: { email: 'admin1@example.test', role: 'admin_hospitalario', hospitalId: HOSPITAL_IDS[0], mfa: true },
  admin2: { email: 'admin2@example.test', role: 'admin_hospitalario', hospitalId: HOSPITAL_IDS[1], mfa: true },
  admin3: { email: 'admin3@example.test', role: 'admin_hospitalario', hospitalId: HOSPITAL_IDS[2], mfa: true },
  donor1: { email: 'donor1@example.test', role: 'donante', mfa: false },
  donor2: { email: 'donor2@example.test', role: 'donante', mfa: false },
  worker: { email: 'worker@example.test', role: 'worker', mfa: false },
} satisfies Record<string, SeedUser>);
