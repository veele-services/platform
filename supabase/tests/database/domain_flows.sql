begin;

select plan(21);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'manager@fieldgrid.test', crypt('Fieldgrid123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'staff@fieldgrid.test', crypt('Fieldgrid123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into auth.sessions(id,user_id,created_at,updated_at)
select id,id,now(),now() from auth.users where id in ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');

insert into public.tenants (id, slug, name) values ('c0000000-0000-4000-8000-000000000001', 'flow-test', 'Fieldgrid Testtenant');
insert into public.tenant_settings (tenant_id, invoice_prefix) values ('c0000000-0000-4000-8000-000000000001', 'FG');
insert into public.tenant_branding (tenant_id, sender_name) values ('c0000000-0000-4000-8000-000000000001', 'Fieldgrid');
insert into public.tenant_memberships (tenant_id, user_id, roles, status, activated_at) values
  ('c0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', array['tenant_admin','management','planner','finance']::public.app_role[], 'active', now()),
  ('c0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', array['staff']::public.app_role[], 'active', now());
insert into public.personnel (id, tenant_id, user_id, employee_number, full_name) values
  ('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'FG-001', 'Medewerker');
insert into public.customers (id, tenant_id, customer_number, name, billing_address) values
  ('c2000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'KL-001', 'Testklant', '{"street":"Teststraat 1","city":"Den Haag"}');
insert into public.objects (id, tenant_id, customer_id, object_number, name, address) values
  ('c3000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'OB-001', 'Testobject', '{"street":"Teststraat 1","city":"Den Haag"}');
insert into public.task_catalog (id, tenant_id, code, discipline, name) values
  ('c4000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'FG-001', 'Service', 'Basistaak');
insert into public.task_revisions (id, tenant_id, task_id, revision, duration_minutes, price_cents, vat_basis_points, unit) values
  ('c5000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001', 1, 30, 10000, 2100, 'task');
insert into public.work_orders (
  id, tenant_id, work_order_number, customer_id, object_id, discipline,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at, created_by
) values (
  'c6000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'WO-001',
  'c2000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'Service',
  clock_timestamp(), clock_timestamp() + interval '30 minutes', clock_timestamp(), clock_timestamp() + interval '30 minutes',
  '30000000-0000-4000-8000-000000000001'
);
insert into public.work_order_tasks (
  id, tenant_id, work_order_id, task_revision_id, task_code, task_name,
  duration_minutes, unit, unit_price_cents, vat_basis_points
) values (
  'c7000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001', 'FG-001', 'Basistaak', 30, 'task', 10000, 2100
);
insert into public.work_order_assignments (
  id, tenant_id, work_order_id, personnel_id, planned_start_at, planned_end_at, projected_start_at, projected_end_at
) values (
  'c8000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
  clock_timestamp(), clock_timestamp() + interval '30 minutes', clock_timestamp(), clock_timestamp() + interval '30 minutes'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.dispatch_work_order('c6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', (select version from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'dispatch-1')$$,
  'planner can dispatch an assigned work order'
);
select is((select status::text from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'released', 'dispatch releases the work order');
select lives_ok(
  $$select public.dispatch_work_order('c6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 1, 'dispatch-1')$$,
  'dispatch retry with the same idempotency key is harmless'
);
select is((select count(*)::integer from public.dispatches where idempotency_key = 'dispatch-1'), 1, 'dispatch retry creates one dispatch');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000002","session_id":"30000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.transition_work_order('c6000000-0000-4000-8000-000000000001', 'start', (select version from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'early-start')$$,
  '23514', null, 'staff cannot skip the seen and travelling states'
);
select lives_ok(
  $$select public.transition_work_order('c6000000-0000-4000-8000-000000000001', 'open', (select version from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'open-1')$$,
  'opening a released work order succeeds'
);
select lives_ok(
  $$select public.transition_work_order('c6000000-0000-4000-8000-000000000001', 'open', 1, 'open-1')$$,
  'opening retry is idempotent even with a stale version'
);
select is((select status::text from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'seen', 'opening stores seen state');
select lives_ok(
  $$select public.transition_work_order('c6000000-0000-4000-8000-000000000001', 'travel', (select version from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'travel-1')$$,
  'staff can report travelling'
);
select lives_ok(
  $$select public.transition_work_order('c6000000-0000-4000-8000-000000000001', 'start', (select version from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'start-1')$$,
  'staff can start after travelling'
);
select ok((select actual_start_at is not null from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'start uses a server timestamp');
select is((select count(*)::integer from public.time_entries where assignment_id = 'c8000000-0000-4000-8000-000000000001' and kind = 'work'), 1, 'start creates exactly one work time entry');
select throws_ok(
  $$select public.transition_work_order('c6000000-0000-4000-8000-000000000001', 'complete', (select version from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'complete-too-early')$$,
  '23514', null, 'completion is blocked while a required task is unchecked'
);
select lives_ok(
  $$select public.complete_work_order_task('c7000000-0000-4000-8000-000000000001', true, null)$$,
  'staff can complete the assigned task'
);
select lives_ok(
  $$select public.transition_work_order('c6000000-0000-4000-8000-000000000001', 'complete', (select version from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'complete-1')$$,
  'completion succeeds after the checklist is complete'
);
select ok((select ends_at is not null from public.time_entries where assignment_id = 'c8000000-0000-4000-8000-000000000001' and kind = 'work'), 'completion closes the server work time entry');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.review_work_order('c6000000-0000-4000-8000-000000000001', 'returned', 'Vul de rapportage aan')$$,
  'management can return a completed report for correction'
);
select is((select status::text from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'correction_required', 'a returned review enters correction state');
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000002","session_id":"30000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.transition_work_order('c6000000-0000-4000-8000-000000000001', 'resubmit', (select version from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'resubmit-1')$$,
  'staff can resubmit a corrected report without returning the work order'
);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","session_id":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.review_work_order('c6000000-0000-4000-8000-000000000001', 'approved', null)$$,
  'management can approve a completed work order'
);
select is((select status::text from public.work_orders where id = 'c6000000-0000-4000-8000-000000000001'), 'invoice_ready', 'approval makes the work order invoice ready');

select * from finish();
rollback;
