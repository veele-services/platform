SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.prepare_provider_payment (
  payment_token_hash text,
  expected_mode      text
)
  RETURNS public.payment_attempts
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare capability public.external_action_tokens; g public.invoice_groups; a public.payment_attempts; total bigint; allocation_count integer;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
    or expected_mode is null or expected_mode not in ('test','live') then raise exception 'Service role required' using errcode='42501';end if;
  select * into capability from public.external_action_tokens e where e.token_hash=payment_token_hash and e.purpose='payment'
    and e.revoked_at is null and e.consumed_at is null and e.expires_at>clock_timestamp() for share;
  if not found then raise exception 'Betaallink niet beschikbaar' using errcode='42501';end if;
  select * into g from public.invoice_groups where tenant_id=capability.tenant_id and id=capability.subject_id for update;
  if not found or g.status<>'open' or g.expires_at is null or g.expires_at<=clock_timestamp()
    or not exists(select 1 from public.tenants t join public.tenant_settings s on s.tenant_id=t.id
      where t.id=g.tenant_id and t.status='active' and 'finance'=any(s.enabled_services)) then
    raise exception 'Betaalbundel niet beschikbaar' using errcode='42501';end if;
  -- Settlement locks attempt -> invoices. Use that same order before pricing;
  -- otherwise a checkout retry and its webhook can deadlock each other.
  perform 1 from public.payment_attempts p where p.tenant_id=g.tenant_id and p.invoice_group_id=g.id order by p.id for update;
  perform 1 from public.invoices i join public.invoice_group_items gi on gi.tenant_id=i.tenant_id and gi.invoice_id=i.id
    where gi.tenant_id=g.tenant_id and gi.invoice_group_id=g.id order by i.id for update of i;
  if not exists(select 1 from public.invoice_group_items gi where gi.tenant_id=g.tenant_id and gi.invoice_group_id=g.id)
    or exists(select 1 from public.invoice_group_items gi join public.invoices i on i.id=gi.invoice_id and i.tenant_id=gi.tenant_id
      where gi.tenant_id=g.tenant_id and gi.invoice_group_id=g.id and (i.customer_id<>g.customer_id or i.status in ('draft','void','credited'))) then
    raise exception 'Ongeldige facturen' using errcode='23514';end if;
  select sum(greatest(i.total_cents-i.paid_cents,0)) into total from public.invoices i
    join public.invoice_group_items gi on gi.tenant_id=i.tenant_id and gi.invoice_id=i.id
    where gi.tenant_id=g.tenant_id and gi.invoice_group_id=g.id;
  if total is null or total<=0 then raise exception 'Facturen al betaald' using errcode='23514';end if;
  if exists(select 1 from public.payment_allocations al join public.payment_attempts other_attempt
    on other_attempt.tenant_id=al.tenant_id and other_attempt.id=al.payment_attempt_id
    join public.invoice_group_items gi on gi.tenant_id=al.tenant_id and gi.invoice_id=al.invoice_id
    where gi.tenant_id=g.tenant_id and gi.invoice_group_id=g.id
      and other_attempt.invoice_group_id is distinct from g.id and other_attempt.status in('open','pending')) then
    raise exception 'Een betaling voor deze facturen wordt al verwerkt' using errcode='23514';end if;
  select * into a from public.payment_attempts p where p.tenant_id=g.tenant_id and p.invoice_group_id=g.id
    and p.provider='mollie' and p.provider_mode=expected_mode and p.currency='EUR' and p.amount_cents=total
    and p.status in ('open','pending') order by p.created_at desc,p.id desc limit 1 for update;
  if not found then
    a.id:=extensions.gen_random_uuid();
    insert into public.payment_attempts(id,tenant_id,invoice_group_id,provider,provider_mode,status,amount_cents,currency,idempotency_key)
      values(a.id,g.tenant_id,g.id,'mollie',expected_mode,'open',total,'EUR','mollie-'||g.id||'-'||a.id) returning * into a;
  end if;
  select count(*) into allocation_count from public.payment_allocations pa where pa.tenant_id=a.tenant_id and pa.payment_attempt_id=a.id;
  if allocation_count=0 and a.provider_payment_id is null and a.checkout_url is null and a.status='open' then
    -- Also repairs an old, unbound attempt left by the former two-request write.
    insert into public.payment_allocations(tenant_id,payment_attempt_id,invoice_id,amount_cents)
      select a.tenant_id,a.id,i.id,i.total_cents-i.paid_cents from public.invoices i
      join public.invoice_group_items gi on gi.tenant_id=i.tenant_id and gi.invoice_id=i.id
      where gi.tenant_id=g.tenant_id and gi.invoice_group_id=g.id and i.total_cents>i.paid_cents;
  end if;
  if (select coalesce(sum(pa.amount_cents),0) from public.payment_allocations pa where pa.tenant_id=a.tenant_id and pa.payment_attempt_id=a.id)<>total
    or exists(select 1 from public.payment_allocations pa left join public.invoices i on i.id=pa.invoice_id and i.tenant_id=pa.tenant_id
      where pa.payment_attempt_id=a.id and (i.id is null or pa.tenant_id<>g.tenant_id or i.customer_id<>g.customer_id
        or pa.amount_cents<>i.total_cents-i.paid_cents or not exists(select 1 from public.invoice_group_items gi where gi.tenant_id=g.tenant_id and gi.invoice_group_id=g.id and gi.invoice_id=i.id))) then
    raise exception 'Betaalverdeling niet beschikbaar' using errcode='23514';end if;
  return a;
end $function$;

REVOKE ALL ON FUNCTION "public"."prepare_provider_payment"(text, text) FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."prepare_provider_payment"(text, text) TO "postgres", "service_role";
