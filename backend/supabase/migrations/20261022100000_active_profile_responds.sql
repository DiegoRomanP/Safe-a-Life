-- Revisión F6 (L-2): responder por token o cambiar la respuesta por sesión exige que el perfil del donante siga `activo`
-- (un perfil no activo no responde; ver 20261022110000: hoy ningún flujo saca un perfil de activo). create or replace de las funciones de 20261022030000 y 20261022040000:
-- mismo propietario (app_privileged), DEFINER, search_path y concesiones.

create or replace function api.respond_invitation_by_token(p_token_hash text, p_key text, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_found app.invitations;
  v_inv app.invitations;
  v_need app.needs;
  v_action text;
  v_claim jsonb;
  v_response text;
  v_cascade boolean;
  v_recorded timestamptz;
  v_reply jsonb;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_key is null or char_length(p_key) not between 16 and 255
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('tokenHash', p_token_hash))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_found from app.invitations where confirm_token_hash = p_token_hash or reject_token_hash = p_token_hash;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  -- Orden D3: necesidad -> invitación. Con la invitación bloqueada se revalida el hash (pudo rotar entretanto).
  select * into v_need from app.needs where need_id = v_found.need_id for update;
  select * into v_inv from app.invitations where invitation_id = v_found.invitation_id for update;
  v_action := case when v_inv.confirm_token_hash = p_token_hash then 'confirmar' when v_inv.reject_token_hash = p_token_hash then 'rechazar' end;
  if v_action is null then return jsonb_build_object('kind', 'not_found'); end if;

  -- RF-INV-08: vencida o terminal es 410 también para la repetición con la misma clave.
  if app.need_status(v_need) not in ('activa', 'meta_alcanzada') then return jsonb_build_object('kind', 'gone'); end if;

  v_claim := app.peek_idempotency('token:' || p_token_hash, 'recordInitialInvitationResponse', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  if v_inv.token_consumed_at is not null or v_inv.response <> 'sin_respuesta' then return jsonb_build_object('kind', 'gone'); end if;
  if v_inv.donor_id is null or not exists (select 1 from app.donor_profiles p where p.donor_id = v_inv.donor_id and p.status = 'activo')
     or exists (select 1 from app.correction_requests r where r.donor_id = v_inv.donor_id and r.type = 'eliminacion' and r.status = 'en_ejecucion') then
    return jsonb_build_object('kind', 'gone');
  end if;
  if v_need.status = 'meta_alcanzada' then
    return jsonb_build_object('kind', case when v_action = 'confirmar' then 'conflict' else 'gone' end);
  end if;
  if v_inv.validity <> 'activa' then return jsonb_build_object('kind', 'gone'); end if;

  -- D3 reglas 3 y 4: toda espera de lock va antes del claim (su lock_timeout de 2 s). Las confirmaciones solo cambian bajo el
  -- lock de la necesidad, que ya tenemos: se decide aquí si esta alcanza la meta y se bloquean antes invitaciones y outbox.
  v_cascade := v_action = 'confirmar'
    and (select count(*) from app.invitations i where i.need_id = v_need.need_id and i.response = 'confirmada') + 1 >= v_need.target_confirmations;
  if v_cascade then
    perform 1 from app.invitations i where i.need_id = v_need.need_id and i.validity = 'activa' and i.response = 'sin_respuesta'
      order by i.invitation_id for update;
    perform 1 from app.email_outbox o where o.status = 'pendiente' and o.outbox_id in (
      select i.current_outbox_id from app.invitations i where i.need_id = v_need.need_id and i.validity = 'activa' and i.response = 'sin_respuesta')
      order by o.outbox_id for update;
  end if;

  v_claim := app.claim_idempotency('token:' || p_token_hash, 'recordInitialInvitationResponse', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  v_response := case when v_action = 'confirmar' then 'confirmada' else 'rechazada' end;
  v_recorded := now();
  update app.invitations set response = v_response, response_recorded_at = v_recorded, token_consumed_at = v_recorded
  where invitation_id = v_inv.invitation_id;
  insert into app.invitation_response_history (invitation_id, donor_id, response, channel)
  values (v_inv.invitation_id, v_inv.donor_id, v_response, 'token');
  perform app.d_audit('invitacion.respondida', 'invitation', v_inv.invitation_id, 'token');

  -- RF-INV-05: la meta alcanzada invalida, en la misma transacción, las invitaciones sin respuesta y cancela su correo pendiente.
  if v_cascade then
    update app.needs set status = 'meta_alcanzada', updated_at = now(), version = version + 1
    where need_id = v_need.need_id returning * into v_need;
    update app.email_outbox o set status = 'cancelado', sealed_payload = null, finalized_at = now(), lease_until = null
    where o.status = 'pendiente' and o.outbox_id in (
      select i.current_outbox_id from app.invitations i where i.need_id = v_need.need_id and i.validity = 'activa' and i.response = 'sin_respuesta');
    update app.invitations set validity = 'invalidada' where need_id = v_need.need_id and validity = 'activa' and response = 'sin_respuesta';
  end if;

  v_reply := jsonb_build_object('kind', 'ok', 'response', v_response, 'recordedAt', app.iso(v_recorded), 'needStatus', app.need_status(v_need));
  perform app.complete_idempotency('token:' || p_token_hash, 'recordInitialInvitationResponse', p_key, v_reply);
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
     or not exists (select 1 from app.donor_profiles p where p.donor_id = v_uid and p.status = 'activo') then
    return jsonb_build_object('kind', 'conflict');
  end if;
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

insert into app.schema_version (version) values ('20261022100000');
