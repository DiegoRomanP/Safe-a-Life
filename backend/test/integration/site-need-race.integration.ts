import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '../support/db.js';
import { SEED_USERS, SITE_IDS } from '../support/local-env.js';
import { isBlockedBy, PsqlSession, until } from '../support/psql-session.js';

// B4: crear una necesidad mientras se desactiva su sede debe resolverse como contrato (created o site_unusable), no como 500.
let creator: PsqlSession;
let deactivator: PsqlSession;
let holder: PsqlSession;
let observer: PsqlSession;

beforeAll(() => {
  creator = new PsqlSession();
  deactivator = new PsqlSession();
  holder = new PsqlSession();
  observer = new PsqlSession();
});

afterAll(() => {
  for (const s of [creator, deactivator, holder, observer]) s.close();
});

describe('api.create_need_draft frente a la desactivación concurrente de la sede', () => {
  it('resuelve la carrera con un resultado del contrato y nunca con un error de RLS', async () => {
    const site = SITE_IDS.hospital1Active;
    const adminId = sql(`select id from auth.users where email = '${SEED_USERS.admin1.email}'`);
    const key = `carrera-sede-${randomUUID()}`;
    const hash = sql(`select app.fingerprint(jsonb_build_array(
      jsonb_build_array('component', 'RBC'), jsonb_build_array('requiredBloodType', 'O_NEG'),
      jsonb_build_array('targetConfirmations', 5), jsonb_build_array('siteId', '${site}'),
      jsonb_build_array('radiusKm', 10), jsonb_build_array('urgency', 'Urgente'),
      jsonb_build_array('expiresInHours', 12)))`);
    const actorRef = `user:${adminId}`;
    const startedAt = sql('select clock_timestamp()');
    const needsBefore = sql(`select count(*) from app.needs where created_by = '${adminId}' and site_id = '${site}'`);
    try {
      const [creatorPid, deactivatorPid, holderPid] = [await creator.pid(), await deactivator.pid(), await holder.pid()];
      await creator.run(`set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1}]}', false);`);

      // Un tercero retiene la clave de idempotencia: la creación se detiene DESPUÉS de leer la sede y ANTES de insertar.
      await holder.run(`begin; insert into app.idempotency_records (actor_ref, operation, idem_key, payload_hash, status)
        values ('${actorRef}', 'createHospitalNeed', '${key}', '${hash}', 'en_curso');`);
      const created = creator.run(`select api.create_need_draft('${key}', '${hash}', 'RBC', 'O_NEG', 5, '${site}', 10, 'Urgente', 12);`);
      await until(isBlockedBy(observer, creatorPid, holderPid), 'la creación espera a la clave de idempotencia');

      // La desactivación llega ahora y confirma antes de que la creación llegue a insertar (la creación sigue esperando a la clave).
      let deactivated = false;
      const deactivation = deactivator.run(`update app.sites set is_active = false where site_id = '${site}';`).then((r) => { deactivated = true; return r; });
      await until(async () => deactivated || (await isBlockedBy(observer, deactivatorPid, creatorPid)()), 'la desactivación termina o espera a la creación');

      await holder.run('rollback;');
      const result = await created;
      await deactivation;

      expect(result.err).toBe('');
      const kind = (JSON.parse(result.out) as { kind: string }).kind;
      expect(kind).toBe('site_unusable');
      // El 422 no deja una clave «en curso» ni una necesidad en la sede inactiva.
      expect(sql(`select count(*) from app.idempotency_records where actor_ref = '${actorRef}' and idem_key = '${key}'`)).toBe('0');
      expect(sql(`select count(*) from app.needs where created_by = '${adminId}' and site_id = '${site}'`)).toBe(needsBefore);
    } finally {
      sql(`update app.sites set is_active = true where site_id = '${site}'`);
      sql(`delete from app.needs where created_by = '${adminId}' and site_id = '${site}' and created_at >= '${startedAt}'`);
      sql(`delete from app.idempotency_records where actor_ref = '${actorRef}' and idem_key = '${key}'`);
    }
  });
});
