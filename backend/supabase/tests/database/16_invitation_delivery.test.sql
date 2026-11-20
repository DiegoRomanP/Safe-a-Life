begin;
-- F6-4b: proyección de la entrega en la invitación, tareas de entrega fallida, eliminación de cuenta (V15) y purga de concesiones.
-- Todo se revierte con el rollback.
truncate app.invitation_batch_grants, app.invitation_retry_grants, app.invitation_response_history, app.invitations, app.invitation_batches,
  app.email_outbox, app.correction_requests, app.needs, app.sites, app.idempotency_records, app.session_barriers, app.admitted_sessions,
  app.donor_profiles, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(22);

create function pg_temp.u(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.nid(n int) returns uuid language sql immutable as $$ select ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.iid(n int) returns uuid language sql immutable as $$ select ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.sha(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create function pg_temp.login(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)))::text, true);
end $$;
create function pg_temp.q(p_sql text) returns text language plpgsql security definer as $$
declare v text;
begin execute p_sql into v; return v; end $$;
-- Invitación directa con su outbox vigente en el estado indicado.
create function pg_temp.mk(p_n int, p_need uuid, p_donor uuid, p_resp text, p_validity text, p_ostatus text, p_delivery text, p_provider text default null) returns uuid
language plpgsql as $$
declare v_batch uuid; v_inv uuid := pg_temp.iid(p_n); v_outbox uuid := md5('mk' || p_n)::uuid;
begin
  select batch_id into v_batch from app.invitation_batches where need_id = p_need limit 1;
  if v_batch is null then
    insert into app.invitation_batches (need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
    select need_id, hospital_id, created_by, 0, 0 from app.needs where need_id = p_need returning batch_id into v_batch;
  end if;
  insert into app.email_outbox (outbox_id, kind, recipient_user_id, idempotency_key, sealed_payload, status, attempt_count, lease_until, finalized_at,
                                provider_message_id, delivery_state, not_after)
  values (v_outbox, 'invitacion', p_donor, 'outbox-fixture-' || p_n,
          case when p_ostatus in ('pendiente', 'en_curso') then 'sellado' end, p_ostatus,
          case when p_ostatus = 'en_curso' then 1 else 0 end, case when p_ostatus = 'en_curso' then now() + interval '120 seconds' end,
          case when p_ostatus in ('pendiente', 'en_curso') then null else now() end, p_provider, p_delivery, now() + interval '1 day');
  insert into app.invitations (invitation_id, need_id, batch_id, hospital_id, donor_id, need_donor_code, validity, delivery, response, response_recorded_at,
                               confirm_token_hash, reject_token_hash, current_outbox_id)
  select v_inv, p_need, v_batch, hospital_id, p_donor, app.new_need_donor_code(p_need), p_validity, p_delivery, p_resp,
         case when p_resp <> 'sin_respuesta' then now() end, pg_temp.sha('mk' || p_n || 'c'), pg_temp.sha('mk' || p_n || 'r'), v_outbox
  from app.needs where need_id = p_need;
  return v_inv;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1 admin, 3 superadmin, 4 técnica, 5 worker, 11-15 donantes.
insert into auth.users (id, instance_id, aud, role, email)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-d-' || n || '@example.test'
from (select unnest(array[1, 3, 4, 5, 11, 12, 13, 14, 15]) n) t;
insert into app.user_accounts (user_id, role, display_name)
select pg_temp.u(n), case n when 1 then 'admin_hospitalario' when 3 then 'superadmin' when 4 then 'api_technical' when 5 then 'worker' else 'donante' end::app.actor_role, null
from (select unnest(array[1, 3, 4, 5, 11, 12, 13, 14, 15]) n) t;
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-000000000d01', 'Hospital D Uno', 'Hospital D Uno S.A.', true);
insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint) values
  ('30000000-0000-4000-8000-000000000d01', pg_temp.u(1), '10000000-0000-4000-8000-000000000d01', 'activa', 'a***@example.test');
insert into app.sites (site_id, hospital_id, public_name, public_address, latitude, longitude, is_active, is_approved) values
  ('22222222-2222-4222-8222-222222220d01', '10000000-0000-4000-8000-000000000d01', 'Sede D Uno', 'Cercado de Lima', -12.046374, -77.042793, true, true);
insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
select pg_temp.u(n), 'Donante D ' || n, 'A_POS', true, -12.05, -77.043, 'DEMO_ONLY-1', 'activo', now() from (select unnest(array[11, 12, 13, 14, 15]) n) t;
insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, created_at, expires_at)
select pg_temp.nid(k), '10000000-0000-4000-8000-000000000d01', '22222222-2222-4222-8222-222222220d01', pg_temp.u(1), 'RBC', 'A_POS', 5, 10, 'Normal', 'activa',
       now() - interval '72 hours', now() + interval '2 days'
from (select unnest(array[1, 2]) k) t;
-- I1: en curso (resultado ok). I2: vigente 'cur' + una fila anterior. I3: invalidada, en curso (fallo transitorio). I4: en curso (permanente).
select pg_temp.mk(1, pg_temp.nid(1), pg_temp.u(11), 'sin_respuesta', 'activa', 'en_curso', 'pendiente');
select pg_temp.mk(2, pg_temp.nid(1), pg_temp.u(12), 'sin_respuesta', 'activa', 'enviado', 'enviada', 'prov-cur');
select pg_temp.mk(3, pg_temp.nid(1), pg_temp.u(13), 'sin_respuesta', 'invalidada', 'en_curso', 'pendiente');
select pg_temp.mk(4, pg_temp.nid(1), pg_temp.u(14), 'sin_respuesta', 'activa', 'en_curso', 'pendiente');
-- Fila anterior de I2 (ya no vigente).
insert into app.email_outbox (outbox_id, kind, recipient_user_id, idempotency_key, status, attempt_count, finalized_at, provider_message_id, delivery_state, not_after)
values (md5('old2')::uuid, 'invitacion', pg_temp.u(12), 'outbox-fixture-old2', 'enviado', 1, now(), 'prov-old', 'enviada', now() + interval '1 day');
-- Eliminación de cuenta del donante 15: una confirmación (N1) y una invitación pendiente (N2) con correo pendiente; su historial.
select pg_temp.mk(5, pg_temp.nid(1), pg_temp.u(15), 'confirmada', 'activa', 'enviado', 'entregada', 'prov-5');
select pg_temp.mk(6, pg_temp.nid(2), pg_temp.u(15), 'sin_respuesta', 'activa', 'pendiente', 'pendiente');
insert into app.invitation_response_history (invitation_id, donor_id, response, channel) values (pg_temp.iid(5), pg_temp.u(15), 'confirmada', 'token');
-- Concesiones viejas y recientes.
insert into app.invitation_batch_grants (need_id, hospital_id, admin_id, secret_hash, created_at, expires_at, consumed_at) values
  (pg_temp.nid(1), '10000000-0000-4000-8000-000000000d01', pg_temp.u(1), pg_temp.sha('g-old'), now() - interval '80 hours', now() - interval '80 hours' + interval '2 minutes', now() - interval '80 hours'),
  (pg_temp.nid(2), '10000000-0000-4000-8000-000000000d01', pg_temp.u(1), pg_temp.sha('g-new'), now(), now() + interval '2 minutes', null);

set local role authenticated;
-- Proyección por intento del worker.
select pg_temp.login(pg_temp.u(5));
select is(api.worker_record_attempt(md5('mk1')::uuid, 1, 'ok', 200, 'prov-1', null) ->> 'status', 'enviado', 'el intento ok deja el correo enviado');
select is(pg_temp.q($$select delivery from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000001'$$), 'enviada', 'y la invitación pasa a enviada');
select pg_temp.login(pg_temp.u(4));
select is(api.ingest_email_event('evt-d-0000000001', 'prov-1', 'email.delivered', now()) ->> 'matched', 'true', 'el evento del proveedor encuentra la fila');
select is(pg_temp.q($$select delivery from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000001'$$), 'entregada', 'y la invitación pasa a entregada');
select is(api.ingest_email_event('evt-d-0000000003', 'prov-1', 'email.sent', now()) ->> 'matched', 'true', 'un evento «sent» tardío se registra');
select is(pg_temp.q($$select delivery from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000001'$$), 'entregada', 'sin retroceder la entrega');
select is(api.ingest_email_event('evt-d-0000000002', 'prov-old', 'email.bounced', now()) ->> 'matched', 'true', 'un evento de una fila anterior se registra');
select is(pg_temp.q($$select delivery from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000002'$$), 'enviada', 'pero no cambia la proyección de la invitación');
select pg_temp.login(pg_temp.u(5));
select is(api.worker_record_attempt(md5('mk4')::uuid, 1, 'permanente', 550, null, null) ->> 'status', 'fallido', 'un fallo permanente deja el correo fallido');
select is(pg_temp.q($$select delivery from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000004'$$), 'fallida', 'y la invitación, fallida');
select is(api.worker_record_attempt(md5('mk3')::uuid, 1, 'transitorio', 503, null, now() + interval '1 minute') ->> 'status', 'cancelado',
  'un fallo transitorio con la invitación invalidada no se reintenta: cancelado (V6)');
select is(pg_temp.q($$select coalesce(sealed_payload, 'sin-payload') || ':' || delivery_state from app.email_outbox where outbox_id = md5('mk3')::uuid$$), 'sin-payload:pendiente',
  'con el payload destruido y sin marcar la entrega como fallida');

-- Tareas del superadmin.
select pg_temp.login(pg_temp.u(3), 'aal2');
select is(jsonb_array_length(api.list_superadmin_tasks() -> 'items'), 1, 'la cola incluye solo la entrega fallida activa sin respuesta');
select is(api.list_superadmin_tasks() -> 'items' -> 0 ->> 'kind', 'delivery_failure', 'de tipo delivery_failure');
select is(api.list_superadmin_tasks() -> 'items' -> 0 ->> 'taskId', pg_temp.iid(4)::text, 'con la invitación como tarea');

-- Eliminación de cuenta (V15): el perfil ya no existe cuando se cierra.
reset role;
insert into app.correction_requests (request_id, donor_id, type, requested_fields, status)
values ('90000000-0000-4000-8000-000000000d15', pg_temp.u(15), 'eliminacion', array['deletion'], 'en_ejecucion');
delete from app.donor_profiles where donor_id = pg_temp.u(15);
set local role authenticated;
select pg_temp.login(pg_temp.u(4));
select is(api.finish_deletion('90000000-0000-4000-8000-000000000d15', repeat('a', 64)) ->> 'kind', 'ok', 'se cierra la eliminación');
select is(pg_temp.q($$select count(*)::text from app.invitations where donor_id is null and confirm_token_hash is null and reject_token_hash is null$$), '2',
  'las invitaciones del donante quedan anónimas y sin hashes (los enlaces dan 404)');
select is(pg_temp.q($$select validity from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000006'$$), 'invalidada', 'su invitación sin respuesta queda invalidada');
select is(pg_temp.q($$select status from app.email_outbox where outbox_id = md5('mk6')::uuid$$), 'cancelado', 'y su correo pendiente, cancelado');
select is(pg_temp.q($$select count(*)::text from app.invitation_response_history where invitation_id = '50000000-0000-4000-8000-000000000005'$$), '0', 'su historial se borra');
select pg_temp.login(pg_temp.u(1), 'aal2');
select is((api.get_own_need(pg_temp.nid(1)) -> 'need' ->> 'confirmedIntentCount')::int, 1, 'la confirmación anonimizada sigue contando');

-- Purga de concesiones.
select pg_temp.login(pg_temp.u(5));
select is(api.worker_purge_invitation_grants() ->> 'batchGrants', '1', 'el worker purga solo las concesiones de más de 72 h');
reset role;

select * from finish();
rollback;
