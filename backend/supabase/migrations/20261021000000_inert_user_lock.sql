-- B1: la limpieza de usuarios inertes no puede borrar una cuenta vinculada en paralelo. El borrado de una sola sentencia
-- evaluaba «sin cuenta» con una instantánea anterior a la vinculación; como user_accounts.user_id es ON DELETE CASCADE,
-- al confirmar la vinculación el usuario de Auth se borraba y arrastraba la cuenta. Ahora se bloquea la fila de Auth
-- (FOR UPDATE: espera a toda vinculación en curso y la bloquea después), se revalida con instantánea nueva y solo entonces
-- se borra. Mismo propietario (postgres), search_path y concesiones: solo service_role.

create or replace function api.worker_delete_inert_user(p_user_id uuid, p_email text, p_min_age interval) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select u.id into v_id from auth.users u
  where u.id = p_user_id and lower(u.email) = lower(p_email)
    and coalesce(u.created_at, '-infinity'::timestamptz) <= now() - p_min_age
  for update;
  if not found then return false; end if;
  -- Sentencia nueva (READ COMMITTED): ve la cuenta que una vinculación concurrente acaba de confirmar.
  if exists (select 1 from app.user_accounts ua where ua.user_id = v_id) then return false; end if;
  delete from auth.users where id = v_id;
  return true;
end;
$$;

insert into app.schema_version (version) values ('20261021000000');
