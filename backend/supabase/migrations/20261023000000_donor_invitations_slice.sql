-- F6, integración local de invitaciones en app. No se altera ninguna tabla existente.
-- Invitaciones emitidas por hospital, respuesta única actual e historial append-only.
create table if not exists app.donor_invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  need_id uuid not null references app.needs(need_id),
  donor_id uuid not null references app.donor_profiles(donor_id),
  hospital_name text not null,
  site_name text not null,
  blood_type text not null,
  urgency text not null,
  instructions text not null,
  expires_at timestamptz not null,
  response text not null default 'sin_respuesta' check(response in ('sin_respuesta','confirmada','rechazada')),
  created_at timestamptz not null default now(),
  changed_at timestamptz,
  unique(need_id, donor_id)
);
create index if not exists donor_invitations_by_donor on app.donor_invitations(donor_id, created_at desc);
create table if not exists app.donor_invitation_history (
  history_id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references app.donor_invitations(invitation_id),
  donor_id uuid not null references app.donor_profiles(donor_id),
  response text not null check(response in ('confirmada','rechazada')),
  changed_at timestamptz not null default now()
);
create index if not exists donor_invitation_history_by_donor on app.donor_invitation_history(donor_id, changed_at desc);
alter table app.donor_invitations enable row level security;
alter table app.donor_invitations force row level security;
alter table app.donor_invitation_history enable row level security;
alter table app.donor_invitation_history force row level security;
-- Direct SQL access is intentionally unavailable. Operations below validate actor and membership.
revoke all on app.donor_invitations from anon, authenticated;
revoke all on app.donor_invitation_history from anon, authenticated;

create or replace function api.f6_my_invitations() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'invitationId',i.invitation_id,'hospitalName',i.hospital_name,
    'publicSiteName',i.site_name,'requiredBloodType',i.blood_type,
    'urgency',i.urgency,'instructions',i.instructions,
    'expiresAt',to_char(i.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'validity',case when i.expires_at<=now() or n.status not in ('activa','meta_alcanzada') then 'vencida' else 'activa' end,
    'delivery','pendiente','response',i.response
  ) order by i.created_at desc),'[]'::jsonb)
  from app.donor_invitations i join app.needs n on n.need_id=i.need_id
  where i.donor_id=auth.uid() and app.current_actor_role()='donante'
$$;
create or replace function api.f6_my_history() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'invitationId',h.invitation_id,'response',h.response,
    'changedAt',to_char(h.changed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    order by h.changed_at desc),'[]'::jsonb)
  from app.donor_invitation_history h
  where h.donor_id=auth.uid() and app.current_actor_role()='donante'
$$;
create or replace function api.f6_reply(p_invitation_id uuid,p_response text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v app.donor_invitations; n app.needs;
begin
  if auth.uid() is null or app.current_actor_role()<>'donante' then return jsonb_build_object('kind','forbidden'); end if;
  if p_response not in ('confirmada','rechazada') then return jsonb_build_object('kind','invalid'); end if;
  select * into v from app.donor_invitations where invitation_id=p_invitation_id and donor_id=auth.uid() for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  select * into n from app.needs where need_id=v.need_id;
  if v.expires_at<=now() or n.status<>'activa' then return jsonb_build_object('kind','conflict'); end if;
  if v.response<>p_response then
    update app.donor_invitations set response=p_response,changed_at=now() where invitation_id=p_invitation_id;
    insert into app.donor_invitation_history(invitation_id,donor_id,response) values(p_invitation_id,auth.uid(),p_response);
  end if;
  return jsonb_build_object('kind','ok');
end $$;
-- Creates only compatible in-range invitations. The institutional admin is derived from JWT/membership.
create or replace function api.f6_generate(p_need_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n app.needs; v_count integer;
begin
  if auth.uid() is null or app.current_actor_role()<>'admin_hospitalario' then return jsonb_build_object('kind','forbidden'); end if;
  select * into n from app.needs where need_id=p_need_id and hospital_id=app.admin_hospital_id() for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  if n.status<>'activa' or n.expires_at<=now() then return jsonb_build_object('kind','conflict'); end if;
  insert into app.donor_invitations(need_id,donor_id,hospital_name,site_name,blood_type,urgency,instructions,expires_at)
  select n.need_id,p.donor_id,h.public_name,s.public_name,n.required_blood_type,n.urgency,
         coalesce(s.public_instructions,'Consulta los detalles con el hospital.'),n.expires_at
  from app.donor_profiles p
  cross join app.hospitals h
  cross join app.sites s
  where h.hospital_id=n.hospital_id and s.site_id=n.site_id and s.hospital_id=n.hospital_id
    and p.status='activo' and p.is_available is true and p.latitude is not null
    and (case p.declared_blood_type
      when 'O_NEG' then true
      when 'O_POS' then n.required_blood_type in ('O_POS','A_POS','B_POS','AB_POS')
      when 'A_NEG' then n.required_blood_type in ('A_NEG','A_POS','AB_NEG','AB_POS')
      when 'A_POS' then n.required_blood_type in ('A_POS','AB_POS')
      when 'B_NEG' then n.required_blood_type in ('B_NEG','B_POS','AB_NEG','AB_POS')
      when 'B_POS' then n.required_blood_type in ('B_POS','AB_POS')
      when 'AB_NEG' then n.required_blood_type in ('AB_NEG','AB_POS')
      when 'AB_POS' then n.required_blood_type='AB_POS'
      else false end)
    and 6371*2*asin(least(1,sqrt(
      power(sin(radians((p.latitude-s.latitude)::float8)/2),2)+
      cos(radians(s.latitude::float8))*cos(radians(p.latitude::float8))*
      power(sin(radians((p.longitude-s.longitude)::float8)/2),2))))<=n.radius_km
  on conflict(need_id,donor_id) do nothing;
  get diagnostics v_count=row_count;
  return jsonb_build_object('kind','ok','created',v_count);
end $$;
revoke all on function api.f6_my_invitations(),api.f6_my_history(),api.f6_reply(uuid,text),api.f6_generate(uuid) from public,anon;
grant execute on function api.f6_my_invitations(),api.f6_my_history(),api.f6_reply(uuid,text),api.f6_generate(uuid) to authenticated;
