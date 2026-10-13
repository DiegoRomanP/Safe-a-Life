-- donor-records (F5): perfil del donante, altas asistidas por hospitales y verificación de correo.
-- Reglas heredadas de F2b: las RPC que reciben un hash de token, un id de usuario o una sesión recién creada con signUp
-- solo las ejecuta la identidad técnica del backend (app.is_worker); un cliente directo de PostgREST no puede elegirlos.
-- Las DEFINER no usan el esquema auth (app_privileged no tiene USAGE): leen el JWT del GUC (app.jwt_sub, app.jwt_claims).

-- Polígono DEMO_ONLY-1 (espejo de domain/lima-polygon.ts; una prueba lo mantiene sincronizado): punto dentro o sobre el borde.
-- La ubicación se valida también aquí para que una llamada directa a la RPC no pueda saltarse el dominio.
create function app.in_lima_demo_1(p_lat numeric, p_lon numeric) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_x constant numeric[] := array[-77.20, -76.90, -76.85, -76.90, -77.15, -77.20, -77.20];
  v_y constant numeric[] := array[-11.80, -11.80, -12.00, -12.30, -12.30, -12.10, -11.80];
  v_inside boolean := false;
  v_i int;
  v_j int := 7;
  v_cross numeric;
begin
  if p_lat is null or p_lon is null then return false; end if;
  for v_i in 1..7 loop
    v_cross := (p_lon - v_x[v_j]) * (v_y[v_i] - v_y[v_j]) - (p_lat - v_y[v_j]) * (v_x[v_i] - v_x[v_j]);
    if v_cross = 0 and p_lon between least(v_x[v_i], v_x[v_j]) and greatest(v_x[v_i], v_x[v_j])
       and p_lat between least(v_y[v_i], v_y[v_j]) and greatest(v_y[v_i], v_y[v_j]) then
      return true;
    end if;
    if (v_y[v_i] > p_lat) <> (v_y[v_j] > p_lat)
       and p_lon < (v_x[v_j] - v_x[v_i]) * (p_lat - v_y[v_i]) / (v_y[v_j] - v_y[v_i]) + v_x[v_i] then
      v_inside := not v_inside;
    end if;
    v_j := v_i;
  end loop;
  return v_inside;
end;
$$;

create table app.donor_profiles (
  donor_id uuid primary key references auth.users (id) on delete cascade,
  name text check (name is null or char_length(name) between 1 and 120),
  declared_blood_type text
    check (declared_blood_type is null or declared_blood_type in ('O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS')),
  is_available boolean,
  latitude numeric(6, 3) check (latitude is null or latitude between -90 and 90),
  longitude numeric(7, 3) check (longitude is null or longitude between -180 and 180),
  location_polygon_version text check (location_polygon_version is null or char_length(location_polygon_version) <= 40),
  status text not null default 'pendiente_verificacion' check (status in ('pendiente_verificacion', 'incompleto', 'activo')),
  email_verified_at timestamptz,
  -- Verdadero tras verificar un autorregistro: quien registró el correo conoce la contraseña, no necesariamente el dueño del
  -- buzón. Hasta que el dueño fije una contraseña nueva por el enlace de recuperación no se puede completar el perfil.
  password_setup_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check ((latitude is null) = (longitude is null)),
  check (latitude is null or (location_polygon_version = 'DEMO_ONLY-1' and app.in_lima_demo_1(latitude, longitude))),
  check (name is null or btrim(name) <> ''),
  check (status = 'pendiente_verificacion' or email_verified_at is not null),
  check (status <> 'activo' or (name is not null and declared_blood_type is not null and is_available is not null
                                and latitude is not null and longitude is not null and location_polygon_version is not null))
);

create table app.assisted_signups (
  signup_id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references app.hospitals (hospital_id),
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  name text check (name is null or char_length(name) between 1 and 120),
  status text not null default 'pendiente' check (status in ('pendiente', 'vencida', 'reclamada_incompleta', 'activa')),
  donor_id uuid,
  -- Se incrementa en cada emisión de enlace; la RPC técnica que emite el token es idempotente por (alta, seq).
  activation_seq int not null default 1,
  created_at timestamptz not null default now(),
  activation_expires_at timestamptz not null,
  -- created_at + 30 días; no cambia al reemitir el enlace (AP-01).
  purge_at timestamptz not null
);
create index assisted_signups_hospital_idx on app.assisted_signups (hospital_id, created_at, signup_id);

alter table app.donor_profiles enable row level security;
alter table app.donor_profiles force row level security;
alter table app.assisted_signups enable row level security;
alter table app.assisted_signups force row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Hospital del admin autenticado para funciones DEFINER (sin auth.*): membresía activa, hospital autorizado, rol y AAL2.
create function app.d_admin_hospital_id() returns uuid
language sql stable set search_path = '' as $$
  select m.hospital_id
  from app.hospital_memberships m
  join app.hospitals h on h.hospital_id = m.hospital_id
  where m.user_id = app.jwt_sub() and m.status = 'activa' and h.is_authorized
    and exists (select 1 from app.user_accounts ua where ua.user_id = app.jwt_sub() and ua.role = 'admin_hospitalario')
    and coalesce(app.jwt_claims() ->> 'aal', '') = 'aal2'
$$;

-- Estado de un token de acción: ok, not_found (no existe o es de otro tipo) o gone (consumido, anulado o vencido).
create function app.d_token_state(p_token_hash text, p_kind text) returns text
language sql stable set search_path = '' as $$
  select coalesce((
    select case when t.consumed_at is not null or t.invalidated_at is not null or t.expires_at <= now() then 'gone' else 'ok' end
    from app.action_tokens t where t.token_hash = p_token_hash and t.kind = p_kind
  ), 'not_found')
$$;

-- Recibe solo las columnas que el admin puede leer (no la fila completa, que incluye el correo y el nombre).
create function app.signup_json(p_id uuid, p_status text, p_created timestamptz, p_activation timestamptz, p_purge timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'signupId', p_id,
    'status', case when p_status = 'pendiente' and p_activation <= now() then 'vencida' else p_status end,
    'createdAt', app.iso(p_created), 'activationExpiresAt', app.iso(p_activation), 'purgeAt', app.iso(p_purge))
$$;

create function app.profile_json(p app.donor_profiles, p_email text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'name', p.name, 'email', p_email, 'declaredBloodType', p.declared_blood_type, 'isAvailable', p.is_available,
    'approximateLocation', jsonb_build_object('latitude', p.latitude, 'longitude', p.longitude))
$$;

-- Qué puede cambiar el propio donante (el resto de los cambios los hacen las RPC DEFINER, que corren como app_privileged):
--  pendiente_verificacion: nada; incompleto: completar el perfil y pasar a activo; activo: solo disponibilidad y ubicación.
create function app.guard_donor_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.donor_id <> old.donor_id or new.created_at <> old.created_at or new.email_verified_at is distinct from old.email_verified_at then
    raise exception 'donor_profile_immutable' using errcode = '42501';
  end if;
  if old.password_setup_required then
    raise exception 'donor_profile_password_pending' using errcode = '42501';
  end if;
  if old.status = 'pendiente_verificacion' then
    raise exception 'donor_profile_unverified' using errcode = '42501';
  elsif old.status = 'activo' and (new.status <> 'activo' or new.name is distinct from old.name or new.declared_blood_type is distinct from old.declared_blood_type) then
    raise exception 'donor_profile_identity_locked' using errcode = '42501';
  elsif old.status = 'incompleto' and new.status not in ('incompleto', 'activo') then
    raise exception 'donor_profile_status' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger donor_profiles_guard before update on app.donor_profiles for each row execute function app.guard_donor_profile();

-- Cuando el perfil llega a `activo`, el alta asistida que lo originó pasa a `activa` (la escribe app_privileged: el donante no
-- tiene privilegios sobre las altas). Es una función de trigger: vive en `api` porque app_privileged no puede ser propietario
-- de funciones en `app`; nadie la ejecuta por RPC.
create function api.sync_assisted_signup_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'activo' and old.status <> 'activo' then
    update app.assisted_signups set status = 'activa' where donor_id = new.donor_id and status = 'reclamada_incompleta';
  end if;
  return new;
end;
$$;
create trigger donor_profiles_sync_signup after update on app.donor_profiles for each row execute function api.sync_assisted_signup_status();

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------

grant select on app.donor_profiles to authenticated;
grant update (name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, updated_at) on app.donor_profiles to authenticated;
grant select, insert, update, delete on app.donor_profiles, app.assisted_signups to app_privileged;
-- El admin solo ve la proyección operativa de las altas de su hospital: nunca el correo, el nombre ni el donante.
grant select (signup_id, hospital_id, status, created_at, activation_expires_at, purge_at) on app.assisted_signups to authenticated;

create policy donor_profiles_own_select on app.donor_profiles
  for select to authenticated using (donor_id = (select auth.uid()) and app.current_actor_role() = 'donante');
create policy donor_profiles_own_update on app.donor_profiles
  for update to authenticated
  using (donor_id = (select auth.uid()) and app.current_actor_role() = 'donante')
  with check (donor_id = (select auth.uid()) and app.current_actor_role() = 'donante');
create policy donor_profiles_privileged on app.donor_profiles for all to app_privileged using (true) with check (true);
create policy assisted_signups_admin_select on app.assisted_signups
  for select to authenticated using (hospital_id = app.admin_hospital_id());
create policy assisted_signups_privileged on app.assisted_signups for all to app_privileged using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Registro y verificación de correo (solo la sesión técnica del backend)
-- ---------------------------------------------------------------------------

-- El backend crea la cuenta de Auth con signUp y luego llama aquí con el id resultante. Responde `ok` también cuando ya
-- existía una cuenta o es un replay (misma respuesta, sin crear nada ni enviar correo).
create function api.link_donor_account(
  p_user_id uuid, p_token_hash text, p_outbox_id uuid, p_sealed text, p_actor_ref text, p_key text, p_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_claim jsonb;
  v_reply jsonb := jsonb_build_object('kind', 'ok');
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_user_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_outbox_id is null
     or p_sealed is null or char_length(p_sealed) not between 20 and 4000
     or p_actor_ref is null or p_actor_ref !~ '^email:[0-9a-f]{64}$'
     or p_key is null or char_length(p_key) not between 16 and 256 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_claim := app.claim_idempotency(p_actor_ref, 'createDonorRegistration', p_key, p_hash);
  if v_claim is not null then
    if v_claim ->> 'kind' = 'replayed' then return v_reply; end if;
    return v_claim;
  end if;

  -- Solo una cuenta de Auth que existe y aún no tiene cuenta de aplicación.
  if app.user_email(p_user_id) is not null and not exists (select 1 from app.user_accounts ua where ua.user_id = p_user_id) then
    insert into app.user_accounts (user_id, role, display_name) values (p_user_id, 'donante', null);
    insert into app.donor_profiles (donor_id) values (p_user_id);
    insert into app.action_tokens (token_hash, kind, subject_id, expires_at)
    values (p_token_hash, 'verificacion_email', p_user_id, now() + interval '24 hours');
    perform app.enqueue_email(p_outbox_id, 'verificacion_email', null, null, p_sealed, now() + interval '24 hours');
    perform app.d_audit('donante.registrado', 'user', p_user_id, 'sistema');
  end if;
  perform app.complete_idempotency(p_actor_ref, 'createDonorRegistration', p_key, v_reply);
  return v_reply;
end;
$$;

create function api.get_donor_verification_preview(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_state text;
  v_expires timestamptz;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  v_state := app.d_token_state(p_token_hash, 'verificacion_email');
  if v_state <> 'ok' then return jsonb_build_object('kind', v_state); end if;
  select expires_at into v_expires from app.action_tokens where token_hash = p_token_hash;
  return jsonb_build_object('kind', 'ok', 'expiresAt', app.iso(v_expires));
end;
$$;

-- Consume el token (un solo uso): el correo queda verificado y el perfil pasa a `incompleto`. Sin sesión (C-12).
create function api.verify_donor_email(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token app.action_tokens;
  v_profile app.donor_profiles;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_token from app.action_tokens where token_hash = p_token_hash and kind = 'verificacion_email' for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_token.consumed_at is not null or v_token.invalidated_at is not null or v_token.expires_at <= now() then
    return jsonb_build_object('kind', 'gone');
  end if;
  select * into v_profile from app.donor_profiles where donor_id = v_token.subject_id for update;
  if not found then return jsonb_build_object('kind', 'conflict'); end if;

  update app.action_tokens set consumed_at = now() where token_hash = p_token_hash;
  update app.donor_profiles
  set email_verified_at = coalesce(email_verified_at, now()),
      status = case when status = 'pendiente_verificacion' then 'incompleto' else status end,
      password_setup_required = password_setup_required or email_verified_at is null,
      updated_at = now()
  where donor_id = v_token.subject_id
  returning * into v_profile;
  perform app.d_audit('donante.correo_verificado', 'user', v_token.subject_id, 'sistema');
  -- El backend usa `userId` y `email` (nunca van por HTTP) para cerrar las sesiones anteriores y enviar el enlace con el que
  -- el dueño del buzón fija su contraseña.
  return jsonb_build_object('kind', 'ok', 'status', v_profile.status, 'emailVerified', true,
    'userId', v_token.subject_id, 'email', lower(coalesce(app.user_email(v_token.subject_id), '')),
    'passwordSetupRequired', v_profile.password_setup_required);
end;
$$;

-- ---------------------------------------------------------------------------
-- Alta asistida por un hospital
-- ---------------------------------------------------------------------------

-- El admin solo registra el alta (cupo, idempotencia, auditoría). El token de activación y el correo los emite
-- `api.issue_assisted_activation`, que solo ejecuta la sesión técnica: quien administra un hospital no elige el hash del token
-- (si no, podría reclamar la cuenta de cualquier correo sin ser dueño del buzón).
create function api.create_assisted_signup(p_key text, p_hash text, p_email text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_claim jsonb;
  v_signup app.assisted_signups;
  v_reply jsonb;
begin
  v_fail := app.d_require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.d_admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;

  if p_key is null or char_length(p_key) not between 16 and 256
     or p_email is null or p_email <> lower(btrim(p_email)) or char_length(p_email) > 254 or p_email !~ '^[^[:space:]@]{1,64}@[^[:space:]@]{1,190}$'
     or (p_name is not null and char_length(p_name) not between 1 and 120)
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('email', p_email), jsonb_build_array('name', p_name))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_claim := app.peek_idempotency('user:' || app.jwt_sub()::text, 'createAssistedSignup', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  -- Tope por hospital (contado sobre altas reales, bajo un bloqueo por hospital): 20 cada hora.
  perform pg_advisory_xact_lock(hashtextextended('assisted-quota:' || v_hospital::text, 0));
  if (select count(*) from app.assisted_signups s where s.hospital_id = v_hospital and s.created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('kind', 'rate_limited');
  end if;

  v_claim := app.claim_idempotency('user:' || app.jwt_sub()::text, 'createAssistedSignup', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  insert into app.assisted_signups (hospital_id, email, name, activation_expires_at, purge_at)
  values (v_hospital, p_email, p_name, now() + interval '24 hours', now() + interval '30 days')
  returning * into v_signup;
  perform app.d_audit('alta_asistida.creada', 'assisted_signup', v_signup.signup_id, 'usuario');

  v_reply := jsonb_build_object('kind', 'created', 'seq', v_signup.activation_seq,
    'signup', app.signup_json(v_signup.signup_id, v_signup.status, v_signup.created_at, v_signup.activation_expires_at, v_signup.purge_at));
  perform app.complete_idempotency('user:' || app.jwt_sub()::text, 'createAssistedSignup', p_key, v_reply);
  return v_reply;
end;
$$;

create function api.list_own_assisted_signups(p_limit int, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null) returns jsonb
language plpgsql stable set search_path = '' as $$
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
  if p_limit is null or p_limit not between 1 and 100 or (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  with page as (
    select s.created_at, s.signup_id, app.signup_json(s.signup_id, s.status, s.created_at, s.activation_expires_at, s.purge_at) as j,
           row_number() over (order by s.created_at desc, s.signup_id desc) as rn
    from app.assisted_signups s
    where s.hospital_id = v_hospital
      and (p_cursor_created_at is null or (s.created_at, s.signup_id) < (p_cursor_created_at, p_cursor_id))
    order by s.created_at desc, s.signup_id desc
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('createdAt', app.iso(p.created_at), 'id', p.signup_id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;
  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

create function api.get_own_assisted_signup(p_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_signup app.assisted_signups;
begin
  v_fail := app.require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;
  -- Una alta de otro hospital es indistinguible de una inexistente.
  select s.signup_id, s.status, s.created_at, s.activation_expires_at, s.purge_at into v_signup.signup_id, v_signup.status, v_signup.created_at, v_signup.activation_expires_at, v_signup.purge_at
  from app.assisted_signups s where s.signup_id = p_id and s.hospital_id = v_hospital;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  return jsonb_build_object('kind', 'ok', 'signup', app.signup_json(v_signup.signup_id, v_signup.status, v_signup.created_at, v_signup.activation_expires_at, v_signup.purge_at));
end;
$$;

-- Reemite el enlace de activación: solo antes de purge_at y mientras la alta siga sin reclamar. created_at y purge_at no
-- cambian. Anula los tokens anteriores y sube `activation_seq`; el token nuevo y el correo los emite la sesión técnica con
-- `api.issue_assisted_activation` (el admin no elige el hash). Topes: 3 enlaces por alta y hora, 60 por hospital y hora.
create function api.reissue_assisted_link(p_key text, p_hash text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_claim jsonb;
  v_signup app.assisted_signups;
  v_reply jsonb;
begin
  v_fail := app.d_require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.d_admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_key is null or char_length(p_key) not between 16 and 256 or p_id is null
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('signupId', p_id::text))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_signup from app.assisted_signups where signup_id = p_id and hospital_id = v_hospital for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  v_claim := app.peek_idempotency('user:' || app.jwt_sub()::text, 'reissueAssistedActivationLink', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;
  if v_signup.status not in ('pendiente', 'vencida') or v_signup.purge_at <= now() then return jsonb_build_object('kind', 'conflict'); end if;

  perform pg_advisory_xact_lock(hashtextextended('assisted-quota:' || v_hospital::text, 0));
  if (select count(*) from app.action_tokens t where t.kind = 'alta_asistida' and t.subject_id = p_id and t.created_at > now() - interval '1 hour') >= 3
     or (select count(*) from app.action_tokens t join app.assisted_signups s on s.signup_id = t.subject_id
         where t.kind = 'alta_asistida' and s.hospital_id = v_hospital and t.created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('kind', 'rate_limited');
  end if;

  v_claim := app.claim_idempotency('user:' || app.jwt_sub()::text, 'reissueAssistedActivationLink', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.action_tokens set invalidated_at = now()
  where kind = 'alta_asistida' and subject_id = p_id and consumed_at is null and invalidated_at is null;
  update app.assisted_signups
  set status = 'pendiente', activation_expires_at = now() + interval '24 hours', activation_seq = activation_seq + 1
  where signup_id = p_id
  returning * into v_signup;
  perform app.d_audit('alta_asistida.reemitida', 'assisted_signup', p_id, 'usuario');

  v_reply := jsonb_build_object('kind', 'ok', 'seq', v_signup.activation_seq);
  perform app.complete_idempotency('user:' || app.jwt_sub()::text, 'reissueAssistedActivationLink', p_key, v_reply);
  return v_reply;
end;
$$;

-- Emite el token de activación y el correo de un alta (solo la sesión técnica). Idempotente por (alta, seq): si ya existe el
-- token de esa emisión no hace nada, así que repetir la creación o la reemisión con la misma clave no duplica el correo. La
-- respuesta es `ok` también cuando el correo ya es una cuenta (no se crea token ni correo: sin enumeración) o supera 3
-- enlaces en 24 h (tope por buzón, sumando todos los hospitales).
create function api.issue_assisted_activation(
  p_signup_id uuid, p_hospital_id uuid, p_seq int, p_token_hash text, p_outbox_id uuid, p_sealed text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_signup app.assisted_signups;
  v_user uuid;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_signup_id is null or p_hospital_id is null or p_seq is null or p_outbox_id is null
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_sealed is null or char_length(p_sealed) not between 20 and 4000 then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_signup from app.assisted_signups where signup_id = p_signup_id and hospital_id = p_hospital_id for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_signup.status not in ('pendiente', 'vencida') or v_signup.purge_at <= now() or v_signup.activation_seq <> p_seq then
    return jsonb_build_object('kind', 'conflict');
  end if;
  if exists (select 1 from app.action_tokens t where t.kind = 'alta_asistida' and t.subject_id = p_signup_id and t.data ->> 'seq' = p_seq::text) then
    return jsonb_build_object('kind', 'ok');
  end if;

  v_user := app.user_id_by_email(v_signup.email);
  if (v_user is null or not exists (select 1 from app.user_accounts ua where ua.user_id = v_user))
     and (select count(*) from app.action_tokens t join app.assisted_signups s on s.signup_id = t.subject_id
          where t.kind = 'alta_asistida' and s.email = v_signup.email and t.created_at > now() - interval '24 hours') < 3 then
    insert into app.action_tokens (token_hash, kind, subject_id, data, expires_at)
    values (p_token_hash, 'alta_asistida', p_signup_id, jsonb_build_object('seq', p_seq), v_signup.activation_expires_at);
    perform app.enqueue_email(p_outbox_id, 'alta_asistida', null, null, p_sealed, v_signup.activation_expires_at);
  else
    -- Sin token no hay enlace: se marca la emisión como atendida para que el reintento no vuelva a evaluarla.
    insert into app.action_tokens (token_hash, kind, subject_id, data, expires_at, invalidated_at)
    values (p_token_hash, 'alta_asistida', p_signup_id, jsonb_build_object('seq', p_seq), v_signup.activation_expires_at, now());
  end if;
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- Reenvía la verificación de un registro sin verificar (solo la sesión técnica): si el correo es de una cuenta de donante en
-- `pendiente_verificacion`, anula el enlace anterior y emite uno nuevo al buzón (3 por cuenta cada 24 h). Responde igual
-- en cualquier otro caso. La idempotencia es la del registro (misma clave y mismo payload no repiten el correo).
create function api.reissue_donor_verification(
  p_email text, p_token_hash text, p_outbox_id uuid, p_sealed text, p_actor_ref text, p_key text, p_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_claim jsonb;
  v_reply jsonb := jsonb_build_object('kind', 'ok');
  v_user uuid;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_email is null or char_length(p_email) > 254 or p_email <> lower(btrim(p_email))
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_outbox_id is null
     or p_sealed is null or char_length(p_sealed) not between 20 and 4000
     or p_actor_ref is null or p_actor_ref !~ '^email:[0-9a-f]{64}$'
     or p_key is null or char_length(p_key) not between 16 and 256 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_claim := app.claim_idempotency(p_actor_ref, 'createDonorRegistration', p_key, p_hash);
  if v_claim is not null then
    if v_claim ->> 'kind' = 'replayed' then return v_reply; end if;
    return v_claim;
  end if;

  v_user := app.user_id_by_email(p_email);
  if v_user is not null then
    perform pg_advisory_xact_lock(hashtextextended('verify:' || v_user::text, 0));
    if exists (select 1 from app.donor_profiles dp where dp.donor_id = v_user and dp.status = 'pendiente_verificacion')
       and (select count(*) from app.action_tokens t where t.kind = 'verificacion_email' and t.subject_id = v_user and t.created_at > now() - interval '24 hours') < 3 then
      update app.action_tokens set invalidated_at = now()
      where kind = 'verificacion_email' and subject_id = v_user and consumed_at is null and invalidated_at is null;
      insert into app.action_tokens (token_hash, kind, subject_id, expires_at) values (p_token_hash, 'verificacion_email', v_user, now() + interval '24 hours');
      perform app.enqueue_email(p_outbox_id, 'verificacion_email', null, null, p_sealed, now() + interval '24 hours');
    end if;
  end if;
  perform app.complete_idempotency(p_actor_ref, 'createDonorRegistration', p_key, v_reply);
  return v_reply;
end;
$$;

-- Correo de un alta del hospital indicado, para que el backend selle el correo de emisión. El admin nunca lee el correo
-- (columna sin permiso); solo la sesión técnica, y únicamente de un alta reemitible del hospital que el backend resolvió
-- de la sesión del admin.
create function api.get_assisted_signup_recipient(p_signup_id uuid, p_hospital_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_signup app.assisted_signups;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_signup_id is null or p_hospital_id is null then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_signup from app.assisted_signups s where s.signup_id = p_signup_id and s.hospital_id = p_hospital_id;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_signup.status not in ('pendiente', 'vencida') or v_signup.purge_at <= now() then return jsonb_build_object('kind', 'conflict'); end if;
  return jsonb_build_object('kind', 'ok', 'email', v_signup.email);
end;
$$;

-- Vista previa del enlace de activación (solo la sesión técnica): hospital, vencimiento, correo (para la aplicación) y el
-- usuario de Auth inerte que lo ocupe, si lo hay (se reemplaza igual que en la invitación de admins).
create function api.get_assisted_activation_preview(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_state text;
  v_token app.action_tokens;
  v_hospital text;
  v_email text;
  v_user uuid;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  v_state := app.d_token_state(p_token_hash, 'alta_asistida');
  if v_state <> 'ok' then return jsonb_build_object('kind', v_state); end if;
  select * into v_token from app.action_tokens where token_hash = p_token_hash;
  select h.public_name, s.email into v_hospital, v_email
  from app.assisted_signups s join app.hospitals h on h.hospital_id = s.hospital_id where s.signup_id = v_token.subject_id;
  if v_hospital is null then return jsonb_build_object('kind', 'not_found'); end if;
  v_user := app.user_id_by_email(v_email, interval '1 minute');
  if v_user is not null and exists (select 1 from app.user_accounts ua where ua.user_id = v_user) then v_user := null; end if;
  return jsonb_build_object('kind', 'ok', 'hospitalName', v_hospital, 'expiresAt', app.iso(v_token.expires_at), 'email', v_email, 'orphanUserId', v_user);
end;
$$;

-- Vincula la cuenta de Auth creada con signUp (el token demuestra el correo): cuenta de donante, perfil `incompleto`
-- con el correo verificado y el nombre inicial si se dio; la alta pasa a `reclamada_incompleta`.
create function api.link_assisted_account(p_user_id uuid, p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token app.action_tokens;
  v_signup app.assisted_signups;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_user_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  -- Mismo orden de bloqueo que la reemisión (primero el alta, después sus tokens): sin interbloqueos.
  select * into v_token from app.action_tokens where token_hash = p_token_hash and kind = 'alta_asistida';
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  select * into v_signup from app.assisted_signups where signup_id = v_token.subject_id for update;
  if not found or v_signup.purge_at <= now() or v_signup.status not in ('pendiente', 'vencida') then return jsonb_build_object('kind', 'gone'); end if;
  select * into v_token from app.action_tokens where token_hash = p_token_hash and kind = 'alta_asistida' for update;
  if v_token.consumed_at is not null or v_token.invalidated_at is not null or v_token.expires_at <= now() then
    return jsonb_build_object('kind', 'gone');
  end if;
  -- El correo de la cuenta creada debe ser el del alta; y no puede tener ya cuenta de aplicación.
  if lower(coalesce(app.user_email(p_user_id), '')) is distinct from v_signup.email then return jsonb_build_object('kind', 'forbidden'); end if;
  if exists (select 1 from app.user_accounts ua where ua.user_id = p_user_id) then return jsonb_build_object('kind', 'conflict'); end if;

  insert into app.user_accounts (user_id, role, display_name) values (p_user_id, 'donante', null);
  insert into app.donor_profiles (donor_id, name, status, email_verified_at) values (p_user_id, v_signup.name, 'incompleto', now());
  update app.assisted_signups set status = 'reclamada_incompleta', donor_id = p_user_id where signup_id = v_signup.signup_id;
  update app.action_tokens set consumed_at = now() where token_hash = p_token_hash;
  perform app.d_audit('alta_asistida.reclamada', 'assisted_signup', v_signup.signup_id, 'sistema');
  return jsonb_build_object('kind', 'ok', 'status', 'reclamada_incompleta', 'emailVerified', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfil propio (el donante, con su sesión)
-- ---------------------------------------------------------------------------

create function api.get_own_donor_profile() returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_profile app.donor_profiles;
begin
  v_fail := app.require('{donante}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  select * into v_profile from app.donor_profiles where donor_id = auth.uid();
  -- Sin perfil activo todavía no hay nada que mostrar.
  if not found or v_profile.status <> 'activo' then return jsonb_build_object('kind', 'not_found'); end if;
  return jsonb_build_object('kind', 'ok', 'profile', app.profile_json(v_profile, auth.jwt() ->> 'email'));
end;
$$;

create function api.complete_own_onboarding(
  p_key text, p_hash text, p_name text, p_blood_type text, p_available boolean, p_latitude numeric, p_longitude numeric, p_polygon_version text
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_profile app.donor_profiles;
  v_reply jsonb;
begin
  v_fail := app.require('{donante}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_key is null or char_length(p_key) not between 16 and 256
     or p_name is null or char_length(p_name) not between 1 and 120 or btrim(p_name) = ''
     or p_blood_type is null or p_blood_type not in ('O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS')
     or p_available is null or p_latitude is null or p_latitude not between -90 and 90 or p_longitude is null or p_longitude not between -180 and 180
     or p_polygon_version is distinct from 'DEMO_ONLY-1' or p_latitude <> round(p_latitude, 3) or p_longitude <> round(p_longitude, 3)
     or not app.in_lima_demo_1(p_latitude, p_longitude)
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('name', p_name), jsonb_build_array('declaredBloodType', p_blood_type), jsonb_build_array('isAvailable', p_available),
          jsonb_build_array('latitude', p_latitude), jsonb_build_array('longitude', p_longitude))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_profile from app.donor_profiles where donor_id = auth.uid() for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  v_claim := app.peek_idempotency('user:' || auth.uid()::text, 'completeDonorOnboarding', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;
  -- Ya activo, o sin correo verificado: no se completa el onboarding.
  if v_profile.status <> 'incompleto' or v_profile.password_setup_required then return jsonb_build_object('kind', 'conflict'); end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'completeDonorOnboarding', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.donor_profiles
  set name = p_name, declared_blood_type = p_blood_type, is_available = p_available,
      latitude = p_latitude, longitude = p_longitude, location_polygon_version = p_polygon_version,
      status = 'activo', updated_at = now()
  where donor_id = auth.uid()
  returning * into v_profile;
  if not found then raise exception 'profile_update_lost'; end if;
  perform app.write_audit('donante.perfil_completado', 'user', auth.uid(), 'ok', null);

  v_reply := jsonb_build_object('kind', 'ok', 'profile', app.profile_json(v_profile, auth.jwt() ->> 'email'));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'completeDonorOnboarding', p_key, v_reply);
  return v_reply;
end;
$$;

-- Hasta F6: solo disponibilidad y ubicación. F6 la reemplaza por una DEFINER con el efecto sobre las invitaciones.
create function api.update_own_participation(
  p_key text, p_hash text, p_available boolean, p_latitude numeric, p_longitude numeric, p_polygon_version text
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_profile app.donor_profiles;
  v_reply jsonb;
begin
  v_fail := app.require('{donante}', false, false);
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

  select * into v_profile from app.donor_profiles where donor_id = auth.uid() for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  v_claim := app.peek_idempotency('user:' || auth.uid()::text, 'updateOwnDonorParticipation', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;
  if v_profile.status <> 'activo' then return jsonb_build_object('kind', 'conflict'); end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'updateOwnDonorParticipation', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.donor_profiles
  set is_available = coalesce(p_available, is_available),
      latitude = coalesce(p_latitude, latitude), longitude = coalesce(p_longitude, longitude),
      location_polygon_version = case when p_latitude is null then location_polygon_version else p_polygon_version end,
      updated_at = now()
  where donor_id = auth.uid()
  returning * into v_profile;
  if not found then raise exception 'profile_update_lost'; end if;
  perform app.write_audit('donante.participacion_actualizada', 'user', auth.uid(), 'ok', null);

  v_reply := jsonb_build_object('kind', 'ok', 'profile', app.profile_json(v_profile, auth.jwt() ->> 'email'));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'updateOwnDonorParticipation', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cambio de correo (el token `cambio_email` lo crea F7; aquí solo vista previa y consumo, solo la sesión técnica)
-- ---------------------------------------------------------------------------

create function api.get_email_change_preview(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_state text;
  v_expires timestamptz;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  v_state := app.d_token_state(p_token_hash, 'cambio_email');
  if v_state <> 'ok' then return jsonb_build_object('kind', v_state); end if;
  select expires_at into v_expires from app.action_tokens where token_hash = p_token_hash;
  return jsonb_build_object('kind', 'ok', 'expiresAt', app.iso(v_expires));
end;
$$;

-- Consume el token y devuelve el usuario y el correo nuevo SELLADO (la aplicación lo abre con el keyring, contexto = token_hash).
create function api.consume_email_change(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token app.action_tokens;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_token from app.action_tokens where token_hash = p_token_hash and kind = 'cambio_email' for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_token.consumed_at is not null or v_token.invalidated_at is not null or v_token.expires_at <= now() then
    return jsonb_build_object('kind', 'gone');
  end if;
  if v_token.data ->> 'sealedEmail' is null then return jsonb_build_object('kind', 'conflict'); end if;
  update app.action_tokens set consumed_at = now() where token_hash = p_token_hash;
  perform app.d_audit('donante.cambio_correo', 'user', v_token.subject_id, 'sistema');
  return jsonb_build_object('kind', 'ok', 'userId', v_token.subject_id, 'sealedEmail', v_token.data ->> 'sealedEmail');
end;
$$;


-- ---------------------------------------------------------------------------
-- Fijar la contraseña tras verificar un autorregistro (solo la sesión técnica del backend)
-- ---------------------------------------------------------------------------

-- Emite el enlace de recuperación que verifica el dueño del buzón. Solo vale mientras el perfil exige fijar la contraseña.
create function api.issue_password_setup(p_user_id uuid, p_token_hash text, p_outbox_id uuid, p_sealed text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_profile app.donor_profiles;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_user_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_outbox_id is null
     or p_sealed is null or char_length(p_sealed) not between 20 and 4000 then
    return jsonb_build_object('kind', 'invalid');
  end if;
  select * into v_profile from app.donor_profiles where donor_id = p_user_id for update;
  if not found or not v_profile.password_setup_required then return jsonb_build_object('kind', 'conflict'); end if;

  -- Misma serialización que la recuperación de contraseña: un solo enlace vigente por cuenta.
  perform pg_advisory_xact_lock(hashtextextended('recovery:' || p_user_id::text, 0));
  update app.action_tokens set invalidated_at = now()
  where kind = 'recuperacion' and subject_id = p_user_id and consumed_at is null and invalidated_at is null;
  insert into app.action_tokens (token_hash, kind, subject_id, expires_at)
  values (p_token_hash, 'recuperacion', p_user_id, now() + interval '1 hour');
  perform app.enqueue_email(p_outbox_id, 'recuperacion', null, null, p_sealed, now() + interval '1 hour');
  perform app.d_audit('donante.contrasena_pendiente', 'user', p_user_id, 'sistema');
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- Lo llama el backend DESPUÉS de cambiar la contraseña en Auth con éxito; levanta el bloqueo del perfil.
create function api.confirm_password_setup(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_user_id is null then return jsonb_build_object('kind', 'invalid'); end if;
  update app.donor_profiles set password_setup_required = false, updated_at = now()
  where donor_id = p_user_id and password_setup_required;
  if found then perform app.d_audit('donante.contrasena_fijada', 'user', p_user_id, 'sistema'); end if;
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- Propiedad y privilegios
-- ---------------------------------------------------------------------------

alter function api.link_donor_account(uuid, text, uuid, text, text, text, text) owner to app_privileged;
alter function api.get_donor_verification_preview(text) owner to app_privileged;
alter function api.verify_donor_email(text) owner to app_privileged;
alter function api.create_assisted_signup(text, text, text, text) owner to app_privileged;
alter function api.issue_assisted_activation(uuid, uuid, int, text, uuid, text) owner to app_privileged;
alter function api.reissue_donor_verification(text, text, uuid, text, text, text, text) owner to app_privileged;
alter function api.sync_assisted_signup_status() owner to app_privileged;
revoke all on function api.sync_assisted_signup_status() from public, anon, authenticated;
alter function api.reissue_assisted_link(text, text, uuid) owner to app_privileged;
alter function api.get_assisted_activation_preview(text) owner to app_privileged;
alter function api.get_assisted_signup_recipient(uuid, uuid) owner to app_privileged;
alter function api.link_assisted_account(uuid, text) owner to app_privileged;
alter function api.get_email_change_preview(text) owner to app_privileged;
alter function api.consume_email_change(text) owner to app_privileged;
alter function api.issue_password_setup(uuid, text, uuid, text) owner to app_privileged;
alter function api.confirm_password_setup(uuid) owner to app_privileged;

grant execute on function app.in_lima_demo_1(numeric, numeric) to app_privileged, authenticated;
grant execute on function app.d_admin_hospital_id(), app.d_token_state(text, text), app.signup_json(uuid, text, timestamptz, timestamptz, timestamptz),
  app.profile_json(app.donor_profiles, text) to app_privileged;
grant execute on function app.signup_json(uuid, text, timestamptz, timestamptz, timestamptz), app.profile_json(app.donor_profiles, text) to authenticated;
grant execute on function
  api.link_donor_account(uuid, text, uuid, text, text, text, text), api.get_donor_verification_preview(text), api.verify_donor_email(text),
  api.get_assisted_activation_preview(text), api.get_assisted_signup_recipient(uuid, uuid), api.link_assisted_account(uuid, text),
  api.issue_assisted_activation(uuid, uuid, int, text, uuid, text), api.reissue_donor_verification(text, text, uuid, text, text, text, text),
  api.get_email_change_preview(text), api.consume_email_change(text), api.issue_password_setup(uuid, text, uuid, text),
  api.confirm_password_setup(uuid)
to authenticated;
grant execute on function
  api.create_assisted_signup(text, text, text, text), api.list_own_assisted_signups(int, timestamptz, uuid),
  api.get_own_assisted_signup(uuid), api.reissue_assisted_link(text, text, uuid),
  api.get_own_donor_profile(),
  api.complete_own_onboarding(text, text, text, text, boolean, numeric, numeric, text),
  api.update_own_participation(text, text, boolean, numeric, numeric, text)
to authenticated;

insert into app.schema_version (version) values ('20261013060000');
