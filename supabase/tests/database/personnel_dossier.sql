begin;
select no_plan();
insert into auth.users(id,email) values
 ('d0100000-0000-4000-8000-000000000001','dossier-hr@fieldgrid.test'),
 ('d0100000-0000-4000-8000-000000000002','dossier-staff@fieldgrid.test'),
 ('d0100000-0000-4000-8000-000000000003','dossier-planner@fieldgrid.test');
insert into public.tenants(id,slug,name) values ('d0200000-0000-4000-8000-000000000001','dossier-a','Dossier A'),('d0200000-0000-4000-8000-000000000002','dossier-b','Dossier B');
insert into public.tenant_settings(tenant_id) values('d0200000-0000-4000-8000-000000000001'),('d0200000-0000-4000-8000-000000000002');
insert into public.tenant_memberships(tenant_id,user_id,roles,status) values
 ('d0200000-0000-4000-8000-000000000001','d0100000-0000-4000-8000-000000000001','{tenant_admin}','active'),
 ('d0200000-0000-4000-8000-000000000001','d0100000-0000-4000-8000-000000000002','{staff}','active'),
 ('d0200000-0000-4000-8000-000000000001','d0100000-0000-4000-8000-000000000003','{planner}','active');
insert into public.personnel(id,tenant_id,user_id,employee_number,full_name,status) values
 ('d0300000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','d0100000-0000-4000-8000-000000000002','DOS-1','Dossier One','active'),
 ('d0300000-0000-4000-8000-000000000002','d0200000-0000-4000-8000-000000000001',null,'DOS-2','Dossier Two','active'),
 ('d0300000-0000-4000-8000-000000000003','d0200000-0000-4000-8000-000000000002',null,'DOS-1','Other Tenant','active');
insert into public.function_catalog(id,tenant_id,name,discipline,required_certificate_codes) values('d0900000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','Operator','Service','{TEST}');
insert into public.customers(id,tenant_id,customer_number,name) values('d1000000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','K-DOS','Dossier customer');
insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values('d1100000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','O-DOS','Dossier object','{}');
insert into public.work_orders(id,tenant_id,work_order_number,customer_id,object_id,discipline,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values
 ('d1200000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','W-DOS','d1000000-0000-4000-8000-000000000001','d1100000-0000-4000-8000-000000000001','Service','2090-06-30 22:00+02','2090-07-01 00:00+02','2090-06-30 22:00+02','2090-07-01 00:00+02','d0100000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d0100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into public.personnel_dossier_items(id,tenant_id,personnel_id,kind,title,dossier_managed,dossier_status,dossier_data) values('d0400000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','profile','Profile',true,'active','{"name":"Changed employee","employeeNumber":"DOS-1","email":"employee@fieldgrid.test","employmentStatus":"active"}')$$,'profile saves');
select is((select full_name from public.personnel where id='d0300000-0000-4000-8000-000000000001'),'Changed employee','canonical identity is updated atomically');
select throws_ok($$insert into public.personnel_dossier_items(tenant_id,personnel_id,kind,title,dossier_managed) values('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000003','task','Cross tenant',true)$$,'23503',null,'cross-tenant employee relation fails');
select lives_ok($$insert into public.personnel_dossier_items(id,tenant_id,personnel_id,kind,title,dossier_managed,dossier_status,dossier_data) values('d0400000-0000-4000-8000-000000000002','d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','review','Development',true,'planned','{"startsOn":"2090-06-01","followupTitle":"Follow-up training","dueOn":"2090-06-10","ownerId":"d0100000-0000-4000-8000-000000000001","reminderEmails":"management@fieldgrid.test","reminderDays":"14,7,0"}')$$,'review and generated follow-up task save');
select is((select count(*)::int from public.personnel_dossier_items where kind='task' and dossier_data->>'generatedFrom'='d0400000-0000-4000-8000-000000000002'),1,'one generated task');
select is((select count(*)::int from public.personnel_dossier_deliveries where source_id='d0400000-0000-4000-8000-000000000002' and status='scheduled'),6,'three conversation dates for two explicit recipients');
update public.personnel_dossier_items set dossier_data=dossier_data||'{"dueOn":"2090-06-20"}' where id='d0400000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.personnel_dossier_items where kind='task'),1,'updating agreement never duplicates task');
select is((select due_on from public.personnel_dossier_items where kind='task'),'2090-06-20'::date,'generated task deadline follows source');
select is((select count(*)::int from public.personnel_dossier_deliveries where status='scheduled'),12,'conversation and follow-up deadlines have independent reminders');
select is((select count(*)::int from public.personnel_dossier_deliveries where status='cancelled'),12,'old conversation and follow-up reminders retained as cancelled');
select is((select count(*)::int from public.personnel_dossier_history where source_id='d0400000-0000-4000-8000-000000000002'),2,'private immutable versions are retained');
select throws_ok($$update public.personnel_dossier_history set snapshot='{}'$$,'42501',null,'history cannot be overwritten');
select throws_ok($$update public.personnel_dossier_items set dossier_managed=false where id='d0400000-0000-4000-8000-000000000001'$$,'42501',null,'privacy flag cannot be removed');
select throws_ok($$delete from public.personnel_dossier_items where id='d0400000-0000-4000-8000-000000000001'$$,'42501',null,'history cannot be deleted through HR CRUD');
select lives_ok($$insert into public.personnel_dossier_items(id,tenant_id,personnel_id,kind,title,dossier_managed,dossier_status,dossier_data) values('d0400000-0000-4000-8000-000000000003','d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','asset','Test tool',true,'issued','{"dueOn":"2090-07-01"}')$$,'asset generates return task');
update public.personnel_dossier_items set dossier_status='returned',dossier_data=dossier_data||'{"returnedOn":"2090-07-01"}' where id='d0400000-0000-4000-8000-000000000003';
select is((select dossier_status from public.personnel_dossier_items where kind='task' and dossier_data->>'generatedFrom'='d0400000-0000-4000-8000-000000000003'),'completed','actual return completes the related task');
select lives_ok($$insert into public.personnel_dossier_items(tenant_id,personnel_id,kind,title,dossier_managed,dossier_status,dossier_data) values('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','absence','Process',true,'recovered','{"startsOn":"2089-03-25","endsOn":"2089-03-28"}')$$,'administrative absence updates operational availability');
select is((select count(*)::int from public.availability where personnel_id='d0300000-0000-4000-8000-000000000001' and kind='unavailable' and note is null),1,'planning receives only unavailable without medical notes');

insert into public.personnel_contracts(id,tenant_id,personnel_id,starts_on,ends_on,employment_type,hours_per_week,function_id,dossier_managed,dossier_status,dossier_data) values
 ('d0500000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','2089-01-01','2090-03-31','fixed',32,'d0900000-0000-4000-8000-000000000001',true,'active','{"noticePolicy":"applicable","reminderEmails":"manager@fieldgrid.test","reminderDays":"0"}');
select is((select min(due_on) from public.personnel_dossier_deliveries where source_id='d0500000-0000-4000-8000-000000000001'),'2090-02-28'::date,'notice uses one calendar month, not 30 days');
select is((select count(*)::int from public.personnel_dossier_deliveries where source_id='d0500000-0000-4000-8000-000000000001' and status='scheduled'),2,'contract end is scheduled independently of the written notice deadline');
update public.personnel_contracts set review_on='2090-01-15',dossier_data=dossier_data||'{"probationUntil":"2089-02-28"}' where id='d0500000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.personnel_dossier_deliveries where source_id='d0500000-0000-4000-8000-000000000001' and status='scheduled'),4,'probation and explicit contract discussion are also scheduled');
update public.personnel_contracts set review_on=null,dossier_data=dossier_data-'probationUntil' where id='d0500000-0000-4000-8000-000000000001';
insert into public.personnel_contracts(tenant_id,personnel_id,starts_on,employment_type,dossier_managed,dossier_status,dossier_data) values('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000002','2089-01-01','permanent',true,'active','{"reminderEmails":"manager@fieldgrid.test"}');
select is((select count(*)::int from public.personnel_dossier_deliveries where personnel_id='d0300000-0000-4000-8000-000000000002'),0,'permanent contract has no invented end reminder');
select is(public.prepare_personnel_checklist('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000002','onboarding'),6,'onboarding checklist creates applicable base tasks');
select is(public.prepare_personnel_checklist('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000002','onboarding'),0,'repeated checklist action is idempotent');
select throws_ok($$insert into public.personnel_contracts(tenant_id,personnel_id,starts_on,employment_type,dossier_managed,previous_id) values('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000002','2090-01-01','fixed',true,'d0500000-0000-4000-8000-000000000001')$$,'23514',null,'previous contract must belong to same person');
select lives_ok($$select * from public.personnel_dossier_summary('d0200000-0000-4000-8000-000000000001')$$,'list summaries return only permitted business metadata');

insert into public.personnel_documents(id,tenant_id,personnel_id,title,document_type,storage_path,created_by,dossier_managed,dossier_status) values('d0600000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','Employment contract','contract','d0200000-0000-4000-8000-000000000001/d0300000-0000-4000-8000-000000000001/contract.pdf','d0100000-0000-4000-8000-000000000001',true,'stored');
select lives_ok($$insert into storage.objects(bucket_id,name) values('personnel-documents','d0200000-0000-4000-8000-000000000001/d0300000-0000-4000-8000-000000000001/contract.pdf')$$,'HR can upload private document');
select is((select count(*)::int from storage.objects where bucket_id='personnel-documents' and name like 'd0200000-%'),1,'HR can read private file');
select set_config('storage.allow_delete_query','true',true);
with removed as(delete from storage.objects where bucket_id='personnel-documents' and name like 'd0200000-%' returning id)
select is((select count(*)::int from removed),0,'linked file cannot be deleted, preserving document versions');
select throws_ok($$update public.personnel_documents set visible_to_employee=true where id='d0600000-0000-4000-8000-000000000001'$$,'23514',null,'HR document cannot be made portal-visible');
select throws_ok($$update public.personnel_documents set storage_path='replacement.pdf' where id='d0600000-0000-4000-8000-000000000001'$$,'23514',null,'file replacement must create a version');
select throws_ok($$insert into public.personnel_documents(tenant_id,personnel_id,title,document_type,storage_path,created_by) values('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','VOG kopie','other','fake.pdf','d0100000-0000-4000-8000-000000000001')$$,'23514',null,'generic upload cannot bypass VOG restriction');
select throws_ok($$insert into public.personnel_documents(tenant_id,personnel_id,title,document_type,storage_path,created_by) values('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','Medisch dossier','other','fake.pdf','d0100000-0000-4000-8000-000000000001')$$,'23514',null,'generic upload cannot bypass medical restriction');
select throws_ok($$insert into public.personnel_dossier_items(tenant_id,personnel_id,kind,title,dossier_managed,dossier_data) values('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000002','review','Other review',true,'{"document_ids":["d0600000-0000-4000-8000-000000000001"]}')$$,'23514',null,'documents cannot be linked across employees');
insert into public.certificates(id,tenant_id,personnel_id,code,name,valid_from,expires_on,dossier_managed,dossier_status) values('d0700000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','TEST','Test evidence','2090-01-01','2090-06-30',true,'unverified');
select ok((select verified_at is null from public.qualifications where code='TEST' and tenant_id='d0200000-0000-4000-8000-000000000001'),'new certificate is never automatically verified');
update public.certificates set dossier_status='approved',dossier_data='{"verificationNote":"Evidence inspected"}' where id='d0700000-0000-4000-8000-000000000001';
select ok((select verified_at is not null from public.qualifications where code='TEST' and tenant_id='d0200000-0000-4000-8000-000000000001'),'explicit verification updates operational projection');
update public.certificates set dossier_data=dossier_data||'{"issuer":"Corrected issuer"}' where id='d0700000-0000-4000-8000-000000000001';
select is((select dossier_status from public.certificates where id='d0700000-0000-4000-8000-000000000001'),'review','changed evidence must be checked again');
select ok((select verified_at is null from public.qualifications where code='TEST' and tenant_id='d0200000-0000-4000-8000-000000000001'),'changed evidence immediately removes operational approval');
update public.certificates set dossier_status='approved' where id='d0700000-0000-4000-8000-000000000001';
insert into public.personnel_functions(tenant_id,personnel_id,function_id) values('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','d0900000-0000-4000-8000-000000000001');
select lives_ok($$insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values('d0800000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','d1200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','2090-06-30 22:00+02','2090-07-01 00:00+02','2090-06-30 22:00+02','2090-07-01 00:00+02')$$,'valid-to is inclusive, exclusive next-midnight end is allowed');
select throws_ok($$update public.work_order_assignments set projected_end_at='2090-07-01 00:01+02' where id='d0800000-0000-4000-8000-000000000001'$$,'23514',null,'entire work period must be covered');
select is((select qualification_snapshot->0->>'evidence_id' from public.work_order_assignments where id='d0800000-0000-4000-8000-000000000001'),'d0700000-0000-4000-8000-000000000001','snapshot records checked evidence version');
update public.certificates set dossier_status='revoked' where id='d0700000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.personnel_qualification_gaps('d0200000-0000-4000-8000-000000000001')),1,'revocation signals already planned future work');
select is((select qualification_snapshot->0->>'verified' from public.work_order_assignments where id='d0800000-0000-4000-8000-000000000001'),'true','historical checked snapshot is not rewritten by revocation');
select throws_ok($$update public.work_order_assignments set projected_start_at='2090-06-30 22:01+02' where id='d0800000-0000-4000-8000-000000000001'$$,'23514',null,'new planning blocked after revocation');
insert into public.qualification_types(tenant_id,code,name) values('d0200000-0000-4000-8000-000000000001','ADDITIONAL','Additional operational requirement');
insert into public.qualification_requirements(id,tenant_id,code,scope,service_name) values('d1300000-0000-4000-8000-000000000001','d0200000-0000-4000-8000-000000000001','ADDITIONAL','service','Service');
select is((select count(*)::int from public.personnel_qualification_gaps('d0200000-0000-4000-8000-000000000001')),2,'new work requirements signal existing future assignments');
update public.qualification_requirements set active=false where id='d1300000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.personnel_qualification_gaps('d0200000-0000-4000-8000-000000000001')),1,'pausing an obsolete requirement releases future planning without deleting history');

select set_config('request.jwt.claims','{"sub":"d0100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from public.personnel_dossier_items),0,'employee cannot read own HR dossier');
select is((select count(*)::int from public.personnel_dossier_history),0,'employee cannot read private versions');
select is((select count(*)::int from public.personnel_contracts where dossier_managed),0,'employee cannot read HR contract details');
select is((select count(*)::int from public.personnel_documents where dossier_managed),0,'employee cannot read private HR documents');
select is((select count(*)::int from storage.objects where bucket_id='personnel-documents' and name like 'd0200000-%'),0,'private HR bytes are not accessible to the employee');
select throws_ok($$select * from public.personnel_dossier_owners('d0200000-0000-4000-8000-000000000001')$$,'42501',null,'staff cannot enumerate management email recipients');
select is((select count(*)::int from public.personnel_dossier_deliveries),0,'employee cannot read management recipients');
select is((select count(*)::int from public.personnel_dossier_summary('d0200000-0000-4000-8000-000000000001')),0,'employee cannot read list summaries');
select throws_ok($$insert into public.personnel_dossier_items(tenant_id,personnel_id,kind,title,dossier_managed) values('d0200000-0000-4000-8000-000000000001','d0300000-0000-4000-8000-000000000001','task','Staff write',true)$$,'42501',null,'staff cannot write own HR dossier');
select throws_ok($$select * from public.claim_personnel_dossier_deliveries(25)$$,'42501',null,'workers are service-role only');
select set_config('request.jwt.claims','{"sub":"d0100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from public.personnel_dossier_items),0,'planner cannot read HR information');
select is((select count(*)::int from public.personnel_qualification_gaps('d0200000-0000-4000-8000-000000000001')),1,'planner sees only operational qualification gaps');
select throws_ok($$select * from public.personnel_qualification_gaps('d0200000-0000-4000-8000-000000000002')$$,'42501',null,'cannot inspect another tenant planning');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.personnel_dossier_deliveries set available_at=now()-interval '1 hour' where status='scheduled';
set local role service_role;
select is((select count(*)::int from public.claim_personnel_dossier_deliveries(100)),14,'worker claims due records once');
select is((select count(*)::int from public.claim_personnel_dossier_deliveries(100)),0,'repeated processing cannot claim in-flight records');
reset role;
select * from finish();
rollback;
