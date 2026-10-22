begin;
-- ADR-007: barrera de sesión tras el reset de contraseña. Todo se revierte con el rollback.
truncate app.action_tokens, app.email_outbox, app.correction_requests, app.donor_profiles, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(95);

insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000005a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'barrier-u@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000005a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'barrier-admin@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000005a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'barrier-tech@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000005a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'barrier-plain@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000005a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'barrier-verify@example.test', now() - interval '1 day');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000005a1', 'donante', null),
  ('00000000-0000-4000-8000-0000000005a2', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000005a3', 'api_technical', null),
  ('00000000-0000-4000-8000-0000000005a4', 'donante', null),
  ('00000000-0000-4000-8000-0000000005a5', 'donante', null);
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-0000000005a1', 'Hospital Barrera', 'Hospital Barrera S.A.', true);
insert into app.hospital_memberships (user_id, hospital_id, status, email_hint) values
  ('00000000-0000-4000-8000-0000000005a2', '10000000-0000-4000-8000-0000000005a1', 'activa', 'a***@example.test');
insert into app.donor_profiles (donor_id, status, email_verified_at, password_setup_required) values
  ('00000000-0000-4000-8000-0000000005a1', 'incompleto', now(), true),
  ('00000000-0000-4000-8000-0000000005a4', 'incompleto', now(), false);
insert into app.donor_profiles (donor_id, status, email_verified_at) values
  ('00000000-0000-4000-8000-0000000005a5', 'pendiente_verificacion', null);
insert into app.correction_requests (request_id, donor_id, type, requested_fields, proposed_name) values
  ('90000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005a1', 'correccion', array['name'], 'Nombre Previo');
insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values
  (repeat('a', 64), 'recuperacion', '00000000-0000-4000-8000-0000000005a1', now() + interval '1 hour'),
  (repeat('b', 64), 'verificacion_email', '00000000-0000-4000-8000-0000000005a5', now() + interval '1 hour');

-- Sesiones: S1 (registrante, anterior al reset), S2 (dueño, admitida), SA1 (admin), SN (sin barrera), SV (registrante a verificar).
create function pg_temp.login(p_uid text, p_sid text default null, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)))
    || case when p_sid is null then '{}'::jsonb else jsonb_build_object('session_id', p_sid) end)::text, true);
end $$;
grant execute on function pg_temp.login(text, text, text) to authenticated, anon;
create function pg_temp.tech() returns void language sql as $$ select pg_temp.login('00000000-0000-4000-8000-0000000005a3') $$;
grant execute on function pg_temp.tech() to authenticated;
create function pg_temp.as_u(p_sid text) returns void language sql as $$ select pg_temp.login('00000000-0000-4000-8000-0000000005a1', p_sid) $$;
grant execute on function pg_temp.as_u(text) to authenticated;
create function pg_temp.onboarding_hash(p_name text, p_blood text, p_available boolean, p_lat numeric, p_lon numeric) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('name', p_name), jsonb_build_array('declaredBloodType', p_blood),
    jsonb_build_array('isAvailable', p_available), jsonb_build_array('latitude', p_lat), jsonb_build_array('longitude', p_lon)))
$$;
grant execute on function pg_temp.onboarding_hash(text, text, boolean, numeric, numeric) to authenticated;
create function pg_temp.onboard(p_key text) returns text language sql as $$
  select api.complete_own_onboarding(p_key, pg_temp.onboarding_hash('Ana Prueba', 'O_POS', true, -12.046, -77.043), 'Ana Prueba', 'O_POS', true, -12.046, -77.043, 'DEMO_ONLY-1') ->> 'kind'
$$;
grant execute on function pg_temp.onboard(text) to authenticated;
create function pg_temp.correction(p_key text, p_id uuid) returns text language sql as $$
  select api.create_own_correction_request(p_key, repeat('a', 64), p_id, 'correccion', 'Nombre Nuevo', null, null) ->> 'kind'
$$;
grant execute on function pg_temp.correction(text, uuid) to authenticated;
create function pg_temp.upd() returns int language plpgsql as $$
declare n int;
begin
  update app.donor_profiles set name = 'Intruso' where donor_id = '00000000-0000-4000-8000-0000000005a1';
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function pg_temp.upd() to authenticated;
create temp table tk (name text primary key, id uuid);
grant all on tk to authenticated;

-- Compatibilidad (10): sin barrera nada cambia -----------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000005a4', 'a0000000-0000-4000-8000-0000000000e1');
select is(pg_temp.correction('clave-barrera-0001', '90000000-0000-4000-8000-0000000005b1'), 'created', 'sin barrera, la sesión de un donante sigue operando');
select is(api.current_actor() ->> 'role', 'donante', 'y current_actor responde');
select pg_temp.as_u('a0000000-0000-4000-8000-000000000001');
select is(api.current_actor() ->> 'role', 'donante', 'el registrante con la contraseña pendiente (aún sin barrera) opera');

-- Reset de contraseña de U (1, 6, 7, 8) -----------------------------------------------------------------------
select pg_temp.tech();
create temp table late as select api.issue_login_ticket('Barrier-U@example.test') as r;
grant select on late to authenticated;
insert into tk select 'late', (r ->> 'ticketId')::uuid from late;
select is((select r ->> 'kind' from late), 'ok', 'la técnica emite un ticket antes del reset');
create temp table cons as select api.consume_password_reset(repeat('a', 64)) as r;
grant select on cons to authenticated;
select is((select r ->> 'kind' || '|' || (r ->> 'userId') || '|' || (r ->> 'generation') from cons), 'ok|00000000-0000-4000-8000-0000000005a1|1',
  'consume_password_reset abre la barrera y devuelve la generación 1');
insert into tk select 'open7', (api.issue_login_ticket('barrier-u@example.test') ->> 'ticketId')::uuid;
insert into tk select 'open8', (api.issue_login_ticket('barrier-u@example.test') ->> 'ticketId')::uuid;
select is(api.confirm_password_setup('00000000-0000-4000-8000-0000000005a1') ->> 'kind', 'ok', 'la técnica levanta el bloqueo de contraseña');
select is(api.admit_session((select id from tk where name = 'open8'), '00000000-0000-4000-8000-0000000005a1', 'a0000000-0000-4000-8000-000000000002') ->> 'kind',
  'conflict', 'con la barrera abierta ningún ticket admite una sesión');
-- 8: el reset no terminó -> falla cerrado
select pg_temp.as_u('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.onboard('clave-barrera-0002'), 'unauthenticated', 'con la barrera abierta la sesión anterior no completa el perfil (aunque se levantó el bloqueo)');
select is(api.current_actor(), null, 'con la barrera abierta current_actor es null');
select is(pg_temp.correction('clave-barrera-0003', '90000000-0000-4000-8000-0000000005b2'), 'unauthenticated', 'ni crea solicitudes');
select pg_temp.tech();
select is(api.close_session_barrier('00000000-0000-4000-8000-0000000005a1', 1) ->> 'kind', 'ok', 'la técnica cierra la barrera de la generación 1');
select is(api.close_session_barrier('00000000-0000-4000-8000-0000000005a1', 1) ->> 'kind', 'ok', 'cerrar de nuevo la misma generación es ok (reintento)');
select is(api.close_session_barrier('00000000-0000-4000-8000-0000000005a1', 2) ->> 'kind', 'conflict', 'otra generación es conflict');
select is(api.close_session_barrier('00000000-0000-4000-8000-0000000005a2', 1) ->> 'kind', 'conflict', 'un usuario sin barrera es conflict');

-- 1: tras consume + confirm + close, la sesión anterior sigue denegada ---------------------------------------
select pg_temp.as_u('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.onboard('clave-barrera-0004'), 'unauthenticated', 'cerrada la barrera, S1 no completa el perfil de la cuenta (antes: ok)');
-- 3
select is(api.current_actor(), null, 'S1: current_actor devuelve null');
-- 2: RLS directa con S1
select is((select count(*)::int from app.donor_profiles), 0, 'S1 no lee donor_profiles');
select is((select count(*)::int from app.user_accounts), 0, 'S1 no lee user_accounts');
select is((select count(*)::int from app.correction_requests), 0, 'S1 no lee correction_requests');
select is(pg_temp.upd(), 0,
  'S1 no actualiza donor_profiles');
select throws_ok($$insert into app.correction_requests (request_id, donor_id, type, requested_fields) values (gen_random_uuid(), '00000000-0000-4000-8000-0000000005a1', 'correccion', array['name'])$$,
  '42501', null, 'S1 no inserta correction_requests');
select throws_ok($$insert into app.audit_events (actor_id, actor_kind, event, result) values ('00000000-0000-4000-8000-0000000005a1', 'usuario', 'pgtap.evento', 'ok')$$,
  '42501', null, 'S1 no inserta audit_events');
select throws_ok($$insert into app.idempotency_records (actor_ref, operation, idem_key, payload_hash, status) values ('user:00000000-0000-4000-8000-0000000005a1', 'op', 'clave-idempotente-01', repeat('a', 64), 'en_curso')$$,
  '42501', null, 'S1 no inserta idempotency_records');

-- 6 y 7: la emisión tardía y el ticket de barrera abierta no admiten ------------------------------------------
select pg_temp.tech();
select is(api.admit_session((select id from tk where name = 'late'), '00000000-0000-4000-8000-0000000005a1', 'a0000000-0000-4000-8000-000000000003') ->> 'kind',
  'conflict', 'un ticket emitido antes del reset no admite tras el cierre');
select is(api.admit_session((select id from tk where name = 'open7'), '00000000-0000-4000-8000-0000000005a1', 'a0000000-0000-4000-8000-000000000003') ->> 'kind',
  'conflict', 'un ticket emitido con la barrera abierta no admite aunque después se cierre');

-- 5: ticket posterior al cierre ---------------------------------------------------------------------------------
insert into tk select 'good', (api.issue_login_ticket('BARRIER-U@example.test') ->> 'ticketId')::uuid;
insert into tk select 'good2', (api.issue_login_ticket('barrier-u@example.test') ->> 'ticketId')::uuid;
insert into tk select 'stale', (api.issue_login_ticket('barrier-u@example.test') ->> 'ticketId')::uuid;
insert into tk select 'other', (api.issue_login_ticket('barrier-plain@example.test') ->> 'ticketId')::uuid;
select is(api.admit_session((select id from tk where name = 'other'), '00000000-0000-4000-8000-0000000005a1', 'a0000000-0000-4000-8000-000000000004') ->> 'kind',
  'conflict', '13: un ticket ajeno (user_id distinto) es conflict');
select is(api.admit_session((select id from tk where name = 'good'), '00000000-0000-4000-8000-0000000005a1', 'a0000000-0000-4000-8000-000000000002') ->> 'kind',
  'ok', 'el ticket emitido tras el cierre admite la sesión S2');
select is(api.admit_session((select id from tk where name = 'good'), '00000000-0000-4000-8000-0000000005a1', 'a0000000-0000-4000-8000-000000000005') ->> 'kind',
  'conflict', '13: un ticket reutilizado es conflict');
select is(api.admit_session(gen_random_uuid(), '00000000-0000-4000-8000-0000000005a1', 'a0000000-0000-4000-8000-000000000005') ->> 'kind',
  'conflict', 'un ticket inexistente es conflict');
reset role;
update app.login_tickets set created_at = now() - interval '3 minutes' where ticket_id = (select id from tk where name = 'stale');
set local role authenticated;
select pg_temp.tech();
select is(api.admit_session((select id from tk where name = 'stale'), '00000000-0000-4000-8000-0000000005a1', 'a0000000-0000-4000-8000-000000000006') ->> 'kind',
  'conflict', '13: un ticket de más de 2 minutos es conflict');
select pg_temp.as_u('a0000000-0000-4000-8000-000000000002');
select is(pg_temp.onboard('clave-barrera-0005'), 'ok', 'S2 admitida completa el perfil');
select is(api.current_actor() ->> 'role', 'donante', 'S2: current_actor responde');
select is((select count(*)::int from app.donor_profiles), 1, 'S2 lee su perfil');
select lives_ok($$insert into app.audit_events (actor_id, actor_kind, event, result) values ('00000000-0000-4000-8000-0000000005a1', 'usuario', 'pgtap.evento', 'ok')$$, 'S2 inserta audit_events');
select lives_ok($$insert into app.idempotency_records (actor_ref, operation, idem_key, payload_hash, status) values ('user:00000000-0000-4000-8000-0000000005a1', 'op', 'clave-idempotente-01', repeat('a', 64), 'en_curso')$$, 'S2 inserta idempotency_records');
select pg_temp.as_u('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.correction('clave-barrera-0006', '90000000-0000-4000-8000-0000000005b3'), 'unauthenticated', 'S1 sigue denegada con S2 admitida');

-- 11: session_id ausente, mal formado o en mayúsculas ---------------------------------------------------------------
select pg_temp.as_u(null);
select is(pg_temp.correction('clave-barrera-0007', '90000000-0000-4000-8000-0000000005b4'), 'unauthenticated', 'sin session_id con barrera cerrada: denegado');
select pg_temp.as_u('no-es-un-uuid');
select is(pg_temp.correction('clave-barrera-0008', '90000000-0000-4000-8000-0000000005b5'), 'unauthenticated', 'session_id mal formado: denegado sin error SQL');
select pg_temp.as_u(upper('a0000000-0000-4000-8000-000000000002'));
select isnt(pg_temp.correction('clave-barrera-0009', '90000000-0000-4000-8000-0000000005b6'), 'unauthenticated', 'el session_id se compara sin distinguir mayúsculas');

-- 4: admin con barrera y sesión no admitida (rutas d_require y require) -----------------------------------------------
reset role;
select app.open_session_barrier('00000000-0000-4000-8000-0000000005a2');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000005a2', 'a0000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.create_assisted_signup('clave-barrera-0010', repeat('0', 64), 'nuevo@example.test', null) ->> 'kind', 'unauthenticated', 'create_assisted_signup (d_require): unauthenticated');
select is(api.list_own_needs(10) ->> 'kind', 'unauthenticated', 'list_own_needs (require): unauthenticated');
select is((select count(*)::int from app.hospital_memberships), 0, 'el admin no admitido no lee hospital_memberships');
select is((select count(*)::int from app.hospitals), 0, 'ni hospitals (por membresía)');

-- 9: verify_donor_email abre la barrera --------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000005a5', 'a0000000-0000-4000-8000-0000000000b1');
select isnt(pg_temp.correction('clave-barrera-0011', '90000000-0000-4000-8000-0000000005b7'), 'unauthenticated', 'antes de verificar el correo la sesión del registrante opera');
select pg_temp.tech();
select is(api.verify_donor_email(repeat('b', 64)) ->> 'passwordSetupRequired', 'true', 'verificar el correo exige fijar la contraseña');
select pg_temp.login('00000000-0000-4000-8000-0000000005a5', 'a0000000-0000-4000-8000-0000000000b1');
select is(pg_temp.correction('clave-barrera-0012', '90000000-0000-4000-8000-0000000005b8'), 'unauthenticated', 'tras verificar, la sesión del registrante recibe unauthenticated');
reset role;
select is((select generation::text || state from app.session_barriers where user_id = '00000000-0000-4000-8000-0000000005a5'), '1abierta', 'y la barrera queda abierta en la generación 1');

-- ADR-007 §2: la barrera tabla por tabla (needs, sites, hospitals, assisted_signups, configuration, audit_events, access_grants) -----
reset role;
insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000005a6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'barrier-super@example.test', now() - interval '1 day');
insert into app.user_accounts (user_id, role, display_name) values ('00000000-0000-4000-8000-0000000005a6', 'superadmin', null);
update app.hospitals set is_authorized = true where hospital_id = '10000000-0000-4000-8000-0000000005a1';
insert into app.sites (site_id, hospital_id, public_name, public_address, latitude, longitude, is_active, is_approved) values
  ('20000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000005a1', 'Sede Barrera', 'Calle Falsa 123', -12.046, -77.043, true, true);
insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, expires_at) values
  ('30000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000005a1', '20000000-0000-4000-8000-0000000005a1',
   '00000000-0000-4000-8000-0000000005a2', 'RBC', 'O_NEG', 5, 10, 'Urgente', now() + interval '12 hours');
insert into app.assisted_signups (signup_id, hospital_id, email, activation_expires_at, purge_at) values
  ('40000000-0000-4000-8000-0000000005a1', '10000000-0000-4000-8000-0000000005a1', 'alta-barrera@example.test', now() + interval '1 day', now() + interval '30 days');
insert into app.access_grants (grant_id, superadmin_id, request_id, action, allowed_fields, reason, expires_at) values
  ('50000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005a6', '90000000-0000-4000-8000-0000000005a1', 'review', array['name'], 'prueba pgTAP', now() + interval '5 minutes');
select app.open_session_barrier('00000000-0000-4000-8000-0000000005a6');
-- El admin (a2) ya tiene la barrera abierta desde el caso 4.

-- Admin con barrera y sesión NO admitida: ve 0 filas y no inserta
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000005a2', 'a0000000-0000-4000-8000-0000000000a1', 'aal2');
select is((select count(*)::int from app.needs), 0, 'tabla needs: el admin no admitido no lee');
select is((select count(*)::int from app.sites), 0, 'tabla sites (política de miembro): no lee');
select is((select count(*)::int from app.assisted_signups), 0, 'tabla assisted_signups: no lee');
select throws_ok($$insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, expires_at)
  values ('10000000-0000-4000-8000-0000000005a1', '20000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-0000000005a2', 'RBC', 'O_NEG', 5, 10, 'Urgente', now() + interval '12 hours')$$,
  '42501', null, 'tabla needs: el admin no admitido no inserta');

-- Superadmin con barrera y sesión NO admitida
select pg_temp.login('00000000-0000-4000-8000-0000000005a6', 'a0000000-0000-4000-8000-0000000000c1', 'aal2');
select is((select count(*)::int from app.configuration), 0, 'tabla configuration: el superadmin no admitido no lee');
select is((select count(*)::int from app.sites), 0, 'tabla sites (política de superadmin): no lee');
select is((select count(*)::int from app.audit_events), 0, 'tabla audit_events (select de superadmin): no lee');
select is((select count(*)::int from app.access_grants), 0, 'tabla access_grants: no lee');
select is((select count(*)::int from app.hospital_memberships), 0, 'tabla hospital_memberships (política de superadmin): no lee');
select is((select count(*)::int from app.hospitals), 0, 'tabla hospitals (política de superadmin): no lee');
select throws_ok($$insert into app.sites (hospital_id, public_name, public_address, latitude, longitude) values ('10000000-0000-4000-8000-0000000005a1', 'Intrusa', 'x', 0, 0)$$,
  '42501', null, 'tabla sites: el superadmin no admitido no inserta');
select is(api.create_hospital('clave-barrera-0020', repeat('0', 64), 'H', 'H') ->> 'kind', 'unauthenticated', 'RPC de superadmin con sesión no admitida: unauthenticated');

-- Controles: con la barrera cerrada y la sesión admitida las mismas lecturas funcionan
reset role;
update app.session_barriers set state = 'cerrada' where user_id in ('00000000-0000-4000-8000-0000000005a2', '00000000-0000-4000-8000-0000000005a6');
insert into app.admitted_sessions (session_id, user_id, generation)
select 'a0000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000005a2', generation from app.session_barriers where user_id = '00000000-0000-4000-8000-0000000005a2';
insert into app.admitted_sessions (session_id, user_id, generation)
select 'a0000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000005a6', generation from app.session_barriers where user_id = '00000000-0000-4000-8000-0000000005a6';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000005a2', 'a0000000-0000-4000-8000-0000000000a1', 'aal2');
select is((select count(*)::int from app.needs), 1, 'control: el admin admitido lee needs');
select is((select count(*)::int from app.sites), 1, 'control: el admin admitido lee sites');
select is((select count(*)::int from app.assisted_signups), 1, 'control: el admin admitido lee assisted_signups');
select pg_temp.login('00000000-0000-4000-8000-0000000005a6', 'a0000000-0000-4000-8000-0000000000c1', 'aal2');
select is((select count(*)::int from app.configuration), 1, 'control: el superadmin admitido lee configuration');
select is((select count(*)::int from app.sites), 1, 'control: el superadmin admitido lee sites');
select isnt((select count(*)::int from app.audit_events), 0, 'control: el superadmin admitido lee audit_events');
select is((select count(*)::int from app.access_grants), 1, 'control: el superadmin admitido lee access_grants');

-- Defensa en profundidad: link_admin_account exige sesión admitida
select pg_temp.login('00000000-0000-4000-8000-0000000005a5', 'a0000000-0000-4000-8000-0000000000b1');
select is(api.link_admin_account(repeat('c', 64), 'clave-link-0000001', app.fingerprint(jsonb_build_array(jsonb_build_array('tokenHash', repeat('c', 64))))) ->> 'kind', 'unauthenticated',
  'link_admin_account con barrera y sesión no admitida: unauthenticated');
select pg_temp.login('00000000-0000-4000-8000-0000000005a4', 'a0000000-0000-4000-8000-0000000000e1');
select isnt(api.link_admin_account(repeat('c', 64), 'clave-link-0000002', app.fingerprint(jsonb_build_array(jsonb_build_array('tokenHash', repeat('c', 64))))) ->> 'kind', 'unauthenticated',
  'control: sin barrera link_admin_account sigue su camino (no_found)');

-- 12: privilegios y estructura -------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000005a4', 'a0000000-0000-4000-8000-0000000000e1');
select is(api.issue_login_ticket('barrier-u@example.test') ->> 'kind', 'forbidden', 'un donante no emite tickets');
select is(api.admit_session(gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) ->> 'kind', 'forbidden', 'ni admite sesiones');
select is(api.close_session_barrier('00000000-0000-4000-8000-0000000005a1', 1) ->> 'kind', 'forbidden', 'ni cierra barreras');
select pg_temp.login('00000000-0000-4000-8000-0000000005a2', 'a0000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.issue_login_ticket('barrier-u@example.test') ->> 'kind', 'forbidden', 'un admin no emite tickets');
select is(api.admit_session(gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) ->> 'kind', 'forbidden', 'ni admite sesiones');
select is(api.close_session_barrier('00000000-0000-4000-8000-0000000005a1', 1) ->> 'kind', 'forbidden', 'ni cierra barreras');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is(api.issue_login_ticket('barrier-u@example.test') ->> 'kind', 'unauthenticated', 'sin sesión no se emiten tickets');
select is(api.admit_session(gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) ->> 'kind', 'unauthenticated', 'sin sesión no se admite');
select is(api.close_session_barrier('00000000-0000-4000-8000-0000000005a1', 1) ->> 'kind', 'unauthenticated', 'sin sesión no se cierra');
select pg_temp.tech();
select is(api.issue_login_ticket('no-es-correo') ->> 'kind', 'invalid', 'issue_login_ticket valida el correo');
select is(api.issue_login_ticket('desconocido@example.test') ->> 'kind', 'ok', 'y responde ok aunque la cuenta no exista (sin enumeración)');
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select api.issue_login_ticket('barrier-u@example.test')$$, '42501', null, 'anon no ejecuta issue_login_ticket');
select throws_ok($$select api.admit_session(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())$$, '42501', null, 'anon no ejecuta admit_session');
select throws_ok($$select api.close_session_barrier(gen_random_uuid(), 1)$$, '42501', null, 'anon no ejecuta close_session_barrier');
set local role authenticated;
select pg_temp.as_u('a0000000-0000-4000-8000-000000000002');
select is((select count(*)::int from app.session_barriers), 1, 'authenticated solo ve su propia barrera');
select is((select count(*)::int from app.admitted_sessions), 1, 'y solo sus propias sesiones admitidas');
select throws_ok($$select * from app.login_tickets$$, '42501', null, 'authenticated no lee login_tickets');
select throws_ok($$insert into app.session_barriers (user_id, generation, state) values ('00000000-0000-4000-8000-0000000005a4', 1, 'cerrada')$$, '42501', null, 'authenticated no escribe barreras');
select throws_ok($$update app.session_barriers set state = 'cerrada'$$, '42501', null, 'ni las actualiza');
select throws_ok($$delete from app.session_barriers$$, '42501', null, 'ni las borra');
select throws_ok($$insert into app.admitted_sessions (session_id, user_id, generation) values (gen_random_uuid(), '00000000-0000-4000-8000-0000000005a1', 1)$$, '42501', null, 'authenticated no se admite a sí mismo');
select throws_ok($$delete from app.admitted_sessions$$, '42501', null, 'ni borra admisiones');
select throws_ok($$insert into app.login_tickets (user_id, generation, barrier_open) values (null, 0, false)$$, '42501', null, 'ni crea tickets');
reset role;
select is((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('app.session_barriers'::regclass, 'app.admitted_sessions'::regclass, 'app.login_tickets'::regclass)), true, 'las tres tablas tienen RLS habilitada y forzada');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.proname in ('issue_login_ticket', 'admit_session', 'close_session_barrier')
    and p.prosecdef and pg_get_userbyid(p.proowner) = 'app_privileged'),
  array['admit_session', 'close_session_barrier', 'issue_login_ticket'], 'las tres RPC son DEFINER de app_privileged');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('api', 'app') and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'),
  array['user_email', 'user_id_by_email', 'worker_delete_inert_user', 'worker_revoke_sessions'], 'las DEFINER de postgres siguen siendo las cuatro');
select is(has_function_privilege('authenticated', 'app.open_session_barrier(uuid)', 'EXECUTE') or has_function_privilege('authenticated', 'app.d_session_admitted()', 'EXECUTE'), false,
  'authenticated no ejecuta los helpers de DEFINER');

select * from finish();
rollback;
