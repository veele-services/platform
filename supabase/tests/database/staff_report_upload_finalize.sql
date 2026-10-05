begin;

select plan(17);

insert into auth.users (id, email, email_confirmed_at) values
  ('fa000000-0000-4000-8000-000000000001', 'staff-report-finalize@fieldgrid.invalid', now()),
  ('fa000000-0000-4000-8000-000000000002', 'manager-report-finalize@fieldgrid.invalid', now());
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('fa000000-0000-4000-8000-000000000011', 'fa000000-0000-4000-8000-000000000001', now(), now()),
  ('fa000000-0000-4000-8000-000000000012', 'fa000000-0000-4000-8000-000000000002', now(), now());
insert into public.tenants (id, slug, name, timezone) values
  ('fa100000-0000-4000-8000-000000000001', 'staff-report-finalize', 'FICTITIOUS staff report finalize', 'Europe/Amsterdam');
insert into public.tenant_settings (tenant_id, enabled_services) values
  ('fa100000-0000-4000-8000-000000000001', array['personeel','planning','rapportage']);
insert into public.tenant_memberships (tenant_id, user_id, roles, status, activated_at) values
  ('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', array['staff']::public.app_role[], 'active', now()),
  ('fa100000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002', array['management']::public.app_role[], 'active', now());
insert into public.personnel (
  id, tenant_id, user_id, employee_number, full_name, status
) values (
  'fa200000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001',
  'FG-REPORT-FINALIZE', 'FICTITIOUS Report Employee', 'active'
);
insert into public.customers (
  id, tenant_id, customer_number, name
) values (
  'fa300000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  'FICT-CUSTOMER-REPORT', 'FICTITIOUS Report Customer'
);
insert into public.objects (
  id, tenant_id, customer_id, object_number, name, address
) values (
  'fa400000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  'fa300000-0000-4000-8000-000000000001',
  'FICT-OBJECT-REPORT', 'FICTITIOUS Report Object', '{}'::jsonb
);
insert into public.work_orders (
  id, tenant_id, work_order_number, customer_id, object_id, discipline,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at,
  created_by
) values (
  'fa500000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  'FICT-WO-REPORT',
  'fa300000-0000-4000-8000-000000000001',
  'fa400000-0000-4000-8000-000000000001',
  'Service', now(), now() + interval '1 hour', now(), now() + interval '1 hour',
  'fa000000-0000-4000-8000-000000000001'
);
update public.work_orders
set status = 'seen', report_state = 'draft', published_at = now()
where id = 'fa500000-0000-4000-8000-000000000001';
insert into public.work_order_assignments (
  id, tenant_id, work_order_id, personnel_id, status,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at
) values (
  'fa600000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000001',
  'fa200000-0000-4000-8000-000000000001',
  'seen', now(), now() + interval '1 hour', now(), now() + interval '1 hour'
);
insert into public.dispatches (
  tenant_id, work_order_id, assignment_id, dispatched_by, idempotency_key
) values (
  'fa100000-0000-4000-8000-000000000001',
  'fa500000-0000-4000-8000-000000000001',
  'fa600000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001',
  'FICTITIOUS-staff-report-finalize-dispatch'
);

-- Scanner policy fixture only. HTTP upload and antivirus behaviour have their
-- own integration tests; this row represents immutable, attested staged bytes.
insert into storage.objects (bucket_id, name, version, metadata) values (
  'reports',
  'fa100000-0000-4000-8000-000000000001/fa500000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa800000-0000-5000-8000-000000000001.pdf',
  'FICTITIOUS',
  '{"mimetype":"application/pdf","size":128}'::jsonb
);
insert into private.file_scan_receipts (
  object_id, object_version, sha256, size_bytes, mime_type,
  engine, database_version, database_at
)
select object.id, object.version, repeat('a', 64), 128, 'application/pdf',
       'FICTITIOUS POLICY FIXTURE', 'FICTITIOUS', now()
from storage.objects object
where object.bucket_id = 'reports'
  and object.name = 'fa100000-0000-4000-8000-000000000001/fa500000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa800000-0000-5000-8000-000000000001.pdf';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa000000-0000-4000-8000-000000000011"}',
  true
);

select ok(
  public.staff_report_upload_allowed(
    'fa100000-0000-4000-8000-000000000001',
    'fa500000-0000-4000-8000-000000000001',
    'fa700000-0000-4000-8000-000000000001',
    'fa100000-0000-4000-8000-000000000001/fa500000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa800000-0000-5000-8000-000000000001.pdf'
  ),
  'assigned staff can stage only the deterministic report-mutation path'
);
select is(
  public.staff_report_upload_allowed(
    'fa100000-0000-4000-8000-000000000001',
    'fa500000-0000-4000-8000-000000000001',
    'fa700000-0000-4000-8000-000000000001',
    'fa100000-0000-4000-8000-000000000001/fa500000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000002/fa800000-0000-5000-8000-000000000001.pdf'
  ),
  false,
  'staging authorization rejects a path owned by another mutation'
);
select throws_ok(
  $$insert into public.report_entries (
      id, tenant_id, work_order_id, author_user_id, body, customer_visible
    ) values (
      'fa700000-0000-4000-8000-000000000099',
      'fa100000-0000-4000-8000-000000000001',
      'fa500000-0000-4000-8000-000000000001',
      'fa000000-0000-4000-8000-000000000001',
      'FICTITIOUS direct write bypass', false
    )$$,
  '42501', null,
  'staff cannot bypass finalize with a direct report-entry insert'
);
select ok(
  jsonb_array_length(public.staff_workspace('fa100000-0000-4000-8000-000000000001')->'reports') = 0
  and jsonb_array_length(public.staff_workspace('fa100000-0000-4000-8000-000000000001')->'attachments') = 0,
  'staged bytes are invisible until database finalize commits'
);

select lives_ok(
  $$select public.staff_finalize_report_entry(
    'fa100000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'reportEntryId','fa700000-0000-4000-8000-000000000001',
      'workOrderId','fa500000-0000-4000-8000-000000000001',
      'body','FICTITIOUS finalized report note',
      'customerVisible',true,
      'incidentSeverity','low',
      'attachments',jsonb_build_array(jsonb_build_object(
        'id','fa800000-0000-5000-8000-000000000001',
        'storagePath','fa100000-0000-4000-8000-000000000001/fa500000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa800000-0000-5000-8000-000000000001.pdf',
        'fileName','fictitious-proof.pdf',
        'mimeType','application/pdf',
        'sizeBytes',128,
        'sha256',repeat('a',64)
      ))
    ),
    'fa700000-0000-4000-8000-000000000001'
  )$$,
  'finalize creates the report entry and all attachment metadata atomically'
);
select ok(
  exists (
    select 1 from public.report_entries entry
    where entry.id = 'fa700000-0000-4000-8000-000000000001'
      and entry.author_user_id = 'fa000000-0000-4000-8000-000000000001'
      and entry.is_incident and entry.incident_severity = 'low'
      and entry.customer_visible
  ) and exists (
    select 1 from public.attachments attachment
    where attachment.id = 'fa800000-0000-5000-8000-000000000001'
      and attachment.report_entry_id = 'fa700000-0000-4000-8000-000000000001'
      and attachment.sha256 = repeat('a',64)
      and attachment.customer_visible
  ),
  'the committed report parent and attachment metadata match the finalized payload'
);
with changed as (
  update public.report_entries
  set body = 'FICTITIOUS direct update bypass'
  where id = 'fa700000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'staff cannot bypass the versioned command with a direct report-entry update'
);
with changed as (
  update public.attachments
  set customer_visible = false
  where id = 'fa800000-0000-5000-8000-000000000001'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'staff cannot mutate attachment metadata outside the report-entry command'
);
select throws_ok(
  $$insert into public.attachments (
      id, tenant_id, work_order_id, report_entry_id, uploaded_by,
      storage_bucket, storage_path, file_name, mime_type, size_bytes,
      sha256, customer_visible
    ) values (
      'fa800000-0000-5000-8000-000000000099',
      'fa100000-0000-4000-8000-000000000001',
      'fa500000-0000-4000-8000-000000000001',
      'fa700000-0000-4000-8000-000000000001',
      'fa000000-0000-4000-8000-000000000001',
      'reports',
      'fa100000-0000-4000-8000-000000000001/fa500000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa800000-0000-5000-8000-000000000099.pdf',
      'direct-bypass.pdf', 'application/pdf', 128, repeat('a',64), false
    )$$,
  '42501', null,
  'staff cannot bypass finalize with a direct attachment-metadata insert'
);
select ok(
  jsonb_array_length(public.staff_workspace('fa100000-0000-4000-8000-000000000001')->'reports') = 1
  and jsonb_array_length(public.staff_workspace('fa100000-0000-4000-8000-000000000001')->'attachments') = 1
  and not (public.staff_workspace('fa100000-0000-4000-8000-000000000001')->'attachments'->0 ? 'storage_path'),
  'staff projection exposes only finalized bounded metadata without a storage path'
);
select lives_ok(
  $$select public.staff_finalize_report_entry(
    'fa100000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'reportEntryId','fa700000-0000-4000-8000-000000000001',
      'workOrderId','fa500000-0000-4000-8000-000000000001',
      'body','FICTITIOUS finalized report note',
      'customerVisible',true,
      'incidentSeverity','low',
      'attachments',jsonb_build_array(jsonb_build_object(
        'id','fa800000-0000-5000-8000-000000000001',
        'storagePath','fa100000-0000-4000-8000-000000000001/fa500000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000001/fa800000-0000-5000-8000-000000000001.pdf',
        'fileName','fictitious-proof.pdf',
        'mimeType','application/pdf',
        'sizeBytes',128,
        'sha256',repeat('a',64)
      ))
    ),
    'fa700000-0000-4000-8000-000000000001'
  )$$,
  'an identical retry returns the stored finalize receipt'
);
select ok(
  (select count(*) = 1 from public.report_entries where id = 'fa700000-0000-4000-8000-000000000001')
  and (select count(*) = 1 from public.attachments where report_entry_id = 'fa700000-0000-4000-8000-000000000001'),
  'an identical retry cannot duplicate parent or attachment rows'
);
select throws_ok(
  $$select public.staff_finalize_report_entry(
    'fa100000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'reportEntryId','fa700000-0000-4000-8000-000000000001',
      'workOrderId','fa500000-0000-4000-8000-000000000001',
      'body','FICTITIOUS changed payload',
      'customerVisible',true,
      'incidentSeverity','low',
      'attachments','[]'::jsonb
    ),
    'fa700000-0000-4000-8000-000000000001'
  )$$,
  '23514', null,
  'a mutation UUID cannot be reused with changed content'
);
select throws_ok(
  $$select public.staff_finalize_report_entry(
    'fa100000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'reportEntryId','fa700000-0000-4000-8000-000000000002',
      'workOrderId','fa500000-0000-4000-8000-000000000001',
      'body','FICTITIOUS missing staged bytes',
      'customerVisible',false,
      'incidentSeverity',null,
      'attachments',jsonb_build_array(jsonb_build_object(
        'id','fa800000-0000-5000-8000-000000000002',
        'storagePath','fa100000-0000-4000-8000-000000000001/fa500000-0000-4000-8000-000000000001/fa700000-0000-4000-8000-000000000002/fa800000-0000-5000-8000-000000000002.pdf',
        'fileName','missing.pdf','mimeType','application/pdf','sizeBytes',128,
        'sha256',repeat('b',64)
      ))
    ),
    'fa700000-0000-4000-8000-000000000002'
  )$$,
  '23514', null,
  'finalize rejects metadata without matching scanner-attested bytes'
);
reset role;
select ok(
  not exists (
    select 1 from public.report_entries where id = 'fa700000-0000-4000-8000-000000000002'
  ) and not exists (
    select 1 from public.attachments where id = 'fa800000-0000-5000-8000-000000000002'
  ),
  'a failed finalize leaves no partially visible database rows'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000002","session_id":"fa000000-0000-4000-8000-000000000012"}',
  true
);
select lives_ok(
  $$insert into public.report_entries (
      id, tenant_id, work_order_id, author_user_id, body, customer_visible
    ) values (
      'fa700000-0000-4000-8000-000000000098',
      'fa100000-0000-4000-8000-000000000001',
      'fa500000-0000-4000-8000-000000000001',
      'fa000000-0000-4000-8000-000000000002',
      'FICTITIOUS management report note', false
    )$$,
  'management retains direct report writes in an active object session'
);
reset role;
select ok(
  has_function_privilege('authenticated', 'public.staff_finalize_report_entry(uuid,jsonb,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.staff_finalize_report_entry(uuid,jsonb,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.staff_report_upload_allowed(uuid,uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.staff_report_upload_allowed(uuid,uuid,uuid,text)', 'execute'),
  'staging and finalize RPCs are exposed only to authenticated callers'
);

select * from finish();
rollback;
