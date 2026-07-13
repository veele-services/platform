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

CREATE OR REPLACE FUNCTION public.assignment_personnel_tenant_match(
  p_assignment_id uuid,
  p_personnel_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments a
    JOIN public.personnel p ON p.id = p_personnel_id
    WHERE a.id = p_assignment_id
      AND a.tenant_id = p.tenant_id
  );
$$;

CREATE OR REPLACE FUNCTION public.trg_assignment_personnel_tenant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.can_manage_assignment_personnel(
  p_assignment_id uuid,
  p_personnel_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  WITH jwt_context AS (
    SELECT CASE
      WHEN NULLIF(auth.jwt() ->> 'tenant_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid
      ELSE NULL::uuid
    END AS tenant_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments a
    JOIN jwt_context ctx
      ON ctx.tenant_id = a.tenant_id
    JOIN public.personnel p
      ON p.id = p_personnel_id
     AND p.tenant_id = a.tenant_id
    JOIN public.tenant_users tu
      ON tu.tenant_id = a.tenant_id
     AND tu.user_id = auth.uid()
     AND tu.status = 'active'
    JOIN public.tenant_user_roles tur
      ON tur.tenant_id = a.tenant_id
     AND tur.user_id = auth.uid()
    JOIN public.tenant_roles tr
      ON tr.id = tur.tenant_role_id
     AND tr.tenant_id = a.tenant_id
    JOIN public.tenant_role_permissions trp
      ON trp.tenant_role_id = tr.id
    JOIN public.permissions perm
      ON perm.id = trp.permission_id
    WHERE a.id = p_assignment_id
      AND perm.resource = 'assignments'
      AND perm.action = 'write'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_select_own_assignment_personnel(
  p_assignment_id uuid,
  p_personnel_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments a
    JOIN public.personnel p
      ON p.id = p_personnel_id
     AND p.tenant_id = a.tenant_id
    WHERE a.id = p_assignment_id
      AND p.user_id = auth.uid()
      AND p.is_active = true
  );
$$;

ALTER TABLE public.assignment_personnel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assignment_personnel_management_all ON public.assignment_personnel;
DROP POLICY IF EXISTS assignment_personnel_tenant_management_all ON public.assignment_personnel;

DROP POLICY IF EXISTS assignment_personnel_own_select ON public.assignment_personnel;
CREATE POLICY assignment_personnel_own_select
  ON public.assignment_personnel
  FOR SELECT
  TO authenticated
  USING (
    public.can_select_own_assignment_personnel(assignment_id, personnel_id)
  );

REVOKE ALL ON FUNCTION public.assignment_personnel_tenant_match(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_assignment_personnel_tenant_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_assignment_personnel(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_select_own_assignment_personnel(uuid, uuid) FROM PUBLIC;

REVOKE INSERT, UPDATE, DELETE ON public.assignment_personnel FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.assignment_personnel TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_personnel TO service_role;

GRANT EXECUTE ON FUNCTION public.can_manage_assignment_personnel(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_select_own_assignment_personnel(uuid, uuid) TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.pwa_apply_for_assignment(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.pwa_apply_for_assignment(uuid) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
