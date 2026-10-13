-- identity-institutions (F2b): tokens de acción de un solo uso, invitación de admins hospitalarios y recuperación
-- de contraseña. Las tablas solo son accesibles por funciones SECURITY DEFINER de la allowlist de ADR-003 (ítems 3 y 4):
-- propiedad de app_privileged, search_path vacío y comprobación explícita del llamador. app_privileged no tiene USAGE
-- sobre el esquema auth, así que estas funciones leen el `sub`, el AAL y el amr del GUC que PostgREST ya validó
-- (app.jwt_claims) y nunca llaman a auth.uid() / auth.jwt().

create table app.action_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('verificacion_email', 'alta_asistida', 'cambio_email', 'recuperacion', 'invitacion_admin')),
  subject_id uuid not null,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index action_tokens_subject_idx on app.action_tokens (kind, subject_id) where consumed_at is null and invalidated_at is null;

create table app.admin_invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references app.hospitals (hospital_id),
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  membership_id uuid references app.hospital_memberships (membership_id),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index admin_invitations_email_idx on app.admin_invitations (email);

alter table app.action_tokens enable row level security;
alter table app.action_tokens force row level security;
alter table app.admin_invitations enable row level security;
alter table app.admin_invitations force row level security;
grant select, insert, update, delete on app.action_tokens, app.admin_invitations to app_privileged;
create policy action_tokens_privileged on app.action_tokens for all to app_privileged using (true) with check (true);
create policy admin_invitations_privileged on app.admin_invitations for all to app_privileged using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Helpers para funciones DEFINER (sin el esquema auth)
-- ---------------------------------------------------------------------------

create function app.jwt_claims() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create function app.d_step_up_fresh(p_max_age interval) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(app.jwt_claims() -> 'amr') = 'array' then app.jwt_claims() -> 'amr' else '[]'::jsonb end) as a
    where a ->> 'method' = 'totp'
      and case when a ->> 'timestamp' ~ '^[0-9]{1,12}$'
               then (a ->> 'timestamp')::bigint >= extract(epoch from now() - p_max_age)::bigint else false end
  )
$$;

-- Equivalente de app.require para DEFINER: null si se cumple todo; si no, el primer fallo.
create function app.d_require(p_roles app.actor_role[], p_aal2 boolean, p_step_up boolean) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_role app.actor_role;
begin
  if app.jwt_sub() is null then return 'unauthenticated'; end if;
  select ua.role into v_role from app.user_accounts ua where ua.user_id = app.jwt_sub();
  if v_role is null or not (v_role = any (p_roles)) then return 'forbidden'; end if;
  if p_aal2 and coalesce(app.jwt_claims() ->> 'aal', '') <> 'aal2' then return 'mfa_required'; end if;
  if p_step_up and not app.d_step_up_fresh(interval '300 seconds') then return 'step_up_required'; end if;
  return null;
end;
$$;

-- Auditoría para DEFINER: el actor sale del JWT (nulo en flujos públicos por token).
create function app.d_audit(p_event text, p_resource_type text, p_resource_id uuid, p_actor_kind text) returns void
language sql set search_path = '' as $$
  insert into app.audit_events (actor_id, actor_kind, event, resource_type, resource_id, result, reason)
  values (app.jwt_sub(), p_actor_kind, p_event, p_resource_type, p_resource_id, 'ok', null)
$$;

-- ---------------------------------------------------------------------------
-- Excepciones DEFINER propiedad de postgres (ADR-003 regla 4 / ADR-006): leen o borran en el esquema auth, al que
-- app_privileged no puede acceder. Cada una hace una sola cosa y tiene EXECUTE restringido.
-- ---------------------------------------------------------------------------

-- `p_min_age`: solo cuentas creadas hace más de ese tiempo (una cuenta recién creada puede ser el registro en curso del
-- propio invitado y no debe tratarse como huérfana).
create function app.user_id_by_email(p_email text, p_min_age interval default interval '0') returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  where lower(u.email) = lower(p_email) and u.deleted_at is null and coalesce(u.created_at, '-infinity'::timestamptz) <= now() - p_min_age
  limit 1
$$;
revoke all on function app.user_id_by_email(text, interval) from public, anon, authenticated;
grant execute on function app.user_id_by_email(text, interval) to app_privileged;

-- Revocación de todas las sesiones de un usuario (GoTrue no ofrece un endpoint por usuario). Solo service_role, desde
-- el adaptador AuthAdmin (ADR-006 punto 3); los refresh tokens caen en cascada.
create function api.worker_revoke_sessions(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_user_id
$$;
revoke all on function api.worker_revoke_sessions(uuid) from public, anon, authenticated;
grant usage on schema api to service_role;
grant execute on function api.worker_revoke_sessions(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Invitación de un admin hospitalario (superadmin + AAL2 + step-up)
-- ---------------------------------------------------------------------------

create function api.invite_hospital_admin(
  p_key text, p_hash text, p_email text, p_hospital_id uuid, p_token_hash text, p_outbox_id uuid, p_sealed text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_authorized boolean;
  v_invitation uuid;
  v_user uuid;
  v_reply jsonb;
begin
  v_fail := app.d_require('{superadmin}', true, true);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;

  if p_key is null or char_length(p_key) not between 16 and 256
     or p_email is null or p_email <> lower(btrim(p_email)) or char_length(p_email) > 254 or p_email !~ '^[^[:space:]@]{1,64}@[^[:space:]@]{1,190}$'
     or p_hospital_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_outbox_id is null or p_sealed is null or char_length(p_sealed) not between 20 and 4000
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('email', p_email), jsonb_build_array('hospitalId', p_hospital_id::text))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  -- Replay o conflicto primero (orden peek → estado → claim): un resultado guardado se devuelve aunque el hospital cambie.
  v_claim := app.peek_idempotency('user:' || app.jwt_sub()::text, 'inviteHospitalAdmin', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  select h.is_authorized into v_authorized from app.hospitals h where h.hospital_id = p_hospital_id;
  if not found then return jsonb_build_object('kind', 'invalid'); end if;
  if not v_authorized then return jsonb_build_object('kind', 'conflict'); end if;

  -- Quien ya tiene cuenta de la aplicación (donante o admin) no se puede invitar como admin.
  v_user := app.user_id_by_email(p_email);
  if v_user is not null and exists (select 1 from app.user_accounts ua where ua.user_id = v_user) then
    return jsonb_build_object('kind', 'conflict');
  end if;

  -- Tope por superadmin (contado sobre invitaciones reales): un superadmin comprometido no puede invitar en masa.
  perform pg_advisory_xact_lock(hashtextextended('invite-quota:' || app.jwt_sub()::text, 0));
  if (select count(*) from app.admin_invitations i where i.created_by = app.jwt_sub() and i.created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('kind', 'rate_limited');
  end if;

  v_claim := app.claim_idempotency('user:' || app.jwt_sub()::text, 'inviteHospitalAdmin', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  -- Serializa invitaciones simultáneas al mismo correo para que solo quede un token vigente.
  perform pg_advisory_xact_lock(hashtextextended('invite:' || p_email, 0));

  -- Una invitación nueva anula las anteriores sin consumir del mismo correo.
  update app.action_tokens t set invalidated_at = now()
  where t.kind = 'invitacion_admin' and t.consumed_at is null and t.invalidated_at is null
    and t.subject_id in (select i.invitation_id from app.admin_invitations i where i.email = p_email);

  insert into app.admin_invitations (hospital_id, email, created_by) values (p_hospital_id, p_email, app.jwt_sub())
  returning invitation_id into v_invitation;
  insert into app.action_tokens (token_hash, kind, subject_id, data, expires_at)
  values (p_token_hash, 'invitacion_admin', v_invitation, jsonb_build_object('hospitalId', p_hospital_id), now() + interval '72 hours');
  perform app.enqueue_email(p_outbox_id, 'invitacion_admin', v_invitation, null, p_sealed, now() + interval '72 hours');
  perform app.d_audit('admin.invitado', 'invitation', v_invitation, 'usuario');

  v_reply := jsonb_build_object('kind', 'ok');
  perform app.complete_idempotency('user:' || app.jwt_sub()::text, 'inviteHospitalAdmin', p_key, v_reply);
  return v_reply;
end;
$$;

-- Vista previa pública por token: nombre del hospital, vencimiento y el correo invitado (solo para la aplicación).
create function api.get_admin_invitation_preview(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_token app.action_tokens;
  v_hospital text;
  v_email text;
  v_user uuid;
begin
  -- Solo la identidad técnica del backend: quien conozca el hash de un token no debe poder consultarlo desde fuera.
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_token from app.action_tokens where token_hash = p_token_hash and kind = 'invitacion_admin';
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_token.consumed_at is not null or v_token.invalidated_at is not null or v_token.expires_at <= now() then
    return jsonb_build_object('kind', 'gone');
  end if;
  select h.public_name, i.email into v_hospital, v_email
  from app.admin_invitations i join app.hospitals h on h.hospital_id = i.hospital_id
  where i.invitation_id = v_token.subject_id;
  if v_hospital is null then return jsonb_build_object('kind', 'not_found'); end if;
  -- Un usuario de Auth con ese correo, sin cuenta de aplicación y de más de un minuto es inerte (alguien se registró antes,
  -- o un registro a medias): quien tiene el token demostró ser dueño del buzón, así que la aplicación puede reemplazarlo.
  -- El minuto evita borrar el registro en curso de un reclamo simultáneo del mismo invitado.
  v_user := app.user_id_by_email(v_email, interval '1 minute');
  if v_user is not null and exists (select 1 from app.user_accounts ua where ua.user_id = v_user) then v_user := null; end if;
  -- El correo es solo para que la aplicación cree la cuenta del invitado; la vista previa HTTP no lo muestra.
  return jsonb_build_object('kind', 'ok', 'hospitalName', v_hospital, 'expiresAt', app.iso(v_token.expires_at), 'email', v_email, 'orphanUserId', v_user);
end;
$$;

-- Vincula la cuenta recién creada con signUp (sesión del propio invitado) a la invitación: crea la cuenta de
-- aplicación y la membresía activa y consume el token. El correo de Auth debe ser el de la invitación.
create function api.link_admin_account(p_token_hash text, p_key text, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token app.action_tokens;
  v_invitation app.admin_invitations;
  v_claim jsonb;
  v_membership uuid;
  v_hospital app.hospitals;
  v_auth_email text;
  v_reply jsonb;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_key is null or char_length(p_key) not between 16 and 256
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('tokenHash', p_token_hash))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_token from app.action_tokens where token_hash = p_token_hash and kind = 'invitacion_admin' for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  v_claim := app.peek_idempotency('token:' || p_token_hash, 'claimHospitalAdminInvitation', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;
  if v_token.consumed_at is not null or v_token.invalidated_at is not null or v_token.expires_at <= now() then
    return jsonb_build_object('kind', 'gone');
  end if;

  select * into v_invitation from app.admin_invitations where invitation_id = v_token.subject_id;
  select * into v_hospital from app.hospitals where hospital_id = v_invitation.hospital_id;
  v_auth_email := lower(app.user_email(app.jwt_sub()));
  if v_auth_email is distinct from v_invitation.email then return jsonb_build_object('kind', 'forbidden'); end if;
  if exists (select 1 from app.user_accounts ua where ua.user_id = app.jwt_sub()) or not v_hospital.is_authorized then
    return jsonb_build_object('kind', 'conflict');
  end if;

  v_claim := app.claim_idempotency('token:' || p_token_hash, 'claimHospitalAdminInvitation', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  insert into app.user_accounts (user_id, role, display_name) values (app.jwt_sub(), 'admin_hospitalario', null);
  insert into app.hospital_memberships (user_id, hospital_id, status, email_hint)
  values (app.jwt_sub(), v_invitation.hospital_id, 'activa',
          left(left(v_invitation.email, 1) || '***@' || split_part(v_invitation.email, '@', 2), 100))
  returning membership_id into v_membership;
  update app.admin_invitations set membership_id = v_membership where invitation_id = v_invitation.invitation_id;
  update app.action_tokens set consumed_at = now() where token_hash = p_token_hash;
  perform app.d_audit('admin.alta', 'membership', v_membership, 'usuario');

  v_reply := jsonb_build_object('kind', 'created', 'hospitalName', v_hospital.public_name);
  perform app.complete_idempotency('token:' || p_token_hash, 'claimHospitalAdminInvitation', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recuperación de contraseña
-- ---------------------------------------------------------------------------

-- Solo la identidad técnica del backend (el token_hash lo genera el servidor: si lo eligiera quien llama, podría
-- apuntar a una víctima y restablecer su contraseña). Responde `ok` exista o no la cuenta (la aplicación iguala además
-- el tiempo); solo si el correo pertenece a una cuenta de usuario final se crea el token (1 h) y se encola el correo.
-- La idempotencia es propia: un reintento con la misma clave no genera otro token ni otro correo.
create function api.request_password_recovery(
  p_email text, p_token_hash text, p_outbox_id uuid, p_sealed text, p_actor_ref text, p_key text, p_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
  v_claim jsonb;
  v_reply jsonb := jsonb_build_object('kind', 'ok');
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]{1,64}@[^[:space:]@]{1,190}$'
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_outbox_id is null
     or p_sealed is null or char_length(p_sealed) not between 20 and 4000
     or p_actor_ref is null or p_actor_ref !~ '^email:[0-9a-f]{64}$'
     or p_key is null or char_length(p_key) not between 16 and 256 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_claim := app.claim_idempotency(p_actor_ref, 'requestPasswordRecovery', p_key, p_hash);
  if v_claim is not null then
    -- Replay: la misma respuesta neutra, sin crear nada.
    if v_claim ->> 'kind' = 'replayed' then return v_reply; end if;
    return v_claim;
  end if;

  v_user := app.user_id_by_email(v_email);
  -- Cuentas de usuario final (donante, admin, superadmin); la identidad técnica `worker` no se recupera por correo.
  if v_user is not null and exists (select 1 from app.user_accounts ua where ua.user_id = v_user and ua.role not in ('worker', 'api_technical')) then
    perform pg_advisory_xact_lock(hashtextextended('recovery:' || v_user::text, 0));
    -- Tope por cuenta (3 enlaces por hora): aunque se salten los límites del backend con la credencial técnica, no se
    -- puede inundar a una víctima ni encadenar intentos. Superado, responde `ok` sin crear nada.
    if (select count(*) from app.action_tokens t where t.kind = 'recuperacion' and t.subject_id = v_user and t.created_at > now() - interval '1 hour') >= 3 then
      perform app.complete_idempotency(p_actor_ref, 'requestPasswordRecovery', p_key, v_reply);
      return v_reply;
    end if;
    update app.action_tokens set invalidated_at = now()
    where kind = 'recuperacion' and subject_id = v_user and consumed_at is null and invalidated_at is null;
    insert into app.action_tokens (token_hash, kind, subject_id, expires_at)
    values (p_token_hash, 'recuperacion', v_user, now() + interval '1 hour');
    perform app.enqueue_email(p_outbox_id, 'recuperacion', null, null, p_sealed, now() + interval '1 hour');
    perform app.d_audit('recuperacion.solicitada', 'user', v_user, 'sistema');
  end if;
  perform app.complete_idempotency(p_actor_ref, 'requestPasswordRecovery', p_key, v_reply);
  return v_reply;
end;
$$;

-- Consume el token de recuperación (un solo uso; solo la identidad técnica) y devuelve el usuario al que cambiar la
-- contraseña. Nunca se repite:
-- un segundo consumo es `gone` aunque la clave de idempotencia coincida (el cuerpo lleva la contraseña nueva).
create function api.consume_password_reset(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token app.action_tokens;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_token from app.action_tokens where token_hash = p_token_hash and kind = 'recuperacion' for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_token.consumed_at is not null or v_token.invalidated_at is not null or v_token.expires_at <= now() then
    return jsonb_build_object('kind', 'gone');
  end if;
  update app.action_tokens set consumed_at = now() where token_hash = p_token_hash;
  perform app.d_audit('recuperacion.completada', 'user', v_token.subject_id, 'sistema');
  return jsonb_build_object('kind', 'ok', 'userId', v_token.subject_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Propiedad y privilegios
-- ---------------------------------------------------------------------------

alter function api.invite_hospital_admin(text, text, text, uuid, text, uuid, text) owner to app_privileged;
alter function api.get_admin_invitation_preview(text) owner to app_privileged;
alter function api.link_admin_account(text, text, text) owner to app_privileged;
alter function api.request_password_recovery(text, text, uuid, text, text, text, text) owner to app_privileged;
alter function api.consume_password_reset(text) owner to app_privileged;

grant execute on function app.jwt_claims(), app.d_step_up_fresh(interval), app.d_require(app.actor_role[], boolean, boolean),
  app.d_audit(text, text, uuid, text) to app_privileged;
grant execute on function api.invite_hospital_admin(text, text, text, uuid, text, uuid, text), api.link_admin_account(text, text, text) to authenticated;
-- Solo `authenticated` (la identidad técnica worker lo es); `anon` no ejecuta ninguna: el backend es la única vía.
grant execute on function api.get_admin_invitation_preview(text), api.request_password_recovery(text, text, uuid, text, text, text, text),
  api.consume_password_reset(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Usuarios de Auth inertes
-- ---------------------------------------------------------------------------

-- Elimina un usuario de Auth SOLO si, en una única sentencia, su correo coincide, no tiene cuenta de aplicación y tiene al
-- menos `p_min_age` de antigüedad: sin carrera entre la comprobación y el borrado (una cuenta con vida propia nunca se
-- borra). Cuarta excepción DEFINER propiedad de postgres (escribe en auth); solo service_role, desde el adaptador AuthAdmin.
create function api.worker_delete_inert_user(p_user_id uuid, p_email text, p_min_age interval) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_deleted int;
begin
  delete from auth.users u
  where u.id = p_user_id and lower(u.email) = lower(p_email)
    and coalesce(u.created_at, '-infinity'::timestamptz) <= now() - p_min_age
    and not exists (select 1 from app.user_accounts ua where ua.user_id = u.id);
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;
revoke all on function api.worker_delete_inert_user(uuid, text, interval) from public, anon, authenticated;
grant execute on function api.worker_delete_inert_user(uuid, text, interval) to service_role;

-- La recuperación y el registro de donantes llevan su propia idempotencia dentro de la RPC técnica; la idempotencia pública
-- previa a la sesión queda reducida al login (se conserva el propietario app_privileged y sus privilegios).
create or replace function api.record_public_idempotency(p_actor_ref text, p_operation text, p_key text, p_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_claim jsonb;
begin
  if p_actor_ref !~ '^(email|token):[0-9a-f]{64}$' or p_operation not in ('createSession') then
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

insert into app.schema_version (version) values ('20261013050000');
