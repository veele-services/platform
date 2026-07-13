-- ============================================================================
-- Assignment personnel tenant invariant
--
-- Forward-only guard: assignment_personnel is parent-bound to assignments and
-- personnel. A link is valid only when both parents exist and share tenant_id.
-- Existing business rows are not modified.
-- ============================================================================

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT count(*)::integer
    INTO mismatch_count
  FROM public.assignment_personnel ap
  LEFT JOIN public.assignments a ON a.id = ap.assignment_id
  LEFT JOIN public.personnel p ON p.id = ap.personnel_id
  WHERE a.tenant_id IS NULL
     OR p.tenant_id IS NULL
     OR a.tenant_id IS DISTINCT FROM p.tenant_id;

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION
      'assignment_personnel tenant invariant preflight failed: % invalid cross-tenant or parentless row(s) exist',
      mismatch_count
      USING ERRCODE = '23514',
            CONSTRAINT = 'assignment_personnel_tenant_match';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_assignment_personnel_tenant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_assignment_tenant_id uuid;
  v_personnel_tenant_id uuid;
BEGIN
  SELECT tenant_id
    INTO v_assignment_tenant_id
  FROM public.assignments
  WHERE id = NEW.assignment_id;

  SELECT tenant_id
    INTO v_personnel_tenant_id
  FROM public.personnel
  WHERE id = NEW.personnel_id;

  IF v_assignment_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'assignment_personnel tenant invariant failed: assignment % is missing',
      NEW.assignment_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'assignment_personnel_tenant_match';
  END IF;

  IF v_personnel_tenant_id IS NULL THEN
    RAISE EXCEPTION
      'assignment_personnel tenant invariant failed: personnel % is missing',
      NEW.personnel_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'assignment_personnel_tenant_match';
  END IF;

  IF v_assignment_tenant_id <> v_personnel_tenant_id THEN
    RAISE EXCEPTION
      'assignment_personnel tenant invariant failed: assignment tenant % does not match personnel tenant %',
      v_assignment_tenant_id,
      v_personnel_tenant_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'assignment_personnel_tenant_match';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignment_personnel_tenant_guard ON public.assignment_personnel;
CREATE TRIGGER assignment_personnel_tenant_guard
  BEFORE INSERT OR UPDATE ON public.assignment_personnel
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assignment_personnel_tenant_guard();

ALTER TABLE public.assignment_personnel ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.trg_assignment_personnel_tenant_guard() FROM PUBLIC, anon, authenticated;

-- Phase A is rollback-safe: keep the existing SELECT grants/policies/helpers
-- intact so an app rollback to the previous release can still read this table.
REVOKE INSERT, UPDATE, DELETE ON public.assignment_personnel FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_personnel TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.pwa_apply_for_assignment(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.pwa_apply_for_assignment(uuid) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
