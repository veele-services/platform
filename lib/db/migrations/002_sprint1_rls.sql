-- ============================================================================
-- Sprint 1 — Row Level Security (Supabase PostgreSQL)
-- ============================================================================
--
-- Prerequisite: 001_rbac_rls.sql must have been applied first.
-- It defines the is_management() SECURITY DEFINER helper function.
--
-- Applied automatically by:
--   pnpm --filter @workspace/db run db:migrate
--
-- Or manually via:
--   psql $SUPABASE_DB_URL -f lib/db/migrations/002_sprint1_rls.sql
--
-- Authorization model:
--   Management role     service_role key bypasses RLS, sees all columns
--   Customer portal     authenticated role, RLS-restricted; notes REVOKED
--   Employees           authenticated role, SELECT own personnel record
--   Sectors/task_codes  SELECT for all authenticated (reference data)
--
-- Notes column strategy:
--   customers.notes exists on the table per spec.
--   Column-level REVOKE prevents authenticated users from reading notes.
--   Backoffice queries use service_role key which ignores RLS/REVOKE.
--   customer_notes table (management-only RLS) provides defense in depth.
-- ============================================================================

-- Column-level privilege: hide customers.notes from authenticated users.
-- Backoffice uses service_role which bypasses this restriction.
REVOKE SELECT (notes) ON customers FROM authenticated;

-- FK constraints to auth.users (cross-schema; cannot be expressed in Drizzle).
-- On re-runs the duplicate_object error is silently handled by db:migrate.
-- On dev Postgres these are skipped because auth.users does not exist.
ALTER TABLE personnel ADD CONSTRAINT personnel_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE customers ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE objects ADD CONSTRAINT objects_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE customer_notes ADD CONSTRAINT customer_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indexes
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

-- sectors: reference data; authenticated users may read, Management may write.
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY sectors_select_authenticated ON sectors FOR SELECT TO authenticated USING (true);
CREATE POLICY sectors_insert_management ON sectors FOR INSERT TO authenticated WITH CHECK (is_management());
CREATE POLICY sectors_update_management ON sectors FOR UPDATE TO authenticated USING (is_management()) WITH CHECK (is_management());
CREATE POLICY sectors_delete_management ON sectors FOR DELETE TO authenticated USING (is_management());

-- customers: Management via service_role (bypasses RLS, sees notes).
-- Customer portal: authenticated role; notes REVOKED at column level above.
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_management ON customers TO authenticated USING (is_management()) WITH CHECK (is_management());
CREATE POLICY customers_select_own ON customers FOR SELECT TO authenticated USING (contact_email = (auth.jwt() ->> 'email'));

-- customer_notes: management-only; defense in depth for internal notes.
-- No SELECT policy for non-management roles means zero rows returned.
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_notes_management ON customer_notes TO authenticated USING (is_management()) WITH CHECK (is_management());

-- objects: Management full; customer SELECT via customer_id subquery.
ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY objects_management ON objects TO authenticated USING (is_management()) WITH CHECK (is_management());
CREATE POLICY objects_select_customer ON objects FOR SELECT TO authenticated USING (customer_id IN (SELECT id FROM customers WHERE contact_email = (auth.jwt() ->> 'email')));

-- personnel: Management full; employees SELECT own record only.
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY personnel_management ON personnel TO authenticated USING (is_management()) WITH CHECK (is_management());
CREATE POLICY personnel_select_own ON personnel FOR SELECT TO authenticated USING (user_id = auth.uid());

-- task_codes: authenticated may read; Management may write.
ALTER TABLE task_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_codes_select_authenticated ON task_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY task_codes_insert_management ON task_codes FOR INSERT TO authenticated WITH CHECK (is_management());
CREATE POLICY task_codes_update_management ON task_codes FOR UPDATE TO authenticated USING (is_management()) WITH CHECK (is_management());
CREATE POLICY task_codes_delete_management ON task_codes FOR DELETE TO authenticated USING (is_management());
