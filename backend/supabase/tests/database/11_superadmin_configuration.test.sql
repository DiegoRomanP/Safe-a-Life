begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);
-- El cambio de fecha ocurre solo en esta transacción y siempre se revierte.
-- Si la base ya tiene fecha fijada, no se altera para ejecutar esta prueba.
do $$ begin if exists(select 1 from app.configuration where final_demo_at is not null) then raise exception 'Esta prueba requiere configuración aún no fijada; no se modifica la existente.'; end if; end $$;
insert into auth.users(id,instance_id,aud,role,email) values
('00000000-0000-4000-8000-00000000af01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','config-qa@example.test');
insert into app.user_accounts(user_id,role) values('00000000-0000-4000-8000-00000000af01','superadmin');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000af01","role":"authenticated","aal":"aal2"}',true);
select is(api.set_final_demo_at('config-no-stepup-qa',app.fingerprint(jsonb_build_array(jsonb_build_array('finalDemoAt','2090-01-01T00:00:00.000Z'))),'2090-01-01T00:00:00Z')->>'kind','step_up_required','fecha exige step-up');
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-00000000af01','role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select is(api.set_final_demo_at('config-set-qa-0001',app.fingerprint(jsonb_build_array(jsonb_build_array('finalDemoAt','2090-01-01T00:00:00.000Z'))),'2090-01-01T00:00:00Z')->>'isImmutable','true','fecha se guarda como inmutable');
select is(api.set_final_demo_at('config-set-qa-0002',app.fingerprint(jsonb_build_array(jsonb_build_array('finalDemoAt','2091-01-01T00:00:00.000Z'))),'2091-01-01T00:00:00Z')->>'kind','conflict','segunda fecha rechazada');
select ok(not has_table_privilege('authenticated','app.audit_events','UPDATE'),'auditoria sin permiso UPDATE');
select ok(not has_table_privilege('authenticated','app.audit_events','DELETE'),'auditoria sin permiso DELETE');
reset role;
select * from finish();
rollback;
