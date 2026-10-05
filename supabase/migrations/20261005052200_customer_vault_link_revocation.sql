-- One guard, one tightened customer-only branch. The rollback deep-link test
-- confirms the explicitly permitted vault link currently survives account
-- deactivation. No new vault capability or DTO field is introduced.
create or replace function private.object_visit_access(t uuid,o uuid,w uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and exists(select 1 from public.tenants x where x.id=t and x.status='active') and (
  private.object_manage(t)
  or private.customer_visit_access(t,o,w)
  or (w is null and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=auth.uid() and b.active and b.manage_secrets)
   and exists(select 1 from public.customer_portal_accounts account join public.objects obj on obj.tenant_id=account.tenant_id and obj.customer_id=account.customer_id
    where account.tenant_id=t and obj.id=o and account.user_id=auth.uid() and private.customer_account_access(t,account.id)))
  or exists(select 1 from public.work_order_assignments a
   join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id
   join public.work_orders wo on wo.tenant_id=a.tenant_id and wo.id=a.work_order_id
   join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
   where a.tenant_id=t and wo.object_id=o and wo.id=w and p.user_id=auth.uid() and p.status='active' and m.status='active'
    and 'staff'=any(m.roles) and private.service_enabled(t,'planning')
    and a.status not in('cancelled','returned') and wo.status<>'cancelled'
    and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null))
 ) and(w is null or exists(select 1 from public.work_orders wo where wo.tenant_id=t and wo.id=w and wo.object_id=o));
$$;
