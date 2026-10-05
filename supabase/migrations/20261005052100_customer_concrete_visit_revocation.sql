-- One existing boolean guard only. The direct concrete-visit rollback test
-- reproduces access after contact/account revocation. Add live account scope
-- while retaining session, planning, exact binding and publication conditions.
create or replace function private.customer_visit_access(t uuid,o uuid,w uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select w is not null and private.object_session_active() and private.service_enabled(t,'planning')
 and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=auth.uid() and b.active)
 and exists(select 1 from public.work_orders x where x.tenant_id=t and x.object_id=o and x.id=w
  and x.published_at is not null and x.planning_state='final' and x.archive_at is null and x.status<>'cancelled')
 and exists(select 1 from public.customer_portal_accounts a join public.objects obj on obj.tenant_id=a.tenant_id and obj.customer_id=a.customer_id
  where a.tenant_id=t and obj.id=o and a.user_id=auth.uid() and private.customer_account_access(t,a.id));
$$;
