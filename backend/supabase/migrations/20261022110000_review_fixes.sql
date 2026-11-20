-- Revisión de código del 2026-11-20 sobre F6. Rehace, con el mismo propietario (app_privileged), DEFINER, search_path y
-- concesiones, funciones de 20261022030000, 20261022040000, 20261022090000 y 20261022100000:
--  * authorize_invitation_batch recibe la clave y el hash de idempotencia: un replay de un lote ya creado devuelve lo guardado
--    antes del tope y del estado (antes recibía 429/409) y no emite ni audita otra concesión.
--  * request_invitation_batch revalida el tope de 20 lotes por hora bajo el lock global de cuota (varias concesiones vivas lo
--    superaban). Índice (requested_by, created_at) para ese conteo.
--  * get_invitation_action_preview y retry_invitation_delivery exigen el perfil 'activo' como la respuesta por token; el
--    reintento además rechaza (409) al donante con eliminación en ejecución.
--  * change_own_invitation_response vuelve a permitir retirar una confirmación con el perfil no activo; solo confirmar lo exige.
-- Hoy ningún flujo saca un perfil de 'activo' (guard_donor_profile lo impide y no existe el estado 'suspendido'): la condición
-- de perfil activo es defensa en profundidad; la de eliminación en ejecución sí es alcanzable.

drop function api.authorize_invitation_batch(uuid);
create or replace function api.authorize_invitation_batch(p_need_id uuid, p_key text default null, p_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_hospital uuid;
  v_need app.needs;
  v_secret text;
  v_expires timestamptz := now() + interval '2 minutes';
begin
  v_fail := app.d_require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.d_admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_need_id is null then return jsonb_build_object('kind', 'invalid'); end if;
  -- Un replay de un lote ya creado devuelve lo guardado antes del tope y del estado, sin emitir ni auditar otra concesión.
  if p_key is not null then
    v_claim := app.peek_idempotency('user:' || app.jwt_sub()::text, 'requestInvitationBatch', p_key, p_hash);
    if v_claim is not null then return v_claim; end if;
  end if;

  -- Una necesidad ajena es indistinguible de una inexistente (sin IDOR).
  select * into v_need from app.needs where need_id = p_need_id and hospital_id = v_hospital for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if app.need_status(v_need) <> 'activa' or not exists (
       select 1 from app.sites s where s.site_id = v_need.site_id and s.hospital_id = v_hospital and s.is_active and s.is_approved) then
    return jsonb_build_object('kind', 'conflict');
  end if;

  -- Tope por admin (revisión F6, L-5): 20 lotes por hora, contados sobre lotes reales.
  if (select count(*) from app.invitation_batches b where b.requested_by = app.jwt_sub() and b.created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('kind', 'rate_limited');
  end if;

  delete from app.invitation_batch_grants where need_id = p_need_id and admin_id = app.jwt_sub() and consumed_at is null;
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into app.invitation_batch_grants (need_id, hospital_id, admin_id, secret_hash, expires_at)
  values (p_need_id, v_hospital, app.jwt_sub(), encode(extensions.digest(v_secret, 'sha256'), 'hex'), v_expires);
  perform app.d_audit('lote.autorizado', 'need', p_need_id, 'usuario');
  return jsonb_build_object('kind', 'ok', 'grantSecret', v_secret, 'expiresAt', app.iso(v_expires));
end;
$$;

create or replace function api.request_invitation_batch(p_key text, p_hash text, p_need_id uuid, p_grant text, p_slots jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_need app.needs;
  v_grant app.invitation_batch_grants;
  v_claim jsonb;
  v_n int;
  v_donors uuid[];
  v_batch uuid := gen_random_uuid();
  v_slot jsonb;
  v_invitation uuid;
  v_i int;
  v_reply jsonb;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;

  if p_key is null or char_length(p_key) not between 16 and 255 or p_need_id is null
     or p_grant is null or p_grant !~ '^[0-9a-f]{64}$'
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('needId', p_need_id::text)))
     or not app.invitation_slots_valid(p_slots) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  -- Orden D3: necesidad -> concesión; toda espera antes del claim.
  select * into v_need from app.needs where need_id = p_need_id for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  select * into v_grant from app.invitation_batch_grants
  where need_id = p_need_id and secret_hash = encode(extensions.digest(p_grant, 'sha256'), 'hex') for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  -- La idempotencia es del admin que autorizó (y no de la sesión técnica compartida).
  v_claim := app.peek_idempotency('user:' || v_grant.admin_id::text, 'requestInvitationBatch', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  if v_grant.consumed_at is not null or v_grant.expires_at <= now() or v_grant.hospital_id <> v_need.hospital_id
     or not exists (
       select 1 from app.hospital_memberships m
       join app.hospitals h on h.hospital_id = m.hospital_id
       join app.user_accounts ua on ua.user_id = m.user_id
       where m.user_id = v_grant.admin_id and m.hospital_id = v_need.hospital_id and m.status = 'activa' and h.is_authorized
         and ua.role = 'admin_hospitalario') then
    return jsonb_build_object('kind', 'not_found');
  end if;

  -- O9: la sede debe seguir activa y aprobada (mismo criterio que activar la necesidad).
  if app.need_status(v_need) <> 'activa' or not exists (
       select 1 from app.sites s where s.site_id = v_need.site_id and s.hospital_id = v_need.hospital_id and s.is_active and s.is_approved) then
    return jsonb_build_object('kind', 'conflict');
  end if;
  -- batchSize(meta) = min(50, max(5, 2 * meta)) (batch-size.ts)
  v_n := least(50, greatest(5, 2 * v_need.target_confirmations));
  if jsonb_array_length(p_slots) <> v_n then return jsonb_build_object('kind', 'invalid'); end if;

  -- Cuota 3/24 h global: un único lock, tras la necesidad y antes del claim (D3 regla 1).
  perform pg_advisory_xact_lock(hashtextextended('invitation-quota', 0));
  -- Tope por admin (L-5) revalidado bajo el lock global: varias concesiones vivas no lo superan.
  if (select count(*) from app.invitation_batches b where b.requested_by = v_grant.admin_id and b.created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('kind', 'rate_limited');
  end if;

  v_claim := app.claim_idempotency('user:' || v_grant.admin_id::text, 'requestInvitationBatch', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;
  update app.invitation_batch_grants set consumed_at = now() where grant_id = v_grant.grant_id;

  -- Candidatos: matriz RBC, polígono, radio (el borde se incluye), disponibilidad, perfil completo, sin invitación previa a esta
  -- necesidad y con menos de 3 invitaciones en (t-24 h, t]. Orden: exactas, distancia, donor_id. Urgencia y reconocimientos no
  -- intervienen (RNF-SAF-01, B.3). Las altas asistidas sin reclamar no están `activo`.
  select coalesce(array_agg(t.donor_id order by t.is_exact desc, t.d, t.donor_id), '{}') into v_donors
  from (
    select p.donor_id, c.is_exact, app.haversine_m(p.latitude::double precision, p.longitude::double precision,
                                                  s.latitude::double precision, s.longitude::double precision) as d
    from app.donor_profiles p
    join app.rbc_compatibility c on c.donor = p.declared_blood_type and c.recipient = v_need.required_blood_type
    join app.sites s on s.site_id = v_need.site_id
    where p.status = 'activo' and p.is_available
      and p.location_polygon_version = 'DEMO_ONLY-1' and app.in_lima_demo_1(p.latitude, p.longitude)
      and exists (select 1 from app.user_accounts ua where ua.user_id = p.donor_id and ua.role = 'donante')
      and app.haversine_m(p.latitude::double precision, p.longitude::double precision,
                          s.latitude::double precision, s.longitude::double precision) <= v_need.radius_km * 1000::double precision
      and not exists (select 1 from app.invitations i where i.need_id = v_need.need_id and i.donor_id = p.donor_id)
      and not exists (select 1 from app.correction_requests r where r.donor_id = p.donor_id and r.type = 'eliminacion' and r.status = 'en_ejecucion')
      and (select count(*) from app.invitations i where i.donor_id = p.donor_id and i.created_at > now() - interval '24 hours') < 3
    order by c.is_exact desc, d, p.donor_id
    limit v_n
  ) t;

  insert into app.invitation_batches (batch_id, need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
  values (v_batch, v_need.need_id, v_need.hospital_id, v_grant.admin_id, coalesce(cardinality(v_donors), 0), coalesce(cardinality(v_donors), 0));

  -- Slot i <-> candidato i; los slots sobrantes se descartan. El outbox va antes: invitations.current_outbox_id lo referencia.
  for v_i in 1 .. coalesce(cardinality(v_donors), 0) loop
    v_slot := p_slots -> (v_i - 1);
    v_invitation := (v_slot ->> 'invitationId')::uuid;
    perform app.enqueue_email((v_slot ->> 'outboxId')::uuid, 'invitacion', v_invitation, v_donors[v_i], v_slot ->> 'sealedPayload', v_need.expires_at);
    insert into app.invitations (invitation_id, need_id, batch_id, hospital_id, donor_id, need_donor_code, confirm_token_hash, reject_token_hash, current_outbox_id)
    values (v_invitation, v_need.need_id, v_batch, v_need.hospital_id, v_donors[v_i], app.new_need_donor_code(v_need.need_id),
            v_slot ->> 'confirmHash', v_slot ->> 'rejectHash', (v_slot ->> 'outboxId')::uuid);
  end loop;
  -- El actor es el admin que autorizó (la sesión técnica solo ejecuta).
  insert into app.audit_events (actor_id, actor_kind, event, resource_type, resource_id, result, reason)
  values (v_grant.admin_id, 'usuario', 'lote.solicitado', 'invitation_batch', v_batch, 'ok', null);

  v_reply := jsonb_build_object('kind', 'created', 'batchId', v_batch,
    'createdInvitationCount', coalesce(cardinality(v_donors), 0), 'queuedEmailCount', coalesce(cardinality(v_donors), 0));
  perform app.complete_idempotency('user:' || v_grant.admin_id::text, 'requestInvitationBatch', p_key, v_reply);
  return v_reply;
end;
$$;

create or replace function api.get_invitation_action_preview(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_inv app.invitations;
  v_need app.needs;
  v_hospital text;
  v_site text;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_inv from app.invitations where confirm_token_hash = p_token_hash or reject_token_hash = p_token_hash;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  select * into v_need from app.needs where need_id = v_inv.need_id;
  if v_inv.token_consumed_at is not null or v_inv.response <> 'sin_respuesta' or v_inv.validity <> 'activa'
     or app.need_status(v_need) <> 'activa'
     or v_inv.donor_id is null or not exists (select 1 from app.donor_profiles p where p.donor_id = v_inv.donor_id and p.status = 'activo')
     or exists (select 1 from app.correction_requests r where r.donor_id = v_inv.donor_id and r.type = 'eliminacion' and r.status = 'en_ejecucion') then
    return jsonb_build_object('kind', 'gone');
  end if;
  select h.public_name, s.public_name into v_hospital, v_site
  from app.hospitals h join app.sites s on s.site_id = v_need.site_id where h.hospital_id = v_need.hospital_id;
  return jsonb_build_object('kind', 'ok', 'hospitalName', v_hospital, 'publicSiteName', v_site,
    'intendedAction', case when v_inv.confirm_token_hash = p_token_hash then 'confirmar' else 'rechazar' end,
    'expiresAt', app.iso(v_need.expires_at));
end;
$$;

create or replace function api.retry_invitation_delivery(p_key text, p_hash text, p_invitation_id uuid, p_grant text, p_slot jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_found app.invitations;
  v_inv app.invitations;
  v_need app.needs;
  v_grant app.invitation_retry_grants;
  v_claim jsonb;
  v_reply jsonb;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_key is null or char_length(p_key) not between 16 and 255 or p_invitation_id is null
     or p_grant is null or p_grant !~ '^[0-9a-f]{64}$'
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('invitationId', p_invitation_id::text)))
     or not app.retry_slot_valid(p_slot) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_found from app.invitations where invitation_id = p_invitation_id;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  -- Orden D3: necesidad -> invitación -> concesión. No se bloquean filas antiguas del outbox.
  select * into v_need from app.needs where need_id = v_found.need_id for update;
  select * into v_inv from app.invitations where invitation_id = p_invitation_id for update;
  select * into v_grant from app.invitation_retry_grants where secret_hash = encode(extensions.digest(p_grant, 'sha256'), 'hex') for update;
  if not found then return jsonb_build_object('kind', 'forbidden'); end if;

  v_claim := app.peek_idempotency('user:' || v_grant.superadmin_id::text, 'retryInvitationDelivery', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  if v_grant.consumed_at is not null or v_grant.expires_at <= now() or v_grant.invitation_id <> p_invitation_id
     or not exists (select 1 from app.user_accounts ua where ua.user_id = v_grant.superadmin_id and ua.role = 'superadmin') then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  if now() >= v_need.expires_at or app.need_status(v_need) = 'vencida' then return jsonb_build_object('kind', 'gone'); end if;
  if v_need.status <> 'activa' or v_inv.validity <> 'activa' or v_inv.response <> 'sin_respuesta' or v_inv.delivery <> 'fallida'
     or v_inv.donor_id is null or not exists (select 1 from app.donor_profiles p where p.donor_id = v_inv.donor_id and p.status = 'activo')
     or exists (select 1 from app.correction_requests r where r.donor_id = v_inv.donor_id and r.type = 'eliminacion' and r.status = 'en_ejecucion') then
    return jsonb_build_object('kind', 'conflict');
  end if;

  v_claim := app.claim_idempotency('user:' || v_grant.superadmin_id::text, 'retryInvitationDelivery', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;
  update app.invitation_retry_grants set consumed_at = now() where grant_id = v_grant.grant_id;

  -- Hashes nuevos: los enlaces anteriores pasan a 404. El reintento no cuenta para la cuota (no crea invitación).
  perform app.enqueue_email((p_slot ->> 'outboxId')::uuid, 'invitacion', v_inv.invitation_id, v_inv.donor_id, p_slot ->> 'sealedPayload', v_need.expires_at);
  update app.invitations
     set confirm_token_hash = p_slot ->> 'confirmHash', reject_token_hash = p_slot ->> 'rejectHash',
         current_outbox_id = (p_slot ->> 'outboxId')::uuid, delivery = 'pendiente', token_consumed_at = null
   where invitation_id = v_inv.invitation_id;
  insert into app.audit_events (actor_id, actor_kind, event, resource_type, resource_id, result, reason)
  values (v_grant.superadmin_id, 'usuario', 'entrega.reintento_manual', 'invitation', v_inv.invitation_id, 'ok', null);

  v_reply := jsonb_build_object('kind', 'accepted');
  perform app.complete_idempotency('user:' || v_grant.superadmin_id::text, 'retryInvitationDelivery', p_key, v_reply);
  return v_reply;
end;
$$;

create or replace function api.change_own_invitation_response(p_key text, p_hash text, p_invitation_id uuid, p_response text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_found app.invitations;
  v_inv app.invitations;
  v_need app.needs;
  v_claim jsonb;
  v_cascade boolean;
  v_reopen boolean;
  v_recorded timestamptz;
  v_reply jsonb;
  v_uid uuid := app.jwt_sub();
begin
  v_fail := app.d_require('{donante}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_key is null or char_length(p_key) not between 16 and 255 or p_invitation_id is null or p_response is null
     or p_response not in ('confirmada', 'rechazada')
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('invitationId', p_invitation_id::text), jsonb_build_array('response', p_response))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_found from app.invitations where invitation_id = p_invitation_id and donor_id = v_uid;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  -- Orden D3: necesidad -> invitación. Con la invitación bloqueada se revalida el dueño (V15 pudo anonimizarla).
  select * into v_need from app.needs where need_id = v_found.need_id for update;
  select * into v_inv from app.invitations where invitation_id = v_found.invitation_id for update;
  if v_inv.donor_id is distinct from v_uid then return jsonb_build_object('kind', 'not_found'); end if;

  v_claim := app.peek_idempotency('user:' || v_uid::text, 'changeOwnInvitationResponse', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  if app.need_status(v_need) not in ('activa', 'meta_alcanzada') or v_inv.response = 'sin_respuesta' or v_inv.validity <> 'activa'
     or (p_response = 'confirmada' and not exists (select 1 from app.donor_profiles p where p.donor_id = v_uid and p.status = 'activo')) then
    return jsonb_build_object('kind', 'conflict');
  end if;
  -- Retirar una confirmación siempre se permite (RF-INV-06): solo confirmar exige el perfil activo.
  -- Mismo valor: éxito sin historial ni auditoría.
  if v_inv.response = p_response then
    return jsonb_build_object('kind', 'ok', 'response', v_inv.response, 'recordedAt', app.iso(v_inv.response_recorded_at),
      'needStatus', app.need_status(v_need));
  end if;
  if p_response = 'confirmada' and v_need.status = 'meta_alcanzada' then return jsonb_build_object('kind', 'conflict'); end if;

  v_cascade := p_response = 'confirmada'
    and (select count(*) from app.invitations i where i.need_id = v_need.need_id and i.response = 'confirmada') + 1 >= v_need.target_confirmations;
  if v_cascade then
    perform 1 from app.invitations i where i.need_id = v_need.need_id and i.validity = 'activa' and i.response = 'sin_respuesta'
      order by i.invitation_id for update;
    perform 1 from app.email_outbox o where o.status = 'pendiente' and o.outbox_id in (
      select i.current_outbox_id from app.invitations i where i.need_id = v_need.need_id and i.validity = 'activa' and i.response = 'sin_respuesta')
      order by o.outbox_id for update;
  end if;

  v_claim := app.claim_idempotency('user:' || v_uid::text, 'changeOwnInvitationResponse', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  v_recorded := now();
  update app.invitations set response = p_response, response_recorded_at = v_recorded where invitation_id = v_inv.invitation_id;
  insert into app.invitation_response_history (invitation_id, donor_id, response, channel) values (v_inv.invitation_id, v_uid, p_response, 'sesion');
  perform app.d_audit('invitacion.respuesta_cambiada', 'invitation', v_inv.invitation_id, 'usuario');

  if v_cascade then
    update app.needs set status = 'meta_alcanzada', updated_at = now(), version = version + 1
    where need_id = v_need.need_id returning * into v_need;
    update app.email_outbox o set status = 'cancelado', sealed_payload = null, finalized_at = now(), lease_until = null
    where o.status = 'pendiente' and o.outbox_id in (
      select i.current_outbox_id from app.invitations i where i.need_id = v_need.need_id and i.validity = 'activa' and i.response = 'sin_respuesta');
    update app.invitations set validity = 'invalidada' where need_id = v_need.need_id and validity = 'activa' and response = 'sin_respuesta';
  end if;

  v_reopen := p_response = 'rechazada' and v_need.status = 'meta_alcanzada'
    and (select count(*) from app.invitations i where i.need_id = v_need.need_id and i.response = 'confirmada') < v_need.target_confirmations;
  if v_reopen then
    update app.needs set status = 'activa', updated_at = now(), version = version + 1
    where need_id = v_need.need_id returning * into v_need;
  end if;

  v_reply := jsonb_build_object('kind', 'ok', 'response', p_response, 'recordedAt', app.iso(v_recorded), 'needStatus', app.need_status(v_need));
  perform app.complete_idempotency('user:' || v_uid::text, 'changeOwnInvitationResponse', p_key, v_reply);
  return v_reply;
end;
$$;

create index invitation_batches_requested_by_idx on app.invitation_batches (requested_by, created_at);

alter function api.authorize_invitation_batch(uuid, text, text) owner to app_privileged;
revoke all on function api.authorize_invitation_batch(uuid, text, text) from public, anon, service_role;
grant execute on function api.authorize_invitation_batch(uuid, text, text) to authenticated;

insert into app.schema_version (version) values ('20261022110000');
