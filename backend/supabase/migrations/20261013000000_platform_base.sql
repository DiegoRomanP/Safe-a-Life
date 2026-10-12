-- Plataforma base (F1): esquemas, rol privilegiado, tablas comunes y helpers.
-- Decisiones: ADR-003 (INVOKER por regla, DEFINER por allowlist cerrada), ADR-004.
-- Las tablas viven en `app` (no expuesto a PostgREST); solo `api` se expone.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema app;
create schema api;

revoke all on schema app, api from public, anon, authenticated;
grant usage on schema api to anon, authenticated;
grant usage on schema app to authenticated;

-- Nada ejecutable ni accesible por defecto en objetos nuevos creados por esta cuenta.
alter default privileges in schema api revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app revoke all on tables from public, anon, authenticated;
alter default privileges in schema app revoke all on sequences from public, anon, authenticated;

-- Rol propietario de las funciones DEFINER de la allowlist. Sin login, sin bypass de RLS.
create role app_privileged nologin nobypassrls;
grant app_privileged to postgres;
grant usage on schema app to app_privileged;
grant usage, create on schema api to app_privileged;
grant usage on schema extensions to app_privileged, authenticated;

create type app.actor_role as enum ('donante', 'admin_hospitalario', 'superadmin', 'worker');

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table app.user_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role app.actor_role not null,
  display_name text check (display_name is null or char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table app.configuration (
  id boolean primary key default true check (id),
  final_demo_at timestamptz
);
insert into app.configuration (id) values (true);

create table app.audit_events (
  event_id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('usuario', 'token', 'worker', 'sistema')),
  event text not null check (event ~ '^[a-z0-9_.]{1,100}$'),
  resource_type text check (resource_type is null or resource_type ~ '^[a-z0-9_]{1,40}$'),
  resource_id uuid,
  result text not null check (result in ('ok', 'denegado', 'fallido')),
  reason text check (reason is null or char_length(reason) <= 300),
  occurred_at timestamptz not null default now()
);
create index audit_events_occurred_idx on app.audit_events (occurred_at, event_id);

create table app.idempotency_records (
  actor_ref text not null
    check (actor_ref ~ '^(user:[0-9a-f-]{36}|token:[0-9a-f]{64}|email:[0-9a-f]{64})$'),
  operation text not null check (char_length(operation) between 1 and 120),
  idem_key text not null check (char_length(idem_key) between 16 and 255),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('en_curso', 'completado')),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  terminal_at timestamptz,
  primary key (actor_ref, operation, idem_key)
);
create index idempotency_terminal_idx on app.idempotency_records (terminal_at);

create table app.rate_limit_events (
  bucket text not null check (bucket ~ '^[a-z0-9_:.-]{1,60}$'),
  subject text not null check (subject ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now()
);
create index rate_limit_events_idx on app.rate_limit_events (bucket, subject, occurred_at);

create table app.schema_version (
  version text primary key
);

alter table app.user_accounts enable row level security;
alter table app.user_accounts force row level security;
alter table app.configuration enable row level security;
alter table app.configuration force row level security;
alter table app.audit_events enable row level security;
alter table app.audit_events force row level security;
alter table app.idempotency_records enable row level security;
alter table app.idempotency_records force row level security;
alter table app.rate_limit_events enable row level security;
alter table app.rate_limit_events force row level security;
alter table app.schema_version enable row level security;
alter table app.schema_version force row level security;

-- ---------------------------------------------------------------------------
-- Triggers de invariantes
-- ---------------------------------------------------------------------------

create function app.reject_audit_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_events es append-only';
end;
$$;
create trigger audit_events_no_update_delete
  before update or delete on app.audit_events
  for each row execute function app.reject_audit_change();
create trigger audit_events_no_truncate
  before truncate on app.audit_events
  for each statement execute function app.reject_audit_change();

create function app.guard_configuration() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'configuration no se puede borrar';
  end if;
  if old.final_demo_at is not null and new.final_demo_at is distinct from old.final_demo_at then
    raise exception 'final_demo_at es inmutable una vez fijado';
  end if;
  return new;
end;
$$;
create trigger configuration_guard
  before update or delete on app.configuration
  for each row execute function app.guard_configuration();

-- ---------------------------------------------------------------------------
-- Helpers internos (INVOKER, stable, search_path vacío)
-- ---------------------------------------------------------------------------

create function app.current_user_id() returns uuid
language sql stable set search_path = '' as $$ select auth.uid() $$;

create function app.current_aal() returns text
language sql stable set search_path = '' as $$ select auth.jwt() ->> 'aal' $$;

-- Nota: `current_role` es palabra reservada de SQL; por eso el helper se llama current_actor_role.
create function app.current_actor_role() returns app.actor_role
language sql stable set search_path = '' as $$
  select ua.role from app.user_accounts ua where ua.user_id = auth.uid()
$$;

-- Formato de amr en el JWT de Supabase: [{"method":"totp","timestamp":1700000000}, ...]
create function app.step_up_fresh(p_max_age interval) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
    ) as a
    where a ->> 'method' = 'totp'
      and case
            when a ->> 'timestamp' ~ '^[0-9]{1,12}$'
              then (a ->> 'timestamp')::bigint >= extract(epoch from now() - p_max_age)::bigint
            else false
          end
  )
$$;

-- null si se cumple todo; si no, el primer fallo en este orden.
create function app.require(p_roles app.actor_role[], p_aal2 boolean, p_step_up boolean) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_role app.actor_role;
begin
  if auth.uid() is null then
    return 'unauthenticated';
  end if;
  v_role := app.current_actor_role();
  if v_role is null or not (v_role = any (p_roles)) then
    return 'forbidden';
  end if;
  if p_aal2 and coalesce(app.current_aal(), '') <> 'aal2' then
    return 'mfa_required';
  end if;
  if p_step_up and not app.step_up_fresh(interval '300 seconds') then
    return 'step_up_required';
  end if;
  return null;
end;
$$;

-- null = reclamada ahora; si no, el motivo para que la RPC responda.
create function app.claim_idempotency(p_actor_ref text, p_operation text, p_key text, p_hash text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_claimed int;
  v_existing app.idempotency_records;
begin
  perform set_config('lock_timeout', '2s', true);
  begin
    insert into app.idempotency_records (actor_ref, operation, idem_key, payload_hash, status)
    values (p_actor_ref, p_operation, p_key, p_hash, 'en_curso')
    on conflict do nothing;
    get diagnostics v_claimed = row_count;
  exception when lock_not_available then
    return jsonb_build_object('kind', 'in_progress');
  end;

  if v_claimed = 1 then
    return null;
  end if;

  select * into v_existing from app.idempotency_records
  where actor_ref = p_actor_ref and operation = p_operation and idem_key = p_key;
  if not found then
    return jsonb_build_object('kind', 'in_progress');
  end if;
  if v_existing.payload_hash <> p_hash then
    return jsonb_build_object('kind', 'payload_conflict');
  end if;
  if v_existing.status = 'completado' then
    return jsonb_build_object('kind', 'replayed', 'response', v_existing.response);
  end if;
  return jsonb_build_object('kind', 'in_progress');
end;
$$;

create function app.complete_idempotency(p_actor_ref text, p_operation text, p_key text, p_response jsonb)
returns void language sql set search_path = '' as $$
  update app.idempotency_records
  set status = 'completado', response = p_response, completed_at = now(), terminal_at = now()
  where actor_ref = p_actor_ref and operation = p_operation and idem_key = p_key
$$;

create function app.write_audit(
  p_event text, p_resource_type text, p_resource_id uuid, p_result text, p_reason text,
  p_actor_kind text default null
) returns void language sql set search_path = '' as $$
  insert into app.audit_events (actor_id, actor_kind, event, resource_type, resource_id, result, reason)
  values (
    auth.uid(),
    coalesce(p_actor_kind, case when auth.uid() is null then 'token' else 'usuario' end),
    p_event, p_resource_type, p_resource_id, p_result, p_reason
  )
$$;

-- ---------------------------------------------------------------------------
-- API base (DEFINER #1 y #2 de la allowlist)
-- ---------------------------------------------------------------------------

create function api.consume_rate_limit(p_bucket text, p_subject text, p_limit int, p_window interval)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
  v_oldest timestamptz;
begin
  if p_bucket !~ '^[a-z0-9_:.-]{1,60}$' or p_subject !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 1000 or p_window <= interval '0' or p_window > interval '1 day' then
    return jsonb_build_object('allowed', false, 'retryAfterSeconds', 60);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_subject, 0));

  delete from app.rate_limit_events
  where bucket = p_bucket and subject = p_subject and occurred_at <= now() - p_window;

  select count(*), min(occurred_at) into v_count, v_oldest
  from app.rate_limit_events where bucket = p_bucket and subject = p_subject;

  if v_count < p_limit then
    insert into app.rate_limit_events (bucket, subject) values (p_bucket, p_subject);
    return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
  end if;

  return jsonb_build_object(
    'allowed', false,
    'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_oldest + p_window - now())))::int)
  );
end;
$$;

create function api.readiness() returns text
language sql stable security definer set search_path = '' as $$
  select max(version) from app.schema_version
$$;

-- ---------------------------------------------------------------------------
-- Propiedad y privilegios
-- ---------------------------------------------------------------------------

alter function api.consume_rate_limit(text, text, int, interval) owner to app_privileged;
alter function api.readiness() owner to app_privileged;

revoke all on all functions in schema api from public, anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;

grant execute on function api.consume_rate_limit(text, text, int, interval) to anon, authenticated;
grant execute on function api.readiness() to anon, authenticated;
grant execute on all functions in schema app to authenticated, app_privileged;

-- Tablas: authenticated recibe solo lo imprescindible, siempre bajo RLS.
revoke all on all tables in schema app from public, anon, authenticated;
grant select on app.user_accounts to authenticated;
grant select on app.configuration to authenticated;
grant select, insert on app.audit_events to authenticated;
grant select, insert, update (status, response, completed_at, terminal_at) on app.idempotency_records to authenticated;

grant select, insert, update, delete on app.user_accounts, app.configuration,
  app.idempotency_records, app.rate_limit_events, app.schema_version to app_privileged;
grant select, insert on app.audit_events to app_privileged;

-- ---------------------------------------------------------------------------
-- Políticas RLS (deny-by-default: sin política no hay acceso)
-- ---------------------------------------------------------------------------

create policy user_accounts_own_select on app.user_accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_accounts_privileged on app.user_accounts
  for all to app_privileged using (true) with check (true);

create policy configuration_superadmin_select on app.configuration
  for select to authenticated using (app.current_actor_role() = 'superadmin');
create policy configuration_privileged on app.configuration
  for all to app_privileged using (true) with check (true);

create policy audit_events_superadmin_select on app.audit_events
  for select to authenticated using (app.current_actor_role() = 'superadmin');
create policy audit_events_own_insert on app.audit_events
  for insert to authenticated with check (actor_id = (select auth.uid()) and actor_kind = 'usuario');
create policy audit_events_privileged_select on app.audit_events
  for select to app_privileged using (true);
create policy audit_events_privileged_insert on app.audit_events
  for insert to app_privileged with check (true);

create policy idempotency_own on app.idempotency_records
  for all to authenticated
  using (actor_ref = 'user:' || (select auth.uid())::text)
  with check (actor_ref = 'user:' || (select auth.uid())::text);
create policy idempotency_privileged on app.idempotency_records
  for all to app_privileged using (true) with check (true);

create policy rate_limit_privileged on app.rate_limit_events
  for all to app_privileged using (true) with check (true);
create policy schema_version_privileged on app.schema_version
  for all to app_privileged using (true) with check (true);

insert into app.schema_version (version) values ('20261013000000');
