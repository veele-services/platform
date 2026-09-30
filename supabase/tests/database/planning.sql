begin;

select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'planner@fieldgrid.test', crypt('Fieldgrid123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'worker@fieldgrid.test', crypt('Fieldgrid123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.tenants (id, slug, name) values ('e1000000-0000-4000-8000-000000000001', 'planning-test', 'Planning Test');
insert into public.tenant_settings (tenant_id) values ('e1000000-0000-4000-8000-000000000001');
insert into public.tenant_memberships (tenant_id, user_id, roles, status, activated_at) values
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', array['planner']::public.app_role[], 'active', now()),
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', array['staff']::public.app_role[], 'active', now());
insert into public.personnel (id, tenant_id, user_id, employee_number, full_name) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'P-001', 'Medewerker Een'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', null, 'P-002', 'Medewerker Twee');
insert into public.customers (id, tenant_id, customer_number, name) values ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'K-001', 'Planklant');
insert into public.objects (id, tenant_id, customer_id, object_number, name, address) values ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'O-001', 'Planobject', '{}');
insert into public.work_orders (id, tenant_id, work_order_number, customer_id, object_id, discipline, planned_start_at, planned_end_at, projected_start_at, projected_end_at, created_by) values
  ('e5000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'W-001', 'e3000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'Service', '2026-10-01 10:00+02', '2026-10-01 10:30+02', '2026-10-01 10:00+02', '2026-10-01 10:30+02', 'e0000000-0000-4000-8000-000000000001'),
  ('e5000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'W-002', 'e3000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'Service', '2026-10-01 11:00+02', '2026-10-01 11:30+02', '2026-10-01 11:00+02', '2026-10-01 11:30+02', 'e0000000-0000-4000-8000-000000000001');
insert into public.work_order_assignments (tenant_id, work_order_id, personnel_id, planned_start_at, planned_end_at, projected_start_at, projected_end_at) values
  ('e1000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', '2026-10-01 10:00+02', '2026-10-01 10:30+02', '2026-10-01 10:00+02', '2026-10-01 10:30+02'),
  ('e1000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', '2026-10-01 11:00+02', '2026-10-01 11:30+02', '2026-10-01 11:00+02', '2026-10-01 11:30+02');
insert into public.availability (tenant_id, personnel_id, starts_at, ends_at, kind) values ('e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', '2026-10-01 13:00+02', '2026-10-01 14:00+02', 'leave');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.reschedule_work_order('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','2026-10-01 10:17+02',(select version from public.work_orders where id='e5000000-0000-4000-8000-000000000001'))$$,
  'planner moves a planned work order to the exact minute'
);
select is((select projected_start_at from public.work_order_assignments where work_order_id='e5000000-0000-4000-8000-000000000001' and status<>'cancelled'), '2026-10-01 10:17+02'::timestamptz, 'the exact minute is persisted; the old assignment is retained as history');
select throws_ok(
  $$select public.reschedule_work_order('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','2026-10-01 13:10+02',(select version from public.work_orders where id='e5000000-0000-4000-8000-000000000001'))$$,
  '23P01', null, 'leave blocks scheduling'
);
select throws_ok(
  $$select public.reschedule_work_order('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','2026-10-01 11:10+02',(select version from public.work_orders where id='e5000000-0000-4000-8000-000000000001'))$$,
  '23P01', null, 'overlap blocks scheduling'
);
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.reschedule_work_order('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','2026-10-01 15:00+02',(select version from public.work_orders where id='e5000000-0000-4000-8000-000000000001'))$$,
  '42501', null, 'staff cannot reschedule work orders'
);

select * from finish();
rollback;
