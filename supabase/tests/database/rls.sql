begin;

select plan(26);

select has_table('public', 'tenants', 'tenants table exists');
select has_table('public', 'work_orders', 'work orders table exists');
select has_table('public', 'payment_allocations', 'payment allocations table exists');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-a@fieldgrid.test', crypt('Fieldgrid123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'staff-a@fieldgrid.test', crypt('Fieldgrid123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'finance-a@fieldgrid.test', crypt('Fieldgrid123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-b@fieldgrid.test', crypt('Fieldgrid123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.tenants (id, slug, name) values
  ('a0000000-0000-4000-8000-000000000001', 'tenant-a', 'Tenant A'),
  ('b0000000-0000-4000-8000-000000000001', 'tenant-b', 'Tenant B');
insert into public.tenant_settings (tenant_id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001');
insert into public.tenant_branding (tenant_id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001');
insert into public.tenant_memberships (tenant_id, user_id, roles, status, activated_at) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', array['tenant_admin','management']::public.app_role[], 'active', now()),
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', array['staff']::public.app_role[], 'active', now()),
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', array['finance']::public.app_role[], 'active', now()),
  ('b0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', array['tenant_admin']::public.app_role[], 'active', now());

insert into public.personnel (id, tenant_id, user_id, employee_number, full_name) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'A-001', 'Medewerker A');

insert into public.customers (id, tenant_id, customer_number, name) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'A-K001', 'Klant A'),
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'B-K001', 'Klant B');
insert into public.objects (id, tenant_id, customer_id, object_number, name, address) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'A-O001', 'Object A', '{"street":"Teststraat 1"}'),
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'B-O001', 'Object B', '{"street":"Teststraat 2"}');

insert into public.work_orders (
  id, tenant_id, work_order_number, customer_id, object_id, discipline,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at, created_by
) values
  ('a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'A-W001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Service', '2026-09-28 10:00+02', '2026-09-28 10:30+02', '2026-09-28 10:00+02', '2026-09-28 10:30+02', '10000000-0000-4000-8000-000000000001'),
  ('a4000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'A-W002', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Service', '2026-09-28 11:00+02', '2026-09-28 11:30+02', '2026-09-28 11:00+02', '2026-09-28 11:30+02', '10000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'B-W001', 'b2000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 'Service', '2026-09-28 10:00+02', '2026-09-28 10:30+02', '2026-09-28 10:00+02', '2026-09-28 10:30+02', '20000000-0000-4000-8000-000000000001');
insert into public.work_order_assignments (
  id, tenant_id, work_order_id, personnel_id, status,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at
) values (
  'a5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'released',
  '2026-09-28 10:00+02', '2026-09-28 10:30+02', '2026-09-28 10:00+02', '2026-09-28 10:30+02'
);
update public.work_orders set status = 'released' where id = 'a4000000-0000-4000-8000-000000000001';
insert into public.dispatches (tenant_id, work_order_id, assignment_id, dispatched_by, idempotency_key)
values ('a0000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'rls-fixture');
insert into public.personnel_notes (tenant_id, personnel_id, body, created_by)
values ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Vertrouwelijk', '10000000-0000-4000-8000-000000000001');
insert into public.personnel_documents (tenant_id, personnel_id, title, document_type, storage_path, visible_to_employee, created_by, file_name, mime_type, size_bytes, sha256)
values ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Eigen contract', 'contract', 'a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/contract.pdf', true, '10000000-0000-4000-8000-000000000001', 'contract.pdf', 'application/pdf', 1234, repeat('a', 64));
insert into public.invoices (id, tenant_id, customer_id, created_by)
values ('a6000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every public application table has RLS enabled'
);
select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relforcerowsecurity),
  0,
  'every public application table forces RLS'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.tenants), 1, 'tenant A administrator sees one tenant');
select is((select count(*)::integer from public.customers), 1, 'tenant A administrator cannot read tenant B customers');
select throws_ok(
  $$insert into public.customers (tenant_id, customer_number, name) values ('b0000000-0000-4000-8000-000000000001', 'B-X', 'Verboden')$$,
  '42501',
  null,
  'tenant A administrator cannot insert into tenant B'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.work_orders), 0, 'staff must use the safe assigned-order projection instead of raw work orders');
select is((select count(*)::integer from public.customers), 1, 'staff sees only the customer of an assigned work order');
select is((select count(*)::integer from public.objects), 1, 'staff sees only the object of an assigned work order');
select is((select count(*)::integer from public.invoices), 0, 'staff cannot read invoices');
select is((select count(*)::integer from public.personnel_documents), 1, 'staff can read an explicitly visible own document');
select ok(
  (select private.can_access_storage_object('personnel-documents', 'a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/contract.pdf', false)),
  'staff can read the matching private own-document object'
);
select ok(
  (select private.can_access_storage_object('reports', 'a0000000-0000-4000-8000-000000000001/a4000000-0000-4000-8000-000000000001/test.jpg', false)),
  'staff can read report storage for an assigned work order'
);
select ok(
  not (select private.can_access_storage_object('reports', 'b0000000-0000-4000-8000-000000000001/b4000000-0000-4000-8000-000000000001/test.jpg', false)),
  'staff cannot read another tenant storage path'
);
select ok(
  not (select private.can_access_storage_object('reports', 'not-a-tenant/not-an-order/test.jpg', false)),
  'malformed storage paths fail closed'
);
select ok(
  (select private.can_access_storage_object('branding', 'a0000000-0000-4000-8000-000000000001/logo.png', false)),
  'staff can read own-tenant branding'
);
select ok(
  not (select private.can_access_storage_object('branding', 'a0000000-0000-4000-8000-000000000001/logo.png', true)),
  'staff cannot overwrite tenant branding'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.personnel_notes), 0, 'finance cannot read confidential personnel notes');
select is((select count(*)::integer from public.personnel_documents), 0, 'finance cannot read confidential personnel documents');
select is((select count(*)::integer from public.invoices), 1, 'finance can read own-tenant invoices');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.personnel_documents), 0, 'another tenant administrator cannot read personnel documents');
select ok(
  not (select private.can_access_storage_object('branding', 'a0000000-0000-4000-8000-000000000001/logo.png', false)),
  'another tenant cannot read the private branding object'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is((select count(*)::integer from public.tenants), 0, 'bare authenticated SQL without a verified user claim sees no tenant data');

reset role;
select throws_ok(
  $$insert into public.work_orders (tenant_id, work_order_number, customer_id, object_id, discipline, planned_start_at, planned_end_at, projected_start_at, projected_end_at, created_by) values ('a0000000-0000-4000-8000-000000000001', 'A-CROSS', 'b2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Service', now(), now() + interval '30 min', now(), now() + interval '30 min', '10000000-0000-4000-8000-000000000001')$$,
  '23503',
  null,
  'cross-tenant foreign keys are rejected by PostgreSQL'
);

select * from finish();
rollback;
