begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);
insert into auth.users (id, instance_id, aud, role, email) values
('00000000-0000-4000-8000-00000000ae01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','queue-super@example.test'),
('00000000-0000-4000-8000-00000000ae02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','queue-donor@example.test');
insert into app.user_accounts(user_id, role) values
('00000000-0000-4000-8000-00000000ae01','superadmin'),
('00000000-0000-4000-8000-00000000ae02','donante');
insert into app.correction_requests(request_id, donor_id, type, requested_fields, proposed_name, status) values
('00000000-0000-4000-8000-00000000ae03','00000000-0000-4000-8000-00000000ae02','correccion',array['name'],'Nombre sintetico','pendiente'),
('00000000-0000-4000-8000-00000000ae04','00000000-0000-4000-8000-00000000ae02','correccion',array['name'],'Nombre sintetico','completada'),
('00000000-0000-4000-8000-00000000ae05','00000000-0000-4000-8000-00000000ae06','correccion',array['name'],'Nombre sintetico','aprobada');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000ae01","role":"authenticated","aal":"aal2"}',true);
select is(api.list_superadmin_tasks()->>'kind','ok','superadmin AAL2 puede consultar la cola');
select ok((api.list_superadmin_tasks()->'items') @> '[{"taskId":"00000000-0000-4000-8000-00000000ae03","kind":"correction_request"}]'::jsonb,'incluye solicitud pendiente');
select ok((api.list_superadmin_tasks()->'items') @> '[{"taskId":"00000000-0000-4000-8000-00000000ae05","kind":"correction_request"}]'::jsonb,'incluye solicitud aprobada pendiente de ejecutar');
select ok(not ((api.list_superadmin_tasks()->'items') @> '[{"taskId":"00000000-0000-4000-8000-00000000ae04"}]'::jsonb),'excluye solicitud completada');
select ok((select bool_and(keys <@ array['taskId','kind','createdAt','resourceCode']) from (
 select array(select jsonb_object_keys(item)) as keys from jsonb_array_elements(api.list_superadmin_tasks()->'items') item
) projection),'cola solo contiene metadatos permitidos');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000ae01","role":"authenticated","aal":"aal1"}',true);
select is(api.list_superadmin_tasks()->>'kind','mfa_required','AAL1 no puede leer cola');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000ae02","role":"authenticated","aal":"aal2"}',true);
select is(api.list_superadmin_tasks()->>'kind','forbidden','otro rol no puede leer cola');
reset role;
select * from finish();
rollback;
