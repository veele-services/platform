-- Financial hardening for customer payment batches / collective invoices.
-- Existing rows remain valid; defaults make this migration non-breaking.

ALTER TABLE customer_payment_batches
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS object_id uuid REFERENCES objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subtotal_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surcharge_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS customer_payment_batches_period_idx
  ON customer_payment_batches(customer_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS customer_payment_batches_object_idx
  ON customer_payment_batches(object_id);
