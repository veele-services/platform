-- Fieldgrid invoice canon completion before final acceptance sprint.
-- Adds document-type numbering, credit notes, payment allocations and collection invoice snapshots.

ALTER TABLE public.invoice_numbering_settings
  ADD COLUMN IF NOT EXISTS document_type varchar(40) NOT NULL DEFAULT 'invoice';

ALTER TABLE public.invoice_number_sequences
  ADD COLUMN IF NOT EXISTS document_type varchar(40) NOT NULL DEFAULT 'invoice';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'invoice_numbering_settings'
      AND indexname = 'invoice_numbering_settings_one_active_per_tenant_idx'
  ) THEN
    DROP INDEX public.invoice_numbering_settings_one_active_per_tenant_idx;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_numbering_settings_one_active_per_tenant_idx
  ON public.invoice_numbering_settings (tenant_id, document_type)
  WHERE is_active = true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'invoice_number_sequences'
      AND indexname = 'invoice_number_sequences_tenant_settings_period_idx'
  ) THEN
    DROP INDEX public.invoice_number_sequences_tenant_settings_period_idx;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_number_sequences_tenant_settings_period_idx
  ON public.invoice_number_sequences (tenant_id, numbering_settings_id, document_type, period_key);

INSERT INTO public.invoice_numbering_settings (
  tenant_id,
  document_type,
  prefix,
  format,
  separator,
  number_padding,
  reset_period,
  default_start_number,
  is_active
)
SELECT tenant_id, 'credit_note', 'CRD', '{PREFIX}-{YYYY}-{NUMBER}', '-', 4, 'yearly', 1, true
FROM (SELECT DISTINCT tenant_id FROM public.invoice_numbering_settings WHERE tenant_id IS NOT NULL) tenants
WHERE NOT EXISTS (
  SELECT 1
  FROM public.invoice_numbering_settings existing
  WHERE existing.tenant_id = tenants.tenant_id
    AND existing.document_type = 'credit_note'
    AND existing.is_active = true
);

INSERT INTO public.invoice_numbering_settings (
  tenant_id,
  document_type,
  prefix,
  format,
  separator,
  number_padding,
  reset_period,
  default_start_number,
  is_active
)
SELECT tenant_id, 'invoice_collection', 'VZF', '{PREFIX}-{YYYY}-{NUMBER}', '-', 4, 'yearly', 1, true
FROM (SELECT DISTINCT tenant_id FROM public.invoice_numbering_settings WHERE tenant_id IS NOT NULL) tenants
WHERE NOT EXISTS (
  SELECT 1
  FROM public.invoice_numbering_settings existing
  WHERE existing.tenant_id = tenants.tenant_id
    AND existing.document_type = 'invoice_collection'
    AND existing.is_active = true
);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS type varchar(40) NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS credited_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_reason text,
  ADD COLUMN IF NOT EXISTS original_invoice_number_snapshot varchar(30),
  ADD COLUMN IF NOT EXISTS collection_status varchar(40) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

DO $$
BEGIN
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_type_check;
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_type_check
    CHECK (type IN ('invoice', 'credit_note'));

  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_status_check
    CHECK (payment_status IN ('unpaid', 'open', 'partially_paid', 'paid', 'overdue', 'cancelled', 'expired', 'failed'));

  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_collection_status_check;
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_collection_status_check
    CHECK (collection_status IN ('none', 'collected', 'collection_partially_paid', 'collection_paid', 'collection_cancelled'));
END $$;

CREATE INDEX IF NOT EXISTS invoices_tenant_type_status_idx ON public.invoices (tenant_id, type, status);
CREATE INDEX IF NOT EXISTS invoices_tenant_payment_status_idx ON public.invoices (tenant_id, payment_status);
CREATE INDEX IF NOT EXISTS invoices_credited_invoice_idx ON public.invoices (credited_invoice_id);

UPDATE public.invoices
SET payment_status = CASE
      WHEN status = 'paid' THEN 'paid'
      WHEN status = 'cancelled' THEN 'cancelled'
      WHEN payment_status IS NULL THEN 'unpaid'
      ELSE payment_status
    END,
    paid_amount = CASE WHEN status = 'paid' THEN total_amount ELSE COALESCE(paid_amount, 0) END,
    outstanding_amount = CASE WHEN status = 'paid' THEN 0 ELSE COALESCE(outstanding_amount, total_amount, 0) END,
    collection_status = COALESCE(collection_status, 'none')
WHERE true;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_type varchar(40) NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_method varchar(40) NOT NULL DEFAULT 'mollie',
  ADD COLUMN IF NOT EXISTS reference varchar(120),
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS registered_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.payments
  ALTER COLUMN invoice_id DROP NOT NULL,
  ALTER COLUMN mollie_payment_id DROP NOT NULL;

UPDATE public.payments payment
SET customer_id = invoice.customer_id,
    tenant_id = COALESCE(payment.tenant_id, invoice.tenant_id),
    source_type = COALESCE(payment.source_type, 'invoice'),
    source_id = COALESCE(payment.source_id, payment.invoice_id),
    amount = COALESCE(payment.amount, round((payment.amount_cents::numeric / 100), 2)),
    payment_method = COALESCE(payment.payment_method, 'mollie')
FROM public.invoices invoice
WHERE payment.invoice_id = invoice.id;

DO $$
BEGIN
  ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_source_type_check;
  ALTER TABLE public.payments ADD CONSTRAINT payments_source_type_check
    CHECK (source_type IN ('invoice', 'invoice_collection'));

  ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
  ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check
    CHECK (payment_method IN ('mollie', 'manual_bank', 'cash', 'correction', 'settlement', 'other'));
END $$;

CREATE INDEX IF NOT EXISTS payments_tenant_customer_idx ON public.payments (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS payments_tenant_source_idx ON public.payments (tenant_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  amount numeric(12,2) NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  allocated_by_user_id uuid,
  note text
);

CREATE INDEX IF NOT EXISTS payment_allocations_tenant_idx ON public.payment_allocations (tenant_id);
CREATE INDEX IF NOT EXISTS payment_allocations_tenant_payment_idx ON public.payment_allocations (tenant_id, payment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_tenant_invoice_idx ON public.payment_allocations (tenant_id, invoice_id);

INSERT INTO public.payment_allocations (tenant_id, payment_id, invoice_id, amount_cents, amount, allocated_at, note)
SELECT payment.tenant_id, payment.id, payment.invoice_id, payment.amount_cents, round((payment.amount_cents::numeric / 100), 2), COALESCE(payment.paid_at, payment.created_at), 'Backfill bestaande factuurbetaling'
FROM public.payments payment
WHERE payment.invoice_id IS NOT NULL
  AND payment.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_allocations allocation
    WHERE allocation.payment_id = payment.id
      AND allocation.invoice_id = payment.invoice_id
  );

ALTER TABLE public.customer_payment_batches
  ADD COLUMN IF NOT EXISTS collection_number varchar(30),
  ADD COLUMN IF NOT EXISTS numbering_settings_id uuid REFERENCES public.invoice_numbering_settings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS number_period_key varchar(20),
  ADD COLUMN IF NOT EXISTS number_sequence_value integer,
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_provider varchar(40) NOT NULL DEFAULT 'mollie',
  ADD COLUMN IF NOT EXISTS company_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS invoice_settings_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS payment_settings_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS template_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS created_by_actor_type varchar(40) NOT NULL DEFAULT 'tenant_user',
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.customer_payment_batches
  ALTER COLUMN mollie_payment_id DROP NOT NULL;

UPDATE public.customer_payment_batches
SET outstanding_amount_cents = CASE WHEN status = 'paid' THEN 0 ELSE amount_cents END,
    paid_amount_cents = CASE WHEN status = 'paid' THEN amount_cents ELSE COALESCE(paid_amount_cents, 0) END
WHERE true;

CREATE INDEX IF NOT EXISTS customer_payment_batches_tenant_numbering_idx
  ON public.customer_payment_batches (tenant_id, numbering_settings_id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_payment_batches_tenant_collection_number_idx
  ON public.customer_payment_batches (tenant_id, collection_number)
  WHERE collection_number IS NOT NULL AND collection_number <> '';

ALTER TABLE public.customer_payment_batch_items
  ADD COLUMN IF NOT EXISTS invoice_number_snapshot varchar(30),
  ADD COLUMN IF NOT EXISTS invoice_date_snapshot date,
  ADD COLUMN IF NOT EXISTS due_date_snapshot date,
  ADD COLUMN IF NOT EXISTS original_total_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount_at_collection_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_amount_at_collection_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE public.customer_payment_batch_items item
SET invoice_number_snapshot = COALESCE(item.invoice_number_snapshot, invoice.invoice_number),
    invoice_date_snapshot = COALESCE(item.invoice_date_snapshot, invoice.invoice_date),
    due_date_snapshot = COALESCE(item.due_date_snapshot, invoice.due_date),
    original_total_amount_cents = CASE
      WHEN item.original_total_amount_cents = 0 THEN round(COALESCE(invoice.total_amount, 0)::numeric * 100)::int
      ELSE item.original_total_amount_cents
    END,
    outstanding_amount_at_collection_cents = CASE
      WHEN item.outstanding_amount_at_collection_cents = 0 THEN item.amount_cents
      ELSE item.outstanding_amount_at_collection_cents
    END,
    included_amount_cents = CASE
      WHEN item.included_amount_cents = 0 THEN item.amount_cents
      ELSE item.included_amount_cents
    END
FROM public.invoices invoice
WHERE item.invoice_id = invoice.id;

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_allocations'
      AND policyname = 'payment_allocations_service_role'
  ) THEN
    CREATE POLICY payment_allocations_service_role
      ON public.payment_allocations
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
