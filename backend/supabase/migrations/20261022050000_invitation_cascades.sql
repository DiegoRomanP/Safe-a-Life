-- invitation-coordination (F6-4a): cascadas sobre las funciones de F3 y F5 y vencimiento de necesidades.
-- Contrato: docs/plans/2026-10-22-f6-contrato-reconciliado.md §5; ADR-003 ítems 7, 8 y 10; D3 (orden de bloqueos: necesidad -> cuota
-- -> invitaciones por invitation_id -> outbox por outbox_id; toda espera de lock antes de claim_idempotency por su lock_timeout).
--
-- Decisiones que el contrato no fija (constan aquí para la revisión):
--  1. Las cascadas solo cancelan el correo `pendiente`; un envío `en_curso` termina su intento (D4, parte F6-4b).
--  2. Al vencer, las invitaciones `activa`/`sin_respuesta` pasan a `vencida` (O4, literal de RF-INV-08); las que ya tienen respuesta
--     conservan su estado. Las lecturas proyectan `vencida` si `now() >= expires_at` aunque el worker no haya corrido.
--  3. `transition_own_need` y `update_own_participation` pasan a DEFINER (sus cascadas escriben el outbox, que solo toca app_privileged).

-- ---------------------------------------------------------------------------
-- Ayudas de cascada
-- ---------------------------------------------------------------------------

-- Bloquea, en el orden canónico, las invitaciones sin respuesta de una necesidad y su correo pendiente (se llama antes del claim).
create function app.lock_need_invitations(p_need_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  perform 1 from app.invitations i where i.need_id = p_need_id and i.validity = 'activa' and i.response = 'sin_respuesta'
    order by i.invitation_id for update;
  perform 1 from app.email_outbox o where o.status = 'pendiente' and o.outbox_id in (
    select i.current_outbox_id from app.invitations i where i.need_id = p_need_id and i.validity = 'activa' and i.response = 'sin_respuesta')
    order by o.outbox_id for update;
end;
$$;

-- Invalida las invitaciones sin respuesta de una necesidad (`invalidada` o `vencida`) y cancela su correo pendiente con el payload
-- destruido (RF-INV-05/08, AP-06). Devuelve cuántas invitaciones cambió.
create function app.invalidate_need_invitations(p_need_id uuid, p_validity text, p_outbox_status text) returns int
language plpgsql set search_path = '' as $$
declare
  v_count int;
begin
  update app.email_outbox o set status = p_outbox_status, sealed_payload = null, finalized_at = now(), lease_until = null
  where o.status = 'pendiente' and o.outbox_id in (
    select i.current_outbox_id from app.invitations i where i.need_id = p_need_id and i.validity = 'activa' and i.response = 'sin_respuesta');
  update app.invitations set validity = p_validity where need_id = p_need_id and validity = 'activa' and response = 'sin_respuesta';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Lo mismo por donante (RF-INV-07): solo las `sin_respuesta`; una confirmación no se toca.
create function app.lock_donor_invitations(p_donor_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  perform 1 from app.invitations i where i.donor_id = p_donor_id and i.validity = 'activa' and i.response = 'sin_respuesta'
    order by i.invitation_id for update;
  perform 1 from app.email_outbox o where o.status = 'pendiente' and o.outbox_id in (
    select i.current_outbox_id from app.invitations i where i.donor_id = p_donor_id and i.validity = 'activa' and i.response = 'sin_respuesta')
    order by o.outbox_id for update;
end;
$$;

create function app.invalidate_donor_invitations(p_donor_id uuid) returns int
language plpgsql set search_path = '' as $$
declare
  v_count int;
begin
  update app.email_outbox o set status = 'cancelado', sealed_payload = null, finalized_at = now(), lease_until = null
  where o.status = 'pendiente' and o.outbox_id in (
    select i.current_outbox_id from app.invitations i where i.donor_id = p_donor_id and i.validity = 'activa' and i.response = 'sin_respuesta');
  update app.invitations set validity = 'invalidada' where donor_id = p_donor_id and validity = 'activa' and response = 'sin_respuesta';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function app.lock_need_invitations(uuid), app.invalidate_need_invitations(uuid, text, text),
  app.lock_donor_invitations(uuid), app.invalidate_donor_invitations(uuid) to app_privileged;

-- ---------------------------------------------------------------------------
-- confirmedIntentCount real (hasta F6 valía 0). INVOKER: la RLS de invitations limita el conteo al hospital del admin; las
-- confirmaciones anonimizadas (V15) siguen contando.
-- ---------------------------------------------------------------------------

create or replace function app.need_json(n app.needs) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'needId', n.need_id, 'component', n.component, 'requiredBloodType', n.required_blood_type,
    'targetConfirmations', n.target_confirmations,
    'confirmedIntentCount', (select count(*)::int from app.invitations i where i.need_id = n.need_id and i.response = 'confirmada'),
    'siteId', n.site_id, 'radiusKm', n.radius_km, 'urgency', n.urgency, 'status', app.need_status(n), 'expiresAt', app.iso(n.expires_at)
  )
$$;

-- ---------------------------------------------------------------------------
-- Transición manual de la necesidad (F3) con cascada RF-INV-08
-- ---------------------------------------------------------------------------

create or replace function api.transition_own_need(p_key text, p_hash text, p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_claim jsonb;
  v_need app.needs;
  v_visible text;
  v_reply jsonb;
begin
  v_fail := app.d_require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.d_admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_key is null or char_length(p_key) not between 16 and 255
     or p_status is null or p_status not in ('activa', 'cerrada', 'cancelada')
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('needId', p_id::text), jsonb_build_array('status', p_status))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_need from app.needs where need_id = p_id and hospital_id = v_hospital for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  v_claim := app.peek_idempotency('user:' || app.jwt_sub()::text, 'transitionOwnHospitalNeed', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  v_visible := app.need_status(v_need);
  if v_visible in ('cerrada', 'cancelada', 'vencida')
     or not ((v_need.status = 'borrador' and p_status in ('activa', 'cancelada'))
          or (v_need.status in ('activa', 'meta_alcanzada') and p_status in ('cerrada', 'cancelada'))) then
    return jsonb_build_object('kind', 'conflict');
  end if;
  -- Activar convoca al matching: la sede debe seguir activa y aprobada (pudo retirarse tras crear el borrador).
  if p_status = 'activa' and not exists (
       select 1 from app.sites s
       where s.site_id = v_need.site_id and s.hospital_id = v_hospital and s.is_active and s.is_approved) then
    return jsonb_build_object('kind', 'conflict');
  end if;

  -- D3: los bloqueos de invitaciones y outbox van antes del claim.
  if p_status in ('cerrada', 'cancelada') then perform app.lock_need_invitations(p_id); end if;

  v_claim := app.claim_idempotency('user:' || app.jwt_sub()::text, 'transitionOwnHospitalNeed', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.needs set status = p_status, updated_at = now(), version = version + 1
  where need_id = p_id
  returning * into v_need;
  if not found then raise exception 'need_update_lost'; end if;
  -- RF-INV-08: cerrar o cancelar invalida las invitaciones sin respuesta y cancela su correo pendiente.
  if p_status in ('cerrada', 'cancelada') then perform app.invalidate_need_invitations(p_id, 'invalidada', 'cancelado'); end if;
  perform app.d_audit('necesidad.transicion', 'need', p_id, 'usuario');

  v_reply := jsonb_build_object('kind', 'ok', 'need', app.need_json(v_need));
  perform app.complete_idempotency('user:' || app.jwt_sub()::text, 'transitionOwnHospitalNeed', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Participación del donante (F5) con el efecto RF-INV-07
-- ---------------------------------------------------------------------------

create or replace function api.update_own_participation(
  p_key text, p_hash text, p_available boolean, p_latitude numeric, p_longitude numeric, p_polygon_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_uid uuid := app.jwt_sub();
  v_claim jsonb;
  v_profile app.donor_profiles;
  v_reply jsonb;
begin
  v_fail := app.d_require('{donante}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_key is null or char_length(p_key) not between 16 and 256
     or (p_available is null and p_latitude is null)
     or (p_latitude is null) <> (p_longitude is null) or (p_latitude is not null and p_polygon_version is null)
     or (p_latitude is not null and (p_polygon_version is distinct from 'DEMO_ONLY-1' or p_latitude <> round(p_latitude, 3)
                                      or p_longitude <> round(p_longitude, 3) or not app.in_lima_demo_1(p_latitude, p_longitude)))
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('isAvailable', p_available), jsonb_build_array('latitude', p_latitude), jsonb_build_array('longitude', p_longitude))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  -- Orden del donante (D3): su perfil -> cuota (solo si se retira) -> sus invitaciones -> outbox. Nunca bloquea `needs`.
  select * into v_profile from app.donor_profiles where donor_id = v_uid for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  v_claim := app.peek_idempotency('user:' || v_uid::text, 'updateOwnDonorParticipation', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;
  if v_profile.status <> 'activo' then return jsonb_build_object('kind', 'conflict'); end if;

  if p_available is false then
    -- Mismo lock que el lote: un lote concurrente no deja invitaciones activas a quien acaba de retirarse (§2.4).
    perform pg_advisory_xact_lock(hashtextextended('invitation-quota', 0));
    perform app.lock_donor_invitations(v_uid);
  end if;

  v_claim := app.claim_idempotency('user:' || v_uid::text, 'updateOwnDonorParticipation', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.donor_profiles
  set is_available = coalesce(p_available, is_available),
      latitude = coalesce(p_latitude, latitude), longitude = coalesce(p_longitude, longitude),
      location_polygon_version = case when p_latitude is null then location_polygon_version else p_polygon_version end,
      updated_at = now()
  where donor_id = v_uid
  returning * into v_profile;
  if not found then raise exception 'profile_update_lost'; end if;
  if p_available is false then perform app.invalidate_donor_invitations(v_uid); end if;
  perform app.d_audit('donante.participacion_actualizada', 'user', v_uid, 'usuario');

  v_reply := jsonb_build_object('kind', 'ok', 'profile', app.profile_json(v_profile, app.jwt_claims() ->> 'email'));
  perform app.complete_idempotency('user:' || v_uid::text, 'updateOwnDonorParticipation', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vencimiento de necesidades (worker, ADR-003 ítem 10)
-- ---------------------------------------------------------------------------

-- Pasa a `vencida` las necesidades no terminales con el plazo cumplido, sus invitaciones sin respuesta a `vencida` y su correo
-- pendiente a `vencido` con el payload destruido. SKIP LOCKED: nunca espera a una transición o a una respuesta en curso.
create function api.worker_expire_needs(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_need app.needs;
  v_needs int := 0;
  v_invitations int := 0;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('kind', 'invalid'); end if;

  for v_need in
    select * from app.needs
    where status in ('borrador', 'activa', 'meta_alcanzada') and expires_at <= now()
    order by need_id for update skip locked limit p_limit
  loop
    perform app.lock_need_invitations(v_need.need_id);
    update app.needs set status = 'vencida', updated_at = now(), version = version + 1 where need_id = v_need.need_id;
    v_invitations := v_invitations + app.invalidate_need_invitations(v_need.need_id, 'vencida', 'vencido');
    v_needs := v_needs + 1;
  end loop;
  return jsonb_build_object('kind', 'ok', 'needs', v_needs, 'invitations', v_invitations);
end;
$$;

-- ---------------------------------------------------------------------------
-- Propiedad y privilegios
-- ---------------------------------------------------------------------------

alter function api.transition_own_need(text, text, uuid, text) owner to app_privileged;
alter function api.update_own_participation(text, text, boolean, numeric, numeric, text) owner to app_privileged;
alter function api.worker_expire_needs(int) owner to app_privileged;

revoke all on function api.worker_expire_needs(int) from public, anon, service_role;
grant execute on function api.worker_expire_needs(int) to authenticated;

insert into app.schema_version (version) values ('20261022050000');
