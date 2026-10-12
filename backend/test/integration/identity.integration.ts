import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startBackend, type RunningBackend } from '../support/app.js';
import { ApiClient } from '../support/client.js';
import { undeclaredStatuses } from '../support/contract-statuses.js';
import { sql } from '../support/db.js';
import { DEMO_PASSWORD, HOSPITAL_IDS, SEED_USERS, SITE_IDS } from '../support/local-env.js';

let backend: RunningBackend;
let superadmin: ApiClient;
let admin1: ApiClient;
let admin2: ApiClient;
let donor: ApiClient;

beforeAll(async () => {
  backend = await startBackend();
  superadmin = new ApiClient(backend.baseUrl);
  admin1 = new ApiClient(backend.baseUrl);
  admin2 = new ApiClient(backend.baseUrl);
  donor = new ApiClient(backend.baseUrl);
  expect((await superadmin.login(SEED_USERS.superadmin.email)).status).toBe(200);
  expect((await admin1.login(SEED_USERS.admin1.email)).status).toBe(200);
  expect((await admin2.login(SEED_USERS.admin2.email)).status).toBe(200);
  expect((await donor.login(SEED_USERS.donor1.email)).status).toBe(200);
});

afterAll(async () => {
  await backend.close();
});

describe('sesión y MFA', () => {
  it('el login de un admin exige MFA y la sesión resultante es AAL2', async () => {
    const client = new ApiClient(backend.baseUrl);
    const first = await client.login(SEED_USERS.admin3.email, { mfa: false });

    expect(first.status).toBe(200);
    expect(first.json.data).toMatchObject({ aal: 1, mfaRequired: true, actor: { role: 'admin_hospitalario', hospitalName: 'Hospital Demo Tres' } });
    expect(first.json.data.mfaChallengeId).toBeTruthy();
    expect(first.headers.getSetCookie().join('\n')).toMatch(/__Host-sal_at=.*HttpOnly; Secure; SameSite=Lax/);

    const blocked = await client.send('GET', '/api/v1/hospitals/me/sites');
    expect(blocked.status).toBe(403);
    expect(blocked.json.error.code).toBe('MFA_REQUIRED');
  });

  it('GET /auth/session refleja AAL2 tras el MFA completo', async () => {
    const response = await superadmin.send('GET', '/api/v1/auth/session');

    expect(response.status).toBe(200);
    expect(response.json.data).toMatchObject({ aal: 2, mfaRequired: false, actor: { role: 'superadmin' } });
  });

  it('un donante inicia sesión sin MFA y no accede a rutas de superadmin ni de admin', async () => {
    expect((await donor.send('GET', '/api/v1/auth/session')).json.data).toMatchObject({ aal: 1, mfaRequired: false });
    expect((await donor.send('GET', '/api/v1/superadmin/hospitals')).status).toBe(403);
    expect((await donor.send('GET', '/api/v1/hospitals/me/sites')).status).toBe(403);
  });

  it('credenciales inválidas y usuarios inexistentes reciben el mismo 401 genérico', async () => {
    const client = new ApiClient(backend.baseUrl);
    const wrongPassword = await client.send('POST', '/api/v1/auth/sessions', { body: { email: SEED_USERS.donor2.email, password: 'contrasena-equivocada-1' } });
    const noUser = await client.send('POST', '/api/v1/auth/sessions', { body: { email: 'nadie@example.test', password: 'contrasena-equivocada-1' } });

    expect(wrongPassword.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPassword.json.error.message).toBe(noUser.json.error.message);
    expect(wrongPassword.json.error.code).toBe(noUser.json.error.code);
  });

  it('bloquea con 429 y Retry-After el undécimo intento de login', async () => {
    const client = new ApiClient(backend.baseUrl);
    const email = 'limite@example.test';
    let last;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      last = await client.send('POST', '/api/v1/auth/sessions', { body: { email, password: 'contrasena-equivocada-1' } });
    }

    expect(last?.status).toBe(429);
    expect(last?.json.error.code).toBe('RATE_LIMITED');
    expect(Number(last?.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
  });

  it('un admin con factor verificado recibe 409 al intentar enrolar otro', async () => {
    const response = await admin1.send('POST', '/api/v1/auth/mfa-enrollments');

    expect(response.status).toBe(409);
  });

  it('un donante no puede enrolar MFA', async () => {
    expect((await donor.send('POST', '/api/v1/auth/mfa-enrollments')).status).toBe(403);
  });

  it('cerrar sesión revoca la sesión y expira las cookies', async () => {
    const client = new ApiClient(backend.baseUrl);
    await client.login(SEED_USERS.donor2.email);

    const out = await client.send('DELETE', '/api/v1/auth/sessions/current');

    expect(out.status).toBe(204);
    expect(client.cookies.size).toBe(0);
    expect((await client.send('GET', '/api/v1/auth/session')).status).toBe(401);
  });
});

describe('CSRF y Origin', () => {
  it('rechaza con 403 una mutación con cookie sin Origin, con Origin ajeno o con CSRF de otra sesión', async () => {
    const body = { publicName: 'Hospital CSRF', legalName: 'Hospital CSRF S.A.' };
    const noOrigin = await superadmin.send('POST', '/api/v1/superadmin/hospitals', { body, origin: null });
    const foreignOrigin = await superadmin.send('POST', '/api/v1/superadmin/hospitals', { body, origin: 'https://evil.example.test' });
    const otherSession = new ApiClient(backend.baseUrl);
    await otherSession.login(SEED_USERS.donor2.email);
    const foreignCsrf = await superadmin.send('POST', '/api/v1/superadmin/hospitals', {
      body, headers: { 'x-csrf-token': (await otherSession.fetchCsrf()) },
    });

    for (const response of [noOrigin, foreignOrigin]) {
      expect(response.status).toBe(403);
      expect(response.json.error.code).toBe('ACCESS_DENIED');
    }
    expect(foreignCsrf.status).toBe(403);
    expect(sql(`select count(*) from app.hospitals where public_name = 'Hospital CSRF'`)).toBe('0');
  });
});

describe('hospitales (superadmin)', () => {
  it('crea un hospital, repite con la misma clave y detecta el payload distinto', async () => {
    const key = `clave-integracion-${Date.now()}`;
    const body = { publicName: 'Hospital Integración', legalName: 'Hospital Integración S.A.' };

    const created = await superadmin.send('POST', '/api/v1/superadmin/hospitals', { body, key });
    const replay = await superadmin.send('POST', '/api/v1/superadmin/hospitals', { body, key });
    const conflict = await superadmin.send('POST', '/api/v1/superadmin/hospitals', { body: { ...body, legalName: 'Otra S.A.' }, key });

    expect(created.status).toBe(201);
    expect(created.json.data).toMatchObject({ publicName: 'Hospital Integración', isAuthorized: false });
    expect(replay.status).toBe(201);
    expect(replay.json).toEqual(created.json);
    expect(conflict.status).toBe(409);
    expect(conflict.json.error.code).toBe('STATE_CONFLICT');
    expect(sql(`select count(*) from app.hospitals where public_name = 'Hospital Integración'`)).toBe('1');
  });

  it('20 solicitudes concurrentes con la misma clave producen una sola fila y respuestas iguales', async () => {
    const key = `clave-concurrente-${Date.now()}`;
    const body = { publicName: 'Hospital Concurrente', legalName: 'Hospital Concurrente S.A.' };

    const responses = await Promise.all(Array.from({ length: 20 }, () => superadmin.send('POST', '/api/v1/superadmin/hospitals', { body, key })));

    expect(new Set(responses.map(({ status }) => status))).toEqual(new Set([201]));
    expect(new Set(responses.map(({ text }) => text)).size).toBe(1);
    expect(sql(`select count(*) from app.hospitals where public_name = 'Hospital Concurrente'`)).toBe('1');
  });

  it('el contrato rechaza un cuerpo con campos ajenos o valores vacíos y una clave de idempotencia corta (400)', async () => {
    const extra = await superadmin.send('POST', '/api/v1/superadmin/hospitals', { body: { publicName: 'X', legalName: 'Y', hospitalId: 'x' } });
    const rule = await superadmin.send('POST', '/api/v1/superadmin/hospitals', { body: { publicName: '', legalName: 'Y' } });

    expect(extra.status).toBe(400);
    expect(rule.status).toBe(400);
    expect((await superadmin.send('POST', '/api/v1/superadmin/hospitals', { body: { publicName: 'X', legalName: 'Y' }, key: 'corta' })).status).toBe(400);
  });

  it('verifica el step-up y permite actualizar un hospital', async () => {
    const list = await superadmin.send('GET', '/api/v1/superadmin/hospitals?limit=1');
    expect(list.status).toBe(200);
    expect(list.json.data.pagination.nextCursor).toEqual(expect.any(String));

    // El MFA del login deja un TOTP reciente en amr: el step-up ya vale 5 min (la denegación sin él se prueba en pgTAP y guards).
    const verified = await superadmin.stepUp(SEED_USERS.superadmin.email);
    expect(verified.status).toBe(200);
    expect(Date.parse(verified.json.data.verifiedUntil)).toBeGreaterThan(Date.now());
    const updated = await superadmin.send('PATCH', `/api/v1/superadmin/hospitals/${HOSPITAL_IDS[2]}`, { body: { legalName: 'Hospital Demo Tres S.A. (sintético)' } });
    expect(updated.status).toBe(200);
  });

  it('pagina con un cursor firmado y rechaza uno manipulado con 400', async () => {
    const first = await superadmin.send('GET', '/api/v1/superadmin/hospitals?limit=2');
    const cursor = first.json.data.pagination.nextCursor as string;
    const second = await superadmin.send('GET', `/api/v1/superadmin/hospitals?limit=2&cursor=${encodeURIComponent(cursor)}`);
    const forged = await superadmin.send('GET', `/api/v1/superadmin/hospitals?limit=2&cursor=${encodeURIComponent(`${cursor}x`)}`);

    expect(second.status).toBe(200);
    expect(second.json.data.items[0].hospitalId).not.toBe(first.json.data.items[0].hospitalId);
    expect(forged.status).toBe(400);
  });

  it('rechaza parámetros de query desconocidos con 400', async () => {
    expect((await superadmin.send('GET', '/api/v1/superadmin/hospitals?orden=asc')).status).toBe(400);
  });
});

describe('aislamiento entre hospitales', () => {
  it('cada admin solo ve las sedes activas y aprobadas de su propio hospital', async () => {
    const one = await admin1.send('GET', '/api/v1/hospitals/me/sites');
    const two = await admin2.send('GET', '/api/v1/hospitals/me/sites');

    expect(one.json.data.items.map((site: { siteId: string }) => site.siteId)).toEqual([SITE_IDS.hospital1Active]);
    expect(two.json.data.items.map((site: { siteId: string }) => site.siteId)).toEqual([SITE_IDS.hospital2Active]);
  });

  it('un admin no accede a rutas de superadmin', async () => {
    for (const path of ['/api/v1/superadmin/hospitals', '/api/v1/superadmin/memberships', '/api/v1/superadmin/audit-events', '/api/v1/superadmin/configuration']) {
      expect((await admin1.send('GET', path)).status).toBe(403);
    }
  });

  it('las peticiones sin sesión reciben 401', async () => {
    const anonymous = new ApiClient(backend.baseUrl);
    expect((await anonymous.send('GET', '/api/v1/superadmin/hospitals')).status).toBe(401);
    expect((await anonymous.send('GET', '/api/v1/hospitals/me/sites')).status).toBe(401);
    expect((await anonymous.send('GET', '/api/v1/auth/session')).status).toBe(401);
  });
});

describe('membresías y configuración', () => {
  it('revocar la membresía deja sin acceso a la misma sesión en la petición siguiente', async () => {
    const victim = new ApiClient(backend.baseUrl);
    await victim.login(SEED_USERS.admin3.email);
    expect((await victim.send('GET', '/api/v1/hospitals/me/sites')).status).toBe(200);

    const memberships = await superadmin.send('GET', '/api/v1/superadmin/memberships?limit=100');
    const target = memberships.json.data.items.find((item: { hospitalId: string }) => item.hospitalId === HOSPITAL_IDS[2]);
    const request = { body: { status: 'revocada', reason: 'Baja de prueba de integración' }, key: `clave-revoke-${Date.now()}-0001` };
    const revoked = await superadmin.send('PATCH', `/api/v1/superadmin/memberships/${target.membershipId}`, request);
    // Reintento con la misma clave (p. ej. se perdió la respuesta): mismo resultado, no un 409.
    const replay = await superadmin.send('PATCH', `/api/v1/superadmin/memberships/${target.membershipId}`, request);
    const another = await superadmin.send('PATCH', `/api/v1/superadmin/memberships/${target.membershipId}`, { body: request.body });

    expect(revoked.status).toBe(200);
    expect(revoked.json.data.status).toBe('revocada');
    expect(replay.status).toBe(200);
    expect(replay.json).toEqual(revoked.json);
    expect(another.status).toBe(409);
    expect((await victim.send('GET', '/api/v1/hospitals/me/sites')).status).toBe(403);
    expect(target.emailHint).toMatch(/^a\*\*\*@example\.test$/);
  });

  it('fija final_demo_at una sola vez', async () => {
    const stepped = await superadmin.stepUp(SEED_USERS.superadmin.email);
    expect(stepped.status).toBe(200);
    const finalDemoAt = new Date(Date.now() + 90 * 86_400_000).toISOString();

    const key = `clave-final-demo-${Date.now()}-0001`;
    const first = await superadmin.send('PATCH', '/api/v1/superadmin/configuration', { body: { finalDemoAt }, key });
    const replay = await superadmin.send('PATCH', '/api/v1/superadmin/configuration', { body: { finalDemoAt }, key });
    const second = await superadmin.send('PATCH', '/api/v1/superadmin/configuration', {
      body: { finalDemoAt: new Date(Date.now() + 91 * 86_400_000).toISOString() },
    });
    const read = await superadmin.send('GET', '/api/v1/superadmin/configuration');

    expect(first.status).toBe(200);
    expect(first.json.data.isImmutable).toBe(true);
    expect(replay.status).toBe(200);
    expect(replay.json).toEqual(first.json);
    expect(second.status).toBe(409);
    expect(read.json.data.finalDemoAt).toBeTruthy();
  });

  it('la auditoría solo muestra códigos opacos, sin UUID de actor ni correos', async () => {
    const audit = await superadmin.send('GET', '/api/v1/superadmin/audit-events?limit=100');

    expect(audit.status).toBe(200);
    expect(audit.json.data.items.length).toBeGreaterThan(0);
    expect(audit.text).not.toMatch(/@example\.test/);
    for (const item of audit.json.data.items) expect(item.actorCode).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('sedes', () => {
  it('crea una sede con coordenadas, la deja sin aprobar y aparece como tarea de revisión', async () => {
    const created = await superadmin.send('POST', `/api/v1/superadmin/hospitals/${HOSPITAL_IDS[0]}/sites`, {
      body: { publicName: 'Sede Integración', publicAddress: 'Lima', coordinates: { latitude: -12.046374, longitude: -77.042793 }, publicInstructions: 'Presentarse en recepción.' },
    });
    expect(created.status).toBe(201);
    expect(created.json.data).toMatchObject({ isApproved: false, isActive: true, coordinates: { latitude: -12.046374, longitude: -77.042793 } });

    const tasks = await superadmin.send('GET', '/api/v1/superadmin/task-queue');
    expect(tasks.json.data.items.some((task: { kind: string }) => task.kind === 'hospital_review')).toBe(true);

    const approved = await superadmin.send('PATCH', `/api/v1/superadmin/sites/${created.json.data.siteId}`, { body: { isApproved: true } });
    expect(approved.status).toBe(200);
    expect(approved.json.data.isApproved).toBe(true);
  });

  it('rechaza coordenadas fuera de rango y sedes de hospitales inexistentes', async () => {
    const out = await superadmin.send('POST', `/api/v1/superadmin/hospitals/${HOSPITAL_IDS[0]}/sites`, {
      body: { publicName: 'X', publicAddress: 'Y', coordinates: { latitude: 120, longitude: 0 } },
    });
    const missing = await superadmin.send('POST', '/api/v1/superadmin/hospitals/99999999-9999-4999-8999-999999999999/sites', {
      body: { publicName: 'X', publicAddress: 'Y', coordinates: { latitude: -12, longitude: -77 } },
    });

    expect(out.status).toBe(422);
    expect(missing.status).toBe(404);
  });
});

describe('observabilidad', () => {
  it('los logs no contienen contraseñas, correos, cookies ni claves de idempotencia', async () => {
    const canaryKey = `canario-idempotencia-${Date.now()}`;
    await superadmin.send('POST', '/api/v1/superadmin/hospitals', { body: { publicName: 'Hospital Log', legalName: 'Hospital Log S.A.' }, key: canaryKey });
    await new ApiClient(backend.baseUrl).send('POST', '/api/v1/auth/sessions', { body: { email: 'canario@example.test', password: 'canario-contrasena-123' } });

    const logs = backend.logLines.join('\n');
    for (const canary of [canaryKey, 'canario@example.test', 'canario-contrasena-123', DEMO_PASSWORD, '__Host-sal', 'sb_publishable', 'sb_secret']) {
      expect(logs).not.toContain(canary);
    }
  });
});

describe('rollback', () => {
  it('si falla la auditoría la RPC deja 0 filas y ninguna clave de idempotencia en curso', async () => {
    sql(`create or replace function app.test_fail_audit() returns trigger language plpgsql as $$ begin
           if new.event = 'hospital.creado' then raise exception 'fallo forzado'; end if; return new; end $$;
         create trigger test_fail_audit before insert on app.audit_events for each row execute function app.test_fail_audit();`);
    try {
      const key = `clave-rollback-${Date.now()}`;
      const response = await superadmin.send('POST', '/api/v1/superadmin/hospitals', { body: { publicName: 'Hospital Rollback', legalName: 'Hospital Rollback S.A.' }, key });

      expect(response.status).toBe(500);
      expect(response.json.error.code).toBe('INTERNAL_ERROR');
      expect(response.text).not.toContain('fallo forzado');
      expect(sql(`select count(*) from app.hospitals where public_name = 'Hospital Rollback'`)).toBe('0');
      expect(sql(`select count(*) from app.idempotency_records where idem_key = '${key}'`)).toBe('0');
    } finally {
      sql('drop trigger test_fail_audit on app.audit_events; drop function app.test_fail_audit();');
    }
  });
});


describe('contrato', () => {
  it('todo estado HTTP devuelto por el backend está declarado para su operación en docs/openapi.json', () => {
    expect(undeclaredStatuses()).toEqual([]);
  });
});
