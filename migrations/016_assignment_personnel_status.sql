-- ============================================================
-- Migration 016: assignment_personnel — status kolom + PWA apply RPC
-- Run this manually in the Supabase SQL Editor.
--
-- Adds:
--   1. status varchar(20) kolom op assignment_personnel
--      'assigned'  = door planner ingedeeld (default voor bestaande rijen)
--      'suggested' = medewerker heeft zich aangemeld via personeels-PWA
--   2. SECURITY DEFINER RPC pwa_apply_for_assignment voor gecontroleerde
--      self-application vanuit de personeels-PWA (bypast RLS).
-- ============================================================

-- ─── 1. Voeg status kolom toe ─────────────────────────────────────────────────

ALTER TABLE assignment_personnel
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'assigned';

-- Voeg CHECK constraint toe voor geldige waarden
ALTER TABLE assignment_personnel
  DROP CONSTRAINT IF EXISTS assignment_personnel_status_check;

ALTER TABLE assignment_personnel
  ADD CONSTRAINT assignment_personnel_status_check
  CHECK (status IN ('assigned', 'suggested', 'declined'));

-- ─── 2. SECURITY DEFINER RPC voor medewerker self-application ─────────────────
-- Medewerkers kunnen zichzelf aanmelden voor planbare opdrachten.
-- De functie verifieert:
--   a. Caller heeft een geldig personeelsprofiel
--   b. Opdracht heeft status 'plannable'
--   c. Medewerker is nog niet gelinkt aan de opdracht

CREATE OR REPLACE FUNCTION pwa_apply_for_assignment(
  p_assignment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_personnel_id uuid;
BEGIN
  -- 1. Resolve caller → personnel id
  SELECT id INTO v_personnel_id
  FROM personnel
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_personnel_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Personeelsprofiel niet gevonden');
  END IF;

  -- 2. Controleer of opdracht nog planbaar is
  IF NOT EXISTS (
    SELECT 1 FROM assignments
    WHERE id = p_assignment_id AND status = 'plannable'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Opdracht is niet meer beschikbaar');
  END IF;

  -- 3. Controleer op dubbele aanmelding
  IF EXISTS (
    SELECT 1 FROM assignment_personnel
    WHERE assignment_id = p_assignment_id
      AND personnel_id  = v_personnel_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'U heeft zich al aangemeld voor deze opdracht');
  END IF;

  -- 4. Voeg toe als kandidaat
  INSERT INTO assignment_personnel (assignment_id, personnel_id, status)
  VALUES (p_assignment_id, v_personnel_id, 'suggested');

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION pwa_apply_for_assignment(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pwa_apply_for_assignment(uuid) TO authenticated;

-- ─── 3. SELECT policy voor planbare opdrachten (openstaand) ───────────────────
-- Medewerkers mogen planbare opdrachten lezen voor de openstaand-pagina.

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignments_select_plannable" ON assignments;
CREATE POLICY "assignments_select_plannable"
  ON assignments FOR SELECT
  TO authenticated
  USING (status = 'plannable' AND is_active = true);
