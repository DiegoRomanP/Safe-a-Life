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

create function app.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email) limit 1
$$;
revoke all on function app.user_id_by_email(text) from public, anon, authenticated;
grant execute on function app.user_id_by_email(text) to app_privileged;

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

  select h.is_authorized into v_authorized from app.hospitals h where h.hospital_id = p_hospital_id;
  if not found then return jsonb_build_object('kind', 'invalid'); end if;
  if not v_authorized then return jsonb_build_object('kind', 'conflict'); end if;

  v_claim := app.peek_idempotency('user:' || app.jwt_sub()::text, 'inviteHospitalAdmin', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  -- Quien ya tiene cuenta de la aplicación (donante o admin) no se puede invitar como admin.
  v_user := app.user_id_by_email(p_email);
  if v_user is not null and exists (select 1 from app.user_accounts ua where ua.user_id = v_user) then
    return jsonb_build_object('kind', 'conflict');
  end if;

  v_claim := app.claim_idempotency('user:' || app.jwt_sub()::text, 'inviteHospitalAdmin', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

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
begin
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
  -- El correo es solo para que la aplicación cree la cuenta del invitado; la vista previa HTTP no lo muestra.
  return jsonb_build_object('kind', 'ok', 'hospitalName', v_hospital, 'expiresAt', app.iso(v_token.expires_at), 'email', v_email);
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

-- Pública. Responde `ok` exista o no la cuenta (la aplicación iguala además el tiempo); solo si el correo pertenece a
-- una cuenta de la aplicación se crea el token (1 h) y se encola el correo.
create function api.request_password_recovery(p_email text, p_token_hash text, p_outbox_id uuid, p_sealed text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
begin
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]{1,64}@[^[:space:]@]{1,190}$'
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_outbox_id is null
     or p_sealed is null or char_length(p_sealed) not between 20 and 4000 then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_user := app.user_id_by_email(v_email);
  if v_user is not null and exists (select 1 from app.user_accounts ua where ua.user_id = v_user) then
    update app.action_tokens set invalidated_at = now()
    where kind = 'recuperacion' and subject_id = v_user and consumed_at is null and invalidated_at is null;
    insert into app.action_tokens (token_hash, kind, subject_id, expires_at)
    values (p_token_hash, 'recuperacion', v_user, now() + interval '1 hour');
    perform app.enqueue_email(p_outbox_id, 'recuperacion', null, null, p_sealed, now() + interval '1 hour');
    perform app.d_audit('recuperacion.solicitada', 'user', v_user, 'sistema');
  end if;
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- Consume el token de recuperación (un solo uso) y devuelve el usuario al que cambiar la contraseña. Nunca se repite:
-- un segundo consumo es `gone` aunque la clave de idempotencia coincida (el cuerpo lleva la contraseña nueva).
create function api.consume_password_reset(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token app.action_tokens;
begin
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
alter function api.request_password_recovery(text, text, uuid, text) owner to app_privileged;
alter function api.consume_password_reset(text) owner to app_privileged;

grant execute on function app.jwt_claims(), app.d_step_up_fresh(interval), app.d_require(app.actor_role[], boolean, boolean),
  app.d_audit(text, text, uuid, text) to app_privileged;
grant execute on function api.invite_hospital_admin(text, text, text, uuid, text, uuid, text), api.link_admin_account(text, text, text) to authenticated;
grant execute on function api.get_admin_invitation_preview(text), api.request_password_recovery(text, text, uuid, text),
  api.consume_password_reset(text) to anon, authenticated;

insert into app.schema_version (version) values ('20261013050000');
