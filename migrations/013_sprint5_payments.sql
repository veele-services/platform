-- ─── Sprint 5: Payments table (Mollie) ────────────────────────────────────────
--
-- Stores Mollie payment transactions linked to invoices.
-- Status is updated via the POST /api/webhooks/mollie endpoint.
--
-- Run this in the Supabase SQL Editor (TCP is blocked in Replit).

CREATE TABLE IF NOT EXISTS payments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  mollie_payment_id VARCHAR(50) NOT NULL UNIQUE,
  amount_cents     INTEGER     NOT NULL,
  currency         VARCHAR(3)  NOT NULL DEFAULT 'EUR',
  status           VARCHAR(20) NOT NULL DEFAULT 'open',
  checkout_url     TEXT,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id
  ON payments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_mollie_payment_id
  ON payments(mollie_payment_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Authenticated users (backoffice staff) can read payment records
CREATE POLICY "authenticated_read_payments"
  ON payments
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Service role has full access (used by webhook and server actions)
CREATE POLICY "service_role_all_payments"
  ON payments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
