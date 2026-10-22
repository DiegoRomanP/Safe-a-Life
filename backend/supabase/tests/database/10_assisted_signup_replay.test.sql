begin;
-- SP-04: el replay de create_assisted_signup revalida el hospital del actor (reasignado A -> B). Todo se revierte.
truncate app.assisted_signups, app.email_outbox, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(9);

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

select * from finish();
rollback;
