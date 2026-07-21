-- Phase 2E: repair allocations synthesized for legacy payments that were never
-- settled. The original invoice-canon backfill created one allocation for every
-- payment regardless of status. Preserve each removed ledger row in audit_log,
-- remove only rows carrying that exact backfill marker on provably unsettled
-- payments, then supersede only explicit staging-demo provider metadata when a
-- real active provider intent exists for the same source. Never delete payments.

lock table public.payments in share row exclusive mode;
lock table public.payment_allocations in share row exclusive mode;

create temporary table fieldgrid_unsettled_synthetic_allocations
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
    'migration', '20260719125800_unsettled_payment_allocation_reconciliation.sql',
    'reason', 'legacy_backfill_allocated_unsettled_payment',
    'paymentId', synthetic.payment_id,
    'invoiceId', synthetic.invoice_id,
    'amountCents', synthetic.amount_cents,
    'amount', synthetic.amount,
    'allocatedAt', synthetic.allocated_at,
    'allocationNote', synthetic.note,
    'paymentStatus', synthetic.payment_status
  )
from fieldgrid_unsettled_synthetic_allocations synthetic;

delete from public.payment_allocations allocation
using fieldgrid_unsettled_synthetic_allocations synthetic
where allocation.id = synthetic.id;

do $provider_duplicate_precondition$
declare
  ambiguous record;
begin
  select
    payment.tenant_id,
    payment.source_type,
    payment.source_id,
    count(*) as bound_count
  into ambiguous
  from public.payments payment
  where payment.payment_method = 'mollie'
    and payment.status in (
      'created', 'provider_pending', 'open', 'pending', 'authorized',
      'reconciliation_required'
    )
    and payment.tenant_id is not null
    and payment.source_id is not null
    and not (
      payment.mollie_payment_id like 'tr_staging_demo_%'
      and payment.checkout_url like 'https://www.mollie.com/checkout/staging-demo/%'
      and payment.paid_at is null
    )
    and (
      payment.mollie_payment_id is not null
      or payment.checkout_url is not null
      or payment.paid_at is not null
      or exists (
        select 1
        from public.payment_allocations allocation
        where allocation.payment_id = payment.id
      )
    )
  group by payment.tenant_id, payment.source_type, payment.source_id
  having count(*) > 1
  order by payment.tenant_id, payment.source_type, payment.source_id
  limit 1;

  if found then
    raise exception
      'Multiple real provider/financial intents require manual reconciliation for tenant %, source %/% (bound %).',
      ambiguous.tenant_id,
      ambiguous.source_type,
      ambiguous.source_id,
      ambiguous.bound_count
      using errcode = '23505';
  end if;
end;
$provider_duplicate_precondition$;

create temporary table fieldgrid_superseded_staging_demo_payments
on commit drop
as
select
  demo.id,
  demo.tenant_id,
  demo.registered_by_user_id,
  demo.status as previous_status,
  demo.source_type,
  demo.source_id,
  real_intent.id as kept_payment_id
from public.payments demo
join lateral (
  select candidate.id
  from public.payments candidate
  where candidate.id <> demo.id
    and candidate.tenant_id = demo.tenant_id
    and candidate.source_type = demo.source_type
    and candidate.source_id = demo.source_id
    and candidate.payment_method = 'mollie'
    and candidate.status in (
      'created', 'provider_pending', 'open', 'pending', 'authorized',
      'reconciliation_required'
    )
    and not (
      candidate.mollie_payment_id like 'tr_staging_demo_%'
      and candidate.checkout_url like 'https://www.mollie.com/checkout/staging-demo/%'
    )
  order by
    case candidate.status
      when 'authorized' then 6
      when 'pending' then 5
      when 'open' then 4
      when 'provider_pending' then 3
      when 'reconciliation_required' then 2
      when 'created' then 1
      else 0
    end desc,
    candidate.created_at desc,
    candidate.id desc
  limit 1
) real_intent on true
where demo.payment_method = 'mollie'
  and demo.status in (
    'created', 'provider_pending', 'open', 'pending', 'authorized',
    'reconciliation_required'
  )
  and demo.mollie_payment_id like 'tr_staging_demo_%'
  and demo.checkout_url like 'https://www.mollie.com/checkout/staging-demo/%'
  and demo.paid_at is null
  and not exists (
    select 1
    from public.payment_allocations allocation
    where allocation.payment_id = demo.id
  );

insert into public.audit_log (
  tenant_id,
  user_id,
  action,
  resource,
  resource_id,
  metadata
)
select
  superseded.tenant_id,
  coalesce(
    superseded.registered_by_user_id,
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  'migration_staging_demo_payment_intent_superseded',
  'payments',
  superseded.id::text,
  jsonb_build_object(
    'migration', '20260719125800_unsettled_payment_allocation_reconciliation.sql',
    'reason', 'staging_demo_metadata_duplicate_of_real_provider_intent',
    'previousStatus', superseded.previous_status,
    'keptPaymentIntentId', superseded.kept_payment_id,
    'sourceType', superseded.source_type,
    'sourceId', superseded.source_id
  )
from fieldgrid_superseded_staging_demo_payments superseded;

update public.payments payment
set
  status = 'failed',
  note = concat_ws(
    E'\n',
    nullif(payment.note, ''),
    '[Phase 2E migration] Superseded staging-demo provider metadata; the real provider intent was retained.'
  ),
  updated_at = now()
from fieldgrid_superseded_staging_demo_payments superseded
where payment.id = superseded.id;

do $allocation_reconciliation_postcondition$
begin
  if exists (
    select 1
    from public.payment_allocations allocation
    join public.payments payment on payment.id = allocation.payment_id
    where allocation.note = 'Backfill bestaande factuurbetaling'
      and payment.status <> 'paid'
      and payment.paid_at is null
  ) then
    raise exception 'Unsettled synthetic payment allocations remain.'
      using errcode = '23514';
  end if;
end;
$allocation_reconciliation_postcondition$;
