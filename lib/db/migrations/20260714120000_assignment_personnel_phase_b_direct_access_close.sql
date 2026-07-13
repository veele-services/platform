-- ============================================================================
-- Assignment personnel Phase B direct access closure.
--
-- Forward-only: close direct public.assignment_personnel table access for
-- PUBLIC, anon and authenticated while preserving policy-mediated personnel
-- reads through a minimal SECURITY DEFINER helper.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.personnel_assigned_to_assignment(p_assignment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_auth_uid uuid;
  v_claim_tenant_text text;
  v_claim_tenant_id uuid;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  v_claim_tenant_text := nullif(auth.jwt() ->> 'tenant_id', '');
  IF v_claim_tenant_text IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    v_claim_tenant_id := v_claim_tenant_text::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.assignment_personnel ap
    JOIN public.assignments a
      ON a.id = ap.assignment_id
    JOIN public.personnel p
      ON p.id = ap.personnel_id
    WHERE ap.assignment_id = p_assignment_id
      AND ap.status = 'assigned'
      AND p.user_id = v_auth_uid
      AND p.is_active = true
      AND a.tenant_id IS NOT NULL
      AND p.tenant_id = a.tenant_id
      AND a.tenant_id = v_claim_tenant_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.personnel_assigned_to_assignment(uuid)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.personnel_assigned_to_assignment(uuid)
TO authenticated;

-- Remove assignment_personnel policies before revoking table SELECT.
DROP POLICY IF EXISTS assignment_personnel_management_all
ON public.assignment_personnel;

DROP POLICY IF EXISTS assignment_personnel_tenant_management_all
ON public.assignment_personnel;

DROP POLICY IF EXISTS assignment_personnel_own_select
ON public.assignment_personnel;

DROP POLICY IF EXISTS personnel_read_own_assignment_personnel
ON public.assignment_personnel;

-- Remove legacy policy branches whose predicates directly read
-- public.assignment_personnel as the authenticated caller.
DROP POLICY IF EXISTS personnel_read_own_assignments
ON public.assignments;

DROP POLICY IF EXISTS personnel_read_own_assignment_tasks
ON public.assignment_tasks;

DROP POLICY IF EXISTS personnel_select_assigned_objects
ON public.objects;

CREATE POLICY personnel_select_assigned_objects
  ON public.objects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.assignments a
      WHERE a.object_id = objects.id
        AND public.personnel_assigned_to_assignment(a.id)
    )
  );

DROP POLICY IF EXISTS personnel_read_extra_work
ON public.assignment_extra_work;

CREATE POLICY personnel_read_extra_work
  ON public.assignment_extra_work
  FOR SELECT
  TO authenticated
  USING (public.personnel_assigned_to_assignment(assignment_id));

DROP POLICY IF EXISTS personnel_insert_extra_work
ON public.assignment_extra_work;

CREATE POLICY personnel_insert_extra_work
  ON public.assignment_extra_work
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.personnel_assigned_to_assignment(assignment_id)
  );

DROP POLICY IF EXISTS personnel_read_photos
ON public.assignment_photos;

CREATE POLICY personnel_read_photos
  ON public.assignment_photos
  FOR SELECT
  TO authenticated
  USING (public.personnel_assigned_to_assignment(assignment_id));

DROP POLICY IF EXISTS personnel_insert_photos
ON public.assignment_photos;

CREATE POLICY personnel_insert_photos
  ON public.assignment_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND public.personnel_assigned_to_assignment(assignment_id)
  );

DROP POLICY IF EXISTS assignment_report_notes_personnel_read
ON public.assignment_report_notes;

CREATE POLICY assignment_report_notes_personnel_read
  ON public.assignment_report_notes
  FOR SELECT
  TO authenticated
  USING (public.personnel_assigned_to_assignment(assignment_id));

DROP POLICY IF EXISTS assignment_report_notes_personnel_insert
ON public.assignment_report_notes;

CREATE POLICY assignment_report_notes_personnel_insert
  ON public.assignment_report_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.personnel_assigned_to_assignment(assignment_id)
  );

DROP POLICY IF EXISTS assignment_report_note_attachments_personnel_read
ON public.assignment_report_note_attachments;

CREATE POLICY assignment_report_note_attachments_personnel_read
  ON public.assignment_report_note_attachments
  FOR SELECT
  TO authenticated
  USING (public.personnel_assigned_to_assignment(assignment_id));

DROP POLICY IF EXISTS assignment_report_note_attachments_personnel_insert
ON public.assignment_report_note_attachments;

CREATE POLICY assignment_report_note_attachments_personnel_insert
  ON public.assignment_report_note_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND public.personnel_assigned_to_assignment(assignment_id)
  );

DROP POLICY IF EXISTS assignment_material_usage_personnel_select
ON public.assignment_material_usage;

DROP POLICY IF EXISTS assignment_material_usage_personnel_insert
ON public.assignment_material_usage;

DROP POLICY IF EXISTS assignment_material_usage_personnel_update_own
ON public.assignment_material_usage;

DROP POLICY IF EXISTS assignment_material_usage_personnel_delete_own
ON public.assignment_material_usage;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel ON storage.objects';
  EXECUTE '
    CREATE POLICY assignment_photos_assigned_personnel ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = ''assignment-photos''
      AND public.personnel_assigned_to_assignment(public.fieldgrid_storage_assignment_id_from_path(name))
      AND (
        public.fieldgrid_storage_tenant_id_from_path(name) IS NULL
        OR public.fieldgrid_storage_tenant_id_from_path(name)::text = nullif(auth.jwt() ->> ''tenant_id'', '''')
      )
    )
  ';

  EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel_insert ON storage.objects';
  EXECUTE '
    CREATE POLICY assignment_photos_assigned_personnel_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = ''assignment-photos''
      AND public.personnel_assigned_to_assignment(public.fieldgrid_storage_assignment_id_from_path(name))
      AND (
        public.fieldgrid_storage_tenant_id_from_path(name) IS NULL
        OR public.fieldgrid_storage_tenant_id_from_path(name)::text = nullif(auth.jwt() ->> ''tenant_id'', '''')
      )
    )
  ';

  EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel_update ON storage.objects';
  EXECUTE '
    CREATE POLICY assignment_photos_assigned_personnel_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = ''assignment-photos''
      AND public.personnel_assigned_to_assignment(public.fieldgrid_storage_assignment_id_from_path(name))
      AND (
        public.fieldgrid_storage_tenant_id_from_path(name) IS NULL
        OR public.fieldgrid_storage_tenant_id_from_path(name)::text = nullif(auth.jwt() ->> ''tenant_id'', '''')
      )
    )
    WITH CHECK (
      bucket_id = ''assignment-photos''
      AND public.personnel_assigned_to_assignment(public.fieldgrid_storage_assignment_id_from_path(name))
      AND (
        public.fieldgrid_storage_tenant_id_from_path(name) IS NULL
        OR public.fieldgrid_storage_tenant_id_from_path(name)::text = nullif(auth.jwt() ->> ''tenant_id'', '''')
      )
    )
  ';

  EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel_delete ON storage.objects';
  EXECUTE '
    CREATE POLICY assignment_photos_assigned_personnel_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = ''assignment-photos''
      AND public.personnel_assigned_to_assignment(public.fieldgrid_storage_assignment_id_from_path(name))
      AND (
        public.fieldgrid_storage_tenant_id_from_path(name) IS NULL
        OR public.fieldgrid_storage_tenant_id_from_path(name)::text = nullif(auth.jwt() ->> ''tenant_id'', '''')
      )
    )
  ';
END $$;

REVOKE ALL ON TABLE public.assignment_personnel
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.assignment_personnel
TO service_role;

DROP FUNCTION IF EXISTS
  public.can_manage_assignment_personnel(uuid, uuid);

DROP FUNCTION IF EXISTS
  public.can_select_own_assignment_personnel(uuid, uuid);

DROP FUNCTION IF EXISTS
  public.assignment_personnel_tenant_match(uuid, uuid);
