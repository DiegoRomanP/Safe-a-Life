import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startBackend, type RunningBackend } from '../support/app.js';
import { ApiClient, totpSecretFor } from '../support/client.js';
import { sql } from '../support/db.js';
import { HOSPITAL_IDS, SEED_USERS } from '../support/local-env.js';
import { freshTotpCode } from '../support/totp.js';

let backend: RunningBackend;

beforeAll(async () => {
  backend = await startBackend();
});

afterAll(async () => {
  await backend.close();
});

describe('renovación de sesión y cuota de Auth (A1)', () => {
  it('una avalancha de cookies de refresh falsas se corta con 429 y no impide un login legítimo', async () => {
    sql("delete from app.rate_limit_events where bucket = 'refresh:ip'");
    const attacker = new ApiClient(backend.baseUrl, '10.99.1.1');

    const statuses: number[] = [];
    for (let i = 0; i < 70; i += 1) {
      // Un atacante reenvía la cookie falsa siempre: el servidor la expira, pero él no la respeta.
      attacker.cookies.set('__Host-sal_rt', `refresh-falso-${String(i).padStart(4, '0')}`);
      statuses.push((await attacker.send('GET', '/api/v1/auth/session')).status);
    }

    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
    expect(statuses[0]).toBe(401);
    // Otra IP (otro usuario) sigue iniciando sesión con normalidad.
    const legit = new ApiClient(backend.baseUrl, '10.99.2.2');
    expect((await legit.login(SEED_USERS.donor1.email)).status).toBe(200);
    expect((await legit.send('GET', '/api/v1/auth/session')).status).toBe(200);
    sql("delete from app.rate_limit_events where bucket = 'refresh:ip'");
  });

  it('un refresh token con forma imposible no llega al proveedor y expira las cookies', async () => {
    const client = new ApiClient(backend.baseUrl, '10.99.3.3');
    client.cookies.set('__Host-sal_rt', 'x'.repeat(500));

    const response = await client.send('GET', '/api/v1/auth/session');

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().every((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
  });

  it('una sesión con access token vencido se renueva de forma transparente y reescribe ambas cookies', async () => {
    const client = new ApiClient(backend.baseUrl, '10.99.4.4');
    await client.login(SEED_USERS.donor2.email);
    client.cookies.set('__Host-sal_at', 'vencido-o-invalido');

    const response = await client.send('GET', '/api/v1/auth/session');

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join('\n')).toMatch(/__Host-sal_at=.*\n.*__Host-sal_rt=|__Host-sal_rt=.*\n.*__Host-sal_at=/s);
    expect(client.cookies.get('__Host-sal_at')).not.toBe('vencido-o-invalido');
  });
});

describe('MFA: código incorrecto, reutilización y límite', () => {
  it('un código TOTP incorrecto es 401 y una clave de MFA ya usada es 409', async () => {
    const client = new ApiClient(backend.baseUrl, '10.99.5.5');
    const login = await client.login(SEED_USERS.admin2.email, { mfa: false });
    const challengeId = login.json.data.mfaChallengeId as string;

    const wrong = await client.send('POST', '/api/v1/auth/mfa-verifications', { body: { challengeId, code: '000000' } });
    expect(wrong.status).toBe(401);

    const key = `clave-mfa-${Date.now()}-reuso`;
    const code = await freshTotpCode(totpSecretFor(SEED_USERS.admin2.email));
    const ok = await client.send('POST', '/api/v1/auth/mfa-verifications', { body: { challengeId, code }, key });
    await client.fetchCsrf();
    const reused = await client.send('POST', '/api/v1/auth/mfa-verifications', { body: { challengeId, code }, key });

    expect(ok.status).toBe(200);
    expect(reused.status).toBe(409);
  });

  it('tras 10 intentos de MFA el usuario recibe 429 con Retry-After', async () => {
    sql("delete from app.rate_limit_events where bucket = 'mfa:user'");
    const client = new ApiClient(backend.baseUrl, '10.99.6.6');
    const login = await client.login(SEED_USERS.admin2.email, { mfa: false });
    const challengeId = login.json.data.mfaChallengeId as string;

    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 12; i += 1) {
      const response = await client.send('POST', '/api/v1/auth/mfa-verifications', { body: { challengeId, code: '000000' } });
      statuses.push(response.status);
      if (response.status === 429) retryAfter = response.headers.get('retry-after');
    }

    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(10)).toContain(429);
    expect(Number(retryAfter)).toBeGreaterThan(0);
    sql("delete from app.rate_limit_events where bucket = 'mfa:user'");
  });
});

describe('CSRF, nombres largos y tiempo de respuesta', () => {
  it('una mutación con sesión pero sin X-CSRF-Token es 403', async () => {
    const client = new ApiClient(backend.baseUrl, '10.99.7.7');
    await client.login(SEED_USERS.superadmin.email);

    const response = await client.send('POST', '/api/v1/superadmin/hospitals', {
      body: { publicName: 'Sin CSRF', legalName: 'Sin CSRF S.A.' }, headers: { 'x-csrf-token': '' },
    });

    expect(response.status).toBe(403);
    expect(sql("select count(*) from app.hospitals where public_name = 'Sin CSRF'")).toBe('0');
  });

  it('un hospital con nombre de 160 caracteres no rompe la sesión de su admin (displayName ≤ 120)', async () => {
    const original = sql(`select public_name from app.hospitals where hospital_id = '${HOSPITAL_IDS[0]}'`);
    sql(`update app.hospitals set public_name = repeat('H', 160) where hospital_id = '${HOSPITAL_IDS[0]}'`);
    try {
      const client = new ApiClient(backend.baseUrl, '10.99.8.8');
      const login = await client.login(SEED_USERS.admin1.email);
      const session = await client.send('GET', '/api/v1/auth/session');

      expect(login.status).toBe(200);
      expect(session.status).toBe(200);
      expect(session.json.data.actor.displayName).toHaveLength(120);
      expect(session.json.data.actor.hospitalName).toHaveLength(160);
    } finally {
      sql(`update app.hospitals set public_name = '${original.replace(/'/g, "''")}' where hospital_id = '${HOSPITAL_IDS[0]}'`);
    }
  });

  it('un login fallido tarda al menos el piso configurado (no distingue cuentas por tiempo)', async () => {
    const client = new ApiClient(backend.baseUrl, '10.99.9.9');
    const started = Date.now();
    const response = await client.send('POST', '/api/v1/auth/sessions', { body: { email: 'nadie-tiempo@example.test', password: 'contrasena-equivocada-1' } });

    expect(response.status).toBe(401);
    expect(Date.now() - started).toBeGreaterThanOrEqual(380);
  });
});

describe('salud y guard de borde', () => {
  it('readiness responde 200 contra la base real con la versión de migraciones esperada', async () => {
    const response = await fetch(`${backend.baseUrl}/health/ready`);
    expect(response.status).toBe(200);
  });

  it('con EDGE_SHARED_SECRET las peticiones directas son 403 salvo /health y el borde pasa', async () => {
    const edge = await startBackend({ EDGE_SHARED_SECRET: 'e'.repeat(48) });
    try {
      const direct = await fetch(`${edge.baseUrl}/api/v1/auth/session`);
      const health = await fetch(`${edge.baseUrl}/health/live`);
      const through = await fetch(`${edge.baseUrl}/api/v1/auth/session`, { headers: { 'x-edge-secret': 'e'.repeat(48) } });

      expect(direct.status).toBe(403);
      expect(health.status).toBe(200);
      expect(through.status).toBe(401);
      expect(edge.logLines.join('\n')).toContain('seguridad.rechazo');
    } finally {
      await edge.close();
    }
  });
});
