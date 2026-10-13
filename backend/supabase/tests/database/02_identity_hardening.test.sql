begin;
-- Aislamiento: las pruebas corren sobre una base que puede estar sembrada. Todo se revierte con el rollback.
truncate app.sites, app.hospital_memberships, app.hospitals, app.user_accounts cascade;
alter table app.configuration disable trigger configuration_guard;
update app.configuration set final_demo_at = null;
alter table app.configuration enable trigger configuration_guard;

select plan(29);

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-hard-super@example.test'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-hard-admin@example.test'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-hard-donante@example.test'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-hard-sincuenta@example.test');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000c1', 'superadmin', null),
  ('00000000-0000-4000-8000-0000000000c2', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000c3', 'donante', 'Donante Sintético');
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-0000000000c1', repeat('H', 160), 'Hospital Largo S.A.', true);
insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint) values
  ('30000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', '10000000-0000-4000-8000-0000000000c1', 'activa', 'a***@example.test');

create function pg_temp.login(p_uid text, p_aal text, p_step_up boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format(
    '{"sub":"%s","role":"authenticated","aal":"%s","amr":[%s]}', p_uid, p_aal,
    case when p_step_up then format('{"method":"totp","timestamp":%s}', extract(epoch from now())::bigint) else '{"method":"password","timestamp":1}' end), true);
end $$;
grant execute on function pg_temp.login(text, text, boolean) to authenticated, anon;

-- Privilegios de EXECUTE (ADR-003: cerrado por defecto) ------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('api', 'app')
    and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE')),
  0, 'ninguna función de api ni app tiene EXECUTE para PUBLIC');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  array['consume_rate_limit', 'readiness', 'record_public_idempotency'],
  'anon solo ejecuta las RPC públicas de la allowlist (las de tokens las ejecuta el backend con su sesión técnica)');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.prosecdef),
  array['consume_password_reset', 'consume_rate_limit', 'get_admin_invitation_preview', 'ingest_email_event', 'invite_hospital_admin', 'link_admin_account', 'readiness', 'record_public_idempotency', 'request_password_recovery', 'worker_claim_due_outbox', 'worker_delete_inert_user', 'worker_expire_outbox', 'worker_record_attempt', 'worker_revoke_sessions'],
  'las únicas funciones SECURITY DEFINER de api son las de la allowlist');

-- record_public_idempotency (DEFINER, anon) -------------------------------------------------------------
set local role anon;
select is(api.record_public_idempotency('user:' || repeat('a', 64), 'createSession', 'clave-publica-0001', repeat('b', 64)) ->> 'kind',
  'invalid', 'record_public_idempotency rechaza un actor que no es email: ni token:');
select is(api.record_public_idempotency('email:' || repeat('a', 64), 'createHospital', 'clave-publica-0001', repeat('b', 64)) ->> 'kind',
  'invalid', 'record_public_idempotency rechaza operaciones fuera de la lista');
select is(api.record_public_idempotency('email:' || repeat('a', 64), 'requestPasswordRecovery', 'clave-publica-0001', repeat('b', 64)) ->> 'kind',
  'invalid', 'la recuperación y el registro de donantes ya no pasan por la idempotencia pública (llevan la propia)');
select is(api.record_public_idempotency('email:' || repeat('a', 64), 'createSession', 'clave-publica-0001', repeat('b', 64)) ->> 'kind',
  'ok', 'record_public_idempotency registra una clave nueva');
select is(api.record_public_idempotency('email:' || repeat('a', 64), 'createSession', 'clave-publica-0001', repeat('b', 64)) ->> 'kind',
  'ok', 'record_public_idempotency repite ok con el mismo payload');
select is(api.record_public_idempotency('email:' || repeat('a', 64), 'createSession', 'clave-publica-0001', repeat('c', 64)) ->> 'kind',
  'payload_conflict', 'record_public_idempotency detecta otro payload con la misma clave');
select throws_ok($$select * from app.idempotency_records$$, '42501', null, 'anon no lee idempotency_records');

-- consume_idempotency_key -----------------------------------------------------------------------------------
reset role;
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c3', 'aal1');
select is(api.consume_idempotency_key('verifyStepUp', 'clave-mfa-0000000001', repeat('a', 64)) ->> 'kind', 'forbidden',
  'un donante no consume claves de MFA');
select pg_temp.login('00000000-0000-4000-8000-0000000000c4', 'aal1');
select is(api.consume_idempotency_key('verifyStepUp', 'clave-mfa-0000000001', repeat('a', 64)) ->> 'kind', 'forbidden',
  'un usuario de Auth sin cuenta de aplicación no consume claves');
select pg_temp.login('00000000-0000-4000-8000-0000000000c2', 'aal1');
select is(api.consume_idempotency_key('createHospital', 'clave-mfa-0000000001', repeat('a', 64)) ->> 'kind', 'invalid',
  'solo se consumen claves de las operaciones de MFA');
select is(api.consume_idempotency_key('verifyStepUp', 'clave-mfa-0000000001', repeat('a', 64)) ->> 'kind', 'ok',
  'una clave de MFA se consume una vez');
select is(api.consume_idempotency_key('verifyStepUp', 'clave-mfa-0000000001', repeat('a', 64)) ->> 'kind', 'conflict',
  'la misma clave de MFA no se reutiliza');

-- displayName acotado al contrato ----------------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000c2', 'aal2');
select is(char_length(api.current_actor() ->> 'displayName'), 120, 'displayName de un hospital con nombre de 160 caracteres se recorta a 120');
select is(char_length(api.current_actor() #>> '{hospital,hospitalName}'), 160, 'hospitalName conserva el nombre completo');

-- Escrituras directas ----------------------------------------------------------------------------------------
create function pg_temp.rows_changed(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql; get diagnostics n = row_count; return n;
exception when insufficient_privilege then return 0;
end $$;
grant execute on function pg_temp.rows_changed(text) to authenticated;
select is(pg_temp.rows_changed($$update app.hospitals set public_name = 'Intruso' where hospital_id = '10000000-0000-4000-8000-0000000000c1'$$), 0,
  'un admin no actualiza hospitales directamente');
select is(pg_temp.rows_changed($$update app.hospital_memberships set status = 'activa' where true$$), 0,
  'un admin no actualiza membresías directamente');
-- La política permite a un usuario auditar SUS PROPIOS actos (write_audit es INVOKER); lo que no puede es
-- atribuir un evento a otro actor ni usar otro tipo de actor.
select throws_ok($$insert into app.audit_events (actor_kind, actor_id, event, result) values ('usuario', '00000000-0000-4000-8000-0000000000ff', 'x', 'ok')$$,
  '42501', null, 'un usuario no inserta auditoría a nombre de otro actor');
select throws_ok($$insert into app.audit_events (actor_kind, actor_id, event, result) values ('sistema', '00000000-0000-4000-8000-0000000000c1', 'x', 'ok')$$,
  '42501', null, 'un usuario no inserta auditoría con otro tipo de actor');

-- Revocación: step-up, replay y conflicto ------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal2');
select is(api.revoke_membership('clave-revoke-1000001', repeat('0', 64), '30000000-0000-4000-8000-0000000000c1', 'Baja') ->> 'kind',
  'step_up_required', 'revoke_membership exige step-up');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal2', true);
create temp table first_revoke as select api.revoke_membership('clave-revoke-1000002', app.fingerprint(jsonb_build_array(
  jsonb_build_array('membershipId', '30000000-0000-4000-8000-0000000000c1'), jsonb_build_array('status', 'revocada'),
  jsonb_build_array('reason', 'Baja del personal'))), '30000000-0000-4000-8000-0000000000c1', 'Baja del personal') as r;
grant select on first_revoke to authenticated;
select is((select r ->> 'kind' from first_revoke), 'ok', 'revoke_membership revoca con step-up');
select is(api.revoke_membership('clave-revoke-1000002', app.fingerprint(jsonb_build_array(
  jsonb_build_array('membershipId', '30000000-0000-4000-8000-0000000000c1'), jsonb_build_array('status', 'revocada'),
  jsonb_build_array('reason', 'Baja del personal'))), '30000000-0000-4000-8000-0000000000c1', 'Baja del personal'),
  jsonb_build_object('kind', 'replayed', 'response', (select r from first_revoke)), 'el replay de revoke_membership devuelve el resultado original');
select is(api.revoke_membership('clave-revoke-1000002', app.fingerprint(jsonb_build_array(
  jsonb_build_array('membershipId', '30000000-0000-4000-8000-0000000000c1'), jsonb_build_array('status', 'revocada'),
  jsonb_build_array('reason', 'Otro motivo'))), '30000000-0000-4000-8000-0000000000c1', 'Otro motivo') ->> 'kind',
  'payload_conflict', 'la misma clave con otro motivo es payload_conflict');
select is(api.revoke_membership('clave-revoke-1000003', app.fingerprint(jsonb_build_array(
  jsonb_build_array('membershipId', '30000000-0000-4000-8000-0000000000c1'), jsonb_build_array('status', 'revocada'),
  jsonb_build_array('reason', 'Baja del personal'))), '30000000-0000-4000-8000-0000000000c1', 'Baja del personal') ->> 'kind',
  'conflict', 'otra clave sobre una membresía ya revocada es conflict');

-- final_demo_at: replay y conflicto ------------------------------------------------------------------------
create temp table first_demo as select api.set_final_demo_at('clave-config-1000001', app.fingerprint(jsonb_build_array(
  jsonb_build_array('finalDemoAt', '2030-01-01T00:00:00.000Z'))), '2030-01-01T00:00:00Z') as r;
grant select on first_demo to authenticated;
select is((select r ->> 'kind' from first_demo), 'ok', 'set_final_demo_at fija la fecha');
select is(api.set_final_demo_at('clave-config-1000001', app.fingerprint(jsonb_build_array(
  jsonb_build_array('finalDemoAt', '2030-01-01T00:00:00.000Z'))), '2030-01-01T00:00:00Z'),
  jsonb_build_object('kind', 'replayed', 'response', (select r from first_demo)), 'el replay de set_final_demo_at devuelve el resultado original');
select is(api.set_final_demo_at('clave-config-1000002', app.fingerprint(jsonb_build_array(
  jsonb_build_array('finalDemoAt', '2030-01-01T00:00:00.000Z'))), '2030-01-01T00:00:00Z') ->> 'kind',
  'conflict', 'otra clave con la fecha ya fijada es conflict');

select * from finish();
rollback;
