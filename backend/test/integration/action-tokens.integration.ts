import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startBackend, type RunningBackend } from '../support/app.js';
import { createDonorAccount, latestSealed, signUpAuthOnly } from '../support/accounts.js';
import { readLocalSupabase } from '../support/local-env.js';
import { ApiClient, observed } from '../support/client.js';
import { undeclaredStatuses } from '../support/contract-statuses.js';
import { resetAuthQuota, sql } from '../support/db.js';
import { HOSPITAL_IDS, SEED_USERS } from '../support/local-env.js';

const INVITE = '/api/v1/superadmin/hospital-admin-invitations';
const PREVIEW = (token: string) => `/api/v1/hospital-admin-invitation-actions/${token}`;
const CLAIM = (token: string) => `${PREVIEW(token)}/claim`;
const RECOVERY = '/api/v1/auth/password-recovery-requests';
const RESET = (token: string) => `/api/v1/auth/password-reset-actions/${token}`;
const NEW_PASSWORD = 'contrasena-nueva-segura-2026';

let backend: RunningBackend;
let superadmin: ApiClient;
let donor: ApiClient;

beforeEach(() => {
  resetAuthQuota();
});

beforeAll(async () => {
  backend = await startBackend();
  superadmin = new ApiClient(backend.baseUrl);
  donor = new ApiClient(backend.baseUrl);
  expect((await superadmin.login(SEED_USERS.superadmin.email)).status).toBe(200);
  expect((await donor.login(SEED_USERS.donor1.email)).status).toBe(200);
  expect((await superadmin.stepUp(SEED_USERS.superadmin.email)).status).toBe(200);
});

afterAll(async () => {
  await backend.close();
});

const emailFor = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.test`;
const invite = (email: string, hospitalId: string = HOSPITAL_IDS[0], key?: string) =>
  superadmin.send('POST', INVITE, { body: { email, hospitalId }, ...(key ? { key } : {}) });

describe('invitar a un admin hospitalario', () => {
  it('con AAL2 y step-up responde 202 neutro, encola el correo cifrado y guarda solo el hash del token', async () => {
    const email = emailFor('invitado');

    const response = await invite(email);

    expect(response.status).toBe(202);
    expect(Object.keys(response.json.data)).toEqual(['message']);
    const sealed = latestSealed('invitacion_admin', email);
    expect(sealed.hospitalName).toBe('Hospital Demo Uno');
    expect(sql(`select count(*) from app.action_tokens where token_hash = encode(sha256(convert_to('${sealed.token}', 'UTF8')), 'hex') and kind = 'invitacion_admin'`)).toBe('1');
    expect(sql(`select count(*) from app.action_tokens where token_hash = '${sealed.token}'`)).toBe('0');
    expect(sql(`select sealed_payload from app.email_outbox where outbox_id = '${sealed.outboxId}'`)).not.toContain(sealed.token);
    expect(sql(`select count(*) from app.audit_events where event = 'admin.invitado' and reason is null`)).not.toBe('0');
  });

  it('el replay con la misma clave no encola otro correo y otra intención con la misma clave es 409', async () => {
    const email = emailFor('replay');
    const key = randomUUID();

    expect((await invite(email, HOSPITAL_IDS[0], key)).status).toBe(202);
    expect((await invite(email, HOSPITAL_IDS[0], key)).status).toBe(202);
    expect((await invite(emailFor('otro'), HOSPITAL_IDS[0], key)).status).toBe(409);

    expect(sql(`select count(*) from app.admin_invitations where email = '${email}'`)).toBe('1');
  });

  // El login de un admin espera una ventana TOTP nueva (hasta 30 s) si otro archivo ya usó este usuario.
  // La ausencia de step-up (403 STEP_UP_REQUIRED) la cubre pgTAP: un login recién hecho ya cuenta como step-up 300 s.
  it('un donante, un admin y un anónimo no invitan y no se crea nada', { timeout: 90_000 }, async () => {
    const admin = new ApiClient(backend.baseUrl);
    await admin.login(SEED_USERS.admin1.email);
    const before = sql('select count(*) from app.admin_invitations');

    const asDonor = await donor.send('POST', INVITE, { body: { email: emailFor('x'), hospitalId: HOSPITAL_IDS[0] } });
    const asAdmin = await admin.send('POST', INVITE, { body: { email: emailFor('x'), hospitalId: HOSPITAL_IDS[0] } });
    const anonymous = await new ApiClient(backend.baseUrl).send('POST', INVITE, { body: { email: emailFor('x'), hospitalId: HOSPITAL_IDS[0] } });

    expect([asDonor.status, asAdmin.status]).toEqual([403, 403]);
    expect(anonymous.status).toBe(401);
    expect(sql('select count(*) from app.admin_invitations')).toBe(before);
  });

  it('un correo que ya tiene cuenta es 409, un hospital inexistente 422 y un hospital sin autorizar 409', async () => {
    expect((await invite(SEED_USERS.admin1.email)).status).toBe(409);
    expect((await invite(SEED_USERS.donor1.email)).status).toBe(409);
    expect((await invite(emailFor('x'), randomUUID())).status).toBe(422);
    sql(`update app.hospitals set is_authorized = false where hospital_id = '${HOSPITAL_IDS[2]}'`);
    try {
      expect((await invite(emailFor('x'), HOSPITAL_IDS[2])).status).toBe(409);
    } finally {
      sql(`update app.hospitals set is_authorized = true where hospital_id = '${HOSPITAL_IDS[2]}'`);
    }
  });

  it('valida la forma del cuerpo: correo inválido, campos extra y hospitalId no UUID son 400', async () => {
    expect((await superadmin.send('POST', INVITE, { body: { email: 'no-es-correo', hospitalId: HOSPITAL_IDS[0] } })).status).toBe(400);
    expect((await superadmin.send('POST', INVITE, { body: { email: emailFor('x'), hospitalId: HOSPITAL_IDS[0], role: 'superadmin' } })).status).toBe(400);
    expect((await superadmin.send('POST', INVITE, { body: { email: emailFor('x'), hospitalId: 'no-uuid' } })).status).toBe(400);
  });
});

describe('vista previa y reclamo de la invitación', () => {
  it('la vista previa muestra solo hospital, rol y vencimiento (nunca el correo) y rechaza tokens inválidos', async () => {
    const email = emailFor('preview');
    await invite(email);
    const { token } = latestSealed('invitacion_admin', email);
    const anonymous = new ApiClient(backend.baseUrl);

    const ok = await anonymous.send('GET', PREVIEW(token));
    const unknown = await anonymous.send('GET', PREVIEW('a'.repeat(43)));
    const malformed = await anonymous.send('GET', PREVIEW('corto'));

    expect(ok.status).toBe(200);
    expect(ok.json.data).toMatchObject({ hospitalName: 'Hospital Demo Uno', role: 'admin_hospitalario' });
    expect(Object.keys(ok.json.data).sort()).toEqual(['expiresAt', 'hospitalName', 'role']);
    expect(ok.text).not.toContain(email);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(ok.headers.get('referrer-policy')).toBe('no-referrer');
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(400);
  });

  it('reclamar crea la cuenta, la membresía y una sesión AAL1 que exige MFA; el token no se reutiliza', async () => {
    const email = emailFor('reclamo');
    await invite(email);
    const { token } = latestSealed('invitacion_admin', email);
    const claimant = new ApiClient(backend.baseUrl, '10.99.31.1');

    const claimed = await claimant.send('POST', CLAIM(token), { body: { password: NEW_PASSWORD } });

    expect(claimed.status).toBe(201);
    expect(claimed.json.data).toEqual({ actor: { role: 'admin_hospitalario', displayName: 'Hospital Demo Uno', hospitalName: 'Hospital Demo Uno' }, aal: 1, mfaRequired: true });
    expect(claimed.headers.getSetCookie().join('\n')).toMatch(/__Host-sal_at=.*HttpOnly; Secure; SameSite=Lax/);
    expect(sql(`select role from app.user_accounts where user_id = (select id from auth.users where email = '${email}')`)).toBe('admin_hospitalario');
    expect(sql(`select status || '|' || hospital_id from app.hospital_memberships where user_id = (select id from auth.users where email = '${email}')`)).toBe(`activa|${HOSPITAL_IDS[0]}`);

    const session = await claimant.send('GET', '/api/v1/auth/session');
    expect(session.json.data).toMatchObject({ aal: 1, mfaRequired: true, actor: { role: 'admin_hospitalario' } });
    expect((await claimant.send('GET', '/api/v1/hospitals/me/needs')).status).toBe(403);

    const again = await new ApiClient(backend.baseUrl, '10.99.31.2').send('POST', CLAIM(token), { body: { password: NEW_PASSWORD } });
    expect(again.status).toBe(410);
    expect((await new ApiClient(backend.baseUrl).send('GET', PREVIEW(token))).status).toBe(410);

    const login = await new ApiClient(backend.baseUrl, '10.99.31.3').send('POST', '/api/v1/auth/sessions', { body: { email, password: NEW_PASSWORD } });
    expect(login.status).toBe(200);
    expect(login.json.data.mfaRequired).toBe(true);
    expect(sql(`select count(*) from app.audit_events where event = 'admin.alta'`)).not.toBe('0');
  });

  it('un usuario de Auth inerte que ocupó el correo antes que el invitado se reemplaza: el invitado puede reclamar', async () => {
    const email = emailFor('ocupado');
    const squatter = await signUpAuthOnly(email, 'contrasena-del-intruso-2026');
    // Un registro de menos de un minuto podría ser el del propio invitado en curso: el intruso se registró antes.
    sql(`update auth.users set created_at = now() - interval '10 minutes' where id = '${squatter}'`);
    await invite(email);
    const { token } = latestSealed('invitacion_admin', email);

    const response = await new ApiClient(backend.baseUrl, '10.99.32.1').send('POST', CLAIM(token), { body: { password: NEW_PASSWORD } });

    expect(response.status).toBe(201);
    expect(sql(`select count(*) from auth.users where id = '${squatter}'`)).toBe('0');
    expect(sql(`select role from app.user_accounts where user_id = (select id from auth.users where email = '${email}')`)).toBe('admin_hospitalario');
    // La contraseña del intruso ya no sirve; la del invitado sí.
    expect((await new ApiClient(backend.baseUrl, '10.99.32.2').send('POST', '/api/v1/auth/sessions', { body: { email, password: 'contrasena-del-intruso-2026' } })).status).toBe(401);
    expect((await new ApiClient(backend.baseUrl, '10.99.32.3').send('POST', '/api/v1/auth/sessions', { body: { email, password: NEW_PASSWORD } })).status).toBe(200);
  });

  it('un correo que se convirtió en una cuenta con vida propia entre la invitación y el reclamo NO se elimina: 409 y el token sigue vigente', async () => {
    const email = emailFor('cuenta');
    await invite(email);
    const { token } = latestSealed('invitacion_admin', email);
    const owner = await signUpAuthOnly(email, 'contrasena-del-titular-2026');
    sql(`insert into app.user_accounts (user_id, role, display_name) values ('${owner}', 'donante', 'Donante Sintético')`);

    const response = await new ApiClient(backend.baseUrl, '10.99.32.4').send('POST', CLAIM(token), { body: { password: NEW_PASSWORD } });

    expect(response.status).toBe(409);
    expect(sql(`select count(*) from auth.users where id = '${owner}'`)).toBe('1');
    expect((await new ApiClient(backend.baseUrl).send('GET', PREVIEW(token))).status).toBe(200);
  });

  it('una contraseña corta, un token desconocido y un cuerpo con campos de más no crean ninguna cuenta', async () => {
    const email = emailFor('invalido');
    await invite(email);
    const { token } = latestSealed('invitacion_admin', email);
    const client = new ApiClient(backend.baseUrl, '10.99.33.1');

    expect((await client.send('POST', CLAIM(token), { body: { password: 'corta' } })).status).toBe(400);
    expect((await client.send('POST', CLAIM(token), { body: { password: NEW_PASSWORD, email: 'otro@example.test' } })).status).toBe(400);
    expect((await client.send('POST', CLAIM('b'.repeat(43)), { body: { password: NEW_PASSWORD } })).status).toBe(404);
    expect((await client.send('POST', CLAIM(token), { body: { password: NEW_PASSWORD }, key: null })).status).toBe(400);

    expect(sql(`select count(*) from auth.users where email = '${email}'`)).toBe('0');
  });

  it('una reinvitación anula el enlace anterior', async () => {
    const email = emailFor('reinvitar');
    await invite(email);
    const first = latestSealed('invitacion_admin', email).token;
    await invite(email);
    const second = latestSealed('invitacion_admin', email).token;
    const anonymous = new ApiClient(backend.baseUrl);

    expect(second).not.toBe(first);
    expect((await anonymous.send('GET', PREVIEW(first))).status).toBe(410);
    expect((await anonymous.send('GET', PREVIEW(second))).status).toBe(200);
  });

  it('un token vencido es 410', async () => {
    const email = emailFor('vencida');
    await invite(email);
    const { token } = latestSealed('invitacion_admin', email);
    sql(`update app.action_tokens set expires_at = now() - interval '1 second', created_at = now() - interval '4 days' where kind = 'invitacion_admin' and subject_id = (select invitation_id from app.admin_invitations where email = '${email}')`);

    expect((await new ApiClient(backend.baseUrl).send('GET', PREVIEW(token))).status).toBe(410);
  });
});

describe('carreras sobre un mismo token', () => {
  it('dos reclamos simultáneos del mismo token: exactamente uno crea la cuenta', async () => {
    const email = emailFor('carrera');
    await invite(email);
    const { token } = latestSealed('invitacion_admin', email);

    const [a, b] = await Promise.all([
      new ApiClient(backend.baseUrl, '10.99.34.1').send('POST', CLAIM(token), { body: { password: NEW_PASSWORD } }),
      new ApiClient(backend.baseUrl, '10.99.34.2').send('POST', CLAIM(token), { body: { password: NEW_PASSWORD } }),
    ]);

    // Un doble envío: uno gana; el otro no crea nada (409/410 si ve el estado, 503 si Auth rechaza el registro simultáneo).
    expect([a.status, b.status].filter((status) => status === 201)).toHaveLength(1);
    expect([409, 410, 503]).toContain([a.status, b.status].find((status) => status !== 201));
    expect(sql(`select count(*) from app.user_accounts where user_id in (select id from auth.users where email = '${email}')`)).toBe('1');
    expect(sql(`select count(*) from app.hospital_memberships where user_id in (select id from auth.users where email = '${email}')`)).toBe('1');
  });

  it('dos reset simultáneos del mismo token: uno cambia la contraseña y el otro es 410', async () => {
    const email = await createDonorAccount('contrasena-original-2026');
    await new ApiClient(backend.baseUrl, '10.99.35.1').send('POST', RECOVERY, { body: { email } });
    const { token } = latestSealed('recuperacion', email);

    const [a, b] = await Promise.all([
      new ApiClient(backend.baseUrl, '10.99.35.2').send('POST', RESET(token), { body: { newPassword: NEW_PASSWORD } }),
      new ApiClient(backend.baseUrl, '10.99.35.3').send('POST', RESET(token), { body: { newPassword: 'otra-contrasena-nueva-2026' } }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 410]);
  });

  it('dos invitaciones simultáneas al mismo correo dejan un único token vigente', async () => {
    const email = emailFor('doble');

    const responses = await Promise.all([invite(email), invite(email)]);

    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    expect(sql(`select count(*) from app.action_tokens where kind = 'invitacion_admin' and invalidated_at is null and consumed_at is null and subject_id in (select invitation_id from app.admin_invitations where email = '${email}')`)).toBe('1');
  });
});

describe('las RPC de tokens no son ejecutables por un cliente directo de PostgREST', () => {
  async function rpc(name: string, args: Record<string, unknown>, token?: string): Promise<Response> {
    const local = readLocalSupabase();
    return fetch(`${local.apiUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: local.publishableKey, authorization: `Bearer ${token ?? local.publishableKey}`,
        'content-type': 'application/json', 'content-profile': 'api',
      },
      body: JSON.stringify(args),
    });
  }

  it('con la anon key no se puede restablecer la contraseña de una víctima eligiendo el hash del token', async () => {
    const victim = await createDonorAccount('contrasena-original-2026');
    const attackerToken = 'T'.repeat(43);
    const { createHash } = await import('node:crypto');
    const attackerHash = createHash('sha256').update(attackerToken).digest('hex');

    const requested = await rpc('request_password_recovery', {
      p_email: victim, p_token_hash: attackerHash, p_outbox_id: randomUUID(), p_sealed: 'v1.k1.x'.padEnd(40, 'x'),
      p_actor_ref: `email:${'a'.repeat(64)}`, p_key: 'clave-del-atacante-0001', p_hash: 'b'.repeat(64),
    });
    const reset = await new ApiClient(backend.baseUrl, '10.99.36.1').send('POST', RESET(attackerToken), { body: { newPassword: NEW_PASSWORD } });

    expect(requested.status).toBeGreaterThanOrEqual(400);
    expect(sql(`select count(*) from app.action_tokens where token_hash = '${attackerHash}'`)).toBe('0');
    expect(reset.status).toBe(404);
    expect((await new ApiClient(backend.baseUrl, '10.99.36.2').send('POST', '/api/v1/auth/sessions', { body: { email: victim, password: NEW_PASSWORD } })).status).toBe(401);
  });

  it('ni anon ni un usuario autenticado cualquiera ejecutan la vista previa, la solicitud ni el consumo', async () => {
    const donorToken = (await fetch(`${readLocalSupabase().apiUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: readLocalSupabase().publishableKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email: SEED_USERS.donor1.email, password: 'Demo-Password-Sintetica-2026' }),
    }).then((response) => response.json()) as { access_token: string }).access_token;
    const calls: Array<[string, Record<string, unknown>]> = [
      ['get_admin_invitation_preview', { p_token_hash: 'a'.repeat(64) }],
      ['consume_password_reset', { p_token_hash: 'a'.repeat(64) }],
      ['request_password_recovery', { p_email: 'x@example.test', p_token_hash: 'a'.repeat(64), p_outbox_id: randomUUID(), p_sealed: 'x'.repeat(40), p_actor_ref: `email:${'a'.repeat(64)}`, p_key: 'clave-de-prueba-0001', p_hash: 'b'.repeat(64) }],
    ];

    for (const [name, args] of calls) {
      const anonymous = await rpc(name, args);
      const asDonor = await rpc(name, args, donorToken);
      expect(anonymous.status, `${name} anon`).toBeGreaterThanOrEqual(400);
      if (asDonor.status === 200) expect(((await asDonor.json()) as { kind?: string }).kind, `${name} donante`).toBe('forbidden');
    }
  });
});

describe('recuperación de contraseña', () => {
  it('un reintento con la misma clave no crea otro token ni otro correo', async () => {
    const email = await createDonorAccount('contrasena-original-2026');
    const key = randomUUID();
    const client = new ApiClient(backend.baseUrl, '10.99.47.1');

    const first = await client.send('POST', RECOVERY, { body: { email }, key });
    const retry = await client.send('POST', RECOVERY, { body: { email }, key });

    expect(first.status).toBe(202);
    expect(retry.status).toBe(202);
    expect(retry.text).toBe(first.text);
    expect(sql(`select count(*) from app.action_tokens t join auth.users u on u.id = t.subject_id where t.kind = 'recuperacion' and u.email = '${email}'`)).toBe('1');
  });

  it('la cuenta técnica (worker) no se puede recuperar por correo', async () => {
    await new ApiClient(backend.baseUrl, '10.99.48.1').send('POST', RECOVERY, { body: { email: SEED_USERS.worker.email } });

    expect(sql(`select count(*) from app.action_tokens where kind = 'recuperacion' and subject_id = (select id from auth.users where email = '${SEED_USERS.worker.email}')`)).toBe('0');
  });

  it('a la cuarta solicitud en una hora para el mismo correo responde 429, aunque cambie la IP', async () => {
    const email = emailFor('tres-por-hora');
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push((await new ApiClient(backend.baseUrl, `10.99.49.${i + 1}`).send('POST', RECOVERY, { body: { email } })).status);
    }

    expect(statuses).toEqual([202, 202, 202, 429]);
  });

  it('la respuesta es idéntica (estado, cuerpo y cabeceras) exista o no la cuenta', async () => {
    const existing = await createDonorAccount('contrasena-original-2026');
    const missing = emailFor('no-existe');
    const normalize = (headers: Headers) => [...headers.entries()].filter(([name]) => !['date', 'x-correlation-id', 'etag'].includes(name)).sort();

    const a = await new ApiClient(backend.baseUrl, '10.99.41.1').send('POST', RECOVERY, { body: { email: existing } });
    const b = await new ApiClient(backend.baseUrl, '10.99.41.2').send('POST', RECOVERY, { body: { email: missing } });

    expect(a.status).toBe(202);
    expect(b.status).toBe(a.status);
    expect(b.text).toBe(a.text);
    expect(normalize(b.headers)).toEqual(normalize(a.headers));
    expect(sql(`select count(*) from app.action_tokens t join auth.users u on u.id = t.subject_id where t.kind = 'recuperacion' and u.email = '${existing}'`)).toBe('1');
    expect(() => latestSealed('recuperacion', missing)).toThrow();
  });

  it('ambos caminos tardan al menos 150 ms (piso de tiempo)', async () => {
    const started = Date.now();
    await new ApiClient(backend.baseUrl, '10.99.42.1').send('POST', RECOVERY, { body: { email: emailFor('lento') } });

    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
  });

  it('limita por IP y por correo: a la solicitud 11 responde 429 con Retry-After', async () => {
    const client = new ApiClient(backend.baseUrl, '10.99.43.1');
    const statuses: number[] = [];
    let last;
    for (let i = 0; i < 11; i += 1) {
      last = await client.send('POST', RECOVERY, { body: { email: emailFor('limite') } });
      statuses.push(last.status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(202));
    expect(statuses[10]).toBe(429);
    expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('cambia la contraseña, anula el enlace y revoca las sesiones anteriores', async () => {
    const email = await createDonorAccount('contrasena-original-2026');
    const previous = new ApiClient(backend.baseUrl, '10.99.44.1');
    expect((await previous.login(email, { password: 'contrasena-original-2026' })).status).toBe(200);
    await new ApiClient(backend.baseUrl, '10.99.44.2').send('POST', RECOVERY, { body: { email } });
    const { token } = latestSealed('recuperacion', email);
    const anonymous = new ApiClient(backend.baseUrl, '10.99.44.3');

    const reset = await anonymous.send('POST', RESET(token), { body: { newPassword: NEW_PASSWORD } });

    expect(reset.status).toBe(200);
    expect(reset.json.data.message).toMatch(/contraseña/i);
    // Sesión anterior: con el access token vencido el refresh token revocado ya no sirve.
    previous.cookies.set('__Host-sal_at', 'access-vencido');
    expect((await previous.send('GET', '/api/v1/auth/session')).status).toBe(401);
    // La contraseña antigua deja de valer y la nueva sirve.
    expect((await new ApiClient(backend.baseUrl, '10.99.44.4').send('POST', '/api/v1/auth/sessions', { body: { email, password: 'contrasena-original-2026' } })).status).toBe(401);
    expect((await new ApiClient(backend.baseUrl, '10.99.44.5').send('POST', '/api/v1/auth/sessions', { body: { email, password: NEW_PASSWORD } })).status).toBe(200);
    // Segundo consumo del mismo token: 410.
    expect((await anonymous.send('POST', RESET(token), { body: { newPassword: 'otra-contrasena-nueva-2026' } })).status).toBe(410);
  });

  it('token desconocido es 404 y contraseña corta 400 (el token sigue vigente)', async () => {
    const email = await createDonorAccount('contrasena-original-2026');
    await new ApiClient(backend.baseUrl, '10.99.45.1').send('POST', RECOVERY, { body: { email } });
    const { token } = latestSealed('recuperacion', email);
    const anonymous = new ApiClient(backend.baseUrl, '10.99.45.2');

    expect((await anonymous.send('POST', RESET('c'.repeat(43)), { body: { newPassword: NEW_PASSWORD } })).status).toBe(404);
    expect((await anonymous.send('POST', RESET(token), { body: { newPassword: 'corta' } })).status).toBe(400);
    expect((await anonymous.send('POST', RESET(token), { body: { newPassword: NEW_PASSWORD } })).status).toBe(200);
  });

  it('un token vencido es 410', async () => {
    const email = await createDonorAccount('contrasena-original-2026');
    await new ApiClient(backend.baseUrl, '10.99.46.1').send('POST', RECOVERY, { body: { email } });
    const { token } = latestSealed('recuperacion', email);
    sql(`update app.action_tokens set expires_at = now() - interval '1 second', created_at = now() - interval '2 hours' where kind = 'recuperacion' and subject_id = (select id from auth.users where email = '${email}')`);

    expect((await new ApiClient(backend.baseUrl, '10.99.46.2').send('POST', RESET(token), { body: { newPassword: NEW_PASSWORD } })).status).toBe(410);
  });
});

describe('observabilidad y contrato', () => {
  it('ningún token ni correo aparece en los registros del servidor, en el outbox en claro ni en la auditoría', async () => {
    const email = emailFor('canario');
    await invite(email);
    const { token } = latestSealed('invitacion_admin', email);
    await new ApiClient(backend.baseUrl).send('GET', PREVIEW(token));

    const logs = backend.logLines.join('\n');
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(email);
    expect(sql(`select coalesce(string_agg(event || coalesce(reason, ''), ' '), '') from app.audit_events`)).not.toContain(token);
    expect(sql(`select coalesce(string_agg(sealed_payload, ' '), '') from app.email_outbox where sealed_payload is not null`)).not.toContain(token);
  });

  it('todo estado HTTP devuelto está declarado para su operación en docs/openapi.json', () => {
    expect(observed.length).toBeGreaterThan(30);
    expect(undeclaredStatuses()).toEqual([]);
  });
});

