-- Independently reproduced by the two rollback tests in test-customer-portal:
-- the legacy list still returns an object after contact/account deactivation.
-- This single read-only projection adds one live-account requirement. It does
-- not change any private guard, grant, field, resource ownership or stored data.
create or replace function public.customer_object_visits(target_tenant uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.object_session_active() or not exists(select 1 from public.tenants where id=target_tenant and status='active') then raise exception 'Geen toegang' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',o.id,'name',o.name,'number',o.object_number,'address',o.address,'manageSecrets',b.manage_secrets,
  'visits',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'number',w.work_order_number,'start',w.projected_start_at,'end',w.projected_end_at,'status',w.status,'service',w.discipline) order by w.projected_start_at desc nulls last)
   from public.work_orders w where w.tenant_id=target_tenant and w.object_id=o.id and private.customer_visit_access(target_tenant,o.id,w.id)),'[]')) order by o.name)
  from public.object_customer_bindings b join public.objects o on o.tenant_id=b.tenant_id and o.id=b.object_id
  where b.tenant_id=target_tenant and b.user_id=auth.uid() and b.active
   and exists(select 1 from public.customer_portal_accounts a where a.tenant_id=target_tenant and a.customer_id=o.customer_id
    and a.user_id=auth.uid() and private.customer_account_access(target_tenant,a.id))),'[]');
end $$;
