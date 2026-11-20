-- Hardening de la auditoría 2026-11-20 (M1 y L3).
--
-- `api.consume_rate_limit` y `api.record_public_idempotency` eran ejecutables por `anon` y por cualquier `authenticated`,
-- con bucket, sujeto, límite y ventana elegidos por quien llama. Con la anon key se podía saturar el techo global O1
-- (`authquota:*`, sujeto fijo y público) y bloquear todos los logins y renovaciones, o hacer crecer sin límite
-- `app.rate_limit_events` y `app.idempotency_records`.
--
-- Desde aquí solo las ejecuta la identidad técnica de la API (`app.is_api_technical()`), como las demás RPC públicas de
-- tokens. Siguen siendo DEFINER (ítem 1 de la allowlist de ADR-003 y RPC pública de idempotencia) porque escriben en
-- tablas que `authenticated` no ve. Un llamador que no es la API recibe 42501 y nada se escribe.

create or replace function api.consume_rate_limit(p_bucket text, p_subject text, p_limit int, p_window interval)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
  v_oldest timestamptz;
begin
  if not app.is_api_technical() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

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

create or replace function api.record_public_idempotency(p_actor_ref text, p_operation text, p_key text, p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_claim jsonb;
begin
  if not app.is_api_technical() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_actor_ref !~ '^(email|token):[0-9a-f]{64}$' or p_operation not in ('createSession') then
    return jsonb_build_object('kind', 'invalid');
  end if;
  v_claim := app.claim_idempotency(p_actor_ref, p_operation, p_key, p_hash);
  if v_claim is null then
    perform app.complete_idempotency(p_actor_ref, p_operation, p_key, jsonb_build_object('kind', 'ok'));
    return jsonb_build_object('kind', 'ok');
  end if;
  if v_claim ->> 'kind' = 'replayed' then
    return jsonb_build_object('kind', 'ok');
  end if;
  return v_claim;
end;
$$;

alter function api.consume_rate_limit(text, text, int, interval) owner to app_privileged;
alter function api.record_public_idempotency(text, text, text, text) owner to app_privileged;
revoke all on function api.consume_rate_limit(text, text, int, interval) from public, anon, authenticated, service_role;
revoke all on function api.record_public_idempotency(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function api.consume_rate_limit(text, text, int, interval) to authenticated;
grant execute on function api.record_public_idempotency(text, text, text, text) to authenticated;

insert into app.schema_version (version) values ('20261120124712');
