-- ============================================================================
-- RBAC Row Level Security — Supabase PostgreSQL
-- ============================================================================
--
-- Run this migration on the **Supabase PostgreSQL** database after running
-- the Drizzle schema push.  It does NOT run in the Replit development
-- database (which has no auth.uid() / JWT infrastructure).
--
-- Authorization for the Replit dev environment is enforced at the
-- application layer via requirePermission() in server actions (see
-- artifacts/backoffice/src/lib/auth/permissions.ts).
--
-- Apply with:
--   psql $SUPABASE_DB_URL -f lib/db/migrations/001_rbac_rls.sql
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper function — returns true when the calling Supabase Auth user
-- holds the Management role.
-- SECURITY DEFINER runs as the function owner (superuser), not the caller,
-- so it can always read the user_roles/roles tables even when RLS is active.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_management()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
      AND r.name = 'Management'
  )
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- roles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read roles (needed for permission lookups).
CREATE POLICY roles_select_authenticated ON roles
  FOR SELECT
  TO authenticated
  USING (true);

-- Only Management can create / change / delete roles.
CREATE POLICY roles_insert_management ON roles
  FOR INSERT
  TO authenticated
  WITH CHECK (is_management());

CREATE POLICY roles_update_management ON roles
  FOR UPDATE
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

CREATE POLICY roles_delete_management ON roles
  FOR DELETE
  TO authenticated
  USING (is_management());

-- ─────────────────────────────────────────────────────────────────────────────
-- permissions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY permissions_select_authenticated ON permissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY permissions_insert_management ON permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (is_management());

CREATE POLICY permissions_update_management ON permissions
  FOR UPDATE
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

CREATE POLICY permissions_delete_management ON permissions
  FOR DELETE
  TO authenticated
  USING (is_management());

-- ─────────────────────────────────────────────────────────────────────────────
-- role_permissions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_permissions_select_authenticated ON role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY role_permissions_insert_management ON role_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (is_management());

CREATE POLICY role_permissions_update_management ON role_permissions
  FOR UPDATE
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

CREATE POLICY role_permissions_delete_management ON role_permissions
  FOR DELETE
  TO authenticated
  USING (is_management());

-- ─────────────────────────────────────────────────────────────────────────────
-- user_roles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users may read their own role memberships.
CREATE POLICY user_roles_select_own ON user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_management());

-- Only Management may assign / remove roles from users.
CREATE POLICY user_roles_insert_management ON user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (is_management());

CREATE POLICY user_roles_delete_management ON user_roles
  FOR DELETE
  TO authenticated
  USING (is_management());

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_log
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may insert their own audit events.
CREATE POLICY audit_log_insert_authenticated ON audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Only Management may read the audit log.
CREATE POLICY audit_log_select_management ON audit_log
  FOR SELECT
  TO authenticated
  USING (is_management());

-- Audit log rows are immutable — no UPDATE or DELETE policies are defined.
-- Attempts to update/delete will be silently denied by the lack of a policy.
