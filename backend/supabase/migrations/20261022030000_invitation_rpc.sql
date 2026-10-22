-- invitation-coordination (F6-3a): lote de invitaciones, lecturas del hospital y respuesta inicial por token.
-- Contrato reconciliado: docs/plans/2026-10-22-f6-contrato-reconciliado.md §2.3 y §3; ADR-003 (ítems 3, 5 y 6, «Orden de bloqueos» y
-- regla 7: d_require antes que cualquier helper). Todas las DEFINER son propiedad de app_privileged, con search_path vacío y EXECUTE
-- solo para authenticated. Orden de bloqueos (D3): necesidad -> invitation-quota (solo el lote) -> invitaciones -> outbox; toda espera
-- de lock va antes de claim_idempotency (lock_timeout de 2 s). Ninguna de estas rutas toca donor_profiles con FOR UPDATE.

-- Decisiones que el contrato no cubre (constan aquí para la revisión):
--  1. «Cuenta activa» = perfil `activo` + fila en user_accounts con rol donante + sin solicitud de eliminación `en_ejecucion`
--     (V15; la misma condición manda gone en las rutas de token).
--  2. La cascada RF-INV-05 cancela solo el correo `pendiente` de las invitaciones sin respuesta; el `en_curso` queda para F6-4 (D4).
--  3. «Fuera de polígono» no es construible: el check de donor_profiles impide una ubicación fuera de DEMO_ONLY-1; el filtro
--     in_lima_demo_1 del lote es una defensa redundante.
--  4. «Reconocimientos» no existen como tabla: solo la urgencia se prueba como no influyente.
--  5. El borde exacto distancia = radio no es construible con coordenadas reales (la igualdad en doble precisión es de ~1e-12);
--     se prueba la cercanía a ambos lados y el `<=` está en la consulta.
--  6. Los fixtures que borran perfiles/outbox/needs deben respetar el trigger del historial (perfil antes que historial) y las FK
--     current_outbox_id/need_id (invitaciones antes que outbox y necesidad).
--  7. H1 (decisión de la persona usuaria): el lote va en dos pasos como en F5. api.authorize_invitation_batch (admin) emite una
--     concesión de un solo uso (hash en app.invitation_batch_grants, 2 min) y api.request_invitation_batch solo la ejecuta la
--     sesión técnica, que aporta los slots. Todo fallo de la concesión es `not_found` (no revela cuál). La idempotencia es del
--     admin que autorizó; el replay devuelve lo guardado sin volver a consumir. Pendiente F6-4: purga de concesiones (72 h) en el
--     worker, y la barrera de sesión del admin no se revalida en el paso 2 (la concesión vive 2 min).
--
-- Forma de los slots del lote (los prepara la aplicación sin ver candidatos): 5..50 objetos exactos, ids y hashes sin repetir.
create function app.invitation_slots_valid(p_slots jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_n int;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then return false; end if;
  v_n := jsonb_array_length(p_slots);
  if v_n not between 5 and 50 then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(p_slots) e
    where jsonb_typeof(e) <> 'object'
       or (select count(*) from jsonb_object_keys(e)) <> 5
       or coalesce(e ->> 'outboxId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(e ->> 'invitationId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(e ->> 'confirmHash', '') !~ '^[0-9a-f]{64}$'
       or coalesce(e ->> 'rejectHash', '') !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(e -> 'sealedPayload') <> 'string'
       or char_length(e ->> 'sealedPayload') not between 1 and 16384) then
    return false;
  end if;
  return (select count(distinct lower(e ->> 'outboxId')) from jsonb_array_elements(p_slots) e) = v_n
     and (select count(distinct lower(e ->> 'invitationId')) from jsonb_array_elements(p_slots) e) = v_n
     and (select count(distinct h) from (select e ->> 'confirmHash' h from jsonb_array_elements(p_slots) e
                                         union all select e ->> 'rejectHash' from jsonb_array_elements(p_slots) e) t) = 2 * v_n;
end;
$$;
grant execute on function app.invitation_slots_valid(jsonb) to app_privileged;

-- ---------------------------------------------------------------------------
-- Lote en dos pasos (patrón F5, ADR-003 ítem 5): el hospital autoriza, la sesión técnica ejecuta. El admin nunca elige los hashes
-- de los tokens de los donantes (si no, podría responder en nombre de cualquiera): sus slots los prepara el backend.
-- ---------------------------------------------------------------------------

-- Concesión de UN SOLO USO ligada a la necesidad y al admin. Solo el hash del secreto; ≤ 2 min de vida. Se conserva consumida
-- para que el replay con la misma clave encuentre al admin (su purga, a las 72 h como la idempotencia, la hace el worker en F6-4).
create table app.invitation_batch_grants (
  grant_id uuid primary key default gen_random_uuid(),
  need_id uuid not null,
  hospital_id uuid not null,
  admin_id uuid not null,
  secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  foreign key (need_id, hospital_id) references app.needs (need_id, hospital_id),
  check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);
-- Una concesión viva por (necesidad, admin): la nueva sustituye a la anterior.
create unique index invitation_batch_grants_live_uidx on app.invitation_batch_grants (need_id, admin_id) where consumed_at is null;
create index invitation_batch_grants_created_idx on app.invitation_batch_grants (created_at);
alter table app.invitation_batch_grants enable row level security;
alter table app.invitation_batch_grants force row level security;
grant select, insert, update, delete on app.invitation_batch_grants to app_privileged;
create policy invitation_batch_grants_privileged on app.invitation_batch_grants for all to app_privileged using (true) with check (true);

-- Paso 1 (sesión del admin): comprueba autoridad, necesidad y sede, y emite la concesión. Devuelve el secreto UNA vez.
create function api.authorize_invitation_batch(p_need_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_need app.needs;
  v_secret text;
  v_expires timestamptz := now() + interval '2 minutes';
begin
  v_fail := app.d_require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.d_admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_need_id is null then return jsonb_build_object('kind', 'invalid'); end if;

  -- Una necesidad ajena es indistinguible de una inexistente (sin IDOR).
  select * into v_need from app.needs where need_id = p_need_id and hospital_id = v_hospital for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if app.need_status(v_need) <> 'activa' or not exists (
       select 1 from app.sites s where s.site_id = v_need.site_id and s.hospital_id = v_hospital and s.is_active and s.is_approved) then
    return jsonb_build_object('kind', 'conflict');
  end if;

  delete from app.invitation_batch_grants where need_id = p_need_id and admin_id = app.jwt_sub() and consumed_at is null;
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into app.invitation_batch_grants (need_id, hospital_id, admin_id, secret_hash, expires_at)
  values (p_need_id, v_hospital, app.jwt_sub(), encode(extensions.digest(v_secret, 'sha256'), 'hex'), v_expires);
  perform app.d_audit('lote.autorizado', 'need', p_need_id, 'usuario');
  return jsonb_build_object('kind', 'ok', 'grantSecret', v_secret, 'expiresAt', app.iso(v_expires));
end;
$$;

-- Paso 2 (solo la sesión técnica): consume la concesión y crea el lote. Cualquier fallo de la concesión (desconocida, de otra
-- necesidad, consumida, vencida, admin ya no autorizado) es el mismo `not_found`: no revela cuál. Un replay con la misma clave
-- devuelve la respuesta guardada sin volver a consumir la concesión. Si el lote responde invalid/conflict no consume nada.
create function api.request_invitation_batch(p_key text, p_hash text, p_need_id uuid, p_grant text, p_slots jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_need app.needs;
  v_grant app.invitation_batch_grants;
  v_claim jsonb;
  v_n int;
  v_donors uuid[];
  v_batch uuid := gen_random_uuid();
  v_slot jsonb;
  v_invitation uuid;
  v_i int;
  v_reply jsonb;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;

  if p_key is null or char_length(p_key) not between 16 and 255 or p_need_id is null
     or p_grant is null or p_grant !~ '^[0-9a-f]{64}$'
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('needId', p_need_id::text)))
     or not app.invitation_slots_valid(p_slots) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  -- Orden D3: necesidad -> concesión; toda espera antes del claim.
  select * into v_need from app.needs where need_id = p_need_id for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  select * into v_grant from app.invitation_batch_grants
  where need_id = p_need_id and secret_hash = encode(extensions.digest(p_grant, 'sha256'), 'hex') for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  -- La idempotencia es del admin que autorizó (y no de la sesión técnica compartida).
  v_claim := app.peek_idempotency('user:' || v_grant.admin_id::text, 'requestInvitationBatch', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  if v_grant.consumed_at is not null or v_grant.expires_at <= now() or v_grant.hospital_id <> v_need.hospital_id
     or not exists (
       select 1 from app.hospital_memberships m
       join app.hospitals h on h.hospital_id = m.hospital_id
       join app.user_accounts ua on ua.user_id = m.user_id
       where m.user_id = v_grant.admin_id and m.hospital_id = v_need.hospital_id and m.status = 'activa' and h.is_authorized
         and ua.role = 'admin_hospitalario') then
    return jsonb_build_object('kind', 'not_found');
  end if;

  -- O9: la sede debe seguir activa y aprobada (mismo criterio que activar la necesidad).
  if app.need_status(v_need) <> 'activa' or not exists (
       select 1 from app.sites s where s.site_id = v_need.site_id and s.hospital_id = v_need.hospital_id and s.is_active and s.is_approved) then
    return jsonb_build_object('kind', 'conflict');
  end if;
  -- batchSize(meta) = min(50, max(5, 2 * meta)) (batch-size.ts)
  v_n := least(50, greatest(5, 2 * v_need.target_confirmations));
  if jsonb_array_length(p_slots) <> v_n then return jsonb_build_object('kind', 'invalid'); end if;

  -- Cuota 3/24 h global: un único lock, tras la necesidad y antes del claim (D3 regla 1).
  perform pg_advisory_xact_lock(hashtextextended('invitation-quota', 0));

  v_claim := app.claim_idempotency('user:' || v_grant.admin_id::text, 'requestInvitationBatch', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;
  update app.invitation_batch_grants set consumed_at = now() where grant_id = v_grant.grant_id;

  -- Candidatos: matriz RBC, polígono, radio (el borde se incluye), disponibilidad, perfil completo, sin invitación previa a esta
  -- necesidad y con menos de 3 invitaciones en (t-24 h, t]. Orden: exactas, distancia, donor_id. Urgencia y reconocimientos no
  -- intervienen (RNF-SAF-01, B.3). Las altas asistidas sin reclamar no están `activo`.
  select coalesce(array_agg(t.donor_id order by t.is_exact desc, t.d, t.donor_id), '{}') into v_donors
  from (
    select p.donor_id, c.is_exact, app.haversine_m(p.latitude::double precision, p.longitude::double precision,
                                                  s.latitude::double precision, s.longitude::double precision) as d
    from app.donor_profiles p
    join app.rbc_compatibility c on c.donor = p.declared_blood_type and c.recipient = v_need.required_blood_type
    join app.sites s on s.site_id = v_need.site_id
    where p.status = 'activo' and p.is_available
      and p.location_polygon_version = 'DEMO_ONLY-1' and app.in_lima_demo_1(p.latitude, p.longitude)
      and exists (select 1 from app.user_accounts ua where ua.user_id = p.donor_id and ua.role = 'donante')
      and app.haversine_m(p.latitude::double precision, p.longitude::double precision,
                          s.latitude::double precision, s.longitude::double precision) <= v_need.radius_km * 1000::double precision
      and not exists (select 1 from app.invitations i where i.need_id = v_need.need_id and i.donor_id = p.donor_id)
      and not exists (select 1 from app.correction_requests r where r.donor_id = p.donor_id and r.type = 'eliminacion' and r.status = 'en_ejecucion')
      and (select count(*) from app.invitations i where i.donor_id = p.donor_id and i.created_at > now() - interval '24 hours') < 3
    order by c.is_exact desc, d, p.donor_id
    limit v_n
  ) t;

  insert into app.invitation_batches (batch_id, need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
  values (v_batch, v_need.need_id, v_need.hospital_id, v_grant.admin_id, coalesce(cardinality(v_donors), 0), coalesce(cardinality(v_donors), 0));

  -- Slot i <-> candidato i; los slots sobrantes se descartan. El outbox va antes: invitations.current_outbox_id lo referencia.
  for v_i in 1 .. coalesce(cardinality(v_donors), 0) loop
    v_slot := p_slots -> (v_i - 1);
    v_invitation := (v_slot ->> 'invitationId')::uuid;
    perform app.enqueue_email((v_slot ->> 'outboxId')::uuid, 'invitacion', v_invitation, v_donors[v_i], v_slot ->> 'sealedPayload', v_need.expires_at);
    insert into app.invitations (invitation_id, need_id, batch_id, hospital_id, donor_id, need_donor_code, confirm_token_hash, reject_token_hash, current_outbox_id)
    values (v_invitation, v_need.need_id, v_batch, v_need.hospital_id, v_donors[v_i], app.new_need_donor_code(v_need.need_id),
            v_slot ->> 'confirmHash', v_slot ->> 'rejectHash', (v_slot ->> 'outboxId')::uuid);
  end loop;
  -- El actor es el admin que autorizó (la sesión técnica solo ejecuta).
  insert into app.audit_events (actor_id, actor_kind, event, resource_type, resource_id, result, reason)
  values (v_grant.admin_id, 'usuario', 'lote.solicitado', 'invitation_batch', v_batch, 'ok', null);

  v_reply := jsonb_build_object('kind', 'created', 'batchId', v_batch,
    'createdInvitationCount', coalesce(cardinality(v_donors), 0), 'queuedEmailCount', coalesce(cardinality(v_donors), 0));
  perform app.complete_idempotency('user:' || v_grant.admin_id::text, 'requestInvitationBatch', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecturas del hospital
-- ---------------------------------------------------------------------------

-- INVOKER: la RLS de invitations y needs limita todo al hospital del admin. Orden (created_at, batch_id) ascendente.
create function api.list_own_invitation_batches(
  p_need_id uuid, p_limit int, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null
) returns jsonb language plpgsql stable set search_path = '' as $$
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
  if p_need_id is null or p_limit is null or p_limit not between 1 and 100 or (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  if not exists (select 1 from app.needs n where n.need_id = p_need_id and n.hospital_id = v_hospital) then
    return jsonb_build_object('kind', 'not_found');
  end if;

  with page as (
    select b.created_at, b.batch_id,
           jsonb_build_object('batchId', b.batch_id, 'createdAt', app.iso(b.created_at), 'createdInvitationCount', b.created_invitation_count,
             'deliveryCounts', jsonb_build_object(
               'pendiente', (select count(*) from app.invitations i where i.batch_id = b.batch_id and i.delivery = 'pendiente'),
               'enviada', (select count(*) from app.invitations i where i.batch_id = b.batch_id and i.delivery = 'enviada'),
               'entregada', (select count(*) from app.invitations i where i.batch_id = b.batch_id and i.delivery = 'entregada'),
               'fallida', (select count(*) from app.invitations i where i.batch_id = b.batch_id and i.delivery = 'fallida'))) as j,
           row_number() over (order by b.created_at, b.batch_id) as rn
    from app.invitation_batches b
    where b.need_id = p_need_id and b.hospital_id = v_hospital
      and (p_cursor_created_at is null or (b.created_at, b.batch_id) > (p_cursor_created_at, p_cursor_id))
    order by b.created_at, b.batch_id
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('createdAt', app.iso(p.created_at), 'id', p.batch_id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;
  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next);
end;
$$;

-- DEFINER (ADR-003 ítem 6): cruza el perfil del donante, que el admin no puede leer. Nunca devuelve correo, ubicación,
-- distancia ni id global. Una confirmación cuyo donante ya no existe (V15) se omite de `items` y sigue contando (O3).
create function api.list_own_need_responses(
  p_need_id uuid, p_limit int, p_cursor_created_at timestamptz default null, p_cursor_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_need app.needs;
  v_items jsonb;
  v_next jsonb;
begin
  v_fail := app.d_require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.d_admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_need_id is null or p_limit is null or p_limit not between 1 and 100 or (p_cursor_created_at is null) <> (p_cursor_id is null) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  select * into v_need from app.needs where need_id = p_need_id and hospital_id = v_hospital;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  with rows_ as (
    select i.created_at, i.invitation_id,
           case when i.response = 'confirmada' then
             jsonb_build_object('needDonorCode', i.need_donor_code, 'donorName', p.name, 'declaredBloodType', p.declared_blood_type,
                                'response', 'confirmada', 'responseRecordedAt', app.iso(i.response_recorded_at))
           else
             jsonb_build_object('needDonorCode', i.need_donor_code,
               'validity', case when i.validity = 'activa' and now() >= v_need.expires_at then 'vencida' else i.validity end,
               'delivery', i.delivery, 'response', i.response)
           end as j
    from app.invitations i
    left join app.donor_profiles p on p.donor_id = i.donor_id
    where i.need_id = v_need.need_id
      and (i.response <> 'confirmada' or p.donor_id is not null)
      and (p_cursor_created_at is null or (i.created_at, i.invitation_id) > (p_cursor_created_at, p_cursor_id))
  ), page as (
    select r.*, row_number() over (order by r.created_at, r.invitation_id) as rn from rows_ r order by r.created_at, r.invitation_id limit p_limit + 1
  )
  select coalesce(jsonb_agg(j order by rn) filter (where rn <= p_limit), '[]'::jsonb),
         case when count(*) > p_limit then
           (select jsonb_build_object('createdAt', app.iso(p.created_at), 'id', p.invitation_id) from page p where p.rn = p_limit)
         end
    into v_items, v_next
  from page;
  return jsonb_build_object('kind', 'ok', 'items', v_items, 'next', v_next,
    'confirmedIntentCount', (select count(*)::int from app.invitations i where i.need_id = v_need.need_id and i.response = 'confirmada'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Token de acción (DEFINER, ADR-003 ítem 3; solo la sesión técnica)
-- ---------------------------------------------------------------------------

-- Sin efectos ni bloqueos. 404: hash desconocido o rotado; 410: consumido, terminal, vencido, meta alcanzada, invalidada o
-- donante eliminado.
create function api.get_invitation_action_preview(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_inv app.invitations;
  v_need app.needs;
  v_hospital text;
  v_site text;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('kind', 'invalid'); end if;
  select * into v_inv from app.invitations where confirm_token_hash = p_token_hash or reject_token_hash = p_token_hash;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  select * into v_need from app.needs where need_id = v_inv.need_id;
  if v_inv.token_consumed_at is not null or v_inv.response <> 'sin_respuesta' or v_inv.validity <> 'activa'
     or app.need_status(v_need) <> 'activa'
     or v_inv.donor_id is null or not exists (select 1 from app.donor_profiles p where p.donor_id = v_inv.donor_id)
     or exists (select 1 from app.correction_requests r where r.donor_id = v_inv.donor_id and r.type = 'eliminacion' and r.status = 'en_ejecucion') then
    return jsonb_build_object('kind', 'gone');
  end if;
  select h.public_name, s.public_name into v_hospital, v_site
  from app.hospitals h join app.sites s on s.site_id = v_need.site_id where h.hospital_id = v_need.hospital_id;
  return jsonb_build_object('kind', 'ok', 'hospitalName', v_hospital, 'publicSiteName', v_site,
    'intendedAction', case when v_inv.confirm_token_hash = p_token_hash then 'confirmar' else 'rechazar' end,
    'expiresAt', app.iso(v_need.expires_at));
end;
$$;

-- Matriz de §2.3: 404 (desconocido o rotado), 410 (consumido, hermano, terminal, vencido, invalidada, donante eliminado o meta
-- alcanzada al rechazar), 409 (confirmar con la meta alcanzada, V6) y replay 200 solo con la necesidad viva (RF-INV-08).
-- Los hashes se conservan: `token_consumed_at` marca ambos como gastados.
create function api.respond_invitation_by_token(p_token_hash text, p_key text, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_found app.invitations;
  v_inv app.invitations;
  v_need app.needs;
  v_action text;
  v_claim jsonb;
  v_response text;
  v_cascade boolean;
  v_recorded timestamptz;
  v_reply jsonb;
begin
  if app.jwt_sub() is null then return jsonb_build_object('kind', 'unauthenticated'); end if;
  if not app.is_api_technical() then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_key is null or char_length(p_key) not between 16 and 255
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('tokenHash', p_token_hash))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  select * into v_found from app.invitations where confirm_token_hash = p_token_hash or reject_token_hash = p_token_hash;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  -- Orden D3: necesidad -> invitación. Con la invitación bloqueada se revalida el hash (pudo rotar entretanto).
  select * into v_need from app.needs where need_id = v_found.need_id for update;
  select * into v_inv from app.invitations where invitation_id = v_found.invitation_id for update;
  v_action := case when v_inv.confirm_token_hash = p_token_hash then 'confirmar' when v_inv.reject_token_hash = p_token_hash then 'rechazar' end;
  if v_action is null then return jsonb_build_object('kind', 'not_found'); end if;

  -- RF-INV-08: vencida o terminal es 410 también para la repetición con la misma clave.
  if app.need_status(v_need) not in ('activa', 'meta_alcanzada') then return jsonb_build_object('kind', 'gone'); end if;

  v_claim := app.peek_idempotency('token:' || p_token_hash, 'recordInitialInvitationResponse', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  if v_inv.token_consumed_at is not null or v_inv.response <> 'sin_respuesta' then return jsonb_build_object('kind', 'gone'); end if;
  if v_inv.donor_id is null or not exists (select 1 from app.donor_profiles p where p.donor_id = v_inv.donor_id)
     or exists (select 1 from app.correction_requests r where r.donor_id = v_inv.donor_id and r.type = 'eliminacion' and r.status = 'en_ejecucion') then
    return jsonb_build_object('kind', 'gone');
  end if;
  if v_need.status = 'meta_alcanzada' then
    return jsonb_build_object('kind', case when v_action = 'confirmar' then 'conflict' else 'gone' end);
  end if;
  if v_inv.validity <> 'activa' then return jsonb_build_object('kind', 'gone'); end if;

  -- D3 reglas 3 y 4: toda espera de lock va antes del claim (su lock_timeout de 2 s). Las confirmaciones solo cambian bajo el
  -- lock de la necesidad, que ya tenemos: se decide aquí si esta alcanza la meta y se bloquean antes invitaciones y outbox.
  v_cascade := v_action = 'confirmar'
    and (select count(*) from app.invitations i where i.need_id = v_need.need_id and i.response = 'confirmada') + 1 >= v_need.target_confirmations;
  if v_cascade then
    perform 1 from app.invitations i where i.need_id = v_need.need_id and i.validity = 'activa' and i.response = 'sin_respuesta'
      order by i.invitation_id for update;
    perform 1 from app.email_outbox o where o.status = 'pendiente' and o.outbox_id in (
      select i.current_outbox_id from app.invitations i where i.need_id = v_need.need_id and i.validity = 'activa' and i.response = 'sin_respuesta')
      order by o.outbox_id for update;
  end if;

  v_claim := app.claim_idempotency('token:' || p_token_hash, 'recordInitialInvitationResponse', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  v_response := case when v_action = 'confirmar' then 'confirmada' else 'rechazada' end;
  v_recorded := now();
  update app.invitations set response = v_response, response_recorded_at = v_recorded, token_consumed_at = v_recorded
  where invitation_id = v_inv.invitation_id;
  insert into app.invitation_response_history (invitation_id, donor_id, response, channel)
  values (v_inv.invitation_id, v_inv.donor_id, v_response, 'token');
  perform app.d_audit('invitacion.respondida', 'invitation', v_inv.invitation_id, 'token');

  -- RF-INV-05: la meta alcanzada invalida, en la misma transacción, las invitaciones sin respuesta y cancela su correo pendiente.
  if v_cascade then
    update app.needs set status = 'meta_alcanzada', updated_at = now(), version = version + 1
    where need_id = v_need.need_id returning * into v_need;
    update app.email_outbox o set status = 'cancelado', sealed_payload = null, finalized_at = now(), lease_until = null
    where o.status = 'pendiente' and o.outbox_id in (
      select i.current_outbox_id from app.invitations i where i.need_id = v_need.need_id and i.validity = 'activa' and i.response = 'sin_respuesta');
    update app.invitations set validity = 'invalidada' where need_id = v_need.need_id and validity = 'activa' and response = 'sin_respuesta';
  end if;

  v_reply := jsonb_build_object('kind', 'ok', 'response', v_response, 'recordedAt', app.iso(v_recorded), 'needStatus', app.need_status(v_need));
  perform app.complete_idempotency('token:' || p_token_hash, 'recordInitialInvitationResponse', p_key, v_reply);
  return v_reply;
end;
$$;

-- ---------------------------------------------------------------------------
-- Propiedad y privilegios
-- ---------------------------------------------------------------------------

alter function api.authorize_invitation_batch(uuid) owner to app_privileged;
alter function api.request_invitation_batch(text, text, uuid, text, jsonb) owner to app_privileged;
alter function api.list_own_need_responses(uuid, int, timestamptz, uuid) owner to app_privileged;
alter function api.get_invitation_action_preview(text) owner to app_privileged;
alter function api.respond_invitation_by_token(text, text, text) owner to app_privileged;

revoke all on function api.authorize_invitation_batch(uuid), api.request_invitation_batch(text, text, uuid, text, jsonb), api.list_own_invitation_batches(uuid, int, timestamptz, uuid),
  api.list_own_need_responses(uuid, int, timestamptz, uuid), api.get_invitation_action_preview(text),
  api.respond_invitation_by_token(text, text, text) from public, anon, service_role;
grant execute on function api.authorize_invitation_batch(uuid), api.request_invitation_batch(text, text, uuid, text, jsonb), api.list_own_invitation_batches(uuid, int, timestamptz, uuid),
  api.list_own_need_responses(uuid, int, timestamptz, uuid), api.get_invitation_action_preview(text),
  api.respond_invitation_by_token(text, text, text) to authenticated;

insert into app.schema_version (version) values ('20261022030000');
