-- A hybrid customer/employee session must still receive only the customer copy.
-- The ordinary work_order_report_file role precedence remains intact elsewhere.
create function public.customer_portal_report_file(target_tenant uuid,target_account uuid,target_report uuid,asset_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.work_order_report_versions;w public.work_orders;s public.signatures;a public.attachments;safe_snapshot jsonb;
begin
 if not public.customer_portal_file_authorize(target_tenant,target_account,'report',target_report) then raise exception 'Klantrapport niet beschikbaar' using errcode='42501';end if;
 select * into r from public.work_order_report_versions where tenant_id=target_tenant and id=target_report;
 select * into w from public.work_orders where tenant_id=target_tenant and id=r.work_order_id;
 select jsonb_object_agg(key,value) into safe_snapshot from jsonb_each(r.snapshot) where key=any(array['schema','number','title','summary','tenant','customer','object','executionDate','endedAt','timezone','tasks','notes','checklists','materials','expenses','attachments']);
 safe_snapshot:=safe_snapshot||jsonb_build_object('notes',coalesce(safe_snapshot->'notes','[]'),'checklists',coalesce(safe_snapshot->'checklists','[]'),'materials',coalesce(safe_snapshot->'materials','[]'),'expenses',coalesce(safe_snapshot->'expenses','[]'),'attachments',coalesce(safe_snapshot->'attachments','[]'));
 perform private.customer_signature_snapshot(safe_snapshot);
 if asset_id is not null then
  select * into s from public.signatures where tenant_id=target_tenant and report_id=r.id and id=asset_id and signature_kind='customer' and revoked_at is null;
  if found then return jsonb_build_object('bucket','signatures','path',s.storage_path,'name','klantondertekening.png','mime','image/png','sha256',s.sha256,'scope',jsonb_build_array(target_tenant,w.id));end if;
  select * into a from public.attachments where tenant_id=target_tenant and work_order_id=w.id and id=asset_id;
  if a.id is null or not exists(select 1 from jsonb_array_elements(safe_snapshot->'attachments') item where item->>'id'=a.id::text and item->>'sha256'=a.sha256) then raise exception 'Klantbijlage niet beschikbaar' using errcode='42501';end if;
  return jsonb_build_object('bucket',a.storage_bucket,'path',a.storage_path,'name',a.file_name,'mime',a.mime_type,'sha256',a.sha256,'scope',case when array_length(string_to_array(a.storage_path,'/'),1)=3 then jsonb_build_array(target_tenant,w.id) when a.storage_path like target_tenant::text||'/'||w.id::text||'/communication/%' then jsonb_build_array(target_tenant,w.id,'communication') else jsonb_build_array(target_tenant,w.id,a.report_entry_id) end);
 end if;
 return jsonb_build_object('id',r.id,'version',r.version,'state',r.state,'snapshot',safe_snapshot,'contentHash',r.content_hash,'projection','customer_copy',
  'policy',r.signature_policy,'createdAt',r.created_at,'approvedAt',r.approved_at,'employeeVerified',exists(select 1 from public.signatures employee where employee.tenant_id=target_tenant and employee.report_id=r.id and employee.signature_kind='employee' and employee.revoked_at is null),
  'waiver',(select jsonb_build_object('reason','Klantondertekening door bevoegd beheer vrijgesteld','at',waiver.created_at)from public.work_order_signature_waivers waiver where waiver.report_id=r.id),
  'signatures',coalesce((select jsonb_agg(jsonb_build_object('id',customer.id,'name',customer.signer_name,'capacity',customer.signer_capacity,'capturedBy',null,'signedAt',customer.signed_at,'channel',customer.channel,'kind','customer')order by customer.signed_at,customer.id)from public.signatures customer where customer.tenant_id=target_tenant and customer.report_id=r.id and customer.signature_kind='customer' and customer.revoked_at is null),'[]'));
end $$;
revoke all on function public.customer_portal_report_file(uuid,uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_report_file(uuid,uuid,uuid,uuid) to authenticated;
