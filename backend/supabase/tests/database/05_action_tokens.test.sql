begin;
-- Aislamiento: la base puede estar sembrada. Todo se revierte con el rollback.
truncate app.action_tokens, app.admin_invitations, app.email_outbox, app.hospital_memberships, app.hospitals, app.user_accounts cascade;

select plan(100);

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-tok-super@example.test'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-tok-donante@example.test'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nuevo-admin@example.test'),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'otro-usuario@example.test'),
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'solo-auth@example.test'),
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-tok-admin@example.test'),
  ('00000000-0000-4000-8000-0000000000f7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-tok-worker@example.test');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000f1', 'superadmin', null),
  ('00000000-0000-4000-8000-0000000000f2', 'donante', 'Donante Sintético'),
  ('00000000-0000-4000-8000-0000000000f6', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000f7', 'api_technical', null);
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-0000000000f1', 'Hospital Tokens', 'Hospital Tokens S.A.', true),
  ('10000000-0000-4000-8000-0000000000f2', 'Hospital Sin Autorizar Tokens', 'Hospital Sin Autorizar S.A.', false);

create function pg_temp.login(p_uid text, p_aal text default 'aal1', p_step_up boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"%s","amr":[%s]}', p_uid, p_aal,
    case when p_step_up then format('{"method":"totp","timestamp":%s}', extract(epoch from now())::bigint) else '{"method":"password","timestamp":1}' end), true);
end $$;
grant execute on function pg_temp.login(text, text, boolean) to authenticated, anon;

create function pg_temp.invite_hash(p_email text, p_hospital uuid) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('email', p_email), jsonb_build_array('hospitalId', p_hospital::text)))
$$;
grant execute on function pg_temp.invite_hash(text, uuid) to authenticated, anon;
create function pg_temp.claim_hash(p_token text) returns text language sql as $$
  select app.fingerprint(jsonb_build_array(jsonb_build_array('tokenHash', p_token)))
$$;
grant execute on function pg_temp.claim_hash(text) to authenticated, anon;

-- Estructura y privilegios -------------------------------------------------------------------------------
select is((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in ('app.action_tokens'::regclass, 'app.admin_invitations'::regclass)), true,
  'las tablas de tokens e invitaciones tienen RLS habilitada y forzada');
select is((select count(*)::int from (values ('app.action_tokens'), ('app.admin_invitations')) t(name), (values ('select'), ('insert'), ('update'), ('delete')) p(priv),
  (values ('authenticated'), ('anon')) r(role) where has_table_privilege(r.role, t.name, p.priv)), 0, 'ni authenticated ni anon tocan las tablas de tokens');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and has_function_privilege('anon', p.oid, 'EXECUTE') and p.proname in
  ('get_admin_invitation_preview', 'request_password_recovery', 'consume_password_reset', 'invite_hospital_admin', 'link_admin_account', 'worker_revoke_sessions')),
  0, 'anon no ejecuta ninguna RPC de tokens: el backend es la única vía (el hash del token no lo elige quien llama)');
select is((select array_agg(r.role order by r.role) from (values ('anon'), ('authenticated'), ('service_role')) r(role)
  where has_function_privilege(r.role, 'api.worker_revoke_sessions(uuid)', 'EXECUTE')), array['service_role'], 'solo service_role revoca sesiones');
select is(has_function_privilege('authenticated', 'app.user_id_by_email(text, interval)', 'EXECUTE') or has_function_privilege('anon', 'app.user_id_by_email(text, interval)', 'EXECUTE'), false,
  'solo app_privileged busca un usuario por correo');

-- Invitar a un admin ----------------------------------------------------------------------------------------
set local role authenticated;
select is(api.invite_hospital_admin('clave-invitar-000001', repeat('0', 64), 'a@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'unauthenticated', 'sin sesión no se invita');
select pg_temp.login('00000000-0000-4000-8000-0000000000f2', 'aal2', true);
select is(api.invite_hospital_admin('clave-invitar-000001', repeat('0', 64), 'a@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'forbidden', 'un donante no invita');
select pg_temp.login('00000000-0000-4000-8000-0000000000f6', 'aal2', true);
select is(api.invite_hospital_admin('clave-invitar-000001', repeat('0', 64), 'a@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'forbidden', 'un admin hospitalario no invita');
select pg_temp.login('00000000-0000-4000-8000-0000000000f1', 'aal1', true);
select is(api.invite_hospital_admin('clave-invitar-000001', repeat('0', 64), 'a@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'mfa_required', 'invitar exige AAL2');
select pg_temp.login('00000000-0000-4000-8000-0000000000f1', 'aal2', false);
select is(api.invite_hospital_admin('clave-invitar-000001', repeat('0', 64), 'a@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'step_up_required', 'invitar exige step-up');
select pg_temp.login('00000000-0000-4000-8000-0000000000f1', 'aal2', true);
select is(api.invite_hospital_admin('clave-invitar-000001', repeat('0', 64), 'a@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'invalid', 'un hash que no corresponde es invalid');
select is(api.invite_hospital_admin('clave-invitar-000001', pg_temp.invite_hash('A@Example.test', '10000000-0000-4000-8000-0000000000f1'), 'A@Example.test', '10000000-0000-4000-8000-0000000000f1', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'invalid', 'el correo debe llegar normalizado (minúsculas)');
select is(api.invite_hospital_admin('clave-invitar-000001', pg_temp.invite_hash('a@example.test', '10000000-0000-4000-8000-0000000000f1'), 'a@example.test', '10000000-0000-4000-8000-0000000000f1', 'no-hex', gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'invalid', 'un hash de token que no es hexadecimal de 64 es invalid');
select is(api.invite_hospital_admin('clave-invitar-000001', pg_temp.invite_hash('a@example.test', '10000000-0000-4000-8000-0000000000f1'), 'a@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('a', 64), gen_random_uuid(), 'corto') ->> 'kind',
  'invalid', 'un payload sellado demasiado corto es invalid');
select is(api.invite_hospital_admin('corta', pg_temp.invite_hash('a@example.test', '10000000-0000-4000-8000-0000000000f1'), 'a@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'invalid', 'una clave de idempotencia corta es invalid');
select is(api.invite_hospital_admin('clave-invitar-000001', pg_temp.invite_hash('a@example.test', '10000000-0000-4000-8000-0000000000aa'), 'a@example.test', '10000000-0000-4000-8000-0000000000aa', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'invalid', 'un hospital inexistente es invalid');
select is(api.invite_hospital_admin('clave-invitar-000001', pg_temp.invite_hash('a@example.test', '10000000-0000-4000-8000-0000000000f2'), 'a@example.test', '10000000-0000-4000-8000-0000000000f2', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'conflict', 'un hospital sin autorizar no recibe admins');
select is(api.invite_hospital_admin('clave-invitar-000001', pg_temp.invite_hash('pgtap-tok-donante@example.test', '10000000-0000-4000-8000-0000000000f1'), 'pgtap-tok-donante@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('a', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'conflict', 'quien ya tiene cuenta (donante) no se invita como admin');

create temp table invited as select api.invite_hospital_admin('clave-invitar-000002', pg_temp.invite_hash('nuevo-admin@example.test', '10000000-0000-4000-8000-0000000000f1'),
  'nuevo-admin@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('1', 64), '70000000-0000-4000-8000-000000000001', 'v1.k1.cifrado-sintetico-de-prueba.tag.ct') as r;
grant select on invited to authenticated;
select is((select r from invited), '{"kind": "ok"}'::jsonb, 'una invitación válida responde ok');
reset role;
select is((select count(*)::int from app.admin_invitations where email = 'nuevo-admin@example.test' and hospital_id = '10000000-0000-4000-8000-0000000000f1'), 1, 'se crea la invitación con el correo normalizado');
select is((select kind || '|' || (expires_at between now() + interval '71 hours' and now() + interval '73 hours')::text from app.action_tokens where token_hash = repeat('1', 64)),
  'invitacion_admin|true', 'el token guardado es solo el hash y vale 72 h');
select is((select kind || '|' || status || '|' || (sealed_payload is not null)::text from app.email_outbox where outbox_id = '70000000-0000-4000-8000-000000000001'),
  'invitacion_admin|pendiente|true', 'se encola el correo cifrado en la misma transacción');
select is((select count(*)::int from app.audit_events where event = 'admin.invitado' and actor_id = '00000000-0000-4000-8000-0000000000f1' and reason is null), 1,
  'se audita la invitación sin texto libre');
select is((select count(*)::int from app.action_tokens where token_hash <> lower(token_hash) or data::text ~* 'nuevo-admin'), 0, 'el token y sus datos no llevan el correo en claro');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f1', 'aal2', true);
select is(api.invite_hospital_admin('clave-invitar-000002', pg_temp.invite_hash('nuevo-admin@example.test', '10000000-0000-4000-8000-0000000000f1'),
  'nuevo-admin@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('1', 64), '70000000-0000-4000-8000-000000000001', 'v1.k1.cifrado-sintetico-de-prueba.tag.ct') ->> 'kind',
  'replayed', 'la misma clave e intención repite el resultado');
select is(api.invite_hospital_admin('clave-invitar-000002', pg_temp.invite_hash('otro@example.test', '10000000-0000-4000-8000-0000000000f1'),
  'otro@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('2', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind', 'payload_conflict', 'la misma clave con otro correo es payload_conflict');
-- Reinvitar anula el token anterior
select is(api.invite_hospital_admin('clave-invitar-000003', pg_temp.invite_hash('nuevo-admin@example.test', '10000000-0000-4000-8000-0000000000f1'),
  'nuevo-admin@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('2', 64), '70000000-0000-4000-8000-000000000002', 'v1.k1.cifrado-sintetico-de-prueba.tag.ct') ->> 'kind', 'ok', 'reinvitar al mismo correo es ok');
reset role;
select is((select invalidated_at is not null from app.action_tokens where token_hash = repeat('1', 64)), true, 'la reinvitación anula el token anterior');
select is((select invalidated_at is null from app.action_tokens where token_hash = repeat('2', 64)), true, 'el token nuevo queda vigente');

-- Vista previa (solo la identidad técnica del backend) ----------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select api.get_admin_invitation_preview(repeat('2', 64))$$, '42501', null, 'anon no consulta la vista previa por RPC');
set local role authenticated;
select is(api.get_admin_invitation_preview(repeat('2', 64)) ->> 'kind', 'unauthenticated', 'sin sub la vista previa es unauthenticated');
select pg_temp.login('00000000-0000-4000-8000-0000000000f2');
select is(api.get_admin_invitation_preview(repeat('2', 64)) ->> 'kind', 'forbidden', 'un donante no consulta la vista previa por RPC');
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
select is((select array_agg(k order by k) from jsonb_object_keys(api.get_admin_invitation_preview(repeat('2', 64))) k), array['email', 'expiresAt', 'hospitalName', 'kind', 'orphanUserId'],
  'la sesión técnica recibe hospital, vencimiento, correo (solo para la aplicación) y el id de un usuario huérfano');
select is(api.get_admin_invitation_preview(repeat('2', 64)) ->> 'hospitalName', 'Hospital Tokens', 'y es el hospital de la invitación');
reset role;
update auth.users set created_at = now() where id = '00000000-0000-4000-8000-0000000000f3';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
select is(api.get_admin_invitation_preview(repeat('2', 64)) -> 'orphanUserId', 'null'::jsonb, 'un usuario de Auth recién creado (menos de un minuto) no se trata como huérfano: puede ser el registro en curso del invitado');
reset role;
update auth.users set created_at = now() - interval '5 minutes' where id = '00000000-0000-4000-8000-0000000000f3';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
select is(api.get_admin_invitation_preview(repeat('2', 64)) ->> 'orphanUserId', '00000000-0000-4000-8000-0000000000f3', 'un usuario de Auth sin cuenta de aplicación y de más de un minuto que ocupa el correo se informa como huérfano');
select is(api.get_admin_invitation_preview(repeat('9', 64)) ->> 'kind', 'not_found', 'un token desconocido es not_found');
select is(api.get_admin_invitation_preview('no-hex') ->> 'kind', 'invalid', 'un token con formato inválido es invalid');
select is(api.get_admin_invitation_preview(repeat('1', 64)) ->> 'kind', 'gone', 'un token invalidado es gone');
reset role;
update app.action_tokens set expires_at = now() - interval '1 second', created_at = now() - interval '1 day' where token_hash = repeat('2', 64);
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
select is(api.get_admin_invitation_preview(repeat('2', 64)) ->> 'kind', 'gone', 'un token vencido es gone');
reset role;
update app.action_tokens set expires_at = now() + interval '72 hours', created_at = now() where token_hash = repeat('2', 64);

-- Vincular la cuenta ---------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select api.link_admin_account(repeat('2', 64), 'clave-claim-0000001', '63dbe1dfb907adb2d13d6e04a2f68da6a4a042f6480d9f725e5f28c882fcbd7b')$$, '42501', null, 'anon no ejecuta link_admin_account: hace falta la sesión del propio invitado');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f4');
select is(api.link_admin_account(repeat('2', 64), 'clave-claim-0000001', '63dbe1dfb907adb2d13d6e04a2f68da6a4a042f6480d9f725e5f28c882fcbd7b') ->> 'kind', 'forbidden', 'otro usuario de Auth no reclama una invitación ajena');
select is(api.link_admin_account(repeat('2', 64), 'clave-claim-0000001', repeat('0', 64)) ->> 'kind', 'invalid', 'un hash que no corresponde es invalid');
select is(api.link_admin_account(repeat('8', 64), 'clave-claim-0000001', '3be7161e130c6ac10153f26f09f157f9ee70c8a0341c471ec33bdcaa6a50a991') ->> 'kind', 'not_found', 'un token desconocido es not_found');
select is(api.link_admin_account(repeat('1', 64), 'clave-claim-0000001', '57aefb7b10fa0fa62186ffc18ca7829dfc630cbd3c855907c766f77d867bc545') ->> 'kind', 'gone', 'un token anulado es gone');
reset role;
select is((select count(*)::int from app.user_accounts where user_id = '00000000-0000-4000-8000-0000000000f4'), 0, 'los intentos fallidos no crean cuenta');
update app.hospitals set is_authorized = false where hospital_id = '10000000-0000-4000-8000-0000000000f1';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f3');
select is(api.link_admin_account(repeat('2', 64), 'clave-claim-0000001', '63dbe1dfb907adb2d13d6e04a2f68da6a4a042f6480d9f725e5f28c882fcbd7b') ->> 'kind', 'conflict', 'si el hospital dejó de estar autorizado, vincular es conflict');
reset role;
update app.hospitals set is_authorized = true where hospital_id = '10000000-0000-4000-8000-0000000000f1';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f3');
create temp table linked as select api.link_admin_account(repeat('2', 64), 'clave-claim-0000002', '63dbe1dfb907adb2d13d6e04a2f68da6a4a042f6480d9f725e5f28c882fcbd7b') as r;
grant select on linked to authenticated;
select is((select r ->> 'kind' from linked), 'created', 'el invitado vincula su cuenta');
select is((select r ->> 'hospitalName' from linked), 'Hospital Tokens', 'devuelve el hospital');
reset role;
select is((select role::text from app.user_accounts where user_id = '00000000-0000-4000-8000-0000000000f3'), 'admin_hospitalario', 'se crea la cuenta de aplicación como admin hospitalario');
select is((select status || '|' || hospital_id::text || '|' || email_hint from app.hospital_memberships where user_id = '00000000-0000-4000-8000-0000000000f3'),
  'activa|10000000-0000-4000-8000-0000000000f1|n***@example.test', 'se crea la membresía activa con el correo enmascarado');
select is((select consumed_at is not null from app.action_tokens where token_hash = repeat('2', 64)), true, 'el token queda consumido');
select is((select membership_id is not null from app.admin_invitations where email = 'nuevo-admin@example.test' and invitation_id = (select subject_id from app.action_tokens where token_hash = repeat('2', 64))), true,
  'la invitación queda ligada a su membresía');
select is((select count(*)::int from app.audit_events where event = 'admin.alta' and actor_id = '00000000-0000-4000-8000-0000000000f3'), 1, 'se audita el alta');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f3');
select is(api.link_admin_account(repeat('2', 64), 'clave-claim-0000002', '63dbe1dfb907adb2d13d6e04a2f68da6a4a042f6480d9f725e5f28c882fcbd7b') ->> 'kind', 'replayed', 'la misma clave repite el resultado');
select is(api.link_admin_account(repeat('2', 64), 'clave-claim-0000003', '63dbe1dfb907adb2d13d6e04a2f68da6a4a042f6480d9f725e5f28c882fcbd7b') ->> 'kind', 'gone', 'un segundo consumo con otra clave es gone');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
select is(api.get_admin_invitation_preview(repeat('2', 64)) ->> 'kind', 'gone', 'la vista previa de un token consumido es gone');
reset role;

-- Recuperación de contraseña (solo la identidad técnica) -----------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select api.request_password_recovery('x@example.test', repeat('3', 64), gen_random_uuid(), repeat('s', 40), 'email:' || repeat('a', 64), 'clave-recup-0000001', repeat('b', 64))$$,
  '42501', null, 'anon no puede pedir una recuperación apuntando a un hash elegido por él');
select throws_ok($$select api.consume_password_reset(repeat('3', 64))$$, '42501', null, 'anon no consume tokens de recuperación');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f2');
select is(api.request_password_recovery('pgtap-tok-donante@example.test', repeat('3', 64), gen_random_uuid(), repeat('s', 40), 'email:' || repeat('a', 64), 'clave-recup-0000001', repeat('b', 64)) ->> 'kind',
  'forbidden', 'un usuario autenticado cualquiera (no técnico) tampoco puede pedir recuperaciones');
select is(api.consume_password_reset(repeat('3', 64)) ->> 'kind', 'forbidden', 'ni consumir tokens de recuperación');
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
create temp table rec_existing as select api.request_password_recovery('PGTAP-TOK-DONANTE@example.test', repeat('3', 64), '70000000-0000-4000-8000-000000000003', repeat('s', 40),
  'email:' || repeat('a', 64), 'clave-recup-0000001', repeat('b', 64)) as r;
create temp table rec_missing as select api.request_password_recovery('no-existe@example.test', repeat('4', 64), '70000000-0000-4000-8000-000000000004', repeat('s', 40),
  'email:' || repeat('c', 64), 'clave-recup-0000002', repeat('d', 64)) as r;
create temp table rec_authonly as select api.request_password_recovery('solo-auth@example.test', repeat('5', 64), '70000000-0000-4000-8000-000000000005', repeat('s', 40),
  'email:' || repeat('e', 64), 'clave-recup-0000003', repeat('f', 64)) as r;
create temp table rec_worker as select api.request_password_recovery('pgtap-tok-worker@example.test', repeat('6', 64), '70000000-0000-4000-8000-000000000006', repeat('s', 40),
  'email:' || repeat('1', 64), 'clave-recup-0000004', repeat('2', 64)) as r;
grant select on rec_existing, rec_missing, rec_authonly, rec_worker to authenticated;
select is((select r from rec_existing), '{"kind": "ok"}'::jsonb, 'el correo existente responde ok');
select is((select r from rec_missing), (select r from rec_existing), 'la respuesta para un correo inexistente es idéntica');
select is((select r from rec_authonly), (select r from rec_existing), 'y también para un usuario de Auth sin cuenta de aplicación');
select is((select r from rec_worker), (select r from rec_existing), 'y para la cuenta técnica (que no se recupera por correo)');
select is(api.request_password_recovery('no-es-correo', repeat('7', 64), gen_random_uuid(), repeat('s', 40), 'email:' || repeat('a', 64), 'clave-recup-0000005', repeat('b', 64)) ->> 'kind', 'invalid', 'un correo con formato inválido es invalid');
select is(api.request_password_recovery('a@example.test', 'no-hex', gen_random_uuid(), repeat('s', 40), 'email:' || repeat('a', 64), 'clave-recup-0000005', repeat('b', 64)) ->> 'kind', 'invalid', 'un token con formato inválido es invalid');
select is(api.request_password_recovery('a@example.test', repeat('7', 64), gen_random_uuid(), repeat('s', 40), 'no-es-actor', 'clave-recup-0000005', repeat('b', 64)) ->> 'kind', 'invalid', 'un actor de idempotencia con formato inválido es invalid');
reset role;
select is((select count(*)::int from app.action_tokens where kind = 'recuperacion' and token_hash = repeat('3', 64) and subject_id = '00000000-0000-4000-8000-0000000000f2'
  and expires_at between now() + interval '59 minutes' and now() + interval '61 minutes'), 1, 'solo para la cuenta existente se crea un token de 1 h');
select is((select count(*)::int from app.action_tokens where token_hash in (repeat('4', 64), repeat('5', 64), repeat('6', 64))), 0, 'para correos inexistentes, sin cuenta o de la cuenta técnica no se crea token');
select is((select count(*)::int from app.email_outbox where outbox_id in ('70000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000006')), 0, 'ni se encola correo');
select is((select kind || '|' || (recipient_user_id is null)::text from app.email_outbox where outbox_id = '70000000-0000-4000-8000-000000000003'), 'recuperacion|true',
  'el correo de recuperación va sin recipient_user_id (el destinatario viaja sellado)');
-- Idempotencia propia: un reintento no repite el token ni el correo; otra intención con la misma clave es conflicto.
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
select is(api.request_password_recovery('pgtap-tok-donante@example.test', repeat('8', 64), '70000000-0000-4000-8000-000000000008', repeat('s', 40),
  'email:' || repeat('a', 64), 'clave-recup-0000001', repeat('b', 64)), '{"kind": "ok"}'::jsonb, 'el reintento con la misma clave responde igual');
select is(api.request_password_recovery('otro@example.test', repeat('9', 64), '70000000-0000-4000-8000-000000000009', repeat('s', 40),
  'email:' || repeat('a', 64), 'clave-recup-0000001', repeat('c', 64)) ->> 'kind', 'payload_conflict', 'la misma clave con otra intención es payload_conflict');
reset role;
select is((select count(*)::int from app.action_tokens where kind = 'recuperacion' and subject_id = '00000000-0000-4000-8000-0000000000f2' and invalidated_at is null), 1,
  'el reintento no creó otro token ni anuló el vigente');
select is((select count(*)::int from app.email_outbox where outbox_id = '70000000-0000-4000-8000-000000000008'), 0, 'ni encoló un segundo correo');
-- Una solicitud nueva (otra clave) anula el token anterior
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
select is(api.request_password_recovery('pgtap-tok-donante@example.test', repeat('a', 64), '70000000-0000-4000-8000-00000000000a', repeat('s', 40),
  'email:' || repeat('a', 64), 'clave-recup-0000009', repeat('b', 64)) ->> 'kind', 'ok', 'una solicitud nueva con otra clave también es ok');
reset role;
select is((select invalidated_at is not null from app.action_tokens where token_hash = repeat('3', 64)), true, 'la solicitud nueva anula el token anterior');

-- Consumir el reset ---------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
select is(api.consume_password_reset(repeat('3', 64)) ->> 'kind', 'gone', 'un token de recuperación anulado es gone');
select is(api.consume_password_reset(repeat('9', 64)) ->> 'kind', 'not_found', 'un token desconocido es not_found');
select is(api.consume_password_reset('no-hex') ->> 'kind', 'invalid', 'un token con formato inválido es invalid');
create temp table consumed as select api.consume_password_reset(repeat('a', 64)) as r;
grant select on consumed to authenticated;
select is((select r ->> 'kind' || '|' || (r ->> 'userId') || '|' || (r ->> 'generation') from consumed), 'ok|00000000-0000-4000-8000-0000000000f2|1', 'consumir devuelve el usuario al que cambiar la contraseña y la generación de la barrera');
select is(api.consume_password_reset(repeat('a', 64)) ->> 'kind', 'gone', 'el segundo consumo es gone');
reset role;
update app.action_tokens set expires_at = now() - interval '1 second', created_at = now() - interval '2 hours', consumed_at = null, invalidated_at = null where token_hash = repeat('a', 64);
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
select is(api.consume_password_reset(repeat('a', 64)) ->> 'kind', 'gone', 'un token de recuperación vencido es gone');
select is(api.consume_password_reset(repeat('2', 64)) ->> 'kind', 'not_found', 'un token de otro tipo no sirve para recuperar la contraseña');
reset role;
select is((select count(*)::int from app.audit_events where event = 'recuperacion.completada' and actor_kind = 'sistema' and resource_id = '00000000-0000-4000-8000-0000000000f2'), 1, 'se audita la recuperación completada');

-- Tope por cuenta: 3 enlaces de recuperación por hora aunque se salten los límites del backend --------------------
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f7');
select is(api.request_password_recovery('pgtap-tok-donante@example.test', repeat('d', 64), '70000000-0000-4000-8000-00000000000d', repeat('s', 40),
  'email:' || repeat('a', 64), 'clave-recup-0000010', repeat('b', 64)) ->> 'kind', 'ok', 'segunda solicitud de la hora: ok');
select is(api.request_password_recovery('pgtap-tok-donante@example.test', repeat('e', 64), '70000000-0000-4000-8000-00000000000e', repeat('s', 40),
  'email:' || repeat('a', 64), 'clave-recup-0000011', repeat('b', 64)) ->> 'kind', 'ok', 'tercera solicitud de la hora: ok');
select is(api.request_password_recovery('pgtap-tok-donante@example.test', repeat('f', 64), '70000000-0000-4000-8000-00000000000f', repeat('s', 40),
  'email:' || repeat('a', 64), 'clave-recup-0000012', repeat('b', 64)) ->> 'kind', 'ok', 'la cuarta responde igual (no revela el tope)');
reset role;
select is((select count(*)::int from app.action_tokens where kind = 'recuperacion' and subject_id = '00000000-0000-4000-8000-0000000000f2' and created_at > now() - interval '1 hour'), 3,
  'pero solo hay tres tokens de recuperación por hora para la cuenta');
select is((select count(*)::int from app.action_tokens where token_hash = repeat('f', 64)) + (select count(*)::int from app.email_outbox where outbox_id = '70000000-0000-4000-8000-00000000000f'), 0,
  'la solicitud sobre el tope no crea token ni encola correo');

-- Borrado atómico de usuarios de Auth inertes --------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000000f8', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inerte-viejo@example.test', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inerte-joven@example.test', now());
select is(array(select r.role from (values ('anon'), ('authenticated'), ('service_role')) r(role)
  where has_function_privilege(r.role, 'api.worker_delete_inert_user(uuid, text, interval)', 'EXECUTE')), array['service_role'], 'solo service_role borra usuarios inertes');
select is(api.worker_delete_inert_user('00000000-0000-4000-8000-0000000000f8', 'otro@example.test', interval '60 seconds'), false, 'con un correo que no coincide no se borra');
select is(api.worker_delete_inert_user('00000000-0000-4000-8000-0000000000f2', 'pgtap-tok-donante@example.test', interval '0 seconds'), false, 'un usuario con cuenta de aplicación nunca se borra');
select is(api.worker_delete_inert_user('00000000-0000-4000-8000-0000000000f9', 'inerte-joven@example.test', interval '60 seconds'), false, 'un usuario más joven que la edad mínima (registro en curso) no se borra');
select is(api.worker_delete_inert_user('00000000-0000-4000-8000-0000000000f8', 'INERTE-VIEJO@example.test', interval '60 seconds'), true, 'un usuario inerte, antiguo y con el correo correcto se borra');
select is((select count(*)::int from auth.users where id in ('00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f9')), 2,
  'y solo ese: los otros dos siguen existiendo');

-- Invitar: replay tras desautorizar el hospital y tope por superadmin ------------------------------------------
update app.hospitals set is_authorized = false where hospital_id = '10000000-0000-4000-8000-0000000000f1';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f1', 'aal2', true);
select is(api.invite_hospital_admin('clave-invitar-000002', pg_temp.invite_hash('nuevo-admin@example.test', '10000000-0000-4000-8000-0000000000f1'),
  'nuevo-admin@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('1', 64), '70000000-0000-4000-8000-000000000001', 'v1.k1.cifrado-sintetico-de-prueba.tag.ct') ->> 'kind',
  'replayed', 'el replay de una invitación previa se devuelve aunque el hospital ya no esté autorizado (peek antes del estado)');
reset role;
update app.hospitals set is_authorized = true where hospital_id = '10000000-0000-4000-8000-0000000000f1';
insert into app.admin_invitations (hospital_id, email, created_by)
  select '10000000-0000-4000-8000-0000000000f1', 'cupo-' || g || '@example.test', '00000000-0000-4000-8000-0000000000f1' from generate_series(1, 20) g;
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000f1', 'aal2', true);
select is(api.invite_hospital_admin('clave-invitar-000099', pg_temp.invite_hash('cupo-extra@example.test', '10000000-0000-4000-8000-0000000000f1'),
  'cupo-extra@example.test', '10000000-0000-4000-8000-0000000000f1', repeat('b', 64), gen_random_uuid(), repeat('s', 40)) ->> 'kind',
  'rate_limited', 'con 20 invitaciones en la última hora, una nueva es rate_limited (sin dejar clave en curso)');
reset role;
select is((select count(*)::int from app.idempotency_records where idem_key = 'clave-invitar-000099'), 0, 'rate_limited no deja registro de idempotencia');

select * from finish();
rollback;
