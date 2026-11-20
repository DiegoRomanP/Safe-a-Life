-- invitation-coordination (F6-3b): lecturas propias del donante, cambio de respuesta por sesión, historial y reintento manual de
-- entrega. Contrato: docs/plans/2026-10-22-f6-contrato-reconciliado.md §2.3; ADR-003 ítems 7, 14 y 15 (H1: el reintento va en dos
-- pasos como el lote: el superadmin autoriza, la sesión técnica ejecuta con hashes y payload que prepara la aplicación).
-- Todas las DEFINER son propiedad de app_privileged, con search_path vacío y EXECUTE solo para authenticated.
-- Orden de bloqueos (D3): necesidad -> invitaciones (order by invitation_id) -> outbox (order by outbox_id); toda espera antes del claim.
--
-- Decisiones que el contrato no fija (constan aquí para la revisión):
--  1. El reintento usa su propia tabla de concesiones (`app.invitation_retry_grants`), con las mismas reglas que la del lote.
--  2. Fallos de la concesión del reintento: `forbidden` (así lo dice §2.3); en el lote son `not_found`.
--  3. `instructions` sin texto público de la sede usa el texto neutral de la spec (pendiente de ratificación clínica, C1).
--  4. Cambiar a `confirmada` con la invitación ya invalidada o el donante sin cuenta activa es `conflict`.

create table app.invitation_retry_grants (
  grant_id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references app.invitations (invitation_id),
  superadmin_id uuid not null,
  secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);
-- Una concesión viva por (invitación, superadmin): la nueva sustituye a la anterior.
create unique index invitation_retry_grants_live_uidx on app.invitation_retry_grants (invitation_id, superadmin_id) where consumed_at is null;
create index invitation_retry_grants_created_idx on app.invitation_retry_grants (created_at);
alter table app.invitation_retry_grants enable row level security;
alter table app.invitation_retry_grants force row level security;
grant select, insert, update, delete on app.invitation_retry_grants to app_privileged;
create policy invitation_retry_grants_privileged on app.invitation_retry_grants for all to app_privileged using (true) with check (true);

-- Forma del slot del reintento: {outboxId, confirmHash, rejectHash, sealedPayload}.
create function app.retry_slot_valid(p_slot jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select p_slot is not null and jsonb_typeof(p_slot) = 'object'
     and (select count(*) from jsonb_object_keys(p_slot)) = 4
     and coalesce(p_slot ->> 'outboxId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and coalesce(p_slot ->> 'confirmHash', '') ~ '^[0-9a-f]{64}$'
     and coalesce(p_slot ->> 'rejectHash', '') ~ '^[0-9a-f]{64}$'
     and (p_slot ->> 'confirmHash') <> (p_slot ->> 'rejectHash')
     and jsonb_typeof(p_slot -> 'sealedPayload') = 'string'
     and char_length(p_slot ->> 'sealedPayload') between 1 and 16384
$$;
grant execute on function app.retry_slot_valid(jsonb) to app_privileged;

-- Texto neutral cuando la sede no publica instrucciones (la spec lo marca «a ratificar»).
create function app.neutral_invitation_instructions() returns text
language sql immutable set search_path = '' as $$
  select 'Preséntate en la sede indicada antes del plazo. El personal de salud verificará tu grupo y tu aptitud.'::text
$$;
grant execute on function app.neutral_invitation_instructions() to app_privileged;

-- Proyección de una invitación para el donante (InvitationListItem). Solo la lista positiva de campos: ni hashes, ni `donor_id`,
-- ni `need_donor_code`.
create function app.invitation_item(p_inv app.invitations, p_need app.needs) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'invitationId', p_inv.invitation_id,
    'hospitalName', h.public_name,
    'publicSiteName', s.public_name,
    'requiredBloodType', p_need.required_blood_type,
    'urgency', p_need.urgency,
    'instructions', coalesce(nullif(s.public_instructions, ''), app.neutral_invitation_instructions()),
    'expiresAt', app.iso(p_need.expires_at),
    'validity', case when p_inv.validity = 'activa' and now() >= p_need.expires_at then 'vencida' else p_inv.validity end,
    'delivery', p_inv.delivery,
    'response', p_inv.response)
  from app.hospitals h
  join app.sites s on s.site_id = p_need.site_id
  where h.hospital_id = p_need.hospital_id
$$;
grant execute on function app.invitation_item(app.invitations, app.needs) to app_privileged;

-- ---------------------------------------------------------------------------
-- Lecturas propias del donante (ADR-003 ítem 14)
-- ---------------------------------------------------------------------------

create function api.list_own_invitations(
  p_limit int, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_fail text;
  v_items jsonb;
  v_next jsonb;
begin
  v_fail := app.d_require('{donante}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_limit is null or p_limit not between 1 and 100 or (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  with page as (
    select i.created_at, i.invitation_id, app.invitation_item(i, n) as j,
           row_number() over (order by i.created_at desc, i.invitation_id desc) as rn
    from app.invitations i
    join app.needs n on n.need_id = i.need_id
    where i.donor_id = app.jwt_sub()
      and (p_cursor_created_at is null or (i.created_at, i.invitation_id) < (p_cursor_created_at, p_cursor_id))
    order by i.created_at desc, i.invitation_id desc
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('createdAt', app.iso(p.created_at), 'id', p.invitation_id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;
  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

-- Una invitación ajena es indistinguible de una inexistente (404).
create function api.get_own_invitation(p_invitation_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fail text;
  v_inv app.invitations;
  v_need app.needs;
  v_item jsonb;
begin
  v_fail := app.d_require('{donante}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_invitation_id is null then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_inv from app.invitations where invitation_id = p_invitation_id and donor_id = app.jwt_sub();
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  select * into v_need from app.needs where need_id = v_inv.need_id;
  v_item := app.invitation_item(v_inv, v_need);
  return jsonb_build_object('kind', 'ok', 'invitation', v_item, 'instructions', v_item ->> 'instructions');
end;
$$;

-- INVOKER: la RLS de invitation_response_history limita las filas a las del propio donante.
create function api.list_own_response_history(
  p_limit int, p_cursor_changed_at timestamptz default null, p_cursor_id bigint default null
) returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_items jsonb;
  v_next jsonb;
begin
  v_fail := app.require('{donante}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_limit is null or p_limit not between 1 and 100 or (p_cursor_changed_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  with page as (
    select h.changed_at, h.id,
           jsonb_build_object('invitationId', h.invitation_id, 'response', h.response, 'changedAt', app.iso(h.changed_at)) as j,
           row_number() over (order by h.changed_at desc, h.id desc) as rn
    from app.invitation_response_history h
    where h.donor_id = (select auth.uid())
      and (p_cursor_changed_at is null or (h.changed_at, h.id) < (p_cursor_changed_at, p_cursor_id))
    order by h.changed_at desc, h.id desc
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('changedAt', app.iso(p.changed_at), 'id', p.id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;
  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cambio de respuesta por sesión (ADR-003 ítem 7)
-- ---------------------------------------------------------------------------

-- La respuesta inicial es solo por token: con `sin_respuesta` aquí es `conflict`. Confirmar con la meta alcanzada es `conflict`
-- (V6). Confirmar la última plaza dispara la cascada RF-INV-05; pasar de `confirmada` a `rechazada` con la necesidad en
-- `meta_alcanzada` y el conteo bajo la meta la devuelve a `activa`, sin lote nuevo ni revalidar (RF-INV-06).
create function api.change_own_invitation_response(p_key text, p_hash text, p_invitation_id uuid, p_response text) returns jsonb
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

  if app.need_status(v_need) not in ('activa', 'meta_alcanzada') or v_inv.response = 'sin_respuesta' or v_inv.validity <> 'activa' then
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

-- ---------------------------------------------------------------------------
-- Reintento manual de entrega (ADR-003 ítem 15, en dos pasos)
-- ---------------------------------------------------------------------------

-- Paso 1 (sesión del superadmin: AAL2 y step-up vigente): emite una concesión de un solo uso (≤ 2 min) ligada a la invitación.
create function api.authorize_invitation_retry(p_invitation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_secret text;
  v_expires timestamptz := now() + interval '2 minutes';
begin
  v_fail := app.d_require('{superadmin}', true, true);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_invitation_id is null then return jsonb_build_object('kind', 'invalid'); end if;
  -- Sin bloqueos de espera: solo comprueba que existe.
  if not exists (select 1 from app.invitations where invitation_id = p_invitation_id) then
    return jsonb_build_object('kind', 'not_found');
  end if;
  delete from app.invitation_retry_grants where invitation_id = p_invitation_id and superadmin_id = app.jwt_sub() and consumed_at is null;
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into app.invitation_retry_grants (invitation_id, superadmin_id, secret_hash, expires_at)
  values (p_invitation_id, app.jwt_sub(), encode(extensions.digest(v_secret, 'sha256'), 'hex'), v_expires);
  perform app.d_audit('entrega.reintento_autorizado', 'invitation', p_invitation_id, 'usuario');
  return jsonb_build_object('kind', 'ok', 'grantSecret', v_secret, 'expiresAt', app.iso(v_expires));
end;
$$;

-- Paso 2 (solo la sesión técnica): consume la concesión y rehace el envío con hashes y payload nuevos. Un replay con la misma clave
-- devuelve lo guardado sin exigir ni consumir otra concesión.
create function api.retry_invitation_delivery(p_key text, p_hash text, p_invitation_id uuid, p_grant text, p_slot jsonb) returns jsonb
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
     or v_inv.donor_id is null or not exists (select 1 from app.donor_profiles p where p.donor_id = v_inv.donor_id) then
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

-- ---------------------------------------------------------------------------
-- Propiedad y privilegios
-- ---------------------------------------------------------------------------

alter function api.list_own_invitations(int, timestamptz, uuid) owner to app_privileged;
alter function api.get_own_invitation(uuid) owner to app_privileged;
alter function api.change_own_invitation_response(text, text, uuid, text) owner to app_privileged;
alter function api.authorize_invitation_retry(uuid) owner to app_privileged;
alter function api.retry_invitation_delivery(text, text, uuid, text, jsonb) owner to app_privileged;

revoke all on function api.list_own_invitations(int, timestamptz, uuid), api.get_own_invitation(uuid), api.list_own_response_history(int, timestamptz, bigint),
  api.change_own_invitation_response(text, text, uuid, text), api.authorize_invitation_retry(uuid),
  api.retry_invitation_delivery(text, text, uuid, text, jsonb) from public, anon, service_role;
grant execute on function api.list_own_invitations(int, timestamptz, uuid), api.get_own_invitation(uuid), api.list_own_response_history(int, timestamptz, bigint),
  api.change_own_invitation_response(text, text, uuid, text), api.authorize_invitation_retry(uuid),
  api.retry_invitation_delivery(text, text, uuid, text, jsonb) to authenticated;

insert into app.schema_version (version) values ('20261022040000');
