-- invitation-coordination (F6-4b): proyección de `delivery` en la invitación, eliminación de cuenta (V15), tareas de entrega fallida
-- y purga de concesiones. Contrato: docs/plans/2026-10-22-f6-contrato-reconciliado.md §5, D3 y D4.
--
-- Decisiones que el contrato no fija (constan aquí para la revisión):
--  1. La proyección `outbox.delivery_state -> invitations.delivery` es un trigger sobre `email_outbox`: cubre todos los caminos que
--     cambian el estado (intento, evento del proveedor, barridos). Proyecta solo la fila vigente (`current_outbox_id`, D4).
--  2. shortcut: los barridos multi-fila (leases agotados en `worker_claim_due_outbox`) actualizan el outbox antes que la invitación
--     (orden inverso al canónico); un cruce con una cascada lo resuelve el detector de interbloqueos (40P01, reintentable). Subir a
--     bloqueo previo con SKIP LOCKED si la medición de F6-6 lo muestra.
--  3. Las concesiones (lote y reintento) se purgan a las 72 h como la idempotencia: `api.worker_purge_invitation_grants`.

-- Proyección de la entrega (D4).
create function app.project_invitation_delivery() returns trigger
language plpgsql set search_path = '' as $$
begin
  update app.invitations set delivery = new.delivery_state
  where current_outbox_id = new.outbox_id and delivery is distinct from new.delivery_state;
  return new;
end;
$$;
create trigger email_outbox_project_delivery
  after update of delivery_state on app.email_outbox
  for each row when (old.delivery_state is distinct from new.delivery_state)
  execute function app.project_invitation_delivery();

create or replace function api.worker_record_attempt(
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

  -- D3: invitación -> outbox. El outbox vigente de una invitación se bloquea después de su invitación.
  perform 1 from app.invitations i where i.current_outbox_id = p_outbox_id for update;
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

  -- D4 (V6): un envío en curso termina, pero si la invitación ya no está activa no se reintenta: queda cancelado.
  if v_status = 'pendiente' and exists (select 1 from app.invitations i where i.current_outbox_id = p_outbox_id and i.validity <> 'activa') then
    v_status := 'cancelado';
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
        delivery_state = case when v_status = 'cancelado' then delivery_state
                              else app.advance_delivery(delivery_state, case when v_status = 'enviado' then 'enviada' else 'fallida' end) end
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

create or replace function api.ingest_email_event(p_event_id text, p_provider_message_id text, p_type text, p_occurred_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_inserted int;
  v_event text;
  v_matched int := 0;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
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
  -- D3: invitación -> outbox. Solo la fila vigente de la invitación proyecta `delivery` (trigger); una anterior solo se actualiza a sí misma.
  perform 1 from app.invitations i where i.current_outbox_id in (
    select o.outbox_id from app.email_outbox o where o.provider_message_id = p_provider_message_id)
    order by i.invitation_id for update;
  update app.email_outbox set delivery_state = app.advance_delivery(delivery_state, v_event)
  where provider_message_id = p_provider_message_id;
  get diagnostics v_matched = row_count;
  return jsonb_build_object('kind', 'ok', 'duplicate', false, 'matched', v_matched > 0);
end;
$$;

create or replace function api.finish_deletion(p_request_id uuid, p_subject_hmac text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_request app.correction_requests;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not (app.is_api_technical() or app.is_worker()) then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_request_id is null or p_subject_hmac is null or p_subject_hmac !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_request from app.correction_requests where request_id = p_request_id for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_request.type <> 'eliminacion' then return jsonb_build_object('kind', 'conflict'); end if;
  if v_request.status = 'completada' then return jsonb_build_object('kind', 'ok'); end if;
  if v_request.status <> 'en_ejecucion' or v_request.donor_id is null then return jsonb_build_object('kind', 'conflict'); end if;
  -- El usuario debe haber desaparecido: la aplicación borra Auth antes de cerrar.
  if exists (select 1 from app.donor_profiles p where p.donor_id = v_request.donor_id) then return jsonb_build_object('kind', 'conflict'); end if;

  insert into app.deletion_ledger (subject_hmac, scope) values (p_subject_hmac, 'donor_account') on conflict (subject_hmac) do nothing;
  delete from app.idempotency_records where actor_ref = 'user:' || v_request.donor_id::text;
  -- V15 (O2): orden del donante (solicitud -> invitaciones -> outbox). Las confirmaciones anonimizadas siguen contando (O3).
  perform 1 from app.invitations i where i.donor_id = v_request.donor_id order by i.invitation_id for update;
  perform app.lock_donor_invitations(v_request.donor_id);
  perform app.invalidate_donor_invitations(v_request.donor_id);
  update app.invitations set donor_id = null, confirm_token_hash = null, reject_token_hash = null where donor_id = v_request.donor_id;
  delete from app.invitation_response_history where donor_id = v_request.donor_id;
  delete from app.correction_requests where donor_id = v_request.donor_id and request_id <> p_request_id;
  update app.correction_requests set status = 'completada', donor_id = null, updated_at = now() where request_id = p_request_id;
  perform app.d_audit('solicitud.completada', 'correction_request', p_request_id, 'sistema');
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- V20 / O5: la cola del superadmin incluye las invitaciones activas sin respuesta cuya entrega falló (reintento manual, C-4).
create or replace function api.list_superadmin_tasks() returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  return jsonb_build_object('kind', 'ok', 'items', coalesce((
    select jsonb_agg(jsonb_build_object('taskId', t.id, 'kind', t.kind, 'createdAt', app.iso(t.created_at), 'resourceCode', app.opaque_code(t.id))
                     order by t.created_at, t.id)
    from (
      select s.site_id as id, 'hospital_review'::text as kind, s.created_at from app.sites s where not s.is_approved
      union all
      select i.invitation_id, 'delivery_failure', i.created_at from app.invitations i
      where i.validity = 'activa' and i.response = 'sin_respuesta' and i.delivery = 'fallida'
    ) t
  ), '[]'::jsonb));
end;
$$;

-- Purga de concesiones del lote y del reintento (72 h tras su creación; consumidas o no).
create function api.worker_purge_invitation_grants() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_batch int;
  v_retry int;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  delete from app.invitation_batch_grants where created_at <= now() - interval '72 hours';
  get diagnostics v_batch = row_count;
  delete from app.invitation_retry_grants where created_at <= now() - interval '72 hours';
  get diagnostics v_retry = row_count;
  return jsonb_build_object('kind', 'ok', 'batchGrants', v_batch, 'retryGrants', v_retry);
end;
$$;
alter function api.worker_purge_invitation_grants() owner to app_privileged;
revoke all on function api.worker_purge_invitation_grants() from public, anon, service_role;
grant execute on function api.worker_purge_invitation_grants() to authenticated;
grant execute on function app.project_invitation_delivery() to app_privileged;

insert into app.schema_version (version) values ('20261022060000');
