-- W02: make staffing capacity and status transitions match the canonical
-- application invariants. This is intentionally a forward-only replacement.

CREATE OR REPLACE FUNCTION public.transition_assignment_staffing(
  p_tenant_id uuid,
  p_assignment_id uuid,
  p_personnel_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_expected_version bigint DEFAULT NULL
)
RETURNS TABLE(
  assignment_personnel_id uuid,
  staffing_status text,
  lifecycle_version bigint,
  assigned_count integer,
  required_personnel_count integer,
  assignment_status text,
  idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  assignment_row public.assignments%ROWTYPE;
  personnel_row public.personnel%ROWTYPE;
  staffing_row public.assignment_personnel%ROWTYPE;
  latest_row public.assignment_personnel%ROWTYPE;
  execution_started_at timestamptz;
  active_count integer;
  required_role_count integer := 0;
  required_slots integer := 1;
  next_assignment_status text;
  now_value timestamptz := now();
  normalized_reason text := NULLIF(btrim(p_reason), '');
  was_idempotent boolean := false;
BEGIN
  IF p_action NOT IN ('assign','unassign') THEN
    RAISE EXCEPTION 'unsupported staffing action %', p_action
      USING ERRCODE = '22023';
  END IF;
  IF p_tenant_id IS NULL
    OR p_assignment_id IS NULL
    OR p_personnel_id IS NULL
    OR p_actor_user_id IS NULL
  THEN
    RAISE EXCEPTION 'tenant, assignment, personnel and actor are required'
      USING ERRCODE = '22023';
  END IF;
  IF p_action = 'unassign' AND normalized_reason IS NULL THEN
    RAISE EXCEPTION 'Een reden voor ontkoppelen is verplicht.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO assignment_row
  FROM public.assignments
  WHERE id = p_assignment_id
    AND tenant_id = p_tenant_id
    AND is_active = true
  FOR UPDATE;

  IF assignment_row.id IS NULL THEN
    RAISE EXCEPTION 'Opdracht niet gevonden binnen deze organisatie.'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT tc.required_role_id)::integer
  INTO required_role_count
  FROM public.assignment_tasks atask
  INNER JOIN public.task_codes tc
    ON tc.id = atask.task_code_id
   AND tc.tenant_id = p_tenant_id
  WHERE atask.assignment_id = p_assignment_id
    AND tc.required_role_id IS NOT NULL;

  required_slots := GREATEST(
    COALESCE(assignment_row.required_personnel_count, 1),
    COALESCE(required_role_count, 0),
    1
  );

  IF p_action = 'assign'
    AND (
      assignment_row.customer_signed_at IS NOT NULL
      OR assignment_row.status IN (
        'in_progress','completed','not_completed','report_submitted',
        'report_approved','invoice_ready','invoiced','paid','closed','cancelled'
      )
    )
  THEN
    RAISE EXCEPTION 'In deze opdrachtstatus kan geen medewerker meer worden ingepland.'
      USING ERRCODE = '23514', DETAIL = 'assignment_staffing_final';
  END IF;

  SELECT * INTO personnel_row
  FROM public.personnel
  WHERE id = p_personnel_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF personnel_row.id IS NULL THEN
    RAISE EXCEPTION 'Medewerker niet gevonden binnen deze organisatie.'
      USING ERRCODE = '42501';
  END IF;
  IF p_action = 'assign' AND personnel_row.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Deze medewerker is niet actief en kan niet worden ingepland.'
      USING ERRCODE = '23514', DETAIL = 'personnel_inactive';
  END IF;

  PERFORM id
  FROM public.assignment_personnel
  WHERE assignment_id = p_assignment_id
  ORDER BY personnel_id, assigned_at, id
  FOR UPDATE;

  SELECT * INTO staffing_row
  FROM public.assignment_personnel
  WHERE assignment_id = p_assignment_id
    AND personnel_id = p_personnel_id
    AND status IN ('assigned','suggested')
  ORDER BY assigned_at DESC, id DESC
  LIMIT 1;

  SELECT * INTO latest_row
  FROM public.assignment_personnel
  WHERE assignment_id = p_assignment_id
    AND personnel_id = p_personnel_id
  ORDER BY assigned_at DESC, id DESC
  LIMIT 1;

  IF p_action = 'assign'
    AND staffing_row.id IS NOT NULL
    AND staffing_row.status = 'assigned'
  THEN
    was_idempotent := true;
  ELSIF p_action = 'unassign'
    AND staffing_row.id IS NULL
    AND latest_row.id IS NOT NULL
    AND latest_row.status IN ('unassigned','cancelled','declined')
  THEN
    staffing_row := latest_row;
    was_idempotent := true;
  END IF;

  IF NOT was_idempotent
    AND p_expected_version IS NOT NULL
    AND COALESCE(staffing_row.lifecycle_version, latest_row.lifecycle_version)
      <> p_expected_version
  THEN
    RAISE EXCEPTION 'De personeelsplanning is intussen gewijzigd. Vernieuw en probeer opnieuw.'
      USING ERRCODE = '40001', DETAIL = 'staffing_version_conflict';
  END IF;

  IF NOT was_idempotent AND p_action = 'assign' THEN
    SELECT count(*)::integer INTO active_count
    FROM public.assignment_personnel
    WHERE assignment_id = p_assignment_id
      AND status = 'assigned';

    IF active_count >= required_slots THEN
      RAISE EXCEPTION 'Deze opdracht is al volledig bezet.'
        USING ERRCODE = '23514', DETAIL = 'assignment_capacity_full';
    END IF;

    IF staffing_row.id IS NOT NULL AND staffing_row.status = 'suggested' THEN
      UPDATE public.assignment_personnel
      SET status = 'assigned',
          assigned_at = now_value,
          assigned_by = p_actor_user_id,
          selected_at = COALESCE(selected_at, now_value),
          scheduled_at = now_value,
          lifecycle_version = public.assignment_personnel.lifecycle_version + 1,
          updated_at = now_value
      WHERE id = staffing_row.id
      RETURNING * INTO staffing_row;
    ELSIF latest_row.id IS NOT NULL THEN
      UPDATE public.assignment_personnel
      SET status = 'assigned',
          assigned_at = now_value,
          assigned_by = p_actor_user_id,
          selected_at = now_value,
          scheduled_at = now_value,
          unassigned_at = NULL,
          unassigned_by = NULL,
          unassignment_reason = NULL,
          cancelled_at = NULL,
          cancelled_by = NULL,
          cancellation_reason = NULL,
          lifecycle_version = public.assignment_personnel.lifecycle_version + 1,
          updated_at = now_value
      WHERE id = latest_row.id
      RETURNING * INTO staffing_row;
    ELSE
      INSERT INTO public.assignment_personnel (
        assignment_id,
        personnel_id,
        status,
        assigned_at,
        assigned_by,
        selected_at,
        scheduled_at,
        lifecycle_version,
        updated_at
      ) VALUES (
        p_assignment_id,
        p_personnel_id,
        'assigned',
        now_value,
        p_actor_user_id,
        now_value,
        now_value,
        1,
        now_value
      )
      RETURNING * INTO staffing_row;
    END IF;
  ELSIF NOT was_idempotent THEN
    IF staffing_row.id IS NULL THEN
      RAISE EXCEPTION 'Deze medewerker is niet actief aan de opdracht gekoppeld.'
        USING ERRCODE = '23514', DETAIL = 'staffing_link_inactive';
    END IF;

    SELECT ape.actual_started_at INTO execution_started_at
    FROM public.assignment_participant_executions ape
    WHERE ape.assignment_personnel_id = staffing_row.id
      AND ape.participant_status <> 'removed'
    ORDER BY ape.created_at DESC, ape.id DESC
    LIMIT 1
    FOR UPDATE;

    IF execution_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'Deze medewerker is al gestart. Rond de uitvoering af; de inzet kan niet stil worden verwijderd.'
        USING ERRCODE = '23514', DETAIL = 'staffing_execution_started';
    END IF;

    UPDATE public.assignment_personnel
    SET status = 'unassigned',
        unassigned_at = now_value,
        unassigned_by = p_actor_user_id,
        unassignment_reason = normalized_reason,
        lifecycle_version = public.assignment_personnel.lifecycle_version + 1,
        updated_at = now_value
    WHERE id = staffing_row.id
    RETURNING * INTO staffing_row;

    INSERT INTO public.assignment_personnel_lifecycle_history (
      assignment_personnel_id, tenant_id, assignment_id, personnel_id, status,
      assigned_at, assigned_by, selected_at, scheduled_at,
      unassigned_at, unassigned_by, unassignment_reason,
      cancelled_at, cancelled_by, cancellation_reason,
      lifecycle_version, transition
    ) VALUES (
      staffing_row.id, p_tenant_id, staffing_row.assignment_id,
      staffing_row.personnel_id, staffing_row.status, staffing_row.assigned_at,
      staffing_row.assigned_by, staffing_row.selected_at,
      staffing_row.scheduled_at, staffing_row.unassigned_at,
      staffing_row.unassigned_by, staffing_row.unassignment_reason,
      staffing_row.cancelled_at, staffing_row.cancelled_by,
      staffing_row.cancellation_reason, staffing_row.lifecycle_version,
      'unassigned'
    )
    ON CONFLICT ON CONSTRAINT
      assignment_personnel_lifecycle_history_version_unique DO NOTHING;
  END IF;

  SELECT count(*)::integer INTO active_count
  FROM public.assignment_personnel
  WHERE assignment_id = p_assignment_id
    AND status = 'assigned';

  next_assignment_status := assignment_row.status;
  IF assignment_row.status NOT IN (
    'scheduled','seen','en_route','in_progress','completed','not_completed',
    'report_submitted','report_approved','invoice_ready','invoiced','paid',
    'closed','cancelled'
  ) THEN
    next_assignment_status := CASE
      WHEN assignment_row.scheduled_date IS NOT NULL
       AND assignment_row.scheduled_start IS NOT NULL
       AND assignment_row.scheduled_end IS NOT NULL
       AND assignment_row.scheduled_start < assignment_row.scheduled_end
       AND active_count >= required_slots
        THEN 'scheduled'
      WHEN assignment_row.status = 'plannable'
        THEN 'plannable'
      ELSE assignment_row.status
    END;
  END IF;

  IF next_assignment_status IS DISTINCT FROM assignment_row.status THEN
    UPDATE public.assignments
    SET status = next_assignment_status,
        updated_at = now_value
    WHERE id = assignment_row.id;
  END IF;

  IF NOT was_idempotent THEN
    INSERT INTO public.audit_log (
      tenant_id, user_id, action, resource, resource_id, metadata
    ) VALUES (
      p_tenant_id,
      p_actor_user_id,
      CASE
        WHEN p_action = 'assign' THEN 'assign_personnel'
        ELSE 'unassign_personnel'
      END,
      'assignments',
      p_assignment_id::text,
      jsonb_build_object(
        'assignmentPersonnelId', staffing_row.id,
        'personnelId', p_personnel_id,
        'reason', normalized_reason,
        'staffingStatus', staffing_row.status,
        'lifecycleVersion', staffing_row.lifecycle_version,
        'assignedCount', active_count,
        'requiredPersonnelCount', required_slots,
        'configuredPersonnelCount', assignment_row.required_personnel_count,
        'requiredRoleCount', required_role_count,
        'assignmentStatus', next_assignment_status
      )
    );
  END IF;

  RETURN QUERY SELECT
    staffing_row.id,
    staffing_row.status::text,
    staffing_row.lifecycle_version,
    active_count,
    required_slots,
    next_assignment_status,
    was_idempotent;
END
$$;

REVOKE ALL ON FUNCTION public.transition_assignment_staffing(
  uuid, uuid, uuid, uuid, text, text, bigint
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.transition_assignment_staffing(
  uuid, uuid, uuid, uuid, text, text, bigint
) TO service_role;
