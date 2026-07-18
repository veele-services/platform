-- Fieldgrid Phase 2A: durable staffing snapshots and actual-time aggregation.
-- Forward-only. Historical staffing, participant executions, reports and audit rows remain stored.

ALTER TABLE public.assignment_personnel
  ADD COLUMN IF NOT EXISTS selected_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS unassigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS unassigned_by uuid,
  ADD COLUMN IF NOT EXISTS unassignment_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS lifecycle_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.assignment_personnel
SET selected_at = COALESCE(selected_at, assigned_at),
    scheduled_at = COALESCE(scheduled_at, assigned_at),
    updated_at = COALESCE(updated_at, assigned_at, now())
WHERE status = 'assigned';

DROP INDEX IF EXISTS public.assignment_personnel_active_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS assignment_personnel_unique_idx
  ON public.assignment_personnel (assignment_id, personnel_id);

CREATE TABLE IF NOT EXISTS public.assignment_personnel_lifecycle_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_personnel_id uuid NOT NULL REFERENCES public.assignment_personnel(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE RESTRICT,
  personnel_id uuid NOT NULL REFERENCES public.personnel(id) ON DELETE RESTRICT,
  status text NOT NULL,
  assigned_at timestamptz NOT NULL,
  assigned_by uuid,
  selected_at timestamptz,
  scheduled_at timestamptz,
  unassigned_at timestamptz,
  unassigned_by uuid,
  unassignment_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,
  lifecycle_version bigint NOT NULL,
  transition text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_personnel_lifecycle_history_version_unique
    UNIQUE (assignment_personnel_id, lifecycle_version),
  CONSTRAINT assignment_personnel_lifecycle_history_status_check
    CHECK (status IN ('assigned','suggested','declined','unassigned','cancelled')),
  CONSTRAINT assignment_personnel_lifecycle_history_transition_check
    CHECK (transition IN ('unassigned','cancelled','reactivated'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignment_personnel_lifecycle_history_version_unique'
      AND conrelid = 'public.assignment_personnel_lifecycle_history'::regclass
  ) THEN
    IF to_regclass('public.assignment_personnel_lifecycle_history_version_unique') IS NULL THEN
      CREATE UNIQUE INDEX assignment_personnel_lifecycle_history_version_unique
        ON public.assignment_personnel_lifecycle_history
          (assignment_personnel_id, lifecycle_version);
    END IF;
    ALTER TABLE public.assignment_personnel_lifecycle_history
      ADD CONSTRAINT assignment_personnel_lifecycle_history_version_unique
      UNIQUE USING INDEX assignment_personnel_lifecycle_history_version_unique;
  END IF;
END $$;

ALTER TABLE public.assignment_personnel_lifecycle_history
  DROP CONSTRAINT IF EXISTS assignment_personnel_lifecycle_history_status_check,
  ADD CONSTRAINT assignment_personnel_lifecycle_history_status_check
    CHECK (status IN ('assigned','suggested','declined','unassigned','cancelled')),
  DROP CONSTRAINT IF EXISTS assignment_personnel_lifecycle_history_transition_check,
  ADD CONSTRAINT assignment_personnel_lifecycle_history_transition_check
    CHECK (transition IN ('unassigned','cancelled','reactivated'));

CREATE INDEX IF NOT EXISTS assignment_personnel_lifecycle_history_lookup_idx
  ON public.assignment_personnel_lifecycle_history
    (tenant_id, assignment_id, personnel_id, lifecycle_version DESC);

ALTER TABLE public.assignment_personnel_lifecycle_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assignment_personnel_lifecycle_history
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.assignment_personnel
  DROP CONSTRAINT IF EXISTS assignment_personnel_assignment_id_assignments_id_fk,
  DROP CONSTRAINT IF EXISTS assignment_personnel_personnel_id_personnel_id_fk;

ALTER TABLE public.assignment_personnel
  ADD CONSTRAINT assignment_personnel_assignment_id_assignments_id_fk
    FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE RESTRICT,
  ADD CONSTRAINT assignment_personnel_personnel_id_personnel_id_fk
    FOREIGN KEY (personnel_id) REFERENCES public.personnel(id) ON DELETE RESTRICT;

ALTER TABLE public.assignment_personnel
  DROP CONSTRAINT IF EXISTS assignment_personnel_status_check,
  ADD CONSTRAINT assignment_personnel_status_check
    CHECK (status IN ('assigned','suggested','declined','unassigned','cancelled')),
  DROP CONSTRAINT IF EXISTS assignment_personnel_unassignment_reason_check,
  ADD CONSTRAINT assignment_personnel_unassignment_reason_check
    CHECK (
      status <> 'unassigned'
      OR (
        unassigned_at IS NOT NULL
        AND unassigned_by IS NOT NULL
        AND COALESCE(length(btrim(unassignment_reason)), 0) > 0
      )
    ),
  DROP CONSTRAINT IF EXISTS assignment_personnel_cancellation_reason_check,
  ADD CONSTRAINT assignment_personnel_cancellation_reason_check
    CHECK (
      status <> 'cancelled'
      OR (
        cancelled_at IS NOT NULL
        AND cancelled_by IS NOT NULL
        AND COALESCE(length(btrim(cancellation_reason)), 0) > 0
      )
    ),
  DROP CONSTRAINT IF EXISTS assignment_personnel_lifecycle_version_check,
  ADD CONSTRAINT assignment_personnel_lifecycle_version_check CHECK (lifecycle_version > 0);

CREATE INDEX IF NOT EXISTS assignment_personnel_history_idx
  ON public.assignment_personnel (assignment_id, personnel_id, assigned_at DESC, id);

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.assignment_participant_executions
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS en_route_at timestamptz;

ALTER TABLE public.assignment_participant_executions
  DROP CONSTRAINT IF EXISTS assignment_participant_execution_link_unique,
  DROP CONSTRAINT IF EXISTS assignment_participant_execution_assignment_personnel_unique;

CREATE UNIQUE INDEX IF NOT EXISTS assignment_participant_execution_active_link_unique
  ON public.assignment_participant_executions (assignment_personnel_id)
  WHERE participant_status <> 'removed';

CREATE UNIQUE INDEX IF NOT EXISTS assignment_participant_execution_active_person_unique
  ON public.assignment_participant_executions (assignment_id, personnel_id)
  WHERE participant_status <> 'removed';

CREATE INDEX IF NOT EXISTS assignment_participant_execution_history_idx
  ON public.assignment_participant_executions (tenant_id, assignment_id, personnel_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.recompute_assignment_execution_projection(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  earliest_seen timestamptz;
  earliest_en_route timestamptz;
  earliest_start timestamptz;
  projected_end timestamptz;
  required_count integer;
  unfinished_count integer;
  completed_count integer;
  not_completed_count integer;
  current_status text;
BEGIN
  SELECT
    min(ape.seen_at),
    min(ape.en_route_at),
    min(ape.actual_started_at),
    max(ape.actual_completed_at),
    count(*) FILTER (WHERE ape.is_required),
    count(*) FILTER (
      WHERE ape.is_required
        AND ape.participant_status IN ('assigned','seen','en_route','in_progress','paused')
    ),
    count(*) FILTER (WHERE ape.is_required AND ape.participant_status = 'completed'),
    count(*) FILTER (WHERE ape.is_required AND ape.participant_status = 'not_completed')
  INTO
    earliest_seen,
    earliest_en_route,
    earliest_start,
    projected_end,
    required_count,
    unfinished_count,
    completed_count,
    not_completed_count
  FROM public.assignment_participant_executions ape
  JOIN public.assignment_personnel ap
    ON ap.id = ape.assignment_personnel_id
   AND ap.status = 'assigned'
  WHERE ape.assignment_id = p_assignment_id
    AND ape.participant_status <> 'removed';

  SELECT status INTO current_status
  FROM public.assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  UPDATE public.assignments
  SET seen_at = COALESCE(earliest_seen, public.assignments.seen_at),
      en_route_at = COALESCE(earliest_en_route, public.assignments.en_route_at),
      actual_started_at = COALESCE(earliest_start, public.assignments.actual_started_at),
      actual_completed_at = CASE
        WHEN required_count > 0
         AND unfinished_count = 0
         AND completed_count + not_completed_count = required_count
          THEN projected_end
        ELSE public.assignments.actual_completed_at
      END,
      status = CASE
        WHEN current_status IN ('report_submitted','report_approved','invoice_ready','invoiced','paid','closed','cancelled')
          THEN current_status
        WHEN required_count > 0 AND unfinished_count = 0 AND not_completed_count > 0
          THEN 'not_completed'
        WHEN required_count > 0 AND unfinished_count = 0 AND completed_count = required_count
          THEN 'completed'
        WHEN earliest_start IS NOT NULL THEN 'in_progress'
        WHEN earliest_en_route IS NOT NULL THEN 'en_route'
        WHEN earliest_seen IS NOT NULL THEN 'seen'
        ELSE current_status
      END,
      updated_at = now()
  WHERE id = p_assignment_id;
END
$$;

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
  next_assignment_status text;
  now_value timestamptz := now();
  normalized_reason text := NULLIF(btrim(p_reason), '');
  was_idempotent boolean := false;
BEGIN
  IF p_action NOT IN ('assign','unassign') THEN
    RAISE EXCEPTION 'unsupported staffing action %', p_action USING ERRCODE = '22023';
  END IF;
  IF p_tenant_id IS NULL OR p_assignment_id IS NULL OR p_personnel_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'tenant, assignment, personnel and actor are required' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'unassign' AND normalized_reason IS NULL THEN
    RAISE EXCEPTION 'Een reden voor ontkoppelen is verplicht.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO assignment_row
  FROM public.assignments
  WHERE id = p_assignment_id AND tenant_id = p_tenant_id AND is_active = true
  FOR UPDATE;
  IF assignment_row.id IS NULL THEN
    RAISE EXCEPTION 'Opdracht niet gevonden binnen deze organisatie.' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'assign' AND assignment_row.status IN (
    'in_progress','completed','not_completed','report_submitted','report_approved',
    'invoice_ready','invoiced','paid','closed','cancelled'
  ) THEN
    RAISE EXCEPTION 'In deze opdrachtstatus kan geen medewerker meer worden ingepland.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO personnel_row
  FROM public.personnel
  WHERE id = p_personnel_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF personnel_row.id IS NULL THEN
    RAISE EXCEPTION 'Medewerker niet gevonden binnen deze organisatie.' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'assign' AND personnel_row.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Deze medewerker is niet actief en kan niet worden ingepland.' USING ERRCODE = '23514';
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

  IF p_action = 'assign' AND staffing_row.id IS NOT NULL AND staffing_row.status = 'assigned' THEN
    was_idempotent := true;
  ELSIF p_action = 'unassign' AND staffing_row.id IS NULL AND latest_row.id IS NOT NULL
    AND latest_row.status IN ('unassigned','cancelled','declined') THEN
    staffing_row := latest_row;
    was_idempotent := true;
  END IF;

  IF NOT was_idempotent
    AND p_expected_version IS NOT NULL
    AND COALESCE(staffing_row.lifecycle_version, latest_row.lifecycle_version) <> p_expected_version THEN
    RAISE EXCEPTION 'De personeelsplanning is intussen gewijzigd. Vernieuw en probeer opnieuw.' USING ERRCODE = '40001';
  END IF;

  IF NOT was_idempotent AND p_action = 'assign' THEN
    SELECT count(*)::integer INTO active_count
    FROM public.assignment_personnel
    WHERE assignment_id = p_assignment_id AND status = 'assigned';
    IF active_count >= assignment_row.required_personnel_count THEN
      RAISE EXCEPTION 'Deze opdracht is al volledig bezet.' USING ERRCODE = '23514';
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
      RAISE EXCEPTION 'Deze medewerker is niet actief aan de opdracht gekoppeld.' USING ERRCODE = '23514';
    END IF;

    SELECT ape.actual_started_at INTO execution_started_at
    FROM public.assignment_participant_executions ape
    WHERE ape.assignment_personnel_id = staffing_row.id
      AND ape.participant_status <> 'removed'
    ORDER BY ape.created_at DESC, ape.id DESC
    LIMIT 1
    FOR UPDATE;
    IF execution_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'Deze medewerker is al gestart. Rond de uitvoering af; de inzet kan niet stil worden verwijderd.' USING ERRCODE = '23514';
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
      staffing_row.id, p_tenant_id, staffing_row.assignment_id, staffing_row.personnel_id, staffing_row.status,
      staffing_row.assigned_at, staffing_row.assigned_by, staffing_row.selected_at, staffing_row.scheduled_at,
      staffing_row.unassigned_at, staffing_row.unassigned_by, staffing_row.unassignment_reason,
      staffing_row.cancelled_at, staffing_row.cancelled_by, staffing_row.cancellation_reason,
      staffing_row.lifecycle_version, 'unassigned'
    )
    ON CONFLICT ON CONSTRAINT assignment_personnel_lifecycle_history_version_unique DO NOTHING;
  END IF;

  SELECT count(*)::integer INTO active_count
  FROM public.assignment_personnel
  WHERE assignment_id = p_assignment_id AND status = 'assigned';

  next_assignment_status := assignment_row.status;
  IF assignment_row.status NOT IN (
    'in_progress','completed','not_completed','report_submitted','report_approved',
    'invoice_ready','invoiced','paid','closed','cancelled'
  ) THEN
    next_assignment_status := CASE
      WHEN assignment_row.scheduled_date IS NOT NULL
       AND active_count >= assignment_row.required_personnel_count
        THEN 'scheduled'
      ELSE 'plannable'
    END;
  END IF;

  IF next_assignment_status IS DISTINCT FROM assignment_row.status THEN
    UPDATE public.assignments
    SET status = next_assignment_status, updated_at = now_value
    WHERE id = assignment_row.id;
  END IF;

  IF NOT was_idempotent THEN
    INSERT INTO public.audit_log (tenant_id, user_id, action, resource, resource_id, metadata)
    VALUES (
      p_tenant_id,
      p_actor_user_id,
      CASE WHEN p_action = 'assign' THEN 'assign_personnel' ELSE 'unassign_personnel' END,
      'assignments',
      p_assignment_id::text,
      jsonb_build_object(
        'assignmentPersonnelId', staffing_row.id,
        'personnelId', p_personnel_id,
        'reason', normalized_reason,
        'staffingStatus', staffing_row.status,
        'lifecycleVersion', staffing_row.lifecycle_version,
        'assignedCount', active_count,
        'requiredPersonnelCount', assignment_row.required_personnel_count,
        'assignmentStatus', next_assignment_status
      )
    );
  END IF;

  RETURN QUERY SELECT
    staffing_row.id,
    staffing_row.status::text,
    staffing_row.lifecycle_version,
    active_count,
    assignment_row.required_personnel_count,
    next_assignment_status,
    was_idempotent;
END
$$;

CREATE OR REPLACE FUNCTION public.cancel_assignment_staffing(
  p_tenant_id uuid,
  p_assignment_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
RETURNS TABLE(cancelled_links integer, assignment_status text, idempotent boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  assignment_row public.assignments%ROWTYPE;
  normalized_reason text := NULLIF(btrim(p_reason), '');
  started_count integer;
  affected_count integer := 0;
  now_value timestamptz := now();
BEGIN
  IF normalized_reason IS NULL THEN
    RAISE EXCEPTION 'Een reden voor annuleren is verplicht.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO assignment_row
  FROM public.assignments
  WHERE id = p_assignment_id AND tenant_id = p_tenant_id AND is_active = true
  FOR UPDATE;
  IF assignment_row.id IS NULL THEN
    RAISE EXCEPTION 'Opdracht niet gevonden binnen deze organisatie.' USING ERRCODE = '42501';
  END IF;
  IF assignment_row.status = 'cancelled' THEN
    RETURN QUERY SELECT 0, 'cancelled'::text, true;
    RETURN;
  END IF;

  PERFORM id
  FROM public.assignment_personnel
  WHERE assignment_id = p_assignment_id
  ORDER BY personnel_id, assigned_at, id
  FOR UPDATE;

  PERFORM ape.id
  FROM public.assignment_participant_executions ape
  WHERE ape.assignment_id = p_assignment_id
  ORDER BY ape.personnel_id, ape.created_at, ape.id
  FOR UPDATE;

  SELECT count(*)::integer INTO started_count
  FROM public.assignment_participant_executions
  WHERE assignment_id = p_assignment_id AND actual_started_at IS NOT NULL;
  IF started_count > 0 THEN
    RAISE EXCEPTION 'De uitvoering is al gestart. Meld de opdracht af via de uitvoeringsflow in plaats van te annuleren.' USING ERRCODE = '23514';
  END IF;

  WITH transitioned AS (
    UPDATE public.assignment_personnel
    SET status = 'cancelled',
        cancelled_at = now_value,
        cancelled_by = p_actor_user_id,
        cancellation_reason = normalized_reason,
        lifecycle_version = public.assignment_personnel.lifecycle_version + 1,
        updated_at = now_value
    WHERE assignment_id = p_assignment_id AND status IN ('assigned','suggested')
    RETURNING *
  )
  INSERT INTO public.assignment_personnel_lifecycle_history (
    assignment_personnel_id, tenant_id, assignment_id, personnel_id, status,
    assigned_at, assigned_by, selected_at, scheduled_at,
    unassigned_at, unassigned_by, unassignment_reason,
    cancelled_at, cancelled_by, cancellation_reason,
    lifecycle_version, transition
  )
  SELECT
    transitioned.id, p_tenant_id, transitioned.assignment_id, transitioned.personnel_id, transitioned.status,
    transitioned.assigned_at, transitioned.assigned_by, transitioned.selected_at, transitioned.scheduled_at,
    transitioned.unassigned_at, transitioned.unassigned_by, transitioned.unassignment_reason,
    transitioned.cancelled_at, transitioned.cancelled_by, transitioned.cancellation_reason,
    transitioned.lifecycle_version, 'cancelled'
  FROM transitioned
  ON CONFLICT ON CONSTRAINT assignment_personnel_lifecycle_history_version_unique DO NOTHING;
  GET DIAGNOSTICS affected_count = ROW_COUNT;

  UPDATE public.assignments
  SET status = 'cancelled',
      cancelled_at = now_value,
      cancelled_by = p_actor_user_id,
      cancellation_reason = normalized_reason,
      updated_at = now_value
  WHERE id = p_assignment_id;

  INSERT INTO public.audit_log (tenant_id, user_id, action, resource, resource_id, metadata)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    'cancel_assignment',
    'assignments',
    p_assignment_id::text,
    jsonb_build_object('reason', normalized_reason, 'cancelledLinks', affected_count)
  );

  RETURN QUERY SELECT affected_count, 'cancelled'::text, false;
END
$$;

CREATE OR REPLACE FUNCTION public.trg_assignment_personnel_reactivation_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  assignment_tenant_id uuid;
BEGIN
  IF OLD.status IN ('unassigned','cancelled','declined')
     AND NEW.status IN ('assigned','suggested') THEN
    SELECT tenant_id INTO assignment_tenant_id
    FROM public.assignments
    WHERE id = OLD.assignment_id;

    INSERT INTO public.assignment_personnel_lifecycle_history (
      assignment_personnel_id, tenant_id, assignment_id, personnel_id, status,
      assigned_at, assigned_by, selected_at, scheduled_at,
      unassigned_at, unassigned_by, unassignment_reason,
      cancelled_at, cancelled_by, cancellation_reason,
      lifecycle_version, transition
    ) VALUES (
      OLD.id, assignment_tenant_id, OLD.assignment_id, OLD.personnel_id, OLD.status,
      OLD.assigned_at, OLD.assigned_by, OLD.selected_at, OLD.scheduled_at,
      OLD.unassigned_at, OLD.unassigned_by, OLD.unassignment_reason,
      OLD.cancelled_at, OLD.cancelled_by, OLD.cancellation_reason,
      OLD.lifecycle_version, 'reactivated'
    )
    ON CONFLICT ON CONSTRAINT assignment_personnel_lifecycle_history_version_unique DO NOTHING;

    NEW.assigned_at := now();
    NEW.selected_at := CASE WHEN NEW.status = 'assigned' THEN now() ELSE NULL END;
    NEW.scheduled_at := CASE WHEN NEW.status = 'assigned' THEN now() ELSE NULL END;
    NEW.unassigned_at := NULL;
    NEW.unassigned_by := NULL;
    NEW.unassignment_reason := NULL;
    NEW.cancelled_at := NULL;
    NEW.cancelled_by := NULL;
    NEW.cancellation_reason := NULL;
    NEW.lifecycle_version := OLD.lifecycle_version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS assignment_personnel_reactivation_history ON public.assignment_personnel;
CREATE TRIGGER assignment_personnel_reactivation_history
  BEFORE UPDATE OF status ON public.assignment_personnel
  FOR EACH ROW EXECUTE FUNCTION public.trg_assignment_personnel_reactivation_history();

CREATE OR REPLACE FUNCTION public.trg_assignment_personnel_execution_seed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  assignment_tenant uuid;
BEGIN
  SELECT tenant_id INTO assignment_tenant
  FROM public.assignments
  WHERE id = NEW.assignment_id;

  IF NEW.status = 'assigned' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.assignment_participant_executions
      WHERE assignment_personnel_id = NEW.id
        AND participant_status <> 'removed'
    ) THEN
      INSERT INTO public.assignment_participant_executions (
        tenant_id, assignment_id, personnel_id, assignment_personnel_id,
        participant_status, last_actor_user_id, last_actor_personnel_id, audit_metadata
      ) VALUES (
        assignment_tenant, NEW.assignment_id, NEW.personnel_id, NEW.id,
        'assigned', NEW.assigned_by, NEW.personnel_id,
        jsonb_build_object('seeded_from_assignment_personnel_status', NEW.status)
      );
    END IF;
  ELSE
    UPDATE public.assignment_participant_executions
    SET participant_status = 'removed',
        updated_at = now()
    WHERE assignment_personnel_id = NEW.id
      AND participant_status NOT IN ('removed','completed','not_completed')
      AND actual_started_at IS NULL;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.trg_assignment_personnel_reactivation_history()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_assignment_personnel_execution_seed()
  FROM PUBLIC, anon, authenticated;

-- Keep participant actions in the same assignment -> staffing -> execution lock order.
CREATE OR REPLACE FUNCTION public.execute_assignment_participant_action(
  p_assignment_id uuid,
  p_personnel_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_idempotency_key text DEFAULT NULL,
  p_completion_reason text DEFAULT NULL,
  p_completion_notes text DEFAULT NULL,
  p_audit_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  execution_id uuid,
  assignment_personnel_id uuid,
  tenant_id uuid,
  participant_status text,
  assignment_status text,
  first_assignment_start boolean,
  aggregate_completed boolean,
  version bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  exec_row public.assignment_participant_executions%ROWTYPE;
  assignment_row public.assignments%ROWTYPE;
  old_assignment_started_at timestamptz;
  new_status text;
  now_value timestamptz := now();
BEGIN
  IF p_action NOT IN ('seen','en_route','start','pause','resume','complete','not_complete') THEN
    RAISE EXCEPTION 'unsupported participant action %', p_action USING ERRCODE = '22023';
  END IF;

  SELECT * INTO assignment_row
  FROM public.assignments
  WHERE id = p_assignment_id AND is_active = true
  FOR UPDATE;
  IF assignment_row.id IS NULL OR assignment_row.status = 'cancelled' THEN
    RAISE EXCEPTION 'participant execution not available' USING ERRCODE = '42501';
  END IF;
  old_assignment_started_at := assignment_row.actual_started_at;

  SELECT ape.* INTO exec_row
  FROM public.assignment_participant_executions ape
  JOIN public.assignment_personnel ap
    ON ap.id = ape.assignment_personnel_id
   AND ap.status = 'assigned'
  JOIN public.personnel p
    ON p.id = ape.personnel_id
   AND p.is_active = true
   AND p.user_id = p_actor_user_id
  WHERE ape.assignment_id = p_assignment_id
    AND ape.personnel_id = p_personnel_id
    AND ape.participant_status <> 'removed'
  FOR UPDATE;

  IF exec_row.id IS NULL THEN
    RAISE EXCEPTION 'participant execution not found for actor' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NOT NULL AND exec_row.idempotency_key = p_idempotency_key THEN
    RETURN QUERY SELECT exec_row.id, exec_row.assignment_personnel_id, exec_row.tenant_id,
      exec_row.participant_status::text, assignment_row.status::text, false,
      assignment_row.actual_completed_at IS NOT NULL, exec_row.version;
    RETURN;
  END IF;

  IF exec_row.participant_status IN ('completed','not_completed') THEN
    RAISE EXCEPTION 'Een afgeronde uitvoering kan niet meer worden gewijzigd.' USING ERRCODE = '23514';
  END IF;
  IF p_action = 'pause' AND exec_row.participant_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Alleen gestart werk kan worden gepauzeerd.' USING ERRCODE = '23514';
  END IF;
  IF p_action = 'resume' AND exec_row.participant_status <> 'paused' THEN
    RAISE EXCEPTION 'Alleen gepauzeerd werk kan worden hervat.' USING ERRCODE = '23514';
  END IF;
  IF p_action IN ('complete','not_complete') AND exec_row.participant_status NOT IN ('in_progress','paused') THEN
    RAISE EXCEPTION 'De uitvoering moet gestart zijn vóór afronding.' USING ERRCODE = '23514';
  END IF;

  new_status := CASE p_action
    WHEN 'seen' THEN CASE WHEN exec_row.participant_status = 'assigned' THEN 'seen' ELSE exec_row.participant_status END
    WHEN 'en_route' THEN CASE WHEN exec_row.participant_status IN ('assigned','seen') THEN 'en_route' ELSE exec_row.participant_status END
    WHEN 'start' THEN CASE WHEN exec_row.participant_status IN ('assigned','seen','en_route') THEN 'in_progress' ELSE exec_row.participant_status END
    WHEN 'pause' THEN 'paused'
    WHEN 'resume' THEN 'in_progress'
    WHEN 'complete' THEN 'completed'
    WHEN 'not_complete' THEN 'not_completed'
  END;

  UPDATE public.assignment_participant_executions
  SET participant_status = new_status,
      seen_at = CASE WHEN p_action IN ('seen','en_route','start') THEN COALESCE(seen_at, now_value) ELSE seen_at END,
      en_route_at = CASE WHEN p_action = 'en_route' THEN COALESCE(en_route_at, now_value) ELSE en_route_at END,
      actual_started_at = CASE WHEN p_action = 'start' THEN COALESCE(actual_started_at, now_value) ELSE actual_started_at END,
      paused_at = CASE WHEN p_action = 'pause' THEN now_value WHEN p_action = 'resume' THEN NULL ELSE paused_at END,
      resumed_at = CASE WHEN p_action = 'resume' THEN now_value ELSE resumed_at END,
      actual_completed_at = CASE WHEN p_action IN ('complete','not_complete') THEN COALESCE(actual_completed_at, now_value) ELSE actual_completed_at END,
      completion_outcome = CASE WHEN p_action = 'complete' THEN 'completed' WHEN p_action = 'not_complete' THEN 'not_completed' ELSE completion_outcome END,
      completion_reason = CASE WHEN p_action = 'not_complete' THEN p_completion_reason ELSE completion_reason END,
      completion_notes = CASE WHEN p_action IN ('complete','not_complete') THEN p_completion_notes ELSE completion_notes END,
      idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
      version = public.assignment_participant_executions.version + 1,
      last_actor_user_id = p_actor_user_id,
      last_actor_personnel_id = p_personnel_id,
      audit_metadata = audit_metadata || COALESCE(p_audit_metadata, '{}'::jsonb),
      updated_at = now_value
  WHERE id = exec_row.id
  RETURNING * INTO exec_row;

  PERFORM public.recompute_assignment_execution_projection(p_assignment_id);

  RETURN QUERY SELECT exec_row.id, exec_row.assignment_personnel_id, exec_row.tenant_id,
    exec_row.participant_status::text, a.status::text,
    old_assignment_started_at IS NULL AND a.actual_started_at IS NOT NULL,
    a.actual_completed_at IS NOT NULL,
    exec_row.version
  FROM public.assignments a
  WHERE a.id = p_assignment_id;
END
$$;

ALTER FUNCTION public.trg_assignment_participant_execution_guard()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.trg_assignment_personnel_execution_seed()
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.trg_assignment_participant_execution_guard()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_assignment_personnel_execution_seed()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.recompute_assignment_execution_projection(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_assignment_staffing(uuid, uuid, uuid, uuid, text, text, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_assignment_staffing(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.execute_assignment_participant_action(uuid, uuid, uuid, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.transition_assignment_staffing(uuid, uuid, uuid, uuid, text, text, bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_assignment_staffing(uuid, uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.execute_assignment_participant_action(uuid, uuid, uuid, text, text, text, text, jsonb)
  TO service_role;
