-- Auditoría de denegaciones (RNF-AUD-01, decisión 6 de la persona usuaria): además de los éxitos se registran las respuestas
-- 403 (acceso), 409 (conflicto) y 429 (límite) a un actor autenticado. El backend la llama con la identidad técnica de la API
-- después de responder; el evento lleva el actor y la ruta (con parámetros sin sustituir), nunca valores de la petición.
--
-- Para que un actor no pueda llenar la tabla se deduplica: una fila por actor, evento y ruta cada 10 segundos, y cada minuto
-- para los límites de tasa.

create function api.record_denial(p_actor_id uuid, p_kind text, p_operation text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event text;
  v_window interval;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_actor_id is null or p_kind is null or p_kind not in ('acceso', 'conflicto', 'limite')
     or p_operation is null or char_length(p_operation) > 200 or p_operation !~ '^[A-Z]{3,7} /[A-Za-z0-9_:/.{}-]*$' then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_event := 'denegacion.' || p_kind;
  v_window := case when p_kind = 'limite' then interval '1 minute' else interval '10 seconds' end;
  perform pg_advisory_xact_lock(hashtextextended('denial:' || p_actor_id::text || ':' || v_event || ':' || p_operation, 0));
  if exists (
    select 1 from app.audit_events a
    where a.actor_id = p_actor_id and a.event = v_event and a.reason = p_operation and a.occurred_at > now() - v_window
  ) then
    return jsonb_build_object('kind', 'ok', 'recorded', false);
  end if;
  insert into app.audit_events (actor_id, actor_kind, event, resource_type, resource_id, result, reason)
  values (p_actor_id, 'usuario', v_event, null, null, 'denegado', p_operation);
  return jsonb_build_object('kind', 'ok', 'recorded', true);
end;
$$;

alter function api.record_denial(uuid, text, text) owner to app_privileged;
revoke all on function api.record_denial(uuid, text, text) from public, anon;
grant execute on function api.record_denial(uuid, text, text) to authenticated;

insert into app.schema_version (version) values ('20261013070000');
