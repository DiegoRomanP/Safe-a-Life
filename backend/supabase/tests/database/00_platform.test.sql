begin;
select plan(30);

-- Usuarios sintéticos de Auth (la fila de app.user_accounts se inserta como propietario).
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'donante@example.test'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sinrol@example.test');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'superadmin', 'Superadministración'),
  ('00000000-0000-4000-8000-0000000000a2', 'donante', 'Donante sintético');

-- Privilegios y propiedad -----------------------------------------------------
select ok(not has_schema_privilege('anon', 'app', 'USAGE'), 'anon no tiene USAGE en app');
select ok(not has_schema_privilege('public', 'app', 'USAGE'), 'PUBLIC no tiene USAGE en app');
select ok(has_schema_privilege('authenticated', 'app', 'USAGE'), 'authenticated tiene USAGE en app (solo con tablas bajo RLS)');
select ok(not has_table_privilege('authenticated', 'app.audit_events', 'UPDATE'), 'authenticated no actualiza audit_events');
select ok(not has_table_privilege('authenticated', 'app.audit_events', 'DELETE'), 'authenticated no borra audit_events');
select ok(not has_table_privilege('authenticated', 'app.rate_limit_events', 'SELECT'), 'authenticated no lee rate_limit_events');
select ok(not has_table_privilege('authenticated', 'app.schema_version', 'SELECT'), 'authenticated no lee schema_version');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('api', 'app') and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'),
  0, 'ninguna función DEFINER pertenece a postgres');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api' and p.prosecdef
     and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))),
  0, 'toda función DEFINER fija search_path');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'app' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)),
  0, 'todas las tablas de app tienen RLS habilitado y forzado');
select ok(has_function_privilege('anon', 'api.consume_rate_limit(text,text,int,interval)', 'EXECUTE'),
  'anon puede ejecutar consume_rate_limit (sin JWT)');

-- Invariantes ------------------------------------------------------------------
insert into app.audit_events (actor_kind, event, result) values ('sistema', 'prueba.inicial', 'ok');
select throws_ok($$update app.audit_events set event = 'otro'$$, 'P0001', 'audit_events es append-only',
  'audit_events rechaza UPDATE aunque lo pida el propietario');
select throws_ok($$delete from app.audit_events$$, 'P0001', 'audit_events es append-only', 'audit_events rechaza DELETE');
select lives_ok($$update app.configuration set final_demo_at = '2027-01-01T00:00:00Z'$$, 'final_demo_at se fija una vez');
select throws_ok($$update app.configuration set final_demo_at = '2028-01-01T00:00:00Z'$$, 'P0001',
  'final_demo_at es inmutable una vez fijado', 'final_demo_at no se puede cambiar');

-- Rate limit ---------------------------------------------------------------------
select is(
  (select count(*)::int from generate_series(1, 10) g
   where (api.consume_rate_limit('login:ip', repeat('a', 64), 10, interval '15 minutes') ->> 'allowed')::boolean),
  10, 'los 10 primeros intentos pasan');
select is((api.consume_rate_limit('login:ip', repeat('a', 64), 10, interval '15 minutes') ->> 'allowed')::boolean, false,
  'el intento 11 queda bloqueado');
select ok((api.consume_rate_limit('login:ip', repeat('a', 64), 10, interval '15 minutes') ->> 'retryAfterSeconds')::int >= 1,
  'el bloqueo informa Retry-After');
select is((api.consume_rate_limit('login:ip', repeat('b', 64), 10, interval '15 minutes') ->> 'allowed')::boolean, true,
  'otro sujeto tiene su propio contador');

-- anon ----------------------------------------------------------------------------
create temp table expected_version as select max(version) as version from app.schema_version;
grant select on expected_version to anon;
set local role anon;
select throws_ok($$select * from app.user_accounts$$, '42501', null, 'anon no lee tablas de app directamente');
select is(api.readiness(), (select version from expected_version), 'readiness devuelve la última versión de migración');

-- authenticated: superadmin AAL2 con step-up reciente ----------------------------------
set local role authenticated;
select set_config('request.jwt.claims', format(
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2","amr":[{"method":"totp","timestamp":%s}]}',
  extract(epoch from now())::bigint), true);

select is(app.require('{superadmin}', true, true), null, 'superadmin con AAL2 y step-up reciente cumple todo');
select is(app.require('{admin_hospitalario}', true, false), 'forbidden', 'rol ajeno → forbidden');
select is((select count(*)::int from app.user_accounts), 1, 'cada usuario solo ve su propia cuenta');

select set_config('request.jwt.claims', format(
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2","amr":[{"method":"totp","timestamp":%s}]}',
  extract(epoch from now())::bigint - 400), true);
select is(app.require('{superadmin}', true, true), 'step_up_required', 'step-up de hace más de 300 s → step_up_required');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1}]}', true);
select is(app.require('{superadmin}', true, false), 'mfa_required', 'aal1 → mfa_required');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated","aal":"aal2"}', true);
select is(app.require('{superadmin}', false, false), 'forbidden', 'usuario sin cuenta de aplicación → forbidden');

-- idempotencia (como donante) --------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated","aal":"aal1"}', true);
select is(app.claim_idempotency('user:00000000-0000-4000-8000-0000000000a2', 'op', 'clave-de-16-chars-', repeat('a', 64)), null,
  'primera reclamación → null (reclamada)');
select app.complete_idempotency('user:00000000-0000-4000-8000-0000000000a2', 'op', 'clave-de-16-chars-', '{"kind":"created"}');
select is(app.claim_idempotency('user:00000000-0000-4000-8000-0000000000a2', 'op', 'clave-de-16-chars-', repeat('a', 64)),
  '{"kind":"replayed","response":{"kind":"created"}}'::jsonb, 'mismo payload → replayed con la respuesta original');
select is(app.claim_idempotency('user:00000000-0000-4000-8000-0000000000a2', 'op', 'clave-de-16-chars-', repeat('b', 64)),
  '{"kind":"payload_conflict"}'::jsonb, 'otro payload → payload_conflict');

select * from finish();
rollback;
