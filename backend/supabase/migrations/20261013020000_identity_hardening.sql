-- Endurecimiento de identity-institutions tras la revisión independiente de F2a.
--  * Replay idempotente de operaciones cuyo rechazo depende del estado (revoke, final_demo_at).
--  * Bloqueo de fila para serializar esas operaciones.
--  * Step-up en la revocación de membresías (RNF-SEC-05).
--  * displayName acotado al contrato (120).
--  * consume_idempotency_key solo para operaciones de MFA y solo para cuentas de aplicación.

-- Consulta de solo lectura de una clave de idempotencia: null si no existe; si no, el motivo
-- para que la RPC responda (replayed, payload_conflict o in_progress). No escribe nada.
create function app.peek_idempotency(p_actor_ref text, p_operation text, p_key text, p_hash text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_existing app.idempotency_records;
begin
  select * into v_existing from app.idempotency_records
  where actor_ref = p_actor_ref and operation = p_operation and idem_key = p_key;
  if not found then return null; end if;
  if v_existing.payload_hash <> p_hash then return jsonb_build_object('kind', 'payload_conflict'); end if;
  if v_existing.status = 'completado' then
    return jsonb_build_object('kind', 'replayed', 'response', v_existing.response);
  end if;
  return jsonb_build_object('kind', 'in_progress');
end;
$$;
revoke all on function app.peek_idempotency(text, text, text, text) from public;
grant execute on function app.peek_idempotency(text, text, text, text) to authenticated;

-- displayName del admin hospitalario = nombre público del hospital, recortado al máximo del contrato.
create or replace function api.current_actor() returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_role app.actor_role;
  v_name text;
  v_hospital jsonb;
begin
  select ua.role, ua.display_name into v_role, v_name from app.user_accounts ua where ua.user_id = auth.uid();
  if v_role is null or v_role in ('worker', 'api_technical') then
    return null;
  end if;

  if v_role = 'admin_hospitalario' then
    select jsonb_build_object(
             'hospitalId', h.hospital_id, 'hospitalName', h.public_name,
             'membershipActive', m.status = 'activa', 'hospitalAuthorized', h.is_authorized),
           left(h.public_name, 120)
      into v_hospital, v_name
    from app.hospital_memberships m join app.hospitals h on h.hospital_id = m.hospital_id
    where m.user_id = auth.uid()
    order by (m.status = 'activa') desc, m.created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'role', v_role,
    'displayName', case v_role
      when 'superadmin' then 'Superadministración'
      when 'donante' then coalesce(v_name, 'Donante')
      else coalesce(v_name, 'Administración hospitalaria') end,
    'hospital', v_hospital
  );
end;
$$;

-- Una clave de operación sensible (MFA, step-up) solo vale una vez. Solo para cuentas de
-- aplicación con rol admin o superadmin y solo para las operaciones de MFA.
create or replace function api.consume_idempotency_key(p_operation text, p_key text, p_hash text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
begin
  v_fail := app.require('{admin_hospitalario,superadmin}', false, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_operation not in ('enrollMfaFactor', 'verifyMfaChallenge', 'verifyStepUp')
     or p_hash !~ '^[0-9a-f]{64}$' or char_length(p_key) not between 16 and 255 then
    return jsonb_build_object('kind', 'invalid');
  end if;
  v_claim := app.claim_idempotency('user:' || auth.uid()::text, p_operation, p_key, p_hash);
  if v_claim is null then
    perform app.complete_idempotency('user:' || auth.uid()::text, p_operation, p_key, jsonb_build_object('kind', 'ok'));
    return jsonb_build_object('kind', 'ok');
  end if;
  if v_claim ->> 'kind' = 'replayed' then return jsonb_build_object('kind', 'conflict'); end if;
  return v_claim;
end;
$$;

-- Orden: validar → bloquear la fila → consultar la clave (replay) → rechazar por estado → reclamar.
-- Un replay de una operación ya completada responde con su resultado original aunque el estado
-- haya cambiado por esa misma operación. Ahora exige step-up (RNF-SEC-05).
create or replace function api.revoke_membership(p_key text, p_hash text, p_id uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_membership app.hospital_memberships;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, true);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_reason is null or char_length(p_reason) not between 1 and 300
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('membershipId', p_id::text), jsonb_build_array('status', 'revocada'),
          jsonb_build_array('reason', p_reason))) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  select * into v_membership from app.hospital_memberships where membership_id = p_id for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  v_claim := app.peek_idempotency('user:' || auth.uid()::text, 'revokeHospitalMembership', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;
  if v_membership.status = 'revocada' then return jsonb_build_object('kind', 'conflict'); end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'revokeHospitalMembership', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.hospital_memberships
  set status = 'revocada', revoke_reason = p_reason, revoked_at = now()
  where membership_id = p_id
  returning * into v_membership;
  if not found then raise exception 'membership_update_lost'; end if;
  perform app.write_audit('membresia.revocada', 'membership', p_id, 'ok', null);
  v_reply := jsonb_build_object('kind', 'ok', 'membership', app.membership_json(v_membership));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'revokeHospitalMembership', p_key, v_reply);
  return v_reply;
end;
$$;

create or replace function api.set_final_demo_at(p_key text, p_hash text, p_at timestamptz) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_current timestamptz;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, true);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if p_at is null
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('finalDemoAt', app.iso_ms(p_at)))) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  select final_demo_at into v_current from app.configuration where id for update;

  -- Un replay de la operación ya completada responde antes de evaluar "fecha futura" y "ya fijada".
  v_claim := app.peek_idempotency('user:' || auth.uid()::text, 'setFinalDemoAt', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;
  if p_at <= now() then return jsonb_build_object('kind', 'invalid'); end if;
  if v_current is not null then return jsonb_build_object('kind', 'conflict'); end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'setFinalDemoAt', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  -- PostgREST activa pg_safeupdate: todo UPDATE necesita WHERE.
  update app.configuration set final_demo_at = p_at where id;
  perform app.write_audit('configuracion.final_demo_fijada', 'configuration', null, 'ok', null);
  v_reply := jsonb_build_object('kind', 'ok', 'finalDemoAt', to_jsonb(app.iso(p_at)), 'isImmutable', true);
  perform app.complete_idempotency('user:' || auth.uid()::text, 'setFinalDemoAt', p_key, v_reply);
  return v_reply;
end;
$$;

-- Comprobar `found` tras los UPDATE: si RLS filtrara la fila no se guardaría un replay corrupto.
create or replace function api.update_hospital(
  p_key text, p_hash text, p_id uuid, p_public_name text, p_legal_name text, p_is_authorized boolean
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_hospital app.hospitals;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, true);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if (p_public_name is null and p_legal_name is null and p_is_authorized is null)
     or (p_public_name is not null and char_length(p_public_name) not between 1 and 160)
     or (p_legal_name is not null and char_length(p_legal_name) not between 1 and 200)
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('hospitalId', p_id::text), jsonb_build_array('publicName', p_public_name),
          jsonb_build_array('legalName', p_legal_name), jsonb_build_array('isAuthorized', p_is_authorized))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  -- Los rechazos van antes de reclamar la clave: un `return` confirma la transacción.
  if not exists (select 1 from app.hospitals where hospital_id = p_id) then
    return jsonb_build_object('kind', 'not_found');
  end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'updateHospital', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.hospitals
  set public_name = coalesce(p_public_name, public_name),
      legal_name = coalesce(p_legal_name, legal_name),
      is_authorized = coalesce(p_is_authorized, is_authorized)
  where hospital_id = p_id
  returning * into v_hospital;
  if not found then raise exception 'hospital_update_lost'; end if;

  perform app.write_audit('hospital.actualizado', 'hospital', p_id, 'ok', null);
  v_reply := jsonb_build_object('kind', 'ok', 'hospital', app.hospital_json(v_hospital));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'updateHospital', p_key, v_reply);
  return v_reply;
end;
$$;

create or replace function api.update_hospital_site(
  p_key text, p_hash text, p_site_id uuid, p_public_name text, p_public_address text,
  p_latitude numeric, p_longitude numeric, p_public_instructions text,
  p_is_active boolean, p_is_approved boolean
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_claim jsonb;
  v_site app.sites;
  v_reply jsonb;
begin
  v_fail := app.require('{superadmin}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  if (p_public_name is null and p_public_address is null and p_latitude is null and p_longitude is null
      and p_public_instructions is null and p_is_active is null and p_is_approved is null)
     or (p_public_name is not null and char_length(p_public_name) not between 1 and 160)
     or (p_public_address is not null and char_length(p_public_address) not between 1 and 240)
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180)
     or (p_public_instructions is not null and char_length(p_public_instructions) > 1000)
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('siteId', p_site_id::text), jsonb_build_array('publicName', p_public_name),
          jsonb_build_array('publicAddress', p_public_address), jsonb_build_array('latitude', p_latitude::text),
          jsonb_build_array('longitude', p_longitude::text), jsonb_build_array('publicInstructions', p_public_instructions),
          jsonb_build_array('isActive', p_is_active), jsonb_build_array('isApproved', p_is_approved))) then
    return jsonb_build_object('kind', 'invalid');
  end if;
  if not exists (select 1 from app.sites where site_id = p_site_id) then
    return jsonb_build_object('kind', 'not_found');
  end if;

  v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'updateHospitalSite', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  update app.sites
  set public_name = coalesce(p_public_name, public_name),
      public_address = coalesce(p_public_address, public_address),
      latitude = coalesce(p_latitude, latitude),
      longitude = coalesce(p_longitude, longitude),
      public_instructions = case when p_public_instructions is null then public_instructions
                                 else nullif(p_public_instructions, '') end,
      is_active = coalesce(p_is_active, is_active),
      is_approved = coalesce(p_is_approved, is_approved),
      updated_at = now()
  where site_id = p_site_id
  returning * into v_site;
  if not found then raise exception 'site_update_lost'; end if;
  perform app.write_audit('sede.actualizada', 'site', p_site_id, 'ok', null);
  v_reply := jsonb_build_object('kind', 'ok', 'site', app.site_json(v_site));
  perform app.complete_idempotency('user:' || auth.uid()::text, 'updateHospitalSite', p_key, v_reply);
  return v_reply;
end;
$$;

-- PostgreSQL concede EXECUTE a PUBLIC en toda función nueva; un REVOKE por esquema no lo evita.
-- Se retira de las existentes y el valor por defecto del propietario de las migraciones. Los roles que
-- las necesitan (authenticated, y app_privileged para las DEFINER) ya reciben sus grants explícitos.
revoke execute on all functions in schema app from public;
revoke execute on all functions in schema api from public;
alter default privileges revoke execute on functions from public;
grant execute on all functions in schema app to authenticated, app_privileged;

insert into app.schema_version (version) values ('20261013020000');
