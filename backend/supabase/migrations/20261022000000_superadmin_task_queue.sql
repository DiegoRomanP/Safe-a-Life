-- Amplía la cola existente sin cambiar su contrato ni sus permisos INVOKER/RLS.
create or replace function api.list_superadmin_tasks() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_fail text;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  return jsonb_build_object('kind', 'ok', 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'taskId', pending.id, 'kind', pending.kind,
      'createdAt', app.iso(pending.created_at), 'resourceCode', app.opaque_code(pending.id)
    ) order by pending.created_at, pending.id)
    from (
      select s.site_id as id, 'hospital_review'::text as kind, s.created_at
      from app.sites s where not s.is_approved
      union all
      select r.request_id, 'correction_request'::text, r.created_at
      from app.correction_requests r where r.status in ('pendiente', 'aprobada')
    ) pending
  ), '[]'::jsonb));
end;
$$;
