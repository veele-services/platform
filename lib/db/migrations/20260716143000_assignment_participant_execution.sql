-- Fieldgrid Phase 2 W04: canonical per-person assignment execution.
-- Forward-only migration; preserves assignment_personnel history while introducing
-- participant-bound execution records as the write target for personnel actions.

CREATE TABLE IF NOT EXISTS public.assignment_participant_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE cascade,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE cascade,
  personnel_id uuid NOT NULL REFERENCES public.personnel(id) ON DELETE restrict,
  assignment_personnel_id uuid NOT NULL REFERENCES public.assignment_personnel(id) ON DELETE restrict,
  participant_status varchar(32) NOT NULL DEFAULT 'assigned',
  seen_at timestamptz,
  actual_started_at timestamptz,
  paused_at timestamptz,
  resumed_at timestamptz,
  actual_completed_at timestamptz,
  completion_outcome varchar(32),
  completion_reason varchar(160),
  completion_notes text,
  completion_policy varchar(32) NOT NULL DEFAULT 'all_required_participants',
  idempotency_key text,
  version bigint NOT NULL DEFAULT 1,
  last_actor_user_id uuid,
  last_actor_personnel_id uuid,
  audit_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_participant_execution_status_check CHECK (
    participant_status IN ('assigned','seen','en_route','in_progress','paused','completed','not_completed','removed')
  ),
  CONSTRAINT assignment_participant_execution_outcome_check CHECK (
    completion_outcome IS NULL OR completion_outcome IN ('completed','not_completed')
  ),
  CONSTRAINT assignment_participant_execution_policy_check CHECK (
    completion_policy IN ('all_required_participants','any_participant','first_final_outcome')
  ),
  CONSTRAINT assignment_participant_execution_time_check CHECK (
    actual_started_at IS NULL OR actual_completed_at IS NULL OR actual_completed_at >= actual_started_at
  ),
  CONSTRAINT assignment_participant_execution_pause_check CHECK (
    paused_at IS NULL OR actual_started_at IS NOT NULL
  ),
  CONSTRAINT assignment_participant_execution_link_unique UNIQUE (assignment_personnel_id),
  CONSTRAINT assignment_participant_execution_assignment_personnel_unique UNIQUE (assignment_id, personnel_id)
);

CREATE INDEX IF NOT EXISTS assignment_participant_execution_assignment_idx
  ON public.assignment_participant_executions (tenant_id, assignment_id, participant_status);
CREATE INDEX IF NOT EXISTS assignment_participant_execution_personnel_idx
  ON public.assignment_participant_executions (tenant_id, personnel_id, participant_status);

ALTER TABLE public.assignment_participant_executions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.assignment_participant_executions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_participant_executions TO service_role;

INSERT INTO public.assignment_participant_executions (
  tenant_id,
  assignment_id,
  personnel_id,
  assignment_personnel_id,
  participant_status,
  seen_at,
  actual_started_at,
  actual_completed_at,
  completion_outcome,
  completion_policy,
  last_actor_user_id,
  last_actor_personnel_id,
  audit_metadata,
  created_at,
  updated_at
)
SELECT
  a.tenant_id,
  ap.assignment_id,
  ap.personnel_id,
  ap.id,
  CASE
    WHEN ap.status <> 'assigned' THEN 'removed'
    WHEN a.status IN ('not_completed') THEN 'not_completed'
    WHEN a.status IN ('completed','report_submitted','report_approved','invoice_ready','invoiced','paid','closed') THEN 'completed'
    WHEN a.status = 'in_progress' THEN 'in_progress'
    WHEN a.status = 'en_route' THEN 'en_route'
    WHEN a.status = 'seen' THEN 'seen'
    ELSE 'assigned'
  END,
  a.seen_at,
  a.actual_started_at,
  a.actual_completed_at,
  CASE WHEN a.status = 'not_completed' THEN 'not_completed'
       WHEN a.status IN ('completed','report_submitted','report_approved','invoice_ready','invoiced','paid','closed') THEN 'completed'
       ELSE NULL END,
  'all_required_participants',
  p.user_id,
  ap.personnel_id,
  jsonb_build_object('backfilled_from_assignment_status', a.status, 'assignment_personnel_status', ap.status),
  COALESCE(ap.assigned_at, a.created_at, now()),
  now()
FROM public.assignment_personnel ap
JOIN public.assignments a ON a.id = ap.assignment_id
JOIN public.personnel p ON p.id = ap.personnel_id AND p.tenant_id = a.tenant_id
ON CONFLICT (assignment_personnel_id) DO NOTHING;

ALTER TABLE IF EXISTS public.reports ADD COLUMN IF NOT EXISTS assignment_participant_execution_id uuid;
ALTER TABLE IF EXISTS public.reports ADD COLUMN IF NOT EXISTS assignment_personnel_id uuid;
ALTER TABLE IF EXISTS public.reports ADD COLUMN IF NOT EXISTS personnel_id uuid;
ALTER TABLE IF EXISTS public.reports ADD COLUMN IF NOT EXISTS visibility_scope varchar(32) NOT NULL DEFAULT 'internal_until_approved';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_assignment_participant_execution_fkey' AND conrelid = 'public.reports'::regclass) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_assignment_participant_execution_fkey
      FOREIGN KEY (assignment_participant_execution_id)
      REFERENCES public.assignment_participant_executions(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_assignment_personnel_fkey' AND conrelid = 'public.reports'::regclass) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_assignment_personnel_fkey
      FOREIGN KEY (assignment_personnel_id)
      REFERENCES public.assignment_personnel(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_personnel_fkey' AND conrelid = 'public.reports'::regclass) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_personnel_fkey
      FOREIGN KEY (personnel_id)
      REFERENCES public.personnel(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_visibility_scope_check' AND conrelid = 'public.reports'::regclass) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_visibility_scope_check
      CHECK (visibility_scope IN ('internal_until_approved','customer_approved','internal_only'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS reports_participant_execution_idx
  ON public.reports (tenant_id, assignment_participant_execution_id);
CREATE INDEX IF NOT EXISTS reports_personnel_owner_idx
  ON public.reports (tenant_id, personnel_id, assignment_personnel_id);

UPDATE public.reports r
SET assignment_participant_execution_id = ape.id,
    assignment_personnel_id = ape.assignment_personnel_id,
    personnel_id = ape.personnel_id,
    visibility_scope = CASE WHEN r.status = 'approved' THEN 'customer_approved' ELSE 'internal_until_approved' END
FROM public.assignment_participant_executions ape
JOIN public.personnel p ON p.id = ape.personnel_id
WHERE r.assignment_id = ape.assignment_id
  AND r.tenant_id = ape.tenant_id
  AND r.submitted_by = p.user_id
  AND r.assignment_participant_execution_id IS NULL;

ALTER TABLE IF EXISTS public.assignment_photos ADD COLUMN IF NOT EXISTS assignment_participant_execution_id uuid;
ALTER TABLE IF EXISTS public.assignment_photos ADD COLUMN IF NOT EXISTS assignment_personnel_id uuid;
ALTER TABLE IF EXISTS public.assignment_photos ADD COLUMN IF NOT EXISTS personnel_id uuid;
ALTER TABLE IF EXISTS public.assignment_photos ADD COLUMN IF NOT EXISTS visibility_scope varchar(32) NOT NULL DEFAULT 'internal_until_approved';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_photos_assignment_participant_execution_fkey' AND conrelid = 'public.assignment_photos'::regclass) THEN
    ALTER TABLE public.assignment_photos
      ADD CONSTRAINT assignment_photos_assignment_participant_execution_fkey
      FOREIGN KEY (assignment_participant_execution_id)
      REFERENCES public.assignment_participant_executions(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_photos_assignment_personnel_fkey' AND conrelid = 'public.assignment_photos'::regclass) THEN
    ALTER TABLE public.assignment_photos
      ADD CONSTRAINT assignment_photos_assignment_personnel_fkey
      FOREIGN KEY (assignment_personnel_id)
      REFERENCES public.assignment_personnel(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_photos_personnel_fkey' AND conrelid = 'public.assignment_photos'::regclass) THEN
    ALTER TABLE public.assignment_photos
      ADD CONSTRAINT assignment_photos_personnel_fkey
      FOREIGN KEY (personnel_id)
      REFERENCES public.personnel(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_photos_visibility_scope_check' AND conrelid = 'public.assignment_photos'::regclass) THEN
    ALTER TABLE public.assignment_photos
      ADD CONSTRAINT assignment_photos_visibility_scope_check
      CHECK (visibility_scope IN ('internal_until_approved','customer_approved','internal_only'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS assignment_photos_participant_execution_idx
  ON public.assignment_photos (tenant_id, assignment_participant_execution_id);
CREATE INDEX IF NOT EXISTS assignment_photos_personnel_owner_idx
  ON public.assignment_photos (tenant_id, personnel_id, assignment_personnel_id);

UPDATE public.assignment_photos photo
SET assignment_participant_execution_id = ape.id,
    assignment_personnel_id = ape.assignment_personnel_id,
    personnel_id = ape.personnel_id,
    visibility_scope = CASE WHEN photo.is_approved THEN 'customer_approved' ELSE 'internal_until_approved' END
FROM public.assignment_participant_executions ape
JOIN public.personnel p ON p.id = ape.personnel_id
WHERE photo.assignment_id = ape.assignment_id
  AND photo.tenant_id = ape.tenant_id
  AND photo.uploaded_by = p.user_id
  AND photo.assignment_participant_execution_id IS NULL;

CREATE OR REPLACE FUNCTION public.trg_assignment_participant_execution_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assignment_tenant uuid;
  personnel_tenant uuid;
  ap_assignment uuid;
  ap_personnel uuid;
  ap_status text;
BEGIN
  SELECT tenant_id INTO assignment_tenant FROM public.assignments WHERE id = NEW.assignment_id;
  SELECT tenant_id INTO personnel_tenant FROM public.personnel WHERE id = NEW.personnel_id;
  SELECT assignment_id, personnel_id, status INTO ap_assignment, ap_personnel, ap_status
    FROM public.assignment_personnel WHERE id = NEW.assignment_personnel_id;

  IF assignment_tenant IS NULL OR personnel_tenant IS NULL OR ap_assignment IS NULL THEN
    RAISE EXCEPTION 'participant execution parent row missing' USING ERRCODE = '23514';
  END IF;
  IF assignment_tenant <> NEW.tenant_id OR personnel_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'participant execution tenant mismatch' USING ERRCODE = '23514';
  END IF;
  IF ap_assignment <> NEW.assignment_id OR ap_personnel <> NEW.personnel_id THEN
    RAISE EXCEPTION 'participant execution assignment_personnel mismatch' USING ERRCODE = '23514';
  END IF;
  IF ap_status <> 'assigned' AND NEW.participant_status <> 'removed' THEN
    RAISE EXCEPTION 'inactive assignment personnel cannot execute' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assignment_participant_execution_guard ON public.assignment_participant_executions;
CREATE TRIGGER assignment_participant_execution_guard
  BEFORE INSERT OR UPDATE ON public.assignment_participant_executions
  FOR EACH ROW EXECUTE FUNCTION public.trg_assignment_participant_execution_guard();

CREATE OR REPLACE FUNCTION public.recompute_assignment_execution_projection(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  earliest_seen timestamptz;
  earliest_start timestamptz;
  projected_end timestamptz;
  unfinished_count integer;
  completed_count integer;
  not_completed_count integer;
  current_status text;
BEGIN
  SELECT min(seen_at), min(actual_started_at),
         max(actual_completed_at) FILTER (WHERE completion_policy = 'all_required_participants'),
         count(*) FILTER (WHERE participant_status IN ('assigned','seen','en_route','in_progress','paused')),
         count(*) FILTER (WHERE participant_status = 'completed'),
         count(*) FILTER (WHERE participant_status = 'not_completed')
    INTO earliest_seen, earliest_start, projected_end, unfinished_count, completed_count, not_completed_count
  FROM public.assignment_participant_executions
  WHERE assignment_id = p_assignment_id
    AND participant_status <> 'removed';

  SELECT status INTO current_status FROM public.assignments WHERE id = p_assignment_id FOR UPDATE;

  UPDATE public.assignments
  SET seen_at = COALESCE(public.assignments.seen_at, earliest_seen),
      actual_started_at = COALESCE(earliest_start, public.assignments.actual_started_at),
      actual_completed_at = CASE WHEN unfinished_count = 0 AND (completed_count > 0 OR not_completed_count > 0) THEN projected_end ELSE NULL END,
      status = CASE
        WHEN unfinished_count = 0 AND not_completed_count > 0 AND completed_count = 0 THEN 'not_completed'
        WHEN unfinished_count = 0 AND completed_count > 0 THEN 'completed'
        WHEN earliest_start IS NOT NULL THEN 'in_progress'
        WHEN current_status IN ('scheduled','seen','en_route','in_progress','completed','not_completed') THEN current_status
        ELSE current_status
      END,
      updated_at = now()
  WHERE id = p_assignment_id;
END $$;

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
SET search_path = public
AS $$
DECLARE
  exec_row public.assignment_participant_executions%ROWTYPE;
  old_assignment_started_at timestamptz;
  new_status text;
  now_value timestamptz := now();
BEGIN
  IF p_action NOT IN ('seen','en_route','start','pause','resume','complete','not_complete') THEN
    RAISE EXCEPTION 'unsupported participant action %', p_action USING ERRCODE = '22023';
  END IF;

  SELECT ape.* INTO exec_row
  FROM public.assignment_participant_executions ape
  JOIN public.assignment_personnel ap ON ap.id = ape.assignment_personnel_id AND ap.status = 'assigned'
  JOIN public.personnel p ON p.id = ape.personnel_id AND p.is_active = true AND p.user_id = p_actor_user_id
  JOIN public.assignments a ON a.id = ape.assignment_id AND a.tenant_id = ape.tenant_id AND a.is_active = true
  WHERE ape.assignment_id = p_assignment_id
    AND ape.personnel_id = p_personnel_id
    AND ape.participant_status <> 'removed'
  FOR UPDATE;

  IF exec_row.id IS NULL THEN
    RAISE EXCEPTION 'participant execution not found for actor' USING ERRCODE = '42501';
  END IF;

  SELECT actual_started_at INTO old_assignment_started_at FROM public.assignments WHERE id = p_assignment_id FOR UPDATE;

  IF p_idempotency_key IS NOT NULL AND exec_row.idempotency_key = p_idempotency_key THEN
    RETURN QUERY SELECT exec_row.id, exec_row.assignment_personnel_id, exec_row.tenant_id,
      exec_row.participant_status::text, a.status::text, false, a.actual_completed_at IS NOT NULL, exec_row.version
      FROM public.assignments a WHERE a.id = p_assignment_id;
    RETURN;
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

  IF p_action IN ('complete','not_complete') AND exec_row.actual_started_at IS NULL THEN
    RAISE EXCEPTION 'participant must start before completion' USING ERRCODE = '23514';
  END IF;

  UPDATE public.assignment_participant_executions
  SET participant_status = new_status,
      seen_at = CASE WHEN p_action IN ('seen','en_route','start') THEN COALESCE(seen_at, now_value) ELSE seen_at END,
      actual_started_at = CASE WHEN p_action = 'start' THEN COALESCE(actual_started_at, now_value) ELSE actual_started_at END,
      paused_at = CASE WHEN p_action = 'pause' THEN now_value WHEN p_action = 'resume' THEN NULL ELSE paused_at END,
      resumed_at = CASE WHEN p_action = 'resume' THEN now_value ELSE resumed_at END,
      actual_completed_at = CASE WHEN p_action IN ('complete','not_complete') THEN COALESCE(actual_completed_at, now_value) ELSE actual_completed_at END,
      completion_outcome = CASE WHEN p_action = 'complete' THEN 'completed' WHEN p_action = 'not_complete' THEN 'not_completed' ELSE completion_outcome END,
      completion_reason = CASE WHEN p_action = 'not_complete' THEN p_completion_reason ELSE completion_reason END,
      completion_notes = CASE WHEN p_action IN ('complete','not_complete') THEN p_completion_notes ELSE completion_notes END,
      idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
      version = version + 1,
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
  FROM public.assignments a WHERE a.id = p_assignment_id;
END $$;

REVOKE ALL ON FUNCTION public.trg_assignment_participant_execution_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_assignment_execution_projection(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.execute_assignment_participant_action(uuid, uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_assignment_participant_action(uuid, uuid, uuid, text, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_assignment_personnel_execution_seed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assignment_tenant uuid;
BEGIN
  SELECT tenant_id INTO assignment_tenant FROM public.assignments WHERE id = NEW.assignment_id;
  INSERT INTO public.assignment_participant_executions (
    tenant_id,
    assignment_id,
    personnel_id,
    assignment_personnel_id,
    participant_status,
    last_actor_user_id,
    last_actor_personnel_id,
    audit_metadata
  ) VALUES (
    assignment_tenant,
    NEW.assignment_id,
    NEW.personnel_id,
    NEW.id,
    CASE WHEN NEW.status = 'assigned' THEN 'assigned' ELSE 'removed' END,
    NEW.assigned_by,
    NEW.personnel_id,
    jsonb_build_object('seeded_from_assignment_personnel_status', NEW.status)
  )
  ON CONFLICT (assignment_personnel_id) DO UPDATE
    SET participant_status = CASE
          WHEN EXCLUDED.participant_status = 'removed' AND assignment_participant_executions.actual_started_at IS NULL THEN 'removed'
          WHEN assignment_participant_executions.participant_status = 'removed' AND EXCLUDED.participant_status = 'assigned' THEN 'assigned'
          ELSE assignment_participant_executions.participant_status
        END,
        updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assignment_personnel_execution_seed ON public.assignment_personnel;
CREATE TRIGGER assignment_personnel_execution_seed
  AFTER INSERT OR UPDATE OF status ON public.assignment_personnel
  FOR EACH ROW EXECUTE FUNCTION public.trg_assignment_personnel_execution_seed();

REVOKE ALL ON FUNCTION public.trg_assignment_personnel_execution_seed() FROM PUBLIC, anon, authenticated;
