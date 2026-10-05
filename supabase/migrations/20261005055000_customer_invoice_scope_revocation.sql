-- The rollback test reproduces a revoked contact retaining the old invoice/
-- payment customer scope. Preserve every existing session/module/exact-binding
-- condition and add only the live identity requirement for this same customer.
create or replace function private.customer_portal_bound(t uuid,c uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and private.service_enabled(t,'planning')
 and exists(select 1 from public.object_customer_bindings b join public.objects o on o.id=b.object_id and o.tenant_id=b.tenant_id
  where b.tenant_id=t and b.user_id=auth.uid() and b.active and o.customer_id=c)
 and exists(select 1 from public.customer_portal_accounts a where a.tenant_id=t and a.customer_id=c
  and a.user_id=auth.uid() and private.customer_account_access(t,a.id));
$$;
