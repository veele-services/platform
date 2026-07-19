-- Phase 2C.1: durable payment creation, exact provider binding and monotonic settlement.

ALTER TABLE public.payments
  ALTER COLUMN status TYPE varchar(40),
  ADD COLUMN IF NOT EXISTS request_hash varchar(64),
  ADD COLUMN IF NOT EXISTS expected_provider_metadata jsonb,
  ADD COLUMN IF NOT EXISTS provider_status varchar(30),
  ADD COLUMN IF NOT EXISTS provider_mode varchar(20),
  ADD COLUMN IF NOT EXISTS provider_profile_id varchar(50),
  ADD COLUMN IF NOT EXISTS provider_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_reason text,
  ADD COLUMN IF NOT EXISTS status_version bigint NOT NULL DEFAULT 1;

UPDATE public.payments
SET provider_request_key = gen_random_uuid()
WHERE payment_method = 'mollie' AND provider_request_key IS NULL;

UPDATE public.payments payment
SET expected_provider_metadata = jsonb_build_object(
      'schemaVersion', 'fieldgrid-payment-v1',
      'purpose', CASE WHEN payment.source_type = 'invoice_collection'
        THEN 'invoice_collection_payment' ELSE 'invoice_payment' END,
      'paymentIntentId', payment.id,
      'tenantId', payment.tenant_id,
      'customerId', payment.customer_id,
      'sourceType', payment.source_type,
      'sourceId', payment.source_id
    ),
    request_hash = md5(concat_ws('|', payment.id, payment.tenant_id, payment.customer_id,
        payment.source_type, payment.source_id, payment.amount_cents, payment.currency))
      || md5('fieldgrid|' || concat_ws('|', payment.id, payment.tenant_id, payment.customer_id,
        payment.source_type, payment.source_id, payment.amount_cents, payment.currency)),
    provider_status = COALESCE(payment.provider_status, payment.status)
WHERE payment.payment_method = 'mollie'
  AND (payment.expected_provider_metadata IS NULL OR payment.request_hash IS NULL);

DROP INDEX IF EXISTS public.payments_active_mollie_source_unique_idx;
CREATE UNIQUE INDEX payments_active_mollie_source_unique_idx
  ON public.payments(tenant_id, source_type, source_id)
  WHERE payment_method = 'mollie'
    AND status IN ('created', 'provider_pending', 'open', 'pending', 'authorized', 'reconciliation_required')
    AND source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_active_request_hash_unique_idx
  ON public.payments(tenant_id, request_hash)
  WHERE payment_method = 'mollie'
    AND status IN ('created', 'provider_pending', 'open', 'pending', 'authorized', 'reconciliation_required')
    AND request_hash IS NOT NULL;

DO $payment_integrity_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_status_check') THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (
      status IN ('created', 'provider_pending', 'open', 'pending', 'authorized',
                 'paid', 'canceled', 'expired', 'failed', 'reconciliation_required')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_provider_intent_shape_check') THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_provider_intent_shape_check CHECK (
      payment_method <> 'mollie' OR (
        provider_request_key IS NOT NULL
        AND request_hash IS NOT NULL
        AND length(request_hash) = 64
        AND expected_provider_metadata IS NOT NULL
        AND expected_provider_metadata->>'schemaVersion' = 'fieldgrid-payment-v1'
        AND expected_provider_metadata->>'paymentIntentId' = id::text
        AND expected_provider_metadata->>'tenantId' = tenant_id::text
        AND expected_provider_metadata->>'customerId' = customer_id::text
        AND expected_provider_metadata->>'sourceType' = source_type
        AND expected_provider_metadata->>'sourceId' = source_id::text
      )
    ) NOT VALID;
    ALTER TABLE public.payments VALIDATE CONSTRAINT payments_provider_intent_shape_check;
  END IF;
END;
$payment_integrity_constraints$;

CREATE OR REPLACE FUNCTION public.fieldgrid_guard_payment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  old_rank integer;
  new_rank integer;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF OLD.status = 'paid' THEN
    RAISE EXCEPTION 'A settled payment is terminal and cannot regress.' USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('canceled', 'expired', 'failed') THEN
    RAISE EXCEPTION 'A terminal provider payment cannot change status.' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'reconciliation_required' THEN RETURN NEW; END IF;
  old_rank := CASE OLD.status
    WHEN 'created' THEN 0 WHEN 'provider_pending' THEN 0
    WHEN 'reconciliation_required' THEN 0 WHEN 'open' THEN 1
    WHEN 'pending' THEN 2 WHEN 'authorized' THEN 3 ELSE -1 END;
  new_rank := CASE NEW.status
    WHEN 'provider_pending' THEN 0 WHEN 'open' THEN 1 WHEN 'pending' THEN 2
    WHEN 'authorized' THEN 3 WHEN 'paid' THEN 4
    WHEN 'canceled' THEN 4 WHEN 'expired' THEN 4 WHEN 'failed' THEN 4 ELSE -1 END;
  IF new_rank < old_rank THEN
    RAISE EXCEPTION 'Payment status transition % -> % is not monotonic.', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_monotonic_status ON public.payments;
CREATE TRIGGER trg_payments_monotonic_status
BEFORE UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.fieldgrid_guard_payment_status_transition();

REVOKE ALL ON FUNCTION public.fieldgrid_guard_payment_status_transition()
  FROM PUBLIC, anon, authenticated, service_role;

-- Repair mutable display projections from the allocation ledger. Active sent/paid
-- credit notes reduce the collectible balance; draft notes do not.
WITH balances AS (
  SELECT invoice.id,
         COALESCE(sum(allocation.amount_cents), 0)::bigint AS paid_cents,
         greatest(
           round(COALESCE(invoice.total_amount, 0) * 100)::bigint
           + COALESCE((
               SELECT sum(round(COALESCE(credit.total_amount, 0) * 100)::bigint)
               FROM public.invoices credit
               WHERE credit.credited_invoice_id = invoice.id
                 AND credit.type = 'credit_note' AND credit.status IN ('sent', 'paid')
             ), 0)
           - COALESCE(sum(allocation.amount_cents), 0)::bigint,
           0
         ) AS outstanding_cents
  FROM public.invoices invoice
  LEFT JOIN public.payment_allocations allocation ON allocation.invoice_id = invoice.id
  WHERE invoice.type = 'invoice'
  GROUP BY invoice.id
)
UPDATE public.invoices invoice
SET paid_amount = balances.paid_cents::numeric / 100,
    outstanding_amount = balances.outstanding_cents::numeric / 100,
    payment_status = CASE
      WHEN balances.outstanding_cents = 0 AND balances.paid_cents > 0 THEN 'paid'
      WHEN balances.paid_cents > 0 THEN 'partially_paid'
      ELSE 'unpaid'
    END,
    updated_at = now()
FROM balances WHERE balances.id = invoice.id;

-- Only the service role may use the canonical payment lifecycle. Existing table
-- RLS remains authoritative for all direct anon/authenticated access.
REVOKE UPDATE (
  request_hash, expected_provider_metadata, provider_status, provider_mode,
  provider_profile_id, provider_created_at, provider_status_at,
  provider_finalized_at, reconciliation_reason, status_version
) ON public.payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments TO service_role;
