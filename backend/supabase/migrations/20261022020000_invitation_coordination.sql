-- invitation-coordination (F6-2): solo esquema. Matriz RBC académica, Haversine, lotes, invitaciones e historial de respuestas.
-- Contrato reconciliado: docs/plans/2026-10-22-f6-contrato-reconciliado.md §2.1 (aprobado, A4). Sin RPC (F6-3) y sin DEFINER nuevas.
-- La matriz es académica (RNF-SAF-01): no es una fuente de compatibilidad clínica.

-- Matriz donante -> receptor, solo RBC (Anexo B.2). Paridad con MATRIZ_RBC_ACADEMICA_V1 (compatibility.ts).
create table app.rbc_compatibility (
  donor text not null check (donor in ('O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS')),
  recipient text not null check (recipient in ('O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS')),
  is_exact boolean not null,
  primary key (donor, recipient)
);
insert into app.rbc_compatibility (donor, recipient, is_exact)
select d, r, d = r from (values
  ('O_NEG','O_NEG'),('O_NEG','O_POS'),('O_NEG','A_NEG'),('O_NEG','A_POS'),('O_NEG','B_NEG'),('O_NEG','B_POS'),('O_NEG','AB_NEG'),('O_NEG','AB_POS'),
  ('O_POS','O_POS'),('O_POS','A_POS'),('O_POS','B_POS'),('O_POS','AB_POS'),
  ('A_NEG','A_NEG'),('A_NEG','A_POS'),('A_NEG','AB_NEG'),('A_NEG','AB_POS'),
  ('A_POS','A_POS'),('A_POS','AB_POS'),
  ('B_NEG','B_NEG'),('B_NEG','B_POS'),('B_NEG','AB_NEG'),('B_NEG','AB_POS'),
  ('B_POS','B_POS'),('B_POS','AB_POS'),
  ('AB_NEG','AB_NEG'),('AB_NEG','AB_POS'),
  ('AB_POS','AB_POS')) m (d, r);

-- Mismas fórmula y radio medio terrestre que haversineMeters (haversine.ts): 6371008.8 m, sin redondeo.
-- Precedente de need_records.sql: la clave (need_id, hospital_id) permite FK compuestas que impiden un hospital_id que no
-- corresponda a la necesidad (aislamiento estructural, no solo por la RPC).
alter table app.needs add constraint needs_need_hospital_key unique (need_id, hospital_id);

create function app.haversine_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371008.8::double precision * asin(least(1::double precision, sqrt(
    sin(radians(lat2 - lat1) / 2) * sin(radians(lat2 - lat1) / 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) * sin(radians(lon2 - lon1) / 2))))
$$;

create table app.invitation_batches (
  batch_id uuid primary key default gen_random_uuid(),
  need_id uuid not null,
  hospital_id uuid not null,
  requested_by uuid not null,
  created_at timestamptz not null default now(),
  created_invitation_count int not null check (created_invitation_count between 0 and 50),
  queued_email_count int not null check (queued_email_count between 0 and 50),
  foreign key (need_id, hospital_id) references app.needs (need_id, hospital_id),
  unique (batch_id, need_id)
);
create index invitation_batches_need_idx on app.invitation_batches (need_id, created_at);

create table app.invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  need_id uuid not null,
  -- NOT NULL a propósito: con MATCH SIMPLE una FK compuesta con una columna nula no se comprueba y el lote ajeno pasaría.
  batch_id uuid not null,
  -- Desnormalizado de la necesidad: la RLS del admin no consulta needs. Las FK compuestas lo atan a need_id y a batch_id.
  hospital_id uuid not null,
  -- Sin FK a donor_profiles (D3 regla 2): null tras una eliminación (V15).
  donor_id uuid,
  need_donor_code text not null check (need_donor_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  validity text not null default 'activa' check (validity in ('activa', 'invalidada', 'vencida')),
  delivery text not null default 'pendiente' check (delivery in ('pendiente', 'enviada', 'entregada', 'fallida')),
  response text not null default 'sin_respuesta' check (response in ('sin_respuesta', 'confirmada', 'rechazada')),
  response_recorded_at timestamptz,
  -- No se anulan al consumir el token: el replay se distingue por token_consumed_at.
  confirm_token_hash text unique check (confirm_token_hash ~ '^[0-9a-f]{64}$'),
  reject_token_hash text unique check (reject_token_hash ~ '^[0-9a-f]{64}$'),
  token_consumed_at timestamptz,
  current_outbox_id uuid not null references app.email_outbox (outbox_id),
  created_at timestamptz not null default now(),
  foreign key (need_id, hospital_id) references app.needs (need_id, hospital_id),
  foreign key (batch_id, need_id) references app.invitation_batches (batch_id, need_id),
  unique (need_id, donor_id),
  unique (need_id, need_donor_code)
);
create index invitations_donor_created_idx on app.invitations (donor_id, created_at);
create index invitations_confirmed_idx on app.invitations (need_id) where response = 'confirmada';
create index invitations_failed_idx on app.invitations (delivery) where delivery = 'fallida';

create table app.invitation_response_history (
  id bigserial primary key,
  invitation_id uuid not null references app.invitations (invitation_id),
  -- Sin FK: la fila sobrevive a la cuenta lo justo para que el trigger autorice su borrado.
  donor_id uuid not null,
  response text not null check (response in ('confirmada', 'rechazada')),
  channel text not null check (channel in ('token', 'sesion')),
  changed_at timestamptz not null default now()
);
create index invitation_response_history_donor_idx on app.invitation_response_history (donor_id, changed_at);
create index invitation_response_history_invitation_idx on app.invitation_response_history (invitation_id);

alter table app.rbc_compatibility enable row level security;
alter table app.rbc_compatibility force row level security;
alter table app.invitation_batches enable row level security;
alter table app.invitation_batches force row level security;
alter table app.invitations enable row level security;
alter table app.invitations force row level security;
alter table app.invitation_response_history enable row level security;
alter table app.invitation_response_history force row level security;

-- ---------------------------------------------------------------------------
-- Invariantes
-- ---------------------------------------------------------------------------

-- Append-only: UPDATE nunca; DELETE solo cuando el perfil del donante ya no existe (V15, autojustificado, sin GUC).
-- INVOKER: lee donor_profiles con la RLS del invocador (hoy solo app_privileged tiene DELETE, con política using (true));
-- si otro rol obtuviera DELETE, su política de donor_profiles decidiría qué ve este trigger.
-- No hay guard ante TRUNCATE: solo el propietario (postgres) puede (app_privileged no tiene TRUNCATE). Pendiente documentado, no implementado.
create function app.guard_invitation_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'invitation_response_history es append-only';
  end if;
  if exists (select 1 from app.donor_profiles p where p.donor_id = old.donor_id) then
    raise exception 'invitation_response_history solo se borra cuando el perfil del donante ya no existe';
  end if;
  return old;
end;
$$;
create trigger invitation_response_history_guard
  before update or delete on app.invitation_response_history
  for each row execute function app.guard_invitation_history();

-- Código opaco por necesidad (V14): Crockford base32 de 10 caracteres, con reintento ante colisión (need_donor_code).
-- INVOKER y propiedad de postgres (como app.fingerprint): no toca auth; lo llamará la RPC de lotes (app_privileged, F6-3),
-- que ya puede leer invitations. La carrera entre dos lotes la cierra el unique (need_id, need_donor_code).
create function app.new_need_donor_code(p_need_id uuid) returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea;
  v_code text;
  v_try int := 0;
begin
  loop
    v_bytes := extensions.gen_random_bytes(10);
    v_code := '';
    for i in 0..9 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) & 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from app.invitations i where i.need_id = p_need_id and i.need_donor_code = v_code);
    v_try := v_try + 1;
    if v_try >= 10 then raise exception 'new_need_donor_code: colisiones repetidas'; end if;
  end loop;
  return v_code;
end;
$$;
revoke all on function app.new_need_donor_code(uuid) from public, anon, authenticated, service_role;
grant execute on function app.new_need_donor_code(uuid) to app_privileged;

-- ---------------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------------

grant select on app.rbc_compatibility to app_privileged;
grant select, insert, update, delete on app.invitation_batches, app.invitations to app_privileged;
-- Sin UPDATE: el historial es append-only (el trigger lo impide igual; defensa en profundidad).
grant select, insert, delete on app.invitation_response_history to app_privileged;
grant execute on function app.haversine_m(double precision, double precision, double precision, double precision) to app_privileged;
grant usage, select on sequence app.invitation_response_history_id_seq to app_privileged;
-- Nunca hashes, donor_id, need_donor_code ni current_outbox_id. rbc_compatibility: sin acceso para authenticated.
grant select (invitation_id, need_id, batch_id, hospital_id, validity, delivery, response, created_at) on app.invitations to authenticated;
grant select on app.invitation_batches, app.invitation_response_history to authenticated;

create policy rbc_compatibility_privileged on app.rbc_compatibility for select to app_privileged using (true);
create policy invitation_batches_privileged on app.invitation_batches for all to app_privileged using (true) with check (true);
create policy invitations_privileged on app.invitations for all to app_privileged using (true) with check (true);
create policy invitation_response_history_privileged on app.invitation_response_history for all to app_privileged using (true) with check (true);

create policy invitations_admin_select on app.invitations
  for select to authenticated using (hospital_id = (select app.admin_hospital_id()));
create policy invitations_super_select on app.invitations
  for select to authenticated using (app.current_actor_role() = 'superadmin');
create policy invitation_batches_admin_select on app.invitation_batches
  for select to authenticated using (hospital_id = (select app.admin_hospital_id()));
create policy invitation_response_history_own_select on app.invitation_response_history
  for select to authenticated using (donor_id = (select auth.uid()) and app.current_actor_role() = 'donante');

insert into app.schema_version (version) values ('20261022020000');
