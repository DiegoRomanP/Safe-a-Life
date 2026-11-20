begin;
-- SP-04: el replay de create_assisted_signup revalida el hospital del actor (reasignado A -> B). Todo se revierte.
truncate app.assisted_signups, app.email_outbox, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(12);

insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'replay-admin@example.test', now() - interval '1 day');
insert into app.user_accounts (user_id, role, display_name) values ('00000000-0000-4000-8000-0000000000a1', 'admin_hospitalario', null);
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-0000000000a1', 'Hospital Replay Uno', 'Hospital Replay Uno S.A.', true),
  ('10000000-0000-4000-8000-0000000000a2', 'Hospital Replay Dos', 'Hospital Replay Dos S.A.', true);
insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint) values
  ('30000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 'activa', 'r***@example.test');

create function pg_temp.login() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-4000-8000-0000000000a1', 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)))::text, true);
end $$;
grant execute on function pg_temp.login() to authenticated;
create function pg_temp.hash() returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('email', 'replay@example.test'), jsonb_build_array('name', null)))
$$;
grant execute on function pg_temp.hash() to authenticated;

set local role authenticated;
select pg_temp.login();
create temp table first_reply as select api.create_assisted_signup('clave-replay-0000001', pg_temp.hash(), 'replay@example.test', null) as r;
grant select on first_reply to authenticated;
select is((select r ->> 'kind' from first_reply), 'created', 'el admin del hospital 1 crea el alta');

select is(api.create_assisted_signup('clave-replay-0000001', pg_temp.hash(), 'replay@example.test', null) ->> 'kind', 'replayed', 'el mismo admin y hospital recibe el replay');
select is(api.create_assisted_signup('clave-replay-0000001', pg_temp.hash(), 'replay@example.test', null) #> '{response,signup}',
  (select r -> 'signup' from first_reply), 'y el replay autorizado conserva el DTO guardado');

reset role;
update app.hospital_memberships set hospital_id = '10000000-0000-4000-8000-0000000000a2' where membership_id = '30000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select pg_temp.login();
select is(api.create_assisted_signup('clave-replay-0000001', pg_temp.hash(), 'replay@example.test', null) ->> 'kind', 'forbidden',
  'reasignado al hospital 2, el replay del alta del hospital 1 es forbidden');
select is(api.create_assisted_signup('clave-replay-0000001', pg_temp.hash(), 'replay@example.test', null) ? 'response', false,
  'y no expone el alta ni su secuencia de activación');
reset role;
select is((select count(*)::int from app.assisted_signups), 1, 'no se crea otra alta');
select is((select count(*)::int from app.email_outbox), 0, 'ni se encola correo');

update app.hospital_memberships set hospital_id = '10000000-0000-4000-8000-0000000000a1' where membership_id = '30000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select pg_temp.login();
select is(api.create_assisted_signup('clave-replay-0000001', pg_temp.hash(), 'replay@example.test', null) ->> 'kind', 'replayed',
  'de vuelta en el hospital 1, el replay vuelve a ser autorizado');
select is(api.create_assisted_signup('clave-replay-0000001', repeat('0', 64), 'replay@example.test', null) ->> 'kind', 'invalid',
  'un hash que no corresponde sigue siendo invalid');

-- Tope de lotes por admin (20 por hora) -----------------------
reset role;
insert into app.sites (site_id, hospital_id, public_name, public_address, public_instructions, latitude, longitude, is_active, is_approved)
values ('50000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 'Sede Tope', 'Dirección sintética', null, -12.046, -77.043, true, true);
insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, expires_at)
values ('40000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'RBC', 'A_POS', 2, 10, 'Normal', 'activa', now() + interval '12 hours');
insert into app.invitation_batches (need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
select '40000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 0, 0 from generate_series(1, 19);
set local role authenticated;
select pg_temp.login();
select is(api.authorize_invitation_batch('40000000-0000-4000-8000-0000000000a1') ->> 'kind', 'ok', 'con 19 lotes en la hora todavía se autoriza');
reset role;
insert into app.invitation_batches (need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
values ('40000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 0, 0);
set local role authenticated;
select pg_temp.login();
select is(api.authorize_invitation_batch('40000000-0000-4000-8000-0000000000a1') ->> 'kind', 'rate_limited',
  'a los 20 lotes por hora el admin recibe rate_limited al pedir otra concesión');

-- El replay de un lote ya creado no choca con el tope: la autorización devuelve lo guardado.
reset role;
insert into app.idempotency_records (actor_ref, operation, idem_key, payload_hash, status, response, completed_at)
values ('user:00000000-0000-4000-8000-0000000000a1', 'requestInvitationBatch', 'clave-lote-replay-01',
        app.fingerprint(jsonb_build_array(jsonb_build_array('needId', '40000000-0000-4000-8000-0000000000a1'))), 'completado',
        '{"kind":"created","batchId":"60000000-0000-4000-8000-0000000000a1","createdInvitationCount":0,"queuedEmailCount":0}', now());
create temp table lote_hash as select app.fingerprint(jsonb_build_array(jsonb_build_array('needId', '40000000-0000-4000-8000-0000000000a1'))) as h;
grant select on lote_hash to authenticated;
set local role authenticated;
select pg_temp.login();
select is(api.authorize_invitation_batch('40000000-0000-4000-8000-0000000000a1', 'clave-lote-replay-01', (select h from lote_hash)) #>> '{response,batchId}',
  '60000000-0000-4000-8000-0000000000a1', 'con la misma clave el replay del lote 20 devuelve el lote guardado, no 429');

select * from finish();
rollback;
