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

  INSERT INTO public.portal_realtime_events (
    tenant_id, recipient_type, realtime_key, personnel_id, customer_id,
    topic, resource_type, resource_id, action, event_type, payload
  ) VALUES (
    p_tenant_id, p_recipient_type, p_realtime_key, p_personnel_id, p_customer_id,
    p_topic, v_resource_type, v_resource_id, v_action, v_event_type,
    public.fieldgrid_redact_realtime_payload(COALESCE(p_payload, '{}'::jsonb))
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
