import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '../support/db.js';
import { isBlockedBy, PsqlSession, until } from '../support/psql-session.js';

// B1: la limpieza de usuarios inertes no puede borrar una cuenta que otra transacción está vinculando en ese instante.
let link: PsqlSession;
let worker: PsqlSession;
let observer: PsqlSession;

beforeAll(() => {
  link = new PsqlSession();
  worker = new PsqlSession();
  observer = new PsqlSession();
});

afterAll(() => {
  link.close();
  worker.close();
  observer.close();
});

describe('api.worker_delete_inert_user frente a una vinculación concurrente', () => {
  it('no borra la cuenta recién vinculada: espera a la vinculación y revalida', async () => {
    const id = randomUUID();
    const email = `inerte-${id.slice(0, 8)}@example.test`;
    sql(`insert into auth.users (id, instance_id, aud, role, email, created_at)
      values ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}', now() - interval '2 days')`);
    try {
      const linkPid = await link.pid();
      const workerPid = await worker.pid();
      await worker.run('set role service_role;');

      // La vinculación inserta la cuenta sin confirmar todavía (toma KEY SHARE sobre la fila de auth.users).
      await link.run(`begin; insert into app.user_accounts (user_id, role, display_name) values ('${id}', 'donante', 'Donante Sintético');`);

      // La limpieza arranca ahora: su instantánea no ve la cuenta sin confirmar.
      const cleanup = worker.run(`select api.worker_delete_inert_user('${id}', '${email}', interval '1 day');`);
      await until(isBlockedBy(observer, workerPid, linkPid), 'la limpieza espera a la vinculación');

      await link.run('commit;');
      const result = await cleanup;

      expect(result.err).toBe('');
      expect(result.out).toBe('f');
      expect(sql(`select count(*) from app.user_accounts where user_id = '${id}'`)).toBe('1');
      expect(sql(`select count(*) from auth.users where id = '${id}'`)).toBe('1');
    } finally {
      sql(`delete from auth.users where id = '${id}'`);
    }
  });

  it('sigue borrando al usuario inerte sin cuenta', () => {
    const id = randomUUID();
    const email = `inerte-${id.slice(0, 8)}@example.test`;
    sql(`insert into auth.users (id, instance_id, aud, role, email, created_at)
      values ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}', now() - interval '2 days')`);

    expect(sql(`select api.worker_delete_inert_user('${id}', '${email}', interval '1 day')`)).toBe('t');
    expect(sql(`select count(*) from auth.users where id = '${id}'`)).toBe('0');
  });
});
