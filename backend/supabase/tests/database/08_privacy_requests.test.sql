begin;
truncate app.correction_requests, app.access_grants, app.deletion_ledger, app.donor_profiles, app.user_accounts cascade;

select plan(43);

insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'donante-uno@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'donante-dos@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'donante-pendiente@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'super-uno@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'super-dos@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', now() - interval '1 day');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'donante', null), ('00000000-0000-4000-8000-0000000000a2', 'donante', null),
  ('00000000-0000-4000-8000-0000000000a3', 'donante', null),
  ('00000000-0000-4000-8000-0000000000b1', 'superadmin', null), ('00000000-0000-4000-8000-0000000000b2', 'superadmin', null),
  ('00000000-0000-4000-8000-0000000000c1', 'admin_hospitalario', null);
insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'Donante Uno', 'O_POS', true, -12.046, -77.043, 'DEMO_ONLY-1', 'activo', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'Donante Dos', 'A_POS', true, -12.046, -77.043, 'DEMO_ONLY-1', 'activo', now());
insert into app.donor_profiles (donor_id, status) values ('00000000-0000-4000-8000-0000000000a3', 'pendiente_verificacion');

create function pg_temp.login(p_uid text, p_aal text default 'aal2', p_step_up boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
    'amr', jsonb_build_array(case when p_step_up then jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)
                                  else jsonb_build_object('method', 'password', 'timestamp', 1) end))::text, true);
end $$;
grant execute on function pg_temp.login(text, text, boolean) to authenticated, anon;
create function pg_temp.hash_decision(p_id uuid, p_decision text, p_reason text) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('requestId', p_id::text), jsonb_build_array('decision', p_decision), jsonb_build_array('reason', p_reason)))
$$;
grant execute on function pg_temp.hash_decision(uuid, text, text) to authenticated, anon;
create function pg_temp.hash_grant(p_id uuid, p_action text, p_fields text, p_reason text) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('requestId', p_id::text), jsonb_build_array('action', p_action),
    jsonb_build_array('allowedFields', p_fields), jsonb_build_array('reason', p_reason)))
$$;
grant execute on function pg_temp.hash_grant(uuid, text, text, text) to authenticated, anon;

-- Estructura y privilegios -------------------------------------------------------------------------------
select is((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('app.correction_requests'::regclass, 'app.access_grants'::regclass, 'app.deletion_ledger'::regclass)), true, 'RLS habilitada y forzada en las tres tablas');
select is(has_column_privilege('authenticated', 'app.correction_requests', 'proposed_name', 'SELECT')
  or has_column_privilege('authenticated', 'app.correction_requests', 'proposed_email_sealed', 'SELECT')
  or has_column_privilege('authenticated', 'app.correction_requests', 'proposed_blood_type', 'SELECT'), false, 'nadie lee los valores propuestos por SQL directo');
select is(has_table_privilege('authenticated', 'app.deletion_ledger', 'SELECT') or has_table_privilege('anon', 'app.correction_requests', 'SELECT'), false, 'el ledger y las solicitudes no son legibles por authenticated/anon');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api' and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname in ('create_own_correction_request', 'list_own_correction_requests', 'get_own_correction_request', 'list_correction_requests', 'get_correction_request',
  'decide_correction_request', 'create_contextual_access_grant', 'get_contextual_donor_data')), 0, 'anon no ejecuta ninguna RPC de F7');
select is((select pg_get_userbyid(proowner) from pg_proc where oid = 'api.get_contextual_donor_data(uuid, uuid)'::regprocedure), 'app_privileged', 'la lectura contextual es DEFINER de app_privileged');

-- Alta de solicitudes (donante) --------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal1');
select is(api.create_own_correction_request('clave-solicitud-0001', repeat('a', 64), '90000000-0000-4000-8000-000000000001', 'correccion', 'Nombre Nuevo', repeat('s', 40), null) ->> 'kind',
  'created', 'un donante crea una corrección de nombre y correo');
select is(api.create_own_correction_request('clave-solicitud-0001', repeat('a', 64), '90000000-0000-4000-8000-000000000002', 'correccion', 'Nombre Nuevo', repeat('s', 40), null) ->> 'kind',
  'replayed', 'el mismo intento con la misma clave es un replay');
select is(api.create_own_correction_request('clave-solicitud-0001', repeat('b', 64), '90000000-0000-4000-8000-000000000003', 'correccion', 'Otro', null, null) ->> 'kind',
  'payload_conflict', 'la misma clave con otro payload es payload_conflict');
select is(api.create_own_correction_request('clave-solicitud-0002', repeat('c', 64), '90000000-0000-4000-8000-000000000004', 'correccion', null, null, 'A_POS') ->> 'kind',
  'conflict', 'una segunda corrección abierta del mismo donante es conflict');
select is(api.create_own_correction_request('clave-solicitud-0003', repeat('d', 64), '90000000-0000-4000-8000-000000000005', 'correccion', null, null, null) ->> 'kind',
  'invalid', 'una corrección sin cambios es invalid');
select is(api.create_own_correction_request('clave-solicitud-0004', repeat('e', 64), '90000000-0000-4000-8000-000000000006', 'eliminacion', 'x', null, null) ->> 'kind',
  'invalid', 'una eliminación no admite campos');
select is(api.create_own_correction_request('clave-solicitud-0005', repeat('f', 64), '90000000-0000-4000-8000-000000000007', 'eliminacion', null, null, null) ->> 'kind',
  'created', 'pero sí una eliminación vacía (otro tipo, no choca)');
select pg_temp.login('00000000-0000-4000-8000-0000000000a3', 'aal1');
select is(api.create_own_correction_request('clave-solicitud-0006', repeat('1', 64), '90000000-0000-4000-8000-000000000008', 'eliminacion', null, null, null) ->> 'kind',
  'forbidden', 'un perfil sin verificar no pide cambios');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
select is(api.create_own_correction_request('clave-solicitud-0007', repeat('2', 64), '90000000-0000-4000-8000-000000000009', 'eliminacion', null, null, null) ->> 'kind',
  'forbidden', 'un superadmin no crea solicitudes de donante');
reset role;
select is((select count(*)::int from app.correction_requests), 2, 'solo existen las dos solicitudes válidas');
select is((select requested_fields from app.correction_requests where request_id = '90000000-0000-4000-8000-000000000001'), array['email', 'name'], 'los campos pedidos se derivan de los cambios');

-- Lectura propia -----------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1', 'aal1');
select is(jsonb_array_length(api.list_own_correction_requests(10) -> 'items'), 2, 'el donante lista sus dos solicitudes');
select is(api.list_own_correction_requests(10) -> 'items' -> 0 ? 'proposedName' or (api.list_own_correction_requests(10)::text like '%Nombre Nuevo%'), false, 'la lista no trae valores');
select is(api.get_own_correction_request('90000000-0000-4000-8000-000000000001') ->> 'kind', 'ok', 'consulta una propia');
select pg_temp.login('00000000-0000-4000-8000-0000000000a2', 'aal1');
select is(api.get_own_correction_request('90000000-0000-4000-8000-000000000001') ->> 'kind', 'not_found', 'otro donante no ve una solicitud ajena');
select is(jsonb_array_length(api.list_own_correction_requests(10) -> 'items'), 0, 'ni la lista');

-- Superadmin: lista, consulta y decisión --------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal1');
select is(api.list_correction_requests(10) ->> 'kind', 'mfa_required', 'el superadmin necesita AAL2');
select pg_temp.login('00000000-0000-4000-8000-0000000000c1', 'aal2');
select is(api.list_correction_requests(10) ->> 'kind', 'forbidden', 'un admin hospitalario no lista solicitudes');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
select is(jsonb_array_length(api.list_correction_requests(10) -> 'items'), 2, 'el superadmin lista las dos');
select is(api.list_correction_requests(10)::text like '%Nombre Nuevo%' or api.list_correction_requests(10)::text like '%a1%donante%', false, 'sin valores ni identificador del donante');
select is(api.get_correction_request('90000000-0000-4000-8000-000000000001') ->> 'kind', 'ok', 'consulta una solicitud');
select is(api.get_correction_request('90000000-0000-4000-8000-0000000000ff') ->> 'kind', 'not_found', 'una inexistente es not_found');
select is(api.decide_correction_request('clave-decision-0001', pg_temp.hash_decision('90000000-0000-4000-8000-000000000001', 'aprobada', 'Verificada.'),
  '90000000-0000-4000-8000-000000000001', 'aprobada', 'Verificada.') #>> '{request,status}', 'aprobada', 'aprueba una pendiente');
select is(api.decide_correction_request('clave-decision-0001', pg_temp.hash_decision('90000000-0000-4000-8000-000000000001', 'aprobada', 'Verificada.'),
  '90000000-0000-4000-8000-000000000001', 'aprobada', 'Verificada.') ->> 'kind', 'replayed', 'el replay devuelve lo guardado');
select is(api.decide_correction_request('clave-decision-0002', pg_temp.hash_decision('90000000-0000-4000-8000-000000000001', 'rechazada', 'Tarde.'),
  '90000000-0000-4000-8000-000000000001', 'rechazada', 'Tarde.') ->> 'kind', 'conflict', 'decidir una ya decidida es conflict');
select is(api.decide_correction_request('clave-decision-0003', repeat('0', 64), '90000000-0000-4000-8000-000000000007', 'rechazada', 'Motivo.') ->> 'kind',
  'invalid', 'un hash que no coincide es invalid');

-- Grants contextuales ---------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', false);
select is(api.create_contextual_access_grant('clave-grant-00001', pg_temp.hash_grant('90000000-0000-4000-8000-000000000001', 'review', 'name', 'Revisión.'),
  '90000000-0000-4000-8000-000000000001', 'review', array['name'], 'Revisión.') ->> 'kind', 'step_up_required', 'un grant exige step-up');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.create_contextual_access_grant('clave-grant-00001', pg_temp.hash_grant('90000000-0000-4000-8000-000000000001', 'review', 'declaredBloodType', 'Revisión.'),
  '90000000-0000-4000-8000-000000000001', 'review', array['declaredBloodType'], 'Revisión.') ->> 'kind', 'invalid', 'un campo que la solicitud no pidió es invalid');
select is(api.create_contextual_access_grant('clave-grant-00002', pg_temp.hash_grant('90000000-0000-4000-8000-000000000001', 'execute', 'name', 'Ejecución.'),
  '90000000-0000-4000-8000-000000000001', 'execute', array['name'], 'Ejecución.') ->> 'kind', 'invalid', 'ejecutar exige autorizar todos los campos pedidos');
select is(api.create_contextual_access_grant('clave-grant-00003', pg_temp.hash_grant('90000000-0000-4000-8000-000000000007', 'execute', 'name', 'Ejecución.'),
  '90000000-0000-4000-8000-000000000007', 'execute', array['name'], 'Ejecución.') ->> 'kind', 'conflict', 'ejecutar una no aprobada es conflict');
select is(api.create_contextual_access_grant('clave-grant-00004', pg_temp.hash_grant('90000000-0000-4000-8000-0000000000ff', 'review', 'name', 'Revisión.'),
  '90000000-0000-4000-8000-0000000000ff', 'review', array['name'], 'Revisión.') ->> 'kind', 'not_found', 'una solicitud inexistente es not_found');
select is(api.create_contextual_access_grant('clave-grant-00005', pg_temp.hash_grant('90000000-0000-4000-8000-000000000001', 'review', 'name', 'Revisión.'),
  '90000000-0000-4000-8000-000000000001', 'review', array['name'], 'Revisión.') #>> '{grant,action}', 'review', 'crea un grant de revisión sobre el nombre');

-- Lectura contextual ------------------------------------------------------------------------------------------
create temp table g as select grant_id from app.access_grants limit 1;
grant select on g to authenticated;
select is(api.get_contextual_donor_data('90000000-0000-4000-8000-000000000001', (select grant_id from g)) -> 'currentValues', '{"name": "Donante Uno"}'::jsonb,
  'con el grant solo se ve el campo autorizado (el correo no, aunque se pidió)');
select pg_temp.login('00000000-0000-4000-8000-0000000000b2', 'aal2', true);
select is(api.get_contextual_donor_data('90000000-0000-4000-8000-000000000001', (select grant_id from g)) ->> 'kind', 'forbidden', 'el grant de otro superadmin es forbidden');
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.get_contextual_donor_data('90000000-0000-4000-8000-000000000001', gen_random_uuid()) ->> 'kind', 'forbidden', 'un grant inexistente es forbidden');
reset role;
update app.access_grants set created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000b1', 'aal2', true);
select is(api.get_contextual_donor_data('90000000-0000-4000-8000-000000000001', (select grant_id from g)) ->> 'kind', 'gone', 'un grant vencido es gone');
reset role;
select is((select count(*)::int from app.audit_events where event = 'grant.usado'), 1, 'solo la lectura válida quedó auditada, sin valores');
select is((select count(*)::int from app.audit_events where reason like '%Donante%' or reason like '%Nombre Nuevo%'), 0, 'la auditoría no contiene valores personales');

select * from finish();
rollback;
