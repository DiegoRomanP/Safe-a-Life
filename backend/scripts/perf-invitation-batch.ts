// PER-02 (F6-6): rendimiento del lote de invitaciones con 500 donantes sintéticos, 3 hospitales y 5 lotes concurrentes.
// Solo contra la base LOCAL (usa psql de la sesión local). Mide `api.request_invitation_batch` (el paso 2 con la selección de
// candidatos, la cuota y los inserts); el paso 1 (concesión) se ejecuta con la sesión del admin y no entra en la medida.
// Excluye 10 lotes de calentamiento y exige al menos 100 muestras. Limpia todo lo que crea (marca `perf-` en los correos).
// Uso: `npx tsx backend/scripts/perf-invitation-batch.ts` con Supabase local levantado y sembrado (`seed-auth-local.ts`).
import { createHash, randomUUID } from 'node:crypto';
import { sql } from '../test/support/db.js';
import { HOSPITAL_IDS, SEED_USERS, SITE_IDS } from '../test/support/local-env.js';
import { PsqlSession } from '../test/support/psql-session.js';

const DONORS = 500;
const CONCURRENCY = 5;
const WARMUP = 10;
const SAMPLES = 100;
const sha = (t: string): string => createHash('sha256').update(t).digest('hex');
const idOf = (email: string): string => sql(`select id from auth.users where email = '${email}'`);

function cleanup(): void {
  sql(`delete from app.hospital_memberships where membership_id = '30000000-0000-4000-8000-0000000000f3'`);
  const perfNeeds = "select need_id from app.needs where urgency = 'Normal' and created_by in (select id from auth.users where email in ('admin1@example.test','admin2@example.test','admin3@example.test')) and target_confirmations = 1 and radius_km = 50";
  sql(`update app.donor_profiles set is_available = true where donor_id in (select id from auth.users where email like 'perf-muted-%')`);
  sql(`delete from app.donor_profiles where donor_id in (select id from auth.users where email like 'perf-donor-%')`);
  sql(`delete from app.invitation_response_history where invitation_id in (select invitation_id from app.invitations where need_id in (${perfNeeds}))`);
  sql(`with d as (delete from app.invitations where need_id in (${perfNeeds}) returning current_outbox_id) delete from app.email_outbox where outbox_id in (select current_outbox_id from d)`);
  sql(`delete from app.invitation_batch_grants where need_id in (${perfNeeds})`);
  sql(`delete from app.invitation_batches where need_id in (${perfNeeds})`);
  sql(`delete from app.idempotency_records where idem_key like 'perf-%'`);
  sql(`delete from app.needs where need_id in (${perfNeeds})`);
  sql(`delete from app.user_accounts where user_id in (select id from auth.users where email like 'perf-donor-%')`);
  sql(`delete from auth.users where email like 'perf-donor-%'`);
}

const PERF_MEMBERSHIP = '30000000-0000-4000-8000-0000000000f3';
/** El hospital 3 de la semilla no trae membresía para su admin: se añade solo durante la medición. */
function ensureMemberships(): void {
  sql(`insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint)
    select '${PERF_MEMBERSHIP}', u.id, '${HOSPITAL_IDS[2]}', 'activa', 'a***@example.test' from auth.users u
    where u.email = '${SEED_USERS.admin3.email}' and not exists (select 1 from app.hospital_memberships m where m.user_id = u.id and m.status = 'activa')`);
}

function seedDonors(): void {
  ensureMemberships();
  const bloods = "(array['O_NEG','O_POS','A_NEG','A_POS','B_NEG','B_POS','AB_NEG','AB_POS'])";
  sql(`insert into auth.users (id, instance_id, aud, role, email)
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'perf-donor-' || n || '@example.test' from generate_series(1, ${DONORS}) n`);
  sql(`insert into app.user_accounts (user_id, role, display_name) select id, 'donante', null from auth.users where email like 'perf-donor-%'`);
  sql(`insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
    select u.id, 'Donante Perf ' || n, ${bloods}[1 + (n % 8)], true, round((-12.06 + (random() - 0.5) * 0.06)::numeric, 3), round((-77.05 + (random() - 0.5) * 0.05)::numeric, 3), 'DEMO_ONLY-1', 'activo', now()
    from (select id, row_number() over (order by email) n from auth.users where email like 'perf-donor-%') u`);
  // Aísla los perfiles ajenos (semilla del demo) para medir solo la población sintética.
  sql(`update app.donor_profiles set is_available = false where is_available and donor_id not in (select id from auth.users where email like 'perf-donor-%')`);
}

const hospitals = [
  { hospital: HOSPITAL_IDS[0], site: SITE_IDS.hospital1Active, admin: idOf(SEED_USERS.admin1.email) },
  { hospital: HOSPITAL_IDS[1], site: SITE_IDS.hospital2Active, admin: idOf(SEED_USERS.admin2.email) },
  { hospital: HOSPITAL_IDS[2], site: SITE_IDS.hospital3Active, admin: idOf(SEED_USERS.admin3.email) },
];
const technical = idOf(SEED_USERS.apiTechnical.email);
const bloodTypes = ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'];
const claims = (uid: string, aal: string): string => `select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated","aal":"${aal}","amr":[{"method":"password","timestamp":1}]}', false);`;
const slots = (n: number): string => JSON.stringify(Array.from({ length: n }, () => ({
  outboxId: randomUUID(), invitationId: randomUUID(), confirmHash: sha(randomUUID()), rejectHash: sha(randomUUID()), sealedPayload: 'sellado-sintetico',
})));

interface Job { needId: string; hospitalIndex: number }

async function runBatch(session: PsqlSession, job: Job): Promise<{ ms: number; kind: string; created: number; err: string }> {
  const h = hospitals[job.hospitalIndex]!;
  const step1 = await session.run(`reset role; set role authenticated; ${claims(h.admin, 'aal2')} select api.authorize_invitation_batch('${job.needId}');`);
  const authorized = JSON.parse(step1.out.split('\n').pop()!) as { kind: string; grantSecret?: string };
  if (authorized.grantSecret === undefined) return { ms: 0, kind: `autorizar:${authorized.kind}:h${job.hospitalIndex}`, created: 0, err: step1.err };
  const grant = authorized.grantSecret;
  const hash = sql(`select app.fingerprint(jsonb_build_array(jsonb_build_array('needId', '${job.needId}')))`);
  const statement = `reset role; set role authenticated; ${claims(technical, 'aal1')} select api.request_invitation_batch('perf-${randomUUID()}', '${hash}', '${job.needId}', '${grant}', '${slots(5)}'::jsonb);`;
  const started = performance.now();
  const step2 = await session.run(statement);
  const ms = performance.now() - started;
  const reply = JSON.parse(step2.out.split('\n').pop() || '{}') as { kind?: string; createdInvitationCount?: number };
  return { ms, kind: reply.kind ?? 'sin-respuesta', created: reply.createdInvitationCount ?? 0, err: step2.err };
}

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

cleanup();
try {
  seedDonors();
  const total = WARMUP + SAMPLES + 10;
  const jobs: Job[] = Array.from({ length: total }, (_, i) => {
    const hospitalIndex = i % 3;
    const h = hospitals[hospitalIndex]!;
    const needId = randomUUID();
    sql(`insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, expires_at)
      values ('${needId}', '${h.hospital}', '${h.site}', '${h.admin}', 'RBC', '${bloodTypes[i % 8]}', 1, 50, 'Normal', 'activa', now() + interval '2 days')`);
    return { needId, hospitalIndex };
  });
  const sessions = Array.from({ length: CONCURRENCY }, () => new PsqlSession());
  const results: Array<{ ms: number; kind: string; created: number; err: string; order: number }> = [];
  let next = 0;
  await Promise.all(sessions.map(async (session) => {
    for (;;) {
      const order = next++;
      if (order >= jobs.length) return;
      results.push({ ...(await runBatch(session, jobs[order]!)), order });
    }
  }));
  for (const s of sessions) s.close();

  const measured = results.filter((r) => r.order >= WARMUP);
  const times = measured.map((r) => r.ms);
  const failures = results.filter((r) => r.kind !== 'created');
  const lockErrors = results.filter((r) => /55P03|statement timeout|deadlock|40P01/i.test(r.err));
  const invitations = Number(sql('select count(*) from app.invitations i join app.donor_profiles p on p.donor_id = i.donor_id where p.name like \'Donante Perf %\''));
  const overQuota = Number(sql(`select count(*) from (select donor_id from app.invitations where donor_id in (select id from auth.users where email like 'perf-donor-%') and created_at > now() - interval '24 hours' group by donor_id having count(*) > 3) t`));
  const report = {
    donors: DONORS, concurrency: CONCURRENCY, hospitals: 3, warmupExcluded: WARMUP, samples: measured.length,
    p50Ms: Math.round(percentile(times, 50)), p95Ms: Math.round(percentile(times, 95)), maxMs: Math.round(Math.max(...times)),
    failures: failures.length, failureKinds: Object.fromEntries([...new Set(failures.map((f) => f.kind))].map((k) => [k, failures.filter((f) => f.kind === k).length])), sampleError: failures.find((f) => f.err)?.err.slice(0, 200) ?? null, lockOrTimeoutErrors: lockErrors.length, invitationsCreated: invitations, donorsOverQuota: overQuota,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const pass = measured.length >= SAMPLES && report.p95Ms <= 1000 && failures.length === 0 && lockErrors.length === 0 && overQuota === 0;
  process.stdout.write(pass ? 'PER-02: PASS (p95 <= 1 s, sin 55P03 ni statement_timeout, cuota respetada)\n' : 'PER-02: FAIL\n');
  process.exitCode = pass ? 0 : 1;
} finally {
  cleanup();
}
