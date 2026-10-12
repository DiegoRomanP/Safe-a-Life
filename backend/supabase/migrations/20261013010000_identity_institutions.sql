-- identity-institutions (F2a): hospitales, sedes, membresías, configuración, auditoría y tareas.
-- Todas las RPC son SECURITY INVOKER salvo la reclamación de idempotencia previa a la sesión.
-- Convención (ADR-003): jsonb {"kind": ...}; los rechazos ocurren antes de escribir.

create table app.hospitals (
  hospital_id uuid primary key default gen_random_uuid(),
  public_name text not null check (char_length(public_name) between 1 and 160),
  legal_name text not null check (char_length(legal_name) between 1 and 200),
  is_authorized boolean not null default false,
  created_at timestamptz not null default now()
);
create index hospitals_created_idx on app.hospitals (created_at, hospital_id);

create table app.sites (
  site_id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references app.hospitals (hospital_id),
  public_name text not null check (char_length(public_name) between 1 and 160),
  public_address text not null check (char_length(public_address) between 1 and 240),
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  public_instructions text check (public_instructions is null or char_length(public_instructions) <= 1000),
  is_active boolean not null default true,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index sites_hospital_idx on app.sites (hospital_id, created_at, site_id);

create table app.hospital_memberships (
  membership_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hospital_id uuid not null references app.hospitals (hospital_id),
  status text not null check (status in ('pendiente', 'activa', 'revocada')),
  email_hint text not null check (char_length(email_hint) <= 100),
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 300),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
-- Un admin pertenece como máximo a un hospital vigente.
create unique index hospital_memberships_one_live_per_user
  on app.hospital_memberships (user_id) where status <> 'revocada';
create index hospital_memberships_created_idx on app.hospital_memberships (created_at, membership_id);

alter table app.hospitals enable row level security;
alter table app.hospitals force row level security;
alter table app.sites enable row level security;
alter table app.sites force row level security;
alter table app.hospital_memberships enable row level security;
alter table app.hospital_memberships force row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function app.iso(p_ts timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

-- Hash canónico: SHA-256 del JSON compacto de pares [campo, valor] en el orden dado.
-- Solo para strings, enteros, booleanos y null (igual que `fingerprint` en TypeScript).
create function app.fingerprint(p_pairs jsonb) returns text
language sql immutable set search_path = '' as $$
  select encode(
    extensions.digest(
      convert_to(
        '{' || coalesce(string_agg(to_json(e.pair ->> 0)::text || ':' || (e.pair -> 1)::text, ',' order by e.ord), '') || '}',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from jsonb_array_elements(p_pairs) with ordinality as e (pair, ord)
$$;

-- Código opaco estable de 16 hex para auditoría y tareas (nunca el UUID).
create function app.opaque_code(p_id uuid) returns text
language sql immutable set search_path = '' as $$
  select left(encode(extensions.hmac(p_id::text, 'save-a-life-opaque-code-v1', 'sha256'), 'hex'), 16)
$$;

-- Mismo formato que Date.prototype.toISOString() (milisegundos), para hashes canónicos.
create function app.iso_ms(p_ts timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create function app.member_hospital_id() returns uuid
language sql stable set search_path = '' as $$
  select m.hospital_id from app.hospital_memberships m
  where m.user_id = auth.uid() and m.status = 'activa'
$$;

create function app.hospital_json(h app.hospitals) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'hospitalId', h.hospital_id, 'publicName', h.public_name, 'legalName', h.legal_name,
    'isAuthorized', h.is_authorized, 'createdAt', app.iso(h.created_at)
  )
$$;

create function app.site_json(s app.sites) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'siteId', s.site_id, 'hospitalId', s.hospital_id, 'publicName', s.public_name,
    'publicAddress', s.public_address,
    'coordinates', jsonb_build_object('latitude', s.latitude, 'longitude', s.longitude),
    'publicInstructions', s.public_instructions,
    'isActive', s.is_active, 'isApproved', s.is_approved
  )
$$;

create function app.membership_json(m app.hospital_memberships) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'membershipId', m.membership_id, 'hospitalId', m.hospital_id, 'role', 'admin_hospitalario',
    'status', m.status, 'emailHint', m.email_hint
  )
$$;

-- ---------------------------------------------------------------------------
-- Políticas RLS y privilegios
-- ---------------------------------------------------------------------------

grant select on app.hospitals, app.sites, app.hospital_memberships to authenticated;
grant insert (public_name, legal_name), update (public_name, legal_name, is_authorized) on app.hospitals to authenticated;
grant insert (hospital_id, public_name, public_address, latitude, longitude, public_instructions),
      update (public_name, public_address, latitude, longitude, public_instructions, is_active, is_approved, updated_at)
  on app.sites to authenticated;
grant update (status, revoke_reason, revoked_at) on app.hospital_memberships to authenticated;
grant update (final_demo_at) on app.configuration to authenticated;
grant select, insert, update, delete on app.hospitals, app.sites, app.hospital_memberships to app_privileged;

create policy hospitals_superadmin_select on app.hospitals
  for select to authenticated using (app.current_actor_role() = 'superadmin');
create policy hospitals_member_select on app.hospitals
  for select to authenticated using (hospital_id = app.member_hospital_id());
create policy hospitals_superadmin_insert on app.hospitals
  for insert to authenticated with check (app.current_actor_role() = 'superadmin' and app.current_aal() = 'aal2');
create policy hospitals_superadmin_update on app.hospitals
  for update to authenticated
  using (app.current_actor_role() = 'superadmin' and app.current_aal() = 'aal2')
  with check (app.current_actor_role() = 'superadmin' and app.current_aal() = 'aal2');
create policy hospitals_privileged on app.hospitals for all to app_privileged using (true) with check (true);

create policy sites_superadmin_select on app.sites
  for select to authenticated using (app.current_actor_role() = 'superadmin');
create policy sites_member_select on app.sites
  for select to authenticated using (hospital_id = app.member_hospital_id());
create policy sites_superadmin_insert on app.sites
  for insert to authenticated with check (app.current_actor_role() = 'superadmin' and app.current_aal() = 'aal2');
create policy sites_superadmin_update on app.sites
  for update to authenticated
  using (app.current_actor_role() = 'superadmin' and app.current_aal() = 'aal2')
  with check (app.current_actor_role() = 'superadmin' and app.current_aal() = 'aal2');
create policy sites_privileged on app.sites for all to app_privileged using (true) with check (true);

create policy memberships_superadmin_select on app.hospital_memberships
  for select to authenticated using (app.current_actor_role() = 'superadmin');
create policy memberships_own_select on app.hospital_memberships
  for select to authenticated using (user_id = (select auth.uid()));
create policy memberships_superadmin_update on app.hospital_memberships
  for update to authenticated
  using (app.current_actor_role() = 'superadmin' and app.current_aal() = 'aal2')
  with check (app.current_actor_role() = 'superadmin' and app.current_aal() = 'aal2');
create policy memberships_privileged on app.hospital_memberships for all to app_privileged using (true) with check (true);

create policy configuration_superadmin_update on app.configuration
  for update to authenticated
  using (app.current_actor_role() = 'superadmin' and app.current_aal() = 'aal2')
  with check (app.current_actor_role() = 'superadmin' and app.current_aal() = 'aal2');

-- ---------------------------------------------------------------------------
-- RPC de lectura y de sesión
-- ---------------------------------------------------------------------------

-- null si el usuario no tiene cuenta de aplicación o es el worker.
create function api.current_actor() returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_role app.actor_role;
  v_name text;
  v_hospital jsonb;
begin
  select ua.role, ua.display_name into v_role, v_name from app.user_accounts ua where ua.user_id = auth.uid();
  if v_role is null or v_role = 'worker' then
    return null;
  end if;

  if v_role = 'admin_hospitalario' then
    select jsonb_build_object(
             'hospitalId', h.hospital_id, 'hospitalName', h.public_name,
             'membershipActive', m.status = 'activa', 'hospitalAuthorized', h.is_authorized),
           h.public_name
      into v_hospital, v_name
    from app.hospital_memberships m join app.hospitals h on h.hospital_id = m.hospital_id
    where m.user_id = auth.uid()
    order by (m.status = 'activa') desc, m.created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'role', v_role,
    'displayName', case v_role
      when 'superadmin' then 'Superadministración'
      when 'donante' then coalesce(v_name, 'Donante')
      else coalesce(v_name, 'Administración hospitalaria') end,
    'hospital', v_hospital
  );
end;
$$;

-- Reclamación de idempotencia para quien aún no tiene sesión (login, registro, recuperación).
-- Excepción DEFINER de la allowlist (ADR-003, funciones previas a la sesión): solo actor email:/token:
-- y operaciones permitidas; si la clave ya existe con otro hash → payload_conflict.
create function api.record_public_idempotency(p_actor_ref text, p_operation text, p_key text, p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_claim jsonb;
begin
  if p_actor_ref !~ '^(email|token):[0-9a-f]{64}$'
     or p_operation not in ('createSession', 'requestPasswordRecovery', 'createDonorRegistration') then
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
alter function api.record_public_idempotency(text, text, text, text) owner to app_privileged;
revoke all on function api.record_public_idempotency(text, text, text, text) from public, anon, authenticated;
grant execute on function api.record_public_idempotency(text, text, text, text) to anon, authenticated;

-- Una clave de operación sensible (MFA, step-up) solo vale una vez: el secreto o el código
-- no pueden reproducirse en un replay. ok = reclamada; conflict = ya usada con el mismo payload.
create function api.consume_idempotency_key(p_operation text, p_key text, p_hash text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_claim jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if p_operation !~ '^[A-Za-z]{1,60}$' or p_hash !~ '^[0-9a-f]{64}$' or char_length(p_key) not between 16 and 255 then
    return jsonb_build_object('kind', 'invalid');
  end if;
  v_claim := app.claim_idempotency('user:' || auth.uid()::text, p_operation, p_key, p_hash);
  if v_claim is null then
    perform app.complete_idempotency('user:' || auth.uid()::text, p_operation, p_key, jsonb_build_object('kind', 'ok'));
    return jsonb_build_object('kind', 'ok');
  end if;
  if v_claim ->> 'kind' = 'replayed' then return jsonb_build_object('kind', 'conflict'); end if;
  return v_claim;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hospitales
-- ---------------------------------------------------------------------------

create function api.list_hospitals(p_limit int, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_items jsonb;
  v_next jsonb;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_limit is null or p_limit not between 1 and 100 or (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  with page as (
    select h.created_at, h.hospital_id, app.hospital_json(h) as j,
           row_number() over (order by h.created_at, h.hospital_id) as rn
    from app.hospitals h
    where p_cursor_created_at is null or (h.created_at, h.hospital_id) > (p_cursor_created_at, p_cursor_id)
    order by h.created_at, h.hospital_id
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('createdAt', app.iso(p.created_at), 'id', p.hospital_id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;

  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

create function api.create_hospital(p_key text, p_hash text, p_public_name text, p_legal_name text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_hospital app.hospitals;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_public_name is null or char_length(p_public_name) not between 1 and 160
     or p_legal_name is null or char_length(p_legal_name) not between 1 and 200
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('publicName', p_public_name), jsonb_build_array('legalName', p_legal_name))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'createHospital', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  insert into app.hospitals (public_name, legal_name) values (p_public_name, p_legal_name) returning * into v_hospital;
  perform app.write_audit('hospital.creado', 'hospital', v_hospital.hospital_id, 'ok', null);
  v_reply := jsonb_build_object('kind', 'created', 'hospital', app.hospital_json(v_hospital));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'createHospital', p_key, v_reply);
  return v_reply;
end;
$$;

create function api.get_hospital(p_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_hospital app.hospitals;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  select * into v_hospital from app.hospitals where hospital_id = p_id;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  return jsonb_build_object('kind', 'ok', 'hospital', app.hospital_json(v_hospital));
end;
$$;

-- Argumentos nulos = sin cambio. Exige step-up.
create function api.update_hospital(
  p_key text, p_hash text, p_id uuid, p_public_name text, p_legal_name text, p_is_authorized boolean
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_hospital app.hospitals;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, true);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if (p_public_name is null and p_legal_name is null and p_is_authorized is null)
     or (p_public_name is not null and char_length(p_public_name) not between 1 and 160)
     or (p_legal_name is not null and char_length(p_legal_name) not between 1 and 200)
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('hospitalId', p_id::text), jsonb_build_array('publicName', p_public_name),
          jsonb_build_array('legalName', p_legal_name), jsonb_build_array('isAuthorized', p_is_authorized))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  -- Los rechazos van antes de reclamar la clave: un `return` confirma la transacción.
  if not exists (select 1 from app.hospitals where hospital_id = p_id) then
    return jsonb_build_object('kind', 'not_found');
  end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'updateHospital', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.hospitals
  set public_name = coalesce(p_public_name, public_name),
      legal_name = coalesce(p_legal_name, legal_name),
      is_authorized = coalesce(p_is_authorized, is_authorized)
  where hospital_id = p_id
  returning * into v_hospital;

  perform app.write_audit('hospital.actualizado', 'hospital', p_id, 'ok', null);
  v_reply := jsonb_build_object('kind', 'ok', 'hospital', app.hospital_json(v_hospital));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'updateHospital', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sedes
-- ---------------------------------------------------------------------------

create function api.list_hospital_sites(p_hospital_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if not exists (select 1 from app.hospitals where hospital_id = p_hospital_id) then
    return jsonb_build_object('kind', 'not_found');
  end if;
  return jsonb_build_object('kind', 'ok', 'items', coalesce((
    select jsonb_agg(app.site_json(s) order by s.created_at, s.site_id)
    from app.sites s where s.hospital_id = p_hospital_id
  ), '[]'::jsonb));
end;
$$;

create function api.create_hospital_site(
  p_key text, p_hash text, p_hospital_id uuid, p_public_name text, p_public_address text,
  p_latitude numeric, p_longitude numeric, p_public_instructions text
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_site app.sites;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_public_name is null or char_length(p_public_name) not between 1 and 160
     or p_public_address is null or char_length(p_public_address) not between 1 and 240
     or p_latitude is null or p_latitude not between -90 and 90 or p_longitude is null or p_longitude not between -180 and 180
     or (p_public_instructions is not null and char_length(p_public_instructions) > 1000)
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('hospitalId', p_hospital_id::text), jsonb_build_array('publicName', p_public_name),
          jsonb_build_array('publicAddress', p_public_address), jsonb_build_array('latitude', p_latitude::text),
          jsonb_build_array('longitude', p_longitude::text), jsonb_build_array('publicInstructions', p_public_instructions))) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  if not exists (select 1 from app.hospitals where hospital_id = p_hospital_id) then
    return jsonb_build_object('kind', 'not_found');
  end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'createHospitalSite', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  insert into app.sites (hospital_id, public_name, public_address, latitude, longitude, public_instructions)
  values (p_hospital_id, p_public_name, p_public_address, p_latitude, p_longitude, nullif(p_public_instructions, ''))
  returning * into v_site;
  perform app.write_audit('sede.creada', 'site', v_site.site_id, 'ok', null);
  v_reply := jsonb_build_object('kind', 'created', 'site', app.site_json(v_site));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'createHospitalSite', p_key, v_reply);
  return v_reply;
end;
$$;

-- Argumentos nulos = sin cambio; '' en instrucciones las borra.
create function api.update_hospital_site(
  p_key text, p_hash text, p_site_id uuid, p_public_name text, p_public_address text,
  p_latitude numeric, p_longitude numeric, p_public_instructions text,
  p_is_active boolean, p_is_approved boolean
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_site app.sites;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if (p_public_name is null and p_public_address is null and p_latitude is null and p_longitude is null
      and p_public_instructions is null and p_is_active is null and p_is_approved is null)
     or (p_public_name is not null and char_length(p_public_name) not between 1 and 160)
     or (p_public_address is not null and char_length(p_public_address) not between 1 and 240)
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180)
     or (p_public_instructions is not null and char_length(p_public_instructions) > 1000)
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('siteId', p_site_id::text), jsonb_build_array('publicName', p_public_name),
          jsonb_build_array('publicAddress', p_public_address), jsonb_build_array('latitude', p_latitude::text),
          jsonb_build_array('longitude', p_longitude::text), jsonb_build_array('publicInstructions', p_public_instructions),
          jsonb_build_array('isActive', p_is_active), jsonb_build_array('isApproved', p_is_approved))) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  if not exists (select 1 from app.sites where site_id = p_site_id) then
    return jsonb_build_object('kind', 'not_found');
  end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'updateHospitalSite', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.sites
  set public_name = coalesce(p_public_name, public_name),
      public_address = coalesce(p_public_address, public_address),
      latitude = coalesce(p_latitude, latitude),
      longitude = coalesce(p_longitude, longitude),
      public_instructions = case when p_public_instructions is null then public_instructions
                                 else nullif(p_public_instructions, '') end,
      is_active = coalesce(p_is_active, is_active),
      is_approved = coalesce(p_is_approved, is_approved),
      updated_at = now()
  where site_id = p_site_id
  returning * into v_site;
  perform app.write_audit('sede.actualizada', 'site', p_site_id, 'ok', null);
  v_reply := jsonb_build_object('kind', 'ok', 'site', app.site_json(v_site));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'updateHospitalSite', p_key, v_reply);
  return v_reply;
end;
$$;

-- Sedes que el admin puede elegir al crear una necesidad: activas y aprobadas de su hospital autorizado.
create function api.list_own_hospital_sites(p_limit int, p_cursor_site_id uuid default null) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_hospital app.hospitals;
  v_items jsonb;
  v_next uuid;
begin
  v_fail := app.require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  select h.* into v_hospital from app.hospitals h where h.hospital_id = app.member_hospital_id();
  if not found or not v_hospital.is_authorized then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_limit is null or p_limit not between 1 and 100 then return jsonb_build_object('kind', 'invalid'); end if;

  with page as (
    select s.site_id, s.public_name, row_number() over (order by s.site_id) as rn
    from app.sites s
    where s.hospital_id = v_hospital.hospital_id and s.is_active and s.is_approved
      and (p_cursor_site_id is null or s.site_id > p_cursor_site_id)
    order by s.site_id
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('siteId', site_id, 'publicName', public_name) order by rn)
                  filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then (select p.site_id from page p where p.rn = p_limit) end
    into v_items, v_next
  from page;

  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

-- ---------------------------------------------------------------------------
-- Membresías
-- ---------------------------------------------------------------------------

create function api.list_memberships(p_limit int, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_items jsonb;
  v_next jsonb;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_limit is null or p_limit not between 1 and 100 or (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  with page as (
    select m.created_at, m.membership_id, app.membership_json(m) as j,
           row_number() over (order by m.created_at, m.membership_id) as rn
    from app.hospital_memberships m
    where p_cursor_created_at is null or (m.created_at, m.membership_id) > (p_cursor_created_at, p_cursor_id)
    order by m.created_at, m.membership_id
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('createdAt', app.iso(p.created_at), 'id', p.membership_id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;

  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

create function api.revoke_membership(p_key text, p_hash text, p_id uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_membership app.hospital_memberships;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_reason is null or char_length(p_reason) not between 1 and 300
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('membershipId', p_id::text), jsonb_build_array('status', 'revocada'),
          jsonb_build_array('reason', p_reason))) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  select * into v_membership from app.hospital_memberships where membership_id = p_id;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_membership.status = 'revocada' then return jsonb_build_object('kind', 'conflict'); end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'revokeHospitalMembership', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.hospital_memberships
  set status = 'revocada', revoke_reason = p_reason, revoked_at = now()
  where membership_id = p_id
  returning * into v_membership;
  perform app.write_audit('membresia.revocada', 'membership', p_id, 'ok', null);
  v_reply := jsonb_build_object('kind', 'ok', 'membership', app.membership_json(v_membership));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'revokeHospitalMembership', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------------

create function api.get_configuration() returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_at timestamptz;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  select final_demo_at into v_at from app.configuration;
  return jsonb_build_object('kind', 'ok',
    'finalDemoAt', case when v_at is null then null else to_jsonb(app.iso(v_at)) end,
    'isImmutable', v_at is not null);
end;
$$;

create function api.set_final_demo_at(p_key text, p_hash text, p_at timestamptz) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_current timestamptz;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, true);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_at is null or p_at <= now()
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('finalDemoAt', app.iso_ms(p_at)))) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  select final_demo_at into v_current from app.configuration;
  if v_current is not null then return jsonb_build_object('kind', 'conflict'); end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'setFinalDemoAt', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  -- PostgREST activa pg_safeupdate: todo UPDATE necesita WHERE.
  update app.configuration set final_demo_at = p_at where id;
  perform app.write_audit('configuracion.final_demo_fijada', 'configuration', null, 'ok', null);
  v_reply := jsonb_build_object('kind', 'ok', 'finalDemoAt', to_jsonb(app.iso(p_at)), 'isImmutable', true);
  perform app.complete_idempotency('user:' || auth.uid()::text, 'setFinalDemoAt', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auditoría y tareas
-- ---------------------------------------------------------------------------

create function api.list_audit_events(p_limit int, p_cursor_occurred_at timestamptz default null, p_cursor_id uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_items jsonb;
  v_next jsonb;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_limit is null or p_limit not between 1 and 100 or (p_cursor_occurred_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  with page as (
    select a.occurred_at, a.event_id,
           jsonb_strip_nulls(jsonb_build_object(
             'eventId', a.event_id,
             'actorCode', coalesce(app.opaque_code(a.actor_id), a.actor_kind),
             'event', a.event,
             'resourceCode', coalesce(app.opaque_code(a.resource_id), coalesce(a.resource_type, 'sistema')),
             'result', a.result,
             'occurredAt', app.iso(a.occurred_at),
             'reason', a.reason)) as j,
           row_number() over (order by a.occurred_at, a.event_id) as rn
    from app.audit_events a
    where p_cursor_occurred_at is null or (a.occurred_at, a.event_id) > (p_cursor_occurred_at, p_cursor_id)
    order by a.occurred_at, a.event_id
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('createdAt', app.iso(p.occurred_at), 'id', p.event_id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;

  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

-- V20: hospital_review = sedes sin aprobar. Las demás clases se añaden con sus módulos (create or replace).
create function api.list_superadmin_tasks() returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  return jsonb_build_object('kind', 'ok', 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'taskId', s.site_id, 'kind', 'hospital_review',
             'createdAt', app.iso(s.created_at), 'resourceCode', app.opaque_code(s.site_id))
           order by s.created_at, s.site_id)
    from app.sites s where not s.is_approved
  ), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilegios de funciones
-- ---------------------------------------------------------------------------

grant execute on all functions in schema app to authenticated, app_privileged;
revoke all on all functions in schema api from public, anon, authenticated;
grant execute on function
  api.current_actor(), api.list_hospitals(int, timestamptz, uuid), api.create_hospital(text, text, text, text),
  api.get_hospital(uuid), api.update_hospital(text, text, uuid, text, text, boolean),
  api.list_hospital_sites(uuid),
  api.create_hospital_site(text, text, uuid, text, text, numeric, numeric, text),
  api.update_hospital_site(text, text, uuid, text, text, numeric, numeric, text, boolean, boolean),
  api.list_own_hospital_sites(int, uuid), api.list_memberships(int, timestamptz, uuid),
  api.revoke_membership(text, text, uuid, text), api.get_configuration(),
  api.set_final_demo_at(text, text, timestamptz), api.list_audit_events(int, timestamptz, uuid),
  api.list_superadmin_tasks(), api.consume_idempotency_key(text, text, text)
to authenticated;
-- Se vuelven a conceder las funciones de la migración base que el revoke anterior retiró.
grant execute on function api.consume_rate_limit(text, text, int, interval), api.readiness(),
  api.record_public_idempotency(text, text, text, text) to anon, authenticated;

insert into app.schema_version (version) values ('20261013010000');
