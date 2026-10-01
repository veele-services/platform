-- Query-first: receipts certify immutable bytes, never user-supplied metadata.
-- Existing files remain intact and are scanned on their first authorized read.
begin;
create table if not exists private.file_scan_receipts (
 object_id uuid primary key references storage.objects(id) on delete cascade,
 object_version text not null,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg','image/webp')),
 engine text not null, database_version text not null, database_at timestamptz not null,
 scanned_at timestamptz not null default clock_timestamp()
);
alter table private.file_scan_receipts enable row level security;
alter table private.file_scan_receipts force row level security;
revoke all on private.file_scan_receipts from public,anon,authenticated;

create or replace function private.file_is_scanned(object_id uuid, object_version text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.file_scan_receipts r where r.object_id=$1 and r.object_version=$2)
$$;
revoke all on function private.file_is_scanned(uuid,text) from public,anon;
grant execute on function private.file_is_scanned(uuid,text) to authenticated;

-- Additional restrictive policies leave all tenant/parent/owner policies in
-- force. Denying only uploads in the UI is insufficient (Storage is an API).
drop policy if exists scanned_files_read on storage.objects;
create policy scanned_files_read on storage.objects as restrictive for select to authenticated,anon
 using(bucket_id not in ('branding','reports','signatures','invoices','personnel-documents','customer-documents','object-documents','commercial-documents')
 or private.file_is_scanned(id,version));
drop policy if exists scanned_files_insert on storage.objects;
create policy scanned_files_insert on storage.objects as restrictive for insert to authenticated,anon
 with check(bucket_id not in ('branding','reports','signatures','invoices','personnel-documents','customer-documents','object-documents','commercial-documents'));
drop policy if exists scanned_files_update on storage.objects;
create policy scanned_files_update on storage.objects as restrictive for update to authenticated,anon
 using(bucket_id not in ('branding','reports','signatures','invoices','personnel-documents','customer-documents','object-documents','commercial-documents'))
 with check(bucket_id not in ('branding','reports','signatures','invoices','personnel-documents','customer-documents','object-documents','commercial-documents'));
drop policy if exists scanned_files_delete on storage.objects;
create policy scanned_files_delete on storage.objects as restrictive for delete to authenticated,anon
 using(bucket_id not in ('branding','reports','signatures','invoices','personnel-documents','customer-documents','object-documents','commercial-documents'));

-- Service-only inspection/attestation. Neither endpoint exposes a download or
-- accepts a caller's assertion that a file is clean. Only the scanner calls it.
create or replace function public.file_scan_state(target_bucket text,target_path text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'version',o.version,'size',(o.metadata->>'size')::bigint,
 'mime',o.metadata->>'mimetype','sha256',r.sha256,'scannedAt',r.scanned_at)
 from storage.objects o left join private.file_scan_receipts r on r.object_id=o.id and r.object_version=o.version
 where o.bucket_id=target_bucket and o.name=target_path and coalesce(o.is_delete_marker,false)=false
$$;
create or replace function public.file_scan_attest(target_bucket text,target_path text,expected_id uuid,expected_version text,proof jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare o storage.objects;
begin
 select * into o from storage.objects where bucket_id=target_bucket and name=target_path for update;
 if o.id is distinct from expected_id or o.version is distinct from expected_version or expected_version is null
 or o.is_delete_marker is true or (o.metadata->>'size')::bigint is distinct from (proof->>'size')::bigint
 or o.metadata->>'mimetype' is distinct from proof->>'mime'
 or proof->>'engine' !~ '^ClamAV [0-9.]+'
 or (proof->>'databaseAt')::timestamptz < clock_timestamp()-interval '7 days'
 or (proof->>'databaseAt')::timestamptz > clock_timestamp()+interval '5 minutes'
 then raise exception 'Bestand gewijzigd of scanbewijs ongeldig' using errcode='23514';end if;
 insert into private.file_scan_receipts(object_id,object_version,sha256,size_bytes,mime_type,engine,database_version,database_at)
 values(o.id,o.version,proof->>'sha256',(proof->>'size')::bigint,proof->>'mime',proof->>'engine',proof->>'databaseVersion',(proof->>'databaseAt')::timestamptz)
 on conflict(object_id) do update set object_version=excluded.object_version,sha256=excluded.sha256,size_bytes=excluded.size_bytes,
 mime_type=excluded.mime_type,engine=excluded.engine,database_version=excluded.database_version,database_at=excluded.database_at,scanned_at=clock_timestamp();
end $$;
revoke all on function public.file_scan_state(text,text),public.file_scan_attest(text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.file_scan_state(text,text),public.file_scan_attest(text,text,uuid,text,jsonb) to service_role;

-- Repeated before and after scanning, using the caller's live database session.
-- Receipts are not authorization: every originating action still registers its
-- own metadata through the existing RLS/RPC and exact parent checks.
create or replace function public.file_upload_allowed(target_bucket text,target_path text,visit_request uuid default null)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(target_path,'/');t uuid;parent uuid;allowed boolean:=false;
begin
 if not private.actor_session_active() or array_length(parts,1)<2 or target_path ~ '[%?#[:cntrl:]]'
 or position(chr(92) in target_path)>0 or exists(select 1 from unnest(parts) p where p in ('','.','..')) then return false;end if;
 t:=private.storage_tenant_id(target_path);
 if t is null or not exists(select 1 from public.tenants where id=t and status='active') then return false;end if;
 if target_bucket='branding' then
   return array_length(parts,1)=2 and (private.is_platform_admin() or private.has_role(t,array['tenant_admin','management']::public.app_role[]));
 end if;
 if target_bucket='commercial-documents' then
   if array_length(parts,1)<>4 or not private.commercial_member(t) then return false;end if;
   begin parent:=parts[3]::uuid;exception when invalid_text_representation then return false;end;
   return (parts[2]='request' and exists(select 1 from public.requests r where r.tenant_id=t and r.id=parent))
      or (parts[2]='quote' and exists(select 1 from public.quotes q where q.tenant_id=t and q.id=parent));
 end if;
 parent:=private.storage_subject_id(target_path);if parent is null then return false;end if;
 if target_bucket='object-documents' then
   if array_length(parts,1)<>3 or not exists(select 1 from public.objects o where o.tenant_id=t and o.id=parent) then return false;end if;
   if visit_request is not null then
     return exists(select 1 from public.object_visit_requests r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id
       where r.id=visit_request and r.tenant_id=t and r.object_id=parent
       and private.object_visit_access(t,parent,w.id) and w.status in ('planned','released','seen','travelling','in_progress'));
   end if;
   return private.object_manage(t);
 elsif target_bucket='customer-documents' then return private.can_manage_customer_document(target_path);
 elsif target_bucket='personnel-documents' then
   return array_length(parts,1)=3 and private.service_enabled(t,'personeel')
     and private.can_access_storage_object(target_bucket,target_path,true)
     and exists(select 1 from public.personnel p where p.tenant_id=t and p.id=parent);
 elsif target_bucket='invoices' then
   return array_length(parts,1)=3 and private.service_enabled(t,'finance')
     and private.can_access_storage_object(target_bucket,target_path,true)
     and exists(select 1 from public.invoices i where i.tenant_id=t and i.id=parent);
 elsif target_bucket='signatures' then
   return array_length(parts,1)=3 and exists(select 1 from private.work_order_signature_intents i
     where i.tenant_id=t and i.work_order_id=parent and i.storage_path=target_path and i.actor_id=auth.uid()
     and i.session_id=nullif(auth.jwt()->>'session_id','')::uuid and i.consumed_at is null
     and private.work_order_execution_actor(t,parent,auth.uid(),i.session_id));
 elsif target_bucket='reports' then
   return array_length(parts,1)=4 and private.service_enabled(t,'rapportage')
     and private.can_access_storage_object(target_bucket,target_path,true)
     and exists(select 1 from public.work_orders w where w.tenant_id=t and w.id=parent);
 end if;
 return allowed;
end $$;
revoke all on function public.file_upload_allowed(text,text,uuid) from public,anon;
grant execute on function public.file_upload_allowed(text,text,uuid) to authenticated;
commit;
