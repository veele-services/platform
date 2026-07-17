-- Fieldgrid Phase 2.1 integrated runtime hardening.
-- Forward-only corrective migration; do not rewrite W00-W12 migrations.

ALTER TABLE public.credential_recovery_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_recovery_challenges FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.credential_recovery_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credential_recovery_challenges TO service_role;

CREATE INDEX IF NOT EXISTS credential_recovery_active_lock_idx
  ON public.credential_recovery_challenges (surface, tenant_id, purpose, account_lookup_hmac, expires_at)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS assignment_personnel_active_staffing_idx
  ON public.assignment_personnel (assignment_id, personnel_id)
  WHERE status = 'assigned';

ALTER TABLE IF EXISTS public.assignment_participant_executions
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

ALTER TABLE IF EXISTS public.assignment_participant_executions
  DROP CONSTRAINT IF EXISTS assignment_participant_execution_participant_status_check;
ALTER TABLE IF EXISTS public.assignment_participant_executions
  DROP CONSTRAINT IF EXISTS assignment_participant_execution_status_check;
ALTER TABLE IF EXISTS public.assignment_participant_executions
  ADD CONSTRAINT assignment_participant_execution_participant_status_check
  CHECK (participant_status IN ('assigned','planned','seen','en_route','in_progress','paused','completed','not_completed','blocked','cancelled','removed'));

CREATE OR REPLACE FUNCTION public.fieldgrid_unassign_assignment_personnel(
  p_tenant_id uuid,
  p_assignment_id uuid,
  p_personnel_id uuid,
  p_actor_user_id uuid,
  p_admin_override boolean DEFAULT false,
  p_reason text DEFAULT NULL
) RETURNS TABLE(assignment_id uuid, personnel_id uuid, assignment_personnel_id uuid, participant_status text, assigned_count integer, assignment_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_assignment public.assignments%ROWTYPE;
  v_link public.assignment_personnel%ROWTYPE;
  v_execution public.assignment_participant_executions%ROWTYPE;
  v_assigned_count integer;
  v_next_status text;
BEGIN
  SELECT * INTO v_assignment FROM public.assignments
   WHERE id = p_assignment_id AND tenant_id = p_tenant_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_link FROM public.assignment_personnel
   WHERE assignment_id = p_assignment_id AND personnel_id = p_personnel_id FOR UPDATE;
  IF NOT FOUND OR v_link.status <> 'assigned' THEN
    SELECT count(*)::int INTO v_assigned_count FROM public.assignment_personnel WHERE assignment_id = p_assignment_id AND status = 'assigned';
    RETURN QUERY SELECT p_assignment_id, p_personnel_id, NULL::uuid, 'removed'::text, v_assigned_count, v_assignment.status::text;
    RETURN;
  END IF;

  PERFORM 1 FROM public.personnel WHERE id = p_personnel_id AND tenant_id = p_tenant_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'personnel_not_found' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_execution FROM public.assignment_participant_executions
   WHERE assignment_id = p_assignment_id AND personnel_id = p_personnel_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF FOUND AND v_execution.participant_status NOT IN ('planned', 'removed') AND NOT p_admin_override THEN
    RAISE EXCEPTION 'assignment_execution_started' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.assignment_personnel SET status = 'cancelled', updated_at = now()
   WHERE id = v_link.id;
  IF FOUND AND v_execution.participant_status = 'planned' THEN
    UPDATE public.assignment_participant_executions
       SET participant_status = 'removed', removed_at = COALESCE(removed_at, now()), updated_at = now(),
           audit_metadata = COALESCE(audit_metadata, '{}'::jsonb) || jsonb_build_object('removed_by', p_actor_user_id::text, 'admin_override', p_admin_override, 'reason', COALESCE(p_reason, 'unassign_before_execution'))
     WHERE id = v_execution.id;
  END IF;

  SELECT count(*)::int INTO v_assigned_count FROM public.assignment_personnel WHERE assignment_id = p_assignment_id AND status = 'assigned';
  v_next_status := CASE WHEN v_assigned_count >= v_assignment.required_personnel_count AND v_assignment.status IN ('requested','plannable') THEN 'scheduled'
                        WHEN v_assigned_count < v_assignment.required_personnel_count AND v_assignment.status = 'scheduled' THEN 'plannable'
                        ELSE v_assignment.status END;
  UPDATE public.assignments SET status = v_next_status, updated_at = now() WHERE id = p_assignment_id AND tenant_id = p_tenant_id;

  INSERT INTO public.audit_log(tenant_id, user_id, action, resource, resource_id, metadata)
  VALUES (p_tenant_id, p_actor_user_id, CASE WHEN p_admin_override THEN 'assignment_personnel_admin_unassigned' ELSE 'assignment_personnel_unassigned' END,
          'assignments', p_assignment_id, jsonb_build_object('personnelId', p_personnel_id, 'assignmentPersonnelId', v_link.id, 'reason', p_reason));

  RETURN QUERY SELECT p_assignment_id, p_personnel_id, v_link.id, COALESCE(v_execution.participant_status, 'removed')::text, v_assigned_count, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.fieldgrid_unassign_assignment_personnel(uuid, uuid, uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fieldgrid_unassign_assignment_personnel(uuid, uuid, uuid, uuid, boolean, text) TO service_role;
