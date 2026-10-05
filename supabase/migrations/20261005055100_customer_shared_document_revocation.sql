-- One guard only: the actual file-descriptor rollback test proves an inactive
-- contact could still open an explicitly shared document. No storage or table
-- grant changes; retain the exact object, visibility and archive requirements.
create or replace function private.customer_document_access(t uuid,d uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and exists(select 1 from public.customer_documents x
 join public.object_customer_bindings b on b.tenant_id=x.tenant_id and b.object_id=x.portal_object_id and b.user_id=auth.uid() and b.active
 where x.tenant_id=t and x.id=d and x.visibility='customer' and not x.archived and x.portal_object_id is not null
 and exists(select 1 from public.customer_portal_accounts a where a.tenant_id=t and a.customer_id=x.customer_id
  and a.user_id=auth.uid() and private.customer_account_access(t,a.id)));
$$;
