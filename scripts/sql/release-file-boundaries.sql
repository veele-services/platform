-- Query-first release fix. No historical document or file is deleted/rewritten.
create or replace function private.document_path_matches(path text, scope text[])
returns boolean language sql immutable set search_path='' as $$
 select coalesce(array_length(scope,1)>0
   and array_length(string_to_array(path,'/'),1)=array_length(scope,1)+1
   and (string_to_array(path,'/'))[1:array_length(scope,1)]=scope
   and split_part(path,'/',array_length(scope,1)+1) not in ('','.','..')
   and position(chr(92) in path)=0 and path !~ '[%?#[:cntrl:]]',false)
$$;
revoke all on function private.document_path_matches(text,text[]) from public,anon;
grant execute on function private.document_path_matches(text,text[]) to authenticated,service_role;

-- NOT VALID preserves historical metadata. New writes are checked, and every
-- privileged download independently checks its exact authorized namespace.
alter table public.personnel_documents drop constraint if exists personnel_document_scope;
alter table public.personnel_documents add constraint personnel_document_scope
 check(private.document_path_matches(storage_path,array[tenant_id::text,personnel_id::text])) not valid;
alter table public.invoices drop constraint if exists invoice_pdf_scope;
alter table public.invoices add constraint invoice_pdf_scope
 check(pdf_storage_path is null or private.document_path_matches(pdf_storage_path,array[tenant_id::text,id::text])) not valid;

-- The operation is supplied by Storage, not a client-controlled JWT claim.
-- SELECT also serves copy/move/upsert/delete: don't inadvertently disable them.
-- Public-facing branding deliberately keeps its existing short signed URLs.
drop policy if exists private_files_no_capability_issuance on storage.objects;
create policy private_files_no_capability_issuance on storage.objects
 as restrictive for all to authenticated
 using(bucket_id not in ('reports','signatures','invoices','personnel-documents','customer-documents','object-documents','commercial-documents','ticket-files')
   or not storage.allow_any_operation(array['storage.object.sign','storage.object.sign_many','storage.object.sign_upload_url','storage.render.image_sign']))
 with check(bucket_id not in ('reports','signatures','invoices','personnel-documents','customer-documents','object-documents','commercial-documents','ticket-files')
   or not storage.allow_any_operation(array['storage.object.sign','storage.object.sign_many','storage.object.sign_upload_url','storage.render.image_sign']));

-- Return the parent identity from the authorized source, not from the path.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.customer_file_access(uuid,uuid,text)'::regprocedure);
 if position('''scope''' in definition)=0 then
  definition:=replace(definition,'''mime'',d.mime_type)', '''mime'',d.mime_type,''scope'',jsonb_build_array(d.tenant_id,d.customer_id),''sha256'',d.sha256)');
  definition:=replace(definition,'''mime'',''application/pdf'')', '''mime'',''application/pdf'',''scope'',jsonb_build_array(i.tenant_id,i.id),''sha256'',i.pdf_sha256)');
  if position('''scope''' in definition)=0 then raise exception 'customer_file_access contract changed';end if;
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.get_object_document(uuid,uuid,uuid)'::regprocedure);
 if position('''scope''' in definition)=0 then
  definition:=replace(definition,'''title'',d.title)', '''title'',d.title,''scope'',jsonb_build_array(d.tenant_id,d.object_id))');
  if position('''scope''' in definition)=0 then raise exception 'get_object_document contract changed';end if;
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.commercial_customer_file(uuid,uuid,text)'::regprocedure);
 if position('''scope''' in definition)=0 then
  definition:=replace(definition,'else d.mime_type end);','else d.mime_type end,''scope'',jsonb_build_array(q.tenant_id,''quote'',q.id),''sha256'',case when asset='''' then d.sha256 else null end);');
  if position('''scope''' in definition)=0 then raise exception 'commercial_customer_file contract changed';end if;
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.work_order_report_file(uuid,uuid)'::regprocedure);
 if position('''scope''' in definition)=0 then
  definition:=replace(definition,'''sha256'',signed_record.sha256)', '''sha256'',signed_record.sha256,''scope'',jsonb_build_array(r.tenant_id,w.id))');
  definition:=replace(definition,'''sha256'',a.sha256)', '''sha256'',a.sha256,''scope'',case when a.storage_path like r.tenant_id::text||''/''||w.id::text||''/communication/%'' then jsonb_build_array(r.tenant_id,w.id,''communication'') else jsonb_build_array(r.tenant_id,w.id,a.report_entry_id) end)');
  if position('''scope''' in definition)=0 then raise exception 'work_order_report_file contract changed';end if;
  execute definition;
 end if;
end $$;
