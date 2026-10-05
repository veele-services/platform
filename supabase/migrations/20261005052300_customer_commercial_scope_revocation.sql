-- The independently run commercial-list test still exposes an object after
-- contact/account deactivation. Tighten only this existing boolean guard;
-- retain planning, tenant, exact binding and objectless own-creator conditions.
create or replace function private.commercial_customer_scope(t uuid,c uuid,o uuid,creator uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and private.service_enabled(t,'planning')
 and exists(select 1 from public.tenants where id=t and status='active')
 and exists(select 1 from public.object_customer_bindings b join public.objects obj on obj.tenant_id=b.tenant_id and obj.id=b.object_id
  where b.tenant_id=t and b.user_id=auth.uid() and b.active and obj.customer_id=c and(b.object_id=o or o is null and creator=auth.uid()))
 and exists(select 1 from public.customer_portal_accounts a where a.tenant_id=t and a.customer_id=c
  and a.user_id=auth.uid() and private.customer_account_access(t,a.id));
$$;
