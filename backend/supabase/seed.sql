-- Datos sintéticos de `app.*` (sin filas de Auth). Se amplía por módulo.
-- Todos los emails usan el dominio reservado *.example.test. Los UUID son fijos
-- y los reutiliza Bruno (bruno/environments/local-backend.bru).

insert into app.hospitals (hospital_id, public_name, legal_name, is_authorized) values
  ('11111111-1111-4111-8111-111111111101', 'Hospital Demo Uno', 'Hospital Demo Uno S.A. (sintético)', true),
  ('11111111-1111-4111-8111-111111111102', 'Hospital Demo Dos', 'Hospital Demo Dos S.A. (sintético)', true),
  ('11111111-1111-4111-8111-111111111103', 'Hospital Demo Tres', 'Hospital Demo Tres S.A. (sintético)', true);

insert into app.sites (site_id, hospital_id, public_name, public_address, latitude, longitude, public_instructions, is_active, is_approved) values
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111101', 'Sede Central Uno', 'Cercado de Lima', -12.046374, -77.042793, null, true, true),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111101', 'Sede Inactiva Uno', 'Cercado de Lima', -12.050000, -77.040000, null, false, true),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111102', 'Sede Central Dos', 'Miraflores', -12.119700, -77.037500, 'Acude a la ventanilla de donación.', true, true),
  ('22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111102', 'Sede Sin Aprobar Dos', 'San Isidro', -12.097500, -77.036000, null, true, false),
  ('22222222-2222-4222-8222-222222222205', '11111111-1111-4111-8111-111111111103', 'Sede Central Tres', 'San Miguel', -12.077300, -77.082300, null, true, true);
