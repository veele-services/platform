-- Separate read-only invoice DTO. It delegates the existing all-line/exact-
-- object boundary to customer_invoice_access and selects this account's customer.
-- Provider IDs, tokens, payloads, invoice snapshots and private paths stay out.
create or replace function public.customer_portal_invoices(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.customer_portal_accounts;result jsonb;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot klantfacturen' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 if not private.service_enabled(target_tenant,'finance') then return '[]';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,
  'description',coalesce((select string_agg(l.description,' · ' order by l.created_at,l.id) from public.invoice_lines l where l.tenant_id=target_tenant and l.invoice_id=i.id),''),
  'objectIds',(select jsonb_agg(ids.object_id order by ids.object_id) from(select distinct w.object_id from public.invoice_lines l
   join public.work_orders w on w.tenant_id=l.tenant_id and w.id=l.work_order_id where l.tenant_id=target_tenant and l.invoice_id=i.id)ids),
  'issuedOn',i.issued_on,'dueOn',i.due_on,'total',i.total_cents,'paid',i.paid_cents,
  'credited',case when i.status='credited' then i.total_cents else 0 end,
  'balance',case when i.status='credited' then 0 else greatest(i.total_cents-i.paid_cents,0) end,
  'status',i.status,'hasPdf',i.pdf_storage_path is not null,
  'paymentInvoiceIds',(select jsonb_agg(own.invoice_id order by own.invoice_id)
   from public.payment_allocations own where own.tenant_id=target_tenant and own.payment_attempt_id=(
    select p.id from public.payment_attempts p join public.payment_allocations al on al.tenant_id=p.tenant_id and al.payment_attempt_id=p.id
    where p.tenant_id=target_tenant and al.invoice_id=i.id and p.status in('open','pending') and p.merchant_profile_id is not null
    and not exists(select 1 from public.payment_allocations other
     join public.invoices inv on inv.tenant_id=other.tenant_id and inv.id=other.invoice_id
     where other.tenant_id=target_tenant and other.payment_attempt_id=p.id
      and(inv.customer_id<>a.customer_id or not private.customer_invoice_access(target_tenant,inv.id)))
    order by p.created_at,p.id limit 1)),
  'paymentPending',exists(select 1 from public.invoice_group_items gi join public.payment_attempts p on p.tenant_id=gi.tenant_id and p.invoice_group_id=gi.invoice_group_id
   where gi.tenant_id=target_tenant and gi.invoice_id=i.id and p.status in('open','pending')))
  order by i.issued_on desc,i.id),'[]') into result from public.invoices i
 where i.tenant_id=target_tenant and i.customer_id=a.customer_id and private.customer_invoice_access(target_tenant,i.id);
 return result;
end $$;
revoke all on function public.customer_portal_invoices(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_invoices(uuid,uuid) to authenticated;
