begin;
-- F6-3a: lote de invitaciones, lecturas del hospital y respuesta inicial por token. Todo se revierte con el rollback.
truncate app.invitation_response_history, app.invitations, app.invitation_batches, app.email_outbox, app.needs, app.sites, app.assisted_signups,
  app.idempotency_records, app.correction_requests, app.session_barriers, app.admitted_sessions, app.donor_profiles, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(147);

-- Ayudas ---------------------------------------------------------------------------------------------------------
create function pg_temp.u(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.d(n int) returns uuid language sql immutable as $$ select pg_temp.u(10 + n) $$;
create function pg_temp.nid(n int) returns uuid language sql immutable as $$ select ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.hid(n int) returns uuid language sql immutable as $$ select ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.sha(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create function pg_temp.ch(tag text, i int) returns text language sql immutable as $$ select pg_temp.sha(tag || 'c' || i) $$;
create function pg_temp.rh(tag text, i int) returns text language sql immutable as $$ select pg_temp.sha(tag || 'r' || i) $$;
create function pg_temp.slots(tag text, n int) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('outboxId', md5(tag || 'o' || i)::uuid, 'invitationId', md5(tag || 'i' || i)::uuid,
    'confirmHash', pg_temp.ch(tag, i), 'rejectHash', pg_temp.rh(tag, i), 'sealedPayload', 'sellado-' || tag || i) order by i)
  from generate_series(1, n) i
$$;
create function pg_temp.hb(p_need uuid) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('needId', p_need::text))) $$;
create function pg_temp.ht(p_hash text) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('tokenHash', p_hash))) $$;
create function pg_temp.login(p_uid uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"%s","amr":[{"method":"password","timestamp":1}]}', p_uid, p_aal), true);
end $$;
-- Consulta como propietario (las tablas de invitaciones no son legibles por authenticated).
create function pg_temp.q(p_sql text) returns text language plpgsql security definer as $$
declare v text;
begin execute p_sql into v; return v; end $$;
-- Ejecuta un lote y lo deshace: devuelve los donantes en el orden de los slots (para comparar sin gastar cuota).
create function pg_temp.try_batch(p_need uuid, p_tag text, p_n int) returns text language plpgsql security definer as $$
declare v_res jsonb; v_donors text; v_secret constant text := repeat('ab', 32);
begin
  delete from app.invitation_batch_grants where need_id = p_need and consumed_at is null;
  insert into app.invitation_batch_grants (need_id, hospital_id, admin_id, secret_hash, expires_at)
  select n.need_id, n.hospital_id, m.user_id, encode(sha256(convert_to(v_secret, 'UTF8')), 'hex'), now() + interval '2 minutes'
  from app.needs n join app.hospital_memberships m on m.hospital_id = n.hospital_id and m.status = 'activa' where n.need_id = p_need limit 1;
  v_res := api.request_invitation_batch('clave-try-' || p_tag || '-0001', pg_temp.hb(p_need), p_need, v_secret, pg_temp.slots(p_tag, p_n));
  select string_agg(i.donor_id::text, ',' order by i.created_at, s.ord) into v_donors
  from app.invitations i join (select (e ->> 'invitationId')::uuid id, ord from jsonb_array_elements(pg_temp.slots(p_tag, p_n)) with ordinality t(e, ord)) s on s.id = i.invitation_id;
  raise exception 'rollback:%:%', v_res ->> 'kind', coalesce(v_donors, '');
exception when raise_exception then
  return substr(sqlerrm, 10);
end $$;
-- Invitación directa (fixtures de cuota y de estados): lote por necesidad, outbox y hashes derivados de la etiqueta.
create function pg_temp.mk_inv(p_need uuid, p_donor uuid, p_created timestamptz, p_tag text) returns uuid language plpgsql as $$
declare v_batch uuid; v_inv uuid := md5(p_tag || 'inv')::uuid; v_outbox uuid := md5(p_tag || 'out')::uuid;
begin
  select batch_id into v_batch from app.invitation_batches where need_id = p_need limit 1;
  if v_batch is null then
    insert into app.invitation_batches (need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
    select need_id, hospital_id, created_by, 0, 0 from app.needs where need_id = p_need returning batch_id into v_batch;
  end if;
  insert into app.email_outbox (outbox_id, kind, recipient_user_id, idempotency_key, sealed_payload, not_after)
  values (v_outbox, 'invitacion', p_donor, 'outbox-fixture-' || p_tag, 'sellado', now() + interval '1 day');
  insert into app.invitations (invitation_id, need_id, batch_id, hospital_id, donor_id, need_donor_code, confirm_token_hash, reject_token_hash, current_outbox_id, created_at)
  select v_inv, p_need, v_batch, hospital_id, p_donor, app.new_need_donor_code(p_need), pg_temp.sha(p_tag || 'c'), pg_temp.sha(p_tag || 'r'), v_outbox, p_created
  from app.needs where need_id = p_need;
  return v_inv;
end $$;
create temp table res (label text primary key, j jsonb);
grant all on res to authenticated;
-- Ayuda: secreto de la concesión guardado en res.
create function pg_temp.gs(p_label text) returns text language sql as $$ select j ->> 'grantSecret' from res where label = p_label $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Fixtures --------------------------------------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-rpc-' || n || '@example.test'
from (select generate_series(1, 4) n union all select generate_series(11, 28)) t;
insert into app.user_accounts (user_id, role, display_name)
select pg_temp.u(n), case n when 1 then 'admin_hospitalario' when 2 then 'admin_hospitalario' when 3 then 'superadmin' when 4 then 'api_technical' else 'donante' end::app.actor_role, null
from (select generate_series(1, 4) n union all select generate_series(11, 28)) t where n <> 27; -- el 27 no tiene cuenta de aplicación
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  (pg_temp.hid(1), 'Hospital Lotes A', 'Hospital Lotes A S.A.', true), (pg_temp.hid(2), 'Hospital Lotes B', 'Hospital Lotes B S.A.', true);
insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint) values
  ('30000000-0000-4000-8000-000000000801', pg_temp.u(1), pg_temp.hid(1), 'activa', 'a***@example.test'),
  ('30000000-0000-4000-8000-000000000802', pg_temp.u(2), pg_temp.hid(2), 'activa', 'b***@example.test');
insert into app.sites (site_id, hospital_id, public_name, public_address, public_instructions, latitude, longitude, is_active, is_approved) values
  ('22222222-2222-4222-8222-222222220801', pg_temp.hid(1), 'Sede Lotes A', 'Cercado de Lima', 'Presentarse en recepción.', -12.046374, -77.042793, true, true),
  ('22222222-2222-4222-8222-222222220802', pg_temp.hid(2), 'Sede Lotes B', 'Miraflores', null, -12.119700, -77.037500, true, true),
  ('22222222-2222-4222-8222-222222220803', pg_temp.hid(1), 'Sede Lotes A Inactiva', 'Cercado de Lima', null, -12.046374, -77.042793, false, true);
-- Donantes: grupo, posición (lat, lon -77.043), disponibilidad, estado. La distancia al sitio A va en el comentario.
create temp table donors (n int, blood text, lat numeric, avail boolean, status text);
insert into donors values
  (1, 'A_POS', -12.060, true, 'activo'),   -- exacta, 1,5 km
  (2, 'O_POS', -12.051, true, 'activo'),   -- 0,5 km
  (3, 'A_NEG', -12.064, true, 'activo'),   -- 2,0 km
  (4, 'O_NEG', -12.074, true, 'activo'),   -- 3,1 km
  (5, 'B_POS', -12.049, true, 'activo'),   -- 0,3 km, incompatible con A_POS
  (6, 'A_POS', -12.050, false, 'activo'),  -- no disponible
  (7, 'A_POS', -12.150, true, 'activo'),   -- 11,5 km: fuera del radio de 10 km
  (8, 'A_POS', null, null, 'incompleto'),  -- perfil incompleto
  (9, 'A_POS', null, null, 'incompleto'),  -- alta asistida reclamada e incompleta
  (10, 'A_POS', -12.047, true, 'activo'),  -- con 3 invitaciones en 24 h
  (11, 'O_POS', -12.083, true, 'activo'),  -- 2 en 24 h y una de hace 25 h: admite la tercera
  (12, 'B_NEG', -12.055, true, 'activo'),  -- 0,96 km: dentro del radio de 1 km
  (13, 'B_NEG', -12.056, true, 'activo'),  -- 1,07 km: fuera del radio de 1 km
  (16, 'O_NEG', -12.180, true, 'activo'),  -- 14,9 km: tres donantes exactos a igual distancia, insertados en orden inverso de donor_id
  (15, 'O_NEG', -12.180, true, 'activo'),
  (14, 'O_NEG', -12.180, true, 'activo'),
  (17, 'A_POS', -12.048, true, 'activo'),  -- perfil activo y cercano, pero sin fila en user_accounts
  (18, 'A_POS', -12.046, true, 'activo');  -- con una solicitud de eliminación en ejecución
insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
select pg_temp.d(n), case when status = 'activo' then 'Donante Sintético ' || n end, case when status = 'activo' then blood end, avail,
       lat, case when lat is not null then -77.043 end, case when lat is not null then 'DEMO_ONLY-1' end, status, now()
from donors;
insert into app.correction_requests (request_id, donor_id, type, requested_fields, status) values (gen_random_uuid(), pg_temp.d(18), 'eliminacion', array['deletion'], 'en_ejecucion');
insert into app.assisted_signups (hospital_id, email, status, donor_id, activation_expires_at, purge_at)
values (pg_temp.hid(1), 'asistida@example.test', 'reclamada_incompleta', pg_temp.d(9), now() + interval '1 day', now() + interval '30 days');
insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, created_at, expires_at)
select pg_temp.nid(k), pg_temp.hid(h), s, pg_temp.u(h), 'RBC', blood, target, radius, urgency, status, now() - make_interval(hours => age_h), now() + exp
from (values
  (1, 1, '22222222-2222-4222-8222-222222220801'::uuid, 'A_POS', 3, 10, 'Normal', 'activa', 1, interval '2 days'),
  (6, 1, '22222222-2222-4222-8222-222222220801'::uuid, 'B_POS', 1, 1, 'Normal', 'activa', 1, interval '2 days'),
  (7, 1, '22222222-2222-4222-8222-222222220801'::uuid, 'A_POS', 1, 10, 'Normal', 'activa', 1, interval '2 days'),
  (8, 1, '22222222-2222-4222-8222-222222220801'::uuid, 'A_POS', 1, 10, 'Critica', 'activa', 1, interval '2 days'),
  (9, 1, '22222222-2222-4222-8222-222222220801'::uuid, 'A_POS', 1, 10, 'Normal', 'borrador', 1, interval '2 days'),
  (10, 1, '22222222-2222-4222-8222-222222220801'::uuid, 'A_POS', 1, 10, 'Normal', 'activa', 72, interval '-1 day'),
  (12, 1, '22222222-2222-4222-8222-222222220803'::uuid, 'A_POS', 1, 10, 'Normal', 'activa', 1, interval '2 days'),
  (13, 1, '22222222-2222-4222-8222-222222220801'::uuid, 'O_NEG', 1, 50, 'Normal', 'activa', 1, interval '2 days'),
  (14, 1, '22222222-2222-4222-8222-222222220801'::uuid, 'A_POS', 5, 10, 'Normal', 'activa', 1, interval '2 days'),
  (15, 1, '22222222-2222-4222-8222-222222220801'::uuid, 'A_POS', 5, 10, 'Normal', 'activa', 1, interval '2 days'),
  (21, 2, '22222222-2222-4222-8222-222222220802'::uuid, 'A_POS', 1, 10, 'Normal', 'activa', 1, interval '2 days'),
  (22, 2, '22222222-2222-4222-8222-222222220802'::uuid, 'A_POS', 1, 10, 'Normal', 'activa', 1, interval '2 days'),
  (23, 2, '22222222-2222-4222-8222-222222220802'::uuid, 'A_POS', 1, 10, 'Normal', 'activa', 1, interval '2 days')
) t (k, h, s, blood, target, radius, urgency, status, age_h, exp);
-- Cuota: el donante 10 tiene tres invitaciones en 24 h; el 11, dos más una de hace 25 h.
select pg_temp.mk_inv(pg_temp.nid(21), pg_temp.d(10), now(), 'q10a');
select pg_temp.mk_inv(pg_temp.nid(22), pg_temp.d(10), now(), 'q10b');
select pg_temp.mk_inv(pg_temp.nid(23), pg_temp.d(10), now(), 'q10c');
select pg_temp.mk_inv(pg_temp.nid(21), pg_temp.d(11), now(), 'q11a');
select pg_temp.mk_inv(pg_temp.nid(22), pg_temp.d(11), now(), 'q11b');
select pg_temp.mk_inv(pg_temp.nid(23), pg_temp.d(11), now() - interval '25 hours', 'q11c');

-- Lote: autorización (paso 1, sesión del admin) ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select is(api.authorize_invitation_batch(pg_temp.nid(1)) ->> 'kind', 'unauthenticated', 'authorize sin sesión: unauthenticated');
select pg_temp.login(pg_temp.d(1), 'aal2');
select is(api.authorize_invitation_batch(pg_temp.nid(1)) ->> 'kind', 'forbidden', 'authorize: un donante no autoriza lotes');
select pg_temp.login(pg_temp.u(3), 'aal2');
select is(api.authorize_invitation_batch(pg_temp.nid(1)) ->> 'kind', 'forbidden', 'authorize: el superadmin no autoriza lotes');
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.authorize_invitation_batch(pg_temp.nid(1)) ->> 'kind', 'forbidden', 'authorize: la sesión técnica no autoriza lotes');
select pg_temp.login(pg_temp.u(1), 'aal1');
select is(api.authorize_invitation_batch(pg_temp.nid(1)) ->> 'kind', 'mfa_required', 'authorize: el admin con AAL1 recibe mfa_required');
select pg_temp.login(pg_temp.u(2), 'aal2');
select is(api.authorize_invitation_batch(pg_temp.nid(1)) ->> 'kind', 'not_found', 'authorize: un admin de otro hospital recibe 404 (sin IDOR)');
select is(pg_temp.q('select count(*)::text from app.invitation_batch_grants'), '0', 'y no se emitió ninguna concesión');
select pg_temp.login(pg_temp.u(1), 'aal2');
select is(api.authorize_invitation_batch(pg_temp.nid(9)) ->> 'kind', 'conflict', 'authorize: una necesidad en borrador: conflict');
select is(api.authorize_invitation_batch(pg_temp.nid(10)) ->> 'kind', 'conflict', 'authorize: una necesidad vencida: conflict');
select is(api.authorize_invitation_batch(pg_temp.nid(12)) ->> 'kind', 'conflict', 'authorize: una sede no utilizable: conflict');
select is(api.authorize_invitation_batch(pg_temp.nid(99)) ->> 'kind', 'not_found', 'authorize: necesidad inexistente: not_found');
insert into res select 'g_n1_old', api.authorize_invitation_batch(pg_temp.nid(1));
select is((select j ->> 'kind' from res where label = 'g_n1_old'), 'ok', 'authorize emite la concesión');
select ok((select j ->> 'grantSecret' ~ '^[0-9a-f]{64}$' from res where label = 'g_n1_old'), 'el secreto es de 256 bits en hex');
select is(pg_temp.q('select count(*)::text from app.invitation_batch_grants where secret_hash = encode(sha256(convert_to(''' || pg_temp.gs('g_n1_old') || ''', ''UTF8'')), ''hex'')'), '1', 'solo se guarda el hash del secreto');
select is(pg_temp.q('select (expires_at - created_at <= interval ''2 minutes'' and admin_id = ''' || pg_temp.u(1) || ''' and consumed_at is null)::text from app.invitation_batch_grants'), 'true', 'vida de 2 minutos, ligada al admin y sin consumir');
insert into res select 'g_n1', api.authorize_invitation_batch(pg_temp.nid(1));
select is(pg_temp.q('select count(*)::text from app.invitation_batch_grants where need_id = ''' || pg_temp.nid(1) || ''' and consumed_at is null'), '1', 'una concesión viva por (necesidad, admin): la nueva sustituye a la anterior');
insert into res select 'g_n6', api.authorize_invitation_batch(pg_temp.nid(6));
insert into res select 'g_n15', api.authorize_invitation_batch(pg_temp.nid(15));
insert into res select 'g_n8', api.authorize_invitation_batch(pg_temp.nid(8));
insert into res select 'g_n7', api.authorize_invitation_batch(pg_temp.nid(7));
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 6)) ->> 'kind', 'forbidden',
  'un admin que llama a request_invitation_batch, incluso con slots y su concesión, recibe forbidden');
select is(pg_temp.q('select count(*)::text from app.invitation_batches where need_id = ''' || pg_temp.nid(1) || ''''), '0', 'y no se creó ningún lote');

-- Lote: ejecución (paso 2, solo la sesión técnica) -------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 6)) ->> 'kind', 'unauthenticated', 'request sin sesión: unauthenticated');
select pg_temp.login(pg_temp.d(1), 'aal2');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 6)) ->> 'kind', 'forbidden', 'request: un donante recibe forbidden');
select pg_temp.login(pg_temp.u(3), 'aal2');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 6)) ->> 'kind', 'forbidden', 'request: el superadmin recibe forbidden');
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.request_invitation_batch('corta', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 6)) ->> 'kind', 'invalid', 'clave corta: invalid');
select is(api.request_invitation_batch('clave-lote-0000000000', repeat('0', 64), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 6)) ->> 'kind', 'invalid', 'hash que no corresponde a la necesidad: invalid');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), 'no-es-hex', pg_temp.slots('n1', 6)) ->> 'kind', 'invalid', 'concesión mal formada: invalid');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 4)) ->> 'kind', 'invalid', 'menos de 5 slots: invalid');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 51)) ->> 'kind', 'invalid', 'más de 50 slots: invalid');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'),
  (select jsonb_set(pg_temp.slots('n1', 6), '{0,confirmHash}', to_jsonb(pg_temp.rh('n1', 2)))) ) ->> 'kind', 'invalid', 'hashes repetidos entre slots: invalid');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'),
  (select jsonb_set(pg_temp.slots('n1', 6), '{0}', (pg_temp.slots('n1', 6) -> 0) - 'sealedPayload'))) ->> 'kind', 'invalid', 'un slot sin sealedPayload: invalid');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 5)) ->> 'kind', 'invalid', 'slots distintos de batchSize(meta) = 6: invalid');
select is(pg_temp.q('select (consumed_at is null)::text from app.invitation_batch_grants where secret_hash = encode(sha256(convert_to(''' || pg_temp.gs('g_n1') || ''', ''UTF8'')), ''hex'')'), 'true', 'un invalid no consume la concesión');
-- Fallos de la concesión: siempre not_found, sin revelar cuál falló.
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), repeat('c', 64), pg_temp.slots('n1', 6)) ->> 'kind', 'not_found', 'concesión desconocida: not_found');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1_old'), pg_temp.slots('n1', 6)) ->> 'kind', 'not_found', 'concesión sustituida por otra más nueva: not_found');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(6)), pg_temp.nid(6), pg_temp.gs('g_n1'), pg_temp.slots('n6', 5)) ->> 'kind', 'not_found', 'concesión de otra necesidad: not_found');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(99)), pg_temp.nid(99), pg_temp.gs('g_n1'), pg_temp.slots('n99', 5)) ->> 'kind', 'not_found', 'necesidad inexistente: not_found');
reset role;
update app.invitation_batch_grants set created_at = now() - interval '10 minutes', expires_at = now() - interval '8 minutes' where need_id = pg_temp.nid(8);
update app.needs set status = 'cancelada' where need_id = pg_temp.nid(15);
set local role authenticated;
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(8)), pg_temp.nid(8), pg_temp.gs('g_n8'), pg_temp.slots('n8', 5)) ->> 'kind', 'not_found', 'concesión vencida: not_found');
reset role;
update app.hospital_memberships set status = 'revocada' where user_id = pg_temp.u(1);
set local role authenticated;
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(7)), pg_temp.nid(7), pg_temp.gs('g_n7'), pg_temp.slots('n7', 5)) ->> 'kind', 'not_found', 'el admin ya no tiene membresía activa: not_found');
reset role;
update app.hospital_memberships set status = 'activa' where user_id = pg_temp.u(1);
set local role authenticated;
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.request_invitation_batch('clave-lote-0000000000', pg_temp.hb(pg_temp.nid(15)), pg_temp.nid(15), pg_temp.gs('g_n15'), pg_temp.slots('n15', 10)) ->> 'kind', 'conflict', 'la necesidad dejó de estar activa tras autorizar: conflict');
-- Lote: candidatos --------------------------------------------------------------------------------------------------
select is(pg_temp.try_batch(pg_temp.nid(7), 'n7', 5), 'created:' || array_to_string(array[pg_temp.d(1), pg_temp.d(2), pg_temp.d(3), pg_temp.d(4), pg_temp.d(11)]::text[], ','),
  'candidatos de N7: exactas primero y luego por distancia; d10 (3 invitaciones en 24 h) queda fuera y d11 (2 en ventana) entra');
select is(pg_temp.try_batch(pg_temp.nid(7), 'n7', 5), pg_temp.try_batch(pg_temp.nid(8), 'n8', 5), 'la urgencia no altera los candidatos ni su orden (invariancia)');
insert into res select 'n1', api.request_invitation_batch('clave-lote-n1-000001', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 6));
insert into res select 'c1', to_jsonb(pg_temp.q('select consumed_at::text from app.invitation_batch_grants where secret_hash = encode(sha256(convert_to(''' || pg_temp.gs('g_n1') || ''', ''UTF8'')), ''hex'')'));
select ok((select j #>> '{}' is not null from res where label = 'c1'), 'el lote consume la concesión (consumed_at)');
select is((select j ->> 'kind' from res where label = 'n1'), 'created', 'el lote de N1 se crea');
select is((select (j ->> 'createdInvitationCount') || '/' || (j ->> 'queuedEmailCount') from res where label = 'n1'), '5/5', 'cinco candidatos elegibles: cinco invitaciones y cinco correos (el sexto slot se descarta)');
select is(pg_temp.q('select string_agg(donor_id::text, '','' order by outbox_id) from app.invitations i join app.email_outbox o on o.outbox_id = i.current_outbox_id where i.need_id = ''' || pg_temp.nid(1) || ''''),
  (select string_agg(x::text, ',' order by md5('n1o' || ord)::uuid) from unnest(array[pg_temp.d(1), pg_temp.d(2), pg_temp.d(3), pg_temp.d(4), pg_temp.d(11)]) with ordinality t(x, ord)),
  'el slot i recibe al candidato i: d1 (exacta), d2, d3, d4 y d11');
select is(pg_temp.q('select count(*)::text from app.invitations where need_id = ''' || pg_temp.nid(1) || ''' and donor_id in (' ||
  (select string_agg('''' || pg_temp.d(k) || '''', ',') from (select generate_series(5, 10) k union all select 17 union all select 18) t) || ')'), '0',
  'quedan fuera: grupo incompatible, no disponible, fuera del radio, perfil incompleto, alta asistida, cuota, sin cuenta de aplicación y con eliminación en ejecución');
select is(pg_temp.q('select count(*)::text from app.invitations where need_id = ''' || pg_temp.nid(1) || ''' and donor_id = ''' || pg_temp.d(11) || ''''), '1', 'la tercera invitación en 24 h sí se permite (d11)');
select is(pg_temp.q('select count(*)::text from app.invitations where need_id = ''' || pg_temp.nid(1) || ''' and donor_id = ''' || pg_temp.d(1) || ''' and hospital_id = ''' || pg_temp.hid(1) || ''' and validity = ''activa'' and delivery = ''pendiente'' and response = ''sin_respuesta'''), '1', 'la invitación nace activa, pendiente y sin respuesta con el hospital de la necesidad');
select is(pg_temp.q('select count(*)::text from app.invitations i where need_id = ''' || pg_temp.nid(1) || ''' and need_donor_code ~ ''^[0-9A-HJKMNP-TV-Z]{10}$'' and confirm_token_hash ~ ''^[0-9a-f]{64}$'' and reject_token_hash ~ ''^[0-9a-f]{64}$'''), '5', 'códigos Crockford y hashes guardados');
select is(pg_temp.q('select count(*)::text from app.invitations i join app.email_outbox o on o.outbox_id = i.current_outbox_id where i.need_id = ''' || pg_temp.nid(1) ||
  ''' and o.kind = ''invitacion'' and o.status = ''pendiente'' and o.recipient_user_id = i.donor_id and o.invitation_id = i.invitation_id and o.not_after = (select expires_at from app.needs where need_id = i.need_id) and o.sealed_payload is not null'), '5',
  'cada invitación apunta a su correo pendiente, con el destinatario, el plazo de la necesidad y el payload sellado');
select is(pg_temp.q('select count(*)::text from app.email_outbox where outbox_id = ''' || md5('n1o6') || ''''), '0', 'el slot sobrante no genera correo');
select is(pg_temp.q('select count(*)::text from app.invitation_batches where need_id = ''' || pg_temp.nid(1) || ''' and created_invitation_count = 5 and queued_email_count = 5 and requested_by = ''' || pg_temp.u(1) || ''''), '1', 'el lote registra conteos y solicitante');
select is(pg_temp.q('select count(*)::text from app.audit_events where event = ''lote.solicitado'' and actor_id = ''' || pg_temp.u(1) || ''' and actor_kind = ''usuario'' and resource_id = ''' || (select j ->> 'batchId' from res where label = 'n1') || ''''), '1', 'auditoría lote.solicitado');
select is(api.request_invitation_batch('clave-lote-n1-000001', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 6)) ->> 'kind', 'replayed', 'la misma clave (con la concesión ya consumida) repite el resultado guardado');
select is(pg_temp.q('select consumed_at::text from app.invitation_batch_grants where secret_hash = encode(sha256(convert_to(''' || pg_temp.gs('g_n1') || ''', ''UTF8'')), ''hex'')'), (select j #>> '{}' from res where label = 'c1'), 'el replay no vuelve a consumir la concesión');
select is(api.request_invitation_batch('clave-lote-n1-999999', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1x', 6)) ->> 'kind', 'not_found', 'otra clave con la concesión ya consumida: not_found');
select is(api.request_invitation_batch('clave-lote-n1-000001', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1'), pg_temp.slots('n1', 6)) -> 'response' ->> 'batchId', (select j ->> 'batchId' from res where label = 'n1'), 'el replay devuelve el mismo lote');
select is(pg_temp.q('select count(*)::text from app.invitation_batches where need_id = ''' || pg_temp.nid(1) || ''''), '1', 'y no crea otro');
select is(api.request_invitation_batch('clave-lote-n1-000001', pg_temp.hb(pg_temp.nid(6)), pg_temp.nid(6), pg_temp.gs('g_n6'), pg_temp.slots('n6', 5)) ->> 'kind', 'payload_conflict', 'la misma clave con otra necesidad: payload_conflict (sin consumir esa concesión)');
reset role;
set local role authenticated;
select pg_temp.login(pg_temp.u(1), 'aal2');
insert into res select 'g_n1b', api.authorize_invitation_batch(pg_temp.nid(1));
select pg_temp.login(pg_temp.u(4), 'aal1');
insert into res select 'n1b', api.request_invitation_batch('clave-lote-n1-000002', pg_temp.hb(pg_temp.nid(1)), pg_temp.nid(1), pg_temp.gs('g_n1b'), pg_temp.slots('n1b', 6));
select is((select (j ->> 'kind') || (j ->> 'createdInvitationCount') from res where label = 'n1b'), 'created0', 'un segundo lote ya no encuentra candidatos (sin duplicados necesidad-donante): created con 0');
insert into res select 'n6', api.request_invitation_batch('clave-lote-n6-000001', pg_temp.hb(pg_temp.nid(6)), pg_temp.nid(6), pg_temp.gs('g_n6'), pg_temp.slots('n6', 5));
select is(pg_temp.q('select string_agg(donor_id::text, '','' order by outbox_id) from app.invitations i join app.email_outbox o on o.outbox_id = i.current_outbox_id where i.need_id = ''' || pg_temp.nid(6) || ''''),
  (select string_agg(x::text, ',' order by md5('n6o' || ord)::uuid) from unnest(array[pg_temp.d(5), pg_temp.d(2), pg_temp.d(12)]) with ordinality t(x, ord)),
  'radio de 1 km: entra el donante a 0,96 km y no el de 1,07 km; exacta (d5) primero');

select is(pg_temp.try_batch(pg_temp.nid(7), 'n7', 5), 'created:' || array_to_string(array[pg_temp.d(1), pg_temp.d(2), pg_temp.d(3), pg_temp.d(4)]::text[], ','),
  'tras el lote de N1, d11 ya tiene 3 invitaciones en 24 h: una cuarta queda excluida');
select is(pg_temp.try_batch(pg_temp.nid(8), 'n8', 5), pg_temp.try_batch(pg_temp.nid(7), 'n7', 5), 'la urgencia tampoco altera el resultado con cuotas ya consumidas');

select is(pg_temp.try_batch(pg_temp.nid(13), 'n13', 5), 'created:' || array_to_string(array[pg_temp.d(4), pg_temp.d(14), pg_temp.d(15), pg_temp.d(16)]::text[], ','),
  'desempate: a igual distancia y grupo, por donor_id ascendente (insertados en orden inverso)');

-- Lecturas del hospital -----------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u(1), 'aal2');
select is(api.list_own_invitation_batches(pg_temp.nid(1), 10) ->> 'kind', 'ok', 'list_own_invitation_batches responde ok al admin dueño');
select is(jsonb_array_length(api.list_own_invitation_batches(pg_temp.nid(1), 10) -> 'items'), 2, 'dos lotes de N1');
create temp table first_batch as select batch_id, created_at from app.invitation_batches where need_id = pg_temp.nid(1) order by created_at, batch_id limit 1;
grant select on first_batch to authenticated;
select is((select e -> 'deliveryCounts' from jsonb_array_elements(api.list_own_invitation_batches(pg_temp.nid(1), 10) -> 'items') e where (e ->> 'createdInvitationCount')::int = 5),
  '{"fallida": 0, "enviada": 0, "pendiente": 5, "entregada": 0}'::jsonb, 'deliveryCounts: cuatro conteos que suman createdInvitationCount');
select is(api.list_own_invitation_batches(pg_temp.nid(1), 1) -> 'next' ->> 'id', (select batch_id::text from first_batch), 'paginación: next apunta al último elemento de la página (orden created_at, batch_id)');
select is(api.list_own_invitation_batches(pg_temp.nid(1), 1, (select created_at from first_batch), (select batch_id from first_batch)) #>> '{items,0,batchId}',
  (select batch_id::text from app.invitation_batches where need_id = pg_temp.nid(1) and batch_id <> (select batch_id from first_batch)), 'el cursor continúa con el siguiente lote');
select is(api.list_own_invitation_batches(pg_temp.nid(1), 0) ->> 'kind', 'invalid', 'límite fuera de rango: invalid');
select is(api.list_own_invitation_batches(pg_temp.nid(1), 5, now(), null) ->> 'kind', 'invalid', 'cursor a medias: invalid');
select is(api.list_own_invitation_batches(pg_temp.nid(99), 5) ->> 'kind', 'not_found', 'necesidad inexistente: not_found');
select is(api.list_own_need_responses(pg_temp.nid(1), 10) ->> 'kind', 'ok', 'list_own_need_responses responde ok al admin dueño');
select is(api.list_own_need_responses(pg_temp.nid(1), 10) ->> 'confirmedIntentCount', '0', 'sin confirmaciones: confirmedIntentCount 0');
select is(api.list_own_need_responses(pg_temp.nid(1), 10) #>> '{items,0}', (select jsonb_build_object('needDonorCode', code, 'validity', 'activa', 'delivery', 'pendiente', 'response', 'sin_respuesta')::text
  from (select pg_temp.q('select need_donor_code from app.invitations where need_id = ''' || pg_temp.nid(1) || ''' order by created_at, invitation_id limit 1') code) c), 'respuesta sin confirmar: solo código, validez, entrega y respuesta');
select is(api.list_own_need_responses(pg_temp.nid(1), 2) -> 'next' is not null, true, 'paginación de respuestas');
select is(api.list_own_need_responses(pg_temp.nid(1), 0) ->> 'kind', 'invalid', 'respuestas: límite inválido');
select pg_temp.login(pg_temp.u(2), 'aal2');
select is(api.list_own_invitation_batches(pg_temp.nid(1), 10) ->> 'kind', 'not_found', 'admin de otro hospital: lotes 404');
select is(api.list_own_need_responses(pg_temp.nid(1), 10) ->> 'kind', 'not_found', 'admin de otro hospital: respuestas 404');
select pg_temp.login(pg_temp.d(1), 'aal2');
select is(api.list_own_invitation_batches(pg_temp.nid(1), 10) ->> 'kind', 'forbidden', 'un donante no lee lotes');
select is(api.list_own_need_responses(pg_temp.nid(1), 10) ->> 'kind', 'forbidden', 'un donante no lee respuestas del hospital');

-- Token: vista previa ----------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u(1), 'aal2');
select is(api.get_invitation_action_preview(pg_temp.ch('n1', 1)) ->> 'kind', 'forbidden', 'la vista previa solo la ve la sesión técnica (admin: forbidden)');
select set_config('request.jwt.claims', '', true);
select is(api.get_invitation_action_preview(pg_temp.ch('n1', 1)) ->> 'kind', 'unauthenticated', 'vista previa sin sesión: unauthenticated');
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.get_invitation_action_preview('no-es-un-hash') ->> 'kind', 'invalid', 'vista previa: hash mal formado');
select is(api.get_invitation_action_preview(repeat('f', 64)) ->> 'kind', 'not_found', 'vista previa: hash desconocido');
select is(api.get_invitation_action_preview(pg_temp.ch('n1', 1)) - 'expiresAt', '{"kind": "ok", "hospitalName": "Hospital Lotes A", "publicSiteName": "Sede Lotes A", "intendedAction": "confirmar"}'::jsonb, 'vista previa del token de confirmar');
select is(api.get_invitation_action_preview(pg_temp.rh('n1', 1)) ->> 'intendedAction', 'rechazar', 'la acción la fija la columna que coincide');
select is(api.get_invitation_action_preview(pg_temp.ch('n1', 1)) ->> 'expiresAt', pg_temp.q('select app.iso(expires_at) from app.needs where need_id = ''' || pg_temp.nid(1) || ''''), 'el plazo es el de la necesidad');

-- Token: respuesta -----------------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u(1), 'aal2');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 1), 'clave-token-0000001', pg_temp.ht(pg_temp.ch('n1', 1))) ->> 'kind', 'forbidden', 'responder por token: un admin recibe forbidden');
select pg_temp.login(pg_temp.d(1), 'aal2');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 1), 'clave-token-0000001', pg_temp.ht(pg_temp.ch('n1', 1))) ->> 'kind', 'forbidden', 'responder por token: un donante recibe forbidden');
select set_config('request.jwt.claims', '', true);
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 1), 'clave-token-0000001', pg_temp.ht(pg_temp.ch('n1', 1))) ->> 'kind', 'unauthenticated', 'responder por token sin sesión: unauthenticated');
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 1), 'clave-token-0000001', repeat('0', 64)) ->> 'kind', 'invalid', 'hash de idempotencia que no corresponde: invalid');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 1), 'corta', pg_temp.ht(pg_temp.ch('n1', 1))) ->> 'kind', 'invalid', 'clave corta: invalid');
select is(api.respond_invitation_by_token(repeat('f', 64), 'clave-token-0000001', pg_temp.ht(repeat('f', 64))) ->> 'kind', 'not_found', 'token desconocido: 404');
-- d1 (slot 1) confirma; d2 (slot 2) rechaza.
select is((api.respond_invitation_by_token(pg_temp.ch('n1', 1), 'clave-token-0000001', pg_temp.ht(pg_temp.ch('n1', 1)))) - 'recordedAt',
  '{"kind": "ok", "response": "confirmada", "needStatus": "activa"}'::jsonb, 'primer uso válido: confirmada y necesidad activa');
select is(pg_temp.q('select response || ''|'' || (response_recorded_at is not null) || ''|'' || (token_consumed_at is not null) || ''|'' || (confirm_token_hash is not null) || ''|'' || (reject_token_hash is not null) from app.invitations where invitation_id = ''' || md5('n1i1') || ''''),
  'confirmada|true|true|true|true', 'la respuesta se guarda, token_consumed_at se marca y los hashes se conservan');
select is(pg_temp.q('select channel || response from app.invitation_response_history where invitation_id = ''' || md5('n1i1') || ''''), 'tokenconfirmada', 'historial con canal token');
select is(pg_temp.q('select count(*)::text from app.audit_events where event = ''invitacion.respondida'' and actor_kind = ''token'' and resource_id = ''' || md5('n1i1') || ''''), '1', 'auditoría invitacion.respondida con actor token');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 1), 'clave-token-0000001', pg_temp.ht(pg_temp.ch('n1', 1))) ->> 'kind', 'replayed', 'misma clave y token con la necesidad viva: replay (200)');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 1), 'clave-token-0000002', pg_temp.ht(pg_temp.ch('n1', 1))) ->> 'kind', 'gone', 'mismo token con otra clave: 410');
select is(api.respond_invitation_by_token(pg_temp.rh('n1', 1), 'clave-token-0000003', pg_temp.ht(pg_temp.rh('n1', 1))) ->> 'kind', 'gone', 'el token hermano también queda gastado: 410');
select is(api.get_invitation_action_preview(pg_temp.ch('n1', 1)) ->> 'kind', 'gone', 'vista previa de un token consumido: 410');
select is(pg_temp.q('select count(*)::text from app.invitation_response_history where invitation_id = ''' || md5('n1i1') || ''''), '1', 'ningún intento posterior duplica el historial');
select is((api.respond_invitation_by_token(pg_temp.rh('n1', 2), 'clave-token-0000004', pg_temp.ht(pg_temp.rh('n1', 2))))->> 'response', 'rechazada', 'd2 rechaza con su token de rechazo');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 2), 'clave-token-0000005', pg_temp.ht(pg_temp.ch('n1', 2))) ->> 'kind', 'gone', 'tras rechazar, el token de confirmar de d2 está gastado');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 3), 'clave-token-0000006', pg_temp.ht(pg_temp.ch('n1', 3))) ->> 'needStatus', 'activa', 'segunda confirmación (d3): la meta de 3 aún no se alcanza');
select is(pg_temp.q('select count(*)::text from app.invitations where need_id = ''' || pg_temp.nid(1) || ''' and validity = ''activa'''), '5', 'sin meta, ninguna invitación se invalida');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 4), 'clave-token-0000007', pg_temp.ht(pg_temp.ch('n1', 4))) ->> 'needStatus', 'meta_alcanzada', 'tercera confirmación: la necesidad pasa a meta_alcanzada');
select is(pg_temp.q('select status || version from app.needs where need_id = ''' || pg_temp.nid(1) || ''''), 'meta_alcanzada1', 'estado y versión de la necesidad');
select is(pg_temp.q('select validity from app.invitations where invitation_id = ''' || md5('n1i5') || ''''), 'invalidada', 'RF-INV-05: la invitación sin respuesta (d11) queda invalidada');
select is(pg_temp.q('select count(*)::text from app.invitations where need_id = ''' || pg_temp.nid(1) || ''' and validity = ''invalidada'' and response = ''sin_respuesta'''), '1', 'solo se invalida la que no tenía respuesta');
select is(pg_temp.q('select status || coalesce(sealed_payload, ''null'') from app.email_outbox where outbox_id = ''' || md5('n1o5') || ''''), 'canceladonull', 'su correo pendiente se cancela y el payload se destruye');
select is(pg_temp.q('select count(*)::text from app.email_outbox where status = ''pendiente'' and invitation_id in (select invitation_id from app.invitations where need_id = ''' || pg_temp.nid(1) || ''' and validity = ''invalidada'')'), '0', 'no queda correo pendiente de ninguna invitación invalidada');
select is(pg_temp.q('select count(*)::text from app.email_outbox where status = ''pendiente'' and invitation_id in (select invitation_id from app.invitations where need_id = ''' || pg_temp.nid(1) || ''' and response <> ''sin_respuesta'')'), '4', 'el correo de las invitaciones ya respondidas no se toca (lo gestiona el worker)');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 5), 'clave-token-0000008', pg_temp.ht(pg_temp.ch('n1', 5))) ->> 'kind', 'conflict', 'confirmar con la meta alcanzada: 409 (V6)');
select is(api.respond_invitation_by_token(pg_temp.rh('n1', 5), 'clave-token-0000009', pg_temp.ht(pg_temp.rh('n1', 5))) ->> 'kind', 'gone', 'rechazar con la meta alcanzada: 410');
select is(api.get_invitation_action_preview(pg_temp.ch('n1', 5)) ->> 'kind', 'gone', 'vista previa con la meta alcanzada: 410');
select is(api.respond_invitation_by_token(pg_temp.ch('n1', 4), 'clave-token-0000007', pg_temp.ht(pg_temp.ch('n1', 4))) ->> 'kind', 'replayed', 'el replay sigue siendo 200 con la meta alcanzada (necesidad viva)');

-- Token: donante eliminado, necesidad cerrada y vencida ---------------------------------------------------------------------------
reset role;
delete from app.donor_profiles where donor_id = pg_temp.d(12);
set local role authenticated;
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.respond_invitation_by_token(pg_temp.ch('n6', 3), 'clave-token-0000010', pg_temp.ht(pg_temp.ch('n6', 3))) ->> 'kind', 'gone', 'donante sin perfil (eliminado): 410');
select is(api.get_invitation_action_preview(pg_temp.ch('n6', 3)) ->> 'kind', 'gone', 'vista previa con el donante eliminado: 410');
select is(api.respond_invitation_by_token(pg_temp.ch('n6', 1), 'clave-token-0000011', pg_temp.ht(pg_temp.ch('n6', 1))) ->> 'needStatus', 'meta_alcanzada', 'N6 (meta 1): la primera confirmación alcanza la meta');
select is(api.respond_invitation_by_token(pg_temp.rh('n6', 2), 'clave-token-0000012', pg_temp.ht(pg_temp.rh('n6', 2))) ->> 'kind', 'gone', 'N6: rechazar con la meta alcanzada es 410');
reset role;
update app.needs set status = 'cerrada' where need_id = pg_temp.nid(6);
set local role authenticated;
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.respond_invitation_by_token(pg_temp.ch('n6', 1), 'clave-token-0000011', pg_temp.ht(pg_temp.ch('n6', 1))) ->> 'kind', 'gone', 'necesidad cerrada: ni la repetición con la misma clave se repite (410, RF-INV-08)');
select is(api.get_invitation_action_preview(pg_temp.ch('n6', 2)) ->> 'kind', 'gone', 'necesidad cerrada: vista previa 410');
reset role;
select pg_temp.mk_inv(pg_temp.nid(10), pg_temp.d(7), now(), 'vencida');
set local role authenticated;
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.respond_invitation_by_token(pg_temp.sha('vencidac'), 'clave-token-0000013', pg_temp.ht(pg_temp.sha('vencidac'))) ->> 'kind', 'gone', 'necesidad vencida: 410');
select is(api.get_invitation_action_preview(pg_temp.sha('vencidar')) ->> 'kind', 'gone', 'necesidad vencida: vista previa 410');

reset role;
select pg_temp.mk_inv(pg_temp.nid(14), pg_temp.d(18), now(), 'elim');
set local role authenticated;
select pg_temp.login(pg_temp.u(4), 'aal1');
select is(api.respond_invitation_by_token(pg_temp.sha('elimc'), 'clave-token-0000014', pg_temp.ht(pg_temp.sha('elimc'))) ->> 'kind', 'gone', 'donante con eliminación en ejecución: 410');
select is(api.get_invitation_action_preview(pg_temp.sha('elimr')) ->> 'kind', 'gone', 'donante con eliminación en ejecución: vista previa 410');

-- Lecturas con confirmaciones -------------------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u(1), 'aal2');
select is(api.list_own_need_responses(pg_temp.nid(1), 10) ->> 'confirmedIntentCount', '3', 'confirmedIntentCount cuenta las tres confirmaciones');
select is((select count(*)::int from jsonb_array_elements(api.list_own_need_responses(pg_temp.nid(1), 10) -> 'items') e where e ? 'donorName'), 3, 'las confirmadas muestran nombre y grupo declarado');
select is((select e - 'responseRecordedAt' - 'needDonorCode' from jsonb_array_elements(api.list_own_need_responses(pg_temp.nid(1), 10) -> 'items') e where e ? 'donorName' order by e ->> 'donorName' limit 1),
  '{"donorName": "Donante Sintético 1", "response": "confirmada", "declaredBloodType": "A_POS"}'::jsonb, 'la confirmada expone solo código, nombre, grupo, respuesta y fecha');
select is((select count(*)::int from jsonb_array_elements(api.list_own_need_responses(pg_temp.nid(1), 10) -> 'items') e, jsonb_object_keys(e) k
  where k not in ('needDonorCode', 'donorName', 'declaredBloodType', 'response', 'responseRecordedAt', 'validity', 'delivery')), 0, 'nunca se exponen otras claves (correo, ubicación, distancia, ids)');
select is((select e ->> 'validity' || (e ->> 'response') from jsonb_array_elements(api.list_own_need_responses(pg_temp.nid(1), 10) -> 'items') e where e ->> 'response' = 'rechazada'), 'activarechazada', 'la rechazada sigue opaca');
select is((select e ->> 'validity' from jsonb_array_elements(api.list_own_need_responses(pg_temp.nid(1), 10) -> 'items') e where e ->> 'response' = 'sin_respuesta'), 'invalidada', 'la invalidada se ve como tal');
reset role;
delete from app.donor_profiles where donor_id = pg_temp.d(1);
set local role authenticated;
select pg_temp.login(pg_temp.u(1), 'aal2');
select is((api.list_own_need_responses(pg_temp.nid(1), 10) ->> 'confirmedIntentCount') || '/' || jsonb_array_length(api.list_own_need_responses(pg_temp.nid(1), 10) -> 'items'), '3/4',
  'una confirmación anonimizada (donante eliminado) se omite de items y sigue contando');
select pg_temp.login(pg_temp.u(2), 'aal2');
select is(api.list_own_need_responses(pg_temp.nid(1), 10) ->> 'kind', 'not_found', 'el admin de otro hospital no lee las respuestas');
reset role;
update app.needs set expires_at = now() - interval '1 second', created_at = now() - interval '5 days' where need_id = pg_temp.nid(1);
set local role authenticated;
select pg_temp.login(pg_temp.u(1), 'aal2');
select is((select string_agg(e ->> 'validity', ',' order by e ->> 'validity') from jsonb_array_elements(api.list_own_need_responses(pg_temp.nid(1), 10) -> 'items') e where not e ? 'donorName'), 'invalidada,vencida',
  'necesidad vencida: la rechazada aún activa se proyecta vencida y la invalidada se mantiene (O4)');

-- Barrera de sesión: abierta -> unauthenticated en cada DEFINER de usuario --------------------------------------------------------------------
reset role;
insert into app.session_barriers (user_id, generation, state) values (pg_temp.u(1), 1, 'abierta');
set local role authenticated;
select pg_temp.login(pg_temp.u(1), 'aal2');
select is(api.authorize_invitation_batch(pg_temp.nid(7)) ->> 'kind', 'unauthenticated', 'barrera abierta: authorize_invitation_batch -> unauthenticated');
select is(api.list_own_need_responses(pg_temp.nid(7), 10) ->> 'kind', 'unauthenticated', 'barrera abierta: list_own_need_responses -> unauthenticated');
select is(api.list_own_invitation_batches(pg_temp.nid(7), 10) ->> 'kind', 'unauthenticated', 'barrera abierta: list_own_invitation_batches (INVOKER) -> unauthenticated');
reset role;

-- Propiedad y privilegios ---------------------------------------------------------------------------------------------------------------------
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.proname in ('authorize_invitation_batch', 'request_invitation_batch', 'list_own_need_responses', 'get_invitation_action_preview', 'respond_invitation_by_token') and p.prosecdef and pg_get_userbyid(p.proowner) = 'app_privileged'),
  array['authorize_invitation_batch', 'get_invitation_action_preview', 'list_own_need_responses', 'request_invitation_batch', 'respond_invitation_by_token'], 'las cinco DEFINER son propiedad de app_privileged');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'app.invitation_batch_grants'::regclass)
  and not has_any_column_privilege('authenticated', 'app.invitation_batch_grants', 'SELECT, INSERT, UPDATE')
  and not has_table_privilege('authenticated', 'app.invitation_batch_grants', 'DELETE') and not has_any_column_privilege('anon', 'app.invitation_batch_grants', 'SELECT'),
  'las concesiones: RLS forzada y sin acceso para authenticated ni anon');
select is((select prosecdef from pg_proc where oid = 'api.list_own_invitation_batches(uuid, int, timestamptz, uuid)'::regprocedure), false, 'list_own_invitation_batches es INVOKER');
select is((select count(*)::int from pg_proc p where p.proname in ('authorize_invitation_batch', 'request_invitation_batch', 'list_own_invitation_batches', 'list_own_need_responses', 'get_invitation_action_preview', 'respond_invitation_by_token')
  and p.pronamespace = 'api'::regnamespace and not exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')), 0, 'las seis fijan search_path vacío');
select is((select count(*)::int from pg_proc p, (values ('anon'), ('service_role')) r(role)
  where p.proname in ('authorize_invitation_batch', 'request_invitation_batch', 'list_own_invitation_batches', 'list_own_need_responses', 'get_invitation_action_preview', 'respond_invitation_by_token')
  and p.pronamespace = 'api'::regnamespace and has_function_privilege(r.role, p.oid, 'EXECUTE')), 0, 'anon y service_role no ejecutan ninguna');
select is((select count(*)::int from pg_proc p where p.proname in ('authorize_invitation_batch', 'request_invitation_batch', 'list_own_invitation_batches', 'list_own_need_responses', 'get_invitation_action_preview', 'respond_invitation_by_token')
  and p.pronamespace = 'api'::regnamespace and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)), 6, 'authenticated las ejecuta y PUBLIC no');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('api', 'app') and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'),
  array['delete_mfa_factors', 'delete_stale_assisted_account', 'purge_inert_auth_users', 'user_email', 'user_id_by_email', 'worker_delete_inert_user', 'worker_revoke_sessions'],
  'las DEFINER de postgres siguen siendo siete');
select ok((select strpos(prosrc, 'order by o.outbox_id for update') between 1 and strpos(prosrc, 'app.claim_idempotency') - 1 from pg_proc where oid = 'api.respond_invitation_by_token(text, text, text)'::regprocedure),
  'respond_invitation_by_token bloquea el outbox de la cascada antes de claim_idempotency (D3 reglas 3 y 4)');
select ok(has_function_privilege('app_privileged', 'app.invitation_slots_valid(jsonb)', 'EXECUTE') and not has_function_privilege('authenticated', 'app.invitation_slots_valid(jsonb)', 'EXECUTE'), 'el validador de slots solo lo ejecuta app_privileged');

select * from finish();
rollback;
