begin;
-- Aislamiento: la base puede estar sembrada. Todo se revierte con el rollback.
truncate app.needs, app.sites, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(101);

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-need-admin-a@example.test'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-need-admin-b@example.test'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-need-donante@example.test'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-need-admin-sin-aut@example.test'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-need-admin-revocado@example.test');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000d1', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000d2', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000d3', 'donante', 'Donante Sintético'),
  ('00000000-0000-4000-8000-0000000000d4', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000d5', 'admin_hospitalario', null);
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-0000000000d1', 'Hospital Necesidades A', 'Hospital Necesidades A S.A.', true),
  ('10000000-0000-4000-8000-0000000000d2', 'Hospital Necesidades B', 'Hospital Necesidades B S.A.', true),
  ('10000000-0000-4000-8000-0000000000d4', 'Hospital Sin Autorizar', 'Hospital Sin Autorizar S.A.', false);
insert into app.hospital_memberships (membership_id, user_id, hospital_id, status, email_hint) values
  ('30000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000d1', 'activa', 'a***@example.test'),
  ('30000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d2', '10000000-0000-4000-8000-0000000000d2', 'activa', 'b***@example.test'),
  ('30000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000d4', '10000000-0000-4000-8000-0000000000d4', 'activa', 'c***@example.test'),
  ('30000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000d5', '10000000-0000-4000-8000-0000000000d1', 'revocada', 'd***@example.test');
insert into app.sites (site_id, hospital_id, public_name, public_address, latitude, longitude, is_active, is_approved) values
  ('22222222-2222-4222-8222-2222222222a1', '10000000-0000-4000-8000-0000000000d1', 'Sede A Activa', 'Cercado de Lima', -12.046374, -77.042793, true, true),
  ('22222222-2222-4222-8222-2222222222a2', '10000000-0000-4000-8000-0000000000d1', 'Sede A Inactiva', 'Cercado de Lima', -12.050000, -77.040000, false, true),
  ('22222222-2222-4222-8222-2222222222a3', '10000000-0000-4000-8000-0000000000d1', 'Sede A Sin Aprobar', 'Cercado de Lima', -12.051000, -77.041000, true, false),
  ('22222222-2222-4222-8222-2222222222b1', '10000000-0000-4000-8000-0000000000d2', 'Sede B Activa', 'Miraflores', -12.119700, -77.037500, true, true),
  ('22222222-2222-4222-8222-2222222222d4', '10000000-0000-4000-8000-0000000000d4', 'Sede Sin Autorizar', 'San Isidro', -12.097500, -77.036000, true, true);

create function pg_temp.login(p_uid text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"%s","amr":[{"method":"password","timestamp":1}]}', p_uid, p_aal), true);
end $$;
grant execute on function pg_temp.login(text, text) to authenticated, anon;

-- Hash canónico de la intención (mismo orden y serialización que fingerprintNeedDraftInput en Node).
create function pg_temp.hash_for(p_component text, p_blood text, p_target int, p_site text, p_radius int, p_urgency text, p_hours int)
returns text language sql as $$
  select app.fingerprint(jsonb_build_array(
    jsonb_build_array('component', p_component), jsonb_build_array('requiredBloodType', p_blood),
    jsonb_build_array('targetConfirmations', p_target), jsonb_build_array('siteId', p_site),
    jsonb_build_array('radiusKm', p_radius), jsonb_build_array('urgency', p_urgency),
    jsonb_build_array('expiresInHours', p_hours)))
$$;
grant execute on function pg_temp.hash_for(text, text, int, text, int, text, int) to authenticated, anon;

create function pg_temp.hash_transition(p_id uuid, p_status text) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('needId', p_id::text), jsonb_build_array('status', p_status)))
$$;
grant execute on function pg_temp.hash_transition(uuid, text) to authenticated, anon;

create function pg_temp.rows_changed(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql; get diagnostics n = row_count; return n;
exception when insufficient_privilege then return -1;
end $$;
grant execute on function pg_temp.rows_changed(text) to authenticated;

-- Estructura y privilegios -------------------------------------------------------------------------------
select is((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'app.needs'::regclass), true,
  'app.needs tiene RLS habilitada y forzada');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.proname in ('create_need_draft', 'list_own_needs', 'get_own_need', 'transition_own_need') and p.prosecdef),
  null, 'las RPC de necesidades son SECURITY INVOKER');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('api', 'app')
    and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE')),
  0, 'ninguna función de api ni app tiene EXECUTE para PUBLIC');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.proname in ('create_need_draft', 'list_own_needs', 'get_own_need', 'transition_own_need')
    and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'anon no ejecuta ninguna RPC de necesidades');
select is(pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-222222222201', 10, 'Urgente', 12),
  '116fd26f7a02120b76a19c5cb88528431f862c2c6870148e72a0abd426562447',
  'el hash canónico SQL coincide con fingerprintNeedDraftInput de Node (valor fijo)');

select is(pg_temp.hash_transition('50000000-0000-4000-8000-0000000000e1', 'cerrada'), '18ffa36e367154a78c13193efa0e635f074f64d34607a59ba9790e8bd0a4d8fe',
  'el hash canónico de la transición coincide con el servicio de Node (valor fijo)');

set local role authenticated;

-- Autorización ------------------------------------------------------------------------------------------------
select is(api.create_need_draft('clave-need-00000001', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'unauthenticated', 'sin sesión es unauthenticated');
select pg_temp.login('00000000-0000-4000-8000-0000000000d3', 'aal2');
select is(api.create_need_draft('clave-need-00000001', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'forbidden', 'un donante no crea necesidades');
select pg_temp.login('00000000-0000-4000-8000-0000000000d1', 'aal1');
select is(api.create_need_draft('clave-need-00000001', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'mfa_required', 'un admin en AAL1 exige MFA');
select pg_temp.login('00000000-0000-4000-8000-0000000000d5', 'aal2');
select is(api.create_need_draft('clave-need-00000001', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'forbidden', 'un admin con membresía revocada no crea necesidades');
select pg_temp.login('00000000-0000-4000-8000-0000000000d4', 'aal2');
select is(api.create_need_draft('clave-need-00000001', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-222222222201', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-222222222201', 10, 'Urgente', 12) ->> 'kind', 'forbidden', 'un admin de un hospital sin autorizar no crea necesidades');
select is(api.list_own_needs(10) ->> 'kind', 'forbidden', 'un admin de un hospital sin autorizar no lista');

-- Creación ----------------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000d1', 'aal2');
create temp table created as select api.create_need_draft('clave-need-00000002',
  pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) as r;
grant select on created to authenticated;
select is((select r ->> 'kind' from created), 'created', 'un admin AAL2 con membresía activa crea un borrador');
select is((select r #>> '{owner,hospitalId}' from created), '10000000-0000-4000-8000-0000000000d1', 'el propietario es el hospital de la membresía');
select is((select r #>> '{owner,actorId}' from created), '00000000-0000-4000-8000-0000000000d1', 'el propietario incluye al actor');
select is((select array_agg(k order by k) from created, jsonb_object_keys((select r -> 'need' from created)) k),
  array['component', 'confirmedIntentCount', 'expiresAt', 'needId', 'radiusKm', 'requiredBloodType', 'siteId', 'status', 'targetConfirmations', 'urgency'],
  'la proyección tiene exactamente los diez campos');
select is((select r #>> '{need,status}' from created), 'borrador', 'nace en borrador');
select is((select (r #>> '{need,confirmedIntentCount}')::int from created), 0, 'confirmedIntentCount nace en 0');
select is((select (select app.iso(n.expires_at) from app.needs n where n.need_id = (c.r #>> '{need,needId}')::uuid) = c.r #>> '{need,expiresAt}' from created c),
  true, 'expiresAt es el instante exacto de la fila, con microsegundos');
select is((select n.expires_at - n.created_at from app.needs n where n.need_id = (select (r #>> '{need,needId}')::uuid from created)),
  interval '12 hours', 'PostgreSQL calcula expires_at = created_at + expiresInHours');
select is((select (n.created_by)::text from app.needs n where n.need_id = (select (r #>> '{need,needId}')::uuid from created)),
  '00000000-0000-4000-8000-0000000000d1', 'created_by es el actor autenticado, no un argumento');

-- Replay y conflicto ------------------------------------------------------------------------------------------
create temp table replayed as select api.create_need_draft('clave-need-00000002',
  pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) as r;
grant select on replayed to authenticated;
select is((select r ->> 'kind' from replayed), 'replayed', 'la misma clave e intención repite el resultado');
select is((select r -> 'response' from replayed), (select r from created), 'el replay devuelve exactamente la respuesta original');
select is((select count(*)::int from app.needs where hospital_id = '10000000-0000-4000-8000-0000000000d1'), 1, 'el replay no crea otra necesidad');
select is(api.create_need_draft('clave-need-00000002',
  pg_temp.hash_for('RBC', 'O_NEG', 6, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 6, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'payload_conflict',
  'la misma clave con otra intención es payload_conflict');
select is(api.create_need_draft('clave-need-00000003', repeat('0', 64),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'invalid',
  'un hash que no corresponde a los siete campos es invalid');
select is((select count(*)::int from app.idempotency_records where operation = 'createHospitalNeed' and idem_key = 'clave-need-00000003'), 0,
  'el rechazo por hash no deja registro de idempotencia');

-- Argumentos fuera de dominio (invalid, antes de reclamar la clave) ----------------------------------------
select is(api.create_need_draft('clave-need-00000004', pg_temp.hash_for('PLT', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'PLT', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'invalid', 'componente distinto de RBC');
select is(api.create_need_draft('clave-need-00000004', pg_temp.hash_for('RBC', 'XX', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'XX', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'invalid', 'grupo sanguíneo desconocido');
select is(api.create_need_draft('clave-need-00000004', pg_temp.hash_for('RBC', 'O_NEG', 0, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 0, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'invalid', 'meta 0');
select is(api.create_need_draft('clave-need-00000004', pg_temp.hash_for('RBC', 'O_NEG', 51, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 51, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'invalid', 'meta 51');
select is(api.create_need_draft('clave-need-00000004', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 51, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 51, 'Urgente', 12) ->> 'kind', 'invalid', 'radio 51');
select is(api.create_need_draft('clave-need-00000004', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Maxima', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Maxima', 12) ->> 'kind', 'invalid', 'urgencia desconocida');
select is(api.create_need_draft('clave-need-00000004', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 73),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 73) ->> 'kind', 'invalid', 'horas 73');
select is(api.create_need_draft('clave-need-00000004', pg_temp.hash_for('RBC', 'O_NEG', 5, 'no-es-un-uuid', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, 'no-es-un-uuid', 10, 'Urgente', 12) ->> 'kind', 'invalid', 'siteId que no es un UUID');

-- Sede inutilizable: una sola respuesta, sin rastro del motivo -----------------------------------------------
create temp table unusable as
  select 'inexistente' as caso, api.create_need_draft('clave-need-00000005', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222ff', 10, 'Urgente', 12),
    'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222ff', 10, 'Urgente', 12) as r
  union all
  select 'ajena', api.create_need_draft('clave-need-00000006', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222b1', 10, 'Urgente', 12),
    'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222b1', 10, 'Urgente', 12)
  union all
  select 'inactiva', api.create_need_draft('clave-need-00000007', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a2', 10, 'Urgente', 12),
    'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a2', 10, 'Urgente', 12)
  union all
  select 'sin aprobar', api.create_need_draft('clave-need-00000008', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a3', 10, 'Urgente', 12),
    'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a3', 10, 'Urgente', 12);
grant select on unusable to authenticated;
select is((select count(distinct r)::int from unusable), 1, 'sede inexistente, ajena, inactiva y sin aprobar dan la misma respuesta');
select is((select r from unusable limit 1), '{"kind": "site_unusable"}'::jsonb, 'la respuesta es site_unusable y nada más');
select is((select count(*)::int from app.needs where hospital_id = '10000000-0000-4000-8000-0000000000d1'), 1, 'ninguna sede inutilizable crea una necesidad');
select is((select count(*)::int from app.idempotency_records where operation = 'createHospitalNeed' and idem_key between 'clave-need-00000005' and 'clave-need-00000008'), 0,
  'el rechazo por sede no deja registro de idempotencia (se puede reintentar con la misma clave)');

-- Replay tras desactivar la sede: se devuelve lo guardado ---------------------------------------------------
reset role;
update app.sites set is_active = false where site_id = '22222222-2222-4222-8222-2222222222a1';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000d1', 'aal2');
select is(api.create_need_draft('clave-need-00000002',
  pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'replayed',
  'el replay de una creación previa sigue vigente aunque la sede se haya desactivado');
select is(api.create_need_draft('clave-need-00000009',
  pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'site_unusable',
  'una creación nueva sobre esa sede ya desactivada es site_unusable');
reset role;
update app.sites set is_active = true where site_id = '22222222-2222-4222-8222-2222222222a1';
set local role authenticated;

-- Auditoría (solo el superadmin la lee por RLS: se consulta como propietario) --------------------------------
reset role;
select is((select count(*)::int from app.audit_events where event = 'necesidad.creada' and actor_id = '00000000-0000-4000-8000-0000000000d1'), 1,
  'la creación escribe un solo evento de auditoría');
select is((select reason from app.audit_events where event = 'necesidad.creada' and actor_id = '00000000-0000-4000-8000-0000000000d1'), null, 'la auditoría de creación no lleva texto libre');
set local role authenticated;

-- Lectura -------------------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000d2', 'aal2');
select is(api.create_need_draft('clave-need-00000010', pg_temp.hash_for('RBC', 'A_POS', 3, '22222222-2222-4222-8222-2222222222b1', 25, 'Normal', 24),
  'RBC', 'A_POS', 3, '22222222-2222-4222-8222-2222222222b1', 25, 'Normal', 24) ->> 'kind', 'created', 'el hospital B crea su propia necesidad');
select pg_temp.login('00000000-0000-4000-8000-0000000000d1', 'aal2');
select is(jsonb_array_length(api.list_own_needs(10) -> 'items'), 1, 'cada hospital lista solo las suyas');
select is(api.list_own_needs(10) #>> '{items,0,siteId}', '22222222-2222-4222-8222-2222222222a1', 'el hospital A ve su propia necesidad');
select is(api.get_own_need((select (r #>> '{need,needId}')::uuid from created)) ->> 'kind', 'ok', 'get devuelve la necesidad propia');
select pg_temp.login('00000000-0000-4000-8000-0000000000d2', 'aal2');
select is(api.get_own_need((select (r #>> '{need,needId}')::uuid from created)) ->> 'kind', 'not_found', 'una necesidad ajena es indistinguible de una inexistente (sin IDOR)');
select is(api.get_own_need('99999999-9999-4999-8999-999999999999') ->> 'kind', 'not_found', 'una necesidad inexistente es not_found');
select is(api.list_own_needs(0) ->> 'kind', 'invalid', 'limit 0 es invalid');
select is(api.list_own_needs(101) ->> 'kind', 'invalid', 'limit 101 es invalid');
select is(api.list_own_needs(10, 'inventado') ->> 'kind', 'invalid', 'un estado fuera de la lista es invalid');
select is(api.list_own_needs(10, null, now(), null) ->> 'kind', 'invalid', 'un cursor incompleto es invalid');

-- Paginación y filtro por estado proyectado -------------------------------------------------------------------
reset role;
insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, created_at, expires_at) values
  ('50000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000d1', '22222222-2222-4222-8222-2222222222a1', '00000000-0000-4000-8000-0000000000d1', 'RBC', 'B_POS', 2, 10, 'Normal', 'activa', now() - interval '3 days', now() + interval '2 days'),
  ('50000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-0000000000d1', '22222222-2222-4222-8222-2222222222a1', '00000000-0000-4000-8000-0000000000d1', 'RBC', 'B_POS', 2, 10, 'Normal', 'activa', now() - interval '2 days', now() - interval '1 hour'),
  ('50000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-0000000000d1', '22222222-2222-4222-8222-2222222222a1', '00000000-0000-4000-8000-0000000000d1', 'RBC', 'B_POS', 2, 10, 'Normal', 'borrador', now() - interval '2 days', now() - interval '1 hour'),
  ('50000000-0000-4000-8000-0000000000e4', '10000000-0000-4000-8000-0000000000d1', '22222222-2222-4222-8222-2222222222a1', '00000000-0000-4000-8000-0000000000d1', 'RBC', 'B_POS', 2, 10, 'Normal', 'cerrada', now() - interval '4 days', now() - interval '1 day');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000d1', 'aal2');
select is(api.get_own_need('50000000-0000-4000-8000-0000000000e2') #>> '{need,status}', 'vencida', 'una activa con el plazo vencido se proyecta como vencida');
select is(api.get_own_need('50000000-0000-4000-8000-0000000000e3') #>> '{need,status}', 'vencida', 'un borrador con el plazo vencido también vence');
select is(api.get_own_need('50000000-0000-4000-8000-0000000000e4') #>> '{need,status}', 'cerrada', 'una cerrada conserva su estado');
select is((select array_agg(i ->> 'needId' order by i ->> 'needId') from jsonb_array_elements(api.list_own_needs(10, 'vencida') -> 'items') i),
  array['50000000-0000-4000-8000-0000000000e2', '50000000-0000-4000-8000-0000000000e3'],
  'el filtro vencida se aplica sobre el estado proyectado');
select is(jsonb_array_length(api.list_own_needs(10, 'activa') -> 'items'), 1, 'el filtro activa excluye las vencidas por plazo');
select is(jsonb_array_length(api.list_own_needs(10, 'borrador') -> 'items'), 1, 'el filtro borrador excluye el borrador vencido');
create temp table page1 as select api.list_own_needs(2) as r;
grant select on page1 to authenticated;
select is((select jsonb_array_length(r -> 'items') from page1), 2, 'la primera página trae limit elementos');
select is((select r #>> '{items,0,needId}' from page1), (select (c.r #>> '{need,needId}') from created c), 'orden: la más reciente primero');
select is((select jsonb_typeof(r -> 'next') from page1), 'object', 'hay cursor cuando quedan más');
select is((select count(*)::int from jsonb_array_elements(api.list_own_needs(10, null,
  ((select r from page1) #>> '{next,createdAt}')::timestamptz, ((select r from page1) #>> '{next,id}')::uuid) -> 'items')), 3,
  'la segunda página continúa tras el cursor sin repetir');
select is(api.list_own_needs(10) -> 'next', 'null'::jsonb, 'sin más filas no hay cursor');

-- Transición manual (C-8) --------------------------------------------------------------------------------------
create temp table to_active as select api.transition_own_need('clave-trans-0000001',
  pg_temp.hash_transition((select (r #>> '{need,needId}')::uuid from created), 'activa'),
  (select (r #>> '{need,needId}')::uuid from created), 'activa') as r;
grant select on to_active to authenticated;
select is((select r ->> 'kind' from to_active), 'ok', 'borrador → activa');
select is((select r #>> '{need,status}' from to_active), 'activa', 'la respuesta lleva el nuevo estado');
select is((select n.version from app.needs n where n.need_id = (select (r #>> '{need,needId}')::uuid from created)), 1, 'la transición incrementa version');
select is(api.transition_own_need('clave-trans-0000001',
  pg_temp.hash_transition((select (r #>> '{need,needId}')::uuid from created), 'activa'),
  (select (r #>> '{need,needId}')::uuid from created), 'activa') -> 'response', (select r from to_active), 'el replay devuelve el resultado original');
select is((select n.version from app.needs n where n.need_id = (select (r #>> '{need,needId}')::uuid from created)), 1, 'el replay no vuelve a incrementar version');
select is(api.transition_own_need('clave-trans-0000001',
  pg_temp.hash_transition((select (r #>> '{need,needId}')::uuid from created), 'cerrada'),
  (select (r #>> '{need,needId}')::uuid from created), 'cerrada') ->> 'kind', 'payload_conflict', 'la misma clave con otro destino es payload_conflict');
select is(api.transition_own_need('clave-trans-0000002',
  pg_temp.hash_transition((select (r #>> '{need,needId}')::uuid from created), 'activa'),
  (select (r #>> '{need,needId}')::uuid from created), 'activa') ->> 'kind', 'conflict', 'activa → activa no está en la matriz');
select is(api.transition_own_need('clave-trans-0000003', pg_temp.hash_transition('50000000-0000-4000-8000-0000000000e1', 'cerrada'),
  '50000000-0000-4000-8000-0000000000e1', 'cerrada') ->> 'kind', 'ok', 'activa → cerrada');
select is(api.transition_own_need('clave-trans-0000004', pg_temp.hash_transition('50000000-0000-4000-8000-0000000000e1', 'activa'),
  '50000000-0000-4000-8000-0000000000e1', 'activa') ->> 'kind', 'conflict', 'una cerrada no se reabre');
select is(api.transition_own_need('clave-trans-0000005', pg_temp.hash_transition('50000000-0000-4000-8000-0000000000e3', 'activa'),
  '50000000-0000-4000-8000-0000000000e3', 'activa') ->> 'kind', 'conflict', 'borrador → activa con el plazo vencido es conflict');
select is(api.transition_own_need('clave-trans-0000006', pg_temp.hash_transition('50000000-0000-4000-8000-0000000000e2', 'cancelada'),
  '50000000-0000-4000-8000-0000000000e2', 'cancelada') ->> 'kind', 'conflict', 'una activa vencida por plazo ya es terminal');
select is(api.transition_own_need('clave-trans-0000007', pg_temp.hash_transition('50000000-0000-4000-8000-0000000000e2', 'vencida'),
  '50000000-0000-4000-8000-0000000000e2', 'vencida') ->> 'kind', 'invalid', 'vencida no es un destino que el cliente pueda pedir');
select is(api.transition_own_need('clave-trans-0000008', pg_temp.hash_transition('50000000-0000-4000-8000-0000000000e2', 'meta_alcanzada'),
  '50000000-0000-4000-8000-0000000000e2', 'meta_alcanzada') ->> 'kind', 'invalid', 'meta_alcanzada no es un destino que el cliente pueda pedir');
select is(api.transition_own_need('clave-trans-0000009', repeat('0', 64), '50000000-0000-4000-8000-0000000000e1', 'cerrada') ->> 'kind', 'invalid',
  'un hash que no corresponde es invalid');
select is((select count(*)::int from app.idempotency_records where operation = 'transitionOwnHospitalNeed' and idem_key in ('clave-trans-0000002', 'clave-trans-0000004', 'clave-trans-0000005', 'clave-trans-0000006')), 0,
  'los conflictos de estado no dejan registro de idempotencia');
select pg_temp.login('00000000-0000-4000-8000-0000000000d2', 'aal2');
select is(api.transition_own_need('clave-trans-0000010', pg_temp.hash_transition('50000000-0000-4000-8000-0000000000e1', 'cancelada'),
  '50000000-0000-4000-8000-0000000000e1', 'cancelada') ->> 'kind', 'not_found', 'otro hospital no transiciona una necesidad ajena (sin IDOR)');
select pg_temp.login('00000000-0000-4000-8000-0000000000d1', 'aal1');
select is(api.transition_own_need('clave-trans-0000011', pg_temp.hash_transition('50000000-0000-4000-8000-0000000000e1', 'cancelada'),
  '50000000-0000-4000-8000-0000000000e1', 'cancelada') ->> 'kind', 'mfa_required', 'la transición exige AAL2');
reset role;
select is((select count(*)::int from app.audit_events where event = 'necesidad.transicion' and actor_id = '00000000-0000-4000-8000-0000000000d1'), 2, 'cada transición aceptada escribe un evento de auditoría');
set local role authenticated;

-- Endurecimiento tras la revisión independiente ----------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000d1', 'aal2');
select is(api.create_need_draft('corta', pg_temp.hash_for('RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12),
  'RBC', 'O_NEG', 5, '22222222-2222-4222-8222-2222222222a1', 10, 'Urgente', 12) ->> 'kind', 'invalid', 'una clave de idempotencia de menos de 16 caracteres es invalid (no una excepción)');
select is(api.transition_own_need('corta', pg_temp.hash_transition('50000000-0000-4000-8000-0000000000e1', 'cancelada'),
  '50000000-0000-4000-8000-0000000000e1', 'cancelada') ->> 'kind', 'invalid', 'una clave de transición de menos de 16 caracteres es invalid');

-- Activar exige que la sede siga activa y aprobada.
create temp table fresh_draft as select api.create_need_draft('clave-need-00000020',
  pg_temp.hash_for('RBC', 'AB_POS', 4, '22222222-2222-4222-8222-2222222222a1', 10, 'Normal', 24),
  'RBC', 'AB_POS', 4, '22222222-2222-4222-8222-2222222222a1', 10, 'Normal', 24) as r;
grant select on fresh_draft to authenticated;
reset role;
update app.sites set is_active = false where site_id = '22222222-2222-4222-8222-2222222222a1';
set local role authenticated;
select is(api.transition_own_need('clave-trans-0000020', pg_temp.hash_transition((select (r #>> '{need,needId}')::uuid from fresh_draft), 'activa'),
  (select (r #>> '{need,needId}')::uuid from fresh_draft), 'activa') ->> 'kind', 'conflict',
  'activar un borrador cuya sede se desactivó es conflict');
reset role;
update app.sites set is_active = true where site_id = '22222222-2222-4222-8222-2222222222a1';
set local role authenticated;

-- Un replay nunca se entrega a quien ya pertenece a otro hospital.
reset role;
update app.hospital_memberships set hospital_id = '10000000-0000-4000-8000-0000000000d2' where membership_id = '30000000-0000-4000-8000-0000000000d1';
set local role authenticated;
select is(api.create_need_draft('clave-need-00000020',
  pg_temp.hash_for('RBC', 'AB_POS', 4, '22222222-2222-4222-8222-2222222222a1', 10, 'Normal', 24),
  'RBC', 'AB_POS', 4, '22222222-2222-4222-8222-2222222222a1', 10, 'Normal', 24) ->> 'kind', 'forbidden',
  'el replay de una creación del hospital anterior no se entrega tras cambiar de hospital');
reset role;
update app.hospital_memberships set hospital_id = '10000000-0000-4000-8000-0000000000d1' where membership_id = '30000000-0000-4000-8000-0000000000d1';
set local role authenticated;
select is(api.create_need_draft('clave-need-00000020',
  pg_temp.hash_for('RBC', 'AB_POS', 4, '22222222-2222-4222-8222-2222222222a1', 10, 'Normal', 24),
  'RBC', 'AB_POS', 4, '22222222-2222-4222-8222-2222222222a1', 10, 'Normal', 24) ->> 'kind', 'replayed', 'con el hospital original el replay vuelve a funcionar');

-- Tope de creación por actor: se cuenta sobre las necesidades realmente creadas (no un contador externo).
reset role;
insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, expires_at)
  select '10000000-0000-4000-8000-0000000000d2', '22222222-2222-4222-8222-2222222222b1', '00000000-0000-4000-8000-0000000000d2',
         'RBC', 'O_POS', 1, 1, 'Normal', now() + interval '1 day' from generate_series(1, 30);
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000d2', 'aal2');
select is(api.create_need_draft('clave-need-00000030', pg_temp.hash_for('RBC', 'A_POS', 2, '22222222-2222-4222-8222-2222222222b1', 10, 'Normal', 5),
  'RBC', 'A_POS', 2, '22222222-2222-4222-8222-2222222222b1', 10, 'Normal', 5) ->> 'kind', 'rate_limited', 'con 30 creaciones en la última hora, una creación nueva es rate_limited');
select is(api.create_need_draft('clave-need-00000010', pg_temp.hash_for('RBC', 'A_POS', 3, '22222222-2222-4222-8222-2222222222b1', 25, 'Normal', 24),
  'RBC', 'A_POS', 3, '22222222-2222-4222-8222-2222222222b1', 25, 'Normal', 24) ->> 'kind', 'replayed', 'el replay no crea filas, así que no consume ni exige cupo');
select is((select count(*)::int from app.idempotency_records where idem_key = 'clave-need-00000030'), 0, 'rate_limited no deja registro de idempotencia');

-- Aislamiento por la propia base (sin pasar por las RPC).
reset role;
select throws_ok($$insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, expires_at)
  values ('10000000-0000-4000-8000-0000000000d1', '22222222-2222-4222-8222-2222222222b1', '00000000-0000-4000-8000-0000000000d1', 'RBC', 'O_NEG', 1, 1, 'Normal', now() + interval '1 day')$$,
  '23503', null, 'la clave foránea compuesta impide una sede de otro hospital incluso para el propietario de la base');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000d1', 'aal2');
select is(pg_temp.rows_changed($$insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, expires_at)
  values ('10000000-0000-4000-8000-0000000000d1', '22222222-2222-4222-8222-2222222222a1', '00000000-0000-4000-8000-0000000000d1', 'RBC', 'O_NEG', 1, 1, 'Normal', 'activa', now() + interval '1 day')$$), -1,
  'un admin no inserta una necesidad con estado distinto del inicial (status no es insertable)');
select is(pg_temp.rows_changed($$insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, expires_at)
  values ('10000000-0000-4000-8000-0000000000d1', '22222222-2222-4222-8222-2222222222a1', '00000000-0000-4000-8000-0000000000d2', 'RBC', 'O_NEG', 1, 1, 'Normal', now() + interval '1 day')$$), -1,
  'un admin no inserta una necesidad atribuida a otro actor (created_by)');
select is(pg_temp.rows_changed($$insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, expires_at)
  values ('10000000-0000-4000-8000-0000000000d1', '22222222-2222-4222-8222-2222222222a2', '00000000-0000-4000-8000-0000000000d1', 'RBC', 'O_NEG', 1, 1, 'Normal', now() + interval '1 day')$$), -1,
  'la política impide una necesidad sobre una sede inactiva');
select is(pg_temp.rows_changed($$update app.needs set hospital_id = '10000000-0000-4000-8000-0000000000d2' where need_id = '50000000-0000-4000-8000-0000000000e1'$$), -1,
  'hospital_id no es actualizable');

-- Escrituras directas bajo RLS ----------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000d1', 'aal2');
select is(pg_temp.rows_changed($$insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, expires_at)
  values ('10000000-0000-4000-8000-0000000000d2', '22222222-2222-4222-8222-2222222222b1', '00000000-0000-4000-8000-0000000000d1', 'RBC', 'O_NEG', 1, 1, 'Normal', now() + interval '1 day')$$), -1,
  'un admin no inserta una necesidad en otro hospital');
select is(pg_temp.rows_changed($$insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, expires_at)
  values ('10000000-0000-4000-8000-0000000000d1', '22222222-2222-4222-8222-2222222222b1', '00000000-0000-4000-8000-0000000000d1', 'RBC', 'O_NEG', 1, 1, 'Normal', now() + interval '1 day')$$), -1,
  'un admin no inserta una necesidad en una sede de otro hospital');
select is(pg_temp.rows_changed($$update app.needs set component = 'RBC' where need_id = '50000000-0000-4000-8000-0000000000e1'$$), -1,
  'solo status, updated_at y version son actualizables');
select is(pg_temp.rows_changed($$update app.needs set status = 'cancelada' where hospital_id = '10000000-0000-4000-8000-0000000000d2'$$), 0,
  'un admin no actualiza necesidades de otro hospital');
select is(pg_temp.rows_changed($$delete from app.needs$$), -1, 'un admin no borra necesidades');
select is((select count(*)::int from app.needs where hospital_id = '10000000-0000-4000-8000-0000000000d2'), 0, 'un admin no lee necesidades de otro hospital');

select * from finish();
rollback;
