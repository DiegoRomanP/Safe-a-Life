import { createHash, randomUUID } from 'node:crypto';
import { fingerprint } from '../../src/shared/crypto/fingerprint.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sealEmailChange } from '../../src/modules/donor-records/application/email-change.js';
import { latestSealed, signUpAuthOnly } from '../support/accounts.js';
import { startBackend, type RunningBackend } from '../support/app.js';
import { ApiClient, observed } from '../support/client.js';
import { undeclaredStatuses } from '../support/contract-statuses.js';
import { resetAuthQuota, sql } from '../support/db.js';
import { DEMO_PASSWORD, HOSPITAL_IDS, readLocalSupabase, SEED_USERS } from '../support/local-env.js';
import { workerConfig } from '../support/worker.js';

const REGISTER = '/api/v1/donor-registrations';
const VERIFY = (token: string) => `/api/v1/donor-email-verification-actions/${token}`;
const ACTIVATION = (token: string) => `/api/v1/assisted-activation-actions/${token}`;
const CLAIM = (token: string) => `${ACTIVATION(token)}/claim`;
const EMAIL_CHANGE = (token: string) => `/api/v1/donor-email-change-actions/${token}`;
const SIGNUPS = '/api/v1/hospitals/me/assisted-signups';
const PROFILE = '/api/v1/donors/me/profile';
const ONBOARDING = '/api/v1/donors/me/onboarding-profile';
const PASSWORD = 'contrasena-donante-2026';
const NEW_PASSWORD = 'contrasena-fijada-2026';
const RESET = (token: string) => `/api/v1/auth/password-reset-actions/${token}`;
const LIMA = { latitude: -12.046, longitude: -77.043 };
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

let backend: RunningBackend;
let admin1: ApiClient;
let admin2: ApiClient;

beforeEach(() => {
  resetAuthQuota();
});

beforeAll(async () => {
  backend = await startBackend();
  admin1 = new ApiClient(backend.baseUrl);
  admin2 = new ApiClient(backend.baseUrl);
  expect((await admin1.login(SEED_USERS.admin1.email)).status).toBe(200);
  expect((await admin2.login(SEED_USERS.admin2.email)).status).toBe(200);
}, 120_000);

afterAll(async () => {
  await backend.close();
});

const emailFor = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.test`;
const anonymous = () => new ApiClient(backend.baseUrl);
const register = (email: string, password = PASSWORD, key?: string, client: ApiClient = anonymous()) =>
  client.send('POST', REGISTER, { body: { email, password }, ...(key ? { key } : {}) });
const createSignup = (email: string, name?: string, client: ApiClient = admin1, key?: string) =>
  client.send('POST', SIGNUPS, { body: { email, ...(name ? { name } : {}) }, ...(key ? { key } : {}) });

/**
 * Autorregistro completo hasta tener la sesión de un donante con el correo verificado (perfil incompleto): tras verificar,
 * el dueño del buzón fija su contraseña con el enlace de recuperación y entra con la nueva.
 */
async function verifiedDonor(): Promise<{ email: string; client: ApiClient }> {
  const email = emailFor('donante');
  expect((await register(email)).status).toBe(202);
  const { token } = latestSealed('verificacion_email', email);
  expect((await anonymous().send('POST', VERIFY(token))).status).toBe(200);
  const setup = latestSealed('recuperacion', email);
  expect((await anonymous().send('POST', RESET(setup.token), { body: { newPassword: NEW_PASSWORD } })).status).toBe(200);
  const client = anonymous();
  const login = await client.login(email, { password: NEW_PASSWORD });
  expect(login.status).toBe(200);
  return { email, client };
}

const onboard = (client: ApiClient, body: Record<string, unknown> = {}, key?: string) =>
  client.send('PUT', ONBOARDING, {
    body: { name: 'Ana Sintética', declaredBloodType: 'O_POS', isAvailable: true, approximateLocation: LIMA, ...body },
    ...(key ? { key } : {}),
  });

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


/** Token de acceso de un usuario del Auth local (para llamar a PostgREST sin pasar por el backend). */
async function accessTokenFor(email: string, password = NEW_PASSWORD): Promise<string> {
  const local = readLocalSupabase();
  const body = await fetch(`${local.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: local.publishableKey, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  }).then((response) => response.json() as Promise<{ access_token: string }>);
  return body.access_token;
}

describe('autorregistro y verificación de correo', () => {
  it('responde 202 neutro, deja el perfil pendiente con un token de 24 h y un correo cifrado sin el token en claro', async () => {
    const email = emailFor('nuevo');

    const response = await register(email);

    expect(response.status).toBe(202);
    expect(Object.keys(response.json.data)).toEqual(['message']);
    expect(response.text).not.toContain(email);
    const sealed = latestSealed('verificacion_email', email);
    expect(sql(`select p.status from app.donor_profiles p join auth.users u on u.id = p.donor_id where u.email = '${email}'`)).toBe('pendiente_verificacion');
    expect(sql(`select role from app.user_accounts where user_id = (select id from auth.users where email = '${email}')`)).toBe('donante');
    expect(sql(`select count(*) from app.action_tokens where token_hash = '${sha256(sealed.token)}' and kind = 'verificacion_email' and expires_at < now() + interval '25 hours'`)).toBe('1');
    expect(sql(`select count(*) from app.action_tokens where token_hash = '${sealed.token}'`)).toBe('0');
    expect(sql(`select sealed_payload from app.email_outbox where outbox_id = '${sealed.outboxId}'`)).not.toContain(sealed.token);
    expect(sql(`select count(*) from auth.sessions where user_id = (select id from auth.users where email = '${email}')`)).toBe('0');
  });

  it('un correo que ya tiene una cuenta verificada recibe la misma respuesta y no se encola otro correo ni se toca la cuenta', async () => {
    const { email } = await verifiedDonor();
    const before = sql("select count(*) from app.email_outbox where kind = 'verificacion_email'");
    const reference = await register(emailFor('referencia'));

    const second = await register(email, 'otra-contrasena-2026');

    expect(second.status).toBe(202);
    expect(second.text).toBe(reference.text);
    expect(sql("select count(*) from app.email_outbox where kind = 'verificacion_email'")).toBe(String(Number(before) + 1));
    expect((await anonymous().login(email, { password: 'otra-contrasena-2026' })).status).toBe(401);
  });

  it('quien registró el correo de otra persona no completa el perfil: al verificar se cierran sus sesiones y el dueño fija otra contraseña', async () => {
    const email = emailFor('ajeno');
    expect((await register(email)).status).toBe(202);
    const attacker = anonymous();
    expect((await attacker.login(email, { password: PASSWORD })).status).toBe(200);
    expect(Number(sql(`select count(*) from auth.sessions where user_id = (select id from auth.users where email = '${email}')`))).toBeGreaterThan(0);

    const verified = await anonymous().send('POST', VERIFY(latestSealed('verificacion_email', email).token));

    expect(verified.status).toBe(200);
    expect(verified.text).not.toContain(email);
    expect(sql(`select count(*) from auth.sessions where user_id = (select id from auth.users where email = '${email}')`)).toBe('0');
    expect(sql(`select password_setup_required from app.donor_profiles where donor_id = (select id from auth.users where email = '${email}')`)).toBe('t');
    const setup = latestSealed('recuperacion', email);

    // ADR-007: la barrera abierta por la verificación impide al registrante abrir sesión por Express (401) y, con un JWT obtenido
    // directo de Auth, completar el perfil por la base (la prueba session-barrier.integration.ts cubre el resto).
    const again = anonymous();
    expect((await again.login(email, { password: PASSWORD })).status).toBe(401);
    const attackerToken = await accessTokenFor(email, PASSWORD);
    const direct = await rpc('complete_own_onboarding', {
      p_key: randomUUID(), p_hash: 'x', p_name: 'Intruso', p_blood_type: 'O_POS', p_available: true, p_latitude: -12.046, p_longitude: -77.043, p_polygon_version: 'DEMO_ONLY-1',
    }, attackerToken);
    expect(((await direct.json()) as { kind?: string }).kind).toBe('unauthenticated');
    expect(sql(`select status from app.donor_profiles where donor_id = (select id from auth.users where email = '${email}')`)).toBe('incompleto');

    // El dueño del buzón fija su contraseña: la anterior deja de valer y el bloqueo se levanta.
    expect((await anonymous().send('POST', RESET(setup.token), { body: { newPassword: NEW_PASSWORD } })).status).toBe(200);
    expect((await anonymous().login(email, { password: PASSWORD })).status).toBe(401);
    const owner = anonymous();
    expect((await owner.login(email, { password: NEW_PASSWORD })).status).toBe(200);
    expect(sql(`select password_setup_required from app.donor_profiles where donor_id = (select id from auth.users where email = '${email}')`)).toBe('f');
    expect((await onboard(owner)).status).toBe(200);
  });

  it('registrarse de nuevo con un correo sin verificar reenvía el enlace al buzón (el anterior deja de valer) con la misma respuesta', async () => {
    const email = emailFor('perdido');
    const first = await register(email);
    const firstToken = latestSealed('verificacion_email', email).token;

    const again = await register(email);
    const secondToken = latestSealed('verificacion_email', email).token;

    expect(again.status).toBe(202);
    expect(again.text).toBe(first.text);
    expect(secondToken).not.toBe(firstToken);
    expect((await anonymous().send('GET', VERIFY(firstToken))).status).toBe(410);
    expect((await anonymous().send('GET', VERIFY(secondToken))).status).toBe(200);
    expect((await anonymous().login(email, { password: 'otra-contrasena-2026' })).status).toBe(401);
  });

  it('un vencimiento no deja el registro bloqueado: tras caducar el enlace, volver a registrarse emite uno nuevo', async () => {
    const email = emailFor('caducado');
    await register(email);
    const { token } = latestSealed('verificacion_email', email);
    sql(`update app.action_tokens set expires_at = now() - interval '1 second', created_at = now() - interval '2 days' where token_hash = '${sha256(token)}'`);

    await register(email);
    const fresh = latestSealed('verificacion_email', email).token;

    expect((await anonymous().send('POST', VERIFY(fresh))).status).toBe(200);
  });

  it('una contraseña corta, campos de más o la falta de clave de idempotencia no crean ninguna cuenta', async () => {
    const email = emailFor('invalido');

    expect((await register(email, 'corta')).status).toBe(400);
    expect((await anonymous().send('POST', REGISTER, { body: { email, password: PASSWORD, role: 'superadmin' } })).status).toBe(400);
    expect((await anonymous().send('POST', REGISTER, { body: { email: 'no-es-correo', password: PASSWORD } })).status).toBe(400);
    expect((await anonymous().send('POST', REGISTER, { body: { email, password: PASSWORD }, key: null })).status).toBe(400);

    expect(sql(`select count(*) from auth.users where email = '${email}'`)).toBe('0');
  });

  it('el cuarto registro del mismo correo en una hora es 429 con Retry-After', async () => {
    const email = emailFor('limite');

    const statuses = [];
    let last = await register(email);
    statuses.push(last.status);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      last = await register(email);
      statuses.push(last.status);
    }

    expect(statuses).toEqual([202, 202, 202, 429]);
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('verificar: la vista previa no muta, el consumo deja el perfil incompleto sin abrir sesión y el token no se reutiliza', async () => {
    const email = emailFor('verificar');
    await register(email);
    const { token } = latestSealed('verificacion_email', email);

    const preview = await anonymous().send('GET', VERIFY(token));
    const again = await anonymous().send('GET', VERIFY(token));
    const verified = await anonymous().send('POST', VERIFY(token));
    const reused = await anonymous().send('POST', VERIFY(token));

    expect(preview.status).toBe(200);
    expect(preview.json.data.action).toBe('verificar_email');
    expect(Object.keys(preview.json.data).sort()).toEqual(['action', 'expiresAt']);
    expect(preview.headers.get('cache-control')).toBe('no-store');
    expect(preview.headers.get('referrer-policy')).toBe('no-referrer');
    expect(again.status).toBe(200);
    expect(verified.status).toBe(200);
    expect(verified.json.data).toEqual({ status: 'reclamada_incompleta', emailVerified: true });
    expect(verified.headers.getSetCookie()).toEqual([]);
    expect(reused.status).toBe(410);
    expect((await anonymous().send('GET', VERIFY(token))).status).toBe(410);
    expect(sql(`select status from app.donor_profiles where donor_id = (select id from auth.users where email = '${email}')`)).toBe('incompleto');
    expect(sql("select count(*) from app.audit_events where event = 'donante.correo_verificado'")).not.toBe('0');
  });

  it('un token desconocido es 404, uno mal formado 400 y uno vencido 410', async () => {
    const email = emailFor('vencida');
    await register(email);
    const { token } = latestSealed('verificacion_email', email);
    sql(`update app.action_tokens set expires_at = now() - interval '1 second', created_at = now() - interval '2 days' where token_hash = '${sha256(token)}'`);

    expect((await anonymous().send('POST', VERIFY('c'.repeat(43)))).status).toBe(404);
    expect((await anonymous().send('POST', VERIFY('corto'))).status).toBe(400);
    expect((await anonymous().send('POST', VERIFY(token))).status).toBe(410);
    expect((await anonymous().send('POST', VERIFY(token), { key: null })).status).toBe(400);
  });

  it('antes de verificar el correo el perfil no se muestra ni se completa', async () => {
    const email = emailFor('sinverificar');
    await register(email);
    const client = anonymous();
    expect((await client.login(email, { password: PASSWORD })).status).toBe(200);

    expect((await client.send('GET', PROFILE)).status).toBe(404);
    expect((await onboard(client)).status).toBe(409);
    expect((await client.send('PATCH', PROFILE, { body: { isAvailable: false } })).status).toBe(409);
  });

  it('dos verificaciones simultáneas del mismo token: una gana y la otra es 410', async () => {
    const email = emailFor('carrera');
    await register(email);
    const { token } = latestSealed('verificacion_email', email);

    const [a, b] = await Promise.all([anonymous().send('POST', VERIFY(token)), anonymous().send('POST', VERIFY(token))]);

    expect([a.status, b.status].sort()).toEqual([200, 410]);
  });
});

describe('perfil propio del donante', () => {
  it('completar el onboarding activa el perfil; el perfil muestra el correo de la sesión; el reintento es idempotente', async () => {
    const { email, client } = await verifiedDonor();
    const key = randomUUID();

    const created = await onboard(client, {}, key);
    const replay = await onboard(client, {}, key);
    const profile = await client.send('GET', PROFILE);

    expect(created.status).toBe(200);
    expect(created.json.data).toEqual({ name: 'Ana Sintética', email, declaredBloodType: 'O_POS', isAvailable: true, approximateLocation: LIMA });
    expect(replay.status).toBe(200);
    expect(replay.text).toBe(created.text);
    expect(profile.json.data).toEqual(created.json.data);
    expect((await onboard(client, { name: 'Otro Nombre' }, key)).status).toBe(409);
    expect((await onboard(client)).status).toBe(409);
    expect(sql(`select status || '|' || location_polygon_version from app.donor_profiles where donor_id = (select id from auth.users where email = '${email}')`)).toBe('activo|DEMO_ONLY-1');
    expect(sql(`select count(*) from app.audit_events where event = 'donante.perfil_completado' and resource_id = (select id from auth.users where email = '${email}')`)).toBe('1');
  });

  it('rechaza ubicaciones fuera de Lima, fuera de rango o con más de tres decimales, un grupo inválido y campos de más', async () => {
    const { client } = await verifiedDonor();

    expect((await onboard(client, { approximateLocation: { latitude: 40.416, longitude: -3.703 } })).status).toBe(422);
    expect((await onboard(client, { approximateLocation: { latitude: 95, longitude: -77.043 } })).status).toBe(422);
    expect((await onboard(client, { approximateLocation: { latitude: -12.0461, longitude: -77.043 } })).status).toBe(422);
    expect((await onboard(client, { declaredBloodType: 'X_POS' })).status).toBe(422);
    expect((await onboard(client, { name: '   ' })).status).toBe(422);
    expect((await onboard(client, { lastDonationAt: '2026-01-01' })).status).toBe(400);
    expect((await client.send('PUT', ONBOARDING, { body: { name: 'Ana' } })).status).toBe(400);

    expect((await client.send('GET', PROFILE)).status).toBe(404);
  });

  it('la participación cambia disponibilidad y ubicación, pero no nombre ni grupo; exige Lima y un cambio', async () => {
    const { email, client } = await verifiedDonor();
    await onboard(client);

    const hidden = await client.send('PATCH', PROFILE, { body: { isAvailable: false } });
    const moved = await client.send('PATCH', PROFILE, { body: { approximateLocation: { latitude: -12.1, longitude: -77.1 } } });

    expect(hidden.status).toBe(200);
    expect(hidden.json.data.isAvailable).toBe(false);
    expect(moved.json.data.approximateLocation).toEqual({ latitude: -12.1, longitude: -77.1 });
    expect(moved.json.data.name).toBe('Ana Sintética');
    expect((await client.send('PATCH', PROFILE, { body: { name: 'Intruso' } })).status).toBe(400);
    expect((await client.send('PATCH', PROFILE, { body: { declaredBloodType: 'A_NEG' } })).status).toBe(400);
    expect((await client.send('PATCH', PROFILE, { body: {} })).status).toBe(400);
    expect((await client.send('PATCH', PROFILE, { body: { approximateLocation: { latitude: 51.5, longitude: -0.12 } } })).status).toBe(422);
    expect(sql(`select name || '|' || declared_blood_type from app.donor_profiles where donor_id = (select id from auth.users where email = '${email}')`)).toBe('Ana Sintética|O_POS');
  });

  it('solo un donante con sesión y CSRF: anónimo 401, admin 403, sin CSRF 403', async () => {
    const { client } = await verifiedDonor();

    expect((await anonymous().send('GET', PROFILE)).status).toBe(401);
    expect((await anonymous().send('PUT', ONBOARDING, { body: { name: 'Ana', declaredBloodType: 'O_POS', isAvailable: true, approximateLocation: LIMA } })).status).toBe(401);
    expect((await admin1.send('GET', PROFILE)).status).toBe(403);
    expect((await admin1.send('PUT', ONBOARDING, { body: { name: 'Ana', declaredBloodType: 'O_POS', isAvailable: true, approximateLocation: LIMA } })).status).toBe(403);
    expect((await client.send('PUT', ONBOARDING, {
      body: { name: 'Ana', declaredBloodType: 'O_POS', isAvailable: true, approximateLocation: LIMA }, csrf: false,
    })).status).toBe(403);
  });

  it('la RPC llamada directamente también rechaza Madrid, una versión de polígono falsa y un nombre en blanco', async () => {
    const { email, client } = await verifiedDonor();
    // ADR-007: solo una sesión admitida (login por Express tras cerrar la barrera) autoriza; un JWT directo de Auth daría `unauthenticated`.
    const token = client.cookies.get('__Host-sal_at') as string;
    const call = async (name: string, lat: number, lon: number, version: string) => {
      const response = await rpc('complete_own_onboarding', {
        p_key: randomUUID(), p_hash: fingerprint([['name', name], ['declaredBloodType', 'A_POS'], ['isAvailable', true], ['latitude', lat], ['longitude', lon]]),
        p_name: name, p_blood_type: 'A_POS', p_available: true, p_latitude: lat, p_longitude: lon, p_polygon_version: version,
      }, token);
      return ((await response.json()) as { kind?: string }).kind;
    };

    expect(await call('Ana', 40.417, -3.704, 'DEMO_ONLY-1')).toBe('invalid');
    expect(await call('Ana', -12.05, -77.04, 'cualquier-cosa')).toBe('invalid');
    expect(await call('   ', -12.05, -77.04, 'DEMO_ONLY-1')).toBe('invalid');
    expect(sql(`select status from app.donor_profiles where donor_id = (select id from auth.users where email = '${email}')`)).toBe('incompleto');
  });

  it('un UPDATE directo con el JWT del donante no cambia nombre ni grupo de un perfil activo', async () => {
    const { email, client } = await verifiedDonor();
    await onboard(client);
    const local = readLocalSupabase();
    const login = await fetch(`${local.apiUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: local.publishableKey, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: NEW_PASSWORD }),
    }).then((response) => response.json() as Promise<{ access_token: string }>);

    const patch = await fetch(`${local.apiUrl}/rest/v1/donor_profiles`, {
      method: 'PATCH',
      headers: {
        apikey: local.publishableKey, authorization: `Bearer ${login.access_token}`, 'content-type': 'application/json', 'content-profile': 'app',
      },
      body: JSON.stringify({ name: 'Cambiado' }),
    });

    expect(patch.status).toBeGreaterThanOrEqual(400);
    expect(sql(`select name from app.donor_profiles where donor_id = (select id from auth.users where email = '${email}')`)).toBe('Ana Sintética');
  });
});

describe('altas asistidas del hospital', () => {
  // Los topes por hora (20 altas y 60 enlaces por hospital) son estado compartido entre pruebas: se envejecen entre una y otra.
  // Los topes en sí los cubre pgTAP y las pruebas que los ejercitan lo hacen dentro de su propia prueba.
  beforeEach(() => {
    sql("update app.action_tokens set created_at = created_at - interval '3 hours' where kind = 'alta_asistida' and created_at > now() - interval '1 hour' and expires_at > now() - interval '3 hours' + interval '1 minute'");
    sql("update app.assisted_signups set created_at = created_at - interval '3 hours', purge_at = purge_at - interval '3 hours' where created_at > now() - interval '1 hour'");
  });

  it('el admin crea un alta: 202 con la proyección operativa, correo cifrado con el nombre del hospital y sin el correo en ninguna respuesta', async () => {
    const email = emailFor('alta');

    const response = await createSignup(email, 'Persona Alta');

    expect(response.status).toBe(202);
    expect(Object.keys(response.json.data).sort()).toEqual(['activationExpiresAt', 'createdAt', 'purgeAt', 'signupId', 'status']);
    expect(response.json.data.status).toBe('pendiente');
    expect(response.text).not.toContain(email);
    const sealed = latestSealed('alta_asistida', email);
    expect(sealed.hospitalName).toBe('Hospital Demo Uno');
    expect(sql(`select count(*) from app.action_tokens where token_hash = '${sha256(sealed.token)}' and kind = 'alta_asistida'`)).toBe('1');
    expect(sql(`select hospital_id from app.assisted_signups where signup_id = '${response.json.data.signupId}'`)).toBe(HOSPITAL_IDS[0]);
    const listed = await admin1.send('GET', `${SIGNUPS}?limit=100`);
    expect(listed.text).not.toContain(email);
    expect(listed.json.data.items.some((item: { signupId: string }) => item.signupId === response.json.data.signupId)).toBe(true);
  });

  it('un correo que ya tiene cuenta recibe una respuesta con la misma forma y no se crea token ni correo', async () => {
    const { email } = await verifiedDonor();
    const before = sql("select count(*) from app.email_outbox where kind = 'alta_asistida'");

    const response = await createSignup(email);

    expect(response.status).toBe(202);
    expect(Object.keys(response.json.data).sort()).toEqual(['activationExpiresAt', 'createdAt', 'purgeAt', 'signupId', 'status']);
    expect(sql("select count(*) from app.email_outbox where kind = 'alta_asistida'")).toBe(before);
    expect(sql(`select count(*) from app.action_tokens where kind = 'alta_asistida' and subject_id = '${response.json.data.signupId}' and invalidated_at is null`)).toBe('0');
  });

  it('el reintento con la misma clave devuelve el mismo alta y otra intención con la misma clave es 409', async () => {
    const email = emailFor('replay');
    const key = randomUUID();

    const first = await createSignup(email, undefined, admin1, key);
    const second = await createSignup(email, undefined, admin1, key);
    const other = await createSignup(emailFor('otro'), undefined, admin1, key);

    expect(first.status).toBe(202);
    expect(second.text).toBe(first.text);
    expect(other.status).toBe(409);
    expect(sql(`select count(*) from app.assisted_signups where email = '${email}'`)).toBe('1');
  });

  it('otro hospital no ve ni consulta ni reemite el alta (404) y las listas están aisladas', async () => {
    const created = await createSignup(emailFor('privada'));
    const id = created.json.data.signupId as string;

    expect((await admin1.send('GET', `${SIGNUPS}/${id}`)).status).toBe(200);
    expect((await admin2.send('GET', `${SIGNUPS}/${id}`)).status).toBe(404);
    expect((await admin2.send('POST', `${SIGNUPS}/${id}/activation-links`)).status).toBe(404);
    const theirs = await admin2.send('GET', `${SIGNUPS}?limit=100`);
    expect(theirs.json.data.items.some((item: { signupId: string }) => item.signupId === id)).toBe(false);
    expect((await admin1.send('GET', `${SIGNUPS}/${randomUUID()}`)).status).toBe(404);
    expect((await admin1.send('GET', `${SIGNUPS}/no-es-uuid`)).status).toBe(400);
  });

  it('un donante, un anónimo, un admin sin CSRF y los campos de más no crean altas', async () => {
    const { client } = await verifiedDonor();
    const before = sql('select count(*) from app.assisted_signups');

    expect((await client.send('POST', SIGNUPS, { body: { email: emailFor('x') } })).status).toBe(403);
    expect((await anonymous().send('POST', SIGNUPS, { body: { email: emailFor('x') } })).status).toBe(401);
    expect((await admin1.send('POST', SIGNUPS, { body: { email: emailFor('x') }, csrf: false })).status).toBe(403);
    expect((await admin1.send('POST', SIGNUPS, { body: { email: emailFor('x'), password: 'x'.repeat(12) } })).status).toBe(400);
    expect((await admin1.send('POST', SIGNUPS, { body: { email: 'no-es-correo' } })).status).toBe(400);
    expect((await client.send('GET', SIGNUPS)).status).toBe(403);

    expect(sql('select count(*) from app.assisted_signups')).toBe(before);
  });

  it('la lista pagina con un cursor firmado y un cursor adulterado es 400', async () => {
    for (let index = 0; index < 3; index += 1) await createSignup(emailFor(`pagina${index}`));

    const first = await admin1.send('GET', `${SIGNUPS}?limit=2`);
    const cursor = first.json.data.pagination.nextCursor as string;
    const second = await admin1.send('GET', `${SIGNUPS}?limit=2&cursor=${encodeURIComponent(cursor)}`);

    expect(first.json.data.items).toHaveLength(2);
    expect(cursor).toBeTruthy();
    expect(second.status).toBe(200);
    const ids = new Set([...first.json.data.items, ...second.json.data.items].map((item: { signupId: string }) => item.signupId));
    expect(ids.size).toBe(first.json.data.items.length + second.json.data.items.length);
    expect((await admin1.send('GET', `${SIGNUPS}?limit=2&cursor=${encodeURIComponent(`${cursor}x`)}`)).status).toBe(400);
  });

  it('reclamar: la persona elige su contraseña, la cuenta nace incompleta y verificada y el token no se reutiliza', async () => {
    const email = emailFor('reclamo');
    const created = await createSignup(email, 'Persona Reclamo');
    const { token } = latestSealed('alta_asistida', email);

    const preview = await anonymous().send('GET', ACTIVATION(token));
    const claimant = anonymous();
    const claimed = await claimant.send('POST', CLAIM(token), { body: { password: PASSWORD } });

    expect(preview.status).toBe(200);
    expect(preview.json.data).toMatchObject({ action: 'reclamar_alta', hospitalName: 'Hospital Demo Uno' });
    expect(preview.text).not.toContain(email);
    expect(claimed.status).toBe(201);
    expect(claimed.json.data).toEqual({ status: 'reclamada_incompleta', emailVerified: true });
    expect(claimed.headers.getSetCookie().join('\n')).toMatch(/__Host-sal_at=.*HttpOnly; Secure; SameSite=Lax/);
    expect(sql(`select status || '|' || coalesce(name, '-') from app.donor_profiles where donor_id = (select id from auth.users where email = '${email}')`)).toBe('incompleto|Persona Reclamo');
    expect(sql(`select status || '|' || (donor_id is not null)::text from app.assisted_signups where signup_id = '${created.json.data.signupId}'`)).toBe('reclamada_incompleta|true');
    expect((await admin1.send('GET', `${SIGNUPS}/${created.json.data.signupId}`)).json.data.status).toBe('reclamada_incompleta');
    // La sesión recién emitida ya sirve para completar el onboarding.
    await claimant.fetchCsrf();
    expect((await onboard(claimant, { name: 'Persona Reclamo' })).status).toBe(200);
    expect((await anonymous().send('POST', CLAIM(token), { body: { password: PASSWORD } })).status).toBe(410);
    expect((await anonymous().send('GET', ACTIVATION(token))).status).toBe(410);
    expect((await anonymous().login(email, { password: PASSWORD })).status).toBe(200);
  });

  it('una contraseña corta, un token desconocido o mal formado y los campos de más no crean ninguna cuenta', async () => {
    const email = emailFor('invalido');
    await createSignup(email);
    const { token } = latestSealed('alta_asistida', email);

    expect((await anonymous().send('POST', CLAIM(token), { body: { password: 'corta' } })).status).toBe(400);
    expect((await anonymous().send('POST', CLAIM(token), { body: { password: PASSWORD, email: 'otro@example.test' } })).status).toBe(400);
    expect((await anonymous().send('POST', CLAIM('d'.repeat(43)), { body: { password: PASSWORD } })).status).toBe(404);
    expect((await anonymous().send('POST', CLAIM('corto'), { body: { password: PASSWORD } })).status).toBe(400);
    expect((await anonymous().send('POST', CLAIM(token), { body: { password: PASSWORD }, key: null })).status).toBe(400);

    expect(sql(`select count(*) from auth.users where email = '${email}'`)).toBe('0');
  });

  it('un usuario de Auth inerte que ocupó el correo antes se reemplaza; una cuenta con vida propia nunca se elimina (409)', async () => {
    const squatted = emailFor('ocupado');
    await createSignup(squatted);
    const squatter = await signUpAuthOnly(squatted, 'contrasena-del-intruso-2026');
    sql(`update auth.users set created_at = now() - interval '10 minutes' where id = '${squatter}'`);
    const { token } = latestSealed('alta_asistida', squatted);

    const replaced = await anonymous().send('POST', CLAIM(token), { body: { password: PASSWORD } });

    expect(replaced.status).toBe(201);
    expect(sql(`select count(*) from auth.users where id = '${squatter}'`)).toBe('0');
    expect((await anonymous().login(squatted, { password: 'contrasena-del-intruso-2026' })).status).toBe(401);

    const owned = emailFor('titular');
    await createSignup(owned);
    const ownedToken = latestSealed('alta_asistida', owned).token;
    const owner = await signUpAuthOnly(owned, 'contrasena-del-titular-2026');
    sql(`insert into app.user_accounts (user_id, role, display_name) values ('${owner}', 'donante', 'Donante Sintético')`);

    const refused = await anonymous().send('POST', CLAIM(ownedToken), { body: { password: PASSWORD } });

    expect(refused.status).toBe(409);
    expect(sql(`select count(*) from auth.users where id = '${owner}'`)).toBe('1');
  });

  it('dos reclamos simultáneos del mismo token: exactamente uno crea la cuenta', async () => {
    const email = emailFor('carrera');
    await createSignup(email);
    const { token } = latestSealed('alta_asistida', email);

    const [a, b] = await Promise.all([
      anonymous().send('POST', CLAIM(token), { body: { password: PASSWORD } }),
      anonymous().send('POST', CLAIM(token), { body: { password: PASSWORD } }),
    ]);

    expect([a.status, b.status].filter((status) => status === 201)).toHaveLength(1);
    expect([409, 410, 503]).toContain([a.status, b.status].find((status) => status !== 201));
    expect(sql(`select count(*) from app.user_accounts where user_id in (select id from auth.users where email = '${email}')`)).toBe('1');
  });

  it('reemitir: 202 neutro, anula el enlace anterior, no reinicia createdAt/purgeAt y su reintento no repite el correo', async () => {
    const email = emailFor('reemitir');
    const created = await createSignup(email);
    const id = created.json.data.signupId as string;
    const first = latestSealed('alta_asistida', email).token;
    const key = randomUUID();

    const reissued = await admin1.send('POST', `${SIGNUPS}/${id}/activation-links`, { key });
    const retry = await admin1.send('POST', `${SIGNUPS}/${id}/activation-links`, { key });
    const second = latestSealed('alta_asistida', email).token;
    const afterReissue = await admin1.send('GET', `${SIGNUPS}/${id}`);

    expect(reissued.status).toBe(202);
    expect(Object.keys(reissued.json.data)).toEqual(['message']);
    expect(retry.text).toBe(reissued.text);
    expect(second).not.toBe(first);
    expect((await anonymous().send('GET', ACTIVATION(first))).status).toBe(410);
    expect((await anonymous().send('GET', ACTIVATION(second))).status).toBe(200);
    expect(afterReissue.json.data.createdAt).toBe(created.json.data.createdAt);
    expect(afterReissue.json.data.purgeAt).toBe(created.json.data.purgeAt);
    expect(sql(`select count(*) from app.action_tokens where kind = 'alta_asistida' and subject_id = '${id}'`)).toBe('2');
  });

  it('la reemisión tiene tope: a tres enlaces en una hora la alta responde 429', async () => {
    const created = await createSignup(emailFor('tope'));
    const id = created.json.data.signupId as string;

    const statuses = [];
    for (let attempt = 0; attempt < 3; attempt += 1) statuses.push((await admin1.send('POST', `${SIGNUPS}/${id}/activation-links`)).status);

    expect(statuses).toEqual([202, 202, 429]);
  });

  it('un mismo buzón recibe como máximo tres enlaces de activación en 24 h aunque lo invoquen varias altas', async () => {
    const email = emailFor('inundado');
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await createSignup(email)).status).toBe(202);

    expect(sql(`select count(*) from app.action_tokens t join app.assisted_signups s on s.signup_id = t.subject_id where t.kind = 'alta_asistida' and s.email = '${email}' and t.invalidated_at is null`)).toBe('3');
  });

  it('un alta vencida se reemite; una ya reclamada o pasada la purga no (409)', async () => {
    const email = emailFor('vencida');
    const id = (await createSignup(email)).json.data.signupId as string;
    sql(`update app.assisted_signups set activation_expires_at = now() - interval '1 hour' where signup_id = '${id}'`);
    sql(`update app.action_tokens set expires_at = now() - interval '1 hour', created_at = now() - interval '2 days' where subject_id = '${id}'`);
    expect((await admin1.send('GET', `${SIGNUPS}/${id}`)).json.data.status).toBe('vencida');

    expect((await admin1.send('POST', `${SIGNUPS}/${id}/activation-links`)).status).toBe(202);
    expect((await admin1.send('GET', `${SIGNUPS}/${id}`)).json.data.status).toBe('pendiente');

    const claimedEmail = emailFor('reclamada');
    const claimedId = (await createSignup(claimedEmail)).json.data.signupId as string;
    await anonymous().send('POST', CLAIM(latestSealed('alta_asistida', claimedEmail).token), { body: { password: PASSWORD } });
    expect((await admin1.send('POST', `${SIGNUPS}/${claimedId}/activation-links`)).status).toBe(409);

    const purgedId = (await createSignup(emailFor('purgada'))).json.data.signupId as string;
    sql(`update app.assisted_signups set purge_at = now() - interval '1 second', created_at = now() - interval '31 days' where signup_id = '${purgedId}'`);
    expect((await admin1.send('POST', `${SIGNUPS}/${purgedId}/activation-links`)).status).toBe(409);
  });

  it('un enlace de activación vencido es 410', async () => {
    const email = emailFor('expirada');
    await createSignup(email);
    const { token } = latestSealed('alta_asistida', email);
    sql(`update app.action_tokens set expires_at = now() - interval '1 second', created_at = now() - interval '2 days' where token_hash = '${sha256(token)}'`);

    expect((await anonymous().send('GET', ACTIVATION(token))).status).toBe(410);
    expect((await anonymous().send('POST', CLAIM(token), { body: { password: PASSWORD } })).status).toBe(410);
  });
});

describe('cambio de correo', () => {
  /** Inserta el token que F7 creará: el correo nuevo viaja sellado con el hash del token como contexto. */
  function emailChangeToken(userId: string, newEmail: string): string {
    const token = randomUUID().replaceAll('-', '').padEnd(43, 'k');
    const tokenHash = sha256(token);
    const sealed = sealEmailChange(workerConfig().secrets.outboxKeyring, tokenHash, newEmail);
    sql(`insert into app.action_tokens (token_hash, kind, subject_id, data, expires_at) values ('${tokenHash}', 'cambio_email', '${userId}', '${JSON.stringify({ sealedEmail: sealed })}', now() + interval '1 day')`);
    return token;
  }

  it('actualiza el correo de Auth, cierra todas las sesiones y el token no se reutiliza', async () => {
    const { email, client } = await verifiedDonor();
    const userId = sql(`select id from auth.users where email = '${email}'`);
    const newEmail = emailFor('nuevo-correo');
    const token = emailChangeToken(userId, newEmail);

    const preview = await anonymous().send('GET', EMAIL_CHANGE(token));
    const changed = await anonymous().send('POST', EMAIL_CHANGE(token));
    const reused = await anonymous().send('POST', EMAIL_CHANGE(token));

    expect(preview.status).toBe(200);
    expect(preview.json.data.action).toBe('cambiar_email');
    expect(preview.text).not.toContain(newEmail);
    expect(changed.status).toBe(200);
    expect(Object.keys(changed.json.data)).toEqual(['message']);
    expect(reused.status).toBe(410);
    expect(sql(`select email from auth.users where id = '${userId}'`)).toBe(newEmail);
    // Las sesiones se eliminan; el access token ya emitido vale hasta su vencimiento (≤ 600 s, ADR-004), pero no se puede renovar.
    expect(sql(`select count(*) from auth.sessions where user_id = '${userId}'`)).toBe('0');
    expect(client.cookies.size).toBeGreaterThan(0);
    expect((await anonymous().login(email, { password: NEW_PASSWORD })).status).toBe(401);
    expect((await anonymous().login(newEmail, { password: NEW_PASSWORD })).status).toBe(200);
  });

  it('un correo nuevo que ya tiene cuenta es 409 y la cuenta no cambia', async () => {
    const { email } = await verifiedDonor();
    const taken = (await verifiedDonor()).email;
    const userId = sql(`select id from auth.users where email = '${email}'`);
    const token = emailChangeToken(userId, taken);

    const response = await anonymous().send('POST', EMAIL_CHANGE(token));

    expect(response.status).toBe(409);
    expect(sql(`select email from auth.users where id = '${userId}'`)).toBe(email);
  });

  it('un token desconocido es 404, uno mal formado 400, sin correo sellado 409 y no hay operación sin clave', async () => {
    const { email } = await verifiedDonor();
    const userId = sql(`select id from auth.users where email = '${email}'`);
    const bare = randomUUID().replaceAll('-', '').padEnd(43, 'z');
    sql(`insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values ('${sha256(bare)}', 'cambio_email', '${userId}', now() + interval '1 day')`);

    expect((await anonymous().send('POST', EMAIL_CHANGE('e'.repeat(43)))).status).toBe(404);
    expect((await anonymous().send('POST', EMAIL_CHANGE('corto'))).status).toBe(400);
    expect((await anonymous().send('POST', EMAIL_CHANGE(bare))).status).toBe(409);
    expect((await anonymous().send('POST', EMAIL_CHANGE(bare), { key: null })).status).toBe(400);
  });
});

describe('las RPC con hash de token o id de usuario no son ejecutables por un cliente directo de PostgREST', () => {
  it('con la anon key no se puede crear una cuenta de donante para un usuario ajeno ni consumir tokens', async () => {
    const victim = await signUpAuthOnly(emailFor('victima'), 'contrasena-original-2026');
    const attackerHash = sha256('A'.repeat(43));

    const link = await rpc('link_donor_account', {
      p_user_id: victim, p_token_hash: attackerHash, p_outbox_id: randomUUID(), p_sealed: 'x'.repeat(40),
      p_actor_ref: `email:${'a'.repeat(64)}`, p_key: 'clave-del-atacante-0001', p_hash: 'b'.repeat(64),
    });
    const verify = await rpc('verify_donor_email', { p_token_hash: attackerHash });
    const claim = await rpc('link_assisted_account', { p_user_id: victim, p_token_hash: attackerHash });

    expect(link.status).toBeGreaterThanOrEqual(400);
    expect(verify.status).toBeGreaterThanOrEqual(400);
    expect(claim.status).toBeGreaterThanOrEqual(400);
    expect(sql(`select count(*) from app.user_accounts where user_id = '${victim}'`)).toBe('0');
    expect(sql(`select count(*) from app.action_tokens where token_hash = '${attackerHash}'`)).toBe('0');
  });

  it('un usuario autenticado cualquiera tampoco: la respuesta es forbidden y no cambia nada', async () => {
    const { email } = await verifiedDonor();
    const local = readLocalSupabase();
    const token = (await fetch(`${local.apiUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: local.publishableKey, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: NEW_PASSWORD }),
    }).then((response) => response.json()) as { access_token: string }).access_token;
    const hash = 'a'.repeat(64);
    const calls: Array<[string, Record<string, unknown>]> = [
      ['get_donor_verification_preview', { p_token_hash: hash }],
      ['verify_donor_email', { p_token_hash: hash }],
      ['get_assisted_activation_preview', { p_token_hash: hash }],
      ['link_assisted_account', { p_user_id: randomUUID(), p_token_hash: hash }],
      ['get_assisted_signup_recipient', { p_signup_id: randomUUID(), p_hospital_id: HOSPITAL_IDS[0] }],
      ['get_email_change_preview', { p_token_hash: hash }],
      ['consume_email_change', { p_token_hash: hash }],
      ['issue_assisted_activation', { p_signup_id: randomUUID(), p_hospital_id: HOSPITAL_IDS[0], p_seq: 1, p_token_hash: hash, p_outbox_id: randomUUID(), p_sealed: 'x'.repeat(40) }],
      ['reissue_donor_verification', { p_email: 'x@example.test', p_token_hash: hash, p_outbox_id: randomUUID(), p_sealed: 'x'.repeat(40), p_actor_ref: `email:${'a'.repeat(64)}`, p_key: 'clave-de-prueba-0001', p_hash: 'b'.repeat(64) }],
    ];

    for (const [name, args] of calls) {
      const response = await rpc(name, args, token);
      if (response.status === 200) expect(((await response.json()) as { kind?: string }).kind, name).toBe('forbidden');
      else expect(response.status, name).toBeGreaterThanOrEqual(400);
    }
  });
});

describe('auditoría de denegaciones (RNF-AUD-01)', () => {
  const eventually = async (check: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 40 && !check(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  };

  it('un 403 y un 409 a un donante autenticado dejan eventos denegados, deduplicados y sin datos de la petición', async () => {
    const { email, client } = await verifiedDonor();
    const userId = sql(`select id from auth.users where email = '${email}'`);
    const count = (event: string) => Number(sql(`select count(*) from app.audit_events where actor_id = '${userId}' and event = '${event}' and result = 'denegado'`));

    expect((await client.send('GET', SIGNUPS)).status).toBe(403);
    expect((await client.send('GET', SIGNUPS)).status).toBe(403);
    expect((await onboard(client)).status).toBe(200);
    expect((await onboard(client, {}, randomUUID())).status).toBe(409);
    await eventually(() => count('denegacion.acceso') >= 1 && count('denegacion.conflicto') >= 1);

    expect(count('denegacion.acceso')).toBe(1);
    expect(count('denegacion.conflicto')).toBe(1);
    const reasons = sql(`select string_agg(reason, '|' order by reason) from app.audit_events where actor_id = '${userId}' and result = 'denegado'`);
    expect(reasons).toBe('GET /api/v1/hospitals/me/assisted-signups|PUT /api/v1/donors/me/onboarding-profile');
    expect(reasons).not.toContain(email);
  });

  it('una petición sin sesión que se rechaza no deja evento (no hay actor)', async () => {
    const before = sql("select count(*) from app.audit_events where result = 'denegado'");

    expect((await anonymous().send('GET', SIGNUPS)).status).toBe(401);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(sql("select count(*) from app.audit_events where result = 'denegado'")).toBe(before);
  });
});

describe('identidades técnicas separadas (F4 M-2)', () => {
  const kindOf = async (name: string, args: Record<string, unknown>, token: string) =>
    ((await (await rpc(name, args, token)).json()) as { kind?: string }).kind;

  it('la identidad de la API no opera el outbox y la del worker no emite tokens de acción', async () => {
    const apiToken = await accessTokenFor(SEED_USERS.apiTechnical.email, DEMO_PASSWORD);
    const workerToken = await accessTokenFor(SEED_USERS.worker.email, DEMO_PASSWORD);
    const hash = 'a'.repeat(64);
    const setup = { p_user_id: randomUUID(), p_token_hash: hash, p_outbox_id: randomUUID(), p_sealed: 'x'.repeat(40) };

    expect(await kindOf('worker_claim_due_outbox', { p_limit: 5 }, apiToken)).toBe('forbidden');
    expect(await kindOf('worker_expire_outbox', {}, apiToken)).toBe('forbidden');
    expect(await kindOf('issue_password_setup', setup, workerToken)).toBe('forbidden');
    expect(await kindOf('verify_donor_email', { p_token_hash: hash }, workerToken)).toBe('forbidden');
    expect(await kindOf('ingest_email_event', { p_event_id: 'evt-sep', p_provider_message_id: 'prov-sep', p_type: 'email.sent', p_occurred_at: new Date().toISOString() }, workerToken)).toBe('forbidden');
    // Controles: cada identidad sí ejecuta lo suyo.
    expect(await kindOf('issue_password_setup', setup, apiToken)).toBe('conflict');
    expect(await kindOf('worker_claim_due_outbox', { p_limit: 5 }, workerToken)).toBe('ok');
  });
});

describe('observabilidad y contrato', () => {
  it('ningún token, correo ni contraseña aparece en los registros del servidor, en el outbox en claro ni en la auditoría', async () => {
    const email = emailFor('canario');
    await register(email);
    const { token } = latestSealed('verificacion_email', email);
    await anonymous().send('GET', VERIFY(token));
    await createSignup(emailFor('canario-alta'));

    const logs = backend.logLines.join('\n');
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(email);
    expect(logs).not.toContain(PASSWORD);
    expect(sql(`select coalesce(string_agg(event || coalesce(reason, ''), ' '), '') from app.audit_events`)).not.toContain(token);
    expect(sql(`select coalesce(string_agg(sealed_payload, ' '), '') from app.email_outbox where sealed_payload is not null`)).not.toContain(token);
  });

  it('todo estado HTTP devuelto está declarado para su operación en docs/openapi.json', () => {
    expect(observed.length).toBeGreaterThan(30);
    expect(undeclaredStatuses()).toEqual([]);
  });
});
