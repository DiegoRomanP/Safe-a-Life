import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  NEED_STATUSES, canTransitionManually, evaluateManualTransition, type NeedStatus,
} from '../../src/modules/need-records/domain/need-state.js';
import { startBackend, type RunningBackend } from '../support/app.js';
import { ApiClient, observed } from '../support/client.js';
import { MIN_OBSERVED, undeclaredStatuses } from '../support/contract-statuses.js';
import { resetAuthQuota, sql } from '../support/db.js';
import { HOSPITAL_IDS, SEED_USERS, SITE_IDS } from '../support/local-env.js';

const NEEDS = '/api/v1/hospitals/me/needs';

let backend: RunningBackend;
let admin1: ApiClient;
let admin2: ApiClient;
let superadmin: ApiClient;
let donor: ApiClient;

beforeEach(() => {
  resetAuthQuota();
});

beforeAll(async () => {
  backend = await startBackend();
  admin1 = new ApiClient(backend.baseUrl);
  admin2 = new ApiClient(backend.baseUrl);
  superadmin = new ApiClient(backend.baseUrl);
  donor = new ApiClient(backend.baseUrl);
  expect((await admin1.login(SEED_USERS.admin1.email)).status).toBe(200);
  expect((await admin2.login(SEED_USERS.admin2.email)).status).toBe(200);
  expect((await superadmin.login(SEED_USERS.superadmin.email)).status).toBe(200);
  expect((await donor.login(SEED_USERS.donor1.email)).status).toBe(200);
  sql('delete from app.needs');
  // Estado compartido con otros archivos de integración (el orden de ejecución no está fijado).
  sql("update app.hospital_memberships set status = 'activa', revoked_at = null, revoke_reason = null where status <> 'activa'");
});

afterAll(async () => {
  await backend.close();
});

const BODY = {
  component: 'RBC', requiredBloodType: 'O_NEG', targetConfirmations: 5, siteId: SITE_IDS.hospital1Active, urgency: 'Urgente', expiresInHours: 12,
};
const TEN_FIELDS = [
  'component', 'confirmedIntentCount', 'expiresAt', 'needId', 'radiusKm', 'requiredBloodType', 'siteId', 'status', 'targetConfirmations', 'urgency',
];

/** Inserta una necesidad del hospital 1 directamente como propietario de la base (fixture de estado). */
function insertNeed(status: NeedStatus, options: { createdAt?: string; expiresAt?: string } = {}): string {
  const createdAt = options.createdAt ?? 'now() - interval \'1 hour\'';
  const expiresAt = options.expiresAt ?? 'now() + interval \'2 days\'';
  return sql(`insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations,
    radius_km, urgency, status, created_at, expires_at)
    select '${HOSPITAL_IDS[0]}', '${SITE_IDS.hospital1Active}', user_id, 'RBC', 'O_POS', 3, 10, 'Normal', '${status}', ${createdAt}, ${expiresAt}
    from app.user_accounts where role = 'admin_hospitalario' limit 1 returning need_id`).split('\n')[0];
}

describe('autorización de las cuatro operaciones (rol × AAL × hospital)', () => {
  it('sin sesión es 401', async () => {
    const anonymous = new ApiClient(backend.baseUrl);

    expect((await anonymous.send('GET', NEEDS)).status).toBe(401);
    expect((await anonymous.send('GET', `${NEEDS}/${randomUUID()}`)).status).toBe(401);
  });

  it.each([
    ['un donante', () => donor],
    ['un superadmin', () => superadmin],
  ])('%s recibe 403 en crear, listar, consultar y transicionar', async (_label, who) => {
    const client = who();
    const id = randomUUID();

    expect((await client.send('POST', NEEDS, { body: BODY })).status).toBe(403);
    expect((await client.send('GET', NEEDS)).status).toBe(403);
    expect((await client.send('GET', `${NEEDS}/${id}`)).status).toBe(403);
    expect((await client.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'activa' } })).status).toBe(403);
  });

  it('un admin en AAL1 recibe 403 MFA_REQUIRED y no crea nada', async () => {
    const aal1 = new ApiClient(backend.baseUrl);
    await aal1.login(SEED_USERS.admin3.email, { mfa: false });

    const response = await aal1.send('POST', NEEDS, { body: { ...BODY, siteId: SITE_IDS.hospital3Active } });

    expect(response.status).toBe(403);
    expect(response.json.error.code).toBe('MFA_REQUIRED');
    expect(sql(`select count(*) from app.needs where hospital_id = '${HOSPITAL_IDS[2]}'`)).toBe('0');
  });

  it('una mutación sin CSRF o sin Origin es 403 y no crea nada', async () => {
    const before = sql('select count(*) from app.needs');

    const noOrigin = await admin1.send('POST', NEEDS, { body: BODY, origin: null });
    const foreign = await admin1.send('POST', NEEDS, { body: BODY, origin: 'https://evil.example.test' });

    expect(noOrigin.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(sql('select count(*) from app.needs')).toBe(before);
  });
});

describe('createHospitalNeed', () => {
  it('crea un borrador con los diez campos, radio 10 por defecto y confirmedIntentCount 0', async () => {
    const response = await admin1.send('POST', NEEDS, { body: BODY });

    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    expect(Object.keys(response.json.data).sort()).toEqual(TEN_FIELDS);
    expect(response.json.data).toMatchObject({ status: 'borrador', confirmedIntentCount: 0, radiusKm: 10, siteId: SITE_IDS.hospital1Active });
    expect(Object.keys(response.json)).toEqual(['data']);
  });

  it('el propietario sale de la sesión: la fila queda con el hospital y el actor del admin', async () => {
    const response = await admin1.send('POST', NEEDS, { body: { ...BODY, targetConfirmations: 7 } });

    const row = sql(`select hospital_id || '|' || created_by from app.needs where need_id = '${response.json.data.needId}'`);
    const actor = sql(`select u.id from auth.users u where u.email = '${SEED_USERS.admin1.email}'`);
    expect(row).toBe(`${HOSPITAL_IDS[0]}|${actor}`);
  });

  it('expiresAt es el nacimiento de la fila más expiresInHours, con la precisión de PostgreSQL', async () => {
    const response = await admin1.send('POST', NEEDS, { body: { ...BODY, expiresInHours: 3 } });

    const gap = sql(`select extract(epoch from expires_at - created_at)::int from app.needs where need_id = '${response.json.data.needId}'`);
    expect(gap).toBe(String(3 * 3600));
    expect(response.json.data.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  });

  it('paridad del hash TS↔SQL: diez intenciones distintas se aceptan (un hash divergente sería 500)', async () => {
    const fixtures = [
      { ...BODY },
      { ...BODY, radiusKm: 10 },
      { ...BODY, radiusKm: 1 },
      { ...BODY, radiusKm: 50, requiredBloodType: 'AB_POS' },
      { ...BODY, requiredBloodType: 'A_NEG', urgency: 'Critica', targetConfirmations: 1 },
      { ...BODY, requiredBloodType: 'B_POS', urgency: 'Normal', targetConfirmations: 50 },
      { ...BODY, requiredBloodType: 'B_NEG', expiresInHours: 1 },
      { ...BODY, requiredBloodType: 'AB_NEG', expiresInHours: 72 },
      { ...BODY, requiredBloodType: 'O_POS', radiusKm: 25, targetConfirmations: 12 },
      { ...BODY, requiredBloodType: 'A_POS', urgency: 'Normal', radiusKm: 7, expiresInHours: 36 },
    ];

    for (const fixture of fixtures) {
      const response = await admin1.send('POST', NEEDS, { body: fixture });
      expect(response.status, JSON.stringify(fixture)).toBe(201);
    }
  });

  it('un UUID de sede con letras en mayúsculas se acepta y la respuesta lo devuelve canónico (minúsculas)', async () => {
    const lower = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    sql(`insert into app.sites (site_id, hospital_id, public_name, public_address, latitude, longitude, is_active, is_approved)
      values ('${lower}', '${HOSPITAL_IDS[0]}', 'Sede con letras', 'Cercado de Lima', -12.04, -77.04, true, true)`);
    try {
      const key = randomUUID();
      const body = { ...BODY, siteId: lower.toUpperCase() };

      const first = await admin1.send('POST', NEEDS, { body, key });
      const replay = await admin1.send('POST', NEEDS, { body, key });
      const otherCasing = await admin1.send('POST', NEEDS, { body: { ...BODY, siteId: lower }, key });

      expect(first.status).toBe(201);
      expect(first.json.data.siteId).toBe(lower);
      expect(replay.status).toBe(201);
      expect(replay.json).toEqual(first.json);
      // Otro casing es otra intención literal (spec A2 §7): la misma clave es un conflicto, no una necesidad nueva.
      expect(otherCasing.status).toBe(409);
    } finally {
      sql(`delete from app.needs where site_id = '${lower}'; delete from app.sites where site_id = '${lower}'`);
    }
  });

  it('la forma urn:uuid: se rechaza con 400 en el POST, el GET y el PATCH', async () => {
    expect((await admin1.send('POST', NEEDS, { body: { ...BODY, siteId: `urn:uuid:${SITE_IDS.hospital1Active}` } })).status).toBe(400);
    expect((await admin1.send('GET', `${NEEDS}/urn:uuid:${randomUUID()}`)).status).toBe(400);
    expect((await admin1.send('PATCH', `${NEEDS}/urn:uuid:${randomUUID()}`, { body: { status: 'activa' } })).status).toBe(400);
  });

  it('sede inexistente, ajena, inactiva o sin aprobar dan el mismo 422 (código y mensaje)', async () => {
    const cases = [randomUUID(), SITE_IDS.hospital2Active, SITE_IDS.hospital1Inactive, SITE_IDS.hospital2Unapproved];
    const responses = [];
    for (const siteId of cases) responses.push(await admin1.send('POST', NEEDS, { body: { ...BODY, siteId } }));

    for (const response of responses) {
      expect(response.status).toBe(422);
      expect({ code: response.json.error.code, message: response.json.error.message })
        .toEqual({ code: 'VALIDATION_FAILED', message: 'Uno o más valores no cumplen las reglas del campo.' });
    }
  });

  it('un rechazo por sede no deja registro de idempotencia: la misma clave sirve tras corregir la sede', async () => {
    const key = randomUUID();

    const bad = await admin1.send('POST', NEEDS, { body: { ...BODY, siteId: SITE_IDS.hospital2Active }, key });
    const good = await admin1.send('POST', NEEDS, { body: BODY, key });

    expect(bad.status).toBe(422);
    expect(good.status).toBe(201);
  });

  it.each([
    ['hospitalId en el body', { ...BODY, hospitalId: HOSPITAL_IDS[1] }, 400],
    ['rol en el body', { ...BODY, role: 'superadmin' }, 400],
    ['estado en el body', { ...BODY, status: 'activa' }, 400],
    ['campo requerido ausente', { component: 'RBC' }, 400],
    ['UUID de sede inválido', { ...BODY, siteId: 'no-es-uuid' }, 400],
    ['meta fraccionaria', { ...BODY, targetConfirmations: 2.5 }, 400],
    ['meta 0', { ...BODY, targetConfirmations: 0 }, 422],
    ['meta 51', { ...BODY, targetConfirmations: 51 }, 422],
    ['radio 51', { ...BODY, radiusKm: 51 }, 422],
    ['horas 73', { ...BODY, expiresInHours: 73 }, 422],
    ['grupo desconocido', { ...BODY, requiredBloodType: 'XX' }, 422],
  ])('%s es %i y no crea nada', async (_label, body, status) => {
    const before = sql('select count(*) from app.needs');

    const response = await admin1.send('POST', NEEDS, { body });

    expect(response.status).toBe(status);
    expect(sql('select count(*) from app.needs')).toBe(before);
  });

  it('exige Idempotency-Key de 16 a 255 caracteres', async () => {
    expect((await admin1.send('POST', NEEDS, { body: BODY, key: null })).status).toBe(400);
    expect((await admin1.send('POST', NEEDS, { body: BODY, key: 'a'.repeat(15) })).status).toBe(400);
    expect((await admin1.send('POST', NEEDS, { body: BODY, key: 'a'.repeat(256) })).status).toBe(400);
  });

  it('un parámetro de query desconocido es 400', async () => {
    expect((await admin1.send('POST', `${NEEDS}?x=1`, { body: BODY })).status).toBe(400);
  });

  it('el replay con la misma clave devuelve el mismo 201 sin crear otra fila; otra intención es 409', async () => {
    const key = randomUUID();
    const body = { ...BODY, targetConfirmations: 9 };

    const first = await admin1.send('POST', NEEDS, { body, key });
    const replay = await admin1.send('POST', NEEDS, { body: { ...body, radiusKm: 10 }, key });
    const conflict = await admin1.send('POST', NEEDS, { body: { ...body, targetConfirmations: 10 }, key });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.json).toEqual(first.json);
    expect(conflict.status).toBe(409);
    expect(sql(`select count(*) from app.needs where need_id = '${first.json.data.needId}'`)).toBe('1');
  });

  it('20 POST concurrentes con la misma clave crean una sola fila y 20 respuestas idénticas', async () => {
    const key = randomUUID();
    const body = { ...BODY, targetConfirmations: 11, requiredBloodType: 'B_NEG' };
    const before = Number(sql(`select count(*) from app.needs where target_confirmations = 11 and required_blood_type = 'B_NEG'`));

    const responses = await Promise.all(Array.from({ length: 20 }, () => admin1.send('POST', NEEDS, { body, key })));

    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(201));
    expect(new Set(responses.map((response) => JSON.stringify(response.json))).size).toBe(1);
    expect(Number(sql(`select count(*) from app.needs where target_confirmations = 11 and required_blood_type = 'B_NEG'`))).toBe(before + 1);
  });

  it('el replay posterior a expiresAt conserva el instante original, el estado y el identificador', async () => {
    const key = randomUUID();
    const first = await admin1.send('POST', NEEDS, { body: { ...BODY, targetConfirmations: 13 }, key });
    sql(`update app.needs set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where need_id = '${first.json.data.needId}'`);

    const replay = await admin1.send('POST', NEEDS, { body: { ...BODY, targetConfirmations: 13 }, key });

    expect(replay.status).toBe(201);
    expect(replay.json).toEqual(first.json);
    expect(replay.json.data.status).toBe('borrador');
  });

  it('el rollback es total: una auditoría que falla deja cero filas y cero claves de idempotencia', async () => {
    const key = randomUUID();
    const before = sql('select count(*) from app.needs');
    sql(`create function app.test_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'fallo forzado'; end $$;
      create trigger test_fail_audit before insert on app.audit_events for each row execute function app.test_fail_audit();`);
    try {
      const response = await admin1.send('POST', NEEDS, { body: { ...BODY, targetConfirmations: 14 }, key });

      expect(response.status).toBe(500);
      expect(response.json.error.code).toBe('INTERNAL_ERROR');
    } finally {
      sql('drop trigger test_fail_audit on app.audit_events; drop function app.test_fail_audit();');
    }
    expect(sql('select count(*) from app.needs')).toBe(before);
    expect(sql(`select count(*) from app.idempotency_records where idem_key = '${key}'`)).toBe('0');
  });

  it('un admin de otro hospital con la misma clave obtiene su propia necesidad (la clave se liga al actor)', async () => {
    const key = randomUUID();

    const a = await admin1.send('POST', NEEDS, { body: { ...BODY, targetConfirmations: 15 }, key });
    const b = await admin2.send('POST', NEEDS, { body: { ...BODY, targetConfirmations: 15, siteId: SITE_IDS.hospital2Active }, key });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.json.data.needId).not.toBe(a.json.data.needId);
  });

  it('tras revocar la membresía, ni siquiera el replay de una creación previa se entrega (403)', async () => {
    const revoked = new ApiClient(backend.baseUrl);
    await revoked.login(SEED_USERS.admin3.email);
    const key = randomUUID();
    const body = { ...BODY, siteId: SITE_IDS.hospital3Active, targetConfirmations: 17 };
    expect((await revoked.send('POST', NEEDS, { body, key })).status).toBe(201);
    const email = SEED_USERS.admin3.email;
    sql(`update app.hospital_memberships set status = 'revocada', revoked_at = now() where user_id = (select id from auth.users where email = '${email}')`);
    try {
      expect((await revoked.send('POST', NEEDS, { body, key })).status).toBe(403);
    } finally {
      sql(`update app.hospital_memberships set status = 'activa', revoked_at = null where user_id = (select id from auth.users where email = '${email}')`);
    }
  });

  it('el tope por actor responde 429 a una creación nueva y no consume cupo en un replay ni deja la clave en curso', async () => {
    const client = new ApiClient(backend.baseUrl);
    await client.login(SEED_USERS.admin2.email);
    const key = randomUUID();
    const body = { ...BODY, siteId: SITE_IDS.hospital2Active, targetConfirmations: 18 };
    expect((await client.send('POST', NEEDS, { body, key })).status).toBe(201);
    sql(`insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, expires_at)
      select '${HOSPITAL_IDS[1]}', '${SITE_IDS.hospital2Active}', id, 'RBC', 'O_POS', 2, 1, 'Normal', now() + interval '1 day'
      from auth.users, generate_series(1, 60) where email = '${SEED_USERS.admin2.email}'`);
    try {
      const replay = await client.send('POST', NEEDS, { body, key });
      const limited = await client.send('POST', NEEDS, { body: { ...body, targetConfirmations: 19 }, key: randomUUID() });

      expect(replay.status).toBe(201);
      expect(limited.status).toBe(429);
      expect(limited.json.error.code).toBe('RATE_LIMITED');
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      for (let attempt = 0; attempt < 40 && sql(`select count(*) from app.audit_events where event = 'denegacion.limite' and reason = 'POST /api/v1/hospitals/me/needs' and actor_id = (select id from auth.users where email = '${SEED_USERS.admin2.email}')`) === '0'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(sql(`select reason from app.audit_events where event = 'denegacion.limite' and reason = 'POST /api/v1/hospitals/me/needs' and actor_id = (select id from auth.users where email = '${SEED_USERS.admin2.email}') limit 1`)).toBe('POST /api/v1/hospitals/me/needs');
      expect(sql(`select count(*) from app.needs where target_confirmations = 19 and hospital_id = '${HOSPITAL_IDS[1]}'`)).toBe('0');
    } finally {
      sql(`delete from app.needs where hospital_id = '${HOSPITAL_IDS[1]}' and target_confirmations = 2 and radius_km = 1`);
    }
  });

  it('20 reintentos concurrentes con la misma clave no gastan cupo de creación (una sola fila nueva)', async () => {
    const key = randomUUID();
    const body = { ...BODY, targetConfirmations: 22, requiredBloodType: 'A_NEG' };
    const countBefore = Number(sql(`select count(*) from app.needs n join auth.users u on u.id = n.created_by where u.email = '${SEED_USERS.admin1.email}' and n.created_at > now() - interval '1 hour'`));

    await Promise.all(Array.from({ length: 20 }, () => admin1.send('POST', NEEDS, { body, key })));

    const countAfter = Number(sql(`select count(*) from app.needs n join auth.users u on u.id = n.created_by where u.email = '${SEED_USERS.admin1.email}' and n.created_at > now() - interval '1 hour'`));
    expect(countAfter - countBefore).toBe(1);
  });

  it('la creación solo escribe necesidad, idempotencia y auditoría (sin invitaciones, outbox ni correo)', async () => {
    const before = sql(`select count(*) from app.audit_events where event = 'necesidad.creada'`);

    await admin1.send('POST', NEEDS, { body: { ...BODY, targetConfirmations: 16 } });

    expect(Number(sql(`select count(*) from app.audit_events where event = 'necesidad.creada'`))).toBe(Number(before) + 1);
    expect(sql(`select count(*) from app.audit_events where event = 'necesidad.creada' and reason is not null`)).toBe('0');
  });
});

describe('listOwnHospitalNeeds y getOwnHospitalNeed', () => {
  let ids: string[];

  beforeAll(async () => {
    sql('delete from app.needs');
    ids = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push((await admin1.send('POST', NEEDS, { body: { ...BODY, targetConfirmations: i + 1 } })).json.data.needId);
    }
    await admin2.send('POST', NEEDS, { body: { ...BODY, siteId: SITE_IDS.hospital2Active } });
  });

  it('cada hospital lista solo las suyas, más recientes primero', async () => {
    const response = await admin1.send('GET', `${NEEDS}?limit=100`);

    expect(response.status).toBe(200);
    expect(response.json.data.items.map((item: { needId: string }) => item.needId)).toEqual([...ids].reverse());
    expect(response.json.data.pagination).toEqual({ nextCursor: null });
    expect((await admin2.send('GET', NEEDS)).json.data.items).toHaveLength(1);
  });

  it('pagina con un cursor opaco sin repetir ni omitir elementos', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const response: Awaited<ReturnType<ApiClient['send']>> = await admin1.send('GET', `${NEEDS}?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      expect(response.status).toBe(200);
      seen.push(...response.json.data.items.map((item: { needId: string }) => item.needId));
      cursor = response.json.data.pagination.nextCursor;
      if (cursor === null) break;
    }

    expect(seen).toEqual([...ids].reverse());
  });

  it('con created_at idéntico, el desempate por need_id no repite ni omite elementos', async () => {
    sql('delete from app.needs');
    const tie = "'2026-10-13 10:00:00.123456+00'";
    const expected: string[] = [];
    for (let i = 0; i < 5; i += 1) expected.push(insertNeed('activa', { createdAt: tie, expiresAt: "now() + interval '3 days'" }));
    expected.sort().reverse();

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 6; page += 1) {
      const response: Awaited<ReturnType<ApiClient['send']>> = await admin1.send('GET', `${NEEDS}?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      seen.push(...response.json.data.items.map((item: { needId: string }) => item.needId));
      cursor = response.json.data.pagination.nextCursor;
      if (cursor === null) break;
    }

    expect(seen).toEqual(expected);
  });

  it('un cursor manipulado o de otro actor es 400 (como en el resto de listados)', async () => {
    const first = await admin1.send('GET', `${NEEDS}?limit=2`);
    const cursor = first.json.data.pagination.nextCursor as string;

    const tampered = await admin1.send('GET', `${NEEDS}?limit=2&cursor=${encodeURIComponent(`${cursor.slice(0, -2)}xx`)}`);
    const foreign = await admin2.send('GET', `${NEEDS}?limit=2&cursor=${encodeURIComponent(cursor)}`);

    expect(tampered.status).toBe(400);
    expect(foreign.status).toBe(400);
  });

  it('valida limit, status y parámetros desconocidos', async () => {
    expect((await admin1.send('GET', `${NEEDS}?limit=0`)).status).toBeGreaterThanOrEqual(400);
    expect((await admin1.send('GET', `${NEEDS}?limit=101`)).status).toBeGreaterThanOrEqual(400);
    expect((await admin1.send('GET', `${NEEDS}?status=inventado`)).status).toBe(422);
    expect((await admin1.send('GET', `${NEEDS}?hospitalId=${HOSPITAL_IDS[1]}`)).status).toBe(400);
  });

  it('filtra por el estado proyectado: una activa con el plazo vencido aparece como vencida', async () => {
    sql('delete from app.needs');
    const live = insertNeed('activa');
    const expired = insertNeed('activa', { createdAt: "now() - interval '2 days'", expiresAt: "now() - interval '1 hour'" });
    const draftExpired = insertNeed('borrador', { createdAt: "now() - interval '2 days'", expiresAt: "now() - interval '1 hour'" });
    insertNeed('cerrada', { createdAt: "now() - interval '2 days'", expiresAt: "now() - interval '1 hour'" });

    const vencidas = await admin1.send('GET', `${NEEDS}?status=vencida`);
    const activas = await admin1.send('GET', `${NEEDS}?status=activa`);

    expect(vencidas.json.data.items.map((item: { needId: string }) => item.needId).sort()).toEqual([expired, draftExpired].sort());
    expect(activas.json.data.items.map((item: { needId: string }) => item.needId)).toEqual([live]);
    expect((await admin1.send('GET', `${NEEDS}/${expired}`)).json.data.status).toBe('vencida');
    expect((await admin1.send('GET', `${NEEDS}/${draftExpired}`)).json.data.status).toBe('vencida');
  });

  it('get devuelve exactamente los diez campos y coincide con el elemento del listado', async () => {
    sql('delete from app.needs');
    const created = (await admin1.send('POST', NEEDS, { body: BODY })).json.data;

    const one = await admin1.send('GET', `${NEEDS}/${created.needId}`);
    const list = await admin1.send('GET', NEEDS);

    expect(one.status).toBe(200);
    expect(one.json).toEqual({ data: created });
    expect(list.json.data.items[0]).toEqual(created);
  });

  it('IDOR: una necesidad de otro hospital es 404 idéntico a una inexistente', async () => {
    const mine = (await admin1.send('POST', NEEDS, { body: BODY })).json.data.needId as string;

    const foreign = await admin2.send('GET', `${NEEDS}/${mine}`);
    const missing = await admin2.send('GET', `${NEEDS}/${randomUUID()}`);

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect({ code: foreign.json.error.code, message: foreign.json.error.message })
      .toEqual({ code: missing.json.error.code, message: missing.json.error.message });
  });

  it('un needId que no es UUID es 400', async () => {
    expect((await admin1.send('GET', `${NEEDS}/no-es-uuid`)).status).toBe(400);
  });
});

describe('transitionOwnHospitalNeed', () => {
  const TARGETS = ['activa', 'cerrada', 'cancelada'] as const;

  // Tabla literal e independiente del dominio (C-8): el único conjunto de pares aceptados.
  const ALLOWED = new Set(['borrador>activa', 'borrador>cancelada', 'activa>cerrada', 'activa>cancelada', 'meta_alcanzada>cerrada', 'meta_alcanzada>cancelada']);

  it('toda la matriz estado × destino coincide con la tabla C-8 literal y con el dominio: 6 × 3 combinaciones', async () => {
    sql('delete from app.needs');
    const failures: string[] = [];
    for (const stored of NEED_STATUSES) {
      for (const target of TARGETS) {
        const id = insertNeed(stored);
        const response = await admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: target } });
        const expected = ALLOWED.has(`${stored}>${target}`);
        if ((response.status === 200) !== expected) failures.push(`${stored} → ${target}: esperado ${expected ? 200 : 409}, recibido ${response.status}`);
        if (!expected && response.status !== 409) failures.push(`${stored} → ${target}: un rechazo debe ser 409 y fue ${response.status}`);
        if (expected) expect(response.json.data.status).toBe(target);
        // El dominio debe coincidir con la tabla (deriva detectada aquí y no solo en sus pruebas).
        expect(canTransitionManually(stored, target)).toBe(expected);
        expect(evaluateManualTransition(stored, '2999-01-01T00:00:00Z', new Date(), target).ok).toBe(expected);
      }
    }

    expect(failures).toEqual([]);
  });

  it('con el plazo vencido toda transición es 409, sea cual sea el estado almacenado', async () => {
    sql('delete from app.needs');
    const failures: string[] = [];
    for (const stored of ['borrador', 'activa', 'meta_alcanzada'] as const) {
      for (const target of TARGETS) {
        const id = insertNeed(stored, { createdAt: "now() - interval '2 days'", expiresAt: "now() - interval '1 hour'" });
        const response = await admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: target } });
        if (response.status !== 409) failures.push(`${stored} vencido → ${target}: esperado 409, recibido ${response.status}`);
        expect(sql(`select status || '|' || version from app.needs where need_id = '${id}'`)).toBe(`${stored}|0`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('activar un borrador cuya sede se desactivó después es 409', async () => {
    const site = 'abcdefab-0000-4abc-8def-abcdefabcdef';
    sql(`insert into app.sites (site_id, hospital_id, public_name, public_address, latitude, longitude, is_active, is_approved)
      values ('${site}', '${HOSPITAL_IDS[0]}', 'Sede temporal', 'Cercado de Lima', -12.04, -77.04, true, true)`);
    try {
      const created = await admin1.send('POST', NEEDS, { body: { ...BODY, siteId: site } });
      expect(created.status).toBe(201);
      sql(`update app.sites set is_active = false where site_id = '${site}'`);

      const response = await admin1.send('PATCH', `${NEEDS}/${created.json.data.needId}`, { body: { status: 'activa' } });

      expect(response.status).toBe(409);
      expect(sql(`select status from app.needs where need_id = '${created.json.data.needId}'`)).toBe('borrador');
    } finally {
      sql(`delete from app.needs where site_id = '${site}'; delete from app.sites where site_id = '${site}'`);
    }
  });

  it('borrador → activa con el plazo vencido es 409 y no cambia la fila', async () => {
    const id = insertNeed('borrador', { createdAt: "now() - interval '2 days'", expiresAt: "now() - interval '1 hour'" });

    const response = await admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'activa' } });

    expect(response.status).toBe(409);
    expect(sql(`select status || '|' || version from app.needs where need_id = '${id}'`)).toBe('borrador|0');
  });

  it('una transición aceptada incrementa version, escribe auditoría y no recalcula el plazo', async () => {
    const id = insertNeed('borrador');
    const before = sql(`select expires_at from app.needs where need_id = '${id}'`);

    const response = await admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'activa' } });

    expect(response.status).toBe(200);
    expect(sql(`select version || '|' || status from app.needs where need_id = '${id}'`)).toBe('1|activa');
    expect(sql(`select expires_at from app.needs where need_id = '${id}'`)).toBe(before);
    expect(Number(sql(`select count(*) from app.audit_events where event = 'necesidad.transicion' and resource_id = '${id}'`))).toBe(1);
  });

  it('el replay devuelve el mismo 200 sin volver a transicionar; otro destino con la misma clave es 409', async () => {
    const id = insertNeed('borrador');
    const key = randomUUID();

    const first = await admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'activa' }, key });
    const replay = await admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'activa' }, key });
    const conflict = await admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'cancelada' }, key });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.json).toEqual(first.json);
    expect(conflict.status).toBe(409);
    expect(sql(`select version from app.needs where need_id = '${id}'`)).toBe('1');
  });

  it('dos transiciones concurrentes distintas sobre la misma necesidad: gana una y la otra es 409', async () => {
    const id = insertNeed('activa');

    const [a, b] = await Promise.all([
      admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'cerrada' } }),
      admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'cancelada' } }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(sql(`select version from app.needs where need_id = '${id}'`)).toBe('1');
  });

  it.each([['vencida'], ['meta_alcanzada'], ['borrador'], ['inventado']])('el destino %s no se puede pedir (4xx) y no cambia nada', async (status) => {
    const id = insertNeed('activa');

    const response = await admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status } });

    expect([400, 422]).toContain(response.status);
    expect(sql(`select status from app.needs where need_id = '${id}'`)).toBe('activa');
  });

  it('el body es cerrado: un campo extra es 400', async () => {
    const id = insertNeed('borrador');

    expect((await admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'activa', version: 5 } })).status).toBe(400);
    expect((await admin1.send('PATCH', `${NEEDS}/${id}`, { body: {} })).status).toBe(400);
  });

  it('exige Idempotency-Key y un needId UUID', async () => {
    const id = insertNeed('borrador');

    expect((await admin1.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'activa' }, key: null })).status).toBe(400);
    expect((await admin1.send('PATCH', `${NEEDS}/no-es-uuid`, { body: { status: 'activa' } })).status).toBe(400);
  });

  it('IDOR: otro hospital recibe 404 y la necesidad no cambia', async () => {
    const id = insertNeed('borrador');

    const response = await admin2.send('PATCH', `${NEEDS}/${id}`, { body: { status: 'cancelada' } });

    expect(response.status).toBe(404);
    expect(sql(`select status from app.needs where need_id = '${id}'`)).toBe('borrador');
  });

  it('una necesidad inexistente es 404', async () => {
    expect((await admin1.send('PATCH', `${NEEDS}/${randomUUID()}`, { body: { status: 'activa' } })).status).toBe(404);
  });
});

describe('membresía revocada', () => {
  it('tras revocar la membresía, la sesión vigente del admin pierde acceso a sus necesidades (403)', async () => {
    const revoked = new ApiClient(backend.baseUrl);
    await revoked.login(SEED_USERS.admin3.email);
    const created = await revoked.send('POST', NEEDS, { body: { ...BODY, siteId: SITE_IDS.hospital3Active } });
    expect(created.status).toBe(201);
    sql(`update app.hospital_memberships set status = 'revocada', revoked_at = now() where user_id = (select id from auth.users where email = '${SEED_USERS.admin3.email}')`);
    try {
      const list = await revoked.send('GET', NEEDS);
      const get = await revoked.send('GET', `${NEEDS}/${created.json.data.needId}`);
      const create = await revoked.send('POST', NEEDS, { body: { ...BODY, siteId: SITE_IDS.hospital3Active } });

      expect([list.status, get.status, create.status]).toEqual([403, 403, 403]);
    } finally {
      sql(`update app.hospital_memberships set status = 'activa', revoked_at = null where user_id = (select id from auth.users where email = '${SEED_USERS.admin3.email}')`);
    }
  });
});

describe('observabilidad y contrato', () => {
  it('ninguna línea de log contiene la clave de idempotencia, el identificador de la sede ni el cuerpo', async () => {
    const key = `canario-clave-necesidad-${randomUUID()}`;
    await admin1.send('POST', NEEDS, { body: { ...BODY, targetConfirmations: 21 }, key });

    const logs = backend.logLines.join('\n');
    expect(logs).not.toContain(key);
    expect(logs).not.toContain(SITE_IDS.hospital1Active);
    expect(logs).not.toContain('requiredBloodType');
  });

  it('todo estado HTTP devuelto por el backend está declarado para su operación en docs/openapi.json', () => {
    expect(observed.length).toBeGreaterThan(MIN_OBSERVED);
    expect(undeclaredStatuses()).toEqual([]);
  });
});
