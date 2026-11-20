-- Revisión F6 (L-5): tope de lotes por admin (20 por hora). create or replace de api.authorize_invitation_batch de
-- 20261022030000: mismo propietario (app_privileged), DEFINER, search_path y concesiones. (El tope por correo de las altas
-- asistidas ya existe y es silencioso: 3 enlaces por buzón cada 24 h; no se duplica para no romper la respuesta neutra.)

create or replace function api.authorize_invitation_batch(p_need_id uuid) returns jsonb
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

  -- Tope por admin (revisión F6, L-5): 20 lotes por hora, contados sobre lotes reales.
  if (select count(*) from app.invitation_batches b where b.requested_by = app.jwt_sub() and b.created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('kind', 'rate_limited');
  end if;

  delete from app.invitation_batch_grants where need_id = p_need_id and admin_id = app.jwt_sub() and consumed_at is null;
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into app.invitation_batch_grants (need_id, hospital_id, admin_id, secret_hash, expires_at)
  values (p_need_id, v_hospital, app.jwt_sub(), encode(extensions.digest(v_secret, 'sha256'), 'hex'), v_expires);
  perform app.d_audit('lote.autorizado', 'need', p_need_id, 'usuario');
  return jsonb_build_object('kind', 'ok', 'grantSecret', v_secret, 'expiresAt', app.iso(v_expires));
end;
$$;

insert into app.schema_version (version) values ('20261022090000');
