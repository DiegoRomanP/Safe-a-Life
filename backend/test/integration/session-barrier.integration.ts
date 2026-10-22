import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startBackend, type RunningBackend } from '../support/app.js';
import { createDonorAccount, latestSealed } from '../support/accounts.js';
import { ApiClient, totpSecretFor } from '../support/client.js';
import { freshTotpCode } from '../support/totp.js';
import { resetAuthQuota, sql } from '../support/db.js';
import { readLocalSupabase, SEED_USERS } from '../support/local-env.js';
import { isBlockedBy, PsqlSession, until } from '../support/psql-session.js';

// ADR-007 (SP-01). Ejecutar con vitest directo (no resetea la base), como EQ1.
const REGISTER = '/api/v1/donor-registrations';
const VERIFY = (token: string) => `/api/v1/donor-email-verification-actions/${token}`;
const RECOVERY = '/api/v1/auth/password-recovery-requests';
const RESET = (token: string) => `/api/v1/auth/password-reset-actions/${token}`;
const SESSION = '/api/v1/auth/session';
const ONBOARDING = '/api/v1/donors/me/onboarding-profile';
const OLD_PASSWORD = 'contrasena-del-registrante-2026';
const NEW_PASSWORD = 'contrasena-del-dueno-2026';
const LIMA = { latitude: -12.046, longitude: -77.043 };

let backend: RunningBackend;

beforeAll(async () => {
  backend = await startBackend();
}, 120_000);

beforeEach(() => {
  resetAuthQuota();
});

afterAll(async () => {
  await backend.close();
});

const emailFor = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.test`;
const anonymous = () => new ApiClient(backend.baseUrl);
const sessionIdOf = (jwt: string): string => (JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as { session_id: string }).session_id;
const userIdOf = (email: string) => sql(`select id from auth.users where email = '${email}'`);

/** Sesión abierta DIRECTAMENTE contra Auth (sin pasar por el login de Express): el access token y su refresh token. */
async function authTokens(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
  const local = readLocalSupabase();
  const response = await fetch(`${local.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: local.publishableKey, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const body = (await response.json()) as { access_token: string; refresh_token: string };
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

/** RPC directa a PostgREST con el JWT dado (el camino del fallo). */
async function rpc(name: string, args: Record<string, unknown>, token: string): Promise<{ status: number; body: any }> {
  const local = readLocalSupabase();
  const response = await fetch(`${local.apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: local.publishableKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', 'content-profile': 'api' },
    body: JSON.stringify(args),
  });
  return { status: response.status, body: await response.json().catch(() => undefined) };
}

const completeOnboarding = (token: string) => rpc('complete_own_onboarding', {
  p_key: randomUUID(), p_hash: 'x', p_name: 'Intruso', p_blood_type: 'O_POS', p_available: true,
  p_latitude: LIMA.latitude, p_longitude: LIMA.longitude, p_polygon_version: 'DEMO_ONLY-1',
}, token);

/** Registro + sesión directa del registrante + verificación + reset por HTTP (el escenario del fallo SP-01). */
async function takeOver(label: string) {
  const email = emailFor(label);
  expect((await anonymous().send('POST', REGISTER, { body: { email, password: OLD_PASSWORD } })).status).toBe(202);
  const attackerClient = anonymous();
  expect((await attackerClient.login(email, { password: OLD_PASSWORD })).status).toBe(200);
  const attacker = await authTokens(email, OLD_PASSWORD);
  expect((await anonymous().send('POST', VERIFY(latestSealed('verificacion_email', email).token))).status).toBe(200);
  const setup = latestSealed('recuperacion', email);
  expect((await anonymous().send('POST', RESET(setup.token), { body: { newPassword: NEW_PASSWORD } })).status).toBe(200);
  return { email, attackerClient, attacker };
}

describe('reset de contraseña tras un autorregistro ajeno', () => {
  it('el JWT y la cookie anteriores al reset quedan denegados en PostgREST y en Express; el dueño completa el perfil', async () => {
    const { email, attackerClient, attacker } = await takeOver('victima');

    const direct = await completeOnboarding(attacker.accessToken);
    expect(JSON.stringify(direct.body)).toContain('unauthenticated');
    expect(JSON.stringify(direct.body)).not.toContain('activo');
    expect((await attackerClient.send('GET', SESSION)).status).toBe(401);
    expect(sql(`select status from app.donor_profiles where donor_id = '${userIdOf(email)}'`)).toBe('incompleto');
    // La barrera quedó cerrada tras el reset completo.
    expect(sql(`select state from app.session_barriers where user_id = '${userIdOf(email)}'`)).toBe('cerrada');

    const owner = anonymous();
    expect((await owner.login(email, { password: NEW_PASSWORD })).status).toBe(200);
    expect((await owner.send('GET', SESSION)).status).toBe(200);
    expect((await owner.send('PUT', ONBOARDING, { body: { name: 'Ana Sintética', declaredBloodType: 'O_POS', isAvailable: true, approximateLocation: LIMA } })).status).toBe(200);
  });

  it('una sesión abierta directamente contra Auth con la contraseña nueva nunca se admite', async () => {
    const { email } = await takeOver('directa');

    const direct = await authTokens(email, NEW_PASSWORD);

    expect(JSON.stringify((await completeOnboarding(direct.accessToken)).body)).toContain('unauthenticated');
  });

  it('el refresh de una sesión no admitida conserva el session_id y sigue denegada', async () => {
    const { email, attacker } = await takeOver('refresco');
    // El reset revocó las sesiones: se abre otra por Auth con la contraseña nueva y se refresca.
    const direct = await authTokens(email, NEW_PASSWORD);
    const local = readLocalSupabase();
    const refreshed = await fetch(`${local.apiUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: local.publishableKey, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: direct.refreshToken }),
    }).then((response) => response.json() as Promise<{ access_token: string }>);

    expect(JSON.stringify((await completeOnboarding(refreshed.access_token)).body)).toContain('unauthenticated');
    expect(attacker.accessToken).not.toBe(refreshed.access_token);
  });
});

describe('compatibilidad y supuesto S1', () => {
  it('un usuario sin barrera conserva sus sesiones tras un login normal (regresión)', async () => {
    const client = anonymous();
    expect((await client.login(SEED_USERS.donor1.email)).status).toBe(200);
    expect((await client.send('GET', SESSION)).status).toBe(200);
  });

  it('S1: un refresh REAL de Auth conserva el session_id y la sesión admitida sigue autorizada en PostgREST y Express', { timeout: 120_000 }, async () => {
    const email = await createDonorAccount(OLD_PASSWORD);
    expect((await anonymous().send('POST', RECOVERY, { body: { email } })).status).toBe(202);
    expect((await anonymous().send('POST', RESET(latestSealed('recuperacion', email).token), { body: { newPassword: NEW_PASSWORD } })).status).toBe(200);
    expect(sql(`select state from app.session_barriers where user_id = '${userIdOf(email)}'`)).toBe('cerrada');

    const client = anonymous();
    expect((await client.login(email, { password: NEW_PASSWORD })).status).toBe(200);
    const before = client.cookies.get('__Host-sal_at') as string;
    const admitted = sql(`select session_id from app.admitted_sessions where user_id = '${userIdOf(email)}'`);
    expect(sessionIdOf(before)).toBe(admitted);

    const local = readLocalSupabase();
    const refreshed = await fetch(`${local.apiUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: local.publishableKey, 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: client.cookies.get('__Host-sal_rt') }),
    }).then((response) => response.json() as Promise<{ access_token: string; refresh_token: string }>);

    expect(refreshed.access_token).not.toBe(before);
    expect(sessionIdOf(refreshed.access_token)).toBe(admitted); // S1: GoTrue conserva el session_id al refrescar
    const actor = await rpc('current_actor', {}, refreshed.access_token);
    expect(actor.body?.role).toBe('donante');
    const renewed = anonymous();
    renewed.cookies.set('__Host-sal_at', refreshed.access_token);
    expect((await renewed.send('GET', SESSION)).status).toBe(200);
  });

  it('S1: la verificación MFA (AAL1 a AAL2) conserva el session_id y la sesión admitida sigue autorizada', { timeout: 120_000 }, async () => {
    const admin = SEED_USERS.admin2.email;
    sql(`insert into app.session_barriers (user_id, generation, state) values ('${userIdOf(admin)}', 1, 'cerrada') on conflict (user_id) do update set state = 'cerrada', generation = app.session_barriers.generation + 1`);
    try {
      const adminClient = anonymous();
      const first = await adminClient.login(admin, { mfa: false });
      expect(first.status).toBe(200);
      expect(first.json.data).toMatchObject({ aal: 1, mfaRequired: true });
      const aal1 = adminClient.cookies.get('__Host-sal_at') as string;
      const admitted = sql(`select session_id from app.admitted_sessions where user_id = '${userIdOf(admin)}'`);
      expect(sessionIdOf(aal1)).toBe(admitted);

      const verified = await adminClient.send('POST', '/api/v1/auth/mfa-verifications', {
        body: { challengeId: first.json.data.mfaChallengeId, code: await freshTotpCode(totpSecretFor(admin)) },
      });
      expect(verified.status).toBe(200);
      const aal2 = adminClient.cookies.get('__Host-sal_at') as string;
      expect(aal2).not.toBe(aal1);
      expect(sessionIdOf(aal2)).toBe(admitted); // S1: el ascenso a AAL2 conserva el session_id
      await adminClient.fetchCsrf();
      expect((await adminClient.send('GET', '/api/v1/hospitals/me/sites')).status).toBe(200);
    } finally {
      sql(`delete from app.session_barriers where user_id = '${userIdOf(admin)}'`);
    }
  });
});

describe('concurrencia entre admit_session y consume_password_reset', () => {
  let admitter: PsqlSession;
  let resetter: PsqlSession;
  let observer: PsqlSession;
  beforeAll(() => { admitter = new PsqlSession(); resetter = new PsqlSession(); observer = new PsqlSession(); });
  afterAll(() => { for (const s of [admitter, resetter, observer]) s.close(); });

  it('una admisión que espera el advisory lock mientras el reset lo tiene resulta en conflict', { timeout: 60_000 }, async () => {
    const email = await createDonorAccount(OLD_PASSWORD);
    const userId = userIdOf(email);
    const tokenHash = 'e'.repeat(64);
    sql(`insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values ('${tokenHash}', 'recuperacion', '${userId}', now() + interval '1 hour')`);
    // Ticket y sesión de Auth reales: el ticket se emite ANTES del reset (login en vuelo).
    const [admitterPid, resetterPid] = [await admitter.pid(), await resetter.pid()];
    const technical = (session: PsqlSession) => session.run(`set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userIdOf(SEED_USERS.apiTechnical.email)}","role":"authenticated","aal":"aal1"}', false);`);
    await technical(admitter);
    await technical(resetter);
    const ticket = (await admitter.run(`select api.issue_login_ticket('${email}') ->> 'ticketId';`)).out;
    expect(ticket).toMatch(/^[0-9a-f-]{36}$/);

    // El reset abre la barrera y retiene su transacción (y el advisory lock) hasta el commit.
    await resetter.run(`begin; select api.consume_password_reset('${tokenHash}');`);
    const admission = admitter.run(`select api.admit_session('${ticket}', '${userId}', '${randomUUID()}') ->> 'kind';`);
    await until(isBlockedBy(observer, admitterPid, resetterPid), 'la admisión espera al advisory lock del reset');
    await resetter.run('commit;');

    expect((await admission).out).toBe('conflict');
    expect(sql(`select count(*) from app.admitted_sessions where user_id = '${userId}'`)).toBe('0');
  });
});
