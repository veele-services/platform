-- Selected account is an additional boundary around the existing immutable
-- file proxies. Return no storage locator; each proxy still enforces its hash,
-- current resource permission and post-I/O authorization checks.
create function public.customer_portal_file_authorize(target_tenant uuid,target_account uuid,kind text,target_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.customer_portal_accounts;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot klantdocument' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 if kind='invoice' then return exists(select 1 from public.invoices i where i.tenant_id=target_tenant and i.id=target_id and i.customer_id=a.customer_id and private.customer_invoice_access(target_tenant,i.id));
 elsif kind='report' then return private.service_enabled(target_tenant,'planning') and private.service_enabled(target_tenant,'rapportage') and exists(
  select 1 from public.work_order_report_versions r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id
  join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id and o.customer_id=a.customer_id
  where r.tenant_id=target_tenant and r.id=target_id and r.state='approved' and w.customer_id=a.customer_id
   and exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=w.object_id and b.user_id=auth.uid() and b.active));
 elsif kind='quote' then return private.service_enabled(target_tenant,'planning') and exists(select 1 from public.quotes q where q.tenant_id=target_tenant and q.id=target_id and q.customer_id=a.customer_id and q.published_at is not null and private.commercial_customer_scope(target_tenant,q.customer_id,q.object_id));
 elsif kind='document' then return exists(select 1 from public.customer_documents d where d.tenant_id=target_tenant and d.id=target_id and d.customer_id=a.customer_id and private.customer_document_access(target_tenant,d.id));
 end if;
 return false;
end $$;
revoke all on function public.customer_portal_file_authorize(uuid,uuid,text,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_file_authorize(uuid,uuid,text,uuid) to authenticated;
