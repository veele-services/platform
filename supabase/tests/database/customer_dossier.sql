begin;
select no_plan();

-- Confirmed actors keep permission denials independent of Auth activation.
insert into auth.users (id, email, email_confirmed_at) values
  ('d1000000-0000-4000-8000-000000000001', 'dossier-admin-a@fieldgrid.test', now()),
  ('d1000000-0000-4000-8000-000000000002', 'dossier-staff-a@fieldgrid.test', now()),
  ('d1000000-0000-4000-8000-000000000003', 'dossier-admin-b@fieldgrid.test', now());
-- Real sessions: authenticated RLS must reject stale or missing sessions.
insert into auth.sessions(id,user_id) select id,id from auth.users where id in ('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000003');

insert into public.tenants (id, slug, name) values
  ('da000000-0000-4000-8000-000000000001', 'dossier-a', 'Dossier A'),
  ('db000000-0000-4000-8000-000000000001', 'dossier-b', 'Dossier B');
insert into public.tenant_settings (tenant_id) values
  ('da000000-0000-4000-8000-000000000001'), ('db000000-0000-4000-8000-000000000001');
insert into public.tenant_memberships (tenant_id, user_id, roles, status) values
  ('da000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', array['tenant_admin']::public.app_role[], 'active'),
  ('da000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', array['staff']::public.app_role[], 'active'),
  ('db000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', array['tenant_admin']::public.app_role[], 'active');
insert into public.customers (id, tenant_id, customer_number, name) values
  ('da200000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'DOS-A', 'Klant A'),
  ('db200000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'DOS-B', 'Klant B');

select is((select public from storage.buckets where id = 'customer-documents'), false, 'documents bucket is private');
select is((select file_size_limit from storage.buckets where id = 'customer-documents'), 10485760::bigint, 'bucket enforces 10 MB');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","session_id":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$insert into public.customer_notes (tenant_id, customer_id, body, created_by) values ('da000000-0000-4000-8000-000000000001', 'da200000-0000-4000-8000-000000000001', 'Afspraken', 'd1000000-0000-4000-8000-000000000001')$$, 'admin can add a note');
select is((select count(*)::int from public.customer_notes), 1, 'admin reads own note');
select throws_ok($$insert into public.customer_notes (tenant_id, customer_id, body, created_by) values ('da000000-0000-4000-8000-000000000001', 'db200000-0000-4000-8000-000000000001', 'Verboden koppeling', 'd1000000-0000-4000-8000-000000000001')$$, '23503', null, 'composite FK rejects a customer from another tenant');
select throws_ok($$insert into public.customer_notes (tenant_id, customer_id, body, created_by) values ('db000000-0000-4000-8000-000000000001', 'db200000-0000-4000-8000-000000000001', 'Verboden tenant', 'd1000000-0000-4000-8000-000000000001')$$, '42501', null, 'RLS rejects another tenant');
select throws_ok($$insert into public.customer_notes (tenant_id, customer_id, body, created_by) values ('da000000-0000-4000-8000-000000000001', 'da200000-0000-4000-8000-000000000001', 'Verkeerde auteur', 'd1000000-0000-4000-8000-000000000002')$$, '42501', null, 'cannot spoof note author');
select throws_ok($$insert into public.customer_notes (tenant_id, customer_id, body, created_by) values ('da000000-0000-4000-8000-000000000001', 'da200000-0000-4000-8000-000000000001', ' ', 'd1000000-0000-4000-8000-000000000001')$$, '23514', null, 'empty note rejected');

select throws_ok($$insert into storage.objects (bucket_id, name) values ('customer-documents', 'da000000-0000-4000-8000-000000000001/da200000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf')$$,'42501',null,'admin cannot bypass server scanning');
-- Synthetic policy fixture only. Real scanner and blob publication are tested
-- by test-release-storage-http; this transaction contains no actual file bytes.
reset role;
insert into storage.objects(bucket_id,name,version) values('customer-documents','da000000-0000-4000-8000-000000000001/da200000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf','FICTITIOUS');
insert into private.file_scan_receipts(object_id,object_version,sha256,size_bytes,mime_type,engine,database_version,database_at)
select id,version,repeat('a',64),1234,'application/pdf','FICTITIOUS POLICY FIXTURE','FICTITIOUS',now() from storage.objects where bucket_id='customer-documents' and name='da000000-0000-4000-8000-000000000001/da200000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf';
set local role authenticated;
select lives_ok($$insert into public.customer_documents (tenant_id, customer_id, title, storage_path, file_name, mime_type, size_bytes, sha256, created_by) values ('da000000-0000-4000-8000-000000000001', 'da200000-0000-4000-8000-000000000001', 'Contract', 'da000000-0000-4000-8000-000000000001/da200000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf', 'contract.pdf', 'application/pdf', 1234, repeat('a',64), 'd1000000-0000-4000-8000-000000000001')$$, 'admin registers customer document');
select is((select count(*)::int from public.customer_documents), 1, 'admin reads document metadata');
select is((select count(*)::int from storage.objects where bucket_id = 'customer-documents'), 1, 'admin reads private file');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('customer-documents', 'da000000-0000-4000-8000-000000000001/db200000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf')$$, '42501', null, 'storage rejects mismatched customer and tenant');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('customer-documents', 'db000000-0000-4000-8000-000000000001/db200000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf')$$, '42501', null, 'storage rejects another tenant');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('customer-documents', 'da000000-0000-4000-8000-000000000001/da200000-0000-4000-8000-000000000001/invalid.html')$$, '42501', null, 'storage rejects invalid file path');
select throws_ok($$insert into public.customer_documents (tenant_id, customer_id, title, storage_path, file_name, mime_type, size_bytes, sha256, created_by) values ('da000000-0000-4000-8000-000000000001', 'da200000-0000-4000-8000-000000000001', 'Contract', 'db000000-0000-4000-8000-000000000001/db200000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf', 'contract.pdf', 'application/pdf', 1234, repeat('a',64), 'd1000000-0000-4000-8000-000000000001')$$, '23514', null, 'metadata cannot point to another customer path');
select throws_ok($$update public.customer_documents set title = 'Overwrite'$$, '42501', null, 'documents are immutable');

select set_config('storage.allow_delete_query', 'true', true);
with removed as (delete from storage.objects where bucket_id = 'customer-documents' returning id)
select is((select count(*)::int from removed), 0, 'linked files cannot be deleted');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('customer-documents', 'da000000-0000-4000-8000-000000000001/da200000-0000-4000-8000-000000000001/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf')$$,'42501',null,'unregistered upload cannot bypass scanner');
with removed as (delete from storage.objects where bucket_id = 'customer-documents' returning id)
select is((select count(*)::int from removed), 0, 'cleanup is a server-only operation');
select is((select count(*)::int from storage.objects where bucket_id = 'customer-documents'), 1, 'cleanup preserves linked file');

select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000002","session_id":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.customer_notes), 0, 'staff cannot read internal notes');
select is((select count(*)::int from public.customer_documents), 0, 'staff cannot read document metadata');
select is((select count(*)::int from storage.objects where bucket_id = 'customer-documents'), 0, 'staff cannot read private files');
select throws_ok($$insert into public.customer_notes (tenant_id, customer_id, body, created_by) values ('da000000-0000-4000-8000-000000000001', 'da200000-0000-4000-8000-000000000001', 'Staff note', 'd1000000-0000-4000-8000-000000000002')$$, '42501', null, 'staff cannot write notes');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('customer-documents', 'da000000-0000-4000-8000-000000000001/da200000-0000-4000-8000-000000000001/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf')$$, '42501', null, 'staff cannot upload customer files');

select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000003","session_id":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.customer_notes), 0, 'other tenant cannot read notes');
select is((select count(*)::int from public.customer_documents), 0, 'other tenant cannot read document metadata');
select is((select count(*)::int from storage.objects where bucket_id = 'customer-documents'), 0, 'other tenant cannot read private files');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.tenant_settings set enabled_services = array['personeel'] where tenant_id = 'da000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","session_id":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.customer_notes), 0, 'disabled planning hides notes');
select is((select count(*)::int from public.customer_documents), 0, 'disabled planning hides documents');
select is((select count(*)::int from storage.objects where bucket_id = 'customer-documents'), 0, 'disabled planning hides stored files');
select throws_ok($$insert into public.customer_notes (tenant_id, customer_id, body, created_by) values ('da000000-0000-4000-8000-000000000001', 'da200000-0000-4000-8000-000000000001', 'Disabled', 'd1000000-0000-4000-8000-000000000001')$$, '42501', null, 'disabled planning blocks writes');

reset role;
select * from finish();
rollback;
