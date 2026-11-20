begin;
-- F6-3b: lecturas propias del donante, cambio de respuesta por sesión, historial y reintento manual de entrega.
-- Todo se revierte con el rollback.
truncate app.invitation_retry_grants, app.invitation_response_history, app.invitations, app.invitation_batches, app.email_outbox, app.needs, app.sites,
  app.idempotency_records, app.session_barriers, app.admitted_sessions, app.donor_profiles, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(56);

-- Ayudas ---------------------------------------------------------------------------------------------------------
create function pg_temp.u(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.nid(n int) returns uuid language sql immutable as $$ select ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.iid(n int) returns uuid language sql immutable as $$ select ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.sha(t text) returns text language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create function pg_temp.login(p_uid uuid, p_aal text default 'aal1', p_step_up boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
    'amr', jsonb_build_array(case when p_step_up then jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)
                                  else jsonb_build_object('method', 'password', 'timestamp', 1) end))::text, true);
end $$;
create function pg_temp.hc(p_inv uuid, p_resp text) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('invitationId', p_inv::text), jsonb_build_array('response', p_resp))) $$;
create function pg_temp.hr(p_inv uuid) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('invitationId', p_inv::text))) $$;
create function pg_temp.slot(tag text) returns jsonb language sql immutable as $$
  select jsonb_build_object('outboxId', md5(tag || 'o')::uuid, 'confirmHash', pg_temp.sha(tag || 'c'), 'rejectHash', pg_temp.sha(tag || 'r'),
    'sealedPayload', 'sellado-' || tag) $$;
-- Consulta como propietario (las tablas de invitaciones no son legibles por authenticated).
create function pg_temp.q(p_sql text) returns text language plpgsql security definer as $$
declare v text;
begin execute p_sql into v; return v; end $$;
-- Invitación directa: lote por necesidad, outbox y hashes derivados de la etiqueta.
create function pg_temp.mk(p_n int, p_need uuid, p_donor uuid, p_resp text, p_delivery text) returns uuid language plpgsql as $$
declare v_batch uuid; v_inv uuid := pg_temp.iid(p_n); v_outbox uuid := md5('mk' || p_n)::uuid;
begin
  select batch_id into v_batch from app.invitation_batches where need_id = p_need limit 1;
  if v_batch is null then
    insert into app.invitation_batches (need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
    select need_id, hospital_id, created_by, 0, 0 from app.needs where need_id = p_need returning batch_id into v_batch;
  end if;
  insert into app.email_outbox (outbox_id, kind, recipient_user_id, idempotency_key, sealed_payload, not_after)
  values (v_outbox, 'invitacion', p_donor, 'outbox-fixture-' || p_n, 'sellado', now() + interval '1 day');
  insert into app.invitations (invitation_id, need_id, batch_id, hospital_id, donor_id, need_donor_code, validity, delivery, response, response_recorded_at,
                               confirm_token_hash, reject_token_hash, current_outbox_id)
  select v_inv, p_need, v_batch, hospital_id, p_donor, app.new_need_donor_code(p_need), 'activa', p_delivery, p_resp,
         case when p_resp <> 'sin_respuesta' then now() end, pg_temp.sha('mk' || p_n || 'c'), pg_temp.sha('mk' || p_n || 'r'), v_outbox
  from app.needs where need_id = p_need;
  return v_inv;
end $$;
create temp table res (label text primary key, j jsonb);
grant all on res to authenticated;
grant execute on all functions in schema pg_temp to authenticated;

-- Fixtures --------------------------------------------------------------------------------------------------------
-- 1 admin, 3 superadmin, 4 técnica, 11-14 donantes.
insert into auth.users (id, instance_id, aud, role, email)
select pg_temp.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-b-' || n || '@example.test'
from (select unnest(array[1, 3, 4, 11, 12, 13, 14]) n) t;
insert into app.user_accounts (user_id, role, display_name)
select pg_temp.u(n), case n when 1 then 'admin_hospitalario' when 3 then 'superadmin' when 4 then 'api_technical' else 'donante' end::app.actor_role, null
from (select unnest(array[1, 3, 4, 11, 12, 13, 14]) n) t;
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-000000000b01', 'Hospital B Uno', 'Hospital B Uno S.A.', true);
insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint) values
  ('30000000-0000-4000-8000-000000000b01', pg_temp.u(1), '10000000-0000-4000-8000-000000000b01', 'activa', 'a***@example.test');
insert into app.sites (site_id, hospital_id, public_name, public_address, public_instructions, latitude, longitude, is_active, is_approved) values
  ('22222222-2222-4222-8222-222222220b01', '10000000-0000-4000-8000-000000000b01', 'Sede B Uno', 'Cercado de Lima', 'Presentarse en recepción.', -12.046374, -77.042793, true, true),
  ('22222222-2222-4222-8222-222222220b02', '10000000-0000-4000-8000-000000000b01', 'Sede B Dos', 'Miraflores', null, -12.1197, -77.0375, true, true);
insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
select pg_temp.u(n), 'Donante B ' || n, 'A_POS', true, -12.05, -77.043, 'DEMO_ONLY-1', 'activo', now() from (select unnest(array[11, 12, 13, 14]) n) t;
-- N1: A_POS meta 2 activa. N2: meta 1 activa (sede sin instrucciones). N3: cerrada. N4: vencida.
insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, created_at, expires_at)
select pg_temp.nid(k), '10000000-0000-4000-8000-000000000b01', s, pg_temp.u(1), 'RBC', 'A_POS', target, 10, 'Urgente', status, now() - make_interval(hours => 72), now() + exp
from (values
  (1, '22222222-2222-4222-8222-222222220b01'::uuid, 2, 'activa', interval '2 days'),
  (2, '22222222-2222-4222-8222-222222220b02'::uuid, 1, 'activa', interval '2 days'),
  (3, '22222222-2222-4222-8222-222222220b01'::uuid, 1, 'cerrada', interval '2 days'),
  (4, '22222222-2222-4222-8222-222222220b01'::uuid, 1, 'activa', interval '-1 day')
) t (k, s, target, status, exp);
-- I1: N1/d11 sin respuesta, fallida. I2: N1/d12 confirmada. I3: N2/d11 sin respuesta, fallida. I4: N1/d13 rechazada.
-- I5: N3 (cerrada)/d12 confirmada. I6: N4 (vencida)/d13 sin respuesta, fallida. I7: N2/d14 sin respuesta, enviada.
select pg_temp.mk(1, pg_temp.nid(1), pg_temp.u(11), 'sin_respuesta', 'fallida');
select pg_temp.mk(2, pg_temp.nid(1), pg_temp.u(12), 'confirmada', 'entregada');
select pg_temp.mk(3, pg_temp.nid(2), pg_temp.u(11), 'sin_respuesta', 'fallida');
select pg_temp.mk(4, pg_temp.nid(1), pg_temp.u(13), 'rechazada', 'entregada');
select pg_temp.mk(5, pg_temp.nid(3), pg_temp.u(12), 'confirmada', 'entregada');
select pg_temp.mk(6, pg_temp.nid(4), pg_temp.u(13), 'sin_respuesta', 'fallida');
select pg_temp.mk(7, pg_temp.nid(2), pg_temp.u(14), 'sin_respuesta', 'enviada');
insert into app.invitation_response_history (invitation_id, donor_id, response, channel, changed_at) values
  (pg_temp.iid(2), pg_temp.u(12), 'confirmada', 'token', now() - interval '2 hours'),
  (pg_temp.iid(5), pg_temp.u(12), 'confirmada', 'token', now() - interval '1 hour'),
  (pg_temp.iid(4), pg_temp.u(13), 'rechazada', 'token', now() - interval '1 hour');

-- Lecturas del donante --------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login(pg_temp.u(11));
insert into res values ('list', api.list_own_invitations(50));
select is((select j ->> 'kind' from res where label = 'list'), 'ok', 'el donante lista sus invitaciones');
select is(jsonb_array_length((select j -> 'items' from res where label = 'list')), 2, 'solo ve las suyas (I1 e I3)');
select is((select count(*)::int from jsonb_object_keys((select j -> 'items' -> 0 from res where label = 'list'))), 10,
  'cada ítem tiene exactamente los diez campos del contrato (sin hashes, donor_id ni código)');
select ok(exists (select 1 from jsonb_array_elements((select j -> 'items' from res where label = 'list')) e
  where e ->> 'invitationId' = pg_temp.iid(3)::text and e ->> 'instructions' like 'Si decides asistir, acude a la sede indicada%'),
  'sin instrucciones de la sede, usa el texto neutral');
select ok(exists (select 1 from jsonb_array_elements((select j -> 'items' from res where label = 'list')) e
  where e ->> 'invitationId' = pg_temp.iid(1)::text and e ->> 'instructions' = 'Presentarse en recepción.' and e ->> 'hospitalName' = 'Hospital B Uno'),
  'usa las instrucciones públicas de la sede y el nombre público del hospital');
select is(api.list_own_invitations(0) ->> 'kind', 'invalid', 'límite fuera de rango: invalid');
insert into res values ('page1', api.list_own_invitations(1));
select ok((select j -> 'next' from res where label = 'page1') is not null, 'con límite 1 hay página siguiente');
select is(api.list_own_invitations(1, (select (j -> 'next' ->> 'createdAt')::timestamptz from res where label = 'page1'),
  (select (j -> 'next' ->> 'id')::uuid from res where label = 'page1')) -> 'next', 'null'::jsonb, 'la segunda página es la última');
select is(api.get_own_invitation(pg_temp.iid(1)) ->> 'kind', 'ok', 'lee su invitación');
select is(api.get_own_invitation(pg_temp.iid(2)) ->> 'kind', 'not_found', 'la invitación de otro donante es 404');
select is(api.get_own_invitation(gen_random_uuid()) ->> 'kind', 'not_found', 'una inexistente es 404');
select pg_temp.login(pg_temp.u(1), 'aal2');
select is(api.list_own_invitations(10) ->> 'kind', 'forbidden', 'un admin no lista invitaciones de donante');
select is(api.list_own_response_history(10) ->> 'kind', 'forbidden', 'un admin no lee el historial de donante');
reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select is(api.get_own_invitation(pg_temp.iid(1)) ->> 'kind', 'unauthenticated', 'sin sesión: unauthenticated');
select pg_temp.login(pg_temp.u(12));
select is(jsonb_array_length(api.list_own_response_history(10) -> 'items'), 2, 'el historial propio tiene sus dos filas');
select is(api.list_own_response_history(10) -> 'items' -> 0 ->> 'invitationId', pg_temp.iid(5)::text, 'ordenado del más reciente al más antiguo');
select pg_temp.login(pg_temp.u(11));
select is(jsonb_array_length(api.list_own_response_history(10) -> 'items'), 0, 'otro donante no ve historial ajeno');

-- Cambio de respuesta ---------------------------------------------------------------------------------------------
select is(api.change_own_invitation_response('clave-cambio-0000001', pg_temp.hc(pg_temp.iid(1), 'confirmada'), pg_temp.iid(1), 'confirmada') ->> 'kind',
  'conflict', 'la respuesta inicial es solo por token: sin_respuesta es conflict');
select is(api.change_own_invitation_response('clave-cambio-0000002', pg_temp.hc(pg_temp.iid(2), 'rechazada'), pg_temp.iid(2), 'rechazada') ->> 'kind',
  'not_found', 'cambiar la invitación de otro donante es 404');
select is(api.change_own_invitation_response('clave-cambio-0000003', 'hash-malo', pg_temp.iid(1), 'confirmada') ->> 'kind', 'invalid', 'hash incorrecto: invalid');
select is(api.change_own_invitation_response('clave-cambio-0000004', pg_temp.hc(pg_temp.iid(1), 'otra'), pg_temp.iid(1), 'otra') ->> 'kind', 'invalid', 'respuesta fuera de catálogo: invalid');

-- d13 pasa I4 de rechazada a confirmada: completa la meta de N1 (2) y dispara la cascada.
select pg_temp.login(pg_temp.u(13));
insert into res values ('c1', api.change_own_invitation_response('clave-cambio-0000005', pg_temp.hc(pg_temp.iid(4), 'confirmada'), pg_temp.iid(4), 'confirmada'));
select is((select j ->> 'kind' from res where label = 'c1'), 'ok', 'cambia rechazada → confirmada');
select is((select j ->> 'needStatus' from res where label = 'c1'), 'meta_alcanzada', 'la última plaza deja la necesidad en meta_alcanzada');
select is(pg_temp.q($$select validity from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000001'$$), 'invalidada', 'la cascada invalida la invitación sin respuesta');
select is(pg_temp.q($$select status || ':' || coalesce(sealed_payload, 'sin-payload') from app.email_outbox where outbox_id = md5('mk1')::uuid$$), 'cancelado:sin-payload',
  'y cancela su correo pendiente con el payload destruido');
select is(pg_temp.q($$select count(*)::text from app.invitation_response_history where invitation_id = '50000000-0000-4000-8000-000000000004' and channel = 'sesion'$$), '1',
  'el cambio queda en el historial con canal sesion');
select is(api.change_own_invitation_response('clave-cambio-0000005', pg_temp.hc(pg_temp.iid(4), 'confirmada'), pg_temp.iid(4), 'confirmada') -> 'response' ->> 'response', 'confirmada',
  'repetir la misma clave devuelve lo guardado');
select is(pg_temp.q($$select count(*)::text from app.invitation_response_history where invitation_id = '50000000-0000-4000-8000-000000000004'$$), '2', 'sin duplicar el historial');

-- Con la meta alcanzada nadie más puede confirmar; d12 retira su confirmación y la necesidad se reabre sin lote nuevo.
select pg_temp.login(pg_temp.u(12));
insert into res values ('c2', api.change_own_invitation_response('clave-cambio-0000006', pg_temp.hc(pg_temp.iid(2), 'rechazada'), pg_temp.iid(2), 'rechazada'));
select is((select j ->> 'needStatus' from res where label = 'c2'), 'activa', 'retirar una confirmación con la meta alcanzada reabre la necesidad (RF-INV-06)');
select is(pg_temp.q($$select validity from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000001'$$), 'invalidada', 'sin revalidar las invitaciones invalidadas');
select is(pg_temp.q($$select count(*)::text from app.invitation_batches where need_id = '40000000-0000-4000-8000-000000000001'$$), '1', 'ni crear un lote nuevo');
select is(api.change_own_invitation_response('clave-cambio-0000007', pg_temp.hc(pg_temp.iid(2), 'rechazada'), pg_temp.iid(2), 'rechazada') ->> 'kind', 'ok',
  'el mismo valor es éxito idempotente');
select is(pg_temp.q($$select count(*)::text from app.invitation_response_history where invitation_id = '50000000-0000-4000-8000-000000000002'$$), '2',
  'y no añade historial');
select is(api.change_own_invitation_response('clave-cambio-0000008', pg_temp.hc(pg_temp.iid(5), 'rechazada'), pg_temp.iid(5), 'rechazada') ->> 'kind', 'conflict',
  'con la necesidad cerrada no se cambia nada');

-- Reintento manual: autorización (paso 1) -------------------------------------------------------------------------
select pg_temp.login(pg_temp.u(1), 'aal2', true);
select is(api.authorize_invitation_retry(pg_temp.iid(3)) ->> 'kind', 'forbidden', 'un admin de hospital no autoriza reintentos');
select pg_temp.login(pg_temp.u(3), 'aal1');
select is(api.authorize_invitation_retry(pg_temp.iid(3)) ->> 'kind', 'mfa_required', 'el superadmin sin AAL2 no autoriza');
select pg_temp.login(pg_temp.u(3), 'aal2', false);
select is(api.authorize_invitation_retry(pg_temp.iid(3)) ->> 'kind', 'step_up_required', 'sin step-up vigente no autoriza');
select pg_temp.login(pg_temp.u(3), 'aal2', true);
select is(api.authorize_invitation_retry(gen_random_uuid()) ->> 'kind', 'not_found', 'invitación inexistente: 404');
insert into res values ('g3', api.authorize_invitation_retry(pg_temp.iid(3)));
select ok((select j ->> 'grantSecret' from res where label = 'g3') ~ '^[0-9a-f]{64}$', 'el superadmin recibe el secreto de la concesión una sola vez');
select is(api.retry_invitation_delivery('clave-retry-00000001', pg_temp.hr(pg_temp.iid(3)), pg_temp.iid(3), (select j ->> 'grantSecret' from res where label = 'g3'), pg_temp.slot('r3')) ->> 'kind',
  'forbidden', 'la ejecución con una sesión de usuario es forbidden (solo la técnica ejecuta)');
select throws_ok($$select * from app.invitation_retry_grants$$, '42501', null, 'authenticated no accede a la tabla de concesiones');

-- Reintento manual: ejecución (paso 2, sesión técnica) -----------------------------------------------------------------
select pg_temp.login(pg_temp.u(4));
select is(api.retry_invitation_delivery('clave-retry-00000002', pg_temp.hr(pg_temp.iid(3)), pg_temp.iid(3), repeat('ab', 32), pg_temp.slot('r3')) ->> 'kind',
  'forbidden', 'un secreto desconocido es forbidden');
select is(api.retry_invitation_delivery('clave-retry-00000003', pg_temp.hr(pg_temp.iid(3)), pg_temp.iid(3), (select j ->> 'grantSecret' from res where label = 'g3'),
  '{"outboxId":"x"}'::jsonb) ->> 'kind', 'invalid', 'un slot mal formado es invalid');
select is(api.retry_invitation_delivery('clave-retry-00000004', pg_temp.hr(pg_temp.iid(3)), pg_temp.iid(3), (select j ->> 'grantSecret' from res where label = 'g3'), pg_temp.slot('r3')) ->> 'kind',
  'accepted', 'la sesión técnica con la concesión rehace el envío');
select is(pg_temp.q($$select delivery || ':' || (confirm_token_hash = '$$ || pg_temp.sha('r3c') || $$')::text from app.invitations where invitation_id = '50000000-0000-4000-8000-000000000003'$$),
  'pendiente:true', 'la invitación vuelve a pendiente con hashes nuevos (los enlaces anteriores quedan inválidos)');
select is(pg_temp.q($$select status from app.email_outbox where outbox_id = md5('r3o')::uuid$$), 'pendiente', 'y hay una fila nueva en el outbox');
select is(pg_temp.q($$select count(*)::text from app.audit_events where event = 'entrega.reintento_manual'$$), '1', 'queda auditoría del reintento manual');
select is(api.retry_invitation_delivery('clave-retry-00000004', pg_temp.hr(pg_temp.iid(3)), pg_temp.iid(3), (select j ->> 'grantSecret' from res where label = 'g3'), pg_temp.slot('r3')) -> 'response' ->> 'kind',
  'accepted', 'el replay con la misma clave devuelve lo guardado');
select is(api.retry_invitation_delivery('clave-retry-00000005', pg_temp.hr(pg_temp.iid(3)), pg_temp.iid(3), (select j ->> 'grantSecret' from res where label = 'g3'), pg_temp.slot('r3b')) ->> 'kind',
  'forbidden', 'la concesión ya consumida no sirve con otra clave');

-- 409 y 410 --------------------------------------------------------------------------------------------------------
select pg_temp.login(pg_temp.u(3), 'aal2', true);
insert into res values ('g7', api.authorize_invitation_retry(pg_temp.iid(7)));
insert into res values ('g6', api.authorize_invitation_retry(pg_temp.iid(6)));
select pg_temp.login(pg_temp.u(4));
select is(api.retry_invitation_delivery('clave-retry-00000006', pg_temp.hr(pg_temp.iid(7)), pg_temp.iid(7), (select j ->> 'grantSecret' from res where label = 'g7'), pg_temp.slot('r7')) ->> 'kind',
  'conflict', 'solo se reintenta una entrega fallida: «enviada» es conflict');
select is(api.retry_invitation_delivery('clave-retry-00000007', pg_temp.hr(pg_temp.iid(6)), pg_temp.iid(6), (select j ->> 'grantSecret' from res where label = 'g6'), pg_temp.slot('r6')) ->> 'kind',
  'gone', 'con la necesidad vencida es gone');
reset role;

-- Un perfil que ya no está activo no cambia su respuesta (revisión F6, L-2).
update app.donor_profiles set status = 'incompleto' where donor_id = pg_temp.u(12);
set local role authenticated;
select pg_temp.login(pg_temp.u(12));
select is(api.change_own_invitation_response('clave-cambio-0000009', pg_temp.hc(pg_temp.iid(2), 'confirmada'), pg_temp.iid(2), 'confirmada') ->> 'kind', 'conflict',
  'con el perfil no activo no se confirma');
select is(api.change_own_invitation_response('clave-cambio-0000010', pg_temp.hc(pg_temp.iid(2), 'rechazada'), pg_temp.iid(2), 'rechazada') ->> 'kind', 'ok',
  'pero retirar la confirmación sí se permite (RF-INV-06)');
reset role;

-- Perfil no activo: la vista previa y la respuesta por token coinciden en 410 (I7, donante 14).
update app.donor_profiles set status = 'incompleto' where donor_id = pg_temp.u(14);
insert into res values ('fp7', to_jsonb(app.fingerprint(jsonb_build_array(jsonb_build_array('tokenHash', pg_temp.sha('mk7c'))))));
set local role authenticated;
select pg_temp.login(pg_temp.u(4));
select is(api.get_invitation_action_preview(pg_temp.sha('mk7c')) ->> 'kind', 'gone', 'la vista previa de un perfil no activo es gone');
select is(api.respond_invitation_by_token(pg_temp.sha('mk7c'), 'clave-token-00000071', (select j #>> '{}' from res where label = 'fp7')) ->> 'kind', 'gone',
  'y responder por token también es gone');
reset role;

-- Eliminación en ejecución: el reintento es conflict (I1, donante 11).
insert into app.correction_requests (request_id, donor_id, type, requested_fields, status)
values (gen_random_uuid(), pg_temp.u(11), 'eliminacion', array['deletion'], 'en_ejecucion');
set local role authenticated;
select pg_temp.login(pg_temp.u(3), 'aal2', true);
insert into res values ('g1', api.authorize_invitation_retry(pg_temp.iid(1)));
select pg_temp.login(pg_temp.u(4));
select is(api.retry_invitation_delivery('clave-retry-00000011', pg_temp.hr(pg_temp.iid(1)), pg_temp.iid(1), (select j ->> 'grantSecret' from res where label = 'g1'), pg_temp.slot('r1')) ->> 'kind',
  'conflict', 'no se reintenta la entrega a un donante con eliminación en ejecución');
reset role;

select * from finish();
rollback;
