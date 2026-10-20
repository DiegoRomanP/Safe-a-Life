-- privacy-requests (F7), parte 2: ejecución de solicitudes aprobadas y purgas del worker.
--
-- Todas son DEFINER de app_privileged (ADR-003 ítem 9: ejecución de solicitudes de corrección o eliminación; ítem 10:
-- funciones `worker_*`). `execute_correction_request` lo ejecuta el superadmin con AAL2, step-up y un grant `execute`; las
-- que reciben un id de solicitud tras la ejecución (`get_execution_subject`, `issue_email_change`, `finish_email_change`,
-- `finish_deletion`, `fail_correction_request`) solo las ejecuta la sesión técnica (o el worker). Ninguna escribe valores
-- personales en la auditoría.

-- ---------------------------------------------------------------------------
-- Ejecución (superadmin)
-- ---------------------------------------------------------------------------

create function api.execute_correction_request(p_key text, p_hash text, p_request_id uuid, p_grant_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_request app.correction_requests;
  v_grant app.access_grants;
  v_next text := 'none';
  v_row record;
  v_reply jsonb;
begin
  v_fail := app.d_require('{superadmin}', true, true);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_key is null or char_length(p_key) not between 16 and 256 or p_request_id is null or p_grant_id is null
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('requestId', p_request_id::text), jsonb_build_array('grantId', p_grant_id::text))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_claim := app.peek_idempotency('user:' || app.jwt_sub()::text, 'executeApprovedCorrectionRequest', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  select * into v_request from app.correction_requests where request_id = p_request_id;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  -- Un grant inexistente, ajeno, de otra solicitud o de otra acción no distingue el motivo.
  select * into v_grant from app.access_grants
  where grant_id = p_grant_id and request_id = p_request_id and superadmin_id = app.jwt_sub() and action = 'execute';
  if not found then return jsonb_build_object('kind', 'forbidden'); end if;
  if v_grant.expires_at <= now() then return jsonb_build_object('kind', 'gone'); end if;
  if v_request.type = 'correccion' and not (v_request.requested_fields <@ v_grant.allowed_fields) then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  select * into v_request from app.correction_requests where request_id = p_request_id for update;
  if v_request.status <> 'aprobada' or v_request.donor_id is null then return jsonb_build_object('kind', 'conflict'); end if;

  v_claim := app.claim_idempotency('user:' || app.jwt_sub()::text, 'executeApprovedCorrectionRequest', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.correction_requests set status = 'en_ejecucion', updated_at = now() where request_id = p_request_id;

  if v_request.type = 'correccion' then
    update app.donor_profiles
    set name = coalesce(v_request.proposed_name, name),
        declared_blood_type = coalesce(v_request.proposed_blood_type, declared_blood_type),
        updated_at = now()
    where donor_id = v_request.donor_id;
    if not found then
      update app.correction_requests set status = 'fallida', updated_at = now() where request_id = p_request_id;
    elsif 'email' = any (v_request.requested_fields) then
      -- El correo cambia al verificar el enlace que recibe el buzón nuevo (RF-PRO-04): sigue en ejecución.
      v_next := 'email';
    else
      update app.correction_requests set status = 'completada', updated_at = now() where request_id = p_request_id;
    end if;
  else
    -- Eliminación (V15): se corta ya lo que podría seguir tocando a la persona; el borrado de Auth y el ledger los cierra la
    -- aplicación con `finish_deletion`. Las invitaciones y el historial de respuestas se anonimizan aquí cuando existan (F6).
    update app.donor_profiles set is_available = false, updated_at = now() where donor_id = v_request.donor_id and is_available;
    update app.action_tokens set invalidated_at = now() where subject_id = v_request.donor_id and consumed_at is null and invalidated_at is null;
    update app.email_outbox set status = 'cancelado', sealed_payload = null, finalized_at = now(), lease_until = null
    where recipient_user_id = v_request.donor_id and status = 'pendiente';
    v_next := 'deletion';
  end if;

  select r.request_id, r.type, r.requested_fields, r.status, r.decision_reason, r.created_at, r.updated_at into v_row
  from app.correction_requests r where r.request_id = p_request_id;
  perform app.d_audit('solicitud.ejecutada', 'correction_request', p_request_id, 'usuario');

  v_reply := jsonb_build_object('kind', 'ok', 'next', v_next,
    'request', app.request_json(v_row.request_id, v_row.type, v_row.requested_fields, v_row.status, v_row.decision_reason, v_row.created_at, v_row.updated_at));
  perform app.complete_idempotency('user:' || app.jwt_sub()::text, 'executeApprovedCorrectionRequest', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cierre de la ejecución (sesión técnica)
-- ---------------------------------------------------------------------------

-- Qué necesita la aplicación para seguir: el correo propuesto (cifrado) o el donante a borrar. Solo en `en_ejecucion`.
create function api.get_execution_subject(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_request app.correction_requests;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_request_id is null then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_request from app.correction_requests where request_id = p_request_id;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_request.status <> 'en_ejecucion' or v_request.donor_id is null then return jsonb_build_object('kind', 'conflict'); end if;
  return jsonb_strip_nulls(jsonb_build_object('kind', 'ok', 'type', v_request.type,
    'donorId', case when v_request.type = 'eliminacion' then v_request.donor_id end,
    'proposedEmailSealed', case when v_request.type = 'correccion' then v_request.proposed_email_sealed end));
end;
$$;

-- Emite el token `cambio_email` (24 h) y el correo al buzón NUEVO. Idempotente por solicitud.
create function api.issue_email_change(p_request_id uuid, p_token_hash text, p_sealed_email text, p_outbox_id uuid, p_sealed_payload text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_request app.correction_requests;
  v_expires timestamptz;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_request_id is null or p_outbox_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_sealed_email is null or char_length(p_sealed_email) not between 20 and 4000
     or p_sealed_payload is null or char_length(p_sealed_payload) not between 20 and 4000 then
    return jsonb_build_object('kind', 'invalid');
  end if;
  select * into v_request from app.correction_requests where request_id = p_request_id for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_request.status <> 'en_ejecucion' or v_request.type <> 'correccion' or not ('email' = any (v_request.requested_fields)) or v_request.donor_id is null then
    return jsonb_build_object('kind', 'conflict');
  end if;
  if exists (select 1 from app.action_tokens t where t.kind = 'cambio_email' and t.data ->> 'requestId' = p_request_id::text) then
    return jsonb_build_object('kind', 'ok');
  end if;

  -- Un solo enlace de cambio de correo vivo por donante.
  update app.action_tokens set invalidated_at = now()
  where kind = 'cambio_email' and subject_id = v_request.donor_id and consumed_at is null and invalidated_at is null;
  v_expires := now() + interval '24 hours';
  insert into app.action_tokens (token_hash, kind, subject_id, data, expires_at)
  values (p_token_hash, 'cambio_email', v_request.donor_id, jsonb_build_object('sealedEmail', p_sealed_email, 'requestId', p_request_id), v_expires);
  perform app.enqueue_email(p_outbox_id, 'cambio_email', null, null, p_sealed_payload, v_expires);
  perform app.d_audit('solicitud.correo_emitido', 'correction_request', p_request_id, 'sistema');
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- La verificación del enlace (F5) terminó: el correo cambió (`p_ok`) o no pudo cambiar (correo ocupado).
create function api.finish_email_change(p_token_hash text, p_ok boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token app.action_tokens;
  v_id uuid;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_ok is null then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_token from app.action_tokens where token_hash = p_token_hash and kind = 'cambio_email';
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  -- Un cambio de correo que no nació de una solicitud (no hay requestId) no tiene nada que cerrar.
  if v_token.data ->> 'requestId' is null or v_token.consumed_at is null then return jsonb_build_object('kind', 'ok'); end if;
  v_id := (v_token.data ->> 'requestId')::uuid;
  update app.correction_requests set status = case when p_ok then 'completada' else 'fallida' end, updated_at = now()
  where request_id = v_id and status = 'en_ejecucion';
  if found then perform app.d_audit(case when p_ok then 'solicitud.completada' else 'solicitud.fallida' end, 'correction_request', v_id, 'sistema'); end if;
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- Cierra una eliminación una vez borrado el usuario de Auth: constancia en el ledger (solo el HMAC), la solicitud queda como
-- constancia anónima y se descartan las demás solicitudes del donante. La puede cerrar la técnica o el worker (recuperación).
create function api.finish_deletion(p_request_id uuid, p_subject_hmac text) returns jsonb
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
  delete from app.correction_requests where donor_id = v_request.donor_id and request_id <> p_request_id;
  update app.correction_requests set status = 'completada', donor_id = null, updated_at = now() where request_id = p_request_id;
  perform app.d_audit('solicitud.completada', 'correction_request', p_request_id, 'sistema');
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- Marca una ejecución como fallida (p. ej. AuthAdmin no pudo borrar al usuario). Solo si sigue en ejecución.
create function api.fail_correction_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not (app.is_api_technical() or app.is_worker()) then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_request_id is null then return jsonb_build_object('kind', 'invalid'); end if;
  update app.correction_requests set status = 'fallida', updated_at = now() where request_id = p_request_id and status = 'en_ejecucion';
  if found then
    update app.action_tokens set invalidated_at = now()
    where kind = 'cambio_email' and data ->> 'requestId' = p_request_id::text and consumed_at is null and invalidated_at is null;
    perform app.d_audit('solicitud.fallida', 'correction_request', p_request_id, 'sistema');
  end if;
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- Purgas (worker)
-- ---------------------------------------------------------------------------

-- Hace las purgas que solo tocan la base y devuelve lo que la aplicación debe terminar: cuentas de Auth a borrar
-- (`staleAccounts`: altas asistidas reclamadas e incompletas hace más de 30 días, V8) y eliminaciones a las que solo les
-- falta el ledger (`pendingDeletions`). Idempotente: una segunda ejecución no encuentra nada más.
create function api.worker_purge_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_idempotency int;
  v_tokens int;
  v_rate int;
  v_grants int;
  v_signups int;
  v_requests int;
  v_deletions int;
  v_stale jsonb;
  v_pending jsonb;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;

  -- RNF-REL-02: 72 h tras el estado terminal (una clave abandonada en curso también se descarta a las 72 h).
  delete from app.idempotency_records
  where terminal_at <= now() - interval '72 hours' or (terminal_at is null and created_at <= now() - interval '72 hours');
  get diagnostics v_idempotency = row_count;
  delete from app.action_tokens where expires_at <= now() - interval '24 hours';
  get diagnostics v_tokens = row_count;
  delete from app.rate_limit_events where occurred_at <= now() - interval '1 day';
  get diagnostics v_rate = row_count;
  delete from app.access_grants where expires_at <= now() - interval '1 day';
  get diagnostics v_grants = row_count;
  -- Altas asistidas sin reclamar (correo y nombre) pasado su purge_at; las reclamadas e incompletas, cuando su cuenta ya no existe.
  delete from app.assisted_signups s
  where (s.status in ('pendiente', 'vencida') and s.purge_at <= now())
     or (s.status = 'reclamada_incompleta' and not exists (select 1 from app.donor_profiles p where p.donor_id = s.donor_id));
  get diagnostics v_signups = row_count;

  -- Cambio de correo que no llegó a buen puerto: sin enlace emitido a tiempo, enlace vencido o anulado, o consumido sin cierre.
  update app.correction_requests r set status = 'fallida', updated_at = now()
  where r.status = 'en_ejecucion' and r.type = 'correccion' and 'email' = any (r.requested_fields)
    and (
      exists (select 1 from app.action_tokens t where t.kind = 'cambio_email' and t.data ->> 'requestId' = r.request_id::text
              and t.consumed_at is null and (t.invalidated_at is not null or t.expires_at <= now()))
      or (not exists (select 1 from app.action_tokens t where t.kind = 'cambio_email' and t.data ->> 'requestId' = r.request_id::text)
          and r.updated_at <= now() - interval '15 minutes')
      or (exists (select 1 from app.action_tokens t where t.kind = 'cambio_email' and t.data ->> 'requestId' = r.request_id::text and t.consumed_at is not null)
          and r.updated_at <= now() - interval '1 hour'));
  get diagnostics v_requests = row_count;
  -- Eliminación que quedó a medias: con el usuario aún vivo se da por fallida; sin él, solo falta el ledger.
  update app.correction_requests r set status = 'fallida', updated_at = now()
  where r.status = 'en_ejecucion' and r.type = 'eliminacion' and r.updated_at <= now() - interval '15 minutes'
    and exists (select 1 from app.donor_profiles p where p.donor_id = r.donor_id);
  get diagnostics v_deletions = row_count;
  v_requests := v_requests + v_deletions;

  select coalesce(jsonb_agg(s.donor_id), '[]'::jsonb) into v_stale
  from (select donor_id from app.assisted_signups
        where status = 'reclamada_incompleta' and created_at <= now() - interval '30 days'
          and exists (select 1 from app.donor_profiles p where p.donor_id = assisted_signups.donor_id)
        order by created_at limit 50) s;
  select coalesce(jsonb_agg(jsonb_build_object('requestId', r.request_id, 'donorId', r.donor_id)), '[]'::jsonb) into v_pending
  from (select request_id, donor_id from app.correction_requests
        where status = 'en_ejecucion' and type = 'eliminacion' and updated_at <= now() - interval '15 minutes'
          and not exists (select 1 from app.donor_profiles p where p.donor_id = correction_requests.donor_id)
        order by updated_at limit 50) r;

  return jsonb_build_object('kind', 'ok', 'purged', jsonb_build_object(
      'idempotencyRecords', v_idempotency, 'actionTokens', v_tokens, 'rateLimitEvents', v_rate, 'accessGrants', v_grants, 'assistedSignups', v_signups),
    'failedRequests', v_requests, 'staleAccounts', v_stale, 'pendingDeletions', v_pending);
end;
$$;

-- ---------------------------------------------------------------------------
-- Propiedad y privilegios
-- ---------------------------------------------------------------------------

alter function api.execute_correction_request(text, text, uuid, uuid) owner to app_privileged;
alter function api.get_execution_subject(uuid) owner to app_privileged;
alter function api.issue_email_change(uuid, text, text, uuid, text) owner to app_privileged;
alter function api.finish_email_change(text, boolean) owner to app_privileged;
alter function api.finish_deletion(uuid, text) owner to app_privileged;
alter function api.fail_correction_request(uuid) owner to app_privileged;
alter function api.worker_purge_expired() owner to app_privileged;

grant execute on function app.request_json(uuid, text, text[], text, text, timestamptz, timestamptz) to app_privileged;

revoke all on function
  api.execute_correction_request(text, text, uuid, uuid), api.get_execution_subject(uuid), api.issue_email_change(uuid, text, text, uuid, text),
  api.finish_email_change(text, boolean), api.finish_deletion(uuid, text), api.fail_correction_request(uuid), api.worker_purge_expired()
from public, anon;
grant execute on function
  api.execute_correction_request(text, text, uuid, uuid), api.get_execution_subject(uuid), api.issue_email_change(uuid, text, text, uuid, text),
  api.finish_email_change(text, boolean), api.finish_deletion(uuid, text), api.fail_correction_request(uuid), api.worker_purge_expired()
to authenticated;

insert into app.schema_version (version) values ('20261020010000');
