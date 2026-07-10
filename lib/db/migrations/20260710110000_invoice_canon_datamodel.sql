-- Sprint 1 - Invoice canon datamodel and tenant-scoped numbering foundation.
-- This migration is intentionally idempotent for staging databases that may
-- have a partially repaired invoice schema.

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_invoice_number_unique;

DROP INDEX IF EXISTS public.invoices_invoice_number_unique;
DROP TRIGGER IF EXISTS trg_invoices_set_number ON public.invoices;
DROP FUNCTION IF EXISTS public.fieldgrid_set_invoice_number();
DROP FUNCTION IF EXISTS public.set_invoice_number();

ALTER TABLE public.invoices
  ALTER COLUMN invoice_number DROP NOT NULL,
  ALTER COLUMN invoice_number DROP DEFAULT;

CREATE TABLE IF NOT EXISTS public.tenant_company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_name varchar(200) NOT NULL DEFAULT '',
  trade_name varchar(200),
  address_line_1 text,
  address_line_2 text,
  postal_code varchar(20),
  city varchar(120),
  country varchar(120) NOT NULL DEFAULT 'Nederland',
  kvk_number varchar(20),
  vat_number varchar(30),
  iban varchar(40),
  bic varchar(20),
  administration_email varchar(255),
  phone varchar(40),
  website varchar(255),
  logo_url text,
  primary_color varchar(20) NOT NULL DEFAULT '#081D3A',
  secondary_color varchar(20) NOT NULL DEFAULT '#00B7B3',
  default_payment_term_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_numbering_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  prefix varchar(3) NOT NULL DEFAULT 'FAK',
  format varchar(120) NOT NULL DEFAULT '{PREFIX}-{YYYY}-{NUMBER}',
  separator varchar(8) NOT NULL DEFAULT '-',
  number_padding integer NOT NULL DEFAULT 4,
  reset_period varchar(20) NOT NULL DEFAULT 'yearly',
  default_start_number integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_number_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  numbering_settings_id uuid NOT NULL REFERENCES public.invoice_numbering_settings(id) ON DELETE CASCADE,
  period_key varchar(20) NOT NULL,
  next_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_payment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_provider varchar(20) NOT NULL DEFAULT 'none',
  mollie_enabled boolean NOT NULL DEFAULT false,
  show_payment_link_on_invoice boolean NOT NULL DEFAULT false,
  show_payment_qr_on_invoice boolean NOT NULL DEFAULT false,
  payment_block_title varchar(160) NOT NULL DEFAULT 'Betalen',
  payment_block_text text NOT NULL DEFAULT 'Betaal deze factuur eenvoudig via onderstaande betaallink of scan de QR-code.',
  payment_link_label varchar(80) NOT NULL DEFAULT 'Betaal online',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_template_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  logo_url text,
  primary_color varchar(20) NOT NULL DEFAULT '#081D3A',
  secondary_color varchar(20) NOT NULL DEFAULT '#00B7B3',
  intro_text text,
  footer_text text,
  payment_instruction text NOT NULL DEFAULT 'Gelieve het bedrag binnen {{payment_term_days}} dagen te voldoen onder vermelding van factuurnummer {{invoice_number}}.',
  show_logo boolean NOT NULL DEFAULT true,
  show_company_footer boolean NOT NULL DEFAULT true,
  show_kvk_footer boolean NOT NULL DEFAULT true,
  show_vat_footer boolean NOT NULL DEFAULT true,
  show_iban_footer boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_numbering_settings_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_number_period_key varchar(20),
  ADD COLUMN IF NOT EXISTS invoice_number_sequence_value integer,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS payment_status varchar(20) NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS mollie_payment_id varchar(80),
  ADD COLUMN IF NOT EXISTS payment_url text,
  ADD COLUMN IF NOT EXISTS company_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS invoice_settings_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS payment_settings_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS template_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

CREATE TABLE IF NOT EXISTS public.invoice_line_item_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  source_type varchar(40) NOT NULL,
  source_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  category varchar(40) NOT NULL DEFAULT 'task',
  description text NOT NULL,
  task_code_code varchar(40),
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  vat_percentage numeric(5,2) NOT NULL DEFAULT 21,
  invoiceable boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_company_settings_payment_term_check') THEN
    ALTER TABLE public.tenant_company_settings
      ADD CONSTRAINT tenant_company_settings_payment_term_check
      CHECK (default_payment_term_days BETWEEN 1 AND 365);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_numbering_settings_prefix_check') THEN
    ALTER TABLE public.invoice_numbering_settings
      ADD CONSTRAINT invoice_numbering_settings_prefix_check
      CHECK (prefix ~ '^[A-Z]{3}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_numbering_settings_format_check') THEN
    ALTER TABLE public.invoice_numbering_settings
      ADD CONSTRAINT invoice_numbering_settings_format_check
      CHECK (position('{NUMBER}' in format) > 0 AND position('{PREFIX}' in format) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_numbering_settings_padding_check') THEN
    ALTER TABLE public.invoice_numbering_settings
      ADD CONSTRAINT invoice_numbering_settings_padding_check
      CHECK (number_padding BETWEEN 3 AND 8);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_numbering_settings_start_check') THEN
    ALTER TABLE public.invoice_numbering_settings
      ADD CONSTRAINT invoice_numbering_settings_start_check
      CHECK (default_start_number BETWEEN 1 AND 99999999);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_numbering_settings_reset_check') THEN
    ALTER TABLE public.invoice_numbering_settings
      ADD CONSTRAINT invoice_numbering_settings_reset_check
      CHECK (reset_period IN ('never', 'yearly', 'monthly'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_number_sequences_next_number_check') THEN
    ALTER TABLE public.invoice_number_sequences
      ADD CONSTRAINT invoice_number_sequences_next_number_check
      CHECK (next_number >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_payment_settings_provider_check') THEN
    ALTER TABLE public.invoice_payment_settings
      ADD CONSTRAINT invoice_payment_settings_provider_check
      CHECK (payment_provider IN ('none', 'mollie'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_payment_status_check') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_payment_status_check
      CHECK (payment_status IN ('unpaid', 'open', 'paid', 'cancelled', 'expired', 'failed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_numbering_settings_fkey') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_numbering_settings_fkey
      FOREIGN KEY (invoice_numbering_settings_id)
      REFERENCES public.invoice_numbering_settings(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_company_settings_tenant_idx
  ON public.tenant_company_settings(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_numbering_settings_one_active_per_tenant_idx
  ON public.invoice_numbering_settings(tenant_id)
  WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_number_sequences_tenant_settings_period_idx
  ON public.invoice_number_sequences(tenant_id, numbering_settings_id, period_key);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_payment_settings_tenant_idx
  ON public.invoice_payment_settings(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_template_settings_tenant_idx
  ON public.invoice_template_settings(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_invoice_number_unique_idx
  ON public.invoices(tenant_id, invoice_number)
  WHERE invoice_number IS NOT NULL AND invoice_number <> '';

CREATE INDEX IF NOT EXISTS invoice_numbering_settings_tenant_idx
  ON public.invoice_numbering_settings(tenant_id);
CREATE INDEX IF NOT EXISTS invoice_number_sequences_tenant_idx
  ON public.invoice_number_sequences(tenant_id);
CREATE INDEX IF NOT EXISTS invoice_payment_settings_provider_idx
  ON public.invoice_payment_settings(payment_provider);
CREATE INDEX IF NOT EXISTS invoices_tenant_invoice_date_idx
  ON public.invoices(tenant_id, invoice_date);
CREATE INDEX IF NOT EXISTS invoices_numbering_settings_idx
  ON public.invoices(invoice_numbering_settings_id);
CREATE INDEX IF NOT EXISTS invoice_line_item_snapshots_invoice_idx
  ON public.invoice_line_item_snapshots(invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS invoice_line_item_snapshots_tenant_idx
  ON public.invoice_line_item_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS invoice_line_item_snapshots_source_idx
  ON public.invoice_line_item_snapshots(source_type, source_id);

INSERT INTO public.tenant_company_settings (
  tenant_id,
  legal_name,
  address_line_1,
  kvk_number,
  vat_number,
  administration_email,
  logo_url,
  primary_color,
  secondary_color,
  default_payment_term_days,
  updated_at
)
SELECT
  tenant.id,
  COALESCE(NULLIF(settings.naam, ''), tenant.name, ''),
  settings.adres,
  settings.kvk_nummer,
  settings.btw_nummer,
  COALESCE(settings.email_afzender, settings.smtp_from_email),
  settings.logo_url,
  COALESCE(settings.email_template_brand_color, '#081D3A'),
  COALESCE(settings.email_template_accent_color, '#00B7B3'),
  COALESCE(settings.betaaltermijn_dagen, 30),
  now()
FROM public.tenants tenant
LEFT JOIN public.organization_settings settings ON settings.tenant_id = tenant.id
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.invoice_numbering_settings (tenant_id, prefix, format, separator, number_padding, reset_period, default_start_number, is_active)
SELECT tenant.id, 'FAK', '{PREFIX}-{YYYY}-{NUMBER}', '-', 4, 'yearly', 1, true
FROM public.tenants tenant
ON CONFLICT DO NOTHING;

INSERT INTO public.invoice_payment_settings (tenant_id)
SELECT tenant.id
FROM public.tenants tenant
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.invoice_template_settings (
  tenant_id,
  logo_url,
  primary_color,
  secondary_color,
  footer_text
)
SELECT
  tenant.id,
  settings.logo_url,
  COALESCE(settings.email_template_brand_color, '#081D3A'),
  COALESCE(settings.email_template_accent_color, '#00B7B3'),
  settings.email_template_footer_text
FROM public.tenants tenant
LEFT JOIN public.organization_settings settings ON settings.tenant_id = tenant.id
ON CONFLICT (tenant_id) DO NOTHING;

UPDATE public.invoices invoice
SET
  invoice_date = COALESCE(invoice.invoice_date, invoice.created_at::date),
  payment_status = CASE
    WHEN invoice.status = 'paid' THEN 'paid'
    WHEN invoice.status = 'cancelled' THEN 'cancelled'
    ELSE invoice.payment_status
  END
WHERE invoice.invoice_date IS NULL
   OR (invoice.status IN ('paid', 'cancelled') AND invoice.payment_status = 'unpaid');

UPDATE public.invoices invoice
SET
  invoice_numbering_settings_id = settings.id,
  invoice_number_period_key = COALESCE(
    invoice.invoice_number_period_key,
    EXTRACT(YEAR FROM COALESCE(invoice.invoice_date, invoice.created_at::date, CURRENT_DATE))::text
  ),
  invoice_number_sequence_value = COALESCE(
    invoice.invoice_number_sequence_value,
    NULLIF(substring(invoice.invoice_number from '([0-9]+)$'), '')::integer
  )
FROM public.invoice_numbering_settings settings
WHERE invoice.tenant_id = settings.tenant_id
  AND settings.is_active = true
  AND invoice.invoice_number IS NOT NULL
  AND invoice.invoice_number <> ''
  AND invoice.invoice_numbering_settings_id IS NULL;

INSERT INTO public.invoice_number_sequences (
  tenant_id,
  numbering_settings_id,
  period_key,
  next_number
)
SELECT
  invoice.tenant_id,
  invoice.invoice_numbering_settings_id,
  invoice.invoice_number_period_key,
  GREATEST(MAX(invoice.invoice_number_sequence_value) + 1, MAX(settings.default_start_number))
FROM public.invoices invoice
JOIN public.invoice_numbering_settings settings ON settings.id = invoice.invoice_numbering_settings_id
WHERE invoice.tenant_id IS NOT NULL
  AND invoice.invoice_numbering_settings_id IS NOT NULL
  AND invoice.invoice_number_period_key IS NOT NULL
  AND invoice.invoice_number_sequence_value IS NOT NULL
GROUP BY invoice.tenant_id, invoice.invoice_numbering_settings_id, invoice.invoice_number_period_key
ON CONFLICT (tenant_id, numbering_settings_id, period_key)
DO UPDATE SET
  next_number = GREATEST(public.invoice_number_sequences.next_number, EXCLUDED.next_number),
  updated_at = now();

INSERT INTO public.invoice_number_sequences (
  tenant_id,
  numbering_settings_id,
  period_key,
  next_number
)
SELECT
  settings.tenant_id,
  settings.id,
  EXTRACT(YEAR FROM CURRENT_DATE)::text,
  settings.default_start_number
FROM public.invoice_numbering_settings settings
WHERE settings.is_active = true
ON CONFLICT (tenant_id, numbering_settings_id, period_key) DO NOTHING;
