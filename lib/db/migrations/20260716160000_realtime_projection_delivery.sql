-- Fieldgrid Phase 2 W05: canonical realtime projection delivery metadata.
-- Delivery stays on the existing portal_realtime_events/Supabase publication path.
-- Rows are inserted in the same transaction as the canonical business change;
-- clients only receive them after commit and recover missed state by refreshing
-- on (re)subscription/visibility.

ALTER TABLE public.portal_realtime_events
  ADD COLUMN IF NOT EXISTS correlation_id uuid DEFAULT gen_random_uuid() NOT NULL;

CREATE INDEX IF NOT EXISTS portal_realtime_events_tenant_correlation_idx
  ON public.portal_realtime_events(tenant_id, correlation_id, created_at DESC);

COMMENT ON COLUMN public.portal_realtime_events.correlation_id IS
  'Audit correlation id for the canonical business transaction that produced this projection event.';

CREATE OR REPLACE FUNCTION public.fieldgrid_realtime_event_name(
  p_topic text,
  p_resource_type text,
  p_action text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN p_topic = 'planning' THEN 'assignment_planning_changed'
    WHEN p_resource_type = 'assignment_personnel' THEN 'staffing_changed'
    WHEN p_resource_type = 'assignments' AND p_action IN ('scheduled', 'rescheduled', 'changed') THEN 'assignment_scheduled'
    WHEN p_resource_type = 'assignment_participants' AND p_action = 'started' THEN 'participant_started'
    WHEN p_resource_type = 'assignment_participants' AND p_action = 'completed' THEN 'participant_completed'
    WHEN p_resource_type = 'assignments' AND p_action = 'completed' THEN 'aggregate_assignment_completed'
    WHEN p_topic = 'availability' THEN 'availability_changed'
    WHEN p_resource_type = 'reports' AND p_action IN ('approved', 'accepted') THEN 'report_approved'
    WHEN p_topic IN ('assignment', 'assignments', 'reports', 'customer_projection') THEN 'customer_visible_projection_changed'
    ELSE concat_ws('_', NULLIF(p_topic, ''), NULLIF(p_resource_type, ''), NULLIF(p_action, ''), 'changed')
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.fieldgrid_realtime_event_name(text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.portal_realtime_emit(
  p_tenant_id uuid,
  p_recipient_type text,
  p_realtime_key text,
  p_personnel_id uuid,
  p_customer_id uuid,
  p_topic text,
  p_resource_type text,
  p_resource_id text,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
BEGIN
  IF p_tenant_id IS NULL OR p_realtime_key IS NULL OR p_topic IS NULL THEN
    RETURN;
  END IF;

  v_event_type := public.fieldgrid_realtime_event_name(p_topic, p_resource_type, p_action);

  INSERT INTO portal_realtime_events (
    tenant_id,
    recipient_type,
    realtime_key,
    personnel_id,
    customer_id,
    topic,
    resource_type,
    resource_id,
    action,
    event_type,
    payload
  ) VALUES (
    p_tenant_id,
    p_recipient_type,
    p_realtime_key,
    p_personnel_id,
    p_customer_id,
    p_topic,
    p_resource_type,
    p_resource_id,
    p_action,
    v_event_type,
    coalesce(p_payload, '{}'::jsonb) - 'secret' - 'token' - 'access_token' - 'refresh_token' - 'password' - 'email' - 'phone'
  );

  DELETE FROM portal_realtime_events
  WHERE id IN (
    SELECT id
    FROM portal_realtime_events
    WHERE expires_at < now()
    ORDER BY expires_at ASC
    LIMIT 250
  );
END;
$$;

REVOKE ALL ON FUNCTION public.portal_realtime_emit(uuid, text, text, uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id uuid;
  v_old_customer_id uuid;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.portal_realtime_emit_management(
      OLD.tenant_id,
      'assignments',
      'assignment',
      OLD.id::text,
      'delete',
      jsonb_build_object('assignmentId', OLD.id, 'code', OLD.code)
    );
    PERFORM public.portal_realtime_emit_customer(
      OLD.customer_id,
      'assignments',
      'assignment',
      OLD.id::text,
      'delete',
      jsonb_build_object('assignmentId', OLD.id, 'code', OLD.code)
    );
    RETURN OLD;
  END IF;

  v_assignment_id := NEW.id;
  v_action := lower(TG_OP);

  IF TG_OP = 'UPDATE' THEN
    v_old_customer_id := OLD.customer_id;
    IF NEW.actual_started_at IS NOT NULL AND OLD.actual_started_at IS DISTINCT FROM NEW.actual_started_at THEN
      v_action := 'started';
    ELSIF NEW.actual_completed_at IS NOT NULL AND OLD.actual_completed_at IS DISTINCT FROM NEW.actual_completed_at THEN
      v_action := 'completed';
    ELSIF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
       OR NEW.scheduled_start IS DISTINCT FROM OLD.scheduled_start
       OR NEW.scheduled_end IS DISTINCT FROM OLD.scheduled_end THEN
      v_action := 'scheduled';
    END IF;
  END IF;

  PERFORM public.portal_realtime_emit_assignment(
    v_assignment_id,
    'assignments',
    'assignment',
    v_action,
    '{}'::jsonb
  );

  IF TG_OP = 'UPDATE' AND v_old_customer_id IS NOT NULL AND v_old_customer_id <> NEW.customer_id THEN
    PERFORM public.portal_realtime_emit_customer(
      v_old_customer_id,
      'assignments',
      'assignment',
      NEW.id::text,
      'update',
      jsonb_build_object('assignmentId', NEW.id, 'movedFromCustomer', true)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_portal_realtime_assignments() FROM PUBLIC;

DROP POLICY IF EXISTS portal_realtime_events_customer_read ON public.portal_realtime_events;
CREATE POLICY portal_realtime_events_customer_read
  ON public.portal_realtime_events
  FOR SELECT TO authenticated
  USING (
    recipient_type = 'customer'
    AND customer_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.customer_users cu
      WHERE cu.customer_id = portal_realtime_events.customer_id
        AND cu.tenant_id = portal_realtime_events.tenant_id
        AND cu.status IN ('active', 'invited')
        AND (cu.user_id = auth.uid() OR lower(cu.email) = lower(auth.email()))
    )
  );
