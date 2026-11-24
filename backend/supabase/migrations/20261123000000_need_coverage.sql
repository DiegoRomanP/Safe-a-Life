-- need-coverage: cobertura AGREGADA de donantes compatibles para una necesidad propia (mapa del hospital).
-- Decisiones de la persona usuaria (2026-11-23): el hospital ve sede + radio + conteos agregados; nunca la ubicación, la
-- distancia, el nombre ni el id de una persona (RF-VIS-01/02). Aquí se cumple con tres reglas:
--  1. Supresión k-anónima (k = 5) y cubos gruesos en TODO lo que se devuelve (revisión independiente del 2026-11-23: con k = 3 y
--     conteos exactos, restar lecturas de borradores con radios, grupos o sedes distintos aislaba a una persona): las celdas
--     (rejilla de 0,01° ≈ 1,1 km) solo salen con >= 5 donantes; los anillos se fusionan con el siguiente hasta que cada grupo
--     tiene >= 5; y todo conteo se redondea hacia abajo a un cubo {5, 10, 25} («al menos N»). `null` = «menos de 5» (1 a 4) y el
--     0 sí se dice: no identifica a nadie. El tope de consultas por hospital lo aplica la API (20 por hora).
--  2. Se reutilizan los filtros del lote (app.invitation_candidates) para que el conteo sea el que el lote real elegiría.
--     request_invitation_batch NO se modifica: la paridad la prueba pgTAP (20_need_coverage.test.sql).
--  3. DEFINER (ADR-003 ítem 6): el admin no puede leer donor_profiles; la función cruza el perfil y devuelve solo agregados.
--     Las coordenadas del donante nunca salen de la función: se redondean a la celda antes de construir el JSON.

-- Cubo grueso de un conteo (hacia abajo): 0 se dice; 1 a 4 = null («menos de 5»); luego 5, 10 y 25 («al menos N»).
create function app.coverage_bucket(p_n int) returns int
language sql immutable set search_path = '' as $$
  select case when p_n = 0 then 0 when p_n < 5 then null when p_n < 10 then 5 when p_n < 25 then 10 else 25 end
$$;
grant execute on function app.coverage_bucket(int) to app_privileged;

-- Candidatos del lote para una necesidad: mismos filtros que api.request_invitation_batch (matriz RBC, polígono, radio con borde
-- incluido, disponibilidad, perfil activo con cuenta de donante, sin invitación previa a esta necesidad, sin eliminación en
-- ejecución y con menos de 3 invitaciones en las últimas 24 h). Solo la usan las funciones DEFINER de app_privileged.
create function app.invitation_candidates(p_need_id uuid)
returns table (donor_id uuid, is_exact boolean, distance_m double precision, latitude numeric, longitude numeric)
language sql stable set search_path = '' as $$
  select p.donor_id, c.is_exact,
         app.haversine_m(p.latitude::double precision, p.longitude::double precision, s.latitude::double precision, s.longitude::double precision),
         p.latitude, p.longitude
  from app.needs n
  join app.sites s on s.site_id = n.site_id
  join app.donor_profiles p on true
  join app.rbc_compatibility c on c.donor = p.declared_blood_type and c.recipient = n.required_blood_type
  where n.need_id = p_need_id
    and p.status = 'activo' and p.is_available
    and p.location_polygon_version = 'DEMO_ONLY-1' and app.in_lima_demo_1(p.latitude, p.longitude)
    and exists (select 1 from app.user_accounts ua where ua.user_id = p.donor_id and ua.role = 'donante')
    and app.haversine_m(p.latitude::double precision, p.longitude::double precision, s.latitude::double precision, s.longitude::double precision)
        <= n.radius_km * 1000::double precision
    and not exists (select 1 from app.invitations i where i.need_id = n.need_id and i.donor_id = p.donor_id)
    and not exists (select 1 from app.correction_requests r where r.donor_id = p.donor_id and r.type = 'eliminacion' and r.status = 'en_ejecucion')
    and (select count(*) from app.invitations i where i.donor_id = p.donor_id and i.created_at > now() - interval '24 hours') < 3
$$;

-- Cobertura de una necesidad propia en borrador o activa. Una ajena es indistinguible de una inexistente (sin IDOR).
-- Recorre los candidatos una vez para el total y los anillos y otra para las celdas (no una por anillo).
create function api.get_need_coverage(p_need_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fail text;
  v_hospital uuid;
  v_need app.needs;
  v_site app.sites;
  v_total int;
  v_c int[];
  v_q double precision;
  v_groups jsonb := '[]'::jsonb;
  v_raw jsonb;
  v_acc int := 0;
  v_start int := 0;
  v_last int;
  v_b int;
  v_cells jsonb;
begin
  v_fail := app.d_require('{admin_hospitalario}', true, false);
  if v_fail is not null then return jsonb_build_object('kind', v_fail); end if;
  v_hospital := app.d_admin_hospital_id();
  if v_hospital is null then return jsonb_build_object('kind', 'forbidden'); end if;
  if p_need_id is null then return jsonb_build_object('kind', 'invalid'); end if;

  select * into v_need from app.needs where need_id = p_need_id and hospital_id = v_hospital;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  if app.need_status(v_need) not in ('borrador', 'activa') then return jsonb_build_object('kind', 'conflict'); end if;
  select * into v_site from app.sites where site_id = v_need.site_id and hospital_id = v_hospital;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  -- Mismo criterio que publicar y que el lote (O9): con la sede inactiva o sin aprobar, la cobertura prometería un envío imposible.
  if not (v_site.is_active and v_site.is_approved) then return jsonb_build_object('kind', 'conflict'); end if;

  -- Cuatro anillos iguales de radio/4 (metros); el último incluye el borde. Cada candidato cae en uno solo.
  v_q := v_need.radius_km * 250.0;
  select count(*)::int, array[
           count(*) filter (where k.distance_m <= v_q)::int,
           count(*) filter (where k.distance_m > v_q and k.distance_m <= 2 * v_q)::int,
           count(*) filter (where k.distance_m > 2 * v_q and k.distance_m <= 3 * v_q)::int,
           count(*) filter (where k.distance_m > 3 * v_q)::int]
    into v_total, v_c
  from app.invitation_candidates(p_need_id) k;

  if v_total between 1 and 4 then
    -- Menos de 5 en total: ni el total ni los anillos ni las celdas se revelan.
    v_groups := jsonb_build_array(jsonb_build_object('fromKm', 0, 'toKm', v_need.radius_km, 'count', null));
    v_cells := '[]'::jsonb;
  else
    -- Fusiona anillos contiguos hasta que cada grupo tenga >= 5; los ceros se absorben en el grupo siguiente.
    for v_b in 1 .. 4 loop
      v_acc := v_acc + v_c[v_b];
      if v_acc >= 5 then
        v_groups := v_groups || jsonb_build_array(jsonb_build_object(
          'fromKm', round(v_need.radius_km * v_start / 4.0, 2), 'toKm', round(v_need.radius_km * v_b / 4.0, 2), 'count', v_acc));
        v_acc := 0;
        v_start := v_b;
      end if;
    end loop;
    if v_acc > 0 then
      -- 1 a 4 sobrantes al final: se suman al último grupo (existe, porque el total es >= 5) y este llega hasta el radio.
      v_last := jsonb_array_length(v_groups) - 1;
      v_groups := jsonb_set(v_groups, array[v_last::text], (v_groups -> v_last)
        || jsonb_build_object('toKm', v_need.radius_km, 'count', (v_groups -> v_last ->> 'count')::int + v_acc));
    elsif v_start < 4 then
      -- Cola sin donantes (o ninguno en total): un grupo con cero.
      v_groups := v_groups || jsonb_build_array(jsonb_build_object(
        'fromKm', round(v_need.radius_km * v_start / 4.0, 2), 'toKm', v_need.radius_km, 'count', 0));
    end if;

    -- Celdas de 0,01° con al menos 5 donantes (cubo del conteo); el centro (no la posición del donante) es lo único que sale.
    select coalesce(jsonb_agg(jsonb_build_object('latitude', t.clat, 'longitude', t.clon, 'count', app.coverage_bucket(t.n)) order by t.n desc, t.clat, t.clon), '[]'::jsonb)
      into v_cells
    from (
      select ((floor(k.latitude * 100) + 0.5) / 100)::numeric(7, 3) as clat, ((floor(k.longitude * 100) + 0.5) / 100)::numeric(8, 3) as clon, count(*)::int as n
      from app.invitation_candidates(p_need_id) k
      group by 1, 2
      having count(*) >= 5
      order by count(*) desc, 1, 2
      limit 500
    ) t;
  end if;

  -- Los grupos llevan el conteo exacto solo hasta aquí: salen en cubos.
  select coalesce(jsonb_agg(case when g ->> 'count' is null then g else g || jsonb_build_object('count', app.coverage_bucket((g ->> 'count')::int)) end order by o), '[]'::jsonb)
    into v_raw from jsonb_array_elements(v_groups) with ordinality t(g, o);

  return jsonb_build_object('kind', 'ok',
    'site', jsonb_build_object('latitude', v_site.latitude, 'longitude', v_site.longitude),
    'radiusKm', v_need.radius_km,
    'compatibleCount', to_jsonb(app.coverage_bucket(v_total)),
    -- batchSize(meta) = min(50, max(5, 2 * meta)) (batch-size.ts); nunca se rellena con quien no es candidato.
    'nextBatchCount', to_jsonb(app.coverage_bucket(least(v_total, least(50, greatest(5, 2 * v_need.target_confirmations))))),
    'rings', v_raw,
    'cells', v_cells);
end;
$$;

-- ---------------------------------------------------------------------------
-- Propiedad y privilegios
-- ---------------------------------------------------------------------------

-- Solo la función api.* cambia de dueño: app_privileged no tiene CREATE en el esquema app (igual que app.invitation_slots_valid).
alter function api.get_need_coverage(uuid) owner to app_privileged;
revoke all on function app.invitation_candidates(uuid) from public, anon, authenticated, service_role;
grant execute on function app.invitation_candidates(uuid) to app_privileged;
revoke all on function api.get_need_coverage(uuid) from public, anon, service_role;
grant execute on function api.get_need_coverage(uuid) to authenticated;

insert into app.schema_version (version) values ('20261123000000');
