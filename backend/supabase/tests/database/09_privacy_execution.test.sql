begin;
truncate app.correction_requests, app.access_grants, app.deletion_ledger, app.donor_profiles, app.user_accounts, app.assisted_signups, app.action_tokens, app.email_outbox cascade;
delete from app.idempotency_records;

select plan(61);

insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'corrige-nombre@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'corrige-correo@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'elimina@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'elimina-huerfano@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reclamada-vieja@example.test', now() - interval '40 days'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'super-uno@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'super-dos@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tecnica@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'worker@example.test', now() - interval '1 day');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'donante', null), ('00000000-0000-4000-8000-0000000000a2', 'donante', null),
  ('00000000-0000-4000-8000-0000000000a3', 'donante', null), ('00000000-0000-4000-8000-0000000000a4', 'donante', null),
  ('00000000-0000-4000-8000-0000000000a5', 'donante', null),
  ('00000000-0000-4000-8000-0000000000b1', 'superadmin', null), ('00000000-0000-4000-8000-0000000000b2', 'superadmin', null),
  ('00000000-0000-4000-8000-0000000000c1', 'api_technical', null), ('00000000-0000-4000-8000-0000000000c2', 'worker', null);
insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
select u, n, 'O_POS', true, -12.046, -77.043, 'DEMO_ONLY-1', 'activo', now()
from (values ('00000000-0000-4000-8000-0000000000a1'::uuid, 'Nombre Viejo'), ('00000000-0000-4000-8000-0000000000a2', 'Nombre Estable'),
             ('00000000-0000-4000-8000-0000000000a3', 'Persona Eliminada'), ('00000000-0000-4000-8000-0000000000a4', 'Persona Huerfana')) t(u, n);
insert into app.donor_profiles (donor_id, status, email_verified_at) values ('00000000-0000-4000-8000-0000000000a5', 'incompleto', now());
insert into app.assisted_signups (hospital_id, email, name, status, donor_id, activation_expires_at, purge_at, created_at)
select h, 'reclamada@example.test', null, 'reclamada_incompleta', '00000000-0000-4000-8000-0000000000a5', now(), now() + interval '1 day', now() - interval '31 days'
from (select hospital_id h from app.hospitals limit 1) x;

-- Solicitudes ya aprobadas (el alta y la decisión se prueban en 08)
insert into app.correction_requests (request_id, donor_id, type, requested_fields, proposed_name, proposed_blood_type, status) values
  ('90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'correccion', array['declaredBloodType', 'name'], 'Nombre Nuevo', 'A_POS', 'aprobada');
insert into app.correction_requests (request_id, donor_id, type, requested_fields, proposed_email_sealed, status) values
  ('90000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a2', 'correccion', array['email'], repeat('s', 40), 'aprobada');
insert into app.correction_requests (request_id, donor_id, type, requested_fields, status) values
  ('90000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a3', 'eliminacion', array['deletion'], 'aprobada'),
  ('90000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a4', 'eliminacion', array['deletion'], 'aprobada'),
  ('90000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000a1', 'eliminacion', array['deletion'], 'pendiente');
insert into app.access_grants (grant_id, superadmin_id, request_id, action, allowed_fields, reason, expires_at) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', '90000000-0000-4000-8000-000000000001', 'execute', array['declaredBloodType', 'name'], 'Ejecución.', now() + interval '5 minutes'),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b1', '90000000-0000-4000-8000-000000000002', 'execute', array['email'], 'Ejecución.', now() + interval '5 minutes'),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000b1', '90000000-0000-4000-8000-000000000003', 'execute', array['name'], 'Ejecución.', now() + interval '5 minutes'),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000b1', '90000000-0000-4000-8000-000000000004', 'execute', array['name'], 'Ejecución.', now() + interval '5 minutes'),
  ('a0000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000b1', '90000000-0000-4000-8000-000000000005', 'execute', array['name'], 'Ejecución.', now() + interval '5 minutes'),
  ('a0000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000b1', '90000000-0000-4000-8000-000000000001', 'review', array['name'], 'Revisión.', now() + interval '5 minutes');
-- Algo que la eliminación debe cancelar
insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values (repeat('1', 64), 'verificacion_email', '00000000-0000-4000-8000-0000000000a3', now() + interval '1 hour');
insert into app.email_outbox (outbox_id, kind, recipient_user_id, idempotency_key, sealed_payload, not_after) values
  ('70000000-0000-4000-8000-000000000001', 'recuperacion', '00000000-0000-4000-8000-0000000000a3', 'outbox-70000000-0000-4000-8000-000000000001', repeat('p', 40), now() + interval '1 hour');

create function pg_temp.login(p_uid text, p_aal text default 'aal2', p_step_up boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
    'amr', jsonb_build_array(case when p_step_up then jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)
                                  else jsonb_build_object('method', 'password', 'timestamp', 1) end))::text, true);
end $$;
grant execute on function pg_temp.login(text, text, boolean) to authenticated, anon;
create function pg_temp.hx(p_req text, p_grant text) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('requestId', p_req), jsonb_build_array('grantId', p_grant)))
$$;
grant execute on function pg_temp.hx(text, text) to authenticated, anon;

-- Privilegios ---------------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api' and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname in ('execute_correction_request', 'get_execution_subject', 'issue_email_change', 'finish_email_change', 'finish_deletion', 'fail_correction_request', 'worker_purge_expired')), 0,
  'anon no ejecuta ninguna RPC de ejecución ni de purga');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'api'::regnamespace and p.prosecdef and pg_get_userbyid(p.proowner) <> 'app_privileged'
  and p.proname in ('execute_correction_request', 'get_execution_subject', 'issue_email_change', 'finish_email_change', 'finish_deletion', 'fail_correction_request', 'worker_purge_expired')), 0,
  'son DEFINER de app_privileged, no de postgres');

-- Ejecución: controles del llamador ---------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', false);
select is(api.execute_correction_request('clave-ejecuta-0001', pg_temp.hx('90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001') ->> 'kind', 'step_up_required', 'ejecutar exige step-up');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal1', true);
select is(api.execute_correction_request('clave-ejecuta-0001', pg_temp.hx('90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001') ->> 'kind', 'mfa_required', 'y AAL2');
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2', true);
select is(api.execute_correction_request('clave-ejecuta-0001', pg_temp.hx('90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001') ->> 'kind', 'forbidden', 'un donante no ejecuta');
select pg_temp.login('00000000-0000-4000-8000-0000000000b2', 'aal2', true);
select is(api.execute_correction_request('clave-ejecuta-0001', pg_temp.hx('90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001') ->> 'kind', 'forbidden', 'el grant de otro superadmin no sirve');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.execute_correction_request('clave-ejecuta-0001', pg_temp.hx('90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006'),
  '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006') ->> 'kind', 'forbidden', 'un grant de revisión no ejecuta');
select is(api.execute_correction_request('clave-ejecuta-0001', pg_temp.hx('90000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'),
  '90000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001') ->> 'kind', 'forbidden', 'ni un grant de otra solicitud');
select is(api.execute_correction_request('clave-ejecuta-0001', repeat('0', 64),
  '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001') ->> 'kind', 'invalid', 'un hash que no coincide es invalid');
select is(api.execute_correction_request('clave-ejecuta-0005', pg_temp.hx('90000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005'),
  '90000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005') ->> 'kind', 'conflict', 'ejecutar sin aprobación es conflict');
reset role;
update app.access_grants set expires_at = now() - interval '1 second', created_at = now() - interval '1 minute' where grant_id = 'a0000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.execute_correction_request('clave-ejecuta-0004', pg_temp.hx('90000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004'),
  '90000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004') ->> 'kind', 'gone', 'un grant vencido es gone');
reset role;
select is((select count(*)::int from app.correction_requests where status = 'en_ejecucion'), 0, 'ninguno de los rechazos movió una solicitud');

-- Corrección de nombre y grupo ----------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.execute_correction_request('clave-ejecuta-0001', pg_temp.hx('90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001') #>> '{request,status}', 'completada', 'la corrección de nombre y grupo se completa');
select is(api.execute_correction_request('clave-ejecuta-0001', pg_temp.hx('90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001') ->> 'kind', 'replayed', 'el replay devuelve lo guardado');
select is(api.execute_correction_request('clave-ejecuta-0009', pg_temp.hx('90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  '90000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001') ->> 'kind', 'conflict', 'otra clave sobre la ya ejecutada es conflict');
reset role;
select is((select name || '/' || declared_blood_type from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000a1'), 'Nombre Nuevo/A_POS', 'el perfil cambió');
select is((select count(*)::int from app.audit_events where event = 'solicitud.ejecutada' and resource_id = '90000000-0000-4000-8000-000000000001'), 1, 'se audita una sola vez');
select is((select count(*)::int from app.audit_events where reason like '%Nombre%' or event like '%Nombre%'), 0, 'la auditoría no lleva valores personales');

-- Cambio de correo ----------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.execute_correction_request('clave-ejecuta-0002', pg_temp.hx('90000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002'),
  '90000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002') ->> 'next', 'email', 'el cambio de correo queda en ejecución hasta verificar el enlace');
select is(api.get_execution_subject('90000000-0000-4000-8000-000000000002') ->> 'kind', 'forbidden', 'el superadmin no obtiene el correo cifrado');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.get_execution_subject('90000000-0000-4000-8000-000000000002') ->> 'proposedEmailSealed', repeat('s', 40), 'la técnica sí recibe el correo cifrado');
select is(api.get_execution_subject('90000000-0000-4000-8000-000000000001') ->> 'kind', 'conflict', 'una solicitud que no está en ejecución es conflict');
select is(api.issue_email_change('90000000-0000-4000-8000-000000000002', repeat('2', 64), repeat('t', 40), '70000000-0000-4000-8000-000000000002', repeat('q', 40)) ->> 'kind', 'ok', 'emite el enlace');
select is(api.issue_email_change('90000000-0000-4000-8000-000000000002', repeat('3', 64), repeat('t', 40), '70000000-0000-4000-8000-000000000003', repeat('q', 40)) ->> 'kind', 'ok', 'reemitir es idempotente');
select is(api.issue_email_change('90000000-0000-4000-8000-000000000001', repeat('4', 64), repeat('t', 40), '70000000-0000-4000-8000-000000000004', repeat('q', 40)) ->> 'kind', 'conflict', 'solo una solicitud de correo en ejecución emite');
select is(api.issue_email_change('90000000-0000-4000-8000-000000000002', 'no-hex', repeat('t', 40), '70000000-0000-4000-8000-000000000005', repeat('q', 40)) ->> 'kind', 'invalid', 'un hash inválido es invalid');
reset role;
select is((select count(*)::int from app.action_tokens where kind = 'cambio_email' and subject_id = '00000000-0000-4000-8000-0000000000a2'), 1, 'un solo token de cambio de correo');
select is((select count(*)::int from app.email_outbox where kind = 'cambio_email' and recipient_user_id is null and status = 'pendiente'), 1, 'y un solo correo, sin destinatario en claro en la base');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.consume_email_change(repeat('2', 64)) ->> 'kind', 'ok', 'F5 consume el enlace');
select is(api.finish_email_change(repeat('2', 64), true) ->> 'kind', 'ok', 'el cierre se registra');
select is(api.finish_email_change(repeat('2', 64), true) ->> 'kind', 'ok', 'y es idempotente');
reset role;
select is((select status from app.correction_requests where request_id = '90000000-0000-4000-8000-000000000002'), 'completada', 'la solicitud queda completada');

-- Eliminación -------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.execute_correction_request('clave-ejecuta-0003', pg_temp.hx('90000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003'),
  '90000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003') ->> 'next', 'deletion', 'la eliminación pasa a ejecución y pide cerrar con el borrado de Auth');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.get_execution_subject('90000000-0000-4000-8000-000000000003') ->> 'donorId', '00000000-0000-4000-8000-0000000000a3', 'la técnica obtiene el donante a borrar');
select is(api.finish_deletion('90000000-0000-4000-8000-000000000003', repeat('a', 64)) ->> 'kind', 'conflict', 'no se cierra mientras el usuario siga existiendo');
select is(api.finish_deletion('90000000-0000-4000-8000-000000000003', 'no-hex') ->> 'kind', 'invalid', 'el HMAC debe ser hex');
reset role;
select is((select is_available from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000a3'), false, 'el donante deja de estar disponible de inmediato');
select is((select status from app.email_outbox where outbox_id = '70000000-0000-4000-8000-000000000001'), 'cancelado', 'se cancela su correo pendiente');
select is((select sealed_payload from app.email_outbox where outbox_id = '70000000-0000-4000-8000-000000000001'), null, 'con el payload destruido');
select is((select invalidated_at is not null from app.action_tokens where token_hash = repeat('1', 64)), true, 'y se anulan sus tokens');
delete from auth.users where id = '00000000-0000-4000-8000-0000000000a3';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.finish_deletion('90000000-0000-4000-8000-000000000003', repeat('a', 64)) ->> 'kind', 'ok', 'borrado el usuario de Auth, se cierra');
select is(api.finish_deletion('90000000-0000-4000-8000-000000000003', repeat('a', 64)) ->> 'kind', 'ok', 'y repetir no hace nada más');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.fail_correction_request('90000000-0000-4000-8000-000000000003') ->> 'kind', 'forbidden', 'el superadmin no marca fallos a mano');
reset role;
select is((select count(*)::int from app.deletion_ledger where subject_hmac = repeat('a', 64)), 1, 'el ledger guarda una constancia con solo el HMAC');
select is((select donor_id is null and status = 'completada' from app.correction_requests where request_id = '90000000-0000-4000-8000-000000000003'), true, 'la solicitud queda anónima');

-- Fallo y recuperación --------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
reset role;
update app.access_grants set expires_at = now() + interval '5 minutes', created_at = now() where grant_id = 'a0000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.execute_correction_request('clave-ejecuta-0004', pg_temp.hx('90000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004'),
  '90000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004') ->> 'next', 'deletion', 'segunda eliminación en ejecución');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.fail_correction_request('90000000-0000-4000-8000-000000000004') ->> 'kind', 'ok', 'la técnica la marca fallida si Auth no pudo borrar');
reset role;
select is((select status from app.correction_requests where request_id = '90000000-0000-4000-8000-000000000004'), 'fallida', 'queda fallida');

-- Purgas del worker ----------------------------------------------------------------------------------------------------------------
reset role;
insert into app.idempotency_records (actor_ref, operation, idem_key, payload_hash, status, completed_at, terminal_at, created_at) values
  ('user:00000000-0000-4000-8000-0000000000b1', 'viejaOperacion', 'clave-vieja-000001', repeat('1', 64), 'completado', now() - interval '80 hours', now() - interval '80 hours', now() - interval '81 hours'),
  ('user:00000000-0000-4000-8000-0000000000b1', 'recienteOperacion', 'clave-nueva-000001', repeat('2', 64), 'completado', now(), now(), now());
insert into app.action_tokens (token_hash, kind, subject_id, expires_at, created_at) values
  (repeat('7', 64), 'recuperacion', '00000000-0000-4000-8000-0000000000b1', now() - interval '25 hours', now() - interval '26 hours'),
  (repeat('8', 64), 'recuperacion', '00000000-0000-4000-8000-0000000000b1', now() - interval '2 hours', now() - interval '3 hours');
insert into app.rate_limit_events (bucket, subject, occurred_at) values ('login:ip', repeat('a', 64), now() - interval '2 days'), ('login:ip', repeat('b', 64), now());
insert into app.assisted_signups (hospital_id, email, name, status, activation_expires_at, purge_at, created_at)
select h, 'sin-reclamar@example.test', null, 'vencida', now() - interval '29 days', now() - interval '1 hour', now() - interval '31 days'
from (select hospital_id h from app.hospitals limit 1) x;
insert into app.correction_requests (request_id, donor_id, type, requested_fields, proposed_email_sealed, status, updated_at) values
  ('90000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000a2', 'correccion', array['email'], repeat('s', 40), 'en_ejecucion', now() - interval '20 minutes');
insert into app.correction_requests (request_id, donor_id, type, requested_fields, status, updated_at) values
  ('90000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000e1', 'eliminacion', array['deletion'], 'en_ejecucion', now() - interval '20 minutes');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.worker_purge_expired() ->> 'kind', 'forbidden', 'la técnica no purga: solo el worker');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.worker_purge_expired() ->> 'kind', 'forbidden', 'ni un superadmin');
select pg_temp.login('00000000-0000-4000-8000-0000000000c2', 'aal1');
create temp table purge as select api.worker_purge_expired() as r;
grant select on purge to authenticated;
select is((select (r -> 'purged' ->> 'idempotencyRecords')::int from purge), 1, 'purga solo la clave terminal de hace más de 72 h');
select is((select (r -> 'purged' ->> 'actionTokens')::int from purge), 1, 'purga solo el token vencido hace más de 24 h');
select is((select (r -> 'purged' ->> 'rateLimitEvents')::int from purge), 1, 'purga solo los eventos de más de un día');
select is((select (r -> 'purged' ->> 'assistedSignups')::int from purge), 1, 'purga solo el alta sin reclamar pasada su fecha');
select ok(not (select r ? 'staleAccounts' from purge), 'ya no devuelve cuentas vencidas: las borra api.worker_purge_auth_accounts (P-12 b2)');
select is((select r -> 'pendingDeletions' -> 0 ->> 'requestId' from purge), '90000000-0000-4000-8000-000000000011', 'lista la eliminación que solo necesita el ledger');
select is((select (r ->> 'failedRequests')::int from purge), 1, 'y marca fallido el cambio de correo que no emitió enlace');
select is(api.worker_purge_expired() -> 'purged', '{"actionTokens": 0, "accessGrants": 0, "assistedSignups": 0, "rateLimitEvents": 0, "idempotencyRecords": 0}'::jsonb, 'una segunda pasada no encuentra nada');
reset role;
select is((select status from app.correction_requests where request_id = '90000000-0000-4000-8000-000000000010'), 'fallida', 'la solicitud de correo quedó fallida');
select is((select count(*)::int from app.idempotency_records where operation = 'recienteOperacion'), 1, 'la clave reciente sigue ahí');
select is((select count(*)::int from app.action_tokens where token_hash = repeat('8', 64)), 1, 'y el token vencido hace menos de 24 h también');

select * from finish();
rollback;
