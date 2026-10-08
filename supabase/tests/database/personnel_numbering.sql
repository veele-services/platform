begin;
select no_plan();

-- Confirmed actors keep permission denials independent of Auth activation.
insert into auth.users (id, email, email_confirmed_at) values
  ('f1000000-0000-4000-8000-000000000001', 'number-admin@fieldgrid.test', now()),
  ('f1000000-0000-4000-8000-000000000002', 'number-hr@fieldgrid.test', now()),
  ('f1000000-0000-4000-8000-000000000003', 'number-staff@fieldgrid.test', now());
-- Real sessions: authenticated RLS must reject stale or missing sessions.
insert into auth.sessions(id,user_id) select id,id from auth.users where id in ('f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003');

insert into public.tenants (id, slug, name) values
  ('fa000000-0000-4000-8000-000000000001', 'number-a', 'Number A'),
  ('fb000000-0000-4000-8000-000000000001', 'number-b', 'Number B');
insert into public.tenant_settings (tenant_id) values
  ('fa000000-0000-4000-8000-000000000001'), ('fb000000-0000-4000-8000-000000000001');
insert into public.tenant_memberships (tenant_id, user_id, roles, status) values
  ('fa000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', array['tenant_admin']::public.app_role[], 'active'),
  ('fa000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', array['hr']::public.app_role[], 'active'),
  ('fa000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003', array['staff']::public.app_role[], 'active');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","session_id":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.suggest_personnel_number('fa000000-0000-4000-8000-000000000001'), 'P-0001', 'default prefix and start');
select is(public.suggest_personnel_number('fa000000-0000-4000-8000-000000000001'), 'P-0001', 'preview does not consume number');
select is((select count(*)::int from private.personnel_number_counters), 0, 'preview has no writes');
select lives_ok($$insert into public.personnel (tenant_id, full_name) values ('fa000000-0000-4000-8000-000000000001', 'First auto')$$, 'omitted number is allocated');
select is((select employee_number from public.personnel where full_name = 'First auto'), 'P-0001', 'first allocation matches preview');
select lives_ok($$insert into public.personnel (tenant_id, employee_number, full_name) values ('fa000000-0000-4000-8000-000000000001', '', 'Second auto')$$, 'blank number is allocated');
select is((select employee_number from public.personnel where full_name = 'Second auto'), 'P-0002', 'next allocation increments');
select lives_ok($$insert into public.personnel (tenant_id, employee_number, full_name) values ('fa000000-0000-4000-8000-000000000001', 'SPECIAL-9', 'Manual')$$, 'manual override accepted');
select is((select employee_number from public.personnel where full_name = 'Manual'), 'SPECIAL-9', 'manual number preserved');
select throws_ok($$insert into public.personnel (tenant_id, employee_number, full_name) values ('fa000000-0000-4000-8000-000000000001', 'P-0001', 'Duplicate')$$, '23505', null, 'duplicate manual number rejected');
select lives_ok($$update public.tenant_settings set personnel_number_prefix = 'MW-', personnel_number_start = 100 where tenant_id = 'fa000000-0000-4000-8000-000000000001'$$, 'admin can configure prefix and start');
select is(public.suggest_personnel_number('fa000000-0000-4000-8000-000000000001'), 'MW-0100', 'custom settings used');
select is((select employee_number from public.personnel where full_name = 'First auto'), 'P-0001', 'settings do not renumber existing personnel');
select lives_ok($$insert into public.personnel (tenant_id, employee_number, full_name, status) values ('fa000000-0000-4000-8000-000000000001', 'MW-0120', 'Former', 'former')$$, 'manual same-prefix number advances sequence');
select is(public.suggest_personnel_number('fa000000-0000-4000-8000-000000000001'), 'MW-0121', 'archived personnel count too');
select lives_ok($$update public.personnel set employee_number = 'LEGACY-1' where full_name = 'Former'$$, 'manual number remains editable');
select is(public.suggest_personnel_number('fa000000-0000-4000-8000-000000000001'), 'MW-0121', 'sequence does not rewind after editing old number');
select lives_ok($$update public.tenant_settings set personnel_number_start = 1 where tenant_id = 'fa000000-0000-4000-8000-000000000001'$$, 'start can be lowered');
select is(public.suggest_personnel_number('fa000000-0000-4000-8000-000000000001'), 'MW-0121', 'lower start cannot reuse issued numbers');
select throws_ok($$update public.tenant_settings set personnel_number_prefix = '<script>' where tenant_id = 'fa000000-0000-4000-8000-000000000001'$$, '23514', null, 'invalid prefix rejected');
select throws_ok($$update public.tenant_settings set personnel_number_start = 0 where tenant_id = 'fa000000-0000-4000-8000-000000000001'$$, '23514', null, 'invalid start rejected');
select throws_ok($$select public.suggest_personnel_number('fb000000-0000-4000-8000-000000000001')$$, '42501', null, 'cannot preview another tenant');
select throws_ok($$insert into public.personnel (tenant_id, full_name) values ('fb000000-0000-4000-8000-000000000001', 'Cross tenant')$$, '23514', null, 'cannot allocate in another tenant');
select is((select count(*)::int from private.personnel_number_counters where tenant_id = 'fb000000-0000-4000-8000-000000000001'), 0, 'counters are tenant scoped');

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","session_id":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$insert into public.personnel (tenant_id, full_name) values ('fa000000-0000-4000-8000-000000000001', 'HR created')$$, 'HR can allocate without settings-write permission');
select is((select employee_number from public.personnel where full_name = 'HR created'), 'MW-0121', 'HR allocation correct');
with changed as (update public.tenant_settings set personnel_number_prefix = 'HR-' returning tenant_id)
select is((select count(*)::int from changed), 0, 'HR cannot change numbering settings');

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000003","session_id":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.suggest_personnel_number('fa000000-0000-4000-8000-000000000001')$$, '42501', null, 'staff cannot preview personnel numbering');
select is((select count(*)::int from private.personnel_number_counters), 0, 'staff cannot read counters');
select throws_ok($$insert into public.personnel (tenant_id, full_name) values ('fa000000-0000-4000-8000-000000000001', 'Staff creation')$$, '42501', null, 'staff cannot allocate numbers');

reset role;
set local role service_role;
select lives_ok($$insert into public.personnel (tenant_id, full_name) values ('fb000000-0000-4000-8000-000000000001', 'Service auto')$$, 'service-role imports can use automatic numbering');
select is((select employee_number from public.personnel where full_name = 'Service auto'), 'P-0001', 'service-role auto number');
select lives_ok($$insert into public.personnel (tenant_id, employee_number, full_name) values ('fb000000-0000-4000-8000-000000000001', 'P-0005', 'Service manual')$$, 'service-role imports can keep manual numbers');
reset role;
insert into public.personnel (tenant_id, full_name) values ('fb000000-0000-4000-8000-000000000001', 'Other tenant');
select is((select employee_number from public.personnel where full_name = 'Other tenant'), 'P-0006', 'second tenant has independent numbering');
update public.tenant_settings set personnel_number_prefix = '', personnel_number_start = 10000 where tenant_id = 'fa000000-0000-4000-8000-000000000001';
insert into public.personnel (tenant_id, full_name) values ('fa000000-0000-4000-8000-000000000001', 'Large number');
select is((select employee_number from public.personnel where full_name = 'Large number'), '10000', 'empty prefix and numbers beyond four digits supported');
-- Simulate pre-migration staff: the candidate scans all persisted numbers, not a UI page.
insert into public.personnel (tenant_id, employee_number, full_name) values ('fa000000-0000-4000-8000-000000000001', 'OLD-0009', 'Imported');
update public.tenant_settings set personnel_number_prefix = 'OLD-', personnel_number_start = 1 where tenant_id = 'fa000000-0000-4000-8000-000000000001';
insert into public.personnel (tenant_id, full_name) values ('fa000000-0000-4000-8000-000000000001', 'After imported');
select is((select employee_number from public.personnel where full_name = 'After imported'), 'OLD-0010', 'existing numbers skipped even without a stored counter');
update public.tenant_settings set personnel_number_prefix = 'MAX-', personnel_number_start = 999999999 where tenant_id = 'fa000000-0000-4000-8000-000000000001';
insert into public.personnel (tenant_id, full_name) values ('fa000000-0000-4000-8000-000000000001', 'Maximum');
select is((select employee_number from public.personnel where full_name = 'Maximum'), 'MAX-999999999', 'maximum supported without truncation');
select throws_ok($$insert into public.personnel (tenant_id, full_name) values ('fa000000-0000-4000-8000-000000000001', 'Overflow')$$, '22003', null, 'exhausted series fails clearly');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.tenant_settings set enabled_services = array['planning'] where tenant_id = 'fa000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","session_id":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.suggest_personnel_number('fa000000-0000-4000-8000-000000000001')$$, '42501', null, 'disabled module blocks preview');
select is((select count(*)::int from private.personnel_number_counters), 0, 'disabled module hides counters');
reset role;
set local role anon;
select throws_ok($$select public.suggest_personnel_number('fa000000-0000-4000-8000-000000000001')$$, '42501', null, 'anonymous cannot call preview');
reset role;
select * from finish();
rollback;
