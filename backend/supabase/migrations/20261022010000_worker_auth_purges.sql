-- P-12 (b2), decisión de la persona usuaria 2026-10-22: las purgas de Auth del worker se hacen en la base, sin service_role.
-- Helpers DEFINER propiedad de postgres (único rol con acceso a auth; ADR-003 regla 6, ampliada) ejecutables solo por
-- app_privileged, y una RPC de worker (app_privileged) que los llama. También: el reset de contraseña borra los factores MFA de las donantes.

-- Cuenta asistida reclamada e incompleta de más de 30 días (V8). Bloquea el perfil (espera una activación en curso) y
-- después la fila de Auth, y revalida con instantánea nueva: una donante que se activa en paralelo no se borra (patrón B1).
create function app.delete_stale_assisted_account(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from app.donor_profiles p where p.donor_id = p_user_id for update;
  if not found then return false; end if;
  perform 1 from auth.users u where u.id = p_user_id for update;
  if not found then return false; end if;
  if not exists (select 1 from app.user_accounts ua where ua.user_id = p_user_id and ua.role = 'donante')
     or not exists (select 1 from app.donor_profiles p where p.donor_id = p_user_id and p.status <> 'activo')
     or not exists (select 1 from app.assisted_signups s where s.donor_id = p_user_id and s.status = 'reclamada_incompleta'
                    and s.created_at <= now() - interval '30 days') then
    return false;
  end if;
  -- Las correcciones guardan datos propuestos y su donor_id no tiene FK: se borran aquí (las concesiones caen en cascada).
  delete from app.correction_requests where donor_id = p_user_id;
  delete from auth.users where id = p_user_id;
  return true;
end;
$$;

-- Usuarios de Auth sin cuenta de aplicación y de más de p_min_age (signUp público abandonado). Salta los bloqueados por una
-- vinculación en curso y revalida con la fila bloqueada (B1). Devuelve solo el conteo.
create function app.purge_inert_auth_users(p_min_age interval, p_limit int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  -- Defensa en profundidad: una cuenta de menos de 24 h puede ser un registro en curso.
  if p_min_age is null or p_min_age < interval '24 hours' then raise exception 'purge_inert_auth_users: edad minima de 24 horas'; end if;
  for v_id in
    select u.id from auth.users u
    where not exists (select 1 from app.user_accounts ua where ua.user_id = u.id)
      and coalesce(u.created_at, '-infinity'::timestamptz) <= now() - p_min_age
    order by u.created_at limit p_limit
  loop
    perform 1 from auth.users u where u.id = v_id for update skip locked;
    if not found then continue; end if;
    if exists (select 1 from app.user_accounts ua where ua.user_id = v_id) then continue; end if;
    delete from auth.users where id = v_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Borra los factores MFA de un usuario con rol donante (los retos y los códigos de recuperación caen en cascada).
create function app.delete_mfa_factors(p_user_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  -- Solo donantes: el riesgo es el autorregistro ajeno. Admin y superadmin nacen por invitación y conservan su factor;
  -- sin cuenta de aplicación no se toca nada.
  delete from auth.mfa_factors f where f.user_id = p_user_id
    and exists (select 1 from app.user_accounts ua where ua.user_id = p_user_id and ua.role = 'donante');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function app.delete_stale_assisted_account(uuid), app.purge_inert_auth_users(interval, int), app.delete_mfa_factors(uuid)
from public, anon, authenticated, service_role;
grant execute on function app.delete_stale_assisted_account(uuid), app.purge_inert_auth_users(interval, int), app.delete_mfa_factors(uuid)
to app_privileged;

-- Solo el worker. Devuelve únicamente conteos.
create function api.worker_purge_auth_accounts(p_limit int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_stale int := 0;
  v_inert int;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_limit is null or p_limit not between 1 and 500 then return jsonb_build_object('kind', 'invalid'); end if;
  for v_id in
    select s.donor_id from app.assisted_signups s
    where s.status = 'reclamada_incompleta' and s.donor_id is not null and s.created_at <= now() - interval '30 days'
    order by s.created_at limit p_limit
  loop
    if app.delete_stale_assisted_account(v_id) then
      v_stale := v_stale + 1;
      perform app.d_audit('cuenta.purga_vencida', 'user', v_id, 'sistema');
    end if;
  end loop;
  v_inert := app.purge_inert_auth_users(interval '24 hours', p_limit);
  return jsonb_build_object('kind', 'ok', 'staleDeleted', v_stale, 'inertDeleted', v_inert);
end;
$$;

alter function api.worker_purge_auth_accounts(int) owner to app_privileged;
revoke all on function api.worker_purge_auth_accounts(int) from public, anon, service_role;
grant execute on function api.worker_purge_auth_accounts(int) to authenticated;

-- Las cuentas vencidas ya no se devuelven (`staleAccounts` desaparece): las borra api.worker_purge_auth_accounts.

create or replace function api.worker_purge_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_idempotency int;
  v_tokens int;
  v_rate int;
  v_grants int;
  v_signups int;
  v_requests int;
  v_deletions int;
  v_pending jsonb;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_worker() then return jsonb_build_object('kind', 'forbidden'); end if;

  -- RNF-REL-02: 72 h tras el estado terminal (una clave abandonada en curso también se descarta a las 72 h).
  delete from app.idempotency_records
  where terminal_at <= now() - interval '72 hours' or (terminal_at is null and created_at <= now() - interval '72 hours');
  get diagnostics v_idempotency = row_count;
  delete from app.action_tokens where expires_at <= now() - interval '24 hours';
  get diagnostics v_tokens = row_count;
  delete from app.rate_limit_events where occurred_at <= now() - interval '1 day';
  get diagnostics v_rate = row_count;
  delete from app.access_grants where expires_at <= now() - interval '1 day';
  get diagnostics v_grants = row_count;
  -- Altas asistidas sin reclamar (correo y nombre) pasado su purge_at; las reclamadas e incompletas, cuando su cuenta ya no existe.
  delete from app.assisted_signups s
  where (s.status in ('pendiente', 'vencida') and s.purge_at <= now())
     or (s.status = 'reclamada_incompleta' and not exists (select 1 from app.donor_profiles p where p.donor_id = s.donor_id));
  get diagnostics v_signups = row_count;

  -- Cambio de correo que no llegó a buen puerto: sin enlace emitido a tiempo, enlace vencido o anulado, o consumido sin cierre.
  update app.correction_requests r set status = 'fallida', updated_at = now()
  where r.status = 'en_ejecucion' and r.type = 'correccion' and 'email' = any (r.requested_fields)
    and (
      exists (select 1 from app.action_tokens t where t.kind = 'cambio_email' and t.data ->> 'requestId' = r.request_id::text
              and t.consumed_at is null and (t.invalidated_at is not null or t.expires_at <= now()))
      or (not exists (select 1 from app.action_tokens t where t.kind = 'cambio_email' and t.data ->> 'requestId' = r.request_id::text)
          and r.updated_at <= now() - interval '15 minutes')
      or (exists (select 1 from app.action_tokens t where t.kind = 'cambio_email' and t.data ->> 'requestId' = r.request_id::text and t.consumed_at is not null)
          and r.updated_at <= now() - interval '1 hour'));
  get diagnostics v_requests = row_count;
  -- Eliminación que quedó a medias: con el usuario aún vivo se da por fallida; sin él, solo falta el ledger.
  update app.correction_requests r set status = 'fallida', updated_at = now()
  where r.status = 'en_ejecucion' and r.type = 'eliminacion' and r.updated_at <= now() - interval '15 minutes'
    and exists (select 1 from app.donor_profiles p where p.donor_id = r.donor_id);
  get diagnostics v_deletions = row_count;
  v_requests := v_requests + v_deletions;

  select coalesce(jsonb_agg(jsonb_build_object('requestId', r.request_id, 'donorId', r.donor_id)), '[]'::jsonb) into v_pending
  from (select request_id, donor_id from app.correction_requests
        where status = 'en_ejecucion' and type = 'eliminacion' and updated_at <= now() - interval '15 minutes'
          and not exists (select 1 from app.donor_profiles p where p.donor_id = correction_requests.donor_id)
        order by updated_at limit 50) r;

  return jsonb_build_object('kind', 'ok', 'purged', jsonb_build_object(
      'idempotencyRecords', v_idempotency, 'actionTokens', v_tokens, 'rateLimitEvents', v_rate, 'accessGrants', v_grants, 'assistedSignups', v_signups),
    'failedRequests', v_requests, 'pendingDeletions', v_pending);
end;
$$;

-- Reset de contraseña: cuerpo de 20261022000000 más el borrado de factores MFA.
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
  -- Decisión 2026-10-22: en cuentas de donante un factor creado antes del reset no sobrevive; admin y superadmin conservan el suyo.
  perform app.delete_mfa_factors(v_token.subject_id);
  perform app.d_audit('recuperacion.completada', 'user', v_token.subject_id, 'sistema');
  return jsonb_build_object('kind', 'ok', 'userId', v_token.subject_id, 'generation', v_generation);
end;
$$;

insert into app.schema_version (version) values ('20261022010000');
