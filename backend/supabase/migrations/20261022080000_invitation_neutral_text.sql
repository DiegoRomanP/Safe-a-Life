-- invitation-coordination (F6): ajuste del texto neutral de instrucciones tras la revisión clínica (observación 2): el imperativo
-- «Preséntate» podía leerse como una cita, y confirmar solo expresa intención. Sigue pendiente de ratificación clínica (C1).
create or replace function app.neutral_invitation_instructions() returns text
language sql immutable set search_path = '' as $$
  select 'Si decides asistir, acude a la sede indicada antes del plazo. El personal de salud verificará tu identidad, tu grupo y tu aptitud.'::text
$$;

insert into app.schema_version (version) values ('20261022080000');
