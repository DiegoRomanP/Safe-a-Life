begin;
-- Aislamiento: la base puede estar sembrada. Todo se revierte con el rollback.
truncate app.user_accounts cascade;

select plan(16);

insert into auth.users (id, instance_id, aud, role, email, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-den-api@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-den-worker@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-den-donante@example.test', now() - interval '1 day');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'api_technical', null),
  ('00000000-0000-4000-8000-0000000000a2', 'worker', null),
  ('00000000-0000-4000-8000-0000000000a3', 'donante', null);

create function pg_temp.login(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1}]}', p_uid), true);
end $$;
grant execute on function pg_temp.login(text) to authenticated, anon;

select is((select prosecdef from pg_proc where oid = 'api.record_denial(uuid, text, text)'::regprocedure), true, 'record_denial es SECURITY DEFINER');
select is((select pg_get_userbyid(proowner)::text from pg_proc where oid = 'api.record_denial(uuid, text, text)'::regprocedure), 'app_privileged', 'y pertenece a app_privileged');
select is(has_function_privilege('anon', 'api.record_denial(uuid, text, text)', 'execute'), false, 'anon no la ejecuta');

set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a3');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'acceso', 'GET /api/v1/x/:id') ->> 'kind', 'forbidden', 'un donante no registra denegaciones');
select pg_temp.login('00000000-0000-4000-8000-0000000000a2');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'acceso', 'GET /api/v1/x/:id') ->> 'kind', 'forbidden', 'ni el worker');

select pg_temp.login('00000000-0000-4000-8000-0000000000a1');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'acceso', 'GET /api/v1/x/:id'), '{"kind": "ok", "recorded": true}'::jsonb, 'la identidad técnica de la API registra una denegación');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'acceso', 'GET /api/v1/x/:id'), '{"kind": "ok", "recorded": false}'::jsonb, 'la repetida dentro de 10 segundos no crea otra fila');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'acceso', 'GET /api/v1/y/:id') ->> 'recorded', 'true', 'otra ruta sí');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'conflicto', 'GET /api/v1/x/:id') ->> 'recorded', 'true', 'y otro tipo también');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'limite', 'POST /api/v1/x') ->> 'recorded', 'true', 'un límite de tasa se registra');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'limite', 'POST /api/v1/x') ->> 'recorded', 'false', 'y se deduplica');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'exito', 'GET /api/v1/x') ->> 'kind', 'invalid', 'un tipo desconocido es invalid');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'acceso', 'GET /api/v1/x?token=secreto') ->> 'kind', 'invalid', 'una ruta con query (datos) es invalid');
select is(api.record_denial(null, 'acceso', 'GET /api/v1/x') ->> 'kind', 'invalid', 'sin actor es invalid');
reset role;

select is((select count(*)::int from app.audit_events where actor_id = '00000000-0000-4000-8000-0000000000a3' and result = 'denegado'), 4, 'quedaron cuatro filas denegadas (sin duplicados)');
-- La tabla es append-only: una fila anterior a la ventana se simula insertándola con su fecha.
insert into app.audit_events (actor_id, actor_kind, event, result, reason, occurred_at)
values ('00000000-0000-4000-8000-0000000000a3', 'usuario', 'denegacion.acceso', 'denegado', 'GET /api/v1/antigua/:id', now() - interval '11 seconds');
set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1');
select is(api.record_denial('00000000-0000-4000-8000-0000000000a3', 'acceso', 'GET /api/v1/antigua/:id') ->> 'recorded', 'true', 'una fila anterior a la ventana de 10 segundos no deduplica');
reset role;

select * from finish();
rollback;
