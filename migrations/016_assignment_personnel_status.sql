-- ============================================================
-- Migration 016: assignment_personnel — status kolom + PWA apply RPC
-- Run this manually in the Supabase SQL Editor.
--
-- Adds:
--   1. status varchar(20) kolom op assignment_personnel
--      'assigned'  = door planner ingedeeld (default voor bestaande rijen)
--      'suggested' = medewerker heeft zich aangemeld via personeels-PWA
--      'declined'  = planner heeft de aanmelding afgewezen
--   2. SECURITY DEFINER RPC pwa_apply_for_assignment voor gecontroleerde
--      self-application vanuit de personeels-PWA (bypast RLS).
--
-- NOTE: de openstaande opdrachten worden server-side gefetcht via de
-- Drizzle service-role connection (bypass RLS) — er is GEEN extra
-- SELECT-policy voor planbare opdrachten nodig. Toevoegen van zo'n
-- policy zou toegang breder trekken dan 'least privilege' vereist.
-- ============================================================

-- ─── 1. Voeg status kolom toe ─────────────────────────────────────────────────

ALTER TABLE assignment_personnel
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'assigned';

ALTER TABLE assignment_personnel
  DROP CONSTRAINT IF EXISTS assignment_personnel_status_check;

ALTER TABLE assignment_personnel
  ADD CONSTRAINT assignment_personnel_status_check
  CHECK (status IN ('assigned', 'suggested', 'declined'));

-- ─── 2. Patch pwa_set_assignment_status (migration 015) ───────────────────────
-- The original RPC only checks that an assignment_personnel row EXISTS.
-- With the new 'suggested' status, that check is too broad — a worker who
-- self-applied but hasn't been confirmed by the planner would also pass.
-- Replace the existence check with: EXISTS ... AND status = 'assigned'.

CREATE OR REPLACE FUNCTION pwa_set_assignment_status(
  p_assignment_id uuid,
  p_new_status    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_personnel_id  uuid;
  v_current_status text;
  v_allowed        text[];
BEGIN
  SELECT id INTO v_personnel_id
  FROM personnel
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_personnel_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Personeelsprofiel niet gevonden');
  END IF;

  -- Only confirmed (assigned) links allow status mutations — not self-application suggestions
  IF NOT EXISTS (
    SELECT 1 FROM assignment_personnel
    WHERE assignment_id = p_assignment_id
      AND personnel_id  = v_personnel_id
      AND status        = 'assigned'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Opdracht niet gevonden of nog niet bevestigd door de planner');
  END IF;

  SELECT status INTO v_current_status
  FROM assignments
  WHERE id = p_assignment_id;

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

  UPDATE assignments
  SET status     = p_new_status,
      updated_at = now()
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION pwa_set_assignment_status(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pwa_set_assignment_status(uuid, text) TO authenticated;

-- ─── 3. SECURITY DEFINER RPC voor medewerker self-application ─────────────────
-- Alternatieve weg naast de Drizzle service-role insert.
-- Wordt niet actief gebruikt door de PWA (die gebruikt de service-role
-- Drizzle client direct), maar staat beschikbaar voor toekomstige
-- PostgREST / edge-function implementaties.

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
  SELECT id INTO v_personnel_id
  FROM personnel
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_personnel_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Personeelsprofiel niet gevonden');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM assignments
    WHERE id = p_assignment_id AND status = 'plannable'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Opdracht is niet meer beschikbaar');
  END IF;

  IF EXISTS (
    SELECT 1 FROM assignment_personnel
    WHERE assignment_id = p_assignment_id
      AND personnel_id  = v_personnel_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'U heeft zich al aangemeld voor deze opdracht');
  END IF;

  INSERT INTO assignment_personnel (assignment_id, personnel_id, status)
  VALUES (p_assignment_id, v_personnel_id, 'suggested');

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION pwa_apply_for_assignment(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pwa_apply_for_assignment(uuid) TO authenticated;
