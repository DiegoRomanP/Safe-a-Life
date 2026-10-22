import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '../support/db.js';
import { HOSPITAL_IDS, SEED_USERS, SITE_IDS } from '../support/local-env.js';
import { isBlockedBy, PsqlSession, until } from '../support/psql-session.js';

// F6-3a: carreras del lote (cuota global 3/24 h) y de la respuesta por token. Fixtures sintéticos con limpieza en `finally`.
const sha = (t: string): string => createHash('sha256').update(t).digest('hex');
const adminId = (email: string): string => sql(`select id from auth.users where email = '${email}'`);
const sessionAs = async (s: PsqlSession, uid: string, aal: 'aal1' | 'aal2'): Promise<void> => {
  await s.run(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated","aal":"${aal}","amr":[{"method":"password","timestamp":1}]}', false);`);
};
const needHash = (needId: string): string => sql(`select app.fingerprint(jsonb_build_array(jsonb_build_array('needId', '${needId}')))`);
const tokenHash = (hash: string): string => sql(`select app.fingerprint(jsonb_build_array(jsonb_build_array('tokenHash', '${hash}')))`);
const slots = (n: number): string => JSON.stringify(Array.from({ length: n }, () => ({
  outboxId: randomUUID(), invitationId: randomUUID(), confirmHash: sha(randomUUID()), rejectHash: sha(randomUUID()), sealedPayload: 'sellado-sintetico',
})));
/** Paso 1 (sesión del admin): devuelve el secreto de la concesión. */
const authorize = async (s: PsqlSession, needId: string): Promise<string> => {
  const reply = JSON.parse((await s.run(`select api.authorize_invitation_batch('${needId}');`)).out) as { kind: string; grantSecret: string };
  expect(reply.kind).toBe('ok');
  return reply.grantSecret;
};
const requestBatch = (needId: string, grant: string, n: number, key = `itest-lote-${randomUUID()}`): string =>
  `select api.request_invitation_batch('${key}', '${needHash(needId)}', '${needId}', '${grant}', '${slots(n)}'::jsonb);`;
const kindOf = (r: { out: string }): string => (JSON.parse(r.out) as { kind: string }).kind;

const created = { users: [] as string[], needs: [] as string[], tokens: [] as string[], muted: [] as string[] };

function createDonor(): string {
  const id = randomUUID();
  sql(`insert into auth.users (id, instance_id, aud, role, email) values ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'itest-${id.slice(0, 8)}@example.test')`);
  sql(`insert into app.user_accounts (user_id, role, display_name) values ('${id}', 'donante', null)`);
  sql(`insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
    select '${id}', 'Donante Sintético', 'O_POS', true, round(latitude, 3), round(longitude, 3), 'DEMO_ONLY-1', 'activo', now() from app.sites where site_id = '${SITE_IDS.hospital1Active}'`);
  created.users.push(id);
  return id;
}

function createNeed(hospital: string, site: string, createdBy: string, target: number, radius = 50): string {
  const id = randomUUID();
  sql(`insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, expires_at)
    values ('${id}', '${hospital}', '${site}', '${createdBy}', 'RBC', 'O_POS', ${target}, ${radius}, 'Normal', 'activa', now() + interval '2 days')`);
  created.needs.push(id);
  return id;
}

/** Invitación directa con sus tokens en claro (solo para fixtures): devuelve los hashes y los ids. */
function seedInvitation(needId: string, donorId: string, at = 'now()'): { confirm: string; reject: string; invitationId: string; outbox: string } {
  const batch = sql(`select batch_id from app.invitation_batches where need_id = '${needId}' limit 1`)
    || sql(`insert into app.invitation_batches (need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
       select need_id, hospital_id, created_by, 0, 0 from app.needs where need_id = '${needId}' returning batch_id`).split('\n')[0]!;
  const [invitationId, outbox, confirm, reject] = [randomUUID(), randomUUID(), sha(randomUUID()), sha(randomUUID())];
  sql(`insert into app.email_outbox (outbox_id, kind, recipient_user_id, idempotency_key, sealed_payload, not_after)
    values ('${outbox}', 'invitacion', '${donorId}', 'outbox-itest-${outbox}', 'sellado', now() + interval '1 day')`);
  sql(`insert into app.invitations (invitation_id, need_id, batch_id, hospital_id, donor_id, need_donor_code, confirm_token_hash, reject_token_hash, current_outbox_id, created_at)
    select '${invitationId}', need_id, '${batch}', hospital_id, '${donorId}', app.new_need_donor_code(need_id), '${confirm}', '${reject}', '${outbox}', ${at} from app.needs where need_id = '${needId}'`);
  created.tokens.push(confirm, reject);
  return { confirm, reject, invitationId, outbox };
}

/** Aísla los candidatos: deja no disponibles los perfiles ajenos (de otros archivos) y los restaura al final. */
function isolateCandidates(own: string[]): void {
  const ids = sql(`update app.donor_profiles set is_available = false where is_available and donor_id not in (${own.map((d) => `'${d}'`).join(',')}) returning donor_id`);
  created.muted.push(...ids.split('\n').filter(Boolean));
}
function restoreCandidates(): void {
  if (created.muted.length === 0) return;
  sql(`update app.donor_profiles set is_available = true where donor_id in (${created.muted.map((d) => `'${d}'`).join(',')})`);
  created.muted.length = 0;
}

function cleanup(): void {
  const needs = created.needs.map((n) => `'${n}'`).join(',') || "'00000000-0000-0000-0000-000000000000'";
  const users = created.users.map((n) => `'${n}'`).join(',') || "'00000000-0000-0000-0000-000000000000'";
  const tokenRefs = created.tokens.map((t) => `'token:${t}'`).join(',') || "'token:none'";
  sql(`delete from app.idempotency_records where actor_ref in (${tokenRefs}) or idem_key like 'itest-%'`);
  restoreCandidates();
  // El historial solo se borra cuando el perfil del donante ya no existe (V15): primero los perfiles.
  sql(`delete from app.donor_profiles where donor_id in (${users})`);
  sql(`delete from app.invitation_response_history where invitation_id in (select invitation_id from app.invitations where need_id in (${needs}))`);
  sql(`with d as (delete from app.invitations where need_id in (${needs}) returning current_outbox_id)
    delete from app.email_outbox where outbox_id in (select current_outbox_id from d)`);
  sql(`delete from app.invitation_batch_grants where need_id in (${needs})`);
  sql(`delete from app.invitation_batches where need_id in (${needs})`);
  sql(`delete from app.needs where need_id in (${needs})`);
  sql(`delete from app.user_accounts where user_id in (${users})`);
  sql(`delete from auth.users where id in (${users})`);
  created.users.length = 0;
  created.needs.length = 0;
}

const sessions: PsqlSession[] = [];
const newSession = (): PsqlSession => { const s = new PsqlSession(); sessions.push(s); return s; };
beforeAll(() => { cleanup(); });
afterAll(() => { for (const s of sessions) s.close(); cleanup(); });

describe('cuota global entre hospitales', () => {
  it('dos lotes concurrentes de hospitales distintos no superan 3 invitaciones por donante en 24 h y no se interbloquean', async () => {
    const admin1 = adminId(SEED_USERS.admin1.email);
    const admin2 = adminId(SEED_USERS.admin2.email);
    const hospital3Admin = adminId(SEED_USERS.admin3.email);
    const donors = Array.from({ length: 6 }, () => createDonor());
    // Cada donante ya tiene 2 invitaciones en 24 h (de un tercer hospital): le queda un solo cupo.
    const filler = [createNeed(HOSPITAL_IDS[2], SITE_IDS.hospital3Active, hospital3Admin, 1), createNeed(HOSPITAL_IDS[2], SITE_IDS.hospital3Active, hospital3Admin, 1)];
    for (const need of filler) for (const d of donors) seedInvitation(need, d);
    const needA = createNeed(HOSPITAL_IDS[0], SITE_IDS.hospital1Active, admin1, 3);
    const needB = createNeed(HOSPITAL_IDS[1], SITE_IDS.hospital2Active, admin2, 3);
    isolateCandidates(donors);
    const [a, b, observer, adminA, adminB] = [newSession(), newSession(), newSession(), newSession(), newSession()];
    await sessionAs(adminA, admin1, 'aal2');
    await sessionAs(adminB, admin2, 'aal2');
    const [grantA, grantB] = [await authorize(adminA, needA), await authorize(adminB, needB)];
    const technical = adminId(SEED_USERS.apiTechnical.email);
    await sessionAs(a, technical, 'aal1');
    await sessionAs(b, technical, 'aal1');
    const [pidA, pidB] = [await a.pid(), await b.pid()];

    // A conserva el lock de cuota (transacción abierta); B debe esperar a ese lock, no a una fila de donante.
    expect(kindOf(await a.run(`begin; ${requestBatch(needA, grantA, 6)}`))).toBe('created');
    const second = b.run(requestBatch(needB, grantB, 6));
    await until(isBlockedBy(observer, pidB, pidA), 'el lote B espera el lock de cuota del lote A');
    await a.run('commit;');
    const result = JSON.parse((await second).out) as { kind: string; createdInvitationCount: number };

    expect(result.kind).toBe('created');
    // A (primero) tomó los 6 cupos; B no encontró a nadie con cupo.
    const own = donors.map((d) => `'${d}'`).join(',');
    expect(result.createdInvitationCount).toBe(0);
    expect(sql(`select count(*) from app.invitations where need_id = '${needA}' and donor_id in (${own})`)).toBe('6');
    expect(sql(`select count(*) from app.invitations where need_id = '${needB}' and donor_id in (${own})`)).toBe('0');
    expect(sql(`select max(c) from (select count(*) c from app.invitations where donor_id in (${donors.map((d) => `'${d}'`).join(',')}) and created_at > now() - interval '24 hours' group by donor_id) t`)).toBe('3');
    cleanup();
  });
});

describe('lote en dos pasos', () => {
  it('un admin no ejecuta el lote ni con slots; dos ejecuciones concurrentes con la misma concesión consumen una sola vez', async () => {
    const admin1 = adminId(SEED_USERS.admin1.email);
    const donors = Array.from({ length: 5 }, () => createDonor());
    isolateCandidates(donors);
    const need = createNeed(HOSPITAL_IDS[0], SITE_IDS.hospital1Active, admin1, 1);
    const [admin, s1, s2, s3] = [newSession(), newSession(), newSession(), newSession()];
    await sessionAs(admin, admin1, 'aal2');
    const grant = await authorize(admin, need);
    expect(kindOf(await admin.run(requestBatch(need, grant, 5)))).toBe('forbidden');
    const technical = adminId(SEED_USERS.apiTechnical.email);
    for (const s of [s1, s2, s3]) await sessionAs(s, technical, 'aal1');
    const replies = await Promise.all([s1, s2].map((s) => s.run(requestBatch(need, grant, 5))));
    expect(replies.map(kindOf).sort()).toEqual(['created', 'not_found']);
    expect(sql(`select count(*) from app.invitation_batches where need_id = '${need}'`)).toBe('1');
    expect(sql(`select count(*) from app.invitations where need_id = '${need}'`)).toBe('5');
    // La misma clave sobre la concesión ya consumida repite lo guardado sin crear otro lote.
    const key = `itest-lote-${randomUUID()}`;
    const grant2 = await authorize(admin, need);
    const first = JSON.parse((await s3.run(requestBatch(need, grant2, 5, key))).out) as { kind: string; batchId: string };
    expect(first.kind).toBe('created');
    const replay = JSON.parse((await s3.run(requestBatch(need, grant2, 5, key))).out) as { kind: string; response: { batchId: string } };
    expect(replay.kind).toBe('replayed');
    expect(replay.response.batchId).toBe(first.batchId);
    cleanup();
  });
});

describe('respuesta por token', () => {
  it('la cascada de meta espera los locks antes del claim: un lock ajeno sobre el outbox de más de 2 s no da 55P03', async () => {
    const admin1 = adminId(SEED_USERS.admin1.email);
    const [d1, d2, d3] = [createDonor(), createDonor(), createDonor()];
    const need = createNeed(HOSPITAL_IDS[0], SITE_IDS.hospital1Active, admin1, 2);
    const [i1, i2, i3] = [seedInvitation(need, d1), seedInvitation(need, d2), seedInvitation(need, d3)];
    const technical = adminId(SEED_USERS.apiTechnical.email);
    const [first, second, holder, observer] = [newSession(), newSession(), newSession(), newSession()];
    for (const s of [first, second]) await sessionAs(s, technical, 'aal1');
    const respond = (s: PsqlSession, token: string): Promise<{ out: string; err: string }> => s.run(
      `select api.respond_invitation_by_token('${token}', 'itest-token-${randomUUID()}', '${tokenHash(token)}');`);
    expect(kindOf(await respond(first, i1.confirm))).toBe('ok');
    const [secondPid, holderPid] = [await second.pid(), await holder.pid()];
    await holder.run(`begin; select 1 from app.email_outbox where outbox_id = '${i3.outbox}' for update;`);
    const pending = respond(second, i2.confirm);
    await until(isBlockedBy(observer, secondPid, holderPid), 'la cascada espera el lock del outbox');
    // Más que el lock_timeout de 2 s del claim: si el lock se pidiera después del claim, esta espera acabaría en 55P03.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await holder.run('commit;');
    const result = await pending;
    expect(result.err).toBe('');
    expect(JSON.parse(result.out)).toMatchObject({ kind: 'ok', needStatus: 'meta_alcanzada' });
    expect(sql(`select status from app.email_outbox where outbox_id = '${i3.outbox}'`)).toBe('cancelado');
    cleanup();
  });

  it('20 POST concurrentes del mismo token con claves distintas producen un solo efecto: 1 x ok y 19 x gone', async () => {
    const admin1 = adminId(SEED_USERS.admin1.email);
    const donor = createDonor();
    const need = createNeed(HOSPITAL_IDS[0], SITE_IDS.hospital1Active, admin1, 5);
    const inv = seedInvitation(need, donor);
    const technical = adminId(SEED_USERS.apiTechnical.email);
    const pool = Array.from({ length: 20 }, () => newSession());
    for (const s of pool) await sessionAs(s, technical, 'aal1');
    const replies = await Promise.all(pool.map((s) => s.run(
      `select api.respond_invitation_by_token('${inv.confirm}', 'itest-token-${randomUUID()}', '${tokenHash(inv.confirm)}');`)));
    const kinds = replies.map(kindOf);
    expect(kinds.filter((k) => k === 'ok')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'gone')).toHaveLength(19);
    expect(sql(`select count(*) from app.invitation_response_history where invitation_id = '${inv.invitationId}'`)).toBe('1');
    cleanup();
  });

  it('la última plaza en carrera da un solo meta_alcanzada y confirmar después de la meta es 409', async () => {
    const admin1 = adminId(SEED_USERS.admin1.email);
    const [d1, d2, d3] = [createDonor(), createDonor(), createDonor()];
    const need = createNeed(HOSPITAL_IDS[0], SITE_IDS.hospital1Active, admin1, 1);
    const [i1, i2, i3] = [seedInvitation(need, d1), seedInvitation(need, d2), seedInvitation(need, d3)];
    const technical = adminId(SEED_USERS.apiTechnical.email);
    const [s1, s2, s3] = [newSession(), newSession(), newSession()];
    for (const s of [s1, s2, s3]) await sessionAs(s, technical, 'aal1');
    const respond = (s: PsqlSession, token: string): Promise<{ out: string }> => s.run(
      `select api.respond_invitation_by_token('${token}', 'itest-token-${randomUUID()}', '${tokenHash(token)}');`);
    const [r1, r2] = await Promise.all([respond(s1, i1.confirm), respond(s2, i2.confirm)]);
    const outcomes = [r1, r2].map((r) => kindOf(r)).sort();
    expect(outcomes).toEqual(['conflict', 'ok']);
    const winner = JSON.parse([r1, r2].find((r) => kindOf(r) === 'ok')!.out) as { needStatus: string };
    expect(winner.needStatus).toBe('meta_alcanzada');
    expect(sql(`select status || version from app.needs where need_id = '${need}'`)).toBe('meta_alcanzada1');
    expect(sql(`select count(*) from app.invitations where need_id = '${need}' and response = 'confirmada'`)).toBe('1');
    expect(kindOf(await respond(s3, i3.confirm))).toBe('conflict');
    cleanup();
  });
});
