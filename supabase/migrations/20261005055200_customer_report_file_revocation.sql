-- Only the customer branch of this existing proxy guard changes. Its actual
-- lifecycle test proves revoked identities could retain an approved copy.
-- Management/staff access, immutable evidence and asset allowlists are intact.
create or replace function public.work_order_report_file(target_report_id uuid,asset_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.work_order_report_versions;w public.work_orders;signed_record public.signatures;a public.attachments;allowed boolean;backoffice boolean;staff boolean;
begin
 select * into r from public.work_order_report_versions where id=target_report_id;
 select * into w from public.work_orders where tenant_id=r.tenant_id and id=r.work_order_id;
 backoffice:=private.report_backoffice(w.tenant_id);staff:=private.is_work_order_assignee(w.tenant_id,w.id);
 allowed:=backoffice or staff or(r.state='approved'
  and exists(select 1 from public.object_customer_bindings b where b.tenant_id=w.tenant_id and b.object_id=w.object_id and b.user_id=auth.uid() and b.active)
  and exists(select 1 from public.customer_portal_accounts ca where ca.tenant_id=w.tenant_id and ca.customer_id=w.customer_id
   and ca.user_id=auth.uid() and private.customer_account_access(w.tenant_id,ca.id)));
 if r.id is null or not private.object_session_active() or not allowed or not private.service_enabled(w.tenant_id,'rapportage') or not exists(select 1 from public.tenants t where t.id=w.tenant_id and t.status='active') then raise exception 'Rapportbestand niet beschikbaar' using errcode='42501';end if;
 if asset_id is not null then
  select * into signed_record from public.signatures where tenant_id=r.tenant_id and report_id=r.id and id=asset_id and revoked_at is null;
  if found then
   if signed_record.signature_kind<>'customer' and not(backoffice or(staff and signed_record.captured_by=auth.uid())) then raise exception 'Ondertekening niet beschikbaar' using errcode='42501';end if;
   return jsonb_build_object('bucket','signatures','path',signed_record.storage_path,'name','handtekening.png','mime','image/png','sha256',signed_record.sha256,'scope',jsonb_build_array(r.tenant_id,w.id));
  end if;
  select * into a from public.attachments where tenant_id=r.tenant_id and work_order_id=w.id and id=asset_id;
  if a.id is null or not exists(select 1 from jsonb_array_elements(private.report_snapshot_for_actor(r)->'attachments') x where x->>'id'=a.id::text and x->>'sha256'=a.sha256) then raise exception 'Bijlage niet beschikbaar in deze rapportweergave' using errcode='42501';end if;
  return jsonb_build_object('bucket',a.storage_bucket,'path',a.storage_path,'name',a.file_name,'mime',a.mime_type,'sha256',a.sha256,
   'scope',case when array_length(string_to_array(a.storage_path,'/'),1)=3 then jsonb_build_array(r.tenant_id,w.id)
     when a.storage_path like r.tenant_id::text||'/'||w.id::text||'/communication/%' then jsonb_build_array(r.tenant_id,w.id,'communication')
     else jsonb_build_array(r.tenant_id,w.id,a.report_entry_id) end);
 end if;
 return private.report_delivery(r);
end $$;
