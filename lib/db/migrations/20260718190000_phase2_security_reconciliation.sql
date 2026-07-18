-- Fieldgrid Phase 2C: forward-only reconciliation of tenant RLS, definer ACLs,
-- deactivation semantics and customer-visible data boundaries.

-- Untrusted login roles must not be able to shadow objects referenced by a
-- SECURITY DEFINER function. Migration ownership remains with the configured
-- database migration role; runtime roles retain USAGE only.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_management()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name = 'Management'
  );
$$;

REVOKE ALL ON FUNCTION public.is_management() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_management() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_management_for_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p_tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      JOIN public.tenant_users tu
        ON tu.user_id = ur.user_id
       AND tu.tenant_id = p_tenant_id
       AND tu.status = 'active'
      JOIN public.tenants t
        ON t.id = tu.tenant_id
       AND t.is_active IS TRUE
       AND t.status IN ('provisioning', 'trial', 'active')
      WHERE ur.user_id = auth.uid()
        AND r.name = 'Management'
    );
$$;

REVOKE ALL ON FUNCTION public.is_management_for_tenant(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_management_for_tenant(uuid) TO authenticated;

ALTER FUNCTION public.current_user_tenant_ids()
  SET search_path = pg_catalog, public, auth, pg_temp;
REVOKE ALL ON FUNCTION public.current_user_tenant_ids() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_tenant_ids() TO authenticated;

-- Current portal provisioning explicitly binds the returned auth user id to a
-- tenant-scoped personnel record after challenge issuance. The historical
-- email-only auth.users trigger could cross-link customer/backoffice accounts.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
ALTER FUNCTION app_private.link_personnel_on_signup()
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION app_private.link_personnel_on_signup()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fieldgrid_redact_realtime_payload(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  redacted jsonb;
BEGIN
  IF p_value IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  IF jsonb_typeof(p_value) = 'object' THEN
    SELECT COALESCE(
      jsonb_object_agg(entry.key, public.fieldgrid_redact_realtime_payload(entry.value)),
      '{}'::jsonb
    )
    INTO redacted
    FROM jsonb_each(p_value) AS entry(key, value)
    WHERE regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g') <> ALL (ARRAY[
      'secret', 'token', 'accesstoken', 'refreshtoken', 'password', 'email',
      'phone', 'authorization', 'signature', 'recoverycode', 'credential',
      'jwt', 'cookie', 'apikey'
    ]);
    RETURN redacted;
  END IF;

  IF jsonb_typeof(p_value) = 'array' THEN
    SELECT COALESCE(
      jsonb_agg(public.fieldgrid_redact_realtime_payload(element.value)),
      '[]'::jsonb
    )
    INTO redacted
    FROM jsonb_array_elements(p_value) AS element(value);
    RETURN redacted;
  END IF;

  RETURN p_value;
END;
$$;

REVOKE ALL ON FUNCTION public.fieldgrid_redact_realtime_payload(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fieldgrid_realtime_event_name(
  p_topic text,
  p_resource_type text,
  p_action text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN CASE
    WHEN p_resource_type IN ('assignment_personnel', 'assignment_participants')
      AND p_action = 'started' THEN 'participant_started'
    WHEN p_resource_type IN ('assignment_personnel', 'assignment_participants')
      AND p_action = 'completed' THEN 'participant_completed'
    WHEN p_resource_type = 'assignment_personnel' THEN 'staffing_changed'
    WHEN p_resource_type IN ('assignment', 'assignments')
      AND p_action IN ('scheduled', 'rescheduled', 'changed') THEN 'assignment_scheduled'
    WHEN p_resource_type IN ('assignment', 'assignments')
      AND p_action = 'completed' THEN 'aggregate_assignment_completed'
    WHEN p_topic = 'planning' THEN 'assignment_planning_changed'
    WHEN p_topic = 'availability' THEN 'availability_changed'
    WHEN p_resource_type = 'reports' AND p_action IN ('approved', 'accepted') THEN 'report_approved'
    WHEN p_topic IN ('assignment', 'assignments', 'reports', 'customer_projection') THEN 'customer_visible_projection_changed'
    ELSE concat_ws('_', NULLIF(p_topic, ''), NULLIF(p_resource_type, ''), NULLIF(p_action, ''), 'changed')
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.fieldgrid_realtime_event_name(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE SEQUENCE IF NOT EXISTS public.portal_realtime_projection_version_seq;
ALTER TABLE public.portal_realtime_events
  ADD COLUMN IF NOT EXISTS projection_version bigint;
UPDATE public.portal_realtime_events
SET projection_version = nextval('public.portal_realtime_projection_version_seq')
WHERE projection_version IS NULL;
ALTER TABLE public.portal_realtime_events
  ALTER COLUMN projection_version SET DEFAULT nextval('public.portal_realtime_projection_version_seq'),
  ALTER COLUMN projection_version SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS portal_realtime_events_projection_version_idx
  ON public.portal_realtime_events(projection_version);

CREATE OR REPLACE FUNCTION public.portal_realtime_emit(
  p_tenant_id uuid,
  p_recipient_type text,
  p_realtime_key text,
  p_personnel_id uuid,
  p_customer_id uuid,
  p_topic text,
  p_entity_type text,
  p_entity_id text,
  p_event_type text DEFAULT 'changed',
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_resource_type text := p_entity_type;
  v_resource_id text := p_entity_id;
  v_action text := COALESCE(NULLIF(p_event_type, ''), 'changed');
  v_event_type text;
  v_correlation_id uuid;
  v_correlation_setting text;
BEGIN
  IF p_tenant_id IS NULL OR p_realtime_key IS NULL OR p_topic IS NULL THEN
    RETURN;
  END IF;

  IF p_recipient_type = 'management' THEN
    IF p_realtime_key <> 'management_' || p_tenant_id::text
      OR p_personnel_id IS NOT NULL OR p_customer_id IS NOT NULL THEN
      RETURN;
    END IF;
  ELSIF p_recipient_type = 'customer' THEN
    IF p_customer_id IS NULL OR p_personnel_id IS NOT NULL
      OR p_realtime_key <> 'customer_' || p_customer_id::text
      OR NOT EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = p_customer_id AND c.tenant_id = p_tenant_id
      ) THEN
      RETURN;
    END IF;
  ELSIF p_recipient_type = 'personnel' THEN
    IF p_personnel_id IS NULL OR p_customer_id IS NOT NULL
      OR p_realtime_key <> 'personnel_' || p_personnel_id::text
      OR NOT EXISTS (
        SELECT 1 FROM public.personnel p
        WHERE p.id = p_personnel_id AND p.tenant_id = p_tenant_id
      ) THEN
      RETURN;
    END IF;
  ELSE
    RETURN;
  END IF;

  v_event_type := public.fieldgrid_realtime_event_name(p_topic, v_resource_type, v_action);
  v_correlation_setting := current_setting('fieldgrid.realtime_correlation_id', true);
  IF v_correlation_setting IS NULL OR v_correlation_setting = '' THEN
    v_correlation_id := gen_random_uuid();
    PERFORM set_config('fieldgrid.realtime_correlation_id', v_correlation_id::text, true);
  ELSE
    v_correlation_id := v_correlation_setting::uuid;
  END IF;

  INSERT INTO public.portal_realtime_events (
    tenant_id, recipient_type, realtime_key, personnel_id, customer_id,
    topic, resource_type, resource_id, action, event_type, payload,
    correlation_id, projection_version
  ) VALUES (
    p_tenant_id, p_recipient_type, p_realtime_key, p_personnel_id, p_customer_id,
    p_topic, v_resource_type, v_resource_id, v_action, v_event_type,
    public.fieldgrid_redact_realtime_payload(COALESCE(p_payload, '{}'::jsonb)),
    v_correlation_id, nextval('public.portal_realtime_projection_version_seq')
  );

  DELETE FROM public.portal_realtime_events
  WHERE id IN (
    SELECT id FROM public.portal_realtime_events
    WHERE expires_at < now()
    ORDER BY expires_at ASC
    LIMIT 250
  );
END;
$$;

-- The realtime trigger family still uses qualified public helper calls plus
-- legacy unqualified table names. public is now non-writable to runtime roles,
-- and pg_temp is explicitly searched last.
ALTER FUNCTION public.portal_realtime_emit(uuid, text, text, uuid, uuid, text, text, text, text, jsonb) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.portal_realtime_emit_management(uuid, text, text, text, text, jsonb) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.portal_realtime_emit_customer(uuid, text, text, text, text, jsonb) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.portal_realtime_emit_personnel(uuid, text, text, text, text, jsonb) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.portal_realtime_emit_assignment(uuid, text, text, text, jsonb) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_assignments() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_assignment_personnel() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_assignment_child() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_quote_invoice_report() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_payment() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_assignment_sidecar() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_assignment_interest_response() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_tenant_owned() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_customer_portal_preferences() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_customer_payment_batch() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_customer_payment_batch_item() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_customer_owned() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_personnel_owned() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_personnel_ticket_entry() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.trg_portal_realtime_customer_ticket_entry() SET search_path = pg_catalog, public, pg_temp;

DO $$
DECLARE
  function_signature regprocedure;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.portal_realtime_emit(uuid,text,text,uuid,uuid,text,text,text,text,jsonb)'::regprocedure,
    'public.portal_realtime_emit_management(uuid,text,text,text,text,jsonb)'::regprocedure,
    'public.portal_realtime_emit_customer(uuid,text,text,text,text,jsonb)'::regprocedure,
    'public.portal_realtime_emit_personnel(uuid,text,text,text,text,jsonb)'::regprocedure,
    'public.portal_realtime_emit_assignment(uuid,text,text,text,jsonb)'::regprocedure,
    'public.trg_portal_realtime_assignments()'::regprocedure,
    'public.trg_portal_realtime_assignment_personnel()'::regprocedure,
    'public.trg_portal_realtime_assignment_child()'::regprocedure,
    'public.trg_portal_realtime_quote_invoice_report()'::regprocedure,
    'public.trg_portal_realtime_payment()'::regprocedure,
    'public.trg_portal_realtime_assignment_sidecar()'::regprocedure,
    'public.trg_portal_realtime_assignment_interest_response()'::regprocedure,
    'public.trg_portal_realtime_tenant_owned()'::regprocedure,
    'public.trg_portal_realtime_customer_portal_preferences()'::regprocedure,
    'public.trg_portal_realtime_customer_payment_batch()'::regprocedure,
    'public.trg_portal_realtime_customer_payment_batch_item()'::regprocedure,
    'public.trg_portal_realtime_customer_owned()'::regprocedure,
    'public.trg_portal_realtime_personnel_owned()'::regprocedure,
    'public.trg_portal_realtime_personnel_ticket_entry()'::regprocedure,
    'public.trg_portal_realtime_customer_ticket_entry()'::regprocedure
  ]
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      function_signature
    );
  END LOOP;
END;
$$;

-- Legacy global Management remains as a compatibility signal, but every
-- Phase 2 tenant row now also requires an active membership in that row's
-- tenant. Tables without a denormalized tenant id resolve it through the
-- canonical assignment/personnel relationship.
DROP POLICY IF EXISTS assignments_management_all ON public.assignments;
CREATE POLICY assignments_management_all ON public.assignments TO authenticated
  USING (public.is_management_for_tenant(tenant_id))
  WITH CHECK (public.is_management_for_tenant(tenant_id));

DROP POLICY IF EXISTS assignment_tasks_management_all ON public.assignment_tasks;
CREATE POLICY assignment_tasks_management_all ON public.assignment_tasks TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_tasks.assignment_id AND public.is_management_for_tenant(a.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_tasks.assignment_id AND public.is_management_for_tenant(a.tenant_id)));

DROP POLICY IF EXISTS assignment_extra_work_management ON public.assignment_extra_work;
CREATE POLICY assignment_extra_work_management ON public.assignment_extra_work TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_extra_work.assignment_id AND public.is_management_for_tenant(a.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_extra_work.assignment_id AND public.is_management_for_tenant(a.tenant_id)));

DROP POLICY IF EXISTS assignment_photos_management ON public.assignment_photos;
CREATE POLICY assignment_photos_management ON public.assignment_photos TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_photos.assignment_id AND public.is_management_for_tenant(a.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_photos.assignment_id AND public.is_management_for_tenant(a.tenant_id)));

DROP POLICY IF EXISTS reports_management_all ON public.reports;
CREATE POLICY reports_management_all ON public.reports TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = reports.assignment_id AND public.is_management_for_tenant(a.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = reports.assignment_id AND public.is_management_for_tenant(a.tenant_id)));

DROP POLICY IF EXISTS assignment_report_notes_management_all ON public.assignment_report_notes;
CREATE POLICY assignment_report_notes_management_all ON public.assignment_report_notes TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_report_notes.assignment_id AND public.is_management_for_tenant(a.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_report_notes.assignment_id AND public.is_management_for_tenant(a.tenant_id)));

DROP POLICY IF EXISTS assignment_report_note_attachments_management_all ON public.assignment_report_note_attachments;
CREATE POLICY assignment_report_note_attachments_management_all ON public.assignment_report_note_attachments TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_report_note_attachments.assignment_id AND public.is_management_for_tenant(a.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_report_note_attachments.assignment_id AND public.is_management_for_tenant(a.tenant_id)));

DROP POLICY IF EXISTS assignment_material_usage_management_all ON public.assignment_material_usage;
CREATE POLICY assignment_material_usage_management_all ON public.assignment_material_usage TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_material_usage.assignment_id AND public.is_management_for_tenant(a.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_material_usage.assignment_id AND public.is_management_for_tenant(a.tenant_id)));

DROP POLICY IF EXISTS assignment_inventory_items_management_all ON public.assignment_inventory_items;
CREATE POLICY assignment_inventory_items_management_all ON public.assignment_inventory_items TO authenticated
  USING (public.is_management_for_tenant(tenant_id))
  WITH CHECK (public.is_management_for_tenant(tenant_id));

DROP POLICY IF EXISTS assignment_candidates_management ON public.assignment_candidates;
CREATE POLICY assignment_candidates_management ON public.assignment_candidates TO authenticated
  USING (public.is_management_for_tenant(tenant_id))
  WITH CHECK (public.is_management_for_tenant(tenant_id));

DROP POLICY IF EXISTS assignment_capacity_checks_management ON public.assignment_capacity_checks;
CREATE POLICY assignment_capacity_checks_management ON public.assignment_capacity_checks TO authenticated
  USING (public.is_management_for_tenant(tenant_id))
  WITH CHECK (public.is_management_for_tenant(tenant_id));

DROP POLICY IF EXISTS assignment_interest_rounds_management ON public.assignment_interest_rounds;
CREATE POLICY assignment_interest_rounds_management ON public.assignment_interest_rounds TO authenticated
  USING (public.is_management_for_tenant(tenant_id))
  WITH CHECK (public.is_management_for_tenant(tenant_id));

DROP POLICY IF EXISTS assignment_interest_responses_management ON public.assignment_interest_responses;
CREATE POLICY assignment_interest_responses_management ON public.assignment_interest_responses TO authenticated
  USING (public.is_management_for_tenant(tenant_id))
  WITH CHECK (public.is_management_for_tenant(tenant_id));

DROP POLICY IF EXISTS objects_management ON public.objects;
CREATE POLICY objects_management ON public.objects TO authenticated
  USING (public.is_management_for_tenant(tenant_id))
  WITH CHECK (public.is_management_for_tenant(tenant_id));

DROP POLICY IF EXISTS assignment_photos_management_all ON storage.objects;
CREATE POLICY assignment_photos_management_all ON storage.objects TO authenticated
  USING (
    bucket_id = 'assignment-photos'
    AND public.is_management_for_tenant(public.fieldgrid_storage_tenant_id_from_path(name))
  )
  WITH CHECK (
    bucket_id = 'assignment-photos'
    AND public.is_management_for_tenant(public.fieldgrid_storage_tenant_id_from_path(name))
  );

DROP POLICY IF EXISTS portal_realtime_events_management_read ON public.portal_realtime_events;
CREATE POLICY portal_realtime_events_management_read ON public.portal_realtime_events
  FOR SELECT TO authenticated
  USING (recipient_type = 'management' AND public.is_management_for_tenant(tenant_id));

-- Direct customer access to raw workflow tables exposed internal columns.
-- Customer server actions already build explicit projections through their
-- authenticated server boundary; direct Data API access is denied here.
DROP POLICY IF EXISTS assignments_customer_users_select ON public.assignments;
DROP POLICY IF EXISTS assignment_tasks_customer_users_select ON public.assignment_tasks;
DROP POLICY IF EXISTS assignment_extra_work_customer_users_select ON public.assignment_extra_work;
DROP POLICY IF EXISTS assignment_photos_customer_approved_select ON public.assignment_photos;
DROP POLICY IF EXISTS reports_customer_approved_select ON public.reports;

-- Preserve the customer portal's independently exercised Data API path without
-- restoring access to the raw assignments table.  This barrier view exposes
-- only the customer contract and derives membership from the exact active
-- auth-user link; JWT email and tenant metadata are deliberately ignored.
DROP VIEW IF EXISTS public.customer_assignment_projection;
CREATE VIEW public.customer_assignment_projection
WITH (security_barrier = true)
AS
SELECT
  a.id,
  a.tenant_id,
  a.customer_id,
  a.object_id,
  a.code,
  a.title,
  a.description,
  a.status,
  a.priority,
  a.scheduled_date,
  a.scheduled_start,
  a.scheduled_end,
  a.actual_started_at,
  a.actual_completed_at,
  a.created_at
FROM public.assignments a
WHERE EXISTS (
  SELECT 1
  FROM public.customer_users cu
  JOIN public.customers c
    ON c.id = cu.customer_id
   AND c.tenant_id = cu.tenant_id
   AND c.is_active IS TRUE
  JOIN public.tenants t
    ON t.id = cu.tenant_id
   AND t.is_active IS TRUE
  WHERE cu.user_id = auth.uid()
    AND cu.status = 'active'
    AND cu.tenant_id = a.tenant_id
    AND cu.customer_id = a.customer_id
);

REVOKE ALL ON public.customer_assignment_projection FROM PUBLIC, anon;
GRANT SELECT ON public.customer_assignment_projection TO authenticated;

DROP POLICY IF EXISTS reports_personnel_own_select ON public.reports;
CREATE POLICY reports_personnel_own_select ON public.reports
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    AND public.personnel_assigned_to_assignment(assignment_id)
  );

-- A personnel insert may only create an internal, unapproved photo bound to
-- that same active personnel identity and assignment.
DROP POLICY IF EXISTS personnel_insert_photos ON public.assignment_photos;
CREATE POLICY personnel_insert_photos ON public.assignment_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND is_approved IS FALSE
    AND visibility_scope = 'internal_until_approved'
    AND public.personnel_assigned_to_assignment(assignment_id)
    AND EXISTS (
      SELECT 1
      FROM public.personnel p
      JOIN public.assignments a ON a.id = assignment_photos.assignment_id
      WHERE p.user_id = auth.uid()
        AND p.id = assignment_photos.personnel_id
        AND p.tenant_id = a.tenant_id
        AND p.is_active IS TRUE
        AND (assignment_photos.tenant_id IS NULL OR assignment_photos.tenant_id = a.tenant_id)
    )
  );

DROP POLICY IF EXISTS assignment_material_usage_personnel_assigned_insert ON public.assignment_material_usage;
CREATE POLICY assignment_material_usage_personnel_assigned_insert ON public.assignment_material_usage
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND approval_status = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND approved_name IS NULL
    AND approved_quantity IS NULL
    AND approved_unit_label IS NULL
    AND approved_unit_price IS NULL
    AND approved_vat_rate IS NULL
    AND invoiceable IS FALSE
    AND customer_visible IS FALSE
    AND invoice_id IS NULL
    AND public.personnel_assigned_to_assignment(assignment_id)
  );

-- Personnel must remain active for availability and owned-note mutation.
DROP POLICY IF EXISTS availability_day_entries_select_own ON public.availability_day_entries;
CREATE POLICY availability_day_entries_select_own ON public.availability_day_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND p.user_id = auth.uid() AND p.is_active IS TRUE)
    OR EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND public.is_management_for_tenant(p.tenant_id))
  );

DROP POLICY IF EXISTS availability_day_entries_insert_own ON public.availability_day_entries;
CREATE POLICY availability_day_entries_insert_own ON public.availability_day_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND p.user_id = auth.uid() AND p.is_active IS TRUE)
    OR EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND public.is_management_for_tenant(p.tenant_id))
  );

DROP POLICY IF EXISTS availability_day_entries_update_own ON public.availability_day_entries;
CREATE POLICY availability_day_entries_update_own ON public.availability_day_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND p.user_id = auth.uid() AND p.is_active IS TRUE)
    OR EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND public.is_management_for_tenant(p.tenant_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND p.user_id = auth.uid() AND p.is_active IS TRUE)
    OR EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND public.is_management_for_tenant(p.tenant_id))
  );

DROP POLICY IF EXISTS availability_day_entries_delete_own ON public.availability_day_entries;
CREATE POLICY availability_day_entries_delete_own ON public.availability_day_entries
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND p.user_id = auth.uid() AND p.is_active IS TRUE)
    OR EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND public.is_management_for_tenant(p.tenant_id))
  );

DROP POLICY IF EXISTS availability_windows_active_own_select ON public.availability_windows;
CREATE POLICY availability_windows_active_own_select ON public.availability_windows
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND p.user_id = auth.uid() AND p.is_active IS TRUE)
    OR EXISTS (SELECT 1 FROM public.personnel p WHERE p.id = personnel_id AND public.is_management_for_tenant(p.tenant_id))
  );
GRANT SELECT ON public.availability_windows TO authenticated;

DROP POLICY IF EXISTS assignment_report_notes_personnel_delete ON public.assignment_report_notes;
CREATE POLICY assignment_report_notes_personnel_delete ON public.assignment_report_notes
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND public.personnel_assigned_to_assignment(assignment_id));

DROP POLICY IF EXISTS assignment_report_note_attachments_personnel_delete ON public.assignment_report_note_attachments;
CREATE POLICY assignment_report_note_attachments_personnel_delete ON public.assignment_report_note_attachments
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() AND public.personnel_assigned_to_assignment(assignment_id));

-- Storage mutation is limited to the uploader; coworkers retain assignment read.
DROP POLICY IF EXISTS assignment_photos_assigned_personnel_insert ON storage.objects;
CREATE POLICY assignment_photos_assigned_personnel_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignment-photos'
    AND owner = auth.uid()
    AND public.personnel_can_access_assignment_storage(
      public.fieldgrid_storage_assignment_id_from_path(name),
      public.fieldgrid_storage_tenant_id_from_path(name)
    )
  );

DROP POLICY IF EXISTS assignment_photos_assigned_personnel_update ON storage.objects;
CREATE POLICY assignment_photos_assigned_personnel_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'assignment-photos'
    AND owner = auth.uid()
    AND public.personnel_can_access_assignment_storage(
      public.fieldgrid_storage_assignment_id_from_path(name),
      public.fieldgrid_storage_tenant_id_from_path(name)
    )
  )
  WITH CHECK (
    bucket_id = 'assignment-photos'
    AND owner = auth.uid()
    AND public.personnel_can_access_assignment_storage(
      public.fieldgrid_storage_assignment_id_from_path(name),
      public.fieldgrid_storage_tenant_id_from_path(name)
    )
  );

DROP POLICY IF EXISTS assignment_photos_assigned_personnel_delete ON storage.objects;
CREATE POLICY assignment_photos_assigned_personnel_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'assignment-photos'
    AND owner = auth.uid()
    AND public.personnel_can_access_assignment_storage(
      public.fieldgrid_storage_assignment_id_from_path(name),
      public.fieldgrid_storage_tenant_id_from_path(name)
    )
  );

-- Active linked identities only; stale JWT email and invited records are not
-- authorization inputs. Tenant/customer deactivation takes effect immediately.
DROP POLICY IF EXISTS portal_realtime_events_customer_read ON public.portal_realtime_events;
CREATE POLICY portal_realtime_events_customer_read ON public.portal_realtime_events
  FOR SELECT TO authenticated
  USING (
    recipient_type = 'customer'
    AND customer_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.customer_users cu
      JOIN public.customers c ON c.id = cu.customer_id AND c.tenant_id = cu.tenant_id
      JOIN public.tenants t ON t.id = cu.tenant_id
      WHERE cu.customer_id = portal_realtime_events.customer_id
        AND cu.tenant_id = portal_realtime_events.tenant_id
        AND cu.status = 'active'
        AND cu.user_id = auth.uid()
        AND c.is_active IS TRUE
        AND t.is_active IS TRUE
        AND t.status IN ('provisioning', 'trial', 'active')
    )
  );

DROP POLICY IF EXISTS portal_realtime_events_personnel_read ON public.portal_realtime_events;
CREATE POLICY portal_realtime_events_personnel_read ON public.portal_realtime_events
  FOR SELECT TO authenticated
  USING (
    recipient_type = 'personnel'
    AND EXISTS (
      SELECT 1
      FROM public.personnel p
      JOIN public.tenants t ON t.id = p.tenant_id
      WHERE p.id = portal_realtime_events.personnel_id
        AND p.tenant_id = portal_realtime_events.tenant_id
        AND p.user_id = auth.uid()
        AND p.is_active IS TRUE
        AND t.is_active IS TRUE
        AND t.status IN ('provisioning', 'trial', 'active')
    )
  );

-- Tenant audit rows are tenant-scoped both for reads and caller-attributed
-- inserts. Tenantless platform events remain available only through the
-- separately authorized server-side platform administration boundary.
DROP POLICY IF EXISTS audit_log_select_management ON public.audit_log;
CREATE POLICY audit_log_select_management ON public.audit_log
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_management_for_tenant(tenant_id));

DROP POLICY IF EXISTS audit_log_insert_authenticated ON public.audit_log;
CREATE POLICY audit_log_insert_authenticated ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      JOIN public.tenants t ON t.id = tu.tenant_id
      WHERE tu.tenant_id = audit_log.tenant_id
        AND tu.user_id = auth.uid()
        AND tu.status = 'active'
        AND t.is_active IS TRUE
    )
  );

-- Reconcile existing approval state before making visibility_scope canonical.
UPDATE public.reports
SET visibility_scope = 'customer_approved'
WHERE status = 'approved' AND visibility_scope <> 'customer_approved';

UPDATE public.assignment_photos
SET visibility_scope = 'customer_approved'
WHERE is_approved IS TRUE AND visibility_scope <> 'customer_approved';

-- Credential recovery is a provider saga: a short claim serializes the
-- external password update, while used_at is committed only after provider
-- success. Failed/expired claims remain safely retryable with the same grant.
ALTER TABLE public.credential_recovery_challenges
  ADD COLUMN IF NOT EXISTS provider_claim_id uuid,
  ADD COLUMN IF NOT EXISTS provider_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_status varchar(24) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS provider_finalized_at timestamptz;

ALTER TABLE public.credential_recovery_challenges
  DROP CONSTRAINT IF EXISTS credential_recovery_provider_status_check,
  ADD CONSTRAINT credential_recovery_provider_status_check
    CHECK (provider_status IN ('pending', 'claimed', 'failed', 'succeeded')),
  DROP CONSTRAINT IF EXISTS credential_recovery_provider_claim_shape_check,
  ADD CONSTRAINT credential_recovery_provider_claim_shape_check CHECK (
    (provider_claim_id IS NULL AND provider_claimed_at IS NULL AND provider_claim_expires_at IS NULL)
    OR (provider_claim_id IS NOT NULL AND provider_claimed_at IS NOT NULL AND provider_claim_expires_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS credential_recovery_provider_claim_v2_idx
  ON public.credential_recovery_challenges(provider_claim_expires_at)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

-- Generic assignment fanout is internal/personnel by default. Customers only
-- receive the canonical assignment projection signal, never staffing ids,
-- draft report artifacts, notes, attachments or unapproved financial state.
CREATE OR REPLACE FUNCTION public.portal_realtime_emit_assignment(
  p_assignment_id uuid,
  p_topic text,
  p_entity_type text,
  p_event_type text DEFAULT 'changed',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_assignment record;
  v_personnel record;
BEGIN
  IF p_assignment_id IS NULL THEN RETURN; END IF;

  SELECT id, tenant_id, customer_id, code, status, scheduled_date, scheduled_start, scheduled_end
  INTO v_assignment
  FROM public.assignments
  WHERE id = p_assignment_id;
  IF v_assignment.id IS NULL THEN RETURN; END IF;

  PERFORM public.portal_realtime_emit_management(
    v_assignment.tenant_id,
    COALESCE(p_topic, 'assignments'),
    COALESCE(p_entity_type, 'assignment'),
    p_assignment_id::text,
    p_event_type,
    jsonb_build_object(
      'assignmentId', p_assignment_id,
      'code', v_assignment.code,
      'status', v_assignment.status,
      'scheduledDate', v_assignment.scheduled_date,
      'scheduledStart', v_assignment.scheduled_start,
      'scheduledEnd', v_assignment.scheduled_end
    ) || COALESCE(p_payload, '{}'::jsonb)
  );

  IF COALESCE(p_topic, 'assignments') = 'assignments'
     AND COALESCE(p_entity_type, 'assignment') IN ('assignment', 'assignments') THEN
    PERFORM public.portal_realtime_emit_customer(
      v_assignment.customer_id,
      'assignments',
      'assignment',
      p_assignment_id::text,
      p_event_type,
      jsonb_build_object(
        'assignmentId', p_assignment_id,
        'code', v_assignment.code,
        'status', v_assignment.status
      )
    );
  END IF;

  FOR v_personnel IN
    SELECT DISTINCT personnel_id
    FROM public.assignment_personnel
    WHERE assignment_id = p_assignment_id AND status IN ('assigned', 'suggested')
  LOOP
    PERFORM public.portal_realtime_emit_personnel(
      v_personnel.personnel_id,
      COALESCE(p_topic, 'assignments'),
      COALESCE(p_entity_type, 'assignment'),
      p_assignment_id::text,
      p_event_type,
      jsonb_build_object(
        'assignmentId', p_assignment_id,
        'code', v_assignment.code,
        'status', v_assignment.status,
        'scheduledDate', v_assignment.scheduled_date,
        'scheduledStart', v_assignment.scheduled_start,
        'scheduledEnd', v_assignment.scheduled_end
      ) || COALESCE(p_payload, '{}'::jsonb)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_realtime_emit_assignment(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- Canonical assignment state machine. Direct writes cannot bypass terminal or
-- negative edges; the command RPC locks the aggregate and checks its version.
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS lifecycle_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_lifecycle_version_check,
  ADD CONSTRAINT assignments_lifecycle_version_check CHECK (lifecycle_version > 0);

CREATE OR REPLACE FUNCTION public.fieldgrid_assignment_transition_allowed(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_from = p_to OR (p_from, p_to) IN (
    ('requested','review'), ('requested','plannable'), ('requested','cancelled'),
    ('review','quote_preparation'), ('review','approved'), ('review','plannable'), ('review','cancelled'),
    ('quote_preparation','awaiting_approval'), ('quote_preparation','cancelled'),
    ('awaiting_approval','approved'), ('awaiting_approval','review'), ('awaiting_approval','cancelled'),
    ('approved','plannable'), ('approved','cancelled'),
    ('plannable','scheduled'), ('plannable','cancelled'),
    ('scheduled','seen'), ('scheduled','en_route'), ('scheduled','in_progress'), ('scheduled','plannable'), ('scheduled','cancelled'),
    ('seen','en_route'), ('seen','in_progress'), ('seen','scheduled'), ('seen','plannable'), ('seen','cancelled'),
    ('en_route','in_progress'), ('en_route','scheduled'), ('en_route','cancelled'),
    ('in_progress','completed'), ('in_progress','not_completed'),
    ('not_completed','in_progress'), ('not_completed','plannable'), ('not_completed','report_submitted'),
    ('completed','report_submitted'),
    ('report_submitted','report_approved'), ('report_submitted','completed'),
    ('report_approved','invoice_ready'), ('invoice_ready','invoiced'),
    ('invoiced','paid'), ('paid','closed')
  );
$$;

CREATE OR REPLACE FUNCTION public.trg_fieldgrid_assignment_state_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.fieldgrid_assignment_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Ongeldige opdrachtstatus-overgang van % naar %.', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
    NEW.lifecycle_version := OLD.lifecycle_version + 1;
  ELSIF NEW.lifecycle_version IS DISTINCT FROM OLD.lifecycle_version THEN
    RAISE EXCEPTION 'Opdrachtversie wordt uitsluitend door een statusovergang gewijzigd.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fieldgrid_assignment_state_guard ON public.assignments;
CREATE TRIGGER fieldgrid_assignment_state_guard
  BEFORE UPDATE OF status, lifecycle_version ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.trg_fieldgrid_assignment_state_guard();

CREATE OR REPLACE FUNCTION public.transition_assignment_status(
  p_tenant_id uuid,
  p_assignment_id uuid,
  p_actor_user_id uuid,
  p_new_status text,
  p_expected_version bigint
)
RETURNS TABLE(status text, lifecycle_version bigint, idempotent boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  assignment_row public.assignments%ROWTYPE;
  old_status text;
BEGIN
  IF p_tenant_id IS NULL OR p_assignment_id IS NULL OR p_actor_user_id IS NULL OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'tenant, assignment, actor and expected version are required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO assignment_row FROM public.assignments
  WHERE id = p_assignment_id AND tenant_id = p_tenant_id AND is_active IS TRUE
  FOR UPDATE;
  IF assignment_row.id IS NULL THEN
    RAISE EXCEPTION 'Opdracht niet gevonden binnen deze organisatie.' USING ERRCODE = '42501';
  END IF;
  IF assignment_row.status = p_new_status THEN
    RETURN QUERY SELECT assignment_row.status::text, assignment_row.lifecycle_version, true;
    RETURN;
  END IF;
  IF assignment_row.lifecycle_version <> p_expected_version THEN
    RAISE EXCEPTION 'De opdracht is intussen gewijzigd. Vernieuw en probeer opnieuw.' USING ERRCODE = '40001';
  END IF;
  IF NOT public.fieldgrid_assignment_transition_allowed(assignment_row.status, p_new_status) THEN
    RAISE EXCEPTION 'Ongeldige opdrachtstatus-overgang van % naar %.', assignment_row.status, p_new_status
      USING ERRCODE = '23514';
  END IF;

  old_status := assignment_row.status;
  UPDATE public.assignments SET status = p_new_status, updated_at = now()
  WHERE id = assignment_row.id RETURNING * INTO assignment_row;
  INSERT INTO public.audit_log(tenant_id, user_id, action, resource, resource_id, metadata)
  VALUES (p_tenant_id, p_actor_user_id, 'status_change', 'assignments', p_assignment_id::text,
    jsonb_build_object('from', old_status, 'to', p_new_status, 'lifecycleVersion', assignment_row.lifecycle_version));
  RETURN QUERY SELECT assignment_row.status::text, assignment_row.lifecycle_version, false;
END;
$$;

REVOKE ALL ON FUNCTION public.fieldgrid_assignment_transition_allowed(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trg_fieldgrid_assignment_state_guard()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.transition_assignment_status(uuid, uuid, uuid, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_assignment_status(uuid, uuid, uuid, text, bigint)
  TO service_role;

-- Staffing eligibility is evaluated by the database while the canonical
-- assignment/personnel rows and all decision inputs are locked. The trigger
-- also protects any future owner/service path that attempts direct DML.
CREATE OR REPLACE FUNCTION public.fieldgrid_assert_staffing_eligibility(
  p_assignment_id uuid,
  p_personnel_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  a public.assignments%ROWTYPE;
  p public.personnel%ROWTYPE;
  schedule_dow integer;
BEGIN
  SELECT * INTO a FROM public.assignments WHERE id = p_assignment_id FOR KEY SHARE;
  SELECT * INTO p FROM public.personnel WHERE id = p_personnel_id FOR KEY SHARE;
  IF a.id IS NULL OR p.id IS NULL OR a.tenant_id <> p.tenant_id OR NOT a.is_active OR NOT p.is_active THEN
    RAISE EXCEPTION 'Medewerker en opdracht moeten actief zijn binnen dezelfde organisatie.' USING ERRCODE = '23514';
  END IF;
  IF NOT p.is_available THEN
    RAISE EXCEPTION 'Deze medewerker staat niet als beschikbaar geregistreerd.' USING ERRCODE = '23514';
  END IF;
  IF a.scheduled_date IS NULL OR a.scheduled_start IS NULL OR a.scheduled_end IS NULL
     OR a.scheduled_start >= a.scheduled_end THEN
    RAISE EXCEPTION 'Datum, starttijd en eindtijd zijn vereist voordat personeel definitief wordt ingepland.' USING ERRCODE = '23514';
  END IF;
  IF a.required_region IS NOT NULL
     AND lower(btrim(COALESCE(p.region, ''))) <> lower(btrim(a.required_region)) THEN
    RAISE EXCEPTION 'De medewerker voldoet niet aan de vereiste regio.' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.leave_periods
  WHERE personnel_id = p_personnel_id AND status = 'approved'
    AND start_date <= a.scheduled_date AND COALESCE(end_date, start_date) >= a.scheduled_date
  FOR KEY SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'De medewerker heeft goedgekeurd verlof of ziekte op deze datum.' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.availability_day_entries
  WHERE personnel_id = p_personnel_id AND date = a.scheduled_date
  FOR KEY SHARE;
  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.availability_day_entries
      WHERE personnel_id = p_personnel_id AND date = a.scheduled_date
        AND start_time <= a.scheduled_start AND end_time >= a.scheduled_end
    ) THEN
      RAISE EXCEPTION 'De geplande tijden vallen buiten de dagbeschikbaarheid.' USING ERRCODE = '23514';
    END IF;
  ELSE
    schedule_dow := extract(dow FROM to_date(a.scheduled_date, 'YYYY-MM-DD'))::integer;
    PERFORM 1 FROM public.availability_windows
    WHERE personnel_id = p_personnel_id AND day_of_week = schedule_dow
    FOR KEY SHARE;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM public.availability_windows
      WHERE personnel_id = p_personnel_id AND day_of_week = schedule_dow
        AND start_time <= a.scheduled_start AND end_time >= a.scheduled_end
    ) THEN
      RAISE EXCEPTION 'Geen passende beschikbaarheid voor de geplande datum en tijden.' USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM ap.id
  FROM public.assignment_personnel ap
  JOIN public.assignments other_a ON other_a.id = ap.assignment_id
  WHERE ap.personnel_id = p_personnel_id AND ap.status = 'assigned'
    AND ap.assignment_id <> p_assignment_id
    AND other_a.is_active IS TRUE
    AND other_a.status NOT IN ('completed','not_completed','report_submitted','report_approved','invoice_ready','invoiced','paid','closed','cancelled')
    AND other_a.scheduled_date = a.scheduled_date
    AND other_a.scheduled_start IS NOT NULL AND other_a.scheduled_end IS NOT NULL
    AND other_a.scheduled_start < a.scheduled_end AND a.scheduled_start < other_a.scheduled_end
  FOR UPDATE OF ap;
  IF FOUND THEN
    RAISE EXCEPTION 'De medewerker is al op een overlappende opdracht ingepland.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.assignment_tasks at
    JOIN public.task_codes tc ON tc.id = at.task_code_id
    WHERE at.assignment_id = p_assignment_id
      AND tc.tenant_id = a.tenant_id
      AND (
        NOT tc.is_active
        OR (tc.sector_id IS NOT NULL AND p.sector_id IS DISTINCT FROM tc.sector_id)
        OR (tc.required_role_id IS NOT NULL AND p.role_id IS DISTINCT FROM tc.required_role_id)
        OR (tc.required_diploma IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.diplomas, '[]'::jsonb)) d(value)
          WHERE lower(d.value) = lower(tc.required_diploma)
        ))
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(tc.required_knowledge, '[]'::jsonb)) requirement(value)
          WHERE NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.knowledge, '[]'::jsonb)) actual(value)
            WHERE lower(actual.value) = lower(requirement.value)
          )
        )
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(tc.required_certificates, '[]'::jsonb)) requirement(value)
          WHERE NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(p.certificates, '[]'::jsonb)) cert(value)
            WHERE lower(COALESCE(cert.value->>'name', cert.value #>> '{}')) = lower(requirement.value)
              AND (NULLIF(cert.value->>'expires_at', '') IS NULL OR cert.value->>'expires_at' >= a.scheduled_date)
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'De medewerker voldoet niet aan de rol-, sector- of kwalificatie-eisen.' USING ERRCODE = '23514';
  END IF;

  PERFORM pq.id
  FROM public.personnel_qualifications pq
  WHERE pq.personnel_id = p_personnel_id
  FOR KEY SHARE;
  IF EXISTS (
    SELECT 1
    FROM public.assignment_tasks at
    JOIN public.task_code_qualifications tq ON tq.task_code_id = at.task_code_id AND tq.required IS TRUE
    WHERE at.assignment_id = p_assignment_id
      AND NOT EXISTS (
        SELECT 1 FROM public.personnel_qualifications pq
        WHERE pq.personnel_id = p_personnel_id
          AND pq.qualification_id = tq.qualification_id
          AND (pq.expires_at IS NULL OR pq.expires_at >= a.scheduled_date)
      )
  ) THEN
    RAISE EXCEPTION 'Een verplichte kwalificatie ontbreekt of is verlopen.' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fieldgrid_staffing_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'assigned' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.fieldgrid_assert_staffing_eligibility(NEW.assignment_id, NEW.personnel_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fieldgrid_staffing_eligibility ON public.assignment_personnel;
CREATE TRIGGER fieldgrid_staffing_eligibility
  BEFORE INSERT OR UPDATE OF status ON public.assignment_personnel
  FOR EACH ROW EXECUTE FUNCTION public.trg_fieldgrid_staffing_eligibility();

REVOKE ALL ON FUNCTION public.fieldgrid_assert_staffing_eligibility(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trg_fieldgrid_staffing_eligibility()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fieldgrid_assert_staffing_eligibility(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_fieldgrid_staffing_eligibility() TO service_role;

-- Durable offline receipts make commit-then-disconnect replay return the
-- canonical first result. The request hash prevents operation-id reuse with a
-- different payload, and the expected version is checked under the execution
-- row lock before the legacy transition implementation is invoked.
CREATE TABLE IF NOT EXISTS public.offline_operation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE RESTRICT,
  personnel_id uuid NOT NULL REFERENCES public.personnel(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  operation_id text NOT NULL,
  operation_type varchar(64) NOT NULL,
  request_hash text NOT NULL,
  expected_version bigint,
  canonical_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT offline_operation_receipts_operation_id_check CHECK (length(operation_id) BETWEEN 16 AND 512),
  CONSTRAINT offline_operation_receipts_response_check CHECK (
    (canonical_response IS NULL AND completed_at IS NULL)
    OR (canonical_response IS NOT NULL AND completed_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS offline_operation_receipts_actor_operation_idx
  ON public.offline_operation_receipts(tenant_id, actor_user_id, operation_id);
CREATE INDEX IF NOT EXISTS offline_operation_receipts_assignment_idx
  ON public.offline_operation_receipts(tenant_id, assignment_id, created_at DESC);
ALTER TABLE public.offline_operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_operation_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.offline_operation_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.offline_operation_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.execute_assignment_participant_action_v2(
  p_assignment_id uuid,
  p_personnel_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_operation_id text,
  p_expected_version bigint,
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
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  exec_row public.assignment_participant_executions%ROWTYPE;
  receipt_row public.offline_operation_receipts%ROWTYPE;
  result_row record;
  request_hash_value text;
  response_value jsonb;
BEGIN
  IF p_operation_id IS NULL OR length(btrim(p_operation_id)) < 16 OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Een stabiel operation id en verwachte versie zijn verplicht.' USING ERRCODE = '22023';
  END IF;

  SELECT ape.* INTO exec_row
  FROM public.assignment_participant_executions ape
  JOIN public.assignment_personnel ap ON ap.id = ape.assignment_personnel_id AND ap.status = 'assigned'
  JOIN public.personnel p ON p.id = ape.personnel_id AND p.is_active IS TRUE AND p.user_id = p_actor_user_id
  WHERE ape.assignment_id = p_assignment_id AND ape.personnel_id = p_personnel_id
    AND ape.participant_status <> 'removed'
  FOR UPDATE;
  IF exec_row.id IS NULL THEN
    RAISE EXCEPTION 'participant execution not found for actor' USING ERRCODE = '42501';
  END IF;

  request_hash_value := md5(jsonb_build_object(
    'assignmentId', p_assignment_id, 'personnelId', p_personnel_id,
    'action', p_action, 'expectedVersion', p_expected_version,
    'completionReason', p_completion_reason, 'completionNotes', p_completion_notes
  )::text);

  INSERT INTO public.offline_operation_receipts(
    tenant_id, assignment_id, personnel_id, actor_user_id, operation_id,
    operation_type, request_hash, expected_version
  ) VALUES (
    exec_row.tenant_id, p_assignment_id, p_personnel_id, p_actor_user_id, btrim(p_operation_id),
    p_action, request_hash_value, p_expected_version
  )
  ON CONFLICT DO NOTHING;

  SELECT receipt.* INTO receipt_row FROM public.offline_operation_receipts receipt
  WHERE receipt.tenant_id = exec_row.tenant_id AND receipt.actor_user_id = p_actor_user_id
    AND receipt.operation_id = btrim(p_operation_id)
  FOR UPDATE;
  IF receipt_row.request_hash <> request_hash_value THEN
    RAISE EXCEPTION 'Operation id is al gebruikt met een andere payload.' USING ERRCODE = '23505';
  END IF;
  IF receipt_row.canonical_response IS NOT NULL THEN
    RETURN QUERY SELECT
      (receipt_row.canonical_response->>'executionId')::uuid,
      (receipt_row.canonical_response->>'assignmentPersonnelId')::uuid,
      (receipt_row.canonical_response->>'tenantId')::uuid,
      receipt_row.canonical_response->>'participantStatus',
      receipt_row.canonical_response->>'assignmentStatus',
      (receipt_row.canonical_response->>'firstAssignmentStart')::boolean,
      (receipt_row.canonical_response->>'aggregateCompleted')::boolean,
      (receipt_row.canonical_response->>'version')::bigint;
    RETURN;
  END IF;
  IF exec_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflict: deze werkbon is aangepast. Ververs en probeer opnieuw.' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO result_row FROM public.execute_assignment_participant_action(
    p_assignment_id, p_personnel_id, p_actor_user_id, p_action, btrim(p_operation_id),
    p_completion_reason, p_completion_notes,
    COALESCE(p_audit_metadata, '{}'::jsonb) || jsonb_build_object('operationId', btrim(p_operation_id))
  );
  response_value := jsonb_build_object(
    'executionId', result_row.execution_id,
    'assignmentPersonnelId', result_row.assignment_personnel_id,
    'tenantId', result_row.tenant_id,
    'participantStatus', result_row.participant_status,
    'assignmentStatus', result_row.assignment_status,
    'firstAssignmentStart', result_row.first_assignment_start,
    'aggregateCompleted', result_row.aggregate_completed,
    'version', result_row.version
  );
  UPDATE public.offline_operation_receipts
  SET canonical_response = response_value, completed_at = now()
  WHERE id = receipt_row.id;

  RETURN QUERY SELECT result_row.execution_id, result_row.assignment_personnel_id,
    result_row.tenant_id, result_row.participant_status::text, result_row.assignment_status::text,
    result_row.first_assignment_start, result_row.aggregate_completed, result_row.version;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_assignment_participant_action_v2(uuid, uuid, uuid, text, text, bigint, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_assignment_participant_action_v2(uuid, uuid, uuid, text, text, bigint, text, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.begin_offline_operation(
  p_tenant_id uuid,
  p_assignment_id uuid,
  p_personnel_id uuid,
  p_actor_user_id uuid,
  p_operation_id text,
  p_operation_type text,
  p_request_hash text,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  execution_version bigint;
  receipt_row public.offline_operation_receipts%ROWTYPE;
BEGIN
  IF length(COALESCE(btrim(p_operation_id), '')) < 16 OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Een stabiel operation id en verwachte versie zijn verplicht.' USING ERRCODE = '22023';
  END IF;
  SELECT ape.version INTO execution_version
  FROM public.assignment_participant_executions ape
  JOIN public.assignment_personnel ap ON ap.id = ape.assignment_personnel_id AND ap.status = 'assigned'
  JOIN public.personnel p ON p.id = ape.personnel_id AND p.tenant_id = p_tenant_id
    AND p.is_active IS TRUE AND p.user_id = p_actor_user_id
  WHERE ape.tenant_id = p_tenant_id AND ape.assignment_id = p_assignment_id
    AND ape.personnel_id = p_personnel_id AND ape.participant_status <> 'removed'
  FOR UPDATE;
  IF execution_version IS NULL THEN
    RAISE EXCEPTION 'offline operation not available for actor' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.offline_operation_receipts(
    tenant_id, assignment_id, personnel_id, actor_user_id, operation_id,
    operation_type, request_hash, expected_version
  ) VALUES (
    p_tenant_id, p_assignment_id, p_personnel_id, p_actor_user_id, btrim(p_operation_id),
    p_operation_type, p_request_hash, p_expected_version
  ) ON CONFLICT (tenant_id, actor_user_id, operation_id) DO NOTHING;
  SELECT * INTO receipt_row FROM public.offline_operation_receipts
  WHERE tenant_id = p_tenant_id AND actor_user_id = p_actor_user_id
    AND operation_id = btrim(p_operation_id)
  FOR UPDATE;
  IF receipt_row.request_hash <> p_request_hash OR receipt_row.operation_type <> p_operation_type THEN
    RAISE EXCEPTION 'Operation id is al gebruikt met een andere payload.' USING ERRCODE = '23505';
  END IF;
  IF receipt_row.canonical_response IS NOT NULL THEN RETURN receipt_row.canonical_response; END IF;
  IF execution_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflict: deze werkbon is aangepast. Ververs en probeer opnieuw.' USING ERRCODE = '40001';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_offline_operation(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_operation_id text,
  p_canonical_response jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.offline_operation_receipts
  SET canonical_response = p_canonical_response, completed_at = now()
  WHERE tenant_id = p_tenant_id AND actor_user_id = p_actor_user_id
    AND operation_id = btrim(p_operation_id) AND canonical_response IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offline operation receipt kon niet worden afgerond.' USING ERRCODE = '40001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_offline_operation(uuid, uuid, uuid, uuid, text, text, text, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_offline_operation(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_offline_operation(uuid, uuid, uuid, uuid, text, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_offline_operation(uuid, uuid, text, jsonb) TO service_role;

ALTER TABLE public.assignment_report_notes
  ADD COLUMN IF NOT EXISTS client_mutation_id varchar(512);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_report_notes_client_mutation_idx
  ON public.assignment_report_notes(assignment_id, created_by, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

ALTER TABLE public.assignment_extra_work
  ADD COLUMN IF NOT EXISTS client_mutation_id varchar(512);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_extra_work_client_mutation_idx
  ON public.assignment_extra_work(assignment_id, created_by, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

ALTER TABLE public.assignment_material_usage
  ALTER COLUMN client_mutation_id TYPE varchar(512);

-- Explicit platform permissions replace the legacy global Management role.
-- Tenant-owned policies are rewritten to the tenant-scoped helper; genuinely
-- global catalogs/content require a named active platform permission.
CREATE OR REPLACE FUNCTION public.fieldgrid_has_platform_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_users pu
    WHERE pu.user_id = auth.uid() AND pu.status = 'active'
      AND (
        pu.role = 'owner'
        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[
          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',
          'platform.tenants.read', 'platform.audit.read'
        ]))
      )
  );
$$;
REVOKE ALL ON FUNCTION public.fieldgrid_has_platform_permission(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fieldgrid_has_platform_permission(text) TO authenticated;

DO $rewrite_tenant_management_policies$
DECLARE policy_row record; role_list text; using_expr text; check_expr text;
BEGIN
  FOR policy_row IN
    SELECT p.* FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND (COALESCE(p.qual, '') LIKE '%is_management()%' OR COALESCE(p.with_check, '') LIKE '%is_management()%')
      AND EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = p.schemaname AND c.table_name = p.tablename AND c.column_name = 'tenant_id'
      )
  LOOP
    SELECT string_agg(quote_ident(role_name), ', ') INTO role_list FROM unnest(policy_row.roles) role_name;
    using_expr := replace(replace(policy_row.qual, 'public.is_management()', 'public.is_management_for_tenant(tenant_id)'), 'is_management()', 'public.is_management_for_tenant(tenant_id)');
    check_expr := replace(replace(policy_row.with_check, 'public.is_management()', 'public.is_management_for_tenant(tenant_id)'), 'is_management()', 'public.is_management_for_tenant(tenant_id)');
    EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename,
      policy_row.permissive, policy_row.cmd, role_list,
      CASE WHEN using_expr IS NULL THEN '' ELSE ' USING (' || using_expr || ')' END,
      CASE WHEN check_expr IS NULL THEN '' ELSE ' WITH CHECK (' || check_expr || ')' END
    );
  END LOOP;
END;
$rewrite_tenant_management_policies$;

DROP POLICY IF EXISTS customer_notes_management ON public.customer_notes;
CREATE POLICY customer_notes_management ON public.customer_notes TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_notes.customer_id AND public.is_management_for_tenant(c.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_notes.customer_id AND public.is_management_for_tenant(c.tenant_id)));
DROP POLICY IF EXISTS customer_contacts_management ON public.customer_contacts;
CREATE POLICY customer_contacts_management ON public.customer_contacts TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_contacts.customer_id AND public.is_management_for_tenant(c.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_contacts.customer_id AND public.is_management_for_tenant(c.tenant_id)));
DROP POLICY IF EXISTS object_contacts_management ON public.object_contacts;
CREATE POLICY object_contacts_management ON public.object_contacts TO authenticated
  USING (EXISTS (SELECT 1 FROM public.objects o WHERE o.id = object_contacts.object_id AND public.is_management_for_tenant(o.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.objects o WHERE o.id = object_contacts.object_id AND public.is_management_for_tenant(o.tenant_id)));
DROP POLICY IF EXISTS object_personnel_management ON public.object_personnel;
CREATE POLICY object_personnel_management ON public.object_personnel TO authenticated
  USING (EXISTS (SELECT 1 FROM public.objects o WHERE o.id = object_personnel.object_id AND public.is_management_for_tenant(o.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.objects o WHERE o.id = object_personnel.object_id AND public.is_management_for_tenant(o.tenant_id)));

DO $rewrite_global_management_policies$
DECLARE policy_row record; role_list text; using_expr text; check_expr text; permission_name text;
BEGIN
  FOR policy_row IN
    SELECT p.* FROM pg_policies p
    WHERE p.schemaname IN ('public', 'storage')
      AND (COALESCE(p.qual, '') LIKE '%is_management()%' OR COALESCE(p.with_check, '') LIKE '%is_management()%')
  LOOP
    permission_name := CASE
      WHEN policy_row.tablename IN ('roles','permissions','role_permissions','user_roles') THEN 'global.rbac.manage'
      WHEN policy_row.tablename IN ('sectors','notification_event_settings') THEN 'global.reference.manage'
      WHEN policy_row.tablename = 'tenants' THEN 'platform.tenants.read'
      ELSE 'global.content.manage'
    END;
    SELECT string_agg(quote_ident(role_name), ', ') INTO role_list FROM unnest(policy_row.roles) role_name;
    using_expr := replace(replace(policy_row.qual, 'public.is_management()', format('public.fieldgrid_has_platform_permission(%L)', permission_name)), 'is_management()', format('public.fieldgrid_has_platform_permission(%L)', permission_name));
    check_expr := replace(replace(policy_row.with_check, 'public.is_management()', format('public.fieldgrid_has_platform_permission(%L)', permission_name)), 'is_management()', format('public.fieldgrid_has_platform_permission(%L)', permission_name));
    EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename,
      policy_row.permissive, policy_row.cmd, role_list,
      CASE WHEN using_expr IS NULL THEN '' ELSE ' USING (' || using_expr || ')' END,
      CASE WHEN check_expr IS NULL THEN '' ELSE ' WITH CHECK (' || check_expr || ')' END
    );
  END LOOP;
END;
$rewrite_global_management_policies$;

-- Tenant document storage derives the tenant from the canonical path. Other
-- global media buckets remain explicit platform-content administration.
DROP POLICY IF EXISTS documents_management_all ON storage.objects;
CREATE POLICY documents_management_all ON storage.objects TO authenticated
  USING (bucket_id = 'documents' AND public.is_management_for_tenant(public.fieldgrid_storage_tenant_id_from_path(name)))
  WITH CHECK (bucket_id = 'documents' AND public.is_management_for_tenant(public.fieldgrid_storage_tenant_id_from_path(name)));

-- A support lease is a capability grant, not a temporary global role. Existing
-- grants intentionally migrate to zero capabilities and therefore fail closed.
ALTER TABLE public.support_access_grants
  ADD COLUMN IF NOT EXISTS scope varchar(30) NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS permission_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS module_keys jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $support_grant_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_access_grants_scope_check') THEN
    ALTER TABLE public.support_access_grants
      ADD CONSTRAINT support_access_grants_scope_check CHECK (scope = 'tenant');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_access_grants_permission_keys_check') THEN
    ALTER TABLE public.support_access_grants
      ADD CONSTRAINT support_access_grants_permission_keys_check
      CHECK (jsonb_typeof(permission_keys) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_access_grants_module_keys_check') THEN
    ALTER TABLE public.support_access_grants
      ADD CONSTRAINT support_access_grants_module_keys_check
      CHECK (jsonb_typeof(module_keys) = 'array');
  END IF;
END;
$support_grant_constraints$;

ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_audit_log FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_access_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_access_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_users TO service_role;
GRANT ALL ON TABLE public.support_access_grants TO service_role;
GRANT ALL ON TABLE public.support_access_audit_log TO service_role;

-- Finance invariants: one live invoice proposal per assignment, one allocation
-- per payment/invoice pair, and no payment or invoice can be over-allocated.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_request_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_request_key_idx
  ON public.payments(provider_request_key)
  WHERE provider_request_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_assignment_active_unique_idx
  ON public.invoices(assignment_id)
  WHERE assignment_id IS NOT NULL AND status IN ('draft', 'sent', 'paid');
CREATE UNIQUE INDEX IF NOT EXISTS payment_allocations_payment_invoice_idx
  ON public.payment_allocations(payment_id, invoice_id);

DO $finance_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_positive_check') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_amount_positive_check CHECK (amount_cents > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_amount_positive_check') THEN
    ALTER TABLE public.payment_allocations
      ADD CONSTRAINT payment_allocations_amount_positive_check
      CHECK (amount_cents > 0 AND amount = amount_cents::numeric / 100);
  END IF;
END;
$finance_constraints$;

CREATE OR REPLACE FUNCTION public.fieldgrid_guard_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  payment_row public.payments%ROWTYPE;
  invoice_row public.invoices%ROWTYPE;
  payment_allocated bigint;
  invoice_allocated bigint;
  invoice_total bigint;
BEGIN
  SELECT * INTO payment_row FROM public.payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT * INTO invoice_row FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF payment_row.id IS NULL OR invoice_row.id IS NULL
     OR payment_row.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR invoice_row.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR payment_row.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
    RAISE EXCEPTION 'Payment allocation tenant/invoice mismatch.' USING ERRCODE = '23514';
  END IF;
  IF payment_row.status <> 'paid' THEN
    RAISE EXCEPTION 'Only paid payments can be allocated.' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(sum(amount_cents), 0) INTO payment_allocated
  FROM public.payment_allocations
  WHERE payment_id = NEW.payment_id AND id IS DISTINCT FROM NEW.id;
  SELECT COALESCE(sum(amount_cents), 0) INTO invoice_allocated
  FROM public.payment_allocations
  WHERE invoice_id = NEW.invoice_id AND id IS DISTINCT FROM NEW.id;
  invoice_total := round(COALESCE(invoice_row.total_amount, 0) * 100)::bigint;

  IF payment_allocated + NEW.amount_cents > payment_row.amount_cents THEN
    RAISE EXCEPTION 'Payment would be over-allocated.' USING ERRCODE = '23514';
  END IF;
  IF invoice_allocated + NEW.amount_cents > invoice_total THEN
    RAISE EXCEPTION 'Invoice would be overpaid.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_allocations_guard ON public.payment_allocations;
CREATE TRIGGER payment_allocations_guard
BEFORE INSERT OR UPDATE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.fieldgrid_guard_payment_allocation();
