-- email-delivery (F4): outbox cifrado, intentos, eventos del proveedor y RPC del worker.
-- Las funciones worker_* e ingest_email_event son SECURITY DEFINER de la allowlist de ADR-003 (ítem 10):
-- propiedad de app_privileged, search_path vacío y comprobación explícita del rol interno `worker` (V13).
-- Ni `authenticated` ni `anon` tienen privilegios sobre las tablas.

create table app.email_outbox (
  outbox_id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('invitacion', 'verificacion_email', 'alta_asistida', 'cambio_email', 'recuperacion', 'invitacion_admin')),
  -- Sin clave foránea todavía: la tabla de invitaciones llega con F6.
  invitation_id uuid,
  recipient_user_id uuid references auth.users (id) on delete set null,
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 256),
  sealed_payload text,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_curso', 'enviado', 'fallido', 'cancelado', 'vencido')),
  attempt_count int not null default 0 check (attempt_count between 0 and 6),
  next_attempt_at timestamptz not null default now(),
  not_after timestamptz not null,
  lease_until timestamptz,
  uncertain_since timestamptz,
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 255),
  delivery_state text not null default 'pendiente' check (delivery_state in ('pendiente', 'enviada', 'entregada', 'fallida')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  -- Un mensaje activo conserva su payload cifrado; uno final lo destruye (V7 / AP-06).
  check ((status in ('pendiente', 'en_curso')) = (sealed_payload is not null)),
  check ((status in ('pendiente', 'en_curso')) = (finalized_at is null))
);
create index email_outbox_due_idx on app.email_outbox (status, next_attempt_at);
create index email_outbox_lease_idx on app.email_outbox (status, lease_until);
create index email_outbox_provider_idx on app.email_outbox (provider_message_id) where provider_message_id is not null;

create table app.email_attempts (
  outbox_id uuid not null references app.email_outbox (outbox_id) on delete cascade,
  attempt_no int not null check (attempt_no between 1 and 6),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  outcome text not null check (outcome in ('ok', 'transitorio', 'permanente', 'incierto')),
  http_status int check (http_status is null or http_status between 100 and 599),
  primary key (outbox_id, attempt_no)
);

create table app.email_webhook_events (
  event_id text primary key check (char_length(event_id) between 1 and 255),
  received_at timestamptz not null default now(),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 255),
  type text not null check (char_length(type) between 1 and 100)
);

alter table app.email_outbox enable row level security;
alter table app.email_outbox force row level security;
alter table app.email_attempts enable row level security;
alter table app.email_attempts force row level security;
alter table app.email_webhook_events enable row level security;
alter table app.email_webhook_events force row level security;

grant select, insert, update, delete on app.email_outbox, app.email_attempts, app.email_webhook_events to app_privileged;
create policy email_outbox_privileged on app.email_outbox for all to app_privileged using (true) with check (true);
create policy email_attempts_privileged on app.email_attempts for all to app_privileged using (true) with check (true);
create policy email_webhook_events_privileged on app.email_webhook_events for all to app_privileged using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- app_privileged no tiene USAGE sobre el esquema auth (postgres no puede concederlo en Supabase), así que las
-- DEFINER del worker no llaman a auth.uid(): leen el `sub` del JWT que PostgREST ya validó y dejó en el GUC.
create function app.jwt_sub() returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

-- El rol interno `worker` (V13) se resuelve en la tabla protegida, nunca desde el JWT ni los argumentos.
create function app.is_worker() returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from app.user_accounts ua where ua.user_id = app.jwt_sub() and ua.role = 'worker')
$$;

-- Único acceso a auth.users: el correo de UN destinatario por id. Lo crea `postgres` (que sí tiene USAGE y
-- SELECT sobre auth) y solo lo ejecuta app_privileged; no devuelve nada más del usuario.
create function app.user_email(p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select u.email::text from auth.users u where u.id = p_user_id
$$;
revoke all on function app.user_email(uuid) from public, anon, authenticated;

-- Mismo orden que `advance` en TypeScript: nunca retrocede; fallida es final y no invalida una entrega.
create function app.advance_delivery(p_current text, p_event text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_current = 'fallida' then 'fallida'
    when p_event = 'fallida' then case when p_current = 'entregada' then 'entregada' else 'fallida' end
    when (case p_event when 'enviada' then 1 when 'entregada' then 2 else 0 end)
       > (case p_current when 'enviada' then 1 when 'entregada' then 2 else 0 end) then p_event
    else p_current
  end
$$;

-- Encola un correo. Lo llaman las RPC DEFINER de los productores (F2b, F5, F6, F7); nadie más tiene EXECUTE.
-- El payload ya llega cifrado desde la aplicación (el id del outbox es su AAD) y nunca en claro.
create function app.enqueue_email(
  p_outbox_id uuid, p_kind text, p_invitation_id uuid, p_recipient_user_id uuid, p_sealed_payload text, p_not_after timestamptz
) returns uuid language sql set search_path = '' as $$
  insert into app.email_outbox (outbox_id, kind, invitation_id, recipient_user_id, idempotency_key, sealed_payload, not_after)
  values (p_outbox_id, p_kind, p_invitation_id, p_recipient_user_id, 'outbox-' || p_outbox_id::text, p_sealed_payload, p_not_after)
  returning outbox_id
$$;

-- ---------------------------------------------------------------------------
-- RPC del worker (DEFINER)
-- ---------------------------------------------------------------------------

-- Reclama filas vencidas con SKIP LOCKED; también recupera las de lease vencido. Cada reclamo cuenta como
-- una llamada (si el worker cae después de enviar, el límite de 6 sigue valiendo). El lease de 120 s cubre un lote
-- de 5 envíos de hasta 10 s cada uno; devuelve `notAfter` para que el worker no envíe pasado el plazo.
create function api.worker_claim_due_outbox(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_items jsonb;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_limit is null or p_limit not between 1 and 50 then return jsonb_build_object('kind', 'invalid'); end if;

  -- Un lease vencido con las 6 llamadas gastadas ya no se reintenta.
  update app.email_outbox
  set status = 'fallido', sealed_payload = null, lease_until = null, finalized_at = now(),
      delivery_state = app.advance_delivery(delivery_state, 'fallida')
  where status = 'en_curso' and lease_until <= now() and attempt_count >= 6;

  with due as (
    select o.outbox_id from app.email_outbox o
    where ((o.status = 'pendiente' and o.next_attempt_at <= now()) or (o.status = 'en_curso' and o.lease_until <= now()))
      and o.not_after > now() and o.attempt_count < 6
    order by o.next_attempt_at, o.outbox_id
    limit p_limit
    for update skip locked
  ), claimed as (
    update app.email_outbox o
    set status = 'en_curso', lease_until = now() + interval '120 seconds', attempt_count = o.attempt_count + 1
    from due where o.outbox_id = due.outbox_id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'outboxId', c.outbox_id, 'kind', c.kind, 'sealedPayload', c.sealed_payload, 'attemptNo', c.attempt_count,
           'idempotencyKey', c.idempotency_key, 'notAfter', app.iso(c.not_after),
           'recipient', app.user_email(c.recipient_user_id)
         ) order by c.next_attempt_at, c.outbox_id), '[]'::jsonb)
    into v_items
  from claimed c;

  return jsonb_build_object('kind', 'ok', 'items', v_items);
end;
$$;

create function api.worker_record_attempt(
  p_outbox_id uuid, p_attempt_no int, p_outcome text, p_http_status int, p_provider_message_id text, p_next_attempt_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row app.email_outbox;
  v_retry_at timestamptz;
  v_status text;
  v_event text;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_outcome is null or p_outcome not in ('ok', 'transitorio', 'permanente', 'incierto')
     or p_attempt_no is null or p_attempt_no not between 1 and 6
     or (p_http_status is not null and p_http_status not between 100 and 599)
     or (p_provider_message_id is not null and char_length(p_provider_message_id) > 255) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_row from app.email_outbox where outbox_id = p_outbox_id for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  -- Un intento obsoleto (lease perdido y fila reclamada por otro worker) no cambia nada.
  if v_row.status <> 'en_curso' or v_row.attempt_count <> p_attempt_no then return jsonb_build_object('kind', 'conflict'); end if;

  insert into app.email_attempts (outbox_id, attempt_no, outcome, http_status)
  values (p_outbox_id, p_attempt_no, p_outcome, p_http_status);

  if p_outcome = 'ok' then
    v_status := 'enviado';
  elsif p_outcome = 'permanente' then
    v_status := 'fallido';
  else
    if p_outcome = 'incierto' then
      v_row.uncertain_since := coalesce(v_row.uncertain_since, now());
      if now() - v_row.uncertain_since < interval '5 minutes' then
        v_retry_at := now() + interval '30 seconds';   -- reconciliar con la misma clave de idempotencia
      end if;
    end if;
    v_retry_at := coalesce(v_retry_at, p_next_attempt_at);
    v_status := case
      when v_row.attempt_count < 6 and v_retry_at is not null and v_retry_at < v_row.not_after then 'pendiente'
      else 'fallido'
    end;
  end if;

  if v_status = 'pendiente' then
    update app.email_outbox
    set status = 'pendiente', lease_until = null, uncertain_since = v_row.uncertain_since,
        next_attempt_at = greatest(v_retry_at, now())
    where outbox_id = p_outbox_id;
  else
    -- Estado final: el payload cifrado se destruye (V7 / AP-06).
    update app.email_outbox
    set status = v_status, sealed_payload = null, lease_until = null, finalized_at = now(),
        uncertain_since = v_row.uncertain_since,
        provider_message_id = case when v_status = 'enviado' then p_provider_message_id else provider_message_id end,
        delivery_state = app.advance_delivery(delivery_state, case when v_status = 'enviado' then 'enviada' else 'fallida' end)
    where outbox_id = p_outbox_id;
    -- Un evento del proveedor puede haber llegado ANTES de conocer su id: se reaplica en orden de llegada.
    if v_status = 'enviado' and p_provider_message_id is not null then
      for v_event in
        select e.type from app.email_webhook_events e where e.provider_message_id = p_provider_message_id order by e.received_at, e.event_id
      loop
        update app.email_outbox
        set delivery_state = app.advance_delivery(delivery_state, case v_event when 'email.sent' then 'enviada' when 'email.delivered' then 'entregada' else 'fallida' end)
        where outbox_id = p_outbox_id;
      end loop;
    end if;
  end if;
  return jsonb_build_object('kind', 'ok', 'status', v_status);
end;
$$;

-- Vence lo que ya pasó de not_after (payload destruido) y cierra los leases agotados.
create function api.worker_expire_outbox() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_expired int;
  v_exhausted int;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;

  update app.email_outbox
  set status = 'vencido', sealed_payload = null, lease_until = null, finalized_at = now()
  where status in ('pendiente', 'en_curso') and not_after <= now();
  get diagnostics v_expired = row_count;

  update app.email_outbox
  set status = 'fallido', sealed_payload = null, lease_until = null, finalized_at = now(),
      delivery_state = app.advance_delivery(delivery_state, 'fallida')
  where status = 'en_curso' and lease_until <= now() and attempt_count >= 6;
  get diagnostics v_exhausted = row_count;

  return jsonb_build_object('kind', 'ok', 'expired', v_expired, 'exhausted', v_exhausted);
end;
$$;

-- Evento firmado del proveedor (el webhook verifica la firma antes). Deduplica por event_id.
create function api.ingest_email_event(p_event_id text, p_provider_message_id text, p_type text, p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_inserted int;
  v_event text;
  v_matched int := 0;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_event_id is null or char_length(p_event_id) not between 1 and 255
     or p_provider_message_id is null or char_length(p_provider_message_id) not between 1 and 255
     or p_type is null or p_type not in ('email.sent', 'email.delivered', 'email.bounced', 'email.failed') then
    return jsonb_build_object('kind', 'invalid');
  end if;

  insert into app.email_webhook_events (event_id, provider_message_id, type) values (p_event_id, p_provider_message_id, p_type)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('kind', 'ok', 'duplicate', true); end if;

  v_event := case p_type when 'email.sent' then 'enviada' when 'email.delivered' then 'entregada' else 'fallida' end;
  update app.email_outbox set delivery_state = app.advance_delivery(delivery_state, v_event)
  where provider_message_id = p_provider_message_id;
  get diagnostics v_matched = row_count;
  return jsonb_build_object('kind', 'ok', 'duplicate', false, 'matched', v_matched > 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Propiedad y privilegios
-- ---------------------------------------------------------------------------

alter function api.worker_claim_due_outbox(int) owner to app_privileged;
alter function api.worker_record_attempt(uuid, int, text, int, text, timestamptz) owner to app_privileged;
alter function api.worker_expire_outbox() owner to app_privileged;
alter function api.ingest_email_event(text, text, text, timestamptz) owner to app_privileged;

grant execute on function app.advance_delivery(text, text) to authenticated, app_privileged;
grant execute on function app.jwt_sub(), app.is_worker(), app.user_email(uuid) to app_privileged;
grant execute on function app.enqueue_email(uuid, text, uuid, uuid, text, timestamptz) to app_privileged;
grant execute on function
  api.worker_claim_due_outbox(int), api.worker_record_attempt(uuid, int, text, int, text, timestamptz),
  api.worker_expire_outbox(), api.ingest_email_event(text, text, text, timestamptz)
to authenticated;

insert into app.schema_version (version) values ('20261013040000');
