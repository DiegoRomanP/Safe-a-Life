begin;
-- F6-4a: cascadas de cierre/cancelación (RF-INV-08), indisponibilidad del donante (RF-INV-07), vencimiento y confirmedIntentCount.
-- Todo se revierte con el rollback.
truncate app.invitation_retry_grants, app.invitation_response_history, app.invitations, app.invitation_batches, app.email_outbox, app.needs, app.sites,
  app.idempotency_records, app.session_barriers, app.admitted_sessions, app.donor_profiles, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(25);

create function pg_temp.u(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.nid(n int) returns uuid language sql immutable as $$ select ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.iid(n int) returns uuid language sql immutable as $$ select ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.sha(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create function pg_temp.login(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
    'email', 'pgtap-c-' || right(p_uid::text, 2) || '@example.test', 'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)))::text, true);
end $$;
create function pg_temp.ht(p_need uuid, p_status text) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('needId', p_need::text), jsonb_build_array('status', p_status))) $$;
create function pg_temp.hp(p_available boolean) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('isAvailable', p_available), jsonb_build_array('latitude', null::numeric), jsonb_build_array('longitude', null::numeric))) $$;
create function pg_temp.q(p_sql text) returns text language plpgsql security definer as $$
declare v text;
begin execute p_sql into v; return v; end $$;
create function pg_temp.mk(p_n int, p_need uuid, p_donor uuid, p_resp text) returns uuid language plpgsql as $$
declare v_batch uuid; v_inv uuid := pg_temp.iid(p_n); v_outbox uuid := md5('mk' || p_n)::uuid;
begin
  select batch_id into v_batch from app.invitation_batches where need_id = p_need limit 1;
  if v_batch is null then
    insert into app.invitation_batches (need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
    select need_id, hospital_id, created_by, 0, 0 from app.needs where need_id = p_need returning batch_id into v_batch;
  end if;
  insert into app.email_outbox (outbox_id, kind, recipient_user_id, idempotency_key, sealed_payload, not_after)
  values (v_outbox, 'invitacion', p_donor, 'outbox-fixture-' || p_n, 'sellado', now() + interval '1 day');
  insert into app.invitations (invitation_id, need_id, batch_id, hospital_id, donor_id, need_donor_code, response, response_recorded_at,
                               confirm_token_hash, reject_token_hash, current_outbox_id)
  select v_inv, p_need, v_batch, hospital_id, p_donor, app.new_need_donor_code(p_need), p_resp, case when p_resp <> 'sin_respuesta' then now() end,
         pg_temp.sha('mk' || p_n || 'c'), pg_temp.sha('mk' || p_n || 'r'), v_outbox
  from app.needs where need_id = p_need;
  return v_inv;
end $$;
create temp table res (label text primary key, j jsonb);
grant all on res to authenticated;
grant execute on all functions in schema pg_temp to authenticated;

-- 1 admin, 4 técnica, 5 worker, 11-13 donantes.
insert into auth.users (id, instance_id, aud, role, email)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-c-' || n || '@example.test'
from (select unnest(array[1, 4, 5, 11, 12, 13]) n) t;
insert into app.user_accounts (user_id, role, display_name)
select pg_temp.u(n), case n when 1 then 'admin_hospitalario' when 4 then 'api_technical' when 5 then 'worker' else 'donante' end::app.actor_role, null
from (select unnest(array[1, 4, 5, 11, 12, 13]) n) t;
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-000000000c01', 'Hospital C Uno', 'Hospital C Uno S.A.', true);
insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint) values
  ('30000000-0000-4000-8000-000000000c01', pg_temp.u(1), '10000000-0000-4000-8000-000000000c01', 'activa', 'a***@example.test');
insert into app.sites (site_id, hospital_id, public_name, public_address, latitude, longitude, is_active, is_approved) values
  ('22222222-2222-4222-8222-222222220c01', '10000000-0000-4000-8000-000000000c01', 'Sede C Uno', 'Cercado de Lima', -12.046374, -77.042793, true, true);
insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
select pg_temp.u(n), 'Donante C ' || n, 'A_POS', true, -12.05, -77.043, 'DEMO_ONLY-1', 'activo', now() from (select unnest(array[11, 12, 13]) n) t;
-- N1 (cerrar), N2 (cancelar), N3 (vencer, plazo ya cumplido), N4 (participación de d13).
insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, created_at, expires_at)
select pg_temp.nid(k), '10000000-0000-4000-8000-000000000c01', '22222222-2222-4222-8222-222222220c01', pg_temp.u(1), 'RBC', 'A_POS', 2, 10, 'Normal', 'activa',
       now() - interval '72 hours', now() + exp
from (values (1, interval '2 days'), (2, interval '2 days'), (3, interval '-1 hour'), (4, interval '2 days'), (5, interval '2 days')) t (k, exp);
-- N1: I1 sin respuesta (pendiente), I2 confirmada (d12). N2: I3 sin respuesta. N3: I4 sin respuesta, I5 confirmada.
-- N4: I6 sin respuesta de d13 (se retira) e I7 confirmada de d13 en N5 (no se toca).
select pg_temp.mk(1, pg_temp.nid(1), pg_temp.u(11), 'sin_respuesta');
select pg_temp.mk(2, pg_temp.nid(1), pg_temp.u(12), 'confirmada');
select pg_temp.mk(3, pg_temp.nid(2), pg_temp.u(11), 'sin_respuesta');
select pg_temp.mk(4, pg_temp.nid(3), pg_temp.u(11), 'sin_respuesta');
select pg_temp.mk(5, pg_temp.nid(3), pg_temp.u(12), 'confirmada');
select pg_temp.mk(6, pg_temp.nid(4), pg_temp.u(13), 'sin_respuesta');
select pg_temp.mk(7, pg_temp.nid(5), pg_temp.u(13), 'confirmada');

set local role authenticated;
-- confirmedIntentCount real en la lectura de la necesidad.
select pg_temp.login(pg_temp.u(1), 'aal2');
select is((api.get_own_need(pg_temp.nid(1)) -> 'need' ->> 'confirmedIntentCount')::int, 1, 'confirmedIntentCount cuenta las confirmaciones reales');
select is((api.get_own_need(pg_temp.nid(2)) -> 'need' ->> 'confirmedIntentCount')::int, 0, 'y vale 0 sin confirmaciones');

-- Cerrar la necesidad (RF-INV-08).
insert into res values ('close', api.transition_own_need('clave-cierre-0000001', pg_temp.ht(pg_temp.nid(1), 'cerrada'), pg_temp.nid(1), 'cerrada'));
select is((select j ->> 'kind' from res where label = 'close'), 'ok', 'el admin cierra la necesidad');
select is((select j -> 'need' ->> 'confirmedIntentCount' from res where label = 'close'), '1', 'la respuesta de la transición ya trae el conteo real');
select is(pg_temp.q($$select validity from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000001'$$), 'invalidada', 'cerrar invalida la invitación sin respuesta');
select is(pg_temp.q($$select status || ':' || coalesce(sealed_payload, 'sin-payload') from app.email_outbox where outbox_id = md5('mk1')::uuid$$), 'cancelado:sin-payload',
  'y cancela su correo pendiente con el payload destruido');
select is(pg_temp.q($$select validity || ':' || response from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000002'$$), 'activa:confirmada',
  'una confirmación no se toca');

-- Cancelar.
select is(api.transition_own_need('clave-cancel-000001', pg_temp.ht(pg_temp.nid(2), 'cancelada'), pg_temp.nid(2), 'cancelada') ->> 'kind', 'ok', 'el admin cancela la necesidad');
select is(pg_temp.q($$select validity from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000003'$$), 'invalidada', 'cancelar invalida la invitación sin respuesta');
select is(pg_temp.q($$select status from app.email_outbox where outbox_id = md5('mk3')::uuid$$), 'cancelado', 'y cancela su correo');
select is(api.transition_own_need('clave-cancel-000002', pg_temp.ht(pg_temp.nid(2), 'cerrada'), pg_temp.nid(2), 'cerrada') ->> 'kind', 'conflict', 'una necesidad terminal no vuelve a transitar');
select pg_temp.login(pg_temp.u(11));
select is(api.transition_own_need('clave-cancel-000003', pg_temp.ht(pg_temp.nid(4), 'cerrada'), pg_temp.nid(4), 'cerrada') ->> 'kind', 'forbidden', 'un donante no transita necesidades');

-- Indisponibilidad del donante (RF-INV-07): solo sus invitaciones sin respuesta; una confirmación sigue en pie.
select pg_temp.login(pg_temp.u(13));
select is(api.update_own_participation('clave-partic-000001', pg_temp.hp(false), false, null, null, null) ->> 'kind', 'ok', 'el donante se marca no disponible');
select is(pg_temp.q($$select validity from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000006'$$), 'invalidada', 'su invitación sin respuesta queda invalidada');
select is(pg_temp.q($$select status from app.email_outbox where outbox_id = md5('mk6')::uuid$$), 'cancelado', 'y su correo pendiente, cancelado');
select is(pg_temp.q($$select validity || ':' || response from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000007'$$), 'activa:confirmada', 'su confirmación se conserva');
select is(pg_temp.q($$select status from app.needs where need_id = '40000000-0000-4000-8000-000000000005'$$), 'activa', 'y la necesidad de esa confirmación no cambia');
select is(api.update_own_participation('clave-partic-000002', pg_temp.hp(true), true, null, null, null) -> 'profile' ->> 'isAvailable', 'true', 'volver a disponible no resucita invitaciones');
select is(pg_temp.q($$select validity from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000006'$$), 'invalidada', 'la invitación invalidada sigue invalidada');

-- Vencimiento (worker): solo con el rol worker.
select pg_temp.login(pg_temp.u(1), 'aal2');
select is(api.worker_expire_needs() ->> 'kind', 'forbidden', 'un admin no ejecuta el vencimiento');
select pg_temp.login(pg_temp.u(5));
select is(api.worker_expire_needs(0) ->> 'kind', 'invalid', 'límite fuera de rango: invalid');
insert into res values ('expire', api.worker_expire_needs());
select is((select j ->> 'needs' from res where label = 'expire'), '1', 'vence la necesidad con el plazo cumplido');
select is(pg_temp.q($$select validity || ':' || response from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000004'$$), 'vencida:sin_respuesta',
  'su invitación sin respuesta pasa a vencida');
select is(pg_temp.q($$select status || ':' || coalesce(sealed_payload, 'sin-payload') from app.email_outbox where outbox_id = md5('mk4')::uuid$$), 'vencido:sin-payload',
  'y su correo a vencido con el payload destruido');
select is(pg_temp.q($$select validity from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000005'$$), 'activa', 'las invitaciones con respuesta no se vencen');
reset role;

select * from finish();
rollback;
