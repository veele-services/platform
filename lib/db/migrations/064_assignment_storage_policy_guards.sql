-- ============================================================================
-- Phase 3 assignment storage policy guard refinement
--
-- Replaces the transitional assignment-photo storage policies from migration 063
-- with helper functions that safely parse both legacy and canonical paths without
-- unsafe UUID casts.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.fieldgrid_storage_assignment_id_from_path(p_name text)
    RETURNS uuid
    LANGUAGE sql
    STABLE
    SET search_path = public, storage
    AS $body$
      WITH folders AS (
        SELECT storage.foldername(p_name) AS parts
      )
      SELECT CASE
        WHEN parts[1] = 'tenant'
          AND parts[3] = 'assignments'
          AND parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN parts[4]::uuid
        WHEN parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN parts[1]::uuid
        ELSE NULL
      END
      FROM folders;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.fieldgrid_storage_tenant_id_from_path(p_name text)
    RETURNS uuid
    LANGUAGE sql
    STABLE
    SET search_path = public, storage
    AS $body$
      WITH folders AS (
        SELECT storage.foldername(p_name) AS parts
      )
      SELECT CASE
        WHEN parts[1] = 'tenant'
          AND parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN parts[2]::uuid
        ELSE NULL
      END
      FROM folders;
    $body$;
  $fn$;

  REVOKE ALL ON FUNCTION public.fieldgrid_storage_assignment_id_from_path(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fieldgrid_storage_assignment_id_from_path(text) TO authenticated;

  REVOKE ALL ON FUNCTION public.fieldgrid_storage_tenant_id_from_path(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.fieldgrid_storage_tenant_id_from_path(text) TO authenticated;

  EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel ON storage.objects';
  EXECUTE '
    CREATE POLICY assignment_photos_assigned_personnel ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = ''assignment-photos''
      AND EXISTS (
        SELECT 1
        FROM assignment_personnel ap
        JOIN assignments a ON a.id = ap.assignment_id
        JOIN personnel p ON p.id = ap.personnel_id
        WHERE ap.assignment_id = public.fieldgrid_storage_assignment_id_from_path(name)
          AND ap.status = ''assigned''
          AND p.user_id = (SELECT auth.uid())
          AND p.is_active = true
          AND a.tenant_id = p.tenant_id
          AND (
            public.fieldgrid_storage_tenant_id_from_path(name) IS NULL
            OR public.fieldgrid_storage_tenant_id_from_path(name) = a.tenant_id
          )
      )
    )
  ';

  EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel_insert ON storage.objects';
  EXECUTE '
    CREATE POLICY assignment_photos_assigned_personnel_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = ''assignment-photos''
      AND EXISTS (
        SELECT 1
        FROM assignment_personnel ap
        JOIN assignments a ON a.id = ap.assignment_id
        JOIN personnel p ON p.id = ap.personnel_id
        WHERE ap.assignment_id = public.fieldgrid_storage_assignment_id_from_path(name)
          AND ap.status = ''assigned''
          AND p.user_id = (SELECT auth.uid())
          AND p.is_active = true
          AND a.tenant_id = p.tenant_id
          AND (
            public.fieldgrid_storage_tenant_id_from_path(name) IS NULL
            OR public.fieldgrid_storage_tenant_id_from_path(name) = a.tenant_id
          )
      )
    )
  ';

  EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel_update ON storage.objects';
  EXECUTE '
    CREATE POLICY assignment_photos_assigned_personnel_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = ''assignment-photos''
      AND EXISTS (
        SELECT 1
        FROM assignment_personnel ap
        JOIN assignments a ON a.id = ap.assignment_id
        JOIN personnel p ON p.id = ap.personnel_id
        WHERE ap.assignment_id = public.fieldgrid_storage_assignment_id_from_path(name)
          AND ap.status = ''assigned''
          AND p.user_id = (SELECT auth.uid())
          AND p.is_active = true
          AND a.tenant_id = p.tenant_id
          AND (
            public.fieldgrid_storage_tenant_id_from_path(name) IS NULL
            OR public.fieldgrid_storage_tenant_id_from_path(name) = a.tenant_id
          )
      )
    )
    WITH CHECK (
      bucket_id = ''assignment-photos''
      AND EXISTS (
        SELECT 1
        FROM assignment_personnel ap
        JOIN assignments a ON a.id = ap.assignment_id
        JOIN personnel p ON p.id = ap.personnel_id
        WHERE ap.assignment_id = public.fieldgrid_storage_assignment_id_from_path(name)
          AND ap.status = ''assigned''
          AND p.user_id = (SELECT auth.uid())
          AND p.is_active = true
          AND a.tenant_id = p.tenant_id
          AND (
            public.fieldgrid_storage_tenant_id_from_path(name) IS NULL
            OR public.fieldgrid_storage_tenant_id_from_path(name) = a.tenant_id
          )
      )
    )
  ';

  EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel_delete ON storage.objects';
  EXECUTE '
    CREATE POLICY assignment_photos_assigned_personnel_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = ''assignment-photos''
      AND EXISTS (
        SELECT 1
        FROM assignment_personnel ap
        JOIN assignments a ON a.id = ap.assignment_id
        JOIN personnel p ON p.id = ap.personnel_id
        WHERE ap.assignment_id = public.fieldgrid_storage_assignment_id_from_path(name)
          AND ap.status = ''assigned''
          AND p.user_id = (SELECT auth.uid())
          AND p.is_active = true
          AND a.tenant_id = p.tenant_id
          AND (
            public.fieldgrid_storage_tenant_id_from_path(name) IS NULL
            OR public.fieldgrid_storage_tenant_id_from_path(name) = a.tenant_id
          )
      )
    )
  ';
END $$;
