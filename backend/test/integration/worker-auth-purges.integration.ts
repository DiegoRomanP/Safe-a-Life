import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '../support/db.js';
import { isBlockedBy, PsqlSession, until } from '../support/psql-session.js';

// P-12 (b2): las purgas de Auth del worker no pueden borrar una cuenta que otra transacción activa o vincula en ese instante.
let tx: PsqlSession;
let purge: PsqlSession;
let observer: PsqlSession;

beforeAll(() => {
  tx = new PsqlSession();
  purge = new PsqlSession();
  observer = new PsqlSession();
});

afterAll(() => {
  tx.close();
  purge.close();
  observer.close();
});

const insertUser = (id: string, age: string): void => {
  sql(`insert into auth.users (id, instance_id, aud, role, email, created_at)
    values ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'purga-${id.slice(0, 8)}@example.test', now() - interval '${age}')`);
};

describe('app.delete_stale_assisted_account frente a una activación concurrente', () => {
  it('espera al onboarding y no borra a la donante que acaba de activarse', async () => {
    const id = randomUUID();
    insertUser(id, '40 days');
    sql(`insert into app.user_accounts (user_id, role, display_name) values ('${id}', 'donante', null)`);
    sql(`insert into app.donor_profiles (donor_id, status, email_verified_at) values ('${id}', 'incompleto', now())`);
    sql(`insert into app.assisted_signups (hospital_id, email, status, donor_id, activation_expires_at, purge_at, created_at)
      select hospital_id, 'purga-${id.slice(0, 8)}@example.test', 'reclamada_incompleta', '${id}', now(), now() + interval '1 day', now() - interval '31 days' from app.hospitals limit 1`);
    try {
      const txPid = await tx.pid();
      const purgePid = await purge.pid();
      await tx.run(`begin; update app.donor_profiles set status = 'activo', name = 'Donante Sintética', declared_blood_type = 'O_POS', is_available = true,
        latitude = -12.046, longitude = -77.043, location_polygon_version = 'DEMO_ONLY-1' where donor_id = '${id}';`);
      const attempt = purge.run(`select app.delete_stale_assisted_account('${id}');`);
      await until(isBlockedBy(observer, purgePid, txPid), 'la purga espera al onboarding');
      await tx.run('commit;');
      const result = await attempt;
      expect(result.err).toBe('');
      expect(result.out).toBe('f');
      expect(sql(`select count(*) from auth.users where id = '${id}'`)).toBe('1');
      expect(sql(`select status from app.donor_profiles where donor_id = '${id}'`)).toBe('activo');
    } finally {
      sql(`delete from auth.users where id = '${id}'`);
      sql(`delete from app.assisted_signups where donor_id = '${id}'`);
    }
  });
});

describe('app.purge_inert_auth_users frente a una vinculación concurrente', () => {
  it('salta al usuario que otra transacción está vinculando y no lo borra', async () => {
    const id = randomUUID();
    insertUser(id, '400 days');
    try {
      await tx.run(`begin; insert into app.user_accounts (user_id, role, display_name) values ('${id}', 'donante', 'Donante Sintética');`);
      const result = await purge.run(`select app.purge_inert_auth_users(interval '1 day', 1);`);
      expect(result.err).toBe('');
      expect(result.out).toBe('0');
      await tx.run('commit;');
      expect(sql(`select count(*) from auth.users where id = '${id}'`)).toBe('1');
      expect(sql(`select count(*) from app.user_accounts where user_id = '${id}'`)).toBe('1');
    } finally {
      await tx.run('rollback;');
      sql(`delete from auth.users where id = '${id}'`);
    }
  });
});
