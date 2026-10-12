/** Entorno válido y sintético para pruebas. Nunca contiene valores reales. */
export function validEnvSource(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    SUPABASE_URL: 'https://proyecto.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_test',
    SUPABASE_JWKS_URL: 'https://proyecto.supabase.co/auth/v1/.well-known/jwks.json',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
    CSRF_SECRET: 'c'.repeat(40),
    EMAIL_HMAC_SECRET: 'e'.repeat(40),
    CURSOR_SECRET: 'u'.repeat(40),
    OUTBOX_KEYS: `k1:${Buffer.alloc(32, 7).toString('base64')}`,
    OUTBOX_KEY_CURRENT: 'k1',
    EMAIL_FROM: 'no-responder@example.test',
    APP_PUBLIC_URL: 'https://app.example.test',
    WORKER_EMAIL: 'worker@example.test',
    WORKER_PASSWORD: 'contrasena-sintetica-del-worker',
    ...overrides,
  };
}
