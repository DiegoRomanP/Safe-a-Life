begin;
-- F6-2: esquema de coordinación de invitaciones (matriz RBC, Haversine, lotes, invitaciones, historial). Todo se revierte con el rollback.
truncate app.invitation_response_history, app.invitations, app.invitation_batches, app.email_outbox, app.needs, app.sites,
  app.session_barriers, app.admitted_sessions, app.donor_profiles, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(78);

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000007a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-inv-admin-a@example.test'),
  ('00000000-0000-4000-8000-0000000007a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-inv-admin-b@example.test'),
  ('00000000-0000-4000-8000-0000000007a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-inv-super@example.test'),
  ('00000000-0000-4000-8000-0000000007b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-inv-donante-1@example.test'),
  ('00000000-0000-4000-8000-0000000007b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-inv-donante-2@example.test'),
  ('00000000-0000-4000-8000-0000000007b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-inv-donante-3@example.test');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000007a1', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000007a2', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000007a3', 'superadmin', null),
  ('00000000-0000-4000-8000-0000000007b1', 'donante', null),
  ('00000000-0000-4000-8000-0000000007b2', 'donante', null),
  ('00000000-0000-4000-8000-0000000007b3', 'donante', null);
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-0000000007a1', 'Hospital Invitaciones A', 'Hospital Invitaciones A S.A.', true),
  ('10000000-0000-4000-8000-0000000007a2', 'Hospital Invitaciones B', 'Hospital Invitaciones B S.A.', true);
insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint) values
  ('30000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1', 'activa', 'a***@example.test'),
  ('30000000-0000-4000-8000-0000000007a2', '00000000-0000-4000-8000-0000000007a2', '10000000-0000-4000-8000-0000000007a2', 'activa', 'b***@example.test');
insert into app.sites (site_id, hospital_id, public_name, public_address, latitude, longitude, is_active, is_approved) values
  ('22222222-2222-4222-8222-2222222207a1', '10000000-0000-4000-8000-0000000007a1', 'Sede A', 'Cercado de Lima', -12.046374, -77.042793, true, true);
-- Las donantes 1 y 3 tienen perfil: la 2 simula una cuenta ya eliminada (V15).
insert into app.donor_profiles (donor_id, status, email_verified_at) values
  ('00000000-0000-4000-8000-0000000007b1', 'incompleto', now()), ('00000000-0000-4000-8000-0000000007b3', 'incompleto', now());
insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, expires_at) values
  ('40000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1', '22222222-2222-4222-8222-2222222207a1',
   '00000000-0000-4000-8000-0000000007a1', 'RBC', 'O_POS', 3, 10, 'Normal', 'activa', now() + interval '2 days'),
  ('40000000-0000-4000-8000-0000000007a2', '10000000-0000-4000-8000-0000000007a1', '22222222-2222-4222-8222-2222222207a1',
   '00000000-0000-4000-8000-0000000007a1', 'RBC', 'A_POS', 3, 10, 'Normal', 'activa', now() + interval '2 days');
insert into app.email_outbox (outbox_id, kind, idempotency_key, sealed_payload, not_after) values
  ('50000000-0000-4000-8000-0000000007a1', 'invitacion', 'outbox-pgtap-inv-0000000001', 'sellado', now() + interval '1 day'),
  ('50000000-0000-4000-8000-0000000007a2', 'invitacion', 'outbox-pgtap-inv-0000000002', 'sellado', now() + interval '1 day'),
  ('50000000-0000-4000-8000-0000000007a3', 'invitacion', 'outbox-pgtap-inv-0000000003', 'sellado', now() + interval '1 day'),
  ('50000000-0000-4000-8000-0000000007a4', 'invitacion', 'outbox-pgtap-inv-0000000004', 'sellado', now() + interval '1 day');
insert into app.invitation_batches (batch_id, need_id, hospital_id, requested_by, created_invitation_count, queued_email_count) values
  ('60000000-0000-4000-8000-0000000007a1', '40000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
   '00000000-0000-4000-8000-0000000007a1', 2, 2),
  ('60000000-0000-4000-8000-0000000007a2', '40000000-0000-4000-8000-0000000007a2', '10000000-0000-4000-8000-0000000007a1',
   '00000000-0000-4000-8000-0000000007a1', 0, 0);
insert into app.invitations (invitation_id, need_id, batch_id, hospital_id, donor_id, need_donor_code, confirm_token_hash, reject_token_hash, current_outbox_id) values
  ('70000000-0000-4000-8000-0000000007a1', '40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
   '00000000-0000-4000-8000-0000000007b1', 'ABCDEFGHJK', repeat('a', 64), repeat('b', 64), '50000000-0000-4000-8000-0000000007a1'),
  ('70000000-0000-4000-8000-0000000007a2', '40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
   '00000000-0000-4000-8000-0000000007b2', 'MNPQRSTVWX', repeat('c', 64), repeat('d', 64), '50000000-0000-4000-8000-0000000007a2');
insert into app.invitation_response_history (invitation_id, donor_id, response, channel) values
  ('70000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-0000000007b1', 'confirmada', 'token'),
  ('70000000-0000-4000-8000-0000000007a2', '00000000-0000-4000-8000-0000000007b2', 'rechazada', 'token'),
  ('70000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-0000000007b3', 'confirmada', 'sesion');

create function pg_temp.login(p_uid text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"%s","amr":[{"method":"password","timestamp":1}]}', p_uid, p_aal), true);
end $$;
grant execute on function pg_temp.login(text, text) to authenticated, anon;
create function pg_temp.login_s(p_uid text, p_aal text, p_sid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"%s","session_id":"%s","amr":[{"method":"password","timestamp":1}]}', p_uid, p_aal, p_sid), true);
end $$;
grant execute on function pg_temp.login_s(text, text, text) to authenticated;
create function pg_temp.visible(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute 'select count(*)::int from (' || p_sql || ') t' into n; return n;
exception when insufficient_privilege then return -1;
end $$;
grant execute on function pg_temp.visible(text) to authenticated, anon;

-- Valores de referencia calculados con haversineMeters de TypeScript (haversine.ts, 17 cifras).
create temp table ref_haversine (lat1 float8, lon1 float8, lat2 float8, lon2 float8, meters float8);
insert into ref_haversine values
  (-12.046374,-77.042793,-12.1197,-77.0375,8173.7766965571891),
  (0,0,0,0,0),
  (0,0,0,1,111195.08023353291),
  (-12.046,-77.043,-12.046,-77.043,0),
  (40.7128,-74.006,51.5074,-0.1278,5570229.8736565234),
  (0,0,0,180,20015114.442035925),
  (89.9,10,-89.9,-170,20015114.442035925),
  (-12.0464,-77.0428,-12.0554,-77.0428,1000.7557221018342);
-- Pares compatibles de MATRIZ_RBC_ACADEMICA_V1 (compatibility.ts).
create temp table ref_rbc (donor text, recipient text);
insert into ref_rbc values
  ('O_NEG','O_NEG'),('O_NEG','O_POS'),('O_NEG','A_NEG'),('O_NEG','A_POS'),('O_NEG','B_NEG'),('O_NEG','B_POS'),('O_NEG','AB_NEG'),('O_NEG','AB_POS'),
  ('O_POS','O_POS'),('O_POS','A_POS'),('O_POS','B_POS'),('O_POS','AB_POS'),('A_NEG','A_NEG'),('A_NEG','A_POS'),('A_NEG','AB_NEG'),('A_NEG','AB_POS'),
  ('A_POS','A_POS'),('A_POS','AB_POS'),('B_NEG','B_NEG'),('B_NEG','B_POS'),('B_NEG','AB_NEG'),('B_NEG','AB_POS'),('B_POS','B_POS'),('B_POS','AB_POS'),
  ('AB_NEG','AB_NEG'),('AB_NEG','AB_POS'),('AB_POS','AB_POS');
grant select on ref_haversine, ref_rbc to authenticated, anon;

-- Estructura -----------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_class where oid in ('app.rbc_compatibility'::regclass, 'app.invitation_batches'::regclass, 'app.invitations'::regclass,
  'app.invitation_response_history'::regclass) and relrowsecurity and relforcerowsecurity), 4, 'las cuatro tablas tienen RLS habilitada y forzada');
select is((select count(*)::int from pg_policies where schemaname = 'app' and tablename in ('rbc_compatibility', 'invitation_batches', 'invitations', 'invitation_response_history')
  and 'app_privileged' = any (roles)), 4, 'cada tabla tiene su política TO app_privileged');
select is((select count(*)::int from app.rbc_compatibility), 27, 'la matriz tiene 27 filas');
select is((select count(*)::int from app.rbc_compatibility where is_exact), 8, 'ocho pares exactos');
select ok((select bool_and(is_exact = (donor = recipient)) from app.rbc_compatibility), 'is_exact equivale a donor = recipient');
select is_empty($$(select donor, recipient from app.rbc_compatibility except select donor, recipient from ref_rbc)
  union all (select donor, recipient from ref_rbc except select donor, recipient from app.rbc_compatibility)$$, 'los pares coinciden con la matriz de TypeScript');
select is((select count(*)::int from (values ('O_NEG'),('O_POS'),('A_NEG'),('A_POS'),('B_NEG'),('B_POS'),('AB_NEG'),('AB_POS')) d(x),
  (values ('O_NEG'),('O_POS'),('A_NEG'),('A_POS'),('B_NEG'),('B_POS'),('AB_NEG'),('AB_POS')) r(y)
  where exists (select 1 from app.rbc_compatibility c where c.donor = d.x and c.recipient = r.y) <> exists (select 1 from ref_rbc c where c.donor = d.x and c.recipient = r.y)),
  0, 'paridad de los 64 pares donante x receptor');
select throws_ok($$insert into app.rbc_compatibility values ('X_POS', 'O_POS', false)$$, '23514', null, 'la matriz rechaza grupos fuera del dominio');

-- Haversine ------------------------------------------------------------------------------------------------
select is((select provolatile::text from pg_proc where oid = 'app.haversine_m(double precision, double precision, double precision, double precision)'::regprocedure), 'i', 'haversine_m es immutable');
select is((select prorettype::regtype::text from pg_proc where oid = 'app.haversine_m(double precision, double precision, double precision, double precision)'::regprocedure), 'double precision', 'haversine_m devuelve double precision');
select cmp_ok((select max(abs(app.haversine_m(lat1, lon1, lat2, lon2) - meters)) from ref_haversine), '<=', 1e-6::float8, 'Haversine SQL vs TypeScript: diferencia máxima <= 1e-6 m');
select is((select count(*)::int from ref_haversine), 8, 'ocho valores de referencia de Haversine');
select ok(app.haversine_m(-12.046, -77.043, -12.046, -77.043) <= 0, 'borde de igualdad: distancia cero dentro de radio cero');
select cmp_ok(abs(app.haversine_m(-12.046374, -77.042793, -12.1197, -77.0375) - app.haversine_m(-12.1197, -77.0375, -12.046374, -77.042793)), '<=', 1e-6::float8, 'Haversine es simétrica');
select ok(has_function_privilege('app_privileged', 'app.haversine_m(double precision, double precision, double precision, double precision)', 'EXECUTE'), 'app_privileged ejecuta haversine_m');
select is(app.haversine_m(0::numeric, 0::numeric, 0::numeric, 1::numeric)::text, app.haversine_m(0::float8, 0::float8, 0::float8, 1::float8)::text, 'los argumentos numeric se convierten a double precision');

-- Restricciones --------------------------------------------------------------------------------------------
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007b1', 'BBBBBBBBBB', '50000000-0000-4000-8000-0000000007a3')$$, '23505', null, 'unique (necesidad, donante)');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c3', 'ABCDEFGHJK', '50000000-0000-4000-8000-0000000007a3')$$, '23505', null, 'unique (necesidad, código)');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, confirm_token_hash, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c3', 'CCCCCCCCCC', repeat('a', 64), '50000000-0000-4000-8000-0000000007a3')$$, '23505', null, 'confirm_token_hash es único');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, reject_token_hash, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c3', 'CCCCCCCCCC', repeat('b', 64), '50000000-0000-4000-8000-0000000007a3')$$, '23505', null, 'reject_token_hash es único');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, confirm_token_hash, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c3', 'CCCCCCCCCC', repeat('A', 64), '50000000-0000-4000-8000-0000000007a3')$$, '23514', null, 'el hash debe ser hex minúscula de 64');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c3', 'CCCCCCCCCC', null)$$, '23502', null, 'current_outbox_id es obligatorio');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c3', 'CCCCCCCCCC', '50000000-0000-4000-8000-00000000ffff')$$, '23503', null, 'current_outbox_id referencia app.email_outbox');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, validity, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c3', 'CCCCCCCCCC', 'rota', '50000000-0000-4000-8000-0000000007a3')$$, '23514', null, 'validity fuera del dominio');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a2',
  '00000000-0000-4000-8000-0000000007c3', 'CCCCCCCCCC', '50000000-0000-4000-8000-0000000007a3')$$, '23503', null, 'una invitación con hospital_id ajeno a la necesidad falla');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a2', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c3', 'CCCCCCCCCC', '50000000-0000-4000-8000-0000000007a3')$$, '23503', null, 'una invitación con batch_id de otra necesidad falla');
select throws_ok($$insert into app.invitation_batches (need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
  values ('40000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a2', '00000000-0000-4000-8000-0000000007a1', 0, 0)$$, '23503', null, 'un lote con hospital_id ajeno a la necesidad falla');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, delivery, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c3', 'CCCCCCCCCC', 'rota', '50000000-0000-4000-8000-0000000007a3')$$, '23514', null, 'delivery fuera del dominio');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, response, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c3', 'CCCCCCCCCC', 'rota', '50000000-0000-4000-8000-0000000007a3')$$, '23514', null, 'response fuera del dominio');
select lives_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  null, 'DDDDDDDDDD', '50000000-0000-4000-8000-0000000007a3'), ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  null, 'EEEEEEEEEE', '50000000-0000-4000-8000-0000000007a4')$$, 'varias invitaciones con donor_id nulo conviven (V15)');
select is((select count(*)::int from pg_constraint where contype = 'f' and (conrelid = 'app.invitations'::regclass or conrelid = 'app.invitation_response_history'::regclass)
  and confrelid in ('app.donor_profiles'::regclass, 'auth.users'::regclass)), 0, 'donor_id no tiene clave foránea a perfiles ni a auth.users');
select throws_ok($$insert into app.invitation_batches (need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
  values ('40000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-0000000007a1', 51, 0)$$, '23514', null, 'el lote admite como máximo 50 invitaciones');
select ok(app.new_need_donor_code('40000000-0000-4000-8000-0000000007a1') ~ '^[0-9A-HJKMNP-TV-Z]{10}$', 'el generador devuelve 10 caracteres Crockford');
select is((select count(distinct app.new_need_donor_code('40000000-0000-4000-8000-0000000007a1')) from generate_series(1, 200)), 200::bigint, 'el generador no repite códigos en 200 llamadas');
select throws_ok($$insert into app.invitations (need_id, batch_id, hospital_id, donor_id, need_donor_code, current_outbox_id)
  values ('40000000-0000-4000-8000-0000000007a1', '60000000-0000-4000-8000-0000000007a1', '10000000-0000-4000-8000-0000000007a1',
  '00000000-0000-4000-8000-0000000007c4', 'abcdefghjk', '50000000-0000-4000-8000-0000000007a3')$$, '23514', null, 'need_donor_code debe ser Crockford en mayúsculas');

-- Historial append-only -----------------------------------------------------------------------------------
select throws_ok($$update app.invitation_response_history set response = 'rechazada' where donor_id = '00000000-0000-4000-8000-0000000007b1'$$, 'P0001', null, 'UPDATE del historial está prohibido');
select throws_ok($$update app.invitation_response_history set response = 'rechazada' where donor_id = '00000000-0000-4000-8000-0000000007b2'$$, 'P0001', null, 'UPDATE del historial está prohibido aunque no exista el perfil');
select throws_ok($$delete from app.invitation_response_history where donor_id = '00000000-0000-4000-8000-0000000007b1'$$, 'P0001', null, 'DELETE falla mientras existe el perfil del donante');
select lives_ok($$delete from app.invitation_response_history where donor_id = '00000000-0000-4000-8000-0000000007b2'$$, 'DELETE pasa cuando el perfil ya no existe');
select is((select count(*)::int from app.invitation_response_history), 2, 'solo quedaron las filas de las donantes con perfil');
select throws_ok($$insert into app.invitation_response_history (invitation_id, donor_id, response, channel)
  values ('70000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-0000000007b1', 'sin_respuesta', 'token')$$, '23514', null, 'el historial solo admite confirmada o rechazada');
select throws_ok($$insert into app.invitation_response_history (invitation_id, donor_id, response, channel)
  values ('70000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-0000000007b1', 'confirmada', 'correo')$$, '23514', null, 'el historial solo admite canal token o sesion');
select throws_ok($$insert into app.invitation_response_history (invitation_id, donor_id, response, channel)
  values ('70000000-0000-4000-8000-00000000ffff', '00000000-0000-4000-8000-0000000007b1', 'confirmada', 'token')$$, '23503', null, 'invitation_id referencia invitations');

-- Propiedad y privilegios ---------------------------------------------------------------------------------
select is((select string_agg(a.attname, ',' order by a.attname) from pg_attribute a where a.attrelid = 'app.invitations'::regclass and a.attnum > 0 and not a.attisdropped
  and has_column_privilege('authenticated', 'app.invitations', a.attname, 'SELECT')), 'batch_id,created_at,delivery,hospital_id,invitation_id,need_id,response,validity',
  'authenticated solo lee las ocho columnas permitidas de invitations');
select is((select count(*)::int from (values ('confirm_token_hash'), ('reject_token_hash'), ('donor_id'), ('need_donor_code'), ('current_outbox_id'), ('token_consumed_at'), ('response_recorded_at')) c(n)
  where has_column_privilege('authenticated', 'app.invitations', c.n, 'SELECT') or has_column_privilege('anon', 'app.invitations', c.n, 'SELECT')), 0, 'hashes, donor_id, need_donor_code y el resto son invisibles');
select is((select count(*)::int from (values ('app.rbc_compatibility'), ('app.invitation_batches'), ('app.invitations'), ('app.invitation_response_history')) t(n),
  (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv) where has_table_privilege('authenticated', t.n, p.priv) or has_table_privilege('anon', t.n, p.priv)), 0, 'authenticated y anon no escriben ninguna tabla');
select ok(not has_table_privilege('authenticated', 'app.rbc_compatibility', 'SELECT') and not has_any_column_privilege('authenticated', 'app.rbc_compatibility', 'SELECT'), 'authenticated no accede a rbc_compatibility');
select ok(not has_any_column_privilege('anon', 'app.invitations', 'SELECT') and not has_any_column_privilege('anon', 'app.invitation_batches', 'SELECT')
  and not has_any_column_privilege('anon', 'app.invitation_response_history', 'SELECT'), 'anon no lee ninguna tabla');
select ok((select bool_and(has_table_privilege('app_privileged', t, 'SELECT, INSERT, UPDATE, DELETE')) from (values ('app.invitation_batches'), ('app.invitations')) x(t))
  and has_table_privilege('app_privileged', 'app.invitation_response_history', 'SELECT, INSERT, DELETE'), 'app_privileged opera lotes e invitaciones y agrega/borra historial');
select ok(not has_table_privilege('app_privileged', 'app.invitation_response_history', 'UPDATE') and not has_any_column_privilege('app_privileged', 'app.invitation_response_history', 'UPDATE'), 'app_privileged no tiene UPDATE sobre el historial');
select ok(has_table_privilege('app_privileged', 'app.rbc_compatibility', 'SELECT') and not has_any_column_privilege('app_privileged', 'app.rbc_compatibility', 'INSERT, UPDATE')
  and not has_table_privilege('app_privileged', 'app.rbc_compatibility', 'DELETE'), 'app_privileged solo lee rbc_compatibility');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'app.new_need_donor_code(uuid)'::regprocedure), 'postgres', 'el generador de códigos es de postgres (INVOKER)');
select ok(not (select prosecdef from pg_proc where oid = 'app.new_need_donor_code(uuid)'::regprocedure), 'el generador no es SECURITY DEFINER');
select is((select count(*)::int from (values ('anon'), ('authenticated'), ('service_role')) r(role) where has_function_privilege(r.role, 'app.new_need_donor_code(uuid)', 'EXECUTE')), 0, 'solo app_privileged ejecuta el generador');
select ok(has_function_privilege('app_privileged', 'app.new_need_donor_code(uuid)', 'EXECUTE'), 'app_privileged ejecuta el generador');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('api', 'app') and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'),
  array['delete_mfa_factors', 'delete_stale_assisted_account', 'purge_inert_auth_users', 'user_email', 'user_id_by_email', 'worker_delete_inert_user', 'worker_revoke_sessions'],
  'las DEFINER de postgres siguen siendo siete');

-- RLS ------------------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000007a1', 'aal2');
select is(pg_temp.visible('select invitation_id from app.invitations'), 4, 'admin del hospital A ve sus cuatro invitaciones');
select is(pg_temp.visible('select donor_id from app.invitations'), -1, 'admin: leer donor_id falla por privilegio de columna');
select is(pg_temp.visible('select * from app.invitations'), -1, 'admin: select * falla (hay columnas no concedidas)');
select is(pg_temp.visible('select batch_id from app.invitation_batches'), 2, 'admin del hospital A ve sus dos lotes');
select is(pg_temp.visible('select id from app.invitation_response_history'), 0, 'admin no lee el historial de respuestas');
select pg_temp.login('00000000-0000-4000-8000-0000000007a1', 'aal1');
select is(pg_temp.visible('select invitation_id from app.invitations'), 0, 'admin con AAL1 no ve invitaciones');
select pg_temp.login('00000000-0000-4000-8000-0000000007a2', 'aal2');
select is(pg_temp.visible('select invitation_id from app.invitations') + pg_temp.visible('select batch_id from app.invitation_batches'), 0, 'admin de otro hospital no ve invitaciones ni lotes');
select pg_temp.login('00000000-0000-4000-8000-0000000007a3', 'aal2');
select is(pg_temp.visible('select invitation_id from app.invitations'), 4, 'superadmin ve todas las invitaciones');
select is(pg_temp.visible('select batch_id from app.invitation_batches'), 0, 'superadmin no tiene política sobre lotes (spec 2.1)');
select is(pg_temp.visible('select id from app.invitation_response_history'), 0, 'superadmin no lee el historial de respuestas');
select pg_temp.login('00000000-0000-4000-8000-0000000007b1', 'aal1');
select is(pg_temp.visible('select id from app.invitation_response_history'), 1, 'el donante 1 lee solo su propia fila del historial');
select is(pg_temp.visible('select id from app.invitation_response_history where donor_id = ''00000000-0000-4000-8000-0000000007b3'''), 0, 'el donante 1 no ve la fila del donante 3');
select pg_temp.login('00000000-0000-4000-8000-0000000007b3', 'aal1');
select is(pg_temp.visible('select id from app.invitation_response_history'), 1, 'el donante 3 lee solo su propia fila');
select pg_temp.login('00000000-0000-4000-8000-0000000007b1', 'aal1');
select is(pg_temp.visible('select invitation_id from app.invitations') + pg_temp.visible('select batch_id from app.invitation_batches'), 0, 'el donante no ve invitaciones ni lotes');
select pg_temp.login('00000000-0000-4000-8000-0000000007a1', 'aal2');
select is(pg_temp.visible('select id from app.invitation_response_history'), 0, 'el admin no ve el historial del donante');
-- Barrera de sesión: abierta (sin sesión admitida) niega a admin, superadmin y donante; cerrada con la sesión admitida los readmite.
reset role;
insert into app.session_barriers (user_id, generation, state) values
  ('00000000-0000-4000-8000-0000000007a1', 1, 'abierta'), ('00000000-0000-4000-8000-0000000007a3', 1, 'abierta'), ('00000000-0000-4000-8000-0000000007b1', 1, 'abierta');
set local role authenticated;
select pg_temp.login_s('00000000-0000-4000-8000-0000000007a1', 'aal2', 'a0000000-0000-4000-8000-0000000007a1');
select is(pg_temp.visible('select invitation_id from app.invitations') + pg_temp.visible('select batch_id from app.invitation_batches'), 0, 'barrera abierta: el admin no ve invitaciones ni lotes');
select pg_temp.login_s('00000000-0000-4000-8000-0000000007a3', 'aal2', 'a0000000-0000-4000-8000-0000000007a3');
select is(pg_temp.visible('select invitation_id from app.invitations'), 0, 'barrera abierta: el superadmin no ve invitaciones');
select pg_temp.login_s('00000000-0000-4000-8000-0000000007b1', 'aal1', 'a0000000-0000-4000-8000-0000000007b1');
select is(pg_temp.visible('select id from app.invitation_response_history'), 0, 'barrera abierta: el donante no ve su historial');
reset role;
update app.session_barriers set state = 'cerrada' where user_id in ('00000000-0000-4000-8000-0000000007a3', '00000000-0000-4000-8000-0000000007b1');
insert into app.admitted_sessions (session_id, user_id, generation) values
  ('a0000000-0000-4000-8000-0000000007a3', '00000000-0000-4000-8000-0000000007a3', 1), ('a0000000-0000-4000-8000-0000000007b1', '00000000-0000-4000-8000-0000000007b1', 1);
set local role authenticated;
select pg_temp.login_s('00000000-0000-4000-8000-0000000007b1', 'aal1', 'a0000000-0000-4000-8000-0000000007b1');
select is(pg_temp.visible('select id from app.invitation_response_history'), 1, 'barrera cerrada con sesión admitida: el donante lee su historial');
select pg_temp.login_s('00000000-0000-4000-8000-0000000007a3', 'aal2', 'a0000000-0000-4000-8000-0000000007a3');
select is(pg_temp.visible('select invitation_id from app.invitations'), 4, 'barrera cerrada con sesión admitida: el superadmin ve las invitaciones');
select pg_temp.login_s('00000000-0000-4000-8000-0000000007b1', 'aal1', 'a0000000-0000-4000-8000-0000000007ff');
select is(pg_temp.visible('select id from app.invitation_response_history'), 0, 'barrera cerrada con otra sesión: el donante no ve su historial');
reset role;
set local role anon;
select is(pg_temp.visible('select invitation_id from app.invitations') + pg_temp.visible('select id from app.invitation_response_history'), -2, 'anon no lee invitaciones ni historial');
reset role;

select * from finish();
rollback;
