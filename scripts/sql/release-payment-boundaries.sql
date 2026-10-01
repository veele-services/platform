-- Query-first payment boundary repair. No historical financial rows are rewritten.
begin;

revoke insert,update,delete on public.payment_attempts,public.payment_allocations from authenticated;
drop policy payment_attempts_finance on public.payment_attempts;
drop policy payment_allocations_finance on public.payment_allocations;
create policy payment_attempts_finance_read on public.payment_attempts for select to authenticated
  using ((select private.has_role(tenant_id,array['tenant_admin','management','finance']::public.app_role[])));
create policy payment_allocations_finance_read on public.payment_allocations for select to authenticated
  using ((select private.has_role(tenant_id,array['tenant_admin','management','finance']::public.app_role[])));

-- Invoker is intentional: a validated SECURITY DEFINER payment RPC runs as its
-- owner; a direct Data API write runs as authenticated, even with the same JWT.
create or replace function private.invoice_payment_write_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and old.status<>'draft' and new.status='draft' then
    raise exception 'Een definitieve factuur kan geen concept worden' using errcode='23514';
  end if;
  if current_user in ('authenticated','anon') then
    if tg_op='INSERT' then
      if new.paid_cents<>0 or new.status<>'draft' then
        raise exception 'Gebruik de factuur- of betaalactie' using errcode='42501';
      end if;
    elsif new.paid_cents is distinct from old.paid_cents or
      (new.status is distinct from old.status and not (old.status='final' and new.status='sent')) then
      raise exception 'Gebruik de factuur- of betaalactie' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.invoice_payment_write_guard() from public,anon,authenticated,service_role;
create trigger invoice_payment_write_guard before insert or update on public.invoices
for each row execute function private.invoice_payment_write_guard();

create or replace function private.payment_group_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare g public.invoice_groups;
begin
  if tg_table_name='invoice_groups' then
    -- The row is already locked by UPDATE/DELETE. An issued capability or
    -- attempt freezes identity even if it has since expired or been revoked.
    if exists(select 1 from public.external_action_tokens e where e.purpose='payment' and e.tenant_id=old.tenant_id and e.subject_id=old.id)
      or exists(select 1 from public.payment_attempts p where p.tenant_id=old.tenant_id and p.invoice_group_id=old.id)
      or exists(select 1 from public.invoice_group_items gi where gi.tenant_id=old.tenant_id and gi.invoice_group_id=old.id) then
      if tg_op='DELETE' then raise exception 'Bewaar de historie van deze betaallink' using errcode='23514';end if;
      if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id
        or new.customer_id is distinct from old.customer_id or new.purpose is distinct from old.purpose then
        raise exception 'De klantkoppeling van deze betaallink staat vast' using errcode='23514';
      end if;
    end if;
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='UPDATE' and (new.tenant_id is distinct from old.tenant_id or new.invoice_group_id is distinct from old.invoice_group_id) then
    raise exception 'Een betaalbundelregel kan niet worden verplaatst' using errcode='23514';
  end if;
  select * into g from public.invoice_groups where id=case when tg_op='DELETE' then old.invoice_group_id else new.invoice_group_id end
    and tenant_id=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end for update;
  if not found then raise exception 'Ongeldige betaalbundel' using errcode='23514';end if;
  if exists(select 1 from public.external_action_tokens e where e.purpose='payment' and e.tenant_id=g.tenant_id and e.subject_id=g.id)
    or exists(select 1 from public.payment_attempts p where p.tenant_id=g.tenant_id and p.invoice_group_id=g.id) then
    raise exception 'De facturen van deze betaallink staan vast' using errcode='23514';
  end if;
  if tg_op<>'DELETE' and not exists(select 1 from public.invoices i where i.tenant_id=g.tenant_id and i.id=new.invoice_id
    and i.customer_id=g.customer_id and i.status not in ('draft','void','credited')) then
    raise exception 'Factuur en betaallink moeten bij dezelfde klant horen' using errcode='23514';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.payment_group_guard() from public,anon,authenticated,service_role;
create trigger payment_group_identity_guard before update or delete on public.invoice_groups
for each row execute function private.payment_group_guard();
create trigger payment_group_items_guard before insert or update or delete on public.invoice_group_items
for each row execute function private.payment_group_guard();

create or replace function private.payment_issue_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare g public.invoice_groups; target_tenant uuid; target_group uuid;
begin
  if tg_table_name='external_action_tokens' then
    if tg_op='UPDATE' and old.purpose='payment' and (new.purpose is distinct from old.purpose
      or new.tenant_id is distinct from old.tenant_id or new.subject_id is distinct from old.subject_id
      or new.token_hash is distinct from old.token_hash) then
      raise exception 'Een betaalcapability kan niet worden verplaatst' using errcode='23514';
    end if;
    if new.purpose<>'payment' or tg_op='UPDATE' then return new;end if;
    target_tenant:=new.tenant_id;target_group:=new.subject_id;
  else
    if new.invoice_group_id is null then return new;end if;
    target_tenant:=new.tenant_id;target_group:=new.invoice_group_id;
  end if;
  -- Same lock as group edits: no issuance-versus-rebinding race.
  select * into g from public.invoice_groups where tenant_id=target_tenant and id=target_group for update;
  if not found or g.status<>'open' or g.expires_at is null or g.expires_at<=clock_timestamp() then
    raise exception 'Betaalbundel niet beschikbaar' using errcode='23514';
  end if;
  if not exists(select 1 from public.invoice_group_items gi where gi.tenant_id=g.tenant_id and gi.invoice_group_id=g.id)
    or exists(select 1 from public.invoice_group_items gi join public.invoices i on i.tenant_id=gi.tenant_id and i.id=gi.invoice_id
      where gi.tenant_id=g.tenant_id and gi.invoice_group_id=g.id and (i.customer_id<>g.customer_id or i.status in ('draft','void','credited'))) then
    raise exception 'Ongeldige facturen voor deze betaallink' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.payment_issue_guard() from public,anon,authenticated,service_role;
create trigger payment_token_issue_guard before insert or update on public.external_action_tokens
for each row execute function private.payment_issue_guard();
create trigger payment_attempt_issue_guard before insert on public.payment_attempts
for each row execute function private.payment_issue_guard();

create or replace function public.register_manual_payment(
  target_tenant_id uuid,
  payment_date timestamptz,
  reference text,
  allocations jsonb,
  idempotency_key text
)
returns public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocation jsonb;
  invoice_id uuid;
  allocation_amount bigint;
  total_amount bigint := 0;
  attempt public.payment_attempts;
begin
  if idempotency_key like 'mollie-%' then raise exception 'Provider retry keys are reserved' using errcode='23514'; end if;
  if not private.has_role(target_tenant_id, array['tenant_admin','management','finance']::public.app_role[]) then
    raise exception 'Finance role required' using errcode = '42501';
  end if;
  if jsonb_typeof(allocations) <> 'array' or jsonb_array_length(allocations) = 0 then
    raise exception 'At least one payment allocation is required' using errcode = '23514';
  end if;
  if exists (select 1 from public.payment_attempts p where p.tenant_id = target_tenant_id and p.idempotency_key = register_manual_payment.idempotency_key) then
    select * into attempt from public.payment_attempts p where p.tenant_id = target_tenant_id and p.idempotency_key = register_manual_payment.idempotency_key;
    if attempt.provider <> 'manual' then raise exception 'Invalid manual payment identity' using errcode='23514'; end if;
    return attempt;
  end if;

  -- Deterministic ordering prevents deadlocks when two multi-invoice payments race.
  perform 1
  from public.invoices i
  join (
    select (value->>'invoice_id')::uuid as id
    from jsonb_array_elements(allocations)
  ) requested on requested.id = i.id
  where i.tenant_id = target_tenant_id
  order by i.id
  for update of i;

  for allocation in select value from jsonb_array_elements(allocations)
  loop
    invoice_id := (allocation->>'invoice_id')::uuid;
    allocation_amount := (allocation->>'amount_cents')::bigint;
    if allocation_amount <= 0 then raise exception 'Allocation amount must be positive' using errcode = '23514'; end if;
    if not exists (
      select 1 from public.invoices i
      where i.tenant_id = target_tenant_id and i.id = invoice_id
        and i.status not in ('draft','credited','void')
        and i.total_cents - i.paid_cents >= allocation_amount
    ) then
      raise exception 'Invalid or excessive allocation for invoice %', invoice_id using errcode = '23514';
    end if;
    total_amount := total_amount + allocation_amount;
  end loop;

  insert into public.payment_attempts (
    tenant_id, provider, provider_mode, status, amount_cents, idempotency_key,
    provider_payload, paid_at, last_checked_at, created_by
  ) values (
    target_tenant_id, 'manual', 'manual', 'paid', total_amount, idempotency_key,
    jsonb_build_object('reference', reference, 'payment_date', payment_date),
    payment_date, clock_timestamp(), auth.uid()
  ) returning * into attempt;

  for allocation in select value from jsonb_array_elements(allocations)
  loop
    invoice_id := (allocation->>'invoice_id')::uuid;
    allocation_amount := (allocation->>'amount_cents')::bigint;
    insert into public.payment_allocations (tenant_id, payment_attempt_id, invoice_id, amount_cents)
    values (target_tenant_id, attempt.id, invoice_id, allocation_amount);
    update public.invoices
    set paid_cents = paid_cents + allocation_amount,
        status = case when paid_cents + allocation_amount = total_cents then 'paid'::public.invoice_status else 'partially_paid'::public.invoice_status end
    where tenant_id = target_tenant_id and id = invoice_id;
  end loop;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_data, request_id)
  values (target_tenant_id, auth.uid(), 'payment.manual_registered', 'payment_attempt', attempt.id, jsonb_build_object('amount_cents', total_amount, 'reference', reference), idempotency_key);
  return attempt;
end;
$$;
revoke execute on function public.register_manual_payment(uuid, timestamptz, text, jsonb, text) from public, anon;
grant execute on function public.register_manual_payment(uuid, timestamptz, text, jsonb, text) to authenticated;


create or replace function public.apply_confirmed_provider_payment(
  target_payment_attempt_id uuid,
  provider_payment_id text,
  provider_status public.payment_status,
  provider_amount_cents bigint,
  provider_currency text,
  provider_payload jsonb
)
returns public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.payment_attempts;
  allocation public.payment_allocations;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into target from public.payment_attempts p where p.id = target_payment_attempt_id for update;
  if not found then raise exception 'Payment attempt not found' using errcode = 'P0002'; end if;
  if target.provider <> 'mollie' or target.provider_payment_id is distinct from provider_payment_id then
    raise exception 'Provider payment identity mismatch' using errcode = '23514';
  end if;
  if target.amount_cents <> provider_amount_cents or target.currency <> provider_currency then
    raise exception 'Provider payment amount or currency mismatch' using errcode = '23514';
  end if;
  if target.provider_payment_id is null or provider_payload->>'id' is distinct from target.provider_payment_id
    or provider_payload->>'mode' is distinct from target.provider_mode
    or provider_payload#>>'{metadata,tenant_id}' is distinct from target.tenant_id::text
    or provider_payload#>>'{metadata,payment_attempt_id}' is distinct from target.id::text
    or provider_payload#>>'{metadata,invoice_group_id}' is distinct from target.invoice_group_id::text then
    raise exception 'Provider payment context mismatch' using errcode='23514';
  end if;
  if target.invoice_group_id is null or
    (select coalesce(sum(pa.amount_cents),0) from public.payment_allocations pa where pa.tenant_id=target.tenant_id and pa.payment_attempt_id=target.id)<>target.amount_cents or
    exists(select 1 from public.payment_allocations pa
      left join public.invoices i on i.id=pa.invoice_id and i.tenant_id=pa.tenant_id
      left join public.invoice_groups g on g.id=target.invoice_group_id and g.tenant_id=target.tenant_id
      where pa.payment_attempt_id=target.id and (pa.tenant_id<>target.tenant_id or i.id is null or g.id is null or i.customer_id<>g.customer_id
        or not exists(select 1 from public.invoice_group_items gi where gi.tenant_id=g.tenant_id and gi.invoice_group_id=g.id and gi.invoice_id=i.id))) then
    raise exception 'Provider allocation mismatch' using errcode='23514';
  end if;
  if target.status = 'paid' then return target; end if;

  update public.payment_attempts
  set status = provider_status,
      provider_payload = apply_confirmed_provider_payment.provider_payload,
      paid_at = case when provider_status = 'paid' then clock_timestamp() else paid_at end,
      last_checked_at = clock_timestamp()
  where id = target.id returning * into target;

  if provider_status = 'paid' then
    for allocation in
      select * from public.payment_allocations pa
      where pa.tenant_id = target.tenant_id and pa.payment_attempt_id = target.id
      order by pa.invoice_id
    loop
      update public.invoices
      set paid_cents = least(total_cents, paid_cents + allocation.amount_cents),
          status = case when paid_cents + allocation.amount_cents >= total_cents then 'paid'::public.invoice_status else 'partially_paid'::public.invoice_status end
      where tenant_id = target.tenant_id and id = allocation.invoice_id and status <> 'paid';
    end loop;
  end if;
  return target;
end;
$$;
revoke execute on function public.apply_confirmed_provider_payment(uuid, text, public.payment_status, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_confirmed_provider_payment(uuid, text, public.payment_status, bigint, text, jsonb) to service_role;


commit;
