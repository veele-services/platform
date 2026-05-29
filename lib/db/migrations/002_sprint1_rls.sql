-- ============================================================================
-- Sprint 1 — Row Level Security (Supabase PostgreSQL)
-- ============================================================================
--
-- Prerequisite: 001_rbac_rls.sql must have been applied first.
-- It defines the is_management() SECURITY DEFINER helper function.
--
-- Apply with:
--   psql $SUPABASE_DB_URL -f lib/db/migrations/002_sprint1_rls.sql
--
-- Authorization model:
--   Management role → full access to all tables
--   Customer users  → SELECT only own customer/object rows (matched by
--                     unique contact_email via JWT); ZERO access to
--                     customer_notes (no SELECT policy defined)
--   Employees       → SELECT their own personnel record (via user_id)
--   All others      → no access to customers, objects, personnel, or notes
--   Sectors/task_codes → SELECT for all authenticated (reference data)
--
-- Internal notes design:
--   `notes` is stored in the `customer_notes` table, not on `customers`.
--   The `customer_notes` table has a management-only RLS policy.
--   Since Supabase RLS is row-level (not column-level), a separate table
--   is the only reliable DB-layer mechanism to prevent customer-portal users
--   from ever accessing internal notes without application filtering.
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

ALTER TABLE customer_notes
  ADD CONSTRAINT customer_notes_updated_by_fkey
  FOREIGN KEY (updated_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_sector_id      ON customers(sector_id);
CREATE INDEX IF NOT EXISTS idx_customers_is_active      ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_contact_email  ON customers(contact_email);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer  ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_objects_customer_id      ON objects(customer_id);
CREATE INDEX IF NOT EXISTS idx_objects_sector_id        ON objects(sector_id);
CREATE INDEX IF NOT EXISTS idx_objects_is_active        ON objects(is_active);
CREATE INDEX IF NOT EXISTS idx_personnel_user_id        ON personnel(user_id);
CREATE INDEX IF NOT EXISTS idx_personnel_role_id        ON personnel(role_id);
CREATE INDEX IF NOT EXISTS idx_personnel_is_active      ON personnel(is_active);
CREATE INDEX IF NOT EXISTS idx_task_codes_sector_id     ON task_codes(sector_id);
CREATE INDEX IF NOT EXISTS idx_task_codes_is_active     ON task_codes(is_active);

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
-- Management: full access.
-- Customer portal users: SELECT own row matched by unique contact_email.
-- (notes column does not exist on this table — see customer_notes below)
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
-- customer_notes  (internal-only — management access enforced at DB level)
-- Management: full access.
-- All other roles: no policy → zero rows returned.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_notes_management ON customer_notes
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

-- ─────────────────────────────────────────────────────────────────────────────
-- objects
-- Management: full access.
-- Customer portal users: SELECT objects belonging to their own customer.
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
