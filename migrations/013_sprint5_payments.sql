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

-- Authenticated users can only read payment records for invoices they own.
-- Ownership is determined by the invoice's created_by field matching the
-- current user, or by being in the same organization (staff/management).
-- For now we scope to: invoice.created_by = auth.uid()
-- OR the user has a management/admin role (checked via user_roles table).
CREATE POLICY "owner_or_staff_read_payments"
  ON payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = payments.invoice_id
        AND (
          invoices.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('management', 'administration', 'planning', 'support')
          )
        )
    )
  );

-- Service role has full access (used by webhook and server actions)
CREATE POLICY "service_role_all_payments"
  ON payments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
