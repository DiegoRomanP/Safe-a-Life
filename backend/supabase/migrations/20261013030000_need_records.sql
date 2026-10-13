-- need-records (F3): necesidades de sangre del hospital (borrador, listado, consulta y transición manual).
-- Todas las RPC son SECURITY INVOKER (ADR-003). Convención: jsonb {"kind": ...}; los rechazos ocurren
-- antes de reclamar la clave de idempotencia; las operaciones que dependen del estado usan
-- FOR UPDATE → peek → comprobación de estado → claim.

-- Una sede pertenece a un solo hospital: la clave compuesta permite que la necesidad apunte a
-- (sede, hospital) y la base impida una sede ajena aunque falle una política.
alter table app.sites add constraint sites_site_hospital_key unique (site_id, hospital_id);

create table app.needs (
  need_id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references app.hospitals (hospital_id),
  site_id uuid not null,
  created_by uuid not null,
  component text not null check (component = 'RBC'),
  required_blood_type text not null
    check (required_blood_type in ('O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS')),
  target_confirmations int not null check (target_confirmations between 1 and 50),
  radius_km int not null check (radius_km between 1 and 50),
  urgency text not null check (urgency in ('Normal', 'Urgente', 'Critica')),
  status text not null default 'borrador'
    check (status in ('borrador', 'activa', 'meta_alcanzada', 'cerrada', 'cancelada', 'vencida')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz,
  version int not null default 0,
  check (expires_at > created_at),
  foreign key (site_id, hospital_id) references app.sites (site_id, hospital_id)
);
create index needs_hospital_created_idx on app.needs (hospital_id, created_at, need_id);
create index needs_status_expires_idx on app.needs (status, expires_at);

alter table app.needs enable row level security;
alter table app.needs force row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Hospital del admin autenticado: rol admin, AAL2, membresía activa y hospital autorizado; si no, null.
create function app.admin_hospital_id() returns uuid
language sql stable set search_path = '' as $$
  select h.hospital_id
  from app.hospitals h
  where h.hospital_id = app.member_hospital_id()
    and h.is_authorized
    and app.current_actor_role() = 'admin_hospitalario'
    and app.current_aal() = 'aal2'
$$;

-- Estado visible: un estado no terminal cuyo plazo ya pasó se proyecta como «vencida» (también un borrador).
create function app.need_status(n app.needs) returns text
language sql stable set search_path = '' as $$
  select case
    when n.status in ('cerrada', 'cancelada', 'vencida') then n.status
    when now() >= n.expires_at then 'vencida'
    else n.status
  end
$$;

-- Los diez campos públicos. confirmedIntentCount vale 0 hasta F6 (invitaciones).
create function app.need_json(n app.needs) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'needId', n.need_id, 'component', n.component, 'requiredBloodType', n.required_blood_type,
    'targetConfirmations', n.target_confirmations, 'confirmedIntentCount', 0, 'siteId', n.site_id,
    'radiusKm', n.radius_km, 'urgency', n.urgency, 'status', app.need_status(n), 'expiresAt', app.iso(n.expires_at)
  )
$$;

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------

grant select on app.needs to authenticated;
grant insert (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations,
              radius_km, urgency, expires_at) on app.needs to authenticated;
grant update (status, updated_at, version) on app.needs to authenticated;
grant select, insert, update, delete on app.needs to app_privileged;

create policy needs_admin_select on app.needs
  for select to authenticated using (hospital_id = app.admin_hospital_id());
create policy needs_admin_insert on app.needs
  for insert to authenticated with check (
    hospital_id = app.admin_hospital_id()
    and created_by = (select auth.uid())
    and exists (
      select 1 from app.sites s
      where s.site_id = needs.site_id and s.hospital_id = needs.hospital_id and s.is_active and s.is_approved
    )
  );
create policy needs_admin_update on app.needs
  for update to authenticated
  using (hospital_id = app.admin_hospital_id())
  with check (hospital_id = app.admin_hospital_id());
create policy needs_privileged on app.needs for all to app_privileged using (true) with check (true);

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

-- p_site_id llega como texto: el hash canónico usa el valor literal (spec A2 §7) y solo la búsqueda lo convierte a uuid.
create function api.create_need_draft(
  p_key text, p_hash text, p_component text, p_required_blood_type text, p_target int, p_site_id text,
  p_radius_km int, p_urgency text, p_expires_in_hours int
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_claim jsonb;
  v_site uuid;
  v_need app.needs;
  v_reply jsonb;
  v_rate jsonb;
begin
  v_fail := app.require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;

  if p_key is null or char_length(p_key) not between 16 and 255
     or p_component is distinct from 'RBC'
     or p_required_blood_type is null or p_required_blood_type not in ('O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS')
     or p_target is null or p_target not between 1 and 50
     or p_radius_km is null or p_radius_km not between 1 and 50
     or p_urgency is null or p_urgency not in ('Normal', 'Urgente', 'Critica')
     or p_expires_in_hours is null or p_expires_in_hours not between 1 and 72
     or p_site_id is null or p_site_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('component', p_component), jsonb_build_array('requiredBloodType', p_required_blood_type),
          jsonb_build_array('targetConfirmations', p_target), jsonb_build_array('siteId', p_site_id),
          jsonb_build_array('radiusKm', p_radius_km), jsonb_build_array('urgency', p_urgency),
          jsonb_build_array('expiresInHours', p_expires_in_hours))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  -- Replay o conflicto primero: un resultado ya guardado se devuelve aunque la sede cambie después,
  -- pero nunca a quien ya pertenece a otro hospital (el resultado guardado es de la institución anterior).
  v_claim := app.peek_idempotency('user:' || auth.uid()::text, 'createHospitalNeed', p_key, p_hash);
  if v_claim is not null then
    if v_claim ->> 'kind' = 'replayed' and (v_claim #>> '{response,owner,hospitalId}') is distinct from v_hospital::text then
      return jsonb_build_object('kind', 'forbidden');
    end if;
    return v_claim;
  end if;

  -- Sede inexistente, ajena, inactiva o sin aprobar: una sola rama, sin rastro de cuál fue.
  select s.site_id into v_site from app.sites s
  where s.site_id = p_site_id::uuid and s.hospital_id = v_hospital and s.is_active and s.is_approved;
  if not found then return jsonb_build_object('kind', 'site_unusable'); end if;

  -- Tope por actor (protege la base y, desde F6, a los donantes de convocatorias en masa). Va antes del claim
  -- para no dejar una clave «en curso»; los replays ya salieron arriba y no consumen cupo.
  v_rate := api.consume_rate_limit('need:create', encode(extensions.digest(auth.uid()::text, 'sha256'), 'hex'), 30, interval '1 hour');
  if not coalesce((v_rate ->> 'allowed')::boolean, false) then return jsonb_build_object('kind', 'rate_limited'); end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'createHospitalNeed', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations,
                         radius_km, urgency, expires_at)
  values (v_hospital, v_site, auth.uid(), p_component, p_required_blood_type, p_target, p_radius_km, p_urgency,
          now() + make_interval(hours => p_expires_in_hours))
  returning * into v_need;
  perform app.write_audit('necesidad.creada', 'need', v_need.need_id, 'ok', null);

  v_reply := jsonb_build_object(
    'kind', 'created',
    'owner', jsonb_build_object('actorId', auth.uid(), 'hospitalId', v_hospital),
    'need', app.need_json(v_need)
  );
  perform app.complete_idempotency('user:' || auth.uid()::text, 'createHospitalNeed', p_key, v_reply);
  return v_reply;
end;
$$;

-- Más recientes primero. El filtro de estado se aplica sobre el estado proyectado.
create function api.list_own_needs(
  p_limit int, p_status text default null, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null
) returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_items jsonb;
  v_next jsonb;
begin
  v_fail := app.require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_limit is null or p_limit not between 1 and 100 or (p_cursor_created_at is null) <> (p_cursor_id is null)
     or (p_status is not null and p_status not in ('borrador', 'activa', 'meta_alcanzada', 'cerrada', 'cancelada', 'vencida')) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  with page as (
    select n.created_at, n.need_id, app.need_json(n) as j,
           row_number() over (order by n.created_at desc, n.need_id desc) as rn
    from app.needs n
    where n.hospital_id = v_hospital
      and (p_status is null or app.need_status(n) = p_status)
      and (p_cursor_created_at is null or (n.created_at, n.need_id) < (p_cursor_created_at, p_cursor_id))
    order by n.created_at desc, n.need_id desc
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('createdAt', app.iso(p.created_at), 'id', p.need_id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;

  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

create function api.get_own_need(p_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_need app.needs;
begin
  v_fail := app.require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;

  -- Una necesidad ajena es indistinguible de una inexistente (sin IDOR).
  select * into v_need from app.needs where need_id = p_id and hospital_id = v_hospital;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  return jsonb_build_object('kind', 'ok', 'need', app.need_json(v_need));
end;
$$;

-- Matriz manual C-8. Lo que ya venció es terminal: borrador → activa exige now() < expires_at y una sede vigente.
create function api.transition_own_need(p_key text, p_hash text, p_id uuid, p_status text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_claim jsonb;
  v_need app.needs;
  v_visible text;
  v_reply jsonb;
  v_rate jsonb;
begin
  v_fail := app.require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_key is null or char_length(p_key) not between 16 and 255
     or p_status is null or p_status not in ('activa', 'cerrada', 'cancelada')
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('needId', p_id::text), jsonb_build_array('status', p_status))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_need from app.needs where need_id = p_id and hospital_id = v_hospital for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  v_claim := app.peek_idempotency('user:' || auth.uid()::text, 'transitionOwnHospitalNeed', p_key, p_hash);
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

  v_rate := api.consume_rate_limit('need:transition', encode(extensions.digest(auth.uid()::text, 'sha256'), 'hex'), 60, interval '1 hour');
  if not coalesce((v_rate ->> 'allowed')::boolean, false) then return jsonb_build_object('kind', 'rate_limited'); end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'transitionOwnHospitalNeed', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.needs set status = p_status, updated_at = now(), version = version + 1
  where need_id = p_id
  returning * into v_need;
  if not found then raise exception 'need_update_lost'; end if;
  perform app.write_audit('necesidad.transicion', 'need', p_id, 'ok', null);

  v_reply := jsonb_build_object('kind', 'ok', 'need', app.need_json(v_need));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'transitionOwnHospitalNeed', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilegios de funciones (explícitos: PUBLIC no recibe EXECUTE por defecto)
-- ---------------------------------------------------------------------------

grant execute on function app.admin_hospital_id(), app.need_status(app.needs), app.need_json(app.needs)
  to authenticated, app_privileged;
grant execute on function
  api.create_need_draft(text, text, text, text, int, text, int, text, int),
  api.list_own_needs(int, text, timestamptz, uuid), api.get_own_need(uuid),
  api.transition_own_need(text, text, uuid, text)
to authenticated;

insert into app.schema_version (version) values ('20261013030000');
