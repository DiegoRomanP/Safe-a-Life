begin;
-- P-12 (b2): purgas de Auth del worker y borrado de factores MFA en el reset. Todo se revierte con el rollback.
truncate app.action_tokens, app.email_outbox, app.correction_requests, app.assisted_signups, app.donor_profiles, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(45);

-- Aísla la prueba de cualquier usuario de Auth ajeno (se revierte con el rollback).
delete from auth.users where id::text not like '00000000-0000-4000-8000-0000000006%';

insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000006a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stale-ok@example.test', now() - interval '40 days'),
  ('00000000-0000-4000-8000-0000000006a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stale-activo@example.test', now() - interval '40 days'),
  ('00000000-0000-4000-8000-0000000006a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stale-joven@example.test', now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000006a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stale-admin@example.test', now() - interval '40 days'),
  ('00000000-0000-4000-8000-0000000006a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stale-incompleta-2@example.test', now() - interval '40 days'),
  ('00000000-0000-4000-8000-0000000006b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inerte-viejo@example.test', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000006b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inerte-nuevo@example.test', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000006b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inerte-viejo-2@example.test', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000006c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tecnica-p12@example.test', now() - interval '60 days'),
  ('00000000-0000-4000-8000-0000000006c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'worker-p12@example.test', now() - interval '60 days'),
  ('00000000-0000-4000-8000-0000000006c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'super-p12@example.test', now() - interval '60 days'),
  ('00000000-0000-4000-8000-0000000006d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mfa-uno@example.test', now() - interval '60 days'),
  ('00000000-0000-4000-8000-0000000006d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mfa-dos@example.test', now() - interval '60 days'),
  ('00000000-0000-4000-8000-0000000006d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mfa-admin@example.test', now() - interval '60 days'),
  ('00000000-0000-4000-8000-0000000006d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mfa-super@example.test', now() - interval '60 days');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000006a1', 'donante', null), ('00000000-0000-4000-8000-0000000006a2', 'donante', null),
  ('00000000-0000-4000-8000-0000000006a3', 'donante', null), ('00000000-0000-4000-8000-0000000006a4', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000006a5', 'donante', null),
  ('00000000-0000-4000-8000-0000000006c1', 'api_technical', null), ('00000000-0000-4000-8000-0000000006c2', 'worker', null),
  ('00000000-0000-4000-8000-0000000006c3', 'superadmin', null),
  ('00000000-0000-4000-8000-0000000006d1', 'donante', null), ('00000000-0000-4000-8000-0000000006d2', 'donante', null),
  ('00000000-0000-4000-8000-0000000006d3', 'admin_hospitalario', null), ('00000000-0000-4000-8000-0000000006d4', 'superadmin', null);
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-0000000006a1', 'Hospital Purga', 'Hospital Purga S.A.', true);
insert into app.donor_profiles (donor_id, status, email_verified_at) values
  ('00000000-0000-4000-8000-0000000006a1', 'incompleto', now()), ('00000000-0000-4000-8000-0000000006a3', 'incompleto', now()),
  ('00000000-0000-4000-8000-0000000006a4', 'incompleto', now()), ('00000000-0000-4000-8000-0000000006a5', 'pendiente_verificacion', null);
insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
values ('00000000-0000-4000-8000-0000000006a2', 'Activa Prueba', 'O_POS', true, -12.046, -77.043, 'DEMO_ONLY-1', 'activo', now());
insert into app.assisted_signups (hospital_id, email, name, status, donor_id, activation_expires_at, purge_at, created_at)
select '10000000-0000-4000-8000-0000000006a1', e, null, 'reclamada_incompleta', d, now(), now() + interval '1 day', c
from (values ('a1@example.test', '00000000-0000-4000-8000-0000000006a1'::uuid, now() - interval '31 days'),
             ('a2@example.test', '00000000-0000-4000-8000-0000000006a2'::uuid, now() - interval '31 days'),
             ('a3@example.test', '00000000-0000-4000-8000-0000000006a3'::uuid, now() - interval '5 days'),
             ('a4@example.test', '00000000-0000-4000-8000-0000000006a4'::uuid, now() - interval '31 days'),
             ('a5@example.test', '00000000-0000-4000-8000-0000000006a5'::uuid, now() - interval '31 days')) t(e, d, c);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret) values
  ('f0000000-0000-4000-8000-0000000006d1', '00000000-0000-4000-8000-0000000006d1', 'uno', 'totp', 'verified', now(), now(), 'x'),
  ('f0000000-0000-4000-8000-0000000006d3', '00000000-0000-4000-8000-0000000006d1', 'tres', 'totp', 'unverified', now(), now(), 'x'),
  ('f0000000-0000-4000-8000-0000000006d2', '00000000-0000-4000-8000-0000000006d2', 'dos', 'totp', 'verified', now(), now(), 'x'),
  ('f0000000-0000-4000-8000-0000000006d4', '00000000-0000-4000-8000-0000000006d3', 'admin', 'totp', 'verified', now(), now(), 'x'),
  ('f0000000-0000-4000-8000-0000000006d5', '00000000-0000-4000-8000-0000000006d4', 'super', 'totp', 'verified', now(), now(), 'x');
insert into auth.mfa_challenges (id, factor_id, created_at, ip_address) values
  ('c0000000-0000-4000-8000-0000000006d1', 'f0000000-0000-4000-8000-0000000006d1', now(), '127.0.0.1');
insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values
  (repeat('c', 64), 'recuperacion', '00000000-0000-4000-8000-0000000006d1', now() + interval '1 hour'),
  (repeat('d', 64), 'recuperacion', '00000000-0000-4000-8000-0000000006d3', now() + interval '1 hour'),
  (repeat('e', 64), 'recuperacion', '00000000-0000-4000-8000-0000000006d4', now() + interval '1 hour');
-- Una corrección pendiente de la cuenta vencida (conserva datos propuestos).
insert into app.correction_requests (request_id, donor_id, type, requested_fields, proposed_name) values
  ('90000000-0000-4000-8000-0000000006a1', '00000000-0000-4000-8000-0000000006a1', 'correccion', array['name'], 'Nombre Propuesto');

create function pg_temp.login(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)))::text, true);
end $$;
grant execute on function pg_temp.login(text) to authenticated;

-- Propiedad y privilegios -------------------------------------------------------------------------------------------
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'app.delete_stale_assisted_account(uuid)'::regprocedure), 'postgres', 'delete_stale_assisted_account es de postgres');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'app.purge_inert_auth_users(interval, int)'::regprocedure), 'postgres', 'purge_inert_auth_users es de postgres');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'app.delete_mfa_factors(uuid)'::regprocedure), 'postgres', 'delete_mfa_factors es de postgres');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'api.worker_purge_auth_accounts(int)'::regprocedure), 'app_privileged', 'la RPC de worker es de app_privileged');
select ok((select bool_and(prosecdef) from pg_proc where oid in ('app.delete_stale_assisted_account(uuid)'::regprocedure, 'app.purge_inert_auth_users(interval, int)'::regprocedure,
  'app.delete_mfa_factors(uuid)'::regprocedure, 'api.worker_purge_auth_accounts(int)'::regprocedure)), 'las cuatro son SECURITY DEFINER');
select is((select count(*)::int from (values ('app.delete_stale_assisted_account(uuid)'), ('app.purge_inert_auth_users(interval, int)'), ('app.delete_mfa_factors(uuid)')) f(n),
  (values ('anon'), ('authenticated'), ('service_role')) r(role) where has_function_privilege(r.role, f.n, 'EXECUTE')), 0, 'los helpers de postgres no los ejecuta anon, authenticated ni service_role');
select ok((select bool_and(has_function_privilege('app_privileged', f.n, 'EXECUTE')) from (values ('app.delete_stale_assisted_account(uuid)'), ('app.purge_inert_auth_users(interval, int)'), ('app.delete_mfa_factors(uuid)')) f(n)),
  'los helpers los ejecuta app_privileged');
select ok(has_function_privilege('authenticated', 'api.worker_purge_auth_accounts(int)', 'EXECUTE') and not has_function_privilege('anon', 'api.worker_purge_auth_accounts(int)', 'EXECUTE')
  and not has_function_privilege('service_role', 'api.worker_purge_auth_accounts(int)', 'EXECUTE'), 'la RPC la ejecuta authenticated y no anon ni service_role');
select ok((select bool_and(exists (select 1 from unnest(proconfig) c where c = 'search_path=""')) from pg_proc where oid in ('app.delete_stale_assisted_account(uuid)'::regprocedure,
  'app.purge_inert_auth_users(interval, int)'::regprocedure, 'app.delete_mfa_factors(uuid)'::regprocedure, 'api.worker_purge_auth_accounts(int)'::regprocedure)), 'todas fijan search_path vacío');

-- Helper de cuentas asistidas vencidas ----------------------------------------------------------------------------------
select is(app.delete_stale_assisted_account('00000000-0000-4000-8000-0000000006a2'), false, 'no borra a una donante activa');
select is(app.delete_stale_assisted_account('00000000-0000-4000-8000-0000000006a3'), false, 'no borra una cuenta de menos de 30 días');
select is(app.delete_stale_assisted_account('00000000-0000-4000-8000-0000000006a4'), false, 'no borra a quien no es donante');
select is(app.delete_stale_assisted_account('00000000-0000-4000-8000-0000000006c1'), false, 'no borra a la cuenta técnica');
select is(app.delete_stale_assisted_account('00000000-0000-4000-8000-0000000006ff'), false, 'un id desconocido no borra nada');
select is(app.delete_stale_assisted_account('00000000-0000-4000-8000-0000000006a1'), true, 'borra la donante incompleta de más de 30 días');
select is((select count(*)::int from auth.users where id in ('00000000-0000-4000-8000-0000000006a1')), 0, 'el usuario de Auth ya no existe');
select is((select count(*)::int from app.correction_requests where donor_id = '00000000-0000-4000-8000-0000000006a1'), 0, 'y no quedan sus solicitudes de corrección con datos propuestos');
select is((select count(*)::int from app.user_accounts where user_id = '00000000-0000-4000-8000-0000000006a1')
  + (select count(*)::int from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000006a1'), 0, 'la cascada se llevó cuenta y perfil');
select is((select count(*)::int from auth.users where id in ('00000000-0000-4000-8000-0000000006a2', '00000000-0000-4000-8000-0000000006a3', '00000000-0000-4000-8000-0000000006a4', '00000000-0000-4000-8000-0000000006c1')), 4,
  'los demás siguen');

-- Helper de inertes -------------------------------------------------------------------------------------------------------
select throws_ok($$select app.purge_inert_auth_users(interval '23 hours', 1)$$, 'P0001', 'purge_inert_auth_users: edad minima de 24 horas', 'rechaza una edad menor de 24 horas');
select is(app.purge_inert_auth_users(interval '24 hours', 1), 1, 'respeta el límite');
select is(app.purge_inert_auth_users(interval '24 hours', 10), 1, 'borra el otro inerte de más de 24 h');
select is((select array_agg(email::text order by email) from auth.users where id::text like '00000000-0000-4000-8000-0000000006b%'), array['inerte-nuevo@example.test'], 'solo queda el inerte de menos de 24 h');
select is((select count(*)::int from auth.users where id::text like '00000000-0000-4000-8000-0000000006c%' or id::text like '00000000-0000-4000-8000-0000000006a%'), 7,
  'no toca cuentas con cuenta de aplicación (técnica, worker, superadmin, donantes) aunque sean viejas');

-- RPC de worker -------------------------------------------------------------------------------------------------------------
set local role authenticated;
select is(api.worker_purge_auth_accounts(10) ->> 'kind', 'unauthenticated', 'sin JWT: unauthenticated');
select pg_temp.login('00000000-0000-4000-8000-0000000006c1');
select is(api.worker_purge_auth_accounts(10) ->> 'kind', 'forbidden', 'la técnica no purga');
select pg_temp.login('00000000-0000-4000-8000-0000000006c3');
select is(api.worker_purge_auth_accounts(10) ->> 'kind', 'forbidden', 'ni un superadmin');
select pg_temp.login('00000000-0000-4000-8000-0000000006c2');
select is(api.worker_purge_auth_accounts(0) ->> 'kind', 'invalid', 'p_limit 0 es invalid');
select is(api.worker_purge_auth_accounts(501) ->> 'kind', 'invalid', 'p_limit 501 es invalid');
select is(api.worker_purge_auth_accounts(null) ->> 'kind', 'invalid', 'p_limit nulo es invalid');
reset role;
-- Con las inertes ya purgadas, se vuelve a crear una vieja para la RPC.
insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000006b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inerte-rpc@example.test', now() - interval '2 days');
update auth.users set created_at = now() - interval '40 days' where id = '00000000-0000-4000-8000-0000000006a5';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000006c2');
create temp table purge as select api.worker_purge_auth_accounts(10) as r;
grant select on purge to authenticated;
select is((select r from purge), '{"kind": "ok", "staleDeleted": 1, "inertDeleted": 1}'::jsonb, 'devuelve solo conteos: 1 vencida y 1 inerte');
select is(api.worker_purge_auth_accounts(10), '{"kind": "ok", "staleDeleted": 0, "inertDeleted": 0}'::jsonb, 'una segunda pasada no encuentra nada');
reset role;
select is((select count(*)::int from auth.users where id in ('00000000-0000-4000-8000-0000000006a5', '00000000-0000-4000-8000-0000000006b4')), 0, 'la RPC borró ambas');
select is((select count(*)::int from app.audit_events where event = 'cuenta.purga_vencida' and resource_type = 'user'
  and resource_id = '00000000-0000-4000-8000-0000000006a5' and actor_id = '00000000-0000-4000-8000-0000000006c2' and result = 'ok'), 1, 'audita la purga vencida con el UUID');
select is((select count(*)::int from app.audit_events a where a.event = 'cuenta.purga_vencida' and a.reason is null
  and row_to_json(a)::text !~* '(example\.test|@|Prueba|Nombre)'), 1, 'el audit no lleva correo ni nombre');

-- Factores MFA en el reset de contraseña ----------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000006c1');
create temp table cons as select api.consume_password_reset(repeat('c', 64)) as r;
grant select on cons to authenticated;
select is((select r ->> 'kind' from cons), 'ok', 'el reset se consume');
reset role;
select is((select count(*)::int from auth.mfa_factors where user_id = '00000000-0000-4000-8000-0000000006d1'), 0, 'tras el reset no quedan factores del usuario (verificados ni pendientes)');
select is((select count(*)::int from auth.mfa_challenges where factor_id = 'f0000000-0000-4000-8000-0000000006d1'), 0, 'ni sus retos');
select is((select count(*)::int from auth.mfa_factors where user_id = '00000000-0000-4000-8000-0000000006d2'), 1, 'el factor de otro usuario no se toca');
-- Sin cuenta de aplicación (se crea aquí: antes la purga de inertes la habría borrado).
insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000006d5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mfa-sin-cuenta@example.test', now() - interval '60 days');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret) values
  ('f0000000-0000-4000-8000-0000000006d6', '00000000-0000-4000-8000-0000000006d5', 'sin cuenta', 'totp', 'verified', now(), now(), 'x');
insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values (repeat('f', 64), 'recuperacion', '00000000-0000-4000-8000-0000000006d5', now() + interval '1 hour');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000006c1');
select is(api.consume_password_reset(repeat('d', 64)) ->> 'kind', 'ok', 'reset de un admin hospitalario');
select is(api.consume_password_reset(repeat('e', 64)) ->> 'kind', 'ok', 'reset de un superadmin');
select is(api.consume_password_reset(repeat('f', 64)) ->> 'kind', 'ok', 'reset de un usuario sin cuenta de aplicación');
reset role;
select is((select count(*)::int from auth.mfa_factors where user_id = '00000000-0000-4000-8000-0000000006d3' and status = 'verified'), 1, 'el admin hospitalario conserva su factor');
select is((select count(*)::int from auth.mfa_factors where user_id = '00000000-0000-4000-8000-0000000006d4' and status = 'verified'), 1, 'el superadmin conserva su factor');
select is((select count(*)::int from auth.mfa_factors where user_id = '00000000-0000-4000-8000-0000000006d5'), 1, 'sin cuenta de aplicación no se borra nada');

select * from finish();
rollback;
