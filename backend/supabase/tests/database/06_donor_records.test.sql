begin;
-- Aislamiento: la base puede estar sembrada. Todo se revierte con el rollback.
truncate app.assisted_signups, app.donor_profiles, app.action_tokens, app.email_outbox, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(182);

insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-sin-membresia@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'donante-pendiente@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'donante-incompleto@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'donante-activo@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-f5-worker@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'recien-registrado@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ya-tiene-cuenta@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'huerfano-viejo@example.test', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'huerfano-joven@example.test', now()),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alta-reclamada@example.test', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro-correo@example.test', now() - interval '1 hour');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000a2', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000a3', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000b1', 'donante', null),
  ('00000000-0000-4000-8000-0000000000b2', 'donante', null),
  ('00000000-0000-4000-8000-0000000000b3', 'donante', null),
  ('00000000-0000-4000-8000-0000000000c1', 'api_technical', null),
  ('00000000-0000-4000-8000-0000000000d2', 'donante', null);
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-0000000000a1', 'Hospital Donantes Uno', 'Hospital Donantes Uno S.A.', true),
  ('10000000-0000-4000-8000-0000000000a2', 'Hospital Donantes Dos', 'Hospital Donantes Dos S.A.', true);
insert into app.hospital_memberships (user_id, hospital_id, status, email_hint) values
  ('00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 'activa', 'a***@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a2', 'activa', 'a***@example.test');
insert into app.donor_profiles (donor_id, status, email_verified_at) values
  ('00000000-0000-4000-8000-0000000000b1', 'pendiente_verificacion', null),
  ('00000000-0000-4000-8000-0000000000b2', 'incompleto', now());
insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at) values
  ('00000000-0000-4000-8000-0000000000b3', 'Donante Activo', 'O_POS', true, -12.046, -77.043, 'DEMO_ONLY-1', 'activo', now());

create function pg_temp.login(p_uid text, p_aal text default 'aal2', p_email text default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal, 'email', p_email, 'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)))::text, true);
end $$;
grant execute on function pg_temp.login(text, text, text) to authenticated, anon;

create function pg_temp.signup_hash(p_email text, p_name text) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('email', p_email), jsonb_build_array('name', p_name)))
$$;
grant execute on function pg_temp.signup_hash(text, text) to authenticated, anon;
create function pg_temp.id_hash(p_id uuid) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('signupId', p_id::text)))
$$;
grant execute on function pg_temp.id_hash(uuid) to authenticated, anon;
create function pg_temp.onboarding_hash(p_name text, p_blood text, p_available boolean, p_lat numeric, p_lon numeric) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('name', p_name), jsonb_build_array('declaredBloodType', p_blood),
    jsonb_build_array('isAvailable', p_available), jsonb_build_array('latitude', p_lat), jsonb_build_array('longitude', p_lon)))
$$;
grant execute on function pg_temp.onboarding_hash(text, text, boolean, numeric, numeric) to authenticated, anon;
create function pg_temp.part_hash(p_available boolean, p_lat numeric, p_lon numeric) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('isAvailable', p_available), jsonb_build_array('latitude', p_lat), jsonb_build_array('longitude', p_lon)))
$$;
grant execute on function pg_temp.part_hash(boolean, numeric, numeric) to authenticated, anon;

-- Estructura y privilegios -------------------------------------------------------------------------------
select is((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in ('app.donor_profiles'::regclass, 'app.assisted_signups'::regclass)), true,
  'las tablas de donantes y altas asistidas tienen RLS habilitada y forzada');
select is((select count(*)::int from (values ('app.donor_profiles'), ('app.assisted_signups')) t(name), (values ('insert'), ('delete')) p(priv),
  (values ('authenticated'), ('anon')) r(role) where has_table_privilege(r.role, t.name, p.priv)), 0, 'ni authenticated ni anon insertan ni borran en estas tablas');
select is(has_table_privilege('anon', 'app.donor_profiles', 'SELECT') or has_table_privilege('anon', 'app.assisted_signups', 'SELECT'), false, 'anon no lee ninguna');
select is(has_column_privilege('authenticated', 'app.assisted_signups', 'email', 'SELECT') or has_column_privilege('authenticated', 'app.assisted_signups', 'name', 'SELECT')
  or has_column_privilege('authenticated', 'app.assisted_signups', 'donor_id', 'SELECT'), false, 'el admin no puede leer correo, nombre ni donante de una alta');
select is(has_column_privilege('authenticated', 'app.assisted_signups', 'status', 'SELECT'), true, 'pero sí el estado operativo');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and has_function_privilege('anon', p.oid, 'EXECUTE') and p.proname in
  ('link_donor_account', 'get_donor_verification_preview', 'verify_donor_email', 'create_assisted_signup', 'list_own_assisted_signups', 'get_own_assisted_signup',
   'reissue_assisted_link', 'get_assisted_activation_preview', 'get_assisted_signup_recipient', 'link_assisted_account', 'get_own_donor_profile',
   'complete_own_onboarding', 'update_own_participation', 'get_email_change_preview', 'consume_email_change')), 0, 'anon no ejecuta ninguna RPC de donantes');

-- Registro: link_donor_account (solo la sesión técnica) ----------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select api.link_donor_account('00000000-0000-4000-8000-0000000000d1', repeat('1', 64), gen_random_uuid(), repeat('s', 40), 'email:' || repeat('a', 64), 'clave-registro-0001', repeat('b', 64))$$,
  '42501', null, 'anon no puede vincular cuentas');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal1');
select is(api.link_donor_account('00000000-0000-4000-8000-0000000000d1', repeat('1', 64), gen_random_uuid(), repeat('s', 40), 'email:' || repeat('a', 64), 'clave-registro-0001', repeat('b', 64)) ->> 'kind',
  'forbidden', 'un usuario autenticado cualquiera (no técnico) tampoco');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.link_donor_account('00000000-0000-4000-8000-0000000000d1', 'no-hex', gen_random_uuid(), repeat('s', 40), 'email:' || repeat('a', 64), 'clave-registro-0001', repeat('b', 64)) ->> 'kind',
  'invalid', 'un hash de token inválido es invalid');
select is(api.link_donor_account('00000000-0000-4000-8000-0000000000d1', repeat('1', 64), gen_random_uuid(), repeat('s', 40), 'sin-formato', 'clave-registro-0001', repeat('b', 64)) ->> 'kind',
  'invalid', 'y un actor de idempotencia inválido también');
select is(api.link_donor_account('00000000-0000-4000-8000-0000000000d1', repeat('1', 64), '70000000-0000-4000-8000-0000000000a1', repeat('s', 40), 'email:' || repeat('a', 64), 'clave-registro-0001', repeat('b', 64)),
  '{"kind": "ok"}'::jsonb, 'la técnica vincula una cuenta nueva');
select is(api.link_donor_account('00000000-0000-4000-8000-0000000000d1', repeat('2', 64), '70000000-0000-4000-8000-0000000000a2', repeat('s', 40), 'email:' || repeat('a', 64), 'clave-registro-0001', repeat('b', 64)),
  '{"kind": "ok"}'::jsonb, 'el reintento con la misma clave responde igual');
select is(api.link_donor_account('00000000-0000-4000-8000-0000000000d1', repeat('3', 64), '70000000-0000-4000-8000-0000000000a3', repeat('s', 40), 'email:' || repeat('a', 64), 'clave-registro-0001', repeat('c', 64)) ->> 'kind',
  'payload_conflict', 'la misma clave con otro payload es payload_conflict');
select is(api.link_donor_account('00000000-0000-4000-8000-0000000000d2', repeat('4', 64), '70000000-0000-4000-8000-0000000000a4', repeat('s', 40), 'email:' || repeat('d', 64), 'clave-registro-0002', repeat('e', 64)),
  '{"kind": "ok"}'::jsonb, 'una cuenta que ya existía responde ok (sin enumerar)');
select is(api.link_donor_account('00000000-0000-4000-8000-0000000000ff', repeat('5', 64), '70000000-0000-4000-8000-0000000000a5', repeat('s', 40), 'email:' || repeat('f', 64), 'clave-registro-0003', repeat('e', 64)),
  '{"kind": "ok"}'::jsonb, 'y un id de Auth inexistente también');
reset role;
select is((select count(*)::int from app.user_accounts where user_id = '00000000-0000-4000-8000-0000000000d1' and role = 'donante'), 1, 'solo se creó la cuenta nueva de donante');
select is((select status from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000d1'), 'pendiente_verificacion', 'con perfil pendiente de verificación');
select is((select count(*)::int from app.action_tokens where token_hash = repeat('1', 64) and kind = 'verificacion_email' and subject_id = '00000000-0000-4000-8000-0000000000d1'
  and expires_at between now() + interval '23 hours' and now() + interval '25 hours'), 1, 'y un token de verificación de 24 h');
select is((select count(*)::int from app.action_tokens where token_hash in (repeat('2', 64), repeat('3', 64), repeat('4', 64), repeat('5', 64))), 0, 'ni el reintento, ni el conflicto, ni la cuenta existente, ni el id inexistente crean tokens');
select is((select count(*)::int from app.email_outbox where outbox_id in ('70000000-0000-4000-8000-0000000000a1')), 1, 'se encoló un solo correo');
select is((select count(*)::int from app.email_outbox where outbox_id in ('70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-0000000000a3', '70000000-0000-4000-8000-0000000000a4', '70000000-0000-4000-8000-0000000000a5')), 0, 'y ninguno más');
select is((select count(*)::int from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000d2'), 0, 'la cuenta que ya existía no recibió un perfil nuevo');

-- Verificación de correo --------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal1');
select is(api.get_donor_verification_preview(repeat('1', 64)) ->> 'kind', 'forbidden', 'la vista previa de verificación no es para un usuario cualquiera');
select is(api.verify_donor_email(repeat('1', 64)) ->> 'kind', 'forbidden', 'ni consumirla');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.get_donor_verification_preview(repeat('1', 64)) ->> 'kind', 'ok', 'la técnica ve la vista previa');
select is(api.get_donor_verification_preview(repeat('9', 64)) ->> 'kind', 'not_found', 'un token desconocido es not_found');
select is(api.get_donor_verification_preview('no-hex') ->> 'kind', 'invalid', 'un token con formato inválido es invalid');
select is(api.verify_donor_email(repeat('1', 64)), '{"kind": "ok", "status": "incompleto", "emailVerified": true, "userId": "00000000-0000-4000-8000-0000000000d1", "email": "recien-registrado@example.test", "passwordSetupRequired": true}'::jsonb,
  'verificar deja el perfil incompleto con el correo verificado y exige fijar la contraseña (devuelve usuario y correo solo a la sesión técnica)');
select is(api.verify_donor_email(repeat('1', 64)) ->> 'kind', 'gone', 'el segundo consumo es gone');
select is(api.get_donor_verification_preview(repeat('1', 64)) ->> 'kind', 'gone', 'y la vista previa también');
reset role;
select is((select status from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000d1'), 'incompleto', 'el perfil quedó incompleto');
select is((select count(*)::int from app.audit_events where event = 'donante.correo_verificado' and resource_id = '00000000-0000-4000-8000-0000000000d1'), 1, 'se audita la verificación');
update app.action_tokens set expires_at = now() - interval '1 second', created_at = now() - interval '2 days' where token_hash = repeat('1', 64);
insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values (repeat('6', 64), 'recuperacion', '00000000-0000-4000-8000-0000000000d1', now() + interval '1 hour');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.verify_donor_email(repeat('6', 64)) ->> 'kind', 'not_found', 'un token de otro tipo no verifica el correo');
reset role;

-- Alta asistida: crear -------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b3', 'aal2');
select is(api.create_assisted_signup('clave-alta-00000001', pg_temp.signup_hash('uno@example.test', null), 'uno@example.test', null) ->> 'kind',
  'forbidden', 'un donante no crea altas asistidas');
select pg_temp.login('00000000-0000-4000-8000-0000000000a3', 'aal2');
select is(api.create_assisted_signup('clave-alta-00000001', pg_temp.signup_hash('uno@example.test', null), 'uno@example.test', null) ->> 'kind',
  'forbidden', 'un admin sin membresía vigente tampoco');
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal1');
select is(api.create_assisted_signup('clave-alta-00000001', pg_temp.signup_hash('uno@example.test', null), 'uno@example.test', null) ->> 'kind',
  'mfa_required', 'sin AAL2 se exige MFA');
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.create_assisted_signup('clave-alta-00000001', repeat('0', 64), 'uno@example.test', null) ->> 'kind',
  'invalid', 'un hash que no corresponde al payload es invalid');
select is(api.create_assisted_signup('clave-alta-00000001', pg_temp.signup_hash('Mayus@Example.test', null), 'Mayus@Example.test', null) ->> 'kind',
  'invalid', 'un correo que no está normalizado es invalid');
create temp table sig_one as select api.create_assisted_signup('clave-alta-00000001', pg_temp.signup_hash('uno@example.test', 'Persona Uno'), 'uno@example.test', 'Persona Uno') as r;
create temp table sig_exists as select api.create_assisted_signup('clave-alta-00000002', pg_temp.signup_hash('ya-tiene-cuenta@example.test', null), 'ya-tiene-cuenta@example.test', null) as r;
grant select on sig_one, sig_exists to authenticated;
select is(((select r from sig_one) ->> 'kind') || '|' || ((select r from sig_one) -> 'signup' ->> 'status') || '|' || ((select r from sig_one) ->> 'seq'), 'created|pendiente|1', 'el admin crea un alta pendiente (emisión 1)');
select is((select r -> 'signup' ->> 'purgeAt' from sig_one) > (select r -> 'signup' ->> 'activationExpiresAt' from sig_one), true, 'la purga es posterior al vencimiento de la activación');
select is((select array(select jsonb_object_keys(r -> 'signup') order by 1) from sig_exists), array['activationExpiresAt', 'createdAt', 'purgeAt', 'signupId', 'status'],
  'la respuesta para un correo con cuenta tiene la misma forma (sin enumerar)');
select is(api.create_assisted_signup('clave-alta-00000001', pg_temp.signup_hash('uno@example.test', 'Persona Uno'), 'uno@example.test', 'Persona Uno'),
  jsonb_build_object('kind', 'replayed', 'response', (select r from sig_one)), 'el reintento con la misma clave devuelve el mismo alta (replayed)');
select is(api.create_assisted_signup('clave-alta-00000001', pg_temp.signup_hash('dos@example.test', null), 'dos@example.test', null) ->> 'kind',
  'payload_conflict', 'la misma clave con otro payload es payload_conflict');
select throws_ok($$select email from app.assisted_signups$$, '42501', null, 'el admin no puede leer el correo de las altas');
select is((select count(*)::int from app.assisted_signups), 2, 'el admin ve las altas de su hospital');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.proname in ('create_assisted_signup', 'reissue_assisted_link') and p.proargnames::text ~ 'token|outbox|sealed'), 0,
  'las RPC del admin no aceptan un hash de token, un id de outbox ni un payload sellado');
select is(api.issue_assisted_activation((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a1', 1, repeat('7', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'forbidden', 'el admin no puede emitir el token de activación (solo la sesión técnica)');
reset role;
select is((select count(*)::int from app.action_tokens where kind = 'alta_asistida' and subject_id in (select (r -> 'signup' ->> 'signupId')::uuid from sig_one union select (r -> 'signup' ->> 'signupId')::uuid from sig_exists)), 0,
  'crear el alta no emite ningún token');

-- Emisión del enlace (solo la sesión técnica) -------------------------------------------------------------------------
set local role anon;
select throws_ok($$select api.issue_assisted_activation(gen_random_uuid(), gen_random_uuid(), 1, repeat('7', 64), gen_random_uuid(), repeat('s', 40))$$, '42501', null, 'anon no emite enlaces');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.issue_assisted_activation((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a1', 1, 'no-hex', gen_random_uuid(), repeat('s', 40)) ->> 'kind', 'invalid', 'un hash inválido es invalid');
select is(api.issue_assisted_activation((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a2', 1, repeat('7', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind', 'not_found', 'con el hospital de otro es not_found');
select is(api.issue_assisted_activation((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a1', 2, repeat('7', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind', 'conflict', 'una emisión que no es la vigente es conflict');
select is(api.issue_assisted_activation((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a1', 1, repeat('7', 64), '70000000-0000-4000-8000-0000000000b1', repeat('s', 40)),
  '{"kind": "ok"}'::jsonb, 'la técnica emite el enlace de la emisión 1');
select is(api.issue_assisted_activation((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a1', 1, repeat('8', 64), '70000000-0000-4000-8000-0000000000b9', repeat('s', 40)),
  '{"kind": "ok"}'::jsonb, 'repetir la misma emisión responde ok sin duplicar');
select is(api.issue_assisted_activation((select (r -> 'signup' ->> 'signupId')::uuid from sig_exists), '10000000-0000-4000-8000-0000000000a1', 1, (md5('m9') || md5('m9')), '70000000-0000-4000-8000-0000000000b2', repeat('s', 40)),
  '{"kind": "ok"}'::jsonb, 'para un correo con cuenta responde ok igual');
reset role;
select is((select count(*)::int from app.action_tokens where token_hash = repeat('7', 64) and kind = 'alta_asistida' and invalidated_at is null and data = '{"seq": 1}'), 1, 'la cuenta nueva recibió un token de activación de la emisión 1');
select is((select count(*)::int from app.action_tokens where token_hash = repeat('8', 64)), 0, 'repetir la emisión no creó otro token');
select is((select count(*)::int from app.action_tokens where token_hash = (md5('m9') || md5('m9')) and invalidated_at is not null), 1, 'el correo con cuenta solo deja una marca anulada: no hay enlace');
select is((select count(*)::int from app.email_outbox where outbox_id = '70000000-0000-4000-8000-0000000000b1'), 1, 'se encoló el correo de la cuenta nueva');
select is((select count(*)::int from app.email_outbox where outbox_id in ('70000000-0000-4000-8000-0000000000b2', '70000000-0000-4000-8000-0000000000b9')), 0, 'y ninguno para la cuenta existente ni para la repetición');

-- Aislamiento entre hospitales y paginación ----------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a2', 'aal2');
select is((api.list_own_assisted_signups(10) -> 'items'), '[]'::jsonb, 'otro hospital no ve las altas ajenas');
select is(api.get_own_assisted_signup((select (r -> 'signup' ->> 'signupId')::uuid from sig_one)) ->> 'kind', 'not_found', 'y una alta ajena es indistinguible de una inexistente');
select is(api.reissue_assisted_link('clave-reemit-00001', pg_temp.id_hash((select (r -> 'signup' ->> 'signupId')::uuid from sig_one)), (select (r -> 'signup' ->> 'signupId')::uuid from sig_one)) ->> 'kind',
  'not_found', 'ni reemitir un alta ajena');
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(jsonb_array_length(api.list_own_assisted_signups(1) -> 'items'), 1, 'la lista respeta el límite');
select is(api.list_own_assisted_signups(1) -> 'next' is not null, true, 'y entrega la posición de la página siguiente');
select is(api.list_own_assisted_signups(0) ->> 'kind', 'invalid', 'un límite inválido es invalid');
select is(api.list_own_assisted_signups(10, now(), null) ->> 'kind', 'invalid', 'un cursor incompleto es invalid');
select is(api.get_own_assisted_signup((select (r -> 'signup' ->> 'signupId')::uuid from sig_one)) -> 'signup' ->> 'status', 'pendiente', 'el admin consulta un alta propia');
select is(api.get_own_assisted_signup(gen_random_uuid()) ->> 'kind', 'not_found', 'una inexistente es not_found');
reset role;

-- Reemisión del enlace --------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.reissue_assisted_link('clave-reemit-00002', repeat('0', 64), (select (r -> 'signup' ->> 'signupId')::uuid from sig_one)) ->> 'kind',
  'invalid', 'un hash que no corresponde es invalid');
select is(api.reissue_assisted_link('clave-reemit-00002', pg_temp.id_hash((select (r -> 'signup' ->> 'signupId')::uuid from sig_one)), (select (r -> 'signup' ->> 'signupId')::uuid from sig_one)),
  '{"kind": "ok", "seq": 2}'::jsonb, 'reemitir sube la emisión a 2');
select is(api.reissue_assisted_link('clave-reemit-00002', pg_temp.id_hash((select (r -> 'signup' ->> 'signupId')::uuid from sig_one)), (select (r -> 'signup' ->> 'signupId')::uuid from sig_one)) ->> 'kind',
  'replayed', 'el reintento con la misma clave es un replay (misma emisión)');
select is(api.reissue_assisted_link('clave-reemit-00002', pg_temp.id_hash((select (r -> 'signup' ->> 'signupId')::uuid from sig_exists)), (select (r -> 'signup' ->> 'signupId')::uuid from sig_exists)) ->> 'kind',
  'payload_conflict', 'la misma clave sobre otra alta es payload_conflict');
reset role;
select is((select invalidated_at is not null from app.action_tokens where token_hash = repeat('7', 64)), true, 'reemitir anula el token anterior');
select is((select activation_seq from app.assisted_signups where signup_id = (select (r -> 'signup' ->> 'signupId')::uuid from sig_one)), 2, 'y la alta quedó en la emisión 2');
select is((select created_at = (r -> 'signup' ->> 'createdAt')::timestamptz and purge_at = (r -> 'signup' ->> 'purgeAt')::timestamptz
  from app.assisted_signups s, sig_one where s.signup_id = (r -> 'signup' ->> 'signupId')::uuid), true, 'createdAt y purgeAt no cambian al reemitir');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.issue_assisted_activation((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a1', 2, repeat('c', 64), '70000000-0000-4000-8000-0000000000b3', repeat('s', 40)),
  '{"kind": "ok"}'::jsonb, 'la técnica emite el enlace de la emisión 2');
select is(api.issue_assisted_activation((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a1', 2, repeat('d', 64), gen_random_uuid(), repeat('s', 40)),
  '{"kind": "ok"}'::jsonb, 'y repetirla no crea otro');
reset role;
select is((select count(*)::int from app.action_tokens where token_hash = repeat('c', 64) and kind = 'alta_asistida' and consumed_at is null and invalidated_at is null), 1, 'el token nuevo está vigente');
select is((select count(*)::int from app.action_tokens where token_hash = repeat('d', 64)), 0, 'el reintento no creó otro');
-- Topes: 3 enlaces por alta y hora
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.reissue_assisted_link('clave-reemit-00005', pg_temp.id_hash((select (r -> 'signup' ->> 'signupId')::uuid from sig_one)), (select (r -> 'signup' ->> 'signupId')::uuid from sig_one)) ->> 'seq', '3', 'una tercera emisión');
reset role;
insert into app.action_tokens (token_hash, kind, subject_id, data, expires_at) values
  (repeat('e', 64) || '', 'alta_asistida', (select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '{"seq": 3}', now() + interval '1 day'),
  (repeat('f', 64) || '', 'alta_asistida', (select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '{"seq": 4}', now() + interval '1 day');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.reissue_assisted_link('clave-reemit-00006', pg_temp.id_hash((select (r -> 'signup' ->> 'signupId')::uuid from sig_one)), (select (r -> 'signup' ->> 'signupId')::uuid from sig_one)) ->> 'kind',
  'rate_limited', 'a tres enlaces en una hora la alta no se reemite más');
reset role;
delete from app.action_tokens where token_hash in (repeat('e', 64), repeat('f', 64));
update app.action_tokens set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where kind = 'alta_asistida' and subject_id = (select (r -> 'signup' ->> 'signupId')::uuid from sig_one);
update app.assisted_signups set purge_at = now() - interval '1 second', created_at = now() - interval '31 days' where signup_id = (select (r -> 'signup' ->> 'signupId')::uuid from sig_one);
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.reissue_assisted_link('clave-reemit-00003', pg_temp.id_hash((select (r -> 'signup' ->> 'signupId')::uuid from sig_one)), (select (r -> 'signup' ->> 'signupId')::uuid from sig_one)) ->> 'kind', 'conflict', 'pasada la purga ya no se reemite');
reset role;
update app.assisted_signups set purge_at = now() + interval '10 days', created_at = now() - interval '20 days' where signup_id = (select (r -> 'signup' ->> 'signupId')::uuid from sig_one);

-- Correo para sellar la reemisión (solo la sesión técnica) ----------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.get_assisted_signup_recipient((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a1') ->> 'kind', 'forbidden', 'el admin no lee el correo del alta');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.get_assisted_signup_recipient((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a1') ->> 'email', 'uno@example.test', 'la técnica obtiene el correo del alta del hospital');
select is(api.get_assisted_signup_recipient((select (r -> 'signup' ->> 'signupId')::uuid from sig_one), '10000000-0000-4000-8000-0000000000a2') ->> 'kind', 'not_found', 'pero no el de un alta de otro hospital');
reset role;

-- Reenvío de la verificación de un registro sin verificar ------------------------------------------------------
set local role anon;
select throws_ok($$select api.reissue_donor_verification('x@example.test', (md5('r1') || md5('r1')), gen_random_uuid(), repeat('s', 40), 'email:' || repeat('a', 64), 'clave-reenvio-00001', repeat('b', 64))$$,
  '42501', null, 'anon no reenvía verificaciones');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal1');
select is(api.reissue_donor_verification('donante-pendiente@example.test', (md5('r1') || md5('r1')), gen_random_uuid(), repeat('s', 40), 'email:' || repeat('a', 64), 'clave-reenvio-00001', repeat('b', 64)) ->> 'kind', 'forbidden', 'un usuario cualquiera tampoco');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.reissue_donor_verification('donante-pendiente@example.test', (md5('r1') || md5('r1')), '70000000-0000-4000-8000-0000000000c1', repeat('s', 40), 'email:' || repeat('a', 64), 'clave-reenvio-00001', repeat('b', 64)), '{"kind": "ok"}'::jsonb, 'un registro sin verificar recibe un enlace nuevo');
select is(api.reissue_donor_verification('donante-pendiente@example.test', (md5('r2') || md5('r2')), '70000000-0000-4000-8000-0000000000c2', repeat('s', 40), 'email:' || repeat('a', 64), 'clave-reenvio-00001', repeat('b', 64)), '{"kind": "ok"}'::jsonb, 'el reintento con la misma clave responde igual');
select is(api.reissue_donor_verification('donante-activo@example.test', (md5('r3') || md5('r3')), '70000000-0000-4000-8000-0000000000c3', repeat('s', 40), 'email:' || repeat('c', 64), 'clave-reenvio-00002', repeat('d', 64)), '{"kind": "ok"}'::jsonb, 'una cuenta ya verificada responde igual');
select is(api.reissue_donor_verification('no-existe@example.test', (md5('r4') || md5('r4')), '70000000-0000-4000-8000-0000000000c4', repeat('s', 40), 'email:' || repeat('e', 64), 'clave-reenvio-00003', repeat('f', 64)), '{"kind": "ok"}'::jsonb, 'y un correo inexistente también');
select is(api.reissue_donor_verification('donante-pendiente@example.test', (md5('r5') || md5('r5')), gen_random_uuid(), repeat('s', 40), 'email:' || repeat('a', 64), 'clave-reenvio-00001', repeat('9', 64)) ->> 'kind', 'payload_conflict', 'la misma clave con otro payload es payload_conflict');
reset role;
select is((select count(*)::int from app.action_tokens where token_hash = (md5('r1') || md5('r1')) and kind = 'verificacion_email' and subject_id = '00000000-0000-4000-8000-0000000000b1' and invalidated_at is null), 1, 'el enlace nuevo está vigente');
select is((select count(*)::int from app.action_tokens where token_hash in ((md5('r2') || md5('r2')), (md5('r3') || md5('r3')), (md5('r4') || md5('r4')))), 0, 'ni el reintento, ni la cuenta verificada, ni el correo inexistente crearon tokens');
select is((select count(*)::int from app.email_outbox where outbox_id = '70000000-0000-4000-8000-0000000000c1'), 1, 'se encoló un solo correo');

-- Activación y reclamo ---------------------------------------------------------------------------------------------
insert into app.assisted_signups (signup_id, hospital_id, email, name, activation_expires_at, purge_at) values
  ('20000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000a1', 'huerfano-viejo@example.test', 'Huérfano Viejo', now() + interval '1 day', now() + interval '30 days'),
  ('20000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-0000000000a1', 'huerfano-joven@example.test', null, now() + interval '1 day', now() + interval '30 days'),
  ('20000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-0000000000a1', 'alta-reclamada@example.test', 'Persona Reclamada', now() + interval '1 day', now() + interval '30 days'),
  ('20000000-0000-4000-8000-0000000000e4', '10000000-0000-4000-8000-0000000000a1', 'ya-tiene-cuenta@example.test', null, now() + interval '1 day', now() + interval '30 days');
insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values
  (repeat('a', 64), 'alta_asistida', '20000000-0000-4000-8000-0000000000e1', now() + interval '1 day'),
  (repeat('b', 64), 'alta_asistida', '20000000-0000-4000-8000-0000000000e2', now() + interval '1 day'),
  (repeat('e', 64), 'alta_asistida', '20000000-0000-4000-8000-0000000000e3', now() + interval '1 day'),
  (repeat('f', 64), 'alta_asistida', '20000000-0000-4000-8000-0000000000e4', now() + interval '1 day');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal1');
select is(api.get_assisted_activation_preview(repeat('a', 64)) ->> 'kind', 'forbidden', 'la vista previa de activación no es para un usuario cualquiera');
select is(api.link_assisted_account('00000000-0000-4000-8000-0000000000d3', repeat('a', 64)) ->> 'kind', 'forbidden', 'ni vincular');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.get_assisted_activation_preview(repeat('a', 64)) - 'expiresAt', jsonb_build_object('kind', 'ok', 'hospitalName', 'Hospital Donantes Uno', 'email', 'huerfano-viejo@example.test',
  'orphanUserId', '00000000-0000-4000-8000-0000000000d3'), 'la técnica ve el hospital, el correo y el usuario de Auth inerte que lo ocupa');
select is(api.get_assisted_activation_preview(repeat('b', 64)) -> 'orphanUserId', 'null'::jsonb, 'un usuario más joven que un minuto (registro en curso) no se ofrece como huérfano');
select is(api.get_assisted_activation_preview(repeat('f', 64)) -> 'orphanUserId', 'null'::jsonb, 'ni uno con cuenta de aplicación');
select is(api.get_assisted_activation_preview(repeat('9', 64)) ->> 'kind', 'not_found', 'un token desconocido es not_found');
select is(api.link_assisted_account('00000000-0000-4000-8000-0000000000d6', repeat('e', 64)) ->> 'kind', 'forbidden', 'el correo de la cuenta debe ser el del alta');
select is(api.link_assisted_account('00000000-0000-4000-8000-0000000000d2', repeat('f', 64)) ->> 'kind', 'conflict', 'una cuenta que ya tiene cuenta de aplicación es conflict');
select is(api.link_assisted_account('00000000-0000-4000-8000-0000000000d5', repeat('e', 64)), '{"kind": "ok", "status": "reclamada_incompleta", "emailVerified": true}'::jsonb,
  'reclamar crea la cuenta incompleta con el correo verificado');
select is(api.link_assisted_account('00000000-0000-4000-8000-0000000000d5', repeat('e', 64)) ->> 'kind', 'gone', 'el segundo reclamo es gone');
reset role;
select is((select status || '|' || coalesce(name, '-') || '|' || (email_verified_at is not null)::text from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000d5'),
  'incompleto|Persona Reclamada|true', 'el perfil nace incompleto, con el nombre del alta y el correo verificado');
select is((select status || '|' || (donor_id = '00000000-0000-4000-8000-0000000000d5')::text from app.assisted_signups where signup_id = '20000000-0000-4000-8000-0000000000e3'),
  'reclamada_incompleta|true', 'el alta queda reclamada');
select is((select consumed_at is not null from app.action_tokens where token_hash = repeat('e', 64)), true, 'y el token consumido');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.reissue_assisted_link('clave-reemit-00004', pg_temp.id_hash('20000000-0000-4000-8000-0000000000e3'), '20000000-0000-4000-8000-0000000000e3') ->> 'kind',
  'conflict', 'un alta ya reclamada no se reemite');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.get_assisted_signup_recipient('20000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-0000000000a1') ->> 'kind', 'conflict', 'ni se entrega su correo');
reset role;
update app.action_tokens set expires_at = now() - interval '1 second', created_at = now() - interval '2 days' where token_hash = repeat('a', 64);
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.get_assisted_activation_preview(repeat('a', 64)) ->> 'kind', 'gone', 'un enlace vencido es gone');
reset role;

-- Tope por hospital ------------------------------------------------------------------------------------------------
insert into app.assisted_signups (hospital_id, email, activation_expires_at, purge_at)
select '10000000-0000-4000-8000-0000000000a2', 'masivo' || g || '@example.test', now() + interval '1 day', now() + interval '30 days' from generate_series(1, 20) g;
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a2', 'aal2');
select is(api.create_assisted_signup('clave-alta-00000009', pg_temp.signup_hash('desbordado@example.test', null), 'desbordado@example.test', null) ->> 'kind',
  'rate_limited', 'a las 20 altas por hora el hospital recibe rate_limited');
reset role;

-- Perfil propio ----------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.get_own_donor_profile() ->> 'kind', 'forbidden', 'un admin no tiene perfil de donante');
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select api.get_own_donor_profile()$$, '42501', null, 'anon no consulta perfiles');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b2', 'aal1', 'donante-incompleto@example.test');
select is(api.get_own_donor_profile() ->> 'kind', 'not_found', 'con el perfil incompleto aún no hay perfil que mostrar');
select pg_temp.login('00000000-0000-4000-8000-0000000000b3', 'aal1', 'donante-activo@example.test');
select is(api.get_own_donor_profile() -> 'profile', '{"name": "Donante Activo", "email": "donante-activo@example.test", "declaredBloodType": "O_POS", "isAvailable": true, "approximateLocation": {"latitude": -12.046, "longitude": -77.043}}'::jsonb,
  'el donante activo ve su perfil, con el correo de su sesión');

-- Onboarding ---------------------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal1', 'donante-pendiente@example.test');
select is(api.complete_own_onboarding('clave-onboard-0001', pg_temp.onboarding_hash('Ana', 'A_POS', true, -12.05, -77.04), 'Ana', 'A_POS', true, -12.05, -77.04, 'DEMO_ONLY-1') ->> 'kind',
  'conflict', 'sin correo verificado no se completa el onboarding');
select pg_temp.login('00000000-0000-4000-8000-0000000000b2', 'aal1', 'donante-incompleto@example.test');
select is(api.complete_own_onboarding('clave-onboard-0002', repeat('0', 64), 'Ana', 'A_POS', true, -12.05, -77.04, 'DEMO_ONLY-1') ->> 'kind', 'invalid', 'un hash que no corresponde es invalid');
select is(api.complete_own_onboarding('clave-onboard-0002', pg_temp.onboarding_hash('Ana', 'X_POS', true, -12.05, -77.04), 'Ana', 'X_POS', true, -12.05, -77.04, 'DEMO_ONLY-1') ->> 'kind', 'invalid', 'un grupo sanguíneo desconocido es invalid');
select is(api.complete_own_onboarding('clave-onboard-0002', pg_temp.onboarding_hash('', 'A_POS', true, -12.05, -77.04), '', 'A_POS', true, -12.05, -77.04, 'DEMO_ONLY-1') ->> 'kind', 'invalid', 'un nombre vacío es invalid');
select is(api.complete_own_onboarding('clave-onboard-0002', pg_temp.onboarding_hash('Ana', 'A_POS', true, 40.417, -3.704), 'Ana', 'A_POS', true, 40.417, -3.704, 'DEMO_ONLY-1') ->> 'kind', 'invalid', 'una ubicación fuera del polígono es invalid aunque se llame a la RPC directamente');
select is(api.complete_own_onboarding('clave-onboard-0002', pg_temp.onboarding_hash('Ana', 'A_POS', true, -12.05, -77.04), 'Ana', 'A_POS', true, -12.05, -77.04, 'cualquier-cosa') ->> 'kind', 'invalid', 'una versión de polígono falsa es invalid');
select is(api.complete_own_onboarding('clave-onboard-0002', pg_temp.onboarding_hash('Ana', 'A_POS', true, -12.0461, -77.04), 'Ana', 'A_POS', true, -12.0461, -77.04, 'DEMO_ONLY-1') ->> 'kind', 'invalid', 'más de tres decimales es invalid');
select is(api.complete_own_onboarding('clave-onboard-0002', pg_temp.onboarding_hash('   ', 'A_POS', true, -12.05, -77.04), '   ', 'A_POS', true, -12.05, -77.04, 'DEMO_ONLY-1') ->> 'kind', 'invalid', 'un nombre en blanco es invalid');
create temp table onb as select api.complete_own_onboarding('clave-onboard-0002', pg_temp.onboarding_hash('Ana', 'A_POS', true, -12.05, -77.04), 'Ana', 'A_POS', true, -12.05, -77.04, 'DEMO_ONLY-1') as r;
grant select on onb to authenticated;
select is((select r -> 'profile' from onb), '{"name": "Ana", "email": "donante-incompleto@example.test", "declaredBloodType": "A_POS", "isAvailable": true, "approximateLocation": {"latitude": -12.05, "longitude": -77.04}}'::jsonb,
  'completar el perfil lo activa y lo devuelve');
select is(api.complete_own_onboarding('clave-onboard-0002', pg_temp.onboarding_hash('Ana', 'A_POS', true, -12.05, -77.04), 'Ana', 'A_POS', true, -12.05, -77.04, 'DEMO_ONLY-1') -> 'response', (select r from onb), 'el reintento con la misma clave devuelve la misma respuesta (replayed)');
select is(api.complete_own_onboarding('clave-onboard-0002', pg_temp.onboarding_hash('Bea', 'A_POS', true, -12.05, -77.04), 'Bea', 'A_POS', true, -12.05, -77.04, 'DEMO_ONLY-1') ->> 'kind', 'payload_conflict', 'la misma clave con otro payload es payload_conflict');
select is(api.complete_own_onboarding('clave-onboard-0003', pg_temp.onboarding_hash('Bea', 'A_POS', true, -12.05, -77.04), 'Bea', 'A_POS', true, -12.05, -77.04, 'DEMO_ONLY-1') ->> 'kind', 'conflict', 'un perfil ya activo no se completa de nuevo');
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(api.complete_own_onboarding('clave-onboard-0004', pg_temp.onboarding_hash('Ana', 'A_POS', true, -12.05, -77.04), 'Ana', 'A_POS', true, -12.05, -77.04, 'DEMO_ONLY-1') ->> 'kind', 'forbidden', 'un admin no completa un perfil de donante');
reset role;
select is((select status from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000b2'), 'activo', 'el perfil quedó activo');
select is((select count(*)::int from app.audit_events where event = 'donante.perfil_completado' and resource_id = '00000000-0000-4000-8000-0000000000b2'), 1, 'se audita una sola vez');

-- La ubicación y el nombre también se validan en la base, no solo en el dominio -------------------------------------
select is(app.in_lima_demo_1(-12.046, -77.043), true, 'un punto del interior está en el polígono');
select is(app.in_lima_demo_1(-11.80, -77.20), true, 'un vértice está dentro (borde incluido)');
select is(app.in_lima_demo_1(-11.80, -77.00), true, 'un punto sobre un borde está dentro');
select is(app.in_lima_demo_1(40.417, -3.704), false, 'Madrid está fuera');
select is(app.in_lima_demo_1(-12.301, -77.00), false, 'justo al sur del polígono está fuera');
select throws_ok($$update app.donor_profiles set latitude = 40.417, longitude = -3.704 where donor_id = '00000000-0000-4000-8000-0000000000b3'$$, '23514', null, 'la tabla rechaza una ubicación fuera del polígono');
select throws_ok($$update app.donor_profiles set name = '  ' where donor_id = '00000000-0000-4000-8000-0000000000b3'$$, '23514', null, 'y un nombre en blanco');
-- Al activarse el perfil, el alta asistida que lo originó pasa a `activa`
update app.donor_profiles set name = 'Persona Reclamada', declared_blood_type = 'A_NEG', is_available = true, latitude = -12.05, longitude = -77.04,
  location_polygon_version = 'DEMO_ONLY-1', status = 'activo' where donor_id = '00000000-0000-4000-8000-0000000000d5';
select is((select status from app.assisted_signups where signup_id = '20000000-0000-4000-8000-0000000000e3'), 'activa', 'activar el perfil deja el alta asistida en activa');

-- Participación ------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b3', 'aal1', 'donante-activo@example.test');
select is(api.update_own_participation('clave-partic-0001', pg_temp.part_hash(null, null, null), null, null, null, null) ->> 'kind', 'invalid', 'sin ningún cambio es invalid');
select is(api.update_own_participation('clave-partic-0001', pg_temp.part_hash(null, -12.1, null), null, -12.1, null, 'DEMO_ONLY-1') ->> 'kind', 'invalid', 'una latitud sin longitud es invalid');
select is(api.update_own_participation('clave-partic-0001', pg_temp.part_hash(false, null, null), false, null, null, null) -> 'profile' ->> 'isAvailable', 'false', 'el donante se marca no disponible');
select is(api.update_own_participation('clave-partic-0002', pg_temp.part_hash(null, -12.1, -77.1), null, -12.1, -77.1, 'DEMO_ONLY-1') -> 'profile' -> 'approximateLocation', '{"latitude": -12.1, "longitude": -77.1}'::jsonb, 'cambia la ubicación');
select is(api.update_own_participation('clave-partic-0001', pg_temp.part_hash(true, null, null), true, null, null, null) ->> 'kind', 'payload_conflict', 'la misma clave con otro payload es payload_conflict');
select is(api.update_own_participation('clave-partic-0001', pg_temp.part_hash(false, null, null), false, null, null, null) -> 'response' -> 'profile' ->> 'name', 'Donante Activo', 'el reintento repite la respuesta y no toca la identidad');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal1', 'donante-pendiente@example.test');
select is(api.update_own_participation('clave-partic-0003', pg_temp.part_hash(true, null, null), true, null, null, null) ->> 'kind', 'conflict', 'un perfil que no está activo no cambia su participación');
reset role;
select is((select location_polygon_version from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000b3'), 'DEMO_ONLY-1', 'queda la versión del polígono con la que se validó');

-- Privilegios directos sobre la tabla ----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b3', 'aal1', 'donante-activo@example.test');
select throws_ok($$update app.donor_profiles set name = 'Otro Nombre' where donor_id = '00000000-0000-4000-8000-0000000000b3'$$, '42501', 'donor_profile_identity_locked', 'un perfil activo no cambia nombre por UPDATE directo');
select throws_ok($$update app.donor_profiles set declared_blood_type = 'AB_POS' where donor_id = '00000000-0000-4000-8000-0000000000b3'$$, '42501', 'donor_profile_identity_locked', 'ni el grupo sanguíneo');
select throws_ok($$update app.donor_profiles set status = 'incompleto' where donor_id = '00000000-0000-4000-8000-0000000000b3'$$, '42501', 'donor_profile_identity_locked', 'ni retroceder el estado');
select throws_ok($$update app.donor_profiles set email_verified_at = null where donor_id = '00000000-0000-4000-8000-0000000000b3'$$, '42501', null, 'ni tocar la verificación del correo (columna sin permiso)');
select lives_ok($$update app.donor_profiles set is_available = true where donor_id = '00000000-0000-4000-8000-0000000000b3'$$, 'pero sí su disponibilidad');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal1', 'donante-pendiente@example.test');
select throws_ok($$update app.donor_profiles set name = 'Intruso' where donor_id = '00000000-0000-4000-8000-0000000000b1'$$, '42501', 'donor_profile_unverified', 'un perfil sin verificar no se edita directamente');
select is((select count(*)::int from app.donor_profiles), 1, 'cada donante solo ve su propio perfil');
update app.donor_profiles set name = 'Cambiado' where donor_id = '00000000-0000-4000-8000-0000000000b3';
reset role;
select is((select name from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000b3'), 'Donante Activo', 'y no puede actualizar el de otra persona (RLS)');

-- Cambio de correo (el token lo crea F7; aquí solo vista previa y consumo) ------------------------------------------
insert into app.action_tokens (token_hash, kind, subject_id, data, expires_at) values
  ((md5('c1') || md5('c1')), 'cambio_email', '00000000-0000-4000-8000-0000000000b3', '{"sealedEmail": "v1.k1.sellado"}', now() + interval '1 day'),
  ((md5('c2') || md5('c2')), 'cambio_email', '00000000-0000-4000-8000-0000000000b3', '{}', now() + interval '1 day');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b3', 'aal1');
select is(api.get_email_change_preview((md5('c1') || md5('c1'))) ->> 'kind', 'forbidden', 'la vista previa del cambio de correo no es para un usuario cualquiera');
select is(api.consume_email_change((md5('c1') || md5('c1'))) ->> 'kind', 'forbidden', 'ni consumirlo');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.get_email_change_preview((md5('c1') || md5('c1'))) ->> 'kind', 'ok', 'la técnica ve la vista previa');
select is(api.consume_email_change((md5('c2') || md5('c2'))) ->> 'kind', 'conflict', 'un token sin correo sellado es conflict y no se consume');
select is(api.consume_email_change((md5('c1') || md5('c1'))), '{"kind": "ok", "userId": "00000000-0000-4000-8000-0000000000b3", "sealedEmail": "v1.k1.sellado"}'::jsonb, 'consumir devuelve el usuario y el correo sellado');
select is(api.consume_email_change((md5('c1') || md5('c1'))) ->> 'kind', 'gone', 'el segundo consumo es gone');
select is(api.consume_email_change(repeat('9', 64)) ->> 'kind', 'not_found', 'un token desconocido es not_found');
reset role;
select is((select password_setup_required from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000d1'), true, 'tras verificar un autorregistro el perfil exige fijar la contraseña');
select is((select count(*)::int from app.audit_events where event = 'donante.cambio_correo' and resource_id = '00000000-0000-4000-8000-0000000000b3'), 1, 'se audita el cambio de correo');

-- Contraseña pendiente tras verificar un autorregistro ----------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'password-pendiente@example.test', now() - interval '1 day');
insert into app.user_accounts (user_id, role, display_name) values ('00000000-0000-4000-8000-0000000000e1', 'donante', null);
insert into app.donor_profiles (donor_id, status, email_verified_at, password_setup_required) values ('00000000-0000-4000-8000-0000000000e1', 'incompleto', now(), true);
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1', 'aal1', 'password-pendiente@example.test');
select is(api.complete_own_onboarding('clave-onb-e1-0001', pg_temp.onboarding_hash('Ana Prueba', 'O_POS', true, -12.046, -77.043), 'Ana Prueba', 'O_POS', true, -12.046, -77.043, 'DEMO_ONLY-1') ->> 'kind',
  'conflict', 'con la contraseña pendiente no se completa el perfil');
select throws_ok($$update app.donor_profiles set status = 'activo', name = 'Ana Prueba', declared_blood_type = 'O_POS', is_available = true, latitude = -12.046, longitude = -77.043, location_polygon_version = 'DEMO_ONLY-1' where donor_id = '00000000-0000-4000-8000-0000000000e1'$$,
  '42501', 'donor_profile_password_pending', 'ni saltándose la RPC con un UPDATE directo');
select is(api.issue_password_setup('00000000-0000-4000-8000-0000000000e1', (md5('p1') || md5('p1')), '70000000-0000-4000-8000-0000000000e1', repeat('s', 40)) ->> 'kind', 'forbidden', 'emitir el enlace no es para un usuario cualquiera');
select is(api.confirm_password_setup('00000000-0000-4000-8000-0000000000e1') ->> 'kind', 'forbidden', 'ni levantar el bloqueo');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.issue_password_setup('00000000-0000-4000-8000-0000000000e1', (md5('p1') || md5('p1')), '70000000-0000-4000-8000-0000000000e1', repeat('s', 40)) ->> 'kind', 'ok', 'la técnica emite el enlace de recuperación');
reset role;
select is((select count(*)::int from app.action_tokens where kind = 'recuperacion' and subject_id = '00000000-0000-4000-8000-0000000000e1' and invalidated_at is null), 1, 'queda un token de recuperación vigente');
select is((select count(*)::int from app.email_outbox where outbox_id = '70000000-0000-4000-8000-0000000000e1'), 1, 'y un correo en la cola');
select is((select count(*)::int from app.audit_events where event = 'donante.contrasena_pendiente' and resource_id = '00000000-0000-4000-8000-0000000000e1'), 1, 'se audita la emisión');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.issue_password_setup('00000000-0000-4000-8000-0000000000e1', (md5('p2') || md5('p2')), '70000000-0000-4000-8000-0000000000e2', repeat('s', 40)) ->> 'kind', 'ok', 'emitir otra vez es válido');
reset role;
select is((select count(*)::int from app.action_tokens where kind = 'recuperacion' and subject_id = '00000000-0000-4000-8000-0000000000e1' and invalidated_at is null), 1, 'y deja solo el último enlace vigente');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal1');
select is(api.issue_password_setup('00000000-0000-4000-8000-0000000000e1', 'no-hex', '70000000-0000-4000-8000-0000000000e3', repeat('s', 40)) ->> 'kind', 'invalid', 'un hash con formato inválido es invalid');
select is(api.issue_password_setup('00000000-0000-4000-8000-0000000000b3', (md5('p3') || md5('p3')), '70000000-0000-4000-8000-0000000000e4', repeat('s', 40)) ->> 'kind', 'conflict', 'a un perfil que no exige contraseña no se le emite');
select is(api.confirm_password_setup('00000000-0000-4000-8000-0000000000e1') ->> 'kind', 'ok', 'tras cambiar la contraseña la técnica levanta el bloqueo');
reset role;
select is((select password_setup_required from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000e1'), false, 'el perfil ya no exige la contraseña');
select is((select count(*)::int from app.audit_events where event = 'donante.contrasena_fijada' and resource_id = '00000000-0000-4000-8000-0000000000e1'), 1, 'se audita el desbloqueo');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1', 'aal1', 'password-pendiente@example.test');
select is(api.complete_own_onboarding('clave-onb-e1-0001', pg_temp.onboarding_hash('Ana Prueba', 'O_POS', true, -12.046, -77.043), 'Ana Prueba', 'O_POS', true, -12.046, -77.043, 'DEMO_ONLY-1') ->> 'kind',
  'ok', 'ya se puede completar el perfil');
reset role;
select is((select status from app.donor_profiles where donor_id = '00000000-0000-4000-8000-0000000000e1'), 'activo', 'y queda activo');

select * from finish();
rollback;
