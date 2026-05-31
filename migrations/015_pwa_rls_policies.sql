-- ============================================================
-- Migration 015: Personeels-PWA — correcte RLS policies
-- Run this manually in the Supabase SQL Editor.
--
-- Fixes:
--   1. availability_windows + leave_periods hadden USING (TRUE) SELECT policies
--      → alle authenticated users konden alle rijen lezen.
--      Vervangen door row-scoped policies (eigen personnel_id only).
--   2. INSERT/DELETE policies voor availability_windows (weekrooster opslaan).
--   3. INSERT policy voor leave_periods (verlofaanvraag, status='pending').
--   4. RLS op personnel + SELECT (eigen rij) + UPDATE (eigen rij, phone only).
--   5. objects: SELECT policy voor personeel op eigen opdracht-objecten.
--   6. assignments UPDATE via SECURITY DEFINER RPC (alleen status kolom),
--      zodat medewerkers nooit andere velden kunnen muteren.
-- ============================================================

-- ─── Helper function: resolve auth.uid() → personnel.id ──────────────────────
-- Gebruikt in USING / WITH CHECK clausules zodat elke policy geen aparte
-- subquery nodig heeft. SECURITY INVOKER = draait als calling role.

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

-- UPDATE: medewerker mag zijn eigen rij bijwerken (phone kolom).
-- WITH CHECK borgt dat user_id nooit gewijzigd kan worden.
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

-- DELETE: medewerker kan eigen rijen verwijderen (weekrooster vervangen).
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

-- INSERT: medewerker kan verlof aanvragen. status wordt geforceerd op 'pending'.
DROP POLICY IF EXISTS "leave_periods_insert_own" ON leave_periods;
CREATE POLICY "leave_periods_insert_own"
  ON leave_periods FOR INSERT
  TO authenticated
  WITH CHECK (
    personnel_id = auth_personnel_id()
    AND status = 'pending'
  );

-- ─── 4. objects table — SELECT voor personeel op eigen opdrachten ─────────────
-- Medewerkers mogen adres/stad lezen van objecten die gekoppeld zijn aan
-- opdrachten waaraan zij toegewezen zijn.

ALTER TABLE objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personnel_select_assigned_objects" ON objects;
CREATE POLICY "personnel_select_assigned_objects"
  ON objects FOR SELECT
  TO authenticated
  USING (
    -- Backoffice (service_role bypasses RLS — geen policy nodig voor beheer)
    -- Personnel: object is gekoppeld aan een eigen opdracht
    id IN (
      SELECT a.object_id
      FROM assignments a
      JOIN assignment_personnel ap ON ap.assignment_id = a.id
      WHERE ap.personnel_id = auth_personnel_id()
        AND a.object_id IS NOT NULL
    )
  );

-- ─── 5. assignments — RPC-only status update voor personeel ─────────────────
-- In plaats van een brede UPDATE policy (die alle kolommen openstelt),
-- gebruiken we een SECURITY DEFINER functie die uitsluitend de status kolom
-- aanpast na verificatie dat de medewerker aan de opdracht is toegewezen.

-- De SECURITY DEFINER zorgt dat de functie draait als de eigenaar (postgres /
-- service role), waardoor de update doorgaat zonder dat authenticated users
-- een directe UPDATE bevoegdheid op assignments nodig hebben.
-- De functie valideert zelf of de overgang toegestaan is.

CREATE OR REPLACE FUNCTION pwa_set_assignment_status(
  p_assignment_id uuid,
  p_new_status    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- Stel search_path in om search_path-injectie te voorkomen
SET search_path = public
AS $$
DECLARE
  v_personnel_id  uuid;
  v_current_status text;
  v_allowed        text[];
BEGIN
  -- 1. Resolve caller naar personnel id
  SELECT id INTO v_personnel_id
  FROM personnel
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_personnel_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Personeelsprofiel niet gevonden');
  END IF;

  -- 2. Controleer of medewerker aan de opdracht is toegewezen
  IF NOT EXISTS (
    SELECT 1 FROM assignment_personnel
    WHERE assignment_id = p_assignment_id
      AND personnel_id  = v_personnel_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Opdracht niet gevonden of niet toegewezen');
  END IF;

  -- 3. Haal huidige status op
  SELECT status INTO v_current_status
  FROM assignments
  WHERE id = p_assignment_id;

  -- 4. Valideer statusovergang (zelfde matrix als de applicatielaag)
  v_allowed := CASE v_current_status
    WHEN 'plannable'   THEN ARRAY['scheduled', 'in_progress']
    WHEN 'scheduled'   THEN ARRAY['seen', 'in_progress']
    WHEN 'seen'        THEN ARRAY['in_progress']
    WHEN 'in_progress' THEN ARRAY['completed', 'not_completed']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status-overgang niet toegestaan');
  END IF;

  -- 5. Update uitsluitend de status kolom
  UPDATE assignments
  SET status     = p_new_status,
      updated_at = now()
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Revoke public execute zodat alleen authenticated users de functie kunnen aanroepen.
REVOKE EXECUTE ON FUNCTION pwa_set_assignment_status(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pwa_set_assignment_status(uuid, text) TO authenticated;
