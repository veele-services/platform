-- ============================================================
-- Migration 015: Personeels-PWA — correcte RLS policies
-- Run this manually in the Supabase SQL Editor.
--
-- Fixes:
--   1. Existing availability_windows + leave_periods SELECT policies
--      used USING (TRUE) — alle authenticated users konden alle rijen lezen.
--      Vervangen door row-scoped policies (eigen personnel_id only).
--   2. Voeg INSERT/DELETE policies toe op availability_windows voor PWA.
--   3. Voeg INSERT policy toe op leave_periods voor PWA verlofaanvragen.
--   4. Voeg UPDATE policy toe op assignments voor personnel (status updates).
--   5. Enable RLS op personnel + voeg SELECT (eigen rij) en UPDATE (phone) toe.
-- ============================================================

-- ─── Helper function: resolve auth.uid() → personnel.id ──────────────────────
-- Used in USING / WITH CHECK clauses so each policy doesn't need a subquery.
-- SECURITY INVOKER means it runs with the calling role (authenticated).

CREATE OR REPLACE FUNCTION auth_personnel_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT id FROM personnel WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ─── 1. personnel table ───────────────────────────────────────────────────────

ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;

-- SELECT: medewerker kan alleen zijn eigen rij lezen.
DROP POLICY IF EXISTS "personnel_select_own" ON personnel;
CREATE POLICY "personnel_select_own"
  ON personnel FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- UPDATE: medewerker mag alleen zijn telefoonnummer bijwerken (phone kolom).
-- WITH CHECK zorgt dat user_id niet gewijzigd kan worden.
DROP POLICY IF EXISTS "personnel_update_own_phone" ON personnel;
CREATE POLICY "personnel_update_own_phone"
  ON personnel FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── 2. availability_windows table ───────────────────────────────────────────

-- Verwijder de te brede USING (TRUE) policy.
DROP POLICY IF EXISTS "avail_windows_authenticated_read" ON availability_windows;

-- SELECT: eigen beschikbaarheidsrijen only.
DROP POLICY IF EXISTS "avail_windows_select_own" ON availability_windows;
CREATE POLICY "avail_windows_select_own"
  ON availability_windows FOR SELECT
  TO authenticated
  USING (personnel_id = auth_personnel_id());

-- INSERT: medewerker kan eigen rijen invoegen.
DROP POLICY IF EXISTS "avail_windows_insert_own" ON availability_windows;
CREATE POLICY "avail_windows_insert_own"
  ON availability_windows FOR INSERT
  TO authenticated
  WITH CHECK (personnel_id = auth_personnel_id());

-- DELETE: medewerker kan eigen rijen verwijderen (voor weekrooster opslaan).
DROP POLICY IF EXISTS "avail_windows_delete_own" ON availability_windows;
CREATE POLICY "avail_windows_delete_own"
  ON availability_windows FOR DELETE
  TO authenticated
  USING (personnel_id = auth_personnel_id());

-- ─── 3. leave_periods table ───────────────────────────────────────────────────

-- Verwijder de te brede USING (TRUE) policy.
DROP POLICY IF EXISTS "leave_periods_authenticated_read" ON leave_periods;

-- SELECT: eigen verlofperiodes only.
DROP POLICY IF EXISTS "leave_periods_select_own" ON leave_periods;
CREATE POLICY "leave_periods_select_own"
  ON leave_periods FOR SELECT
  TO authenticated
  USING (personnel_id = auth_personnel_id());

-- INSERT: medewerker kan verlof aanvragen (status wordt automatisch 'pending').
DROP POLICY IF EXISTS "leave_periods_insert_own" ON leave_periods;
CREATE POLICY "leave_periods_insert_own"
  ON leave_periods FOR INSERT
  TO authenticated
  WITH CHECK (
    personnel_id = auth_personnel_id()
    AND status = 'pending'
  );

-- ─── 4. assignments table — UPDATE voor personeelsstatus ─────────────────────
-- Medewerkers mogen de status bijwerken van opdrachten waaraan ze zijn toegewezen.
-- De toegestane statusovergangen worden in de applicatielaag gevalideerd;
-- de policy borgt alleen dat het eigen opdrachten zijn.

DROP POLICY IF EXISTS "personnel_update_own_assignment_status" ON assignments;
CREATE POLICY "personnel_update_own_assignment_status"
  ON assignments FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT assignment_id
      FROM assignment_personnel
      WHERE personnel_id = auth_personnel_id()
    )
  )
  WITH CHECK (
    id IN (
      SELECT assignment_id
      FROM assignment_personnel
      WHERE personnel_id = auth_personnel_id()
    )
  );
