-- SP-04: el replay de api.create_assisted_signup no revalidaba el hospital del actor. Si el admin se reasigna del hospital A
-- al B, la misma clave devolvía el alta de A (con su secuencia de activación). Ahora el replay de un alta de otro hospital
-- es `forbidden`, como en api.create_need_draft; el replay autorizado conserva el DTO. create or replace de la función de
-- 20261013060000: mismo propietario (app_privileged), DEFINER, search_path y concesiones.

create or replace function api.create_assisted_signup(p_key text, p_hash text, p_email text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_claim jsonb;
  v_signup app.assisted_signups;
  v_reply jsonb;
begin
  v_fail := app.d_require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.d_admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;

  if p_key is null or char_length(p_key) not between 16 and 256
     or p_email is null or p_email <> lower(btrim(p_email)) or char_length(p_email) > 254 or p_email !~ '^[^[:space:]@]{1,64}@[^[:space:]@]{1,190}$'
     or (p_name is not null and char_length(p_name) not between 1 and 120)
     or p_hash is distinct from app.fingerprint(jsonb_build_array(jsonb_build_array('email', p_email), jsonb_build_array('name', p_name))) then
    return jsonb_build_object('kind', 'invalid');
  end if;

  v_claim := app.peek_idempotency('user:' || app.jwt_sub()::text, 'createAssistedSignup', p_key, p_hash);
  if v_claim is not null then
    -- Un admin reasignado a otro hospital no recupera el alta del anterior (el resultado guardado no lleva el hospital: se
    -- consulta el alta). Si el alta ya no existe no hay nada que exponer más allá de su id, y se conserva el replay.
    if v_claim ->> 'kind' = 'replayed' and exists (
         select 1 from app.assisted_signups s
         where s.signup_id::text = v_claim #>> '{response,signup,signupId}' and s.hospital_id is distinct from v_hospital) then
      return jsonb_build_object('kind', 'forbidden');
    end if;
    return v_claim;
  end if;

  -- Tope por hospital (contado sobre altas reales, bajo un bloqueo por hospital): 20 cada hora.
  perform pg_advisory_xact_lock(hashtextextended('assisted-quota:' || v_hospital::text, 0));
  if (select count(*) from app.assisted_signups s where s.hospital_id = v_hospital and s.created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('kind', 'rate_limited');
  end if;

  v_claim := app.claim_idempotency('user:' || app.jwt_sub()::text, 'createAssistedSignup', p_key, p_hash);
  if v_claim is not null then return v_claim; end if;

  insert into app.assisted_signups (hospital_id, email, name, activation_expires_at, purge_at)
  values (v_hospital, p_email, p_name, now() + interval '24 hours', now() + interval '30 days')
  returning * into v_signup;
  perform app.d_audit('alta_asistida.creada', 'assisted_signup', v_signup.signup_id, 'usuario');

  v_reply := jsonb_build_object('kind', 'created', 'seq', v_signup.activation_seq,
    'signup', app.signup_json(v_signup.signup_id, v_signup.status, v_signup.created_at, v_signup.activation_expires_at, v_signup.purge_at));
  perform app.complete_idempotency('user:' || app.jwt_sub()::text, 'createAssistedSignup', p_key, v_reply);
  return v_reply;
end;
$$;

insert into app.schema_version (version) values ('20261021020000');
