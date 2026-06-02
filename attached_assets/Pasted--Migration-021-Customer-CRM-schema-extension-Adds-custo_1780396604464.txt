-- Migration 021: Customer CRM schema extension
-- Adds: customer_types, customer_contacts tables
--       extended columns on customers (legalEntity, vatNumber, chamberOfCommerceNumber,
--       website, mobile, customerTypeId, status, accountManagerId)

-- ─── customer_types ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_types (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID,                           -- reserved for multi-tenancy (nullable for now)
  name       VARCHAR(100) NOT NULL,
  slug       VARCHAR(100) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)                   -- scoped unique: null tenant = platform-wide
);

-- Seed with common types (platform-wide, no tenant)
INSERT INTO customer_types (name, slug) VALUES
  ('Zakelijk',       'zakelijk'),
  ('Particulier',    'particulier'),
  ('Overheid',       'overheid'),
  ('Non-profit',     'non-profit'),
  ('Intern',         'intern')
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- ─── customers — new columns ──────────────────────────────────────────────────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS legal_entity              VARCHAR(255),
  ADD COLUMN IF NOT EXISTS vat_number                VARCHAR(50),
  ADD COLUMN IF NOT EXISTS chamber_of_commerce_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS website                   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mobile                    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS customer_type_id          UUID REFERENCES customer_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status                    VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS account_manager_id        UUID REFERENCES personnel(id) ON DELETE SET NULL;

-- Set status based on existing is_active flag
UPDATE customers SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;

-- ─── customer_contacts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_contacts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  first_name           VARCHAR(100) NOT NULL,
  last_name            VARCHAR(100) NOT NULL,
  function             VARCHAR(100),
  email                VARCHAR(255),
  phone                VARCHAR(50),
  mobile               VARCHAR(50),
  preferred_comm       VARCHAR(20),
  is_emergency_contact BOOLEAN NOT NULL DEFAULT false,
  is_primary           BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── RLS policies ─────────────────────────────────────────────────────────────

ALTER TABLE customer_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

-- customer_types: read-only for authenticated users; writes via service_role (admin client)
-- service_role always bypasses RLS, so no write policy is needed.
CREATE POLICY "customer_types_select_authenticated"
  ON customer_types FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- customer_contacts: full access restricted to authenticated backoffice sessions.
-- The backoffice uses the service_role (admin client) for mutations, so only a read
-- policy is required here. If the customer PWA ever reads contacts, extend to their
-- own customer_id via a separate policy.
CREATE POLICY "customer_contacts_select_authenticated"
  ON customer_contacts FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_status              ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_customer_type_id    ON customers(customer_type_id);
CREATE INDEX IF NOT EXISTS idx_customers_account_manager_id  ON customers(account_manager_id);
CREATE INDEX IF NOT EXISTS idx_customer_types_tenant_id      ON customer_types(tenant_id);
