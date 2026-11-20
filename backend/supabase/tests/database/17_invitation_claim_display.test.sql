begin;
-- F6-5a: el reclamo del worker añade `display` (hospital y sede públicos) solo a las invitaciones. Todo se revierte con el rollback.
truncate app.invitation_response_history, app.invitations, app.invitation_batches, app.email_outbox, app.needs, app.sites,
  app.donor_profiles, app.hospital_memberships, app.hospitals, app.user_accounts cascade;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'worker-e@example.test'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-e@example.test'),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'donante-e@example.test');
insert into app.user_accounts (user_id, role, display_name) values
  ('00000000-0000-4000-8000-000000000005', 'worker', null), ('00000000-0000-4000-8000-000000000001', 'admin_hospitalario', null),
  ('00000000-0000-4000-8000-000000000011', 'donante', null);
insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('10000000-0000-4000-8000-000000000e01', 'Hospital E Uno', 'Hospital E Uno S.A.', true);
insert into app.sites (site_id, hospital_id, public_name, public_address, latitude, longitude, is_active, is_approved) values
  ('22222222-2222-4222-8222-222222220e01', '10000000-0000-4000-8000-000000000e01', 'Sede E Uno', 'Cercado de Lima', -12.046374, -77.042793, true, true);
insert into app.donor_profiles (donor_id, name, declared_blood_type, is_available, latitude, longitude, location_polygon_version, status, email_verified_at)
values ('00000000-0000-4000-8000-000000000011', 'Donante E', 'A_POS', true, -12.05, -77.043, 'DEMO_ONLY-1', 'activo', now());
insert into app.needs (need_id, hospital_id, site_id, created_by, component, required_blood_type, target_confirmations, radius_km, urgency, status, created_at, expires_at)
values ('40000000-0000-4000-8000-000000000e01', '10000000-0000-4000-8000-000000000e01', '22222222-2222-4222-8222-222222220e01',
        '00000000-0000-4000-8000-000000000001', 'RBC', 'A_POS', 2, 10, 'Normal', 'activa', now() - interval '1 day', now() + interval '2 days');
insert into app.invitation_batches (batch_id, need_id, hospital_id, requested_by, created_invitation_count, queued_email_count)
values ('70000000-0000-4000-8000-000000000e01', '40000000-0000-4000-8000-000000000e01', '10000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000001', 1, 1);
insert into app.email_outbox (outbox_id, kind, recipient_user_id, idempotency_key, sealed_payload, not_after) values
  ('60000000-0000-4000-8000-000000000e01', 'invitacion', '00000000-0000-4000-8000-000000000011', 'outbox-fixture-e-invitacion', 'sellado', now() + interval '1 day'),
  ('60000000-0000-4000-8000-000000000e02', 'recuperacion', '00000000-0000-4000-8000-000000000011', 'outbox-fixture-e-recuperacion', 'sellado', now() + interval '1 day');
insert into app.invitations (invitation_id, need_id, batch_id, hospital_id, donor_id, need_donor_code, confirm_token_hash, reject_token_hash, current_outbox_id)
values ('50000000-0000-4000-8000-000000000e01', '40000000-0000-4000-8000-000000000e01', '70000000-0000-4000-8000-000000000e01', '10000000-0000-4000-8000-000000000e01',
        '00000000-0000-4000-8000-000000000011', app.new_need_donor_code('40000000-0000-4000-8000-000000000e01'), repeat('a', 64), repeat('b', 64),
        '60000000-0000-4000-8000-000000000e01');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
create temp table res as select api.worker_claim_due_outbox(10) as j;
select is((select j ->> 'kind' from res), 'ok', 'el worker reclama el lote');
select is((select count(*)::int from res, jsonb_array_elements(j -> 'items')), 2, 'reclama ambas filas');
select is((select e -> 'display' from res, jsonb_array_elements(j -> 'items') e where e ->> 'kind' = 'invitacion'),
  '{"hospitalName": "Hospital E Uno", "sitePublicName": "Sede E Uno"}'::jsonb, 'la invitación trae solo los nombres públicos de hospital y sede');
select ok((select not (e ? 'display') from res, jsonb_array_elements(j -> 'items') e where e ->> 'kind' = 'recuperacion'), 'los demás tipos no traen display');
select is((select e ->> 'recipient' from res, jsonb_array_elements(j -> 'items') e where e ->> 'kind' = 'invitacion'), 'donante-e@example.test', 'el destinatario sigue saliendo de auth.users');
reset role;

select * from finish();
rollback;
