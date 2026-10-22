begin;
-- Aislamiento: la base puede estar sembrada. Todo se revierte con el rollback.
truncate app.email_outbox, app.email_webhook_events, app.user_accounts cascade;

select plan(80);

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-mail-worker@example.test'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-mail-admin@example.test'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-mail-donante@example.test'),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-mail-api@example.test');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000e1', 'worker', null),
  ('00000000-0000-4000-8000-0000000000e2', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-0000000000e3', 'donante', 'Donante Sintético'),
  ('00000000-0000-4000-8000-0000000000e4', 'api_technical', null);

create function pg_temp.login(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1}]}', p_uid), true);
end $$;
grant execute on function pg_temp.login(text) to authenticated, anon;

-- Estructura y privilegios -------------------------------------------------------------------------------
select is((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('app.email_outbox'::regclass, 'app.email_attempts'::regclass, 'app.email_webhook_events'::regclass)), true,
  'las tres tablas tienen RLS habilitada y forzada');
select is((select count(*)::int from (values ('app.email_outbox'), ('app.email_attempts'), ('app.email_webhook_events')) t(name),
  (values ('select'), ('insert'), ('update'), ('delete')) p(priv), (values ('authenticated'), ('anon')) r(role)
  where has_table_privilege(r.role, t.name, p.priv)), 0, 'ni authenticated ni anon tienen privilegios sobre las tablas de correo');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.prosecdef and p.proname like any (array['worker\_%', 'ingest\_%']) and p.proname not in ('worker_revoke_sessions', 'worker_delete_inert_user')),
  array['ingest_email_event', 'worker_claim_due_outbox', 'worker_expire_outbox', 'worker_purge_auth_accounts', 'worker_purge_expired', 'worker_record_attempt'], 'las funciones del worker son SECURITY DEFINER');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.prosecdef and pg_get_userbyid(p.proowner) <> 'app_privileged' and p.proname not in ('worker_revoke_sessions', 'worker_delete_inert_user')), 0,
  'toda DEFINER de api pertenece a app_privileged salvo la de revocación de sesiones (ADR-006)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.prosecdef and not ('search_path=""' = any (p.proconfig) or 'search_path=' = any (p.proconfig))), 0, 'toda DEFINER fija search_path vacío');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api' and p.proname in ('worker_claim_due_outbox', 'worker_record_attempt', 'worker_expire_outbox', 'ingest_email_event')
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('public', p.oid, 'EXECUTE'))), 0, 'anon y PUBLIC no ejecutan las RPC del worker');
select is(has_function_privilege('authenticated', 'app.enqueue_email(uuid, text, uuid, uuid, text, timestamptz)', 'EXECUTE'), false,
  'authenticated no encola correos directamente');
select is(has_function_privilege('authenticated', 'app.user_email(uuid)', 'EXECUTE') or has_function_privilege('anon', 'app.user_email(uuid)', 'EXECUTE'), false,
  'solo app_privileged lee el correo de un destinatario');
select is(has_function_privilege('app_privileged', 'app.user_email(uuid)', 'EXECUTE'), true, 'app_privileged sí lo ejecuta');

-- Avance monótono de la entrega (mismo orden que advance en TypeScript) ----------------------------------
select is((select array_agg(app.advance_delivery(c, e) order by c, e) from (values ('pendiente'), ('enviada'), ('entregada'), ('fallida')) cs(c),
  (values ('enviada'), ('entregada'), ('fallida')) es(e)),
  array['entregada', 'entregada', 'entregada', 'entregada', 'enviada', 'fallida', 'fallida', 'fallida', 'fallida', 'entregada', 'enviada', 'fallida']::text[],
  'advance_delivery reproduce la tabla de avance sin retroceder');

-- Autorización -------------------------------------------------------------------------------------------
set local role authenticated;
select is(api.worker_claim_due_outbox(5) ->> 'kind', 'unauthenticated', 'sin sesión el claim es unauthenticated');
select pg_temp.login('00000000-0000-4000-8000-0000000000e2');
select is(api.worker_claim_due_outbox(5) ->> 'kind', 'forbidden', 'un admin hospitalario no reclama el outbox');
select is(api.worker_record_attempt(gen_random_uuid(), 1, 'ok', 200, 'x', null) ->> 'kind', 'forbidden', 'un admin no registra intentos');
select is(api.worker_expire_outbox() ->> 'kind', 'forbidden', 'un admin no vence el outbox');
select is(api.ingest_email_event('evt-1', 'prov-1', 'email.sent', now()) ->> 'kind', 'forbidden', 'un admin no ingiere eventos');
select pg_temp.login('00000000-0000-4000-8000-0000000000e3');
select is(api.worker_claim_due_outbox(5) ->> 'kind', 'forbidden', 'un donante no reclama el outbox');
select is(api.ingest_email_event('evt-1', 'prov-1', 'email.sent', now()) ->> 'kind', 'forbidden', 'un donante no ingiere eventos');
-- F4 M-2: el worker opera el outbox y la API ingiere eventos; ninguna identidad hace lo de la otra.
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is(api.ingest_email_event('evt-1', 'prov-1', 'email.sent', now()) ->> 'kind', 'forbidden', 'el worker no ingiere eventos del proveedor');
select pg_temp.login('00000000-0000-4000-8000-0000000000e4');
select is(api.worker_claim_due_outbox(5) ->> 'kind', 'forbidden', 'la identidad técnica de la API no reclama el outbox');
select is(api.worker_record_attempt(gen_random_uuid(), 1, 'ok', 200, 'x', null) ->> 'kind', 'forbidden', 'ni registra intentos');
select is(api.worker_expire_outbox() ->> 'kind', 'forbidden', 'ni vence el outbox');

-- Reclamo -------------------------------------------------------------------------------------------------
reset role;
insert into app.email_outbox (outbox_id, kind, recipient_user_id, idempotency_key, sealed_payload, next_attempt_at, not_after) values
  ('60000000-0000-4000-8000-000000000001', 'invitacion', '00000000-0000-4000-8000-0000000000e3', 'outbox-60000000-0000-4000-8000-000000000001', 'v1.k1.a.b.c', now() - interval '1 minute', now() + interval '1 day'),
  ('60000000-0000-4000-8000-000000000002', 'verificacion_email', null, 'outbox-60000000-0000-4000-8000-000000000002', 'v1.k1.a.b.c', now() - interval '1 minute', now() + interval '1 day'),
  ('60000000-0000-4000-8000-000000000003', 'recuperacion', null, 'outbox-60000000-0000-4000-8000-000000000003', 'v1.k1.a.b.c', now() + interval '1 hour', now() + interval '2 days'),
  ('60000000-0000-4000-8000-000000000004', 'cambio_email', null, 'outbox-60000000-0000-4000-8000-000000000004', 'v1.k1.a.b.c', now() - interval '1 minute', now() + interval '1 day');
insert into app.email_outbox (outbox_id, kind, idempotency_key, sealed_payload, next_attempt_at, not_after, created_at) values
  ('60000000-0000-4000-8000-000000000005', 'alta_asistida', 'outbox-60000000-0000-4000-8000-000000000005', 'v1.k1.a.b.c', now() - interval '3 hours', now() - interval '1 hour', now() - interval '4 hours');
select throws_ok($$insert into app.email_outbox (kind, idempotency_key, sealed_payload, status, finalized_at, not_after)
  values ('invitacion', 'outbox-final-con-payload-0001', 'v1.k1.a.b.c', 'enviado', now(), now() + interval '1 day')$$,
  '23514', null, 'un estado final con payload cifrado viola la restricción (el payload se destruye)');
select throws_ok($$insert into app.email_outbox (kind, idempotency_key, sealed_payload, status, not_after)
  values ('invitacion', 'outbox-activo-sin-payload-001', null, 'pendiente', now() + interval '1 day')$$,
  '23514', null, 'un mensaje activo sin payload viola la restricción');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is(api.worker_claim_due_outbox(0) ->> 'kind', 'invalid', 'limit 0 es invalid');
select is(api.worker_claim_due_outbox(51) ->> 'kind', 'invalid', 'limit 51 es invalid');
create temp table claim1 as select api.worker_claim_due_outbox(2) as r;
grant select on claim1 to authenticated;
select is((select jsonb_array_length(r -> 'items') from claim1), 2, 'el claim respeta el límite');
select is((select array_agg(i ->> 'outboxId' order by i ->> 'outboxId') from claim1, jsonb_array_elements(r -> 'items') i),
  array['60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002'], 'reclama las más antiguas debidas');
select is((select i ->> 'recipient' from claim1, jsonb_array_elements(r -> 'items') i where i ->> 'outboxId' = '60000000-0000-4000-8000-000000000001'),
  'pgtap-mail-donante@example.test', 'con recipient_user_id el destinatario sale de auth.users');
select is((select i -> 'recipient' from claim1, jsonb_array_elements(r -> 'items') i where i ->> 'outboxId' = '60000000-0000-4000-8000-000000000002'),
  'null'::jsonb, 'sin recipient_user_id el destinatario va dentro del payload (recipient nulo)');
select is((select (i ->> 'attemptNo')::int from claim1, jsonb_array_elements(r -> 'items') i limit 1), 1, 'la primera llamada es la 1');
select is((select array_agg(k order by k) from claim1, jsonb_object_keys((select r -> 'items' -> 0 from claim1)) k),
  array['attemptNo', 'idempotencyKey', 'kind', 'notAfter', 'outboxId', 'recipient', 'sealedPayload'], 'cada elemento lleva exactamente los siete campos');
reset role;
select is((select count(*)::int from app.email_outbox where status = 'en_curso' and lease_until > now() + interval '115 seconds' and attempt_count = 1), 2,
  'las reclamadas quedan en curso con un lease de 120 s');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is((select count(*)::int from jsonb_array_elements(api.worker_claim_due_outbox(10) -> 'items') i
  where i ->> 'outboxId' in ('60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002')), 0, 'un segundo claim no repite filas con lease vigente');
reset role;
select is((select count(*)::int from app.email_outbox where outbox_id in ('60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000005') and status = 'en_curso'), 0,
  'no se reclama lo programado a futuro ni lo pasado de not_after');

-- Lease vencido: se recupera y cuenta otra llamada ----------------------------------------------------------
reset role;
update app.email_outbox set lease_until = now() - interval '1 second' where outbox_id = '60000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is((select (i ->> 'attemptNo')::int from jsonb_array_elements(api.worker_claim_due_outbox(10) -> 'items') i where i ->> 'outboxId' = '60000000-0000-4000-8000-000000000002'), 2,
  'un lease vencido se recupera como segunda llamada');

-- Registro de intentos -----------------------------------------------------------------------------------
select is(api.worker_record_attempt('60000000-0000-4000-8000-000000000001', 1, 'inventado', null, null, null) ->> 'kind', 'invalid', 'un resultado desconocido es invalid');
select is(api.worker_record_attempt(gen_random_uuid(), 1, 'ok', 200, 'x', null) ->> 'kind', 'not_found', 'un outbox inexistente es not_found');
select is(api.worker_record_attempt('60000000-0000-4000-8000-000000000001', 2, 'ok', 200, 'x', null) ->> 'kind', 'conflict', 'un intento obsoleto (número distinto) es conflict');
select is(api.worker_record_attempt('60000000-0000-4000-8000-000000000001', 1, 'ok', 200, 'prov-001', null) ->> 'status', 'enviado', 'ok → enviado');
reset role;
select is((select sealed_payload is null and finalized_at is not null and lease_until is null from app.email_outbox where outbox_id = '60000000-0000-4000-8000-000000000001'), true,
  'al enviar se destruye el payload cifrado y se fija finalized_at');
select is((select provider_message_id || '|' || delivery_state from app.email_outbox where outbox_id = '60000000-0000-4000-8000-000000000001'), 'prov-001|enviada',
  'se guarda el id del proveedor y la entrega pasa a enviada');
select is((select outcome || '|' || http_status from app.email_attempts where outbox_id = '60000000-0000-4000-8000-000000000001' and attempt_no = 1), 'ok|200', 'el intento queda registrado');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is(api.worker_record_attempt('60000000-0000-4000-8000-000000000001', 1, 'ok', 200, 'prov-001', null) ->> 'kind', 'conflict', 'registrar dos veces el mismo intento es conflict');

-- transitorio: reprograma con la hora del worker mientras haya llamadas y plazo
select is(api.worker_record_attempt('60000000-0000-4000-8000-000000000002', 2, 'transitorio', 503, null, now() + interval '10 minutes') ->> 'status', 'pendiente', 'transitorio → pendiente');
reset role;
select is((select next_attempt_at between now() + interval '9 minutes' and now() + interval '11 minutes' and sealed_payload is not null and lease_until is null
  from app.email_outbox where outbox_id = '60000000-0000-4000-8000-000000000002'), true, 'se reprograma y conserva el payload');
-- transitorio más allá de not_after → fallido
update app.email_outbox set status = 'en_curso', attempt_count = 3, lease_until = now() + interval '60 seconds' where outbox_id = '60000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is(api.worker_record_attempt('60000000-0000-4000-8000-000000000004', 3, 'transitorio', 500, null, now() + interval '3 days') ->> 'status', 'fallido', 'un reintento posterior a not_after es fallido');
reset role;
select is((select sealed_payload is null and delivery_state = 'fallida' from app.email_outbox where outbox_id = '60000000-0000-4000-8000-000000000004'), true, 'al fallar se destruye el payload y la entrega es fallida');
-- sexta llamada transitoria → fallido
insert into app.email_outbox (outbox_id, kind, idempotency_key, sealed_payload, status, attempt_count, lease_until, not_after) values
  ('60000000-0000-4000-8000-000000000006', 'recuperacion', 'outbox-60000000-0000-4000-8000-000000000006', 'v1.k1.a.b.c', 'en_curso', 6, now() + interval '60 seconds', now() + interval '1 day');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is(api.worker_record_attempt('60000000-0000-4000-8000-000000000006', 6, 'transitorio', 503, null, now() + interval '1 hour') ->> 'status', 'fallido', 'la sexta llamada transitoria agota los intentos (fallido)');
-- permanente → fallido
reset role;
insert into app.email_outbox (outbox_id, kind, idempotency_key, sealed_payload, status, attempt_count, lease_until, not_after) values
  ('60000000-0000-4000-8000-000000000007', 'recuperacion', 'outbox-60000000-0000-4000-8000-000000000007', 'v1.k1.a.b.c', 'en_curso', 1, now() + interval '60 seconds', now() + interval '1 day'),
  ('60000000-0000-4000-8000-000000000008', 'recuperacion', 'outbox-60000000-0000-4000-8000-000000000008', 'v1.k1.a.b.c', 'en_curso', 1, now() + interval '60 seconds', now() + interval '1 day');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is(api.worker_record_attempt('60000000-0000-4000-8000-000000000007', 1, 'permanente', 422, null, null) ->> 'status', 'fallido', 'permanente → fallido');
-- incierto: reconciliar a los 30 s con la misma clave
select is(api.worker_record_attempt('60000000-0000-4000-8000-000000000008', 1, 'incierto', null, null, null) ->> 'status', 'pendiente', 'incierto → pendiente');
reset role;
select is((select next_attempt_at between now() + interval '25 seconds' and now() + interval '35 seconds' and uncertain_since is not null and sealed_payload is not null
  from app.email_outbox where outbox_id = '60000000-0000-4000-8000-000000000008'), true, 'incierto reprograma a 30 s y marca uncertain_since');
-- incierto tras 5 minutos se trata como transitorio con la hora del worker
update app.email_outbox set status = 'en_curso', attempt_count = 2, lease_until = now() + interval '60 seconds', uncertain_since = now() - interval '6 minutes'
  where outbox_id = '60000000-0000-4000-8000-000000000008';
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is(api.worker_record_attempt('60000000-0000-4000-8000-000000000008', 2, 'incierto', null, null, now() + interval '20 minutes') ->> 'status', 'pendiente', 'incierto tras 5 minutos usa el retardo del worker');
reset role;
select is((select next_attempt_at > now() + interval '19 minutes' from app.email_outbox where outbox_id = '60000000-0000-4000-8000-000000000008'), true,
  'ya no se reconcilia a 30 s sino con el retardo normal');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');

-- Vencimiento ---------------------------------------------------------------------------------------------
reset role;
insert into app.email_outbox (outbox_id, kind, idempotency_key, sealed_payload, not_after, created_at) values
  ('60000000-0000-4000-8000-000000000009', 'invitacion', 'outbox-60000000-0000-4000-8000-000000000009', 'v1.k1.a.b.c', now() - interval '1 minute', now() - interval '2 hours');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is((api.worker_expire_outbox() ->> 'expired')::int >= 2, true, 'expire marca las filas pasadas de not_after');
reset role;
select is((select status || '|' || (sealed_payload is null)::text from app.email_outbox where outbox_id = '60000000-0000-4000-8000-000000000009'), 'vencido|true', 'lo vencido destruye el payload');
select is((select status from app.email_outbox where outbox_id = '60000000-0000-4000-8000-000000000005'), 'vencido', 'también lo que nunca se envió y ya venció');

-- Eventos del proveedor ------------------------------------------------------------------------------------
insert into app.email_outbox (outbox_id, kind, idempotency_key, sealed_payload, status, attempt_count, lease_until, not_after, provider_message_id) values
  ('60000000-0000-4000-8000-00000000000a', 'invitacion', 'outbox-60000000-0000-4000-8000-00000000000a', 'v1.k1.a.b.c', 'en_curso', 1, now() + interval '60 seconds', now() + interval '1 day', null);
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is(api.worker_record_attempt('60000000-0000-4000-8000-00000000000a', 1, 'ok', 200, 'prov-00a', null) ->> 'status', 'enviado', 'prepara un mensaje enviado con id de proveedor');
select pg_temp.login('00000000-0000-4000-8000-0000000000e4');
select is(api.ingest_email_event('evt-otro', 'prov-00a', 'email.opened', now()) ->> 'kind', 'invalid', 'un tipo fuera de los cuatro se rechaza en la base');
select is(api.ingest_email_event('', 'prov-00a', 'email.delivered', now()) ->> 'kind', 'invalid', 'un event_id vacío es invalid');
select is(api.ingest_email_event('evt-d1', 'prov-00a', 'email.delivered', now()) -> 'matched', 'true'::jsonb, 'un delivered de un mensaje conocido coincide');
reset role;
select is((select delivery_state from app.email_outbox where outbox_id = '60000000-0000-4000-8000-00000000000a'), 'entregada', 'delivered avanza a entregada');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e4');
select is(api.ingest_email_event('evt-s1', 'prov-00a', 'email.sent', now()) ->> 'duplicate', 'false', 'un sent posterior es un evento nuevo');
reset role;
select is((select delivery_state from app.email_outbox where outbox_id = '60000000-0000-4000-8000-00000000000a'), 'entregada', 'delivered antes que sent no retrocede');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e4');
select is(api.ingest_email_event('evt-d1', 'prov-00a', 'email.delivered', now()) ->> 'duplicate', 'true', 'el mismo event_id es un duplicado');
select is(api.ingest_email_event('evt-b1', 'prov-00a', 'email.bounced', now()) ->> 'kind', 'ok', 'un rebote posterior a la entrega se registra');
reset role;
select is((select delivery_state from app.email_outbox where outbox_id = '60000000-0000-4000-8000-00000000000a'), 'entregada', 'un rebote no invalida una entrega ya confirmada');
select is((select count(*)::int from app.email_webhook_events where provider_message_id = 'prov-00a'), 3, 'el duplicado no creó otra fila de evento');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e4');
select is(api.ingest_email_event('evt-x1', 'prov-desconocido', 'email.delivered', now()) -> 'matched', 'false'::jsonb, 'un evento de un mensaje desconocido se registra sin efecto');
select is(api.ingest_email_event('evt-f1', 'prov-007', 'email.failed', now()) ->> 'kind', 'ok', 'un failed de un id desconocido es ok');

-- Un evento que llega antes de conocer el id del proveedor no se pierde ------------------------------------
reset role;
insert into app.email_outbox (outbox_id, kind, idempotency_key, sealed_payload, status, attempt_count, lease_until, not_after) values
  ('60000000-0000-4000-8000-00000000000b', 'invitacion', 'outbox-60000000-0000-4000-8000-00000000000b', 'v1.k1.a.b.c', 'en_curso', 1, now() + interval '60 seconds', now() + interval '1 day');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e4');
select is(api.ingest_email_event('evt-early', 'prov-early', 'email.delivered', now()) -> 'matched', 'false'::jsonb, 'un delivered cuyo mensaje aún no tiene id del proveedor no coincide todavía');
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is(api.worker_record_attempt('60000000-0000-4000-8000-00000000000b', 1, 'ok', 200, 'prov-early', null) ->> 'status', 'enviado', 'el intento posterior se registra');
reset role;
select is((select delivery_state from app.email_outbox where outbox_id = '60000000-0000-4000-8000-00000000000b'), 'entregada',
  'al conocer el id se reaplican los eventos ya guardados (entregada)');

-- Lease vencido con las 6 llamadas gastadas: no se reintenta -----------------------------------------------------
insert into app.email_outbox (outbox_id, kind, idempotency_key, sealed_payload, status, attempt_count, lease_until, not_after) values
  ('60000000-0000-4000-8000-00000000000c', 'recuperacion', 'outbox-60000000-0000-4000-8000-00000000000c', 'v1.k1.a.b.c', 'en_curso', 6, now() - interval '1 second', now() + interval '1 day');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is((api.worker_expire_outbox() ->> 'exhausted')::int >= 1, true, 'expire cierra los leases agotados (contador exhausted)');
reset role;
select is((select status || '|' || (sealed_payload is null)::text || '|' || delivery_state from app.email_outbox where outbox_id = '60000000-0000-4000-8000-00000000000c'), 'fallido|true|fallida',
  'un lease vencido con 6 llamadas gastadas queda fallido, sin payload');
insert into app.email_outbox (outbox_id, kind, idempotency_key, sealed_payload, status, attempt_count, lease_until, not_after) values
  ('60000000-0000-4000-8000-00000000000d', 'recuperacion', 'outbox-60000000-0000-4000-8000-00000000000d', 'v1.k1.a.b.c', 'en_curso', 6, now() - interval '1 second', now() + interval '1 day');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');
select is((select count(*)::int from jsonb_array_elements(api.worker_claim_due_outbox(50) -> 'items') i where i ->> 'outboxId' = '60000000-0000-4000-8000-00000000000d'), 0,
  'el claim no reclama un lease agotado y lo deja fallido');
reset role;
select is((select status from app.email_outbox where outbox_id = '60000000-0000-4000-8000-00000000000d'), 'fallido', 'el propio claim cierra el lease agotado');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000e1');

-- Un worker no accede a las tablas ni a otras RPC ----------------------------------------------------------
select throws_ok($$select * from app.email_outbox$$, '42501', null, 'el worker no lee la tabla del outbox directamente');
select is((select count(*)::int from app.user_accounts), 1, 'el worker solo ve su propia fila de user_accounts');
select is(api.list_hospitals(10) ->> 'kind', 'forbidden', 'el worker no usa las RPC de superadmin');
select is(api.create_need_draft('clave-worker-0000001', repeat('0', 64), 'RBC', 'O_NEG', 1, '22222222-2222-4222-8222-2222222222a1', 10, 'Normal', 1) ->> 'kind', 'forbidden',
  'el worker no crea necesidades');

select * from finish();
rollback;
