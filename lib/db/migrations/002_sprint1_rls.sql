-- ============================================================================
-- Sprint 1 — Row Level Security + Portal View (Supabase PostgreSQL)
-- ============================================================================
--
-- Prerequisite: 001_rbac_rls.sql must have been applied first.
-- It defines the is_management() SECURITY DEFINER helper function.
--
-- Apply with:
--   psql $SUPABASE_DB_URL -f lib/db/migrations/002_sprint1_rls.sql
--
-- Authorization model:
--   Management role → full access to all tables (base tables, notes visible)
--   Customer users  → SELECT only via v_customers_portal / v_objects_portal
--                     views which physically exclude the `notes` column.
--                     contact_email unique constraint prevents cross-customer
--                     leakage when matching by JWT email.
--   Employees       → SELECT their own personnel record (via user_id)
--   All others      → no access to customers, objects, or personnel
--   Sectors/task_codes → SELECT for all authenticated (reference data)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- FK constraints to auth.users (cross-schema — cannot be expressed in Drizzle)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE personnel
  ADD CONSTRAINT personnel_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE customers
  ADD CONSTRAINT customers_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE objects
  ADD CONSTRAINT objects_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_sector_id      ON customers(sector_id);
CREATE INDEX IF NOT EXISTS idx_customers_is_active      ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_contact_email  ON customers(contact_email);
CREATE INDEX IF NOT EXISTS idx_objects_customer_id      ON objects(customer_id);
CREATE INDEX IF NOT EXISTS idx_objects_sector_id        ON objects(sector_id);
CREATE INDEX IF NOT EXISTS idx_objects_is_active        ON objects(is_active);
CREATE INDEX IF NOT EXISTS idx_personnel_user_id        ON personnel(user_id);
CREATE INDEX IF NOT EXISTS idx_personnel_role_id        ON personnel(role_id);
CREATE INDEX IF NOT EXISTS idx_personnel_is_active      ON personnel(is_active);
CREATE INDEX IF NOT EXISTS idx_task_codes_sector_id     ON task_codes(sector_id);
CREATE INDEX IF NOT EXISTS idx_task_codes_is_active     ON task_codes(is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- Customer portal views — exclude the internal `notes` column at the DB level.
-- Customer-facing queries MUST use these views; management uses the base tables.
-- SECURITY INVOKER = RLS of the underlying tables still applies to the caller.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_customers_portal
  WITH (security_invoker = true) AS
  SELECT
    id,
    name,
    code,
    sector_id,
    address,
    city,
    postal_code,
    country,
    contact_name,
    contact_email,
    contact_phone,
    is_active,
    created_at,
    updated_at
  FROM customers;

CREATE OR REPLACE VIEW v_objects_portal
  WITH (security_invoker = true) AS
  SELECT
    id,
    customer_id,
    sector_id,
    name,
    code,
    address,
    city,
    postal_code,
    description,
    is_active,
    created_at,
    updated_at
  FROM objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- sectors
-- Public reference data — authenticated users may read; Management may write.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY sectors_select_authenticated ON sectors
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY sectors_insert_management ON sectors
  FOR INSERT TO authenticated
  WITH CHECK (is_management());

CREATE POLICY sectors_update_management ON sectors
  FOR UPDATE TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

CREATE POLICY sectors_delete_management ON sectors
  FOR DELETE TO authenticated
  USING (is_management());

-- ─────────────────────────────────────────────────────────────────────────────
-- customers
-- Base table — Management full access including `notes` column.
-- Customer portal users: access only via v_customers_portal view (no notes).
-- The view has SECURITY INVOKER so these RLS policies still apply to portal
-- queries through the view.
-- contact_email is UNIQUE (schema constraint) — prevents cross-customer leakage.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_management ON customers
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

CREATE POLICY customers_select_own ON customers
  FOR SELECT TO authenticated
  USING (contact_email = (auth.jwt() ->> 'email'));

-- ─────────────────────────────────────────────────────────────────────────────
-- objects
-- Management: full access.
-- Customer portal users: access only via v_objects_portal view.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY objects_management ON objects
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

CREATE POLICY objects_select_customer ON objects
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT id
      FROM   customers
      WHERE  contact_email = (auth.jwt() ->> 'email')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- personnel
-- Management: full access.
-- Employees: SELECT their own record only (WHERE user_id = auth.uid()).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY personnel_management ON personnel
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

CREATE POLICY personnel_select_own ON personnel
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- task_codes
-- All authenticated users may read; only Management may write.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE task_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_codes_select_authenticated ON task_codes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY task_codes_insert_management ON task_codes
  FOR INSERT TO authenticated
  WITH CHECK (is_management());

CREATE POLICY task_codes_update_management ON task_codes
  FOR UPDATE TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

CREATE POLICY task_codes_delete_management ON task_codes
  FOR DELETE TO authenticated
  USING (is_management());
