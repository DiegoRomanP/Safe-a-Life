begin;
-- need-coverage: cobertura agregada de donantes compatibles (mapa del hospital). Todo se revierte con el rollback.
-- Cubre: autorización (AAL2), aislamiento entre hospitales (sin IDOR), supresión k < 3, forma cerrada de la respuesta (sin ids,
-- nombres ni posiciones individuales) y paridad con el lote real (api.request_invitation_batch).
truncate app.invitation_response_history, app.invitations, app.invitation_batches, app.email_outbox, app.needs, app.sites, app.assisted_signups,
  app.idempotency_records, app.correction_requests, app.session_barriers, app.admitted_sessions, app.donor_profiles, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(16);

-- Ayudas ---------------------------------------------------------------------------------------------------------
create function pg_temp.u(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.nid(n int) returns uuid language sql immutable as $$ select ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.hid(n int) returns uuid language sql immutable as $$ select ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.sha(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create function pg_temp.slots(tag text, n int) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('outboxId', md5(tag || 'o' || i)::uuid, 'invitationId', md5(tag || 'i' || i)::uuid,
    'confirmHash', pg_temp.sha(tag || 'c' || i), 'rejectHash', pg_temp.sha(tag || 'r' || i), 'sealedPayload', 'sellado-' || tag || i) order by i)
  from generate_series(1, n) i
$$;
create function pg_temp.hb(p_need uuid) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('needId', p_need::text))) $$;
create function pg_temp.login(p_uid uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"%s","amr":[{"method":"password","timestamp":1}]}', p_uid, p_aal), true);
end $$;
-- Ejecuta un lote real y lo deshace: devuelve cuántas invitaciones crea (sin gastar cuota ni dejar rastro).
create function pg_temp.batch_size(p_need uuid, p_n int) returns text language plpgsql security definer as $$
declare v_res jsonb; v_secret constant text := repeat('ab', 32);
begin
  delete from app.invitation_batch_grants where need_id = p_need and consumed_at is null;
  insert into app.invitation_batch_grants (need_id, hospital_id, admin_id, secret_hash, expires_at)
  select n.need_id, n.hospital_id, m.user_id, encode(sha256(convert_to(v_secret, 'UTF8')), 'hex'), now() + interval '2 minutes'
  from app.needs n join app.hospital_memberships m on m.hospital_id = n.hospital_id and m.status = 'activa' where n.need_id = p_need limit 1;
  v_res := api.request_invitation_batch('clave-cov-0000000001', pg_temp.hb(p_need), p_need, v_secret, pg_temp.slots('cov', p_n));
  raise exception 'rollback:%:%', v_res ->> 'kind', v_res ->> 'createdInvitationCount';
exception when raise_exception then
  return substr(sqlerrm, 10);
end $$;
create temp table res (label text primary key, j jsonb);
grant all on res to authenticated;
grant execute on all functions in schema pg_temp to authenticated;

-- Fixtures --------------------------------------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-cov-' || n || '@example.test'
from (select generate_series(1, 4) n union all select generate_series(11, 24)) t;
insert into app.user_accounts (user_id, role, display_name)
select pg_temp.u(n), case n when 1 then 'admin_hospitalario' when 2 then 'admin_hospitalario' when 4 then 'api_technical' else 'donante' end::app.actor_role, null
from (select generate_series(1, 2) n union select 4 union all select generate_series(11, 24)) t;
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  (pg_temp.hid(1), 'Hospital Cobertura A', 'Hospital Cobertura A S.A.', true), (pg_temp.hid(2), 'Hospital Cobertura B', 'Hospital Cobertura B S.A.', true);
insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint) values
  ('30000000-0000-4000-8000-000000000901', pg_temp.u(1), pg_temp.hid(1), 'activa', 'a***@example.test'),
  ('30000000-0000-4000-8000-000000000902', pg_temp.u(2), pg_temp.hid(2), 'activa', 'b***@example.test');
insert into app.sites (site_id, hospital_id, public_name, public_address, public_instructions, latitude, longitude, is_active, is_approved) values
  ('22222222-2222-4222-8222-222222220901', pg_temp.hid(1), 'Sede Cobertura A', 'Cercado de Lima', null, -12.046374, -77.042793, true, true),
  ('22222222-2222-4222-8222-222222220902', pg_temp.hid(2), 'Sede Cobertura B', 'Miraflores', null, -12.119700, -77.037500, true, true);
-- Donantes (lon -77,043 salvo indicación). Para una necesidad A_POS son compatibles: A_POS, A_NEG, O_POS y O_NEG.
--  11..14: A_POS en la misma celda de 0,01° (lat -12,061..-12,064, a 1,6-2,0 km): celda con 4 -> visible, anillo 1.
--  15: O_POS solo en su celda (0,5 km): contado en el anillo 1, celda suprimida (k < 3).
--  16: A_POS a 3,2 km: anillo 2, celda suprimida.
--  17: B_POS (incompatible); 18: no disponible; 19: fuera del radio de 10 km (11,5 km); 20: perfil incompleto.
create temp table donors (n int, blood text, lat numeric, avail boolean, status text);
insert into donors values
  (11, 'A_POS', -12.061, true, 'activo'), (12, 'A_POS', -12.062, true, 'activo'), (13, 'A_POS', -12.063, true, 'activo'), (14, 'A_POS', -12.064, true, 'activo'),
  (15, 'O_POS', -12.051, true, 'activo'),
  (16, 'A_POS', -12.075, true, 'activo'),
  (17, 'B_POS', -12.049, true, 'activo'),
  (18, 'A_POS', -12.050, false, 'activo'),
  (19, 'A_POS', -12.150, true, 'activo'),
  (20, 'A_POS', null, null, 'incompleto');
insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
select pg_temp.u(n), case when status = 'activo' then 'Donante Sintético ' || n end, case when status = 'activo' then blood end, avail,
       lat, case when lat is not null then -77.043 end, case when lat is not null then 'DEMO_ONLY-1' end, status, now()
from donors;
insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, created_at, expires_at)
select pg_temp.nid(k), pg_temp.hid(h), s, pg_temp.u(h), 'RBC', 'A_POS', 3, 10, 'Normal', status, now() - interval '1 hour', now() + interval '2 days'
from (values
  (1, 1, '22222222-2222-4222-8222-222222220901'::uuid, 'activa'),
  (2, 1, '22222222-2222-4222-8222-222222220901'::uuid, 'borrador'),
  (3, 1, '22222222-2222-4222-8222-222222220901'::uuid, 'cancelada'),
  (4, 2, '22222222-2222-4222-8222-222222220902'::uuid, 'activa')
) t (k, h, s, status);

-- Autorización -----------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select is(api.get_need_coverage(pg_temp.nid(1)) ->> 'kind', 'unauthenticated', 'sin sesión: unauthenticated');
select pg_temp.login(pg_temp.u(11), 'aal2');
select is(api.get_need_coverage(pg_temp.nid(1)) ->> 'kind', 'forbidden', 'un donante no ve la cobertura');
select pg_temp.login(pg_temp.u(1), 'aal1');
select is(api.get_need_coverage(pg_temp.nid(1)) ->> 'kind', 'mfa_required', 'el admin con AAL1 recibe mfa_required');

-- Cobertura propia ---------------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u(1), 'aal2');
insert into res values ('own', api.get_need_coverage(pg_temp.nid(1)));
select is((select j ->> 'kind' from res where label = 'own'), 'ok', 'el admin ve la cobertura de su necesidad activa');
select is((select (j ->> 'compatibleCount')::int from res where label = 'own'), 6, 'cuenta solo compatibles, disponibles, activos y dentro del radio');
select is((select (j ->> 'nextBatchCount')::int from res where label = 'own'), 6, 'nextBatchCount = min(compatibles, batchSize(meta 3) = 6)');
select is((select jsonb_path_query_array(j, '$.rings[*].count') from res where label = 'own'), '[5,1,0,0]'::jsonb, 'anillos por radio: 5 en el primero, 1 en el segundo');
select is((select j -> 'cells' from res where label = 'own'), '[{"latitude": -12.065, "longitude": -77.045, "count": 4}]'::jsonb,
  'solo se devuelve la celda con >= 3 donantes y con su centro, no con posiciones individuales');
select is((select j -> 'site' from res where label = 'own'), '{"latitude": -12.046374, "longitude": -77.042793}'::jsonb, 'devuelve la sede propia');
select is((select array_agg(k order by k) from res, jsonb_object_keys(j) k where label = 'own'),
  array['cells', 'compatibleCount', 'kind', 'nextBatchCount', 'radiusKm', 'rings', 'site'], 'forma cerrada: ningún id, nombre ni distancia individual');

-- Aislamiento y estados ----------------------------------------------------------------------------------------------------
select is(api.get_need_coverage(pg_temp.nid(4)) ->> 'kind', 'not_found', 'una necesidad de otro hospital es indistinguible de una inexistente');
select is(api.get_need_coverage(pg_temp.nid(2)) ->> 'kind', 'ok', 'también se ve antes de publicar (borrador)');
select is(api.get_need_coverage(pg_temp.nid(3)) ->> 'kind', 'conflict', 'una necesidad cancelada no tiene cobertura');
select is(api.get_need_coverage(null) ->> 'kind', 'invalid', 'id nulo: invalid');

-- Paridad con el lote real ---------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(pg_temp.batch_size(pg_temp.nid(1), 6), 'created:6', 'paridad: el lote real crea tantas invitaciones como candidatos cuenta la cobertura');

-- Privilegios ----------------------------------------------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$select api.get_need_coverage('40000000-0000-4000-8000-000000000001')$$, '42501', null, 'anon no puede ejecutar la función');

select * from finish();
rollback;
