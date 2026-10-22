-- ADR-007: barrera de sesión tras el reset de contraseña (SP-01). Un JWT solo autoriza si el usuario no tiene barrera o
-- si su session_id fue admitido en la generación vigente de una barrera cerrada. Solo hacia delante.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table app.session_barriers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  generation int not null check (generation >= 1),
  state text not null check (state in ('abierta', 'cerrada')),
  updated_at timestamptz not null default now()
);
create table app.admitted_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  generation int not null,
  admitted_at timestamptz not null default now()
);
create index admitted_sessions_user_idx on app.admitted_sessions (user_id);
create table app.login_tickets (
  ticket_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null si el correo no tiene cuenta
  generation int not null,            -- 0 = sin barrera
  barrier_open boolean not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index login_tickets_created_idx on app.login_tickets (created_at);

alter table app.session_barriers enable row level security;
alter table app.session_barriers force row level security;
alter table app.admitted_sessions enable row level security;
alter table app.admitted_sessions force row level security;
alter table app.login_tickets enable row level security;
alter table app.login_tickets force row level security;

grant select, insert, update, delete on app.session_barriers, app.admitted_sessions, app.login_tickets to app_privileged;
grant select (user_id, generation, state) on app.session_barriers to authenticated;
grant select (session_id, user_id, generation) on app.admitted_sessions to authenticated;

create policy session_barriers_privileged on app.session_barriers for all to app_privileged using (true) with check (true);
create policy admitted_sessions_privileged on app.admitted_sessions for all to app_privileged using (true) with check (true);
create policy login_tickets_privileged on app.login_tickets for all to app_privileged using (true) with check (true);
-- Estas dos políticas no llaman a la barrera: evita la recursión con app.session_admitted().
create policy session_barriers_own_select on app.session_barriers for select to authenticated using (user_id = (select auth.uid()));
create policy admitted_sessions_own_select on app.admitted_sessions for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Para INVOKER y RLS (rol authenticated). La comparación es por texto: un session_id ausente o raro no coincide y no falla.
create function app.session_admitted() returns boolean
language sql stable set search_path = '' as $$
  select not exists (select 1 from app.session_barriers b where b.user_id = auth.uid())
      or exists (select 1 from app.session_barriers b
                 join app.admitted_sessions a on a.user_id = b.user_id and a.generation = b.generation
                 where b.user_id = auth.uid() and b.state = 'cerrada'
                   and a.session_id::text = lower(coalesce(auth.jwt() ->> 'session_id', '')))
$$;

-- Mismo criterio para DEFINER (sin el esquema auth).
create function app.d_session_admitted() returns boolean
language sql stable set search_path = '' as $$
  select not exists (select 1 from app.session_barriers b where b.user_id = app.jwt_sub())
      or exists (select 1 from app.session_barriers b
                 join app.admitted_sessions a on a.user_id = b.user_id and a.generation = b.generation
                 where b.user_id = app.jwt_sub() and b.state = 'cerrada'
                   and a.session_id::text = lower(coalesce(app.jwt_claims() ->> 'session_id', '')))
$$;

-- Abre la barrera (generación + 1, se borran las admisiones). Se usa dentro de DEFINER.
create function app.open_session_barrier(p_user_id uuid) returns int
language plpgsql set search_path = '' as $$
declare
  v_generation int;
begin
  perform pg_advisory_xact_lock(hashtextextended('session-barrier:' || p_user_id::text, 0));
  insert into app.session_barriers (user_id, generation, state) values (p_user_id, 1, 'abierta')
  on conflict (user_id) do update set generation = app.session_barriers.generation + 1, state = 'abierta', updated_at = now()
  returning generation into v_generation;
  delete from app.admitted_sessions where user_id = p_user_id;
  perform app.d_audit('sesion.barrera_abierta', 'user', p_user_id, 'sistema');
  return v_generation;
end;
$$;

grant execute on function app.session_admitted() to authenticated;
grant execute on function app.d_session_admitted(), app.open_session_barrier(uuid) to app_privileged;

-- ---------------------------------------------------------------------------
-- RPC técnicas (DEFINER de app_privileged; solo la sesión api_technical)
-- ---------------------------------------------------------------------------

-- Ticket previo al login: captura la generación y el estado de la barrera ANTES de llamar a Auth. Responde ok exista o no la
-- cuenta (sin enumeración).
create function api.issue_login_ticket(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_user uuid;
  v_generation int;
  v_state text;
  v_ticket uuid;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  v_email := lower(btrim(coalesce(p_email, '')));
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    return jsonb_build_object('kind', 'invalid');
  end if;
  delete from app.login_tickets where created_at < now() - interval '10 minutes';
  v_user := app.user_id_by_email(v_email);
  if v_user is not null then
    select b.generation, b.state into v_generation, v_state from app.session_barriers b where b.user_id = v_user;
  end if;
  insert into app.login_tickets (user_id, generation, barrier_open)
  values (v_user, coalesce(v_generation, 0), coalesce(v_state = 'abierta', false))
  returning ticket_id into v_ticket;
  return jsonb_build_object('kind', 'ok', 'ticketId', v_ticket);
end;
$$;

-- Admite una sesión nueva con un ticket de la generación vigente y barrera cerrada. Todo rechazo es el mismo `conflict`.
create function api.admit_session(p_ticket_id uuid, p_user_id uuid, p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ticket app.login_tickets;
  v_barrier app.session_barriers;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_ticket_id is null or p_user_id is null or p_session_id is null then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_ticket from app.login_tickets where ticket_id = p_ticket_id for update;
  if not found or v_ticket.consumed_at is not null or v_ticket.created_at < now() - interval '2 minutes'
     or v_ticket.user_id is distinct from p_user_id then
    return jsonb_build_object('kind', 'conflict');
  end if;
  update app.login_tickets set consumed_at = now() where ticket_id = p_ticket_id;
  perform pg_advisory_xact_lock(hashtextextended('session-barrier:' || p_user_id::text, 0));
  select * into v_barrier from app.session_barriers where user_id = p_user_id;
  if v_ticket.barrier_open then return jsonb_build_object('kind', 'conflict'); end if;
  if not found then
    -- Sin barrera: solo vale un ticket de generación 0; no hay nada que admitir.
    if v_ticket.generation <> 0 then return jsonb_build_object('kind', 'conflict'); end if;
    return jsonb_build_object('kind', 'ok');
  end if;
  if v_barrier.state <> 'cerrada' or v_barrier.generation <> v_ticket.generation then
    return jsonb_build_object('kind', 'conflict');
  end if;
  insert into app.admitted_sessions (session_id, user_id, generation) values (p_session_id, p_user_id, v_barrier.generation)
  on conflict do nothing;
  return jsonb_build_object('kind', 'ok');
end;
$$;

-- Cierra la barrera cuando el reset terminó del todo. Idempotente para la misma generación.
create function api.close_session_barrier(p_user_id uuid, p_generation int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_barrier app.session_barriers;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_user_id is null or p_generation is null then return jsonb_build_object('kind', 'invalid'); end if;
  perform pg_advisory_xact_lock(hashtextextended('session-barrier:' || p_user_id::text, 0));
  update app.session_barriers set state = 'cerrada', updated_at = now()
  where user_id = p_user_id and generation = p_generation and state = 'abierta';
  if found then
    perform app.d_audit('sesion.barrera_cerrada', 'user', p_user_id, 'sistema');
    return jsonb_build_object('kind', 'ok');
  end if;
  select * into v_barrier from app.session_barriers where user_id = p_user_id;
  if found and v_barrier.generation = p_generation and v_barrier.state = 'cerrada' then
    return jsonb_build_object('kind', 'ok');
  end if;
  return jsonb_build_object('kind', 'conflict');
end;
$$;

alter function api.issue_login_ticket(text) owner to app_privileged;
alter function api.admit_session(uuid, uuid, uuid) owner to app_privileged;
alter function api.close_session_barrier(uuid, int) owner to app_privileged;
grant execute on function api.issue_login_ticket(text), api.admit_session(uuid, uuid, uuid), api.close_session_barrier(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones existentes: cuerpo actual más la comprobación de la barrera
-- ---------------------------------------------------------------------------

create or replace function app.current_actor_role() returns app.actor_role
language sql stable set search_path = '' as $$
  select ua.role from app.user_accounts ua where ua.user_id = auth.uid() and app.session_admitted()
$$;

create or replace function app.require(p_roles app.actor_role[], p_aal2 boolean, p_step_up boolean) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_role app.actor_role;
begin
  if auth.uid() is null then
    return 'unauthenticated';
  end if;
  if not app.session_admitted() then
    return 'unauthenticated';
  end if;
  v_role := app.current_actor_role();
  if v_role is null or not (v_role = any (p_roles)) then
    return 'forbidden';
  end if;
  if p_aal2 and coalesce(app.current_aal(), '') <> 'aal2' then
    return 'mfa_required';
  end if;
  if p_step_up and not app.step_up_fresh(interval '300 seconds') then
    return 'step_up_required';
  end if;
  return null;
end;
$$;

create or replace function app.d_require(p_roles app.actor_role[], p_aal2 boolean, p_step_up boolean) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_role app.actor_role;
begin
  if app.jwt_sub() is null then return 'unauthenticated'; end if;
  if not app.d_session_admitted() then return 'unauthenticated'; end if;
  select ua.role into v_role from app.user_accounts ua where ua.user_id = app.jwt_sub();
  if v_role is null or not (v_role = any (p_roles)) then return 'forbidden'; end if;
  if p_aal2 and coalesce(app.jwt_claims() ->> 'aal', '') <> 'aal2' then return 'mfa_required'; end if;
  if p_step_up and not app.d_step_up_fresh(interval '300 seconds') then return 'step_up_required'; end if;
  return null;
end;
$$;

-- Abre la barrera al consumir el token y devuelve la generación para cerrarla cuando el reset termine.
create or replace function api.consume_password_reset(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token app.action_tokens;
  v_generation int;
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
  v_generation := app.open_session_barrier(v_token.subject_id);
  perform app.d_audit('recuperacion.completada', 'user', v_token.subject_id, 'sistema');
  return jsonb_build_object('kind', 'ok', 'userId', v_token.subject_id, 'generation', v_generation);
end;
$$;

create or replace function api.verify_donor_email(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_token app.action_tokens;
  v_profile app.donor_profiles;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
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
  if v_profile.password_setup_required then
    perform app.open_session_barrier(v_token.subject_id);
  end if;
  perform app.d_audit('donante.correo_verificado', 'user', v_token.subject_id, 'sistema');
  -- El backend usa `userId` y `email` (nunca van por HTTP) para cerrar las sesiones anteriores y enviar el enlace con el que
  -- el dueño del buzón fija su contraseña.
  return jsonb_build_object('kind', 'ok', 'status', v_profile.status, 'emailVerified', true,
    'userId', v_token.subject_id, 'email', lower(coalesce(app.user_email(v_token.subject_id), '')),
    'passwordSetupRequired', v_profile.password_setup_required);
end;
$$;

-- ---------------------------------------------------------------------------
-- Defensa en profundidad: link_admin_account también exige sesión admitida (cuerpo anterior + una línea)
-- ---------------------------------------------------------------------------

create or replace function api.link_admin_account(p_token_hash text, p_key text, p_hash text) returns jsonb
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
  if not app.d_session_admitted() then return jsonb_build_object('kind', 'unauthenticated'); end if;
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
-- Políticas que solo usaban auth.uid()
-- ---------------------------------------------------------------------------

alter policy user_accounts_own_select on app.user_accounts
  using (user_id = (select auth.uid()) and (select app.session_admitted()));
alter policy memberships_own_select on app.hospital_memberships
  using (user_id = (select auth.uid()) and (select app.session_admitted()));
alter policy audit_events_own_insert on app.audit_events
  with check (actor_id = (select auth.uid()) and actor_kind = 'usuario' and (select app.session_admitted()));
alter policy idempotency_own on app.idempotency_records
  using (actor_ref = 'user:' || (select auth.uid())::text and (select app.session_admitted()))
  with check (actor_ref = 'user:' || (select auth.uid())::text and (select app.session_admitted()));

-- ---------------------------------------------------------------------------
-- Datos: las cuentas que esperan fijar contraseña quedan detrás de una barrera abierta
-- ---------------------------------------------------------------------------

insert into app.session_barriers (user_id, generation, state)
select donor_id, 1, 'abierta' from app.donor_profiles where password_setup_required
on conflict (user_id) do nothing;

insert into app.schema_version (version) values ('20261022000000');
