-- Customer checkout uses the existing ledger. No bearer payment links or
-- provider credentials are returned to the browser by this RPC.
alter table public.payment_attempts add column merchant_profile_id text
 check(merchant_profile_id is null or merchant_profile_id ~ '^pfl_[A-Za-z0-9]+$');
create unique index tenant_provider_mollie_profile_unique on public.tenant_provider_connections((public_config->>'profile_id'))
 where provider='mollie' and active and verified_at is not null;

create function public.customer_portal_payment_prepare(target_tenant uuid,target_account uuid,invoice_ids uuid[],request_id uuid,expected_mode text,expected_profile text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts; p public.payment_attempts; receipt private.customer_portal_commands;
 ids uuid[]; fingerprint text; g uuid; total bigint;
begin
 if not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'finance') then
  raise exception 'Geen toegang tot klantbetaling' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 if request_id is null or expected_mode is null or expected_mode not in('test','live') or expected_profile is null
  or not exists(select 1 from public.tenant_provider_connections c where c.tenant_id=target_tenant and c.provider='mollie'
   and c.active and c.verified_at is not null and c.mode=expected_mode and c.secret_reference='MOLLIE_API_KEY'
   and c.public_config->>'profile_id'=expected_profile) then
  raise exception 'Betaalverbinding niet beschikbaar' using errcode='42501';end if;
 if invoice_ids is null or cardinality(invoice_ids) not between 1 and 50 or array_position(invoice_ids,null) is not null then
  raise exception 'Selecteer geldige facturen' using errcode='23514';end if;
 select array_agg(distinct x order by x) into ids from unnest(invoice_ids)x;
 if cardinality(ids)<>cardinality(invoice_ids) then raise exception 'Dubbele factuur' using errcode='23514';end if;
 -- Scope is rechecked before both new commands and idempotent replays.
 if (select count(*) from public.invoices i where i.tenant_id=target_tenant and i.customer_id=a.customer_id and i.id=any(ids)
  and private.customer_invoice_access(target_tenant,i.id))<>cardinality(ids) then
  raise exception 'Geen toegang tot deze facturen' using errcode='42501';end if;
 fingerprint:=encode(extensions.digest(jsonb_build_array(ids,expected_mode,expected_profile)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('customer-payment-command:'||request_id::text,0));
 -- Waiting for a command/invoice lock must not preserve stale authority.
 if not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'finance')
  or not exists(select 1 from public.tenant_provider_connections c where c.tenant_id=target_tenant and c.provider='mollie'
   and c.active and c.verified_at is not null and c.mode=expected_mode and c.secret_reference='MOLLIE_API_KEY'
   and c.public_config->>'profile_id'=expected_profile)
  or (select count(*) from public.invoices i where i.tenant_id=target_tenant and i.customer_id=a.customer_id and i.id=any(ids)
   and private.customer_invoice_access(target_tenant,i.id))<>cardinality(ids) then
  raise exception 'Betaaltoegang is gewijzigd' using errcode='42501';end if;
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid()
   or receipt.command<>'payment' or receipt.input_hash<>fingerprint then raise exception 'Betaalopdracht bestaat al' using errcode='23505';end if;
  select * into p from public.payment_attempts where tenant_id=target_tenant and id=(receipt.result->>'attemptId')::uuid;
  if not found then raise exception 'Betaalpoging ontbreekt' using errcode='23514';end if;
  return p.id;
 end if;
 -- Lock only invoice rows, in fixed order. Never wait for another attempt while
 -- holding these locks: the webhook takes attempt -> invoices in that order.
 perform 1 from public.invoices i where i.tenant_id=target_tenant and i.id=any(ids) order by i.id for update;
 -- Waiting for a command/invoice lock must not preserve stale authority.
 if not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'finance')
  or not exists(select 1 from public.tenant_provider_connections c where c.tenant_id=target_tenant and c.provider='mollie'
   and c.active and c.verified_at is not null and c.mode=expected_mode and c.secret_reference='MOLLIE_API_KEY'
   and c.public_config->>'profile_id'=expected_profile)
  or (select count(*) from public.invoices i where i.tenant_id=target_tenant and i.customer_id=a.customer_id and i.id=any(ids)
   and private.customer_invoice_access(target_tenant,i.id))<>cardinality(ids) then
  raise exception 'Betaaltoegang is gewijzigd' using errcode='42501';end if;
 if exists(select 1 from public.invoices i where i.tenant_id=target_tenant and i.id=any(ids)
  and(i.status in('draft','void','credited','paid') or i.total_cents<=i.paid_cents)) then
  raise exception 'Factuur is niet meer betaalbaar' using errcode='23514';end if;
 -- An exact pending selection may resume the same provider attempt. A partially
 -- overlapping bundle cannot create a second reservation for these invoices.
 select pa.* into p from public.payment_attempts pa where pa.tenant_id=target_tenant and pa.status in('open','pending')
  and exists(select 1 from public.payment_allocations al where al.tenant_id=target_tenant and al.payment_attempt_id=pa.id and al.invoice_id=any(ids))
 order by pa.created_at,pa.id limit 1;
 if found then
  if p.provider<>'mollie' or p.provider_mode<>expected_mode or p.merchant_profile_id is distinct from expected_profile
   or (select array_agg(al.invoice_id order by al.invoice_id) from public.payment_allocations al where al.tenant_id=target_tenant and al.payment_attempt_id=p.id) is distinct from ids
   or exists(select 1 from public.payment_allocations al join public.invoices i on i.tenant_id=al.tenant_id and i.id=al.invoice_id
     where al.tenant_id=target_tenant and al.payment_attempt_id=p.id and al.amount_cents<>i.total_cents-i.paid_cents) then
   raise exception 'Een betaling voor deze facturen wordt al verwerkt' using errcode='23514';end if;
 else
  select sum(total_cents-paid_cents) into total from public.invoices where tenant_id=target_tenant and id=any(ids);
  if total is null or total<=0 or total>9007199254740991 then raise exception 'Ongeldig betaalbedrag' using errcode='23514';end if;
  insert into public.invoice_groups(tenant_id,customer_id,purpose,created_by,expires_at)
   values(target_tenant,a.customer_id,'payment_bundle',auth.uid(),clock_timestamp()+interval '1 day') returning id into g;
  insert into public.invoice_group_items(tenant_id,invoice_group_id,invoice_id) select target_tenant,g,x from unnest(ids)x;
  p.id:=extensions.gen_random_uuid();
  insert into public.payment_attempts(id,tenant_id,invoice_group_id,provider,provider_mode,amount_cents,idempotency_key,merchant_profile_id)
   values(p.id,target_tenant,g,'mollie',expected_mode,total,'mollie-'||g||'-'||p.id,expected_profile) returning * into p;
  insert into public.payment_allocations(tenant_id,payment_attempt_id,invoice_id,amount_cents)
   select target_tenant,p.id,id,total_cents-paid_cents from public.invoices where tenant_id=target_tenant and id=any(ids);
 end if;
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result)
  values(request_id,target_tenant,target_account,auth.uid(),'payment',fingerprint,jsonb_build_object('attemptId',p.id));
 return p.id;
end $$;
revoke all on function public.customer_portal_payment_prepare(uuid,uuid,uuid[],uuid,text,text) from public,anon,service_role;
grant execute on function public.customer_portal_payment_prepare(uuid,uuid,uuid[],uuid,text,text) to authenticated;
