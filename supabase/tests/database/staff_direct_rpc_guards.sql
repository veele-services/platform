begin;

select plan(10);

insert into auth.users (id, email, email_confirmed_at) values
  ('ab200000-0000-4000-8000-000000000001', 'staff-direct-rpc@fieldgrid.invalid', now()),
  ('ab200000-0000-4000-8000-000000000002', 'manager-direct-rpc@fieldgrid.invalid', now());
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('ab200000-0000-4000-8000-000000000011', 'ab200000-0000-4000-8000-000000000001', now(), now()),
  ('ab200000-0000-4000-8000-000000000012', 'ab200000-0000-4000-8000-000000000002', now(), now());
insert into public.tenants (id, slug, name, timezone) values
  ('ab200000-0000-4000-8000-000000000021', 'staff-direct-rpc', 'FICTITIOUS direct RPC tenant', 'Europe/Amsterdam');
insert into public.tenant_settings (tenant_id, enabled_services) values
  ('ab200000-0000-4000-8000-000000000021', array['personeel','planning','rapportage']);
insert into public.tenant_memberships (
  tenant_id, user_id, roles, status, activated_at
) values
  (
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000001',
    array['staff']::public.app_role[], 'active', now()
  ),
  (
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000002',
    array['management']::public.app_role[], 'active', now()
  );
insert into public.personnel (
  id, tenant_id, user_id, employee_number, full_name, status
) values
  (
    'ab200000-0000-4000-8000-000000000031',
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000001',
    'FICT-RPC-001', 'FICTITIOUS Direct RPC Staff', 'active'
  ),
  (
    'ab200000-0000-4000-8000-000000000034',
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000002',
    'FICT-RPC-002', 'FICTITIOUS Direct RPC Manager', 'active'
  );
insert into public.function_catalog (id, tenant_id, name, discipline) values (
  'ab200000-0000-4000-8000-000000000032',
  'ab200000-0000-4000-8000-000000000021',
  'FICTITIOUS Direct RPC Engineer', 'Service'
);
insert into public.personnel_functions (
  id, tenant_id, personnel_id, function_id
) values (
  'ab200000-0000-4000-8000-000000000033',
  'ab200000-0000-4000-8000-000000000021',
  'ab200000-0000-4000-8000-000000000031',
  'ab200000-0000-4000-8000-000000000032'
);
insert into public.customers (
  id, tenant_id, customer_number, name, billing_address
) values (
  'ab200000-0000-4000-8000-000000000041',
  'ab200000-0000-4000-8000-000000000021',
  'FICT-RPC-CUSTOMER', 'FICTITIOUS Direct RPC Customer', '{}'::jsonb
);
insert into public.objects (
  id, tenant_id, customer_id, object_number, name, address
) values (
  'ab200000-0000-4000-8000-000000000042',
  'ab200000-0000-4000-8000-000000000021',
  'ab200000-0000-4000-8000-000000000041',
  'FICT-RPC-OBJECT', 'FICTITIOUS Direct RPC Object', '{}'::jsonb
);
insert into public.work_orders (
  id, tenant_id, work_order_number, customer_id, object_id, discipline,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at,
  created_by, status
) values (
  'ab200000-0000-4000-8000-000000000043',
  'ab200000-0000-4000-8000-000000000021',
  'FICT-RPC-WO-001',
  'ab200000-0000-4000-8000-000000000041',
  'ab200000-0000-4000-8000-000000000042',
  'Service', clock_timestamp(), clock_timestamp() + interval '2 hours',
  clock_timestamp(), clock_timestamp() + interval '2 hours',
  'ab200000-0000-4000-8000-000000000002', 'planned'
);
insert into public.work_order_assignments (
  id, tenant_id, work_order_id, personnel_id, status,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at
) values
  (
    'ab200000-0000-4000-8000-000000000044',
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000043',
    'ab200000-0000-4000-8000-000000000031',
    'seen', clock_timestamp(), clock_timestamp() + interval '2 hours',
    clock_timestamp(), clock_timestamp() + interval '2 hours'
  ),
  (
    'ab200000-0000-4000-8000-000000000049',
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000043',
    'ab200000-0000-4000-8000-000000000034',
    'seen', clock_timestamp(), clock_timestamp() + interval '2 hours',
    clock_timestamp(), clock_timestamp() + interval '2 hours'
  );
insert into public.dispatches (
  id, tenant_id, work_order_id, assignment_id, dispatched_by, idempotency_key
) values
  (
    'ab200000-0000-4000-8000-000000000045',
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000043',
    'ab200000-0000-4000-8000-000000000044',
    'ab200000-0000-4000-8000-000000000002',
    'FICTITIOUS-direct-rpc-dispatch'
  ),
  (
    'ab200000-0000-4000-8000-000000000050',
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000043',
    'ab200000-0000-4000-8000-000000000049',
    'ab200000-0000-4000-8000-000000000002',
    'FICTITIOUS-direct-rpc-management-dispatch'
  );
insert into public.work_order_tasks (
  id, tenant_id, work_order_id, task_code, task_name, duration_minutes,
  quantity, unit, unit_price_cents, vat_basis_points, assigned_personnel_id
) values
  (
    'ab200000-0000-4000-8000-000000000046',
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000043',
    'FICT-RPC-TASK', 'FICTITIOUS Direct RPC Task', 30,
    1, 'task', 0, 2100, null
  ),
  (
    'ab200000-0000-4000-8000-000000000048',
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000043',
    'FICT-RPC-OWNED', 'FICTITIOUS Manager-owned Direct RPC Task', 30,
    1, 'task', 0, 2100, 'ab200000-0000-4000-8000-000000000034'
  );
insert into public.open_shifts (
  id, tenant_id, work_order_id, function_id, starts_at, ends_at, created_by
) values (
  'ab200000-0000-4000-8000-000000000047',
  'ab200000-0000-4000-8000-000000000021',
  'ab200000-0000-4000-8000-000000000043',
  'ab200000-0000-4000-8000-000000000032',
  clock_timestamp() + interval '1 day', clock_timestamp() + interval '1 day 2 hours',
  'ab200000-0000-4000-8000-000000000002'
);
update public.work_orders
set status = 'correction_required', report_state = 'correction', published_at = clock_timestamp()
where id = 'ab200000-0000-4000-8000-000000000043';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ab200000-0000-4000-8000-000000000001","session_id":"ab200000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.set_shift_interest(
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000047', true
  )$$,
  'eligible active staff can respond to an open shift'
);
select is(
  (select status from public.shift_interests
   where open_shift_id = 'ab200000-0000-4000-8000-000000000047'),
  'interested',
  'the guarded open-shift command persists the response'
);
reset role;

update public.tenant_memberships
set status = 'revoked'
where tenant_id = 'ab200000-0000-4000-8000-000000000021'
  and user_id = 'ab200000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ab200000-0000-4000-8000-000000000001","session_id":"ab200000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.set_shift_interest(
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000047', false
  )$$,
  '42501', null,
  'a current JWT cannot respond after the staff role is revoked'
);
reset role;

update public.tenant_memberships
set status = 'active'
where tenant_id = 'ab200000-0000-4000-8000-000000000021'
  and user_id = 'ab200000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.role', 'service_role', true);
update public.tenant_settings
set enabled_services = array['personeel','rapportage']
where tenant_id = 'ab200000-0000-4000-8000-000000000021';
select set_config('request.jwt.claim.role', '', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ab200000-0000-4000-8000-000000000001","session_id":"ab200000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.set_shift_interest(
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000047', false
  )$$,
  '42501', null,
  'open-shift mutation fails closed when planning is disabled'
);
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
update public.tenant_settings
set enabled_services = array['personeel','planning','rapportage']
where tenant_id = 'ab200000-0000-4000-8000-000000000021';
select set_config('request.jwt.claim.role', '', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ab200000-0000-4000-8000-000000000001","session_id":"ab200000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.record_task_execution(
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000046',
    (select execution_version from public.work_order_tasks
     where id = 'ab200000-0000-4000-8000-000000000046'),
    'completed', 1, 'FICTITIOUS completed through guarded RPC'
  )$$,
  'assigned staff can record task execution with every required module active'
);
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
update public.tenant_settings
set enabled_services = array['personeel','planning']
where tenant_id = 'ab200000-0000-4000-8000-000000000021';
select set_config('request.jwt.claim.role', '', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ab200000-0000-4000-8000-000000000001","session_id":"ab200000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.record_task_execution(
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000046',
    (select execution_version from public.work_order_tasks
     where id = 'ab200000-0000-4000-8000-000000000046'),
    'completed', 1, 'FICTITIOUS bypass attempt'
  )$$,
  '42501', null,
  'task execution fails closed when rapportage is disabled'
);
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
update public.tenant_settings
set enabled_services = array['personeel','planning','rapportage']
where tenant_id = 'ab200000-0000-4000-8000-000000000021';
select set_config('request.jwt.claim.role', '', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ab200000-0000-4000-8000-000000000001","session_id":"ab200000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.record_task_execution(
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000048',
    (select execution_version from public.work_order_tasks
     where id = 'ab200000-0000-4000-8000-000000000048'),
    'completed', 1, 'FICTITIOUS cross-person task attempt'
  )$$,
  '42501', null,
  'assigned task guard rejects staff when the task belongs to another employee'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ab200000-0000-4000-8000-000000000002","session_id":"ab200000-0000-4000-8000-000000000012"}',
  true
);
select lives_ok(
  $$select public.record_task_execution(
    'ab200000-0000-4000-8000-000000000021',
    'ab200000-0000-4000-8000-000000000048',
    (select execution_version from public.work_order_tasks
     where id = 'ab200000-0000-4000-8000-000000000048'),
    'completed', 1, 'FICTITIOUS management correction'
  )$$,
  'management retains its intended task-execution access'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_work_order_task(uuid,boolean,text)',
    'execute'
  ),
  'the unversioned legacy task-completion RPC is no longer executable by authenticated users'
);
select throws_ok(
  $$select public.complete_work_order_task(
    'ab200000-0000-4000-8000-000000000046', true, 'FICTITIOUS bypass'
  )$$,
  '42501', null,
  'direct execution of the legacy task-completion RPC is denied'
);

select * from finish();
rollback;
