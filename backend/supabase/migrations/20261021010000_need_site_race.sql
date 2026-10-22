-- B4: carrera crear necesidad / desactivar sede. La sede se lee sin bloqueo y la política de INSERT de app.needs la
-- vuelve a comprobar con una instantánea posterior; si la desactivación se confirmó entre ambas, el insert fallaba con 500
-- en vez del 422 contratado (site_unusable). Mismo contrato, propietario (INVOKER), search_path y concesiones: es un
-- create or replace de la función de 20261013030000.

create or replace function api.create_need_draft(
  p_key text, p_hash text, p_component text, p_required_blood_type text, p_target int, p_site_id text,
  p_radius_km int, p_urgency text, p_expires_in_hours int
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_claim jsonb;
  v_site uuid;
  v_need app.needs;
  v_reply jsonb;
begin
  v_fail := app.require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;

  if p_key is null or char_length(p_key) not between 16 and 255
     or p_component is distinct from 'RBC'
     or p_required_blood_type is null or p_required_blood_type not in ('O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS')
     or p_target is null or p_target not between 1 and 50
     or p_radius_km is null or p_radius_km not between 1 and 50
     or p_urgency is null or p_urgency not in ('Normal', 'Urgente', 'Critica')
     or p_expires_in_hours is null or p_expires_in_hours not between 1 and 72
     or p_site_id is null or p_site_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or p_hash is distinct from app.fingerprint(jsonb_build_array(
          jsonb_build_array('component', p_component), jsonb_build_array('requiredBloodType', p_required_blood_type),
          jsonb_build_array('targetConfirmations', p_target), jsonb_build_array('siteId', p_site_id),
          jsonb_build_array('radiusKm', p_radius_km), jsonb_build_array('urgency', p_urgency),
          jsonb_build_array('expiresInHours', p_expires_in_hours))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  -- Replay o conflicto primero: un resultado ya guardado se devuelve aunque la sede cambie después,
  -- pero nunca a quien ya pertenece a otro hospital (el resultado guardado es de la institución anterior).
  v_claim := app.peek_idempotency('user:' || auth.uid()::text, 'createHospitalNeed', p_key, p_hash);
  if v_claim is not null then
    if v_claim ->> 'kind' = 'replayed' and (v_claim #>> '{response,owner,hospitalId}') is distinct from v_hospital::text then
      return jsonb_build_object('kind', 'forbidden');
    end if;
    return v_claim;
  end if;

  -- Sede inexistente, ajena, inactiva o sin aprobar: una sola rama, sin rastro de cuál fue.
  select s.site_id into v_site from app.sites s
  where s.site_id = p_site_id::uuid and s.hospital_id = v_hospital and s.is_active and s.is_approved;
  if not found then return jsonb_build_object('kind', 'site_unusable'); end if;

  -- Tope por actor (protege la base y, desde F6, a los donantes de convocatorias en masa). Se cuenta sobre las
  -- necesidades realmente creadas, no en un contador externo que un tercero pudiera llenar; un replay no crea
  -- filas y por tanto no consume cupo. Va antes del claim para no dejar una clave «en curso».
  if (select count(*) from app.needs n where n.created_by = auth.uid() and n.created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('kind', 'rate_limited');
  end if;

  -- El admin no puede bloquear la sede (FOR SHARE exige la política de UPDATE, que es del superadmin), así que si la sede se
  -- desactiva entre la lectura y el insert, la política de INSERT lo rechaza (42501). Ese caso es el mismo 422 que la rama
  -- de arriba: el bloque deshace el claim de idempotencia y no deja clave «en curso». Cualquier otro rechazo se propaga.
  begin
    v_claim := app.claim_idempotency('user:' || auth.uid()::text, 'createHospitalNeed', p_key, p_hash);
    if v_claim is not null then return v_claim; end if;

    insert into app.needs (hospital_id, site_id, created_by, component, required_blood_type, target_confirmations,
                         radius_km, urgency, expires_at)
  values (v_hospital, v_site, auth.uid(), p_component, p_required_blood_type, p_target, p_radius_km, p_urgency,
          now() + make_interval(hours => p_expires_in_hours))
  returning * into v_need;
  perform app.write_audit('necesidad.creada', 'need', v_need.need_id, 'ok', null);

  v_reply := jsonb_build_object(
    'kind', 'created',
    'owner', jsonb_build_object('actorId', auth.uid(), 'hospitalId', v_hospital),
    'need', app.need_json(v_need)
  );
  perform app.complete_idempotency('user:' || auth.uid()::text, 'createHospitalNeed', p_key, v_reply);
  return v_reply;
  exception when insufficient_privilege then
    if exists (select 1 from app.sites s where s.site_id = v_site and s.hospital_id = v_hospital and s.is_active and s.is_approved) then
      raise;
    end if;
    return jsonb_build_object('kind', 'site_unusable');
  end;
end;
$$;

insert into app.schema_version (version) values ('20261021010000');
