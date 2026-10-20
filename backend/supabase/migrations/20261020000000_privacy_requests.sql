-- privacy-requests (F7), parte 1: solicitudes de corrección o eliminación, decisión del superadmin, grants contextuales y la
-- lectura contextual de los datos del donante.
--
-- Funciones INVOKER (RLS): alta, lectura y listas de solicitudes, decisión y emisión de grants. Una DEFINER de lectura
-- (`get_contextual_donor_data`): cruza propietarios (perfil de un donante y su correo en Auth), así que la lista cerrada de
-- ADR-003 la cubre bajo el ítem 9 (solicitudes de corrección o eliminación). La ejecución va en la migración siguiente.

create table app.correction_requests (
  request_id uuid primary key,
  -- Sin clave foránea: una eliminación borra al usuario de Auth y deja la solicitud como constancia anónima (donor_id nulo).
  donor_id uuid,
  type text not null check (type in ('correccion', 'eliminacion')),
  requested_fields text[] not null
    check (requested_fields <@ array['name', 'email', 'declaredBloodType', 'deletion']::text[] and cardinality(requested_fields) between 1 and 3),
  proposed_name text check (proposed_name is null or char_length(proposed_name) between 1 and 120),
  -- Cifrado en la aplicación (contexto = request_id); nunca se lee por RLS.
  proposed_email_sealed text check (proposed_email_sealed is null or char_length(proposed_email_sealed) between 20 and 4000),
  proposed_blood_type text check (proposed_blood_type is null or proposed_blood_type in ('O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS')),
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada', 'en_ejecucion', 'completada', 'fallida')),
  decision_reason text check (decision_reason is null or char_length(decision_reason) between 1 and 300),
  decided_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'eliminacion') = (requested_fields = array['deletion']::text[])),
  check ((proposed_name is not null) = ('name' = any (requested_fields))),
  check ((proposed_email_sealed is not null) = ('email' = any (requested_fields))),
  check ((proposed_blood_type is not null) = ('declaredBloodType' = any (requested_fields))),
  check (donor_id is not null or status = 'completada')
);
create index correction_requests_donor_idx on app.correction_requests (donor_id, created_at, request_id);
create index correction_requests_created_idx on app.correction_requests (created_at, request_id);
-- Una sola solicitud no terminal por donante y tipo (409 si ya existe).
create unique index correction_requests_open_uidx on app.correction_requests (donor_id, type)
  where status in ('pendiente', 'aprobada', 'en_ejecucion');

create table app.access_grants (
  grant_id uuid primary key default gen_random_uuid(),
  superadmin_id uuid not null,
  request_id uuid not null references app.correction_requests (request_id) on delete cascade,
  action text not null check (action in ('review', 'execute')),
  allowed_fields text[] not null check (allowed_fields <@ array['name', 'email', 'declaredBloodType']::text[] and cardinality(allowed_fields) between 1 and 3),
  reason text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes')
);
create index access_grants_request_idx on app.access_grants (request_id, superadmin_id);

-- Constancia anónima de cada eliminación (V15): solo el HMAC del id; el HMAC se conserva para reaplicar el borrado al
-- restaurar un backup (AP-07).
create table app.deletion_ledger (
  entry_id uuid primary key default gen_random_uuid(),
  subject_hmac text not null unique check (subject_hmac ~ '^[0-9a-f]{64}$'),
  scope text not null check (scope in ('donor_account')),
  executed_at timestamptz not null default now()
);

alter table app.correction_requests enable row level security;
alter table app.correction_requests force row level security;
alter table app.access_grants enable row level security;
alter table app.access_grants force row level security;
alter table app.deletion_ledger enable row level security;
alter table app.deletion_ledger force row level security;

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------

-- Nadie fuera de app_privileged lee proposed_* ni decided_by. `donor_id` se concede porque las RPC INVOKER lo filtran; el
-- esquema `app` no se expone por PostgREST y ninguna RPC lo devuelve.
grant select (request_id, donor_id, type, requested_fields, status, decision_reason, created_at, updated_at) on app.correction_requests to authenticated;
grant insert (request_id, donor_id, type, requested_fields, proposed_name, proposed_email_sealed, proposed_blood_type) on app.correction_requests to authenticated;
grant update (status, decision_reason, decided_by, updated_at) on app.correction_requests to authenticated;
grant select, insert, update, delete on app.correction_requests, app.access_grants, app.deletion_ledger to app_privileged;
grant select (grant_id, superadmin_id, request_id, action, allowed_fields, created_at, expires_at) on app.access_grants to authenticated;
grant insert (superadmin_id, request_id, action, allowed_fields, reason, expires_at) on app.access_grants to authenticated;

create policy correction_requests_own_select on app.correction_requests
  for select to authenticated using (donor_id = (select auth.uid()) and app.current_actor_role() = 'donante');
create policy correction_requests_own_insert on app.correction_requests
  for insert to authenticated
  with check (donor_id = (select auth.uid()) and app.current_actor_role() = 'donante' and (select auth.uid()) is not null);
create policy correction_requests_super_select on app.correction_requests
  for select to authenticated using (app.current_actor_role() = 'superadmin');
create policy correction_requests_super_decide on app.correction_requests
  for update to authenticated
  using (app.current_actor_role() = 'superadmin' and status = 'pendiente')
  with check (app.current_actor_role() = 'superadmin' and status in ('aprobada', 'rechazada') and decided_by = (select auth.uid()));
create policy correction_requests_privileged on app.correction_requests for all to app_privileged using (true) with check (true);

create policy access_grants_super_select on app.access_grants
  for select to authenticated using (superadmin_id = (select auth.uid()) and app.current_actor_role() = 'superadmin');
create policy access_grants_super_insert on app.access_grants
  for insert to authenticated
  with check (superadmin_id = (select auth.uid()) and app.current_actor_role() = 'superadmin'
              and exists (select 1 from app.correction_requests r where r.request_id = access_grants.request_id));
create policy access_grants_privileged on app.access_grants for all to app_privileged using (true) with check (true);
create policy deletion_ledger_privileged on app.deletion_ledger for all to app_privileged using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Proyección (sin valores, sin identificador de donante)
-- ---------------------------------------------------------------------------

create function app.request_json(p_id uuid, p_type text, p_fields text[], p_status text, p_reason text, p_created timestamptz, p_updated timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'requestId', p_id, 'type', p_type,
    'requestedFields', (select coalesce(jsonb_agg(f order by f), '[]'::jsonb) from unnest(p_fields) as f),
    'status', p_status, 'decisionReason', p_reason,
    'createdAt', app.iso(p_created), 'updatedAt', app.iso(p_updated)))
$$;

-- ---------------------------------------------------------------------------
-- Donante: alta y lectura de sus solicitudes (INVOKER)
-- ---------------------------------------------------------------------------

-- p_hash lo calcula la aplicación sobre la intención (el correo propuesto va cifrado, así que SQL no puede recalcularlo).
create function api.create_own_correction_request(
  p_key text, p_hash text, p_request_id uuid, p_type text, p_name text, p_email_sealed text, p_blood_type text
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_fields text[];
  v_row record;
  v_reply jsonb;
begin
  v_fail := app.require('{donante}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;

  v_fields := case
    when p_type = 'eliminacion' then array['deletion']
    else array_remove(array[case when p_blood_type is not null then 'declaredBloodType' end,
                            case when p_email_sealed is not null then 'email' end, case when p_name is not null then 'name' end], null)
  end;
  if p_key is null or char_length(p_key) not between 16 and 256
     or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
     or p_request_id is null
     or p_type is null or p_type not in ('correccion', 'eliminacion')
     or (p_type = 'eliminacion' and (p_name is not null or p_email_sealed is not null or p_blood_type is not null))
     or (p_type = 'correccion' and (v_fields is null or cardinality(v_fields) not between 1 and 3))
     or (p_name is not null and (char_length(p_name) not between 1 and 120 or btrim(p_name) = ''))
     or (p_email_sealed is not null and char_length(p_email_sealed) not between 20 and 4000)
     or (p_blood_type is not null and p_blood_type not in ('O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS')) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  -- Solo quien tiene un perfil verificado puede pedir cambios sobre él.
  if not exists (select 1 from app.donor_profiles p where p.donor_id = auth.uid() and p.status <> 'pendiente_verificacion') then
    return jsonb_build_object('kind', 'forbidden');
  end if;

  v_claim := app.peek_idempotency('user:' || auth.uid()::text, 'createOwnCorrectionRequest', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  -- Tope: 10 solicitudes por donante y día (cuenta filas reales; un replay no crea ninguna).
  if (select count(*) from app.correction_requests r where r.donor_id = auth.uid() and r.created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('kind', 'rate_limited');
  end if;
  if exists (select 1 from app.correction_requests r
             where r.donor_id = auth.uid() and r.type = p_type and r.status in ('pendiente', 'aprobada', 'en_ejecucion')) then
    return jsonb_build_object('kind', 'conflict');
  end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'createOwnCorrectionRequest', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  begin
    insert into app.correction_requests (request_id, donor_id, type, requested_fields, proposed_name, proposed_email_sealed, proposed_blood_type)
    values (p_request_id, auth.uid(), p_type, v_fields, p_name, p_email_sealed, p_blood_type);
  exception when unique_violation then
    -- Carrera con otra solicitud abierta del mismo tipo (o id repetido): la clave queda sin completar y vence a las 72 h.
    return jsonb_build_object('kind', 'conflict');
  end;
  select r.request_id, r.type, r.requested_fields, r.status, r.decision_reason, r.created_at, r.updated_at into v_row
  from app.correction_requests r where r.request_id = p_request_id;
  perform app.write_audit('solicitud.creada', 'correction_request', p_request_id, 'ok', null);

  v_reply := jsonb_build_object('kind', 'created',
    'request', app.request_json(v_row.request_id, v_row.type, v_row.requested_fields, v_row.status, v_row.decision_reason, v_row.created_at, v_row.updated_at));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'createOwnCorrectionRequest', p_key, v_reply);
  return v_reply;
end;
$$;

create function api.list_own_correction_requests(p_limit int, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_items jsonb;
  v_next jsonb;
begin
  v_fail := app.require('{donante}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_limit is null or p_limit not between 1 and 100 or (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  with page as (
    select r.created_at, r.request_id,
           app.request_json(r.request_id, r.type, r.requested_fields, r.status, r.decision_reason, r.created_at, r.updated_at) as j,
           row_number() over (order by r.created_at desc, r.request_id desc) as rn
    from app.correction_requests r
    where r.donor_id = auth.uid()
      and (p_cursor_created_at is null or (r.created_at, r.request_id) < (p_cursor_created_at, p_cursor_id))
    order by r.created_at desc, r.request_id desc
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('createdAt', app.iso(p.created_at), 'id', p.request_id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;
  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

create function api.get_own_correction_request(p_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_row record;
begin
  v_fail := app.require('{donante}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  select r.request_id, r.type, r.requested_fields, r.status, r.decision_reason, r.created_at, r.updated_at into v_row
  from app.correction_requests r where r.request_id = p_id and r.donor_id = auth.uid();
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  return jsonb_build_object('kind', 'ok',
    'request', app.request_json(v_row.request_id, v_row.type, v_row.requested_fields, v_row.status, v_row.decision_reason, v_row.created_at, v_row.updated_at));
end;
$$;

-- ---------------------------------------------------------------------------
-- Superadmin: lista, consulta y decisión (INVOKER; sin valores personales)
-- ---------------------------------------------------------------------------

create function api.list_correction_requests(p_limit int, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null) returns jsonb
language plpgsql stable set search_path = '' as $$
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
    select r.created_at, r.request_id,
           app.request_json(r.request_id, r.type, r.requested_fields, r.status, r.decision_reason, r.created_at, r.updated_at) as j,
           row_number() over (order by r.created_at desc, r.request_id desc) as rn
    from app.correction_requests r
    where (p_cursor_created_at is null or (r.created_at, r.request_id) < (p_cursor_created_at, p_cursor_id))
    order by r.created_at desc, r.request_id desc
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('createdAt', app.iso(p.created_at), 'id', p.request_id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;
  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

create function api.get_correction_request(p_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_fail text;
  v_row record;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  select r.request_id, r.type, r.requested_fields, r.status, r.decision_reason, r.created_at, r.updated_at into v_row
  from app.correction_requests r where r.request_id = p_id;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  return jsonb_build_object('kind', 'ok',
    'request', app.request_json(v_row.request_id, v_row.type, v_row.requested_fields, v_row.status, v_row.decision_reason, v_row.created_at, v_row.updated_at));
end;
$$;

create function api.decide_correction_request(p_key text, p_hash text, p_id uuid, p_decision text, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_status text;
  v_row record;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_key is null or char_length(p_key) not between 16 and 256 or p_id is null
     or p_decision is null or p_decision not in ('aprobada', 'rechazada')
     or p_reason is null or char_length(p_reason) not between 1 and 300 or btrim(p_reason) = ''
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('requestId', p_id::text), jsonb_build_array('decision', p_decision), jsonb_build_array('reason', p_reason))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_claim := app.peek_idempotency('user:' || auth.uid()::text, 'decideCorrectionRequest', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  select r.status into v_status from app.correction_requests r where r.request_id = p_id;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if v_status <> 'pendiente' then return jsonb_build_object('kind', 'conflict'); end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'decideCorrectionRequest', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  -- RLS solo deja actualizar una `pendiente`: cualquier otro estado afecta a cero filas → conflicto.
  update app.correction_requests set status = p_decision, decision_reason = p_reason, decided_by = auth.uid(), updated_at = now()
  where request_id = p_id and status = 'pendiente';
  if not found then
    return jsonb_build_object('kind', 'conflict');
  end if;
  perform app.write_audit('solicitud.decidida', 'correction_request', p_id, 'ok', p_decision);
  select r.request_id, r.type, r.requested_fields, r.status, r.decision_reason, r.created_at, r.updated_at into v_row
  from app.correction_requests r where r.request_id = p_id;

  v_reply := jsonb_build_object('kind', 'ok',
    'request', app.request_json(v_row.request_id, v_row.type, v_row.requested_fields, v_row.status, v_row.decision_reason, v_row.created_at, v_row.updated_at));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'decideCorrectionRequest', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants contextuales (superadmin + AAL2 + step-up; vigencia de 10 minutos)
-- ---------------------------------------------------------------------------

create function api.create_contextual_access_grant(p_key text, p_hash text, p_request_id uuid, p_action text, p_allowed_fields text[], p_reason text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_request record;
  v_fields text[];
  v_grant record;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, true);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  select array(select distinct f from unnest(p_allowed_fields) as f order by f) into v_fields;
  if p_key is null or char_length(p_key) not between 16 and 256 or p_request_id is null
     or p_action is null or p_action not in ('review', 'execute')
     or p_allowed_fields is null or cardinality(p_allowed_fields) <> cardinality(v_fields)
     or cardinality(v_fields) not between 1 and 3 or not (v_fields <@ array['name', 'email', 'declaredBloodType']::text[])
     or p_reason is null or char_length(p_reason) not between 1 and 300 or btrim(p_reason) = ''
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('requestId', p_request_id::text), jsonb_build_array('action', p_action),
          jsonb_build_array('allowedFields', array_to_string(v_fields, ',')), jsonb_build_array('reason', p_reason))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_claim := app.peek_idempotency('user:' || auth.uid()::text, 'createContextualAccessGrant', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  select r.type, r.requested_fields, r.status into v_request from app.correction_requests r where r.request_id = p_request_id;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  -- Revisar exige una solicitud viva; ejecutar, una aprobada. En una corrección los campos autorizados deben estar entre los
  -- pedidos; una eliminación puede revisar cualquiera (muestra qué se borrará).
  if p_action = 'review' and v_request.status not in ('pendiente', 'aprobada', 'en_ejecucion') then return jsonb_build_object('kind', 'conflict'); end if;
  if p_action = 'execute' and v_request.status <> 'aprobada' then return jsonb_build_object('kind', 'conflict'); end if;
  if v_request.type = 'correccion' and not (v_fields <@ v_request.requested_fields) then return jsonb_build_object('kind', 'invalid'); end if;
  if v_request.type = 'correccion' and p_action = 'execute' and not (v_request.requested_fields <@ v_fields) then return jsonb_build_object('kind', 'invalid'); end if;

  -- Tope: 30 grants por superadmin y hora.
  if (select count(*) from app.access_grants g where g.superadmin_id = auth.uid() and g.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('kind', 'rate_limited');
  end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'createContextualAccessGrant', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  insert into app.access_grants (superadmin_id, request_id, action, allowed_fields, reason, expires_at)
  values (auth.uid(), p_request_id, p_action, v_fields, p_reason, now() + interval '10 minutes')
  returning grant_id, expires_at into v_grant;
  perform app.write_audit('grant.creado', 'correction_request', p_request_id, 'ok', p_action);

  v_reply := jsonb_build_object('kind', 'created', 'grant', jsonb_build_object(
    'grantId', v_grant.grant_id, 'requestId', p_request_id, 'action', p_action,
    'allowedFields', to_jsonb(v_fields), 'expiresAt', app.iso(v_grant.expires_at)));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'createContextualAccessGrant', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lectura contextual de los datos del donante (DEFINER, ítem 9 de ADR-003)
-- ---------------------------------------------------------------------------

-- Solo con un grant `review` vigente del mismo superadmin y de la misma solicitud. Proyecta la intersección de los campos
-- del grant con los de la solicitud; `newEmail` se muestra como `email`. Nunca escribe valores en la auditoría.
create function api.get_contextual_donor_data(p_request_id uuid, p_grant_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_grant app.access_grants;
  v_request app.correction_requests;
  v_profile app.donor_profiles;
  v_fields text[];
  v_current jsonb := '{}'::jsonb;
  v_proposed jsonb := '{}'::jsonb;
begin
  v_fail := app.d_require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_request_id is null or p_grant_id is null then return jsonb_build_object('kind', 'invalid'); end if;

  select * into v_request from app.correction_requests where request_id = p_request_id;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  -- Un grant inexistente, ajeno, de otra solicitud o de otra acción no distingue el motivo.
  select * into v_grant from app.access_grants
  where grant_id = p_grant_id and request_id = p_request_id and superadmin_id = app.jwt_sub() and action = 'review';
  if not found then return jsonb_build_object('kind', 'forbidden'); end if;
  if v_grant.expires_at <= now() then return jsonb_build_object('kind', 'gone'); end if;
  if v_request.donor_id is null or v_request.status not in ('pendiente', 'aprobada', 'en_ejecucion') then
    return jsonb_build_object('kind', 'conflict');
  end if;

  -- Solo los campos autorizados que además necesita la solicitud (una eliminación muestra los del grant, sin propuesta).
  v_fields := case when v_request.type = 'eliminacion' then v_grant.allowed_fields
                   else array(select f from unnest(v_grant.allowed_fields) as f where f = any (v_request.requested_fields)) end;
  select * into v_profile from app.donor_profiles where donor_id = v_request.donor_id;
  if not found then return jsonb_build_object('kind', 'conflict'); end if;

  if 'name' = any (v_fields) then v_current := v_current || jsonb_build_object('name', v_profile.name); end if;
  if 'declaredBloodType' = any (v_fields) then v_current := v_current || jsonb_build_object('declaredBloodType', v_profile.declared_blood_type); end if;
  if 'email' = any (v_fields) then v_current := v_current || jsonb_build_object('email', app.user_email(v_request.donor_id)); end if;
  v_current := jsonb_strip_nulls(v_current);

  if v_request.type = 'correccion' then
    if 'name' = any (v_fields) then v_proposed := v_proposed || jsonb_build_object('name', v_request.proposed_name); end if;
    if 'declaredBloodType' = any (v_fields) then v_proposed := v_proposed || jsonb_build_object('declaredBloodType', v_request.proposed_blood_type); end if;
    -- El correo propuesto viaja cifrado: lo abre la aplicación, que lo coloca en `email`.
    if 'email' = any (v_fields) then v_proposed := v_proposed || jsonb_build_object('email', null); end if;
  end if;

  perform app.d_audit('grant.usado', 'correction_request', p_request_id, 'usuario');
  return jsonb_build_object('kind', 'ok', 'currentValues', v_current, 'proposedValues', v_proposed,
    'proposedEmailSealed', case when v_request.type = 'correccion' and 'email' = any (v_fields) then v_request.proposed_email_sealed end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Propiedad y privilegios
-- ---------------------------------------------------------------------------

alter function api.get_contextual_donor_data(uuid, uuid) owner to app_privileged;

grant execute on function app.request_json(uuid, text, text[], text, text, timestamptz, timestamptz) to authenticated;
grant execute on function
  api.create_own_correction_request(text, text, uuid, text, text, text, text),
  api.list_own_correction_requests(int, timestamptz, uuid), api.get_own_correction_request(uuid),
  api.list_correction_requests(int, timestamptz, uuid), api.get_correction_request(uuid),
  api.decide_correction_request(text, text, uuid, text, text),
  api.create_contextual_access_grant(text, text, uuid, text, text[], text),
  api.get_contextual_donor_data(uuid, uuid)
to authenticated;

insert into app.schema_version (version) values ('20261020000000');
