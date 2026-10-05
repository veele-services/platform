-- New single-purpose summary DTO for the new portal. No raw report, employee
-- signatures, ownership, review fields, checklist metadata or storage paths.
create function public.customer_portal_reports(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.customer_portal_accounts;result jsonb;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot klantrapporten' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 if not private.service_enabled(target_tenant,'planning') or not private.service_enabled(target_tenant,'rapportage') then return '[]';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'visitId',w.id,'objectId',w.object_id,'number',r.snapshot->>'number',
  'title',r.snapshot->>'title','approvedAt',r.approved_at,'version',r.version,'summary',r.snapshot->>'summary',
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('name',task->>'name','result',task->>'result','quantity',task->'executedQuantity','unit',task->>'unit'))
   from jsonb_array_elements(r.snapshot->'tasks')task),'[]')) order by r.approved_at desc,r.id),'[]')
 into result from public.work_order_report_versions r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id
 join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id and o.customer_id=a.customer_id
 where r.tenant_id=target_tenant and r.state='approved' and r.approved_at is not null and w.customer_id=a.customer_id
 and exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=o.id and b.user_id=auth.uid() and b.active);
 return result;
end $$;
revoke all on function public.customer_portal_reports(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_reports(uuid,uuid) to authenticated;
