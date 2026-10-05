-- A new customer-only projection, including when this user also has a staff or
-- manager role. No modification of the richer legacy execution projection.
create function public.customer_portal_visit(target_tenant uuid,target_account uuid,target_visit uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.customer_portal_accounts;w public.work_orders;mutable boolean;result jsonb;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot klantafspraken' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_visit and customer_id=a.customer_id;
 if w.id is null or not exists(select 1 from public.objects o where o.tenant_id=target_tenant and o.id=w.object_id and o.customer_id=a.customer_id)
  or not private.customer_visit_access(target_tenant,w.object_id,w.id) then raise exception 'Geen toegang tot deze klantafspraak' using errcode='42501';end if;
 mutable:=w.status in('planned','released','seen','travelling','in_progress');
 select jsonb_build_object(
  'visit',jsonb_build_object('id',w.id,'objectId',w.object_id,'number',w.work_order_number,'service',w.discipline,
   'status',w.status,'start',w.projected_start_at,'end',w.projected_end_at,'actualStart',w.actual_start_at,'actualEnd',w.actual_end_at,'version',w.version),
  'canAddRequest',mutable,
  'tasks',coalesce((select jsonb_agg(t.task_name order by t.created_at,t.id) from public.work_order_tasks t
   where t.tenant_id=target_tenant and t.work_order_id=w.id and(not t.is_extra_work or t.extra_work_status='approved')),'[]'),
  'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'name',n.name) order by n.position,n.name,n.id)
   from public.object_nodes n where n.tenant_id=target_tenant and n.object_id=w.object_id and n.active),'[]'),
  'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'nodeId',r.node_id,'title',r.title,'body',r.body,'kind',r.kind,'priority',r.priority,'feedback',r.feedback,
   'status',case when r.state in('withdrawn','rejected','completed','partial','not_done','closed') then r.state when r.needs_review then 'received' else r.state end,
   'version',r.version,'createdAt',r.created_at,'updatedAt',r.updated_at,'author',private.customer_portal_profile(target_tenant,target_account)->>'fullName',
   'response',r.response,'canEdit',mutable and r.work_order_task_id is null and r.state not in('withdrawn','rejected','completed','partial','not_done','closed'),
   'canWithdraw',mutable and r.work_order_task_id is null and r.state not in('withdrawn','completed','partial','not_done','closed'),
   'read',exists(select 1 from public.object_request_receipts rc where rc.tenant_id=target_tenant and rc.request_id=r.id and rc.version=r.version and rc.user_id=auth.uid()),
   'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'version',d.version,'mime',d.mime_type) order by d.created_at,d.id)
    from public.object_documents d where d.tenant_id=target_tenant and d.object_id=w.object_id and d.work_order_id=w.id and d.request_id=r.id and d.category<>'security'),'[]'),
   'proposals',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'title',p.title,'scope',p.scope,'quantity',p.quantity,'priceCents',p.price_cents,
     'vatBasisPoints',p.vat_basis_points,'acceptedAt',p.accepted_at,
     'canAccept',mutable and r.state='proposal' and not r.needs_review and r.work_order_task_id is null and p.accepted_at is null
      and not exists(select 1 from public.object_request_proposals newer where newer.tenant_id=target_tenant and newer.request_id=r.id and newer.version>p.version)) order by p.version desc)
     from public.object_request_proposals p where p.tenant_id=target_tenant and p.object_id=w.object_id and p.request_id=r.id),'[]')) order by r.created_at desc,r.id)
   from public.object_visit_requests r where r.tenant_id=target_tenant and r.object_id=w.object_id and r.work_order_id=w.id and r.created_by=auth.uid()),'[]')) into result;
 return result;
end $$;
revoke all on function public.customer_portal_visit(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_visit(uuid,uuid,uuid) to authenticated;
