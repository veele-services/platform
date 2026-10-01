begin;
-- Classification is not determined by the age of a row. Legacy records keep
-- their original bytes/history, but raw HR evidence is not selfservice data.
alter policy personnel_notes_read on public.personnel_notes using (private.dossier_access(tenant_id));
alter policy personnel_contracts_read on public.personnel_contracts using (private.dossier_access(tenant_id));
alter policy certificates_read on public.certificates using (private.dossier_access(tenant_id));
alter policy personnel_documents_read on public.personnel_documents using (private.dossier_access(tenant_id));
revoke select(emergency_contact) on public.personnel from authenticated;

-- Own explicitly shared bytes remain available independently of the internal
-- document JSON, creator, revision and HR links. No new role is introduced.
create or replace function private.can_read_personnel_document(target_tenant uuid,target_document uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and private.service_enabled(target_tenant,'personeel')
 and exists(select 1 from public.personnel_documents d where d.tenant_id=target_tenant and d.id=target_document
   and (private.dossier_access(target_tenant) or
     (private.has_role(target_tenant,array['staff']::public.app_role[])
       and d.personnel_id=private.current_personnel_id(target_tenant)
       and d.visible_to_employee and not d.dossier_managed)));
$$;
revoke all on function private.can_read_personnel_document(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_personnel_document(uuid,uuid) to authenticated,service_role;

create or replace function public.personnel_document_file(target_tenant uuid,target_document uuid)
returns table(id uuid,tenant_id uuid,personnel_id uuid,storage_path text,file_name text,mime_type text,sha256 text)
language sql stable security definer set search_path='' as $$
 select d.id,d.tenant_id,d.personnel_id,d.storage_path,d.file_name,d.mime_type,d.sha256
 from public.personnel_documents d where d.tenant_id=target_tenant and d.id=target_document
 and private.can_read_personnel_document(target_tenant,target_document);
$$;
revoke all on function public.personnel_document_file(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.personnel_document_file(uuid,uuid) to authenticated;

alter policy dossier_document_read on public.dossier_documents using (
 private.object_session_active() and case source_kind
 when 'customer' then exists(select 1 from public.customer_documents d where d.tenant_id=dossier_documents.tenant_id and d.id=dossier_documents.source_id)
 when 'object' then exists(select 1 from public.object_documents d where d.tenant_id=dossier_documents.tenant_id and d.id=dossier_documents.source_id)
 when 'personnel' then private.can_read_personnel_document(tenant_id,source_id)
 else false end);

do $$
declare original text;revised text;
begin
 original:=pg_get_functiondef('public.staff_workspace(uuid)'::regprocedure);
 revised:=replace(original,
  'jsonb_agg(to_jsonb(a)-''storage_path'') from public.personnel_documents a where a.tenant_id=target_tenant and a.personnel_id=pid and a.visible_to_employee',
  'jsonb_agg(jsonb_build_object(''id'',a.id,''tenant_id'',a.tenant_id,''personnel_id'',a.personnel_id,''title'',a.title,''file_name'',a.file_name,''version'',a.version,''visible_to_employee'',a.visible_to_employee)) from public.personnel_documents a where a.tenant_id=target_tenant and a.personnel_id=pid and a.visible_to_employee and not a.dossier_managed');
 if revised=original and position('''title'',a.title,''file_name'',a.file_name,''version'',a.version,''visible_to_employee'',a.visible_to_employee' in original)=0 then raise exception 'Review staff document projection';end if;
 execute revised;
 original:=pg_get_functiondef('private.can_access_storage_object(text,text,boolean)'::regprocedure);
 revised:=replace(original,'and d.storage_path=object_name and d.visible_to_employee','and d.storage_path=object_name and d.visible_to_employee and not d.dossier_managed');
 if revised=original and position('d.visible_to_employee and not d.dossier_managed' in original)=0 then raise exception 'Review personnel Storage visibility';end if;
 execute revised;
end;
$$;
notify pgrst,'reload schema';
commit;
