import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { latestSealed } from '../support/accounts.js';
import { startBackend, type RunningBackend } from '../support/app.js';
import { ApiClient } from '../support/client.js';
import { resetAuthQuota, sql } from '../support/db.js';
import { DEMO_PASSWORD, SEED_USERS } from '../support/local-env.js';

const REQUESTS = '/api/v1/donors/me/correction-requests';
const ADMIN_REQUESTS = '/api/v1/superadmin/correction-requests';
const GRANTS = '/api/v1/superadmin/access-grants';
const EMAIL_CHANGE = (token: string) => `/api/v1/donor-email-change-actions/${token}`;
const GRANT_HEADER = 'x-contextual-grant';

// Cada step-up espera una ventana TOTP nueva (hasta 30 s): se renueva solo cuando va a vencer (vale 5 min).
vi.setConfig({ testTimeout: 180_000 });
let lastStepUp = 0;
let backend: RunningBackend;
let superadmin: ApiClient;

beforeEach(() => {
  resetAuthQuota();
});

beforeAll(async () => {
  backend = await startBackend();
  superadmin = new ApiClient(backend.baseUrl);
  expect((await superadmin.login(SEED_USERS.superadmin.email)).status).toBe(200);
}, 120_000);

afterAll(async () => {
  await backend.close();
});

/** Donante activo con sesión: la fila se prepara por SQL (el registro completo ya lo cubre F5). */
async function activeDonor(name = 'Donante Sintético'): Promise<{ id: string; email: string; client: ApiClient }> {
  const email = `privacidad-${randomUUID().slice(0, 8)}@example.test`;
  const local = await import('../support/accounts.js');
  const id = await local.signUpAuthOnly(email, DEMO_PASSWORD);
  sql(`insert into app.user_accounts (user_id, role, display_name) values ('${id}', 'donante', null)`);
  sql(`insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
       values ('${id}', '${name}', 'O_POS', true, -12.046, -77.043, 'DEMO_ONLY-1', 'activo', now())`);
  const client = new ApiClient(backend.baseUrl);
  expect((await client.login(email)).status).toBe(200);
  return { id, email, client };
}

async function ensureStepUp(): Promise<void> {
  if (Date.now() - lastStepUp < 200_000) return;
  expect((await superadmin.stepUp(SEED_USERS.superadmin.email)).status).toBe(200);
  lastStepUp = Date.now();
}

async function approve(requestId: string): Promise<void> {
  const decided = await superadmin.send('PATCH', `${ADMIN_REQUESTS}/${requestId}`, { body: { decision: 'aprobada', reason: 'Solicitud sintética verificada.' } });
  expect(decided.status).toBe(200);
}

async function grant(requestId: string, action: 'review' | 'execute', allowedFields: string[]): Promise<string> {
  await ensureStepUp();
  const created = await superadmin.send('POST', GRANTS, { body: { requestId, action, allowedFields, reason: 'Revisión sintética.' } });
  expect(created.status).toBe(201);
  return created.json.data.grantId as string;
}

describe('solicitud de corrección de punta a punta', () => {
  it('el donante pide cambiar su nombre; el superadmin aprueba, ve solo lo autorizado y ejecuta', async () => {
    const donor = await activeDonor('Nombre Original');
    const created = await donor.client.send('POST', REQUESTS, { body: { type: 'correccion', changes: { name: 'Nombre Corregido' } } });
    expect(created.status).toBe(201);
    expect(created.json.data).toMatchObject({ type: 'correccion', requestedFields: ['name'], status: 'pendiente' });
    expect(created.text).not.toContain('Nombre Corregido');
    const requestId = created.json.data.requestId as string;

    // El superadmin ve estado y campos, nunca valores ni al donante.
    const summary = await superadmin.send('GET', `${ADMIN_REQUESTS}/${requestId}`);
    expect(summary.status).toBe(200);
    expect(summary.text).not.toMatch(/Nombre|Original|donorId|@example/);
    expect((await superadmin.send('GET', `${ADMIN_REQUESTS}?limit=100`)).text).not.toContain('Nombre Corregido');

    await approve(requestId);
    const reviewGrant = await grant(requestId, 'review', ['name']);
    const data = await superadmin.send('GET', `${ADMIN_REQUESTS}/${requestId}/donor-data`, { headers: { [GRANT_HEADER]: reviewGrant } });
    expect(data.status).toBe(200);
    expect(data.headers.get('cache-control')).toBe('no-store');
    expect(data.json.data).toEqual({ currentValues: { name: 'Nombre Original' }, proposedValues: { name: 'Nombre Corregido' } });

    // Un grant de revisión no ejecuta; uno de ejecución sí.
    await ensureStepUp();
    expect((await superadmin.send('POST', `${ADMIN_REQUESTS}/${requestId}/executions`, { headers: { [GRANT_HEADER]: reviewGrant } })).status).toBe(403);
    const executeGrant = await grant(requestId, 'execute', ['name']);
    const key = randomUUID();
    const executed = await superadmin.send('POST', `${ADMIN_REQUESTS}/${requestId}/executions`, { key, headers: { [GRANT_HEADER]: executeGrant } });
    expect(executed.status).toBe(200);
    expect(executed.json.data.status).toBe('completada');
    expect(sql(`select name from app.donor_profiles where donor_id = '${donor.id}'`)).toBe('Nombre Corregido');

    const replay = await superadmin.send('POST', `${ADMIN_REQUESTS}/${requestId}/executions`, { key, headers: { [GRANT_HEADER]: executeGrant } });
    expect(replay.status).toBe(200);
    expect(replay.json).toEqual(executed.json);
    expect((await donor.client.send('GET', `${REQUESTS}/${requestId}`)).json.data.status).toBe('completada');
  });

  it('20 ejecuciones con la misma clave producen un solo efecto', async () => {
    const donor = await activeDonor('Antes');
    const requestId = (await donor.client.send('POST', REQUESTS, { body: { type: 'correccion', changes: { name: 'Después' } } })).json.data.requestId as string;
    await approve(requestId);
    const executeGrant = await grant(requestId, 'execute', ['name']);
    const key = randomUUID();

    const responses = await Promise.all(Array.from({ length: 20 }, () =>
      superadmin.send('POST', `${ADMIN_REQUESTS}/${requestId}/executions`, { key, headers: { [GRANT_HEADER]: executeGrant } })));

    expect(responses.filter((response) => response.status === 200).length).toBeGreaterThan(0);
    expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
    expect(sql(`select count(*) from app.audit_events where event = 'solicitud.ejecutada' and resource_id = '${requestId}'`)).toBe('1');
  });

  it('una segunda solicitud abierta del mismo tipo es 409 y la de otro donante no se ve', async () => {
    const donor = await activeDonor();
    const other = await activeDonor();
    const first = await donor.client.send('POST', REQUESTS, { body: { type: 'correccion', changes: { name: 'Uno' } } });
    expect(first.status).toBe(201);
    expect((await donor.client.send('POST', REQUESTS, { body: { type: 'correccion', changes: { name: 'Dos' } } })).status).toBe(409);
    expect((await other.client.send('GET', `${REQUESTS}/${first.json.data.requestId}`)).status).toBe(404);
    expect((await other.client.send('GET', REQUESTS)).json.data.items).toEqual([]);
  });

  it('sin aprobación no hay ejecución; un grant vencido es 410 y uno ajeno o malformado, 403', async () => {
    const donor = await activeDonor();
    const requestId = (await donor.client.send('POST', REQUESTS, { body: { type: 'correccion', changes: { name: 'Pendiente' } } })).json.data.requestId as string;
    await ensureStepUp();
    expect((await superadmin.send('POST', GRANTS, { body: { requestId, action: 'execute', allowedFields: ['name'], reason: 'Sin aprobar.' } })).status).toBe(409);

    await approve(requestId);
    const reviewGrant = await grant(requestId, 'review', ['name']);
    expect((await superadmin.send('GET', `${ADMIN_REQUESTS}/${requestId}/donor-data`, { headers: { [GRANT_HEADER]: 'no-es-un-uuid-valido-pero-largo-suficiente' } })).status).toBe(403);
    expect((await superadmin.send('GET', `${ADMIN_REQUESTS}/${requestId}/donor-data`, { headers: { [GRANT_HEADER]: randomUUID() } })).status).toBe(403);
    sql(`update app.access_grants set created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' where grant_id = '${reviewGrant}'`);
    expect((await superadmin.send('GET', `${ADMIN_REQUESTS}/${requestId}/donor-data`, { headers: { [GRANT_HEADER]: reviewGrant } })).status).toBe(410);
  });

  it('los endpoints privilegiados exigen su rol: un donante no decide ni crea grants', async () => {
    const donor = await activeDonor();
    const requestId = (await donor.client.send('POST', REQUESTS, { body: { type: 'correccion', changes: { name: 'Nada' } } })).json.data.requestId as string;
    expect((await donor.client.send('PATCH', `${ADMIN_REQUESTS}/${requestId}`, { body: { decision: 'aprobada', reason: 'Yo mismo.' } })).status).toBe(403);
    expect((await donor.client.send('POST', GRANTS, { body: { requestId, action: 'review', allowedFields: ['name'], reason: 'Yo.' } })).status).toBe(403);
    expect((await donor.client.send('GET', ADMIN_REQUESTS)).status).toBe(403);
  });
});

describe('cambio de correo', () => {
  it('el enlace va al buzón nuevo, el correo propuesto nunca sale en claro y al verificarlo la solicitud se completa', async () => {
    const donor = await activeDonor();
    const newEmail = `nuevo-${randomUUID().slice(0, 8)}@example.test`;
    const created = await donor.client.send('POST', REQUESTS, { body: { type: 'correccion', changes: { newEmail } } });
    expect(created.status).toBe(201);
    expect(created.text).not.toContain(newEmail);
    const requestId = created.json.data.requestId as string;
    await approve(requestId);

    const reviewGrant = await grant(requestId, 'review', ['email']);
    const data = await superadmin.send('GET', `${ADMIN_REQUESTS}/${requestId}/donor-data`, { headers: { [GRANT_HEADER]: reviewGrant } });
    expect(data.json.data).toEqual({ currentValues: { email: donor.email }, proposedValues: { email: newEmail } });

    const executeGrant = await grant(requestId, 'execute', ['email']);
    const executed = await superadmin.send('POST', `${ADMIN_REQUESTS}/${requestId}/executions`, { headers: { [GRANT_HEADER]: executeGrant } });
    expect(executed.status).toBe(200);
    expect(executed.json.data.status).toBe('en_ejecucion');
    expect(executed.text).not.toContain(newEmail);

    // Canarios: el correo nuevo no aparece en claro en auditoría, solicitudes ni outbox.
    expect(sql(`select count(*) from app.audit_events where reason like '%${newEmail}%'`)).toBe('0');
    expect(sql(`select count(*) from app.email_outbox where sealed_payload like '%${newEmail}%'`)).toBe('0');
    expect(sql(`select count(*) from app.correction_requests where proposed_email_sealed like '%${newEmail}%'`)).toBe('0');

    const { token } = latestSealed('cambio_email', newEmail);
    expect((await new ApiClient(backend.baseUrl).send('GET', EMAIL_CHANGE(token))).status).toBe(200);
    expect((await new ApiClient(backend.baseUrl).send('POST', EMAIL_CHANGE(token))).status).toBe(200);

    expect(sql(`select status from app.correction_requests where request_id = '${requestId}'`)).toBe('completada');
    expect(sql(`select email from auth.users where id = '${donor.id}'`)).toBe(newEmail);
    expect((await new ApiClient(backend.baseUrl).login(newEmail)).status).toBe(200);
  });
});

describe('eliminación', () => {
  it('la eliminación aprobada borra la cuenta de Auth y los datos de aplicación, deja el ledger y completa la solicitud (200)', async () => {
    const donor = await activeDonor();
    const created = await donor.client.send('POST', REQUESTS, { body: { type: 'eliminacion' } });
    expect(created.status).toBe(201);
    expect(created.json.data.requestedFields).toEqual(['deletion']);
    const requestId = created.json.data.requestId as string;
    await approve(requestId);
    const executeGrant = await grant(requestId, 'execute', ['name']);

    const executionKey = randomUUID();
    const executed = await superadmin.send('POST', `${ADMIN_REQUESTS}/${requestId}/executions`, { key: executionKey, headers: { [GRANT_HEADER]: executeGrant } });

    expect(executed.status).toBe(200);
    expect(executed.json.data.status).toBe('completada');
    expect(sql(`select count(*) from auth.users where id = '${donor.id}'`)).toBe('0');
    expect(sql(`select count(*) from app.user_accounts where user_id = '${donor.id}'`)).toBe('0');
    expect(sql(`select count(*) from app.donor_profiles where donor_id = '${donor.id}'`)).toBe('0');
    expect(sql(`select count(*) from app.hospital_memberships where user_id = '${donor.id}'`)).toBe('0');
    expect(sql(`select count(*) from app.deletion_ledger`)).not.toBe('0');
    expect(sql(`select donor_id is null from app.correction_requests where request_id = '${requestId}'`)).toBe('t');
    expect((await new ApiClient(backend.baseUrl).login(donor.email)).status).toBe(401);

    // Replay (misma clave de idempotencia) tras el cierre: sigue siendo 200 y no vuelve a escribir el ledger. Con otra clave la
    // solicitud ya completada es un 409 legítimo.
    const ledgerBefore = sql('select count(*) from app.deletion_ledger');
    const replay = await superadmin.send('POST', `${ADMIN_REQUESTS}/${requestId}/executions`, { key: executionKey, headers: { [GRANT_HEADER]: executeGrant } });
    expect(replay.status).toBe(200);
    expect(sql('select count(*) from app.deletion_ledger')).toBe(ledgerBefore);
  });
});
