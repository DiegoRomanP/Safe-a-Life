import { describe, expect, it } from 'vitest';
import { PersistenceError, PersistenceUnavailableError } from '../../../shared/persistence/errors.js';
import { createSupabaseAuthAdmin } from './supabase-auth-admin.js';

const CONFIG = { supabase: { url: 'http://127.0.0.1:54321', anonKey: 'anon', jwksUrl: 'http://127.0.0.1:54321/jwks', serviceRoleKey: 'clave-elevada-sintetica' } };

function admin(respond: (url: string, init: RequestInit) => Response | Promise<Response>, calls: Array<{ url: string; init: RequestInit }> = []) {
  const stub = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return respond(String(url), init); }) as unknown as typeof fetch;
  return createSupabaseAuthAdmin(CONFIG, { fetch: stub });
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const USER = { id: '00000000-0000-4000-8000-0000000000f2', aud: 'authenticated', email: 'x@example.test' };

describe('AuthAdmin (service_role)', () => {
  it('updatePassword llama al endpoint de administración con la clave elevada y la contraseña nueva', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    await admin(() => json(USER), calls).updatePassword(USER.id, 'contrasena-larga-segura');

    expect(calls[0].url).toContain(`/auth/v1/admin/users/${USER.id}`);
    expect(calls[0].init.method).toBe('PUT');
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ password: 'contrasena-larga-segura' });
    expect(JSON.stringify(calls[0].init.headers)).toContain('clave-elevada-sintetica');
  });

  it('una contraseña rechazada por la política de Auth es VALIDATION_FAILED, no un fallo interno', async () => {
    const weak = admin(() => json({ code: 422, error_code: 'weak_password', msg: 'canario-detalle' }, 422));
    const same = admin(() => json({ code: 422, error_code: 'same_password', msg: 'canario-detalle' }, 422));

    await expect(weak.updatePassword(USER.id, 'x')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(same.updatePassword(USER.id, 'x')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('un fallo 5xx o de red es indisponibilidad (503); otro 4xx es un fallo de persistencia, sin detalle del proveedor', async () => {
    const down = admin(() => json({ msg: 'canario-detalle' }, 503));
    const refused = admin(() => { throw new TypeError('fetch failed'); });
    const rejected = admin(() => json({ code: 400, error_code: 'otra', msg: 'canario-detalle' }, 400));

    await expect(down.updatePassword(USER.id, 'x')).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(refused.updatePassword(USER.id, 'x')).rejects.toBeInstanceOf(PersistenceUnavailableError);
    const error = await rejected.updatePassword(USER.id, 'x').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PersistenceError);
    expect(JSON.stringify(error)).not.toContain('canario');
  });

  it('updateEmail llama al endpoint de administración con el correo nuevo ya confirmado', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    await admin(() => json(USER), calls).updateEmail(USER.id, 'nuevo@example.test');

    expect(calls[0].url).toContain(`/auth/v1/admin/users/${USER.id}`);
    expect(calls[0].init.method).toBe('PUT');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'nuevo@example.test', email_confirm: true });
    expect(JSON.stringify(calls[0].init.headers)).toContain('clave-elevada-sintetica');
  });

  it('un correo que ya pertenece a otro usuario (500 con 23505, o email_exists) es un rechazo, no una caída', async () => {
    const duplicate = admin(() => json({ code: '23505', message: 'canario-detalle' }, 500));
    const exists = admin(() => json({ code: 422, error_code: 'email_exists', msg: 'canario-detalle' }, 422));

    const error = await duplicate.updateEmail(USER.id, 'otro@example.test').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PersistenceError);
    expect(JSON.stringify(error)).not.toContain('canario');
    await expect(exists.updateEmail(USER.id, 'otro@example.test')).rejects.toBeInstanceOf(PersistenceError);
  });

  it('updateEmail: un 5xx sin ese código, un 429 o un fallo de red son indisponibilidad (503)', async () => {
    await expect(admin(() => json({ msg: 'canario-detalle' }, 500)).updateEmail(USER.id, 'a@example.test')).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(admin(() => json({}, 429)).updateEmail(USER.id, 'a@example.test')).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(admin(() => { throw new TypeError('fetch failed'); }).updateEmail(USER.id, 'a@example.test')).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(admin(() => json({ msg: 'otro' }, 400)).updateEmail(USER.id, 'a@example.test')).rejects.toBeInstanceOf(PersistenceError);
  });

  it('deleteInertUser invoca la función atómica y devuelve si se borró', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    await expect(admin(() => json(true, 200), calls).deleteInertUser(USER.id, 'a@x.example.test', 60)).resolves.toBe(true);
    await expect(admin(() => json(false, 200)).deleteInertUser(USER.id, 'a@x.example.test', 60)).resolves.toBe(false);

    expect(calls[0].url).toContain('/rest/v1/rpc/worker_delete_inert_user');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_user_id: USER.id, p_email: 'a@x.example.test', p_min_age: '60 seconds' });
  });

  it('revokeAllSessions invoca la función api.worker_revoke_sessions', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    await admin(() => new Response(null, { status: 204 }), calls).revokeAllSessions(USER.id);

    expect(calls[0].url).toContain('/rest/v1/rpc/worker_revoke_sessions');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_user_id: USER.id });
  });

  it('deleteAccount borra definitivamente (DELETE, should_soft_delete=false) con la clave elevada', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    await expect(admin(() => json(USER), calls).deleteAccount(USER.id)).resolves.toBeUndefined();

    expect(calls[0].url).toContain(`/auth/v1/admin/users/${USER.id}`);
    expect(calls[0].init.method).toBe('DELETE');
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ should_soft_delete: false });
    expect(JSON.stringify(calls[0].init.headers)).toContain('clave-elevada-sintetica');
  });

  it('deleteAccount: 404 o user_not_found es éxito (idempotente)', async () => {
    await expect(admin(() => json({ msg: 'x' }, 404)).deleteAccount(USER.id)).resolves.toBeUndefined();
    await expect(admin(() => json({ error_code: 'user_not_found', msg: 'x' }, 422)).deleteAccount(USER.id)).resolves.toBeUndefined();
  });

  it('deleteAccount: 5xx, red, 429 son indisponibilidad (resultado incierto); 403 o 422 son rechazo, sin detalle del proveedor', async () => {
    await expect(admin(() => json({ msg: 'canario-detalle' }, 503)).deleteAccount(USER.id)).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(admin(() => { throw new TypeError('fetch failed'); }).deleteAccount(USER.id)).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(admin(() => { throw new DOMException('timeout', 'TimeoutError'); }).deleteAccount(USER.id)).rejects.toBeInstanceOf(PersistenceUnavailableError);
    await expect(admin(() => json({ msg: 'x' }, 429)).deleteAccount(USER.id)).rejects.toBeInstanceOf(PersistenceUnavailableError);
    for (const status of [403, 422]) {
      const error = await admin(() => json({ error_code: 'otra', msg: 'canario-detalle' }, status)).deleteAccount(USER.id).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PersistenceError);
      expect(JSON.stringify(error)).not.toContain('canario');
    }
  });

  it('deleteAccount: una excepción inesperada del SDK (respuesta no válida) es resultado incierto, no rechazo', async () => {
    await expect(admin(() => undefined as unknown as Response).deleteAccount(USER.id)).rejects.toBeInstanceOf(PersistenceUnavailableError);
  });

  it('deleteAccount: un id que no es UUID se rechaza sin llamar a Auth', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    await expect(admin(() => json(USER), calls).deleteAccount('../../x')).rejects.toBeInstanceOf(PersistenceError);

    expect(calls).toEqual([]);
  });
});
