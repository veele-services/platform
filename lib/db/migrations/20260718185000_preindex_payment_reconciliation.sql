-- Phase 2E: reconcile legacy unsettled allocations and safely supersedable
-- duplicate Mollie intents before the Phase 2 security migration installs the
-- one-active-intent-per-source unique index. Never delete a payment. Fail
-- closed when more than one provider/financially bound intent exists.

lock table public.payments in share row exclusive mode;
lock table public.payment_allocations in share row exclusive mode;

create temporary table fieldgrid_preindex_unsettled_synthetic_allocations
on commit drop
as
select
  allocation.id,
  allocation.tenant_id,
  allocation.payment_id,
  allocation.invoice_id,
  allocation.amount_cents,
  allocation.amount,
  allocation.allocated_at,
  allocation.allocated_by_user_id,
  allocation.note,
  payment.registered_by_user_id,
  payment.status as payment_status
from public.payment_allocations allocation
join public.payments payment on payment.id = allocation.payment_id
where allocation.note = 'Backfill bestaande factuurbetaling'
  and payment.status <> 'paid'
  and payment.paid_at is null;

insert into public.audit_log (
  tenant_id,
  user_id,
  action,
  resource,
  resource_id,
  metadata
)
select
  synthetic.tenant_id,
  coalesce(
    synthetic.allocated_by_user_id,
    synthetic.registered_by_user_id,
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  'migration_unsettled_synthetic_allocation_removed',
  'payment_allocations',
  synthetic.id::text,
  jsonb_build_object(
    'migration', '20260718185000_preindex_payment_reconciliation.sql',
    'reason', 'legacy_backfill_allocated_unsettled_payment',
    'paymentId', synthetic.payment_id,
    'invoiceId', synthetic.invoice_id,
    'amountCents', synthetic.amount_cents,
    'amount', synthetic.amount,
    'allocatedAt', synthetic.allocated_at,
    'allocationNote', synthetic.note,
    'paymentStatus', synthetic.payment_status
  )
from fieldgrid_preindex_unsettled_synthetic_allocations synthetic;

delete from public.payment_allocations allocation
using fieldgrid_preindex_unsettled_synthetic_allocations synthetic
where allocation.id = synthetic.id;

create temporary table fieldgrid_preindex_duplicate_payment_intents
on commit drop
as
with active_intents as (
  select
    payment.*,
    (
      payment.mollie_payment_id like 'tr_staging_demo_%'
      and payment.checkout_url like 'https://www.mollie.com/checkout/staging-demo/%'
      and payment.paid_at is null
      and not exists (
        select 1
        from public.payment_allocations allocation
        where allocation.payment_id = payment.id
      )
    ) as staging_demo_metadata,
    not (
      (
        payment.status = 'created'
        and payment.mollie_payment_id is null
        and payment.checkout_url is null
        and payment.paid_at is null
        and not exists (
          select 1
          from public.payment_allocations allocation
          where allocation.payment_id = payment.id
        )
      )
      or (
        payment.mollie_payment_id like 'tr_staging_demo_%'
        and payment.checkout_url like 'https://www.mollie.com/checkout/staging-demo/%'
        and payment.paid_at is null
        and not exists (
          select 1
          from public.payment_allocations allocation
          where allocation.payment_id = payment.id
        )
      )
    ) as provider_or_financially_bound
  from public.payments payment
  where payment.payment_method = 'mollie'
    and payment.tenant_id is not null
    and payment.status in (
      'created', 'provider_pending', 'open', 'pending', 'authorized',
      'reconciliation_required'
    )
    and payment.source_id is not null
), ranked as (
  select
    intent.id,
    intent.tenant_id,
    intent.source_type,
    intent.source_id,
    intent.status as previous_status,
    intent.staging_demo_metadata,
    intent.provider_or_financially_bound,
    count(*) over source_partition as source_intent_count,
    row_number() over source_order as source_rank,
    first_value(intent.id) over source_order as kept_payment_id
  from active_intents intent
  window
    source_partition as (
      partition by intent.tenant_id, intent.source_type, intent.source_id
    ),
    source_order as (
      partition by intent.tenant_id, intent.source_type, intent.source_id
      order by
        intent.provider_or_financially_bound desc,
        case intent.status
          when 'authorized' then 6
          when 'pending' then 5
          when 'open' then 4
          when 'provider_pending' then 3
          when 'reconciliation_required' then 2
          when 'created' then 1
          else 0
        end desc,
        intent.created_at desc,
        intent.id desc
    )
)
select *
from ranked
where source_intent_count > 1;

do $payment_duplicate_precondition$
declare
  ambiguous record;
begin
  select
    duplicate.tenant_id,
    duplicate.source_type,
    duplicate.source_id,
    count(*) as active_count,
    count(*) filter (where duplicate.provider_or_financially_bound) as bound_count
  into ambiguous
  from fieldgrid_preindex_duplicate_payment_intents duplicate
  group by duplicate.tenant_id, duplicate.source_type, duplicate.source_id
  having count(*) filter (where duplicate.provider_or_financially_bound) > 1
  order by duplicate.tenant_id, duplicate.source_type, duplicate.source_id
  limit 1;

  if found then
    raise exception
      'Multiple provider/financially bound active Mollie intents require manual reconciliation for tenant %, source %/% (active %, bound %).',
      ambiguous.tenant_id,
      ambiguous.source_type,
      ambiguous.source_id,
      ambiguous.active_count,
      ambiguous.bound_count
      using errcode = '23505';
  end if;
end;
$payment_duplicate_precondition$;

insert into public.audit_log (
  tenant_id,
  user_id,
  action,
  resource,
  resource_id,
  metadata
)
select
  payment.tenant_id,
  coalesce(
    payment.registered_by_user_id,
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  'migration_duplicate_payment_intent_superseded',
  'payments',
  payment.id::text,
  jsonb_build_object(
    'migration', '20260718185000_preindex_payment_reconciliation.sql',
    'reason', 'unbound_duplicate_active_mollie_intent',
    'previousStatus', duplicate.previous_status,
    'keptPaymentIntentId', duplicate.kept_payment_id,
    'sourceType', duplicate.source_type,
    'sourceId', duplicate.source_id,
    'stagingDemoMetadata', duplicate.staging_demo_metadata,
    'providerOrFinanciallyBound', false
  )
from fieldgrid_preindex_duplicate_payment_intents duplicate
join public.payments payment on payment.id = duplicate.id
where duplicate.source_rank > 1
  and not duplicate.provider_or_financially_bound;

update public.payments payment
set
  status = 'failed',
  note = concat_ws(
    E'\n',
    nullif(payment.note, ''),
    '[Phase 2E migration] Superseded duplicate local intent before the active-source index; no live provider or financial binding was present.'
  ),
  updated_at = now()
from fieldgrid_preindex_duplicate_payment_intents duplicate
where payment.id = duplicate.id
  and duplicate.source_rank > 1
  and not duplicate.provider_or_financially_bound;

do $preindex_payment_reconciliation_postcondition$
begin
  if exists (
    select 1
    from public.payment_allocations allocation
    join public.payments payment on payment.id = allocation.payment_id
    where allocation.note = 'Backfill bestaande factuurbetaling'
      and payment.status <> 'paid'
      and payment.paid_at is null
  ) then
    raise exception 'Unsettled synthetic payment allocations remain before the active-source index.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.payments payment
    where payment.payment_method = 'mollie'
      and payment.tenant_id is not null
      and payment.status in (
        'created', 'provider_pending', 'open', 'pending', 'authorized',
        'reconciliation_required'
      )
      and payment.source_id is not null
    group by payment.tenant_id, payment.source_type, payment.source_id
    having count(*) > 1
  ) then
    raise exception 'Active Mollie source duplicates remain before the active-source index.'
      using errcode = '23505';
  end if;
end;
$preindex_payment_reconciliation_postcondition$;
