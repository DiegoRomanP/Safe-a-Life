begin;
select plan(42);

-- Fixtures sintéticos (como propietario; las pruebas de acceso cambian de rol) ---------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'super@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin1@example.test'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin2@example.test'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'donante@example.test');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000b1', 'superadmin', null),
  ('00000000-0000-4000-8000-0000000000b2', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000b3', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000b4', 'donante', 'Donante Sintético');
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-000000000001', 'Hospital Uno', 'Hospital Uno S.A.', true),
  ('10000000-0000-4000-8000-000000000002', 'Hospital Dos', 'Hospital Dos S.A.', true);
insert into app.sites (site_id, hospital_id, public_name, public_address, latitude, longitude, is_active, is_approved) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Sede Activa', 'Lima', -12.046374, -77.042793, true, true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Sede Inactiva', 'Lima', -12.05, -77.04, false, true),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Sede Sin Aprobar', 'Lima', -12.06, -77.05, true, false),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Sede Ajena', 'Lima', -12.07, -77.06, true, true);
insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000001', 'activa', 'a***@example.test'),
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b3', '10000000-0000-4000-8000-000000000002', 'activa', 'a***@example.test');

create function pg_temp.login(p_uid text, p_aal text, p_step_up boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format(
    '{"sub":"%s","role":"authenticated","aal":"%s","amr":[%s]}', p_uid, p_aal,
    case when p_step_up then format('{"method":"totp","timestamp":%s}', extract(epoch from now())::bigint) else '{"method":"password","timestamp":1}' end), true);
end $$;

-- Paridad del hash canónico con Node (fingerprint de shared/http/idempotency.ts) ------------------
select is(app.fingerprint('[["publicName","Hospital Ñandú \"X\" 🩸"],["legalName","Razón Social S.A."]]'::jsonb),
  '077e34c4d41124bee1d755df3cd46b6dc5a216388228bf6fe3900a0c69f94ca0', 'hash canónico igual al de Node con acentos, comillas y emoji');
select is(app.fingerprint('[["hospitalId","0f8fad5b-d9cb-469f-a165-70867728950e"],["publicName",null],["legalName",null],["isAuthorized",true]]'::jsonb),
  'f1ebda4160a323d6ad62c2a7c3275d9b4925345f81eca2d42f1ece916930c386', 'hash canónico igual al de Node con null y booleano');
select is(app.fingerprint(jsonb_build_array(jsonb_build_array('finalDemoAt', app.iso_ms('2030-01-01T00:00:00Z')))),
  '5a487812717d6e8dd4baf67f1284cf7efe0b01ff6c46edec2f5efc4c94b0d829', 'iso_ms coincide con toISOString()');
select is(app.fingerprint(jsonb_build_array(jsonb_build_array('a', ''), jsonb_build_array('b', E'línea\nnueva\ttab\\ \u0001'),
  jsonb_build_array('c', 10), jsonb_build_array('d', false))),
  '7ec32fbfd8712b0843dc17ef8ff031c3a4ff1b08c888dcf7d9d53a58eeff3245', 'hash canónico igual al de Node con escapes y enteros');

-- Acceso directo --------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b2', 'aal2');
select is((select count(*)::int from app.hospitals), 1, 'un admin solo ve su hospital');
select is((select count(*)::int from app.sites), 3, 'un admin solo ve las sedes de su hospital');
select is((select count(*)::int from app.sites where hospital_id = '10000000-0000-4000-8000-000000000002'), 0, 'un admin no ve sedes de otro hospital');
select throws_ok($$insert into app.hospitals (public_name, legal_name) values ('Intruso', 'Intruso S.A.')$$, '42501', null,
  'un admin no inserta hospitales');
select is(api.create_hospital('clave-de-prueba-0001', repeat('0', 64), 'x', 'y') ->> 'kind', 'forbidden', 'create_hospital: un admin recibe forbidden');
select is(api.list_hospitals(10) ->> 'kind', 'forbidden', 'list_hospitals: un admin recibe forbidden');

select pg_temp.login('00000000-0000-4000-8000-0000000000b4', 'aal1');
select is((select count(*)::int from app.hospitals), 0, 'un donante no ve hospitales');
select is((select count(*)::int from app.hospital_memberships), 0, 'un donante no ve membresías');
select is(api.get_hospital('10000000-0000-4000-8000-000000000001') ->> 'kind', 'forbidden', 'get_hospital: un donante recibe forbidden');

-- AAL1 ----------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal1');
select is(api.list_hospitals(10) ->> 'kind', 'mfa_required', 'superadmin con aal1 recibe mfa_required');
select throws_ok($$insert into app.hospitals (public_name, legal_name) values ('Sin MFA', 'Sin MFA S.A.')$$, '42501', null,
  'con aal1 no se inserta ni siquiera por acceso directo');

-- Superadmin AAL2: hospitales e idempotencia ----------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
select is((select count(*)::int from app.hospitals), 2, 'el superadmin ve todos los hospitales');

create temp table results (name text primary key, reply jsonb);
grant all on results to authenticated;
insert into results select 'h3', api.create_hospital('clave-hospital-0001', app.fingerprint(jsonb_build_array(
  jsonb_build_array('publicName', 'Hospital Tres'), jsonb_build_array('legalName', 'Hospital Tres S.A.'))), 'Hospital Tres', 'Hospital Tres S.A.');
select is((select reply ->> 'kind' from results where name = 'h3'), 'created', 'create_hospital crea el hospital');
select is((select reply #>> '{hospital,isAuthorized}' from results where name = 'h3'), 'false', 'un hospital nuevo no está autorizado');

insert into results select 'h3again', api.create_hospital('clave-hospital-0001', app.fingerprint(jsonb_build_array(
  jsonb_build_array('publicName', 'Hospital Tres'), jsonb_build_array('legalName', 'Hospital Tres S.A.'))), 'Hospital Tres', 'Hospital Tres S.A.');
select is((select reply ->> 'kind' from results where name = 'h3again'), 'replayed', 'la misma clave y payload devuelve replayed');
select is((select reply #>> '{response,hospital,hospitalId}' from results where name = 'h3again'),
  (select reply #>> '{hospital,hospitalId}' from results where name = 'h3'), 'el replay conserva el recurso original');
select is((select count(*)::int from app.hospitals where public_name = 'Hospital Tres'), 1, 'el replay no duplica el hospital');

select is(api.create_hospital('clave-hospital-0001', app.fingerprint(jsonb_build_array(
  jsonb_build_array('publicName', 'Otro'), jsonb_build_array('legalName', 'Otro S.A.'))), 'Otro', 'Otro S.A.') ->> 'kind',
  'payload_conflict', 'la misma clave con otro payload es payload_conflict');
select is(api.create_hospital('clave-hospital-0002', repeat('a', 64), 'Falso', 'Falso S.A.') ->> 'kind', 'invalid',
  'un hash que no coincide con el payload es invalid');
select is((select count(*)::int from app.audit_events where event = 'hospital.creado'), 1, 'la auditoría registra una sola creación');

-- Paginación ---------------------------------------------------------------------------------------------
select is(jsonb_array_length(api.list_hospitals(2) -> 'items'), 2, 'list_hospitals respeta el límite');
select isnt(api.list_hospitals(2) -> 'next', 'null'::jsonb, 'hay cursor siguiente cuando quedan más');
select is(api.list_hospitals(3) -> 'next', 'null'::jsonb, 'sin más páginas el cursor es null');

-- Step-up y configuración ---------------------------------------------------------------------------------
select is(api.update_hospital('clave-update-0001', repeat('0', 64), '10000000-0000-4000-8000-000000000001', null, null, true) ->> 'kind',
  'step_up_required', 'update_hospital exige step-up');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.update_hospital('clave-update-0001', app.fingerprint(jsonb_build_array(
  jsonb_build_array('hospitalId', '10000000-0000-4000-8000-000000000001'), jsonb_build_array('publicName', null),
  jsonb_build_array('legalName', null), jsonb_build_array('isAuthorized', false))),
  '10000000-0000-4000-8000-000000000001', null, null, false) #>> '{hospital,isAuthorized}', 'false', 'update_hospital con step-up aplica el cambio');
select is(api.update_hospital('clave-update-0002', app.fingerprint(jsonb_build_array(
  jsonb_build_array('hospitalId', '99999999-0000-4000-8000-000000000009'), jsonb_build_array('publicName', null),
  jsonb_build_array('legalName', null), jsonb_build_array('isAuthorized', true))),
  '99999999-0000-4000-8000-000000000009', null, null, true) ->> 'kind', 'not_found', 'update_hospital de un hospital inexistente es not_found');

select is(api.get_configuration() ->> 'isImmutable', 'false', 'la configuración empieza sin fecha final');
select is(api.set_final_demo_at('clave-config-0001', app.fingerprint(jsonb_build_array(jsonb_build_array('finalDemoAt', '2020-01-01T00:00:00.000Z'))),
  '2020-01-01T00:00:00Z') ->> 'kind', 'invalid', 'final_demo_at en el pasado es invalid');
select is(api.set_final_demo_at('clave-config-0002', app.fingerprint(jsonb_build_array(jsonb_build_array('finalDemoAt', '2030-01-01T00:00:00.000Z'))),
  '2030-01-01T00:00:00Z') ->> 'isImmutable', 'true', 'final_demo_at se fija una vez');
select is(api.set_final_demo_at('clave-config-0003', app.fingerprint(jsonb_build_array(jsonb_build_array('finalDemoAt', '2031-01-01T00:00:00.000Z'))),
  '2031-01-01T00:00:00Z') ->> 'kind', 'conflict', 'final_demo_at no se puede fijar dos veces');

-- Membresías y actor ----------------------------------------------------------------------------------------
select is(api.revoke_membership('clave-revoke-0001', app.fingerprint(jsonb_build_array(
  jsonb_build_array('membershipId', '30000000-0000-4000-8000-000000000001'), jsonb_build_array('status', 'revocada'),
  jsonb_build_array('reason', 'Baja del personal'))), '30000000-0000-4000-8000-000000000001', 'Baja del personal') #>> '{membership,status}',
  'revocada', 'revoke_membership revoca la membresía');
select is(api.revoke_membership('clave-revoke-0002', app.fingerprint(jsonb_build_array(
  jsonb_build_array('membershipId', '30000000-0000-4000-8000-000000000001'), jsonb_build_array('status', 'revocada'),
  jsonb_build_array('reason', 'Otra vez'))), '30000000-0000-4000-8000-000000000001', 'Otra vez') ->> 'kind', 'conflict',
  'revocar una membresía ya revocada es conflict');

select pg_temp.login('00000000-0000-4000-8000-0000000000b2', 'aal2');
select is(api.current_actor() -> 'hospital', 'null'::jsonb, 'con la membresía revocada, current_actor no revela el hospital en la misma sesión');
select is(api.list_own_hospital_sites(10) ->> 'kind', 'forbidden', 'un admin con membresía revocada no lista sedes');

select pg_temp.login('00000000-0000-4000-8000-0000000000b3', 'aal2');
select is(api.current_actor() ->> 'displayName', 'Hospital Dos', 'el nombre visible de un admin es el de su hospital');
select is(jsonb_array_length(api.list_own_hospital_sites(10) -> 'items'), 1, 'list_own_hospital_sites solo devuelve sedes activas y aprobadas propias');

-- Auditoría opaca ---------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
select ok(not exists (
  select 1 from jsonb_array_elements(api.list_audit_events(50) -> 'items') i
  where (i ->> 'actorCode') !~ '^[0-9a-f]{16}$'
     or (i ->> 'resourceCode') ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'),
  'la auditoría usa un código opaco de 16 hex para el actor y nunca expone UUID del recurso');
select is(jsonb_array_length(api.list_superadmin_tasks() -> 'items'), 1, 'las sedes sin aprobar generan una tarea hospital_review');

select * from finish();
rollback;
