-- ============================================================================
-- Portal realtime invalidation events.
--
-- The portals subscribe only to this lightweight table. Sensitive business data
-- remains behind the existing server actions and RLS; realtime only tells the
-- browser that a scoped view should refresh.
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_realtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL
    REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_type varchar(20) NOT NULL,
  realtime_key varchar(120) NOT NULL,
  personnel_id uuid REFERENCES personnel(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  topic varchar(80) NOT NULL,
  entity_type varchar(80),
  entity_id text,
  event_type varchar(20) NOT NULL DEFAULT 'changed',
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '3 days') NOT NULL,
  CONSTRAINT portal_realtime_events_recipient_type_check
    CHECK (recipient_type IN ('management', 'personnel', 'customer')),
  CONSTRAINT portal_realtime_events_event_type_check
    CHECK (event_type IN ('insert', 'update', 'delete', 'changed'))
);

CREATE INDEX IF NOT EXISTS portal_realtime_events_key_created_idx
  ON portal_realtime_events(realtime_key, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_realtime_events_expires_idx
  ON portal_realtime_events(expires_at);
CREATE INDEX IF NOT EXISTS portal_realtime_events_personnel_idx
  ON portal_realtime_events(personnel_id, created_at DESC)
  WHERE personnel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS portal_realtime_events_customer_idx
  ON portal_realtime_events(customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

ALTER TABLE portal_realtime_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_realtime_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_realtime_events'
      AND policyname = 'portal_realtime_events_management_read'
  ) THEN
    CREATE POLICY portal_realtime_events_management_read
      ON portal_realtime_events
      FOR SELECT TO authenticated
      USING (
        recipient_type = 'management'
        AND is_management()
        AND (
          tenant_id = ANY(public.current_user_tenant_ids())
          OR tenant_id = '00000000-0000-0000-0000-000000000010'::uuid
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_realtime_events'
      AND policyname = 'portal_realtime_events_personnel_read'
  ) THEN
    CREATE POLICY portal_realtime_events_personnel_read
      ON portal_realtime_events
      FOR SELECT TO authenticated
      USING (
        recipient_type = 'personnel'
        AND EXISTS (
          SELECT 1
          FROM personnel p
          WHERE p.id = portal_realtime_events.personnel_id
            AND p.user_id = (SELECT auth.uid())
            AND p.is_active = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_realtime_events'
      AND policyname = 'portal_realtime_events_customer_read'
  ) THEN
    CREATE POLICY portal_realtime_events_customer_read
      ON portal_realtime_events
      FOR SELECT TO authenticated
      USING (
        recipient_type = 'customer'
        AND EXISTS (
          SELECT 1
          FROM customer_users cu
          WHERE cu.customer_id = portal_realtime_events.customer_id
            AND cu.status = 'active'
            AND (
              cu.user_id = (SELECT auth.uid())
              OR lower(cu.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
            )
        )
      );
  END IF;
END $$;

GRANT SELECT ON portal_realtime_events TO authenticated;

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
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_realtime_key IS NULL OR p_topic IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO portal_realtime_events (
    tenant_id,
    recipient_type,
    realtime_key,
    personnel_id,
    customer_id,
    topic,
    entity_type,
    entity_id,
    event_type,
    payload
  )
  VALUES (
    p_tenant_id,
    p_recipient_type,
    p_realtime_key,
    p_personnel_id,
    p_customer_id,
    p_topic,
    p_entity_type,
    p_entity_id,
    COALESCE(NULLIF(p_event_type, ''), 'changed'),
    COALESCE(p_payload, '{}'::jsonb)
  );

  IF random() < 0.01 THEN
    DELETE FROM portal_realtime_events
    WHERE id IN (
      SELECT id
      FROM portal_realtime_events
      WHERE expires_at < now()
      ORDER BY expires_at
      LIMIT 500
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_realtime_emit_management(
  p_tenant_id uuid,
  p_topic text,
  p_entity_type text,
  p_entity_id text,
  p_event_type text DEFAULT 'changed',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.portal_realtime_emit(
    p_tenant_id,
    'management',
    'management_' || p_tenant_id::text,
    NULL,
    NULL,
    p_topic,
    p_entity_type,
    p_entity_id,
    p_event_type,
    p_payload
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_realtime_emit_customer(
  p_customer_id uuid,
  p_topic text,
  p_entity_type text,
  p_entity_id text,
  p_event_type text DEFAULT 'changed',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM customers
  WHERE id = p_customer_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.portal_realtime_emit(
    v_tenant_id,
    'customer',
    'customer_' || p_customer_id::text,
    NULL,
    p_customer_id,
    p_topic,
    p_entity_type,
    p_entity_id,
    p_event_type,
    p_payload
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_realtime_emit_personnel(
  p_personnel_id uuid,
  p_topic text,
  p_entity_type text,
  p_entity_id text,
  p_event_type text DEFAULT 'changed',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_personnel_id IS NULL THEN
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM personnel
  WHERE id = p_personnel_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.portal_realtime_emit(
    v_tenant_id,
    'personnel',
    'personnel_' || p_personnel_id::text,
    p_personnel_id,
    NULL,
    p_topic,
    p_entity_type,
    p_entity_id,
    p_event_type,
    p_payload
  );
END;
$$;

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
SET search_path = public
AS $$
DECLARE
  v_assignment record;
  v_personnel record;
BEGIN
  IF p_assignment_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, tenant_id, customer_id, code, status, scheduled_date, scheduled_start, scheduled_end
  INTO v_assignment
  FROM assignments
  WHERE id = p_assignment_id;

  IF v_assignment.id IS NULL THEN
    RETURN;
  END IF;

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

  PERFORM public.portal_realtime_emit_customer(
    v_assignment.customer_id,
    COALESCE(p_topic, 'assignments'),
    COALESCE(p_entity_type, 'assignment'),
    p_assignment_id::text,
    p_event_type,
    jsonb_build_object(
      'assignmentId', p_assignment_id,
      'code', v_assignment.code,
      'status', v_assignment.status
    ) || COALESCE(p_payload, '{}'::jsonb)
  );

  FOR v_personnel IN
    SELECT DISTINCT personnel_id
    FROM assignment_personnel
    WHERE assignment_id = p_assignment_id
      AND status IN ('assigned', 'suggested')
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

REVOKE ALL ON FUNCTION public.portal_realtime_emit(uuid, text, text, uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_realtime_emit_management(uuid, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_realtime_emit_customer(uuid, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_realtime_emit_personnel(uuid, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_realtime_emit_assignment(uuid, text, text, text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id uuid;
  v_old_customer_id uuid;
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
  IF TG_OP = 'UPDATE' THEN
    v_old_customer_id := OLD.customer_id;
  END IF;

  PERFORM public.portal_realtime_emit_assignment(
    v_assignment_id,
    'assignments',
    'assignment',
    lower(TG_OP),
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

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_assignment_personnel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id uuid;
  v_row_id uuid;
  v_personnel_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_assignment_id := OLD.assignment_id;
    v_row_id := OLD.id;
    v_personnel_id := OLD.personnel_id;
  ELSE
    v_assignment_id := NEW.assignment_id;
    v_row_id := NEW.id;
    v_personnel_id := NEW.personnel_id;
  END IF;

  PERFORM public.portal_realtime_emit_assignment(
    v_assignment_id,
    'planning',
    'assignment_personnel',
    lower(TG_OP),
    jsonb_build_object(
      'assignmentPersonnelId', v_row_id,
      'personnelId', v_personnel_id
    )
  );

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.portal_realtime_emit_personnel(
      OLD.personnel_id,
      'planning',
      'assignment_personnel',
      v_assignment_id::text,
      lower(TG_OP),
      jsonb_build_object('assignmentId', v_assignment_id, 'removedOrChanged', true)
    );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.portal_realtime_emit_personnel(
      NEW.personnel_id,
      'planning',
      'assignment_personnel',
      v_assignment_id::text,
      lower(TG_OP),
      jsonb_build_object('assignmentId', v_assignment_id, 'status', NEW.status)
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_assignment_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id uuid;
  v_row_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_assignment_id := OLD.assignment_id;
    v_row_id := OLD.id;
  ELSE
    v_assignment_id := NEW.assignment_id;
    v_row_id := NEW.id;
  END IF;

  PERFORM public.portal_realtime_emit_assignment(
    v_assignment_id,
    TG_ARGV[0],
    TG_TABLE_NAME,
    lower(TG_OP),
    jsonb_build_object('rowId', v_row_id, 'assignmentId', v_assignment_id)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_quote_invoice_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id uuid;
  v_customer_id uuid;
  v_row_id uuid;
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_assignment_id := OLD.assignment_id;
    v_row_id := OLD.id;
    IF TG_TABLE_NAME <> 'reports' THEN
      v_customer_id := OLD.customer_id;
    END IF;
  ELSE
    v_assignment_id := NEW.assignment_id;
    v_row_id := NEW.id;
    IF TG_TABLE_NAME <> 'reports' THEN
      v_customer_id := NEW.customer_id;
    END IF;
  END IF;

  IF v_assignment_id IS NOT NULL THEN
    PERFORM public.portal_realtime_emit_assignment(
      v_assignment_id,
      TG_ARGV[0],
      TG_TABLE_NAME,
      lower(TG_OP),
      jsonb_build_object('rowId', v_row_id, 'assignmentId', v_assignment_id)
    );
  ELSE
    SELECT tenant_id INTO v_tenant_id FROM customers WHERE id = v_customer_id;
    PERFORM public.portal_realtime_emit_management(
      v_tenant_id,
      TG_ARGV[0],
      TG_TABLE_NAME,
      v_row_id::text,
      lower(TG_OP),
      jsonb_build_object('rowId', v_row_id, 'customerId', v_customer_id)
    );
    PERFORM public.portal_realtime_emit_customer(
      v_customer_id,
      TG_ARGV[0],
      TG_TABLE_NAME,
      v_row_id::text,
      lower(TG_OP),
      jsonb_build_object('rowId', v_row_id)
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_invoice_id uuid;
  v_row_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
    v_row_id := OLD.id;
  ELSE
    v_invoice_id := NEW.invoice_id;
    v_row_id := NEW.id;
  END IF;

  SELECT id, assignment_id, customer_id
  INTO v_invoice
  FROM invoices
  WHERE id = v_invoice_id;

  IF v_invoice.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF v_invoice.assignment_id IS NOT NULL THEN
    PERFORM public.portal_realtime_emit_assignment(
      v_invoice.assignment_id,
      'payments',
      'payment',
      lower(TG_OP),
      jsonb_build_object('paymentId', v_row_id, 'invoiceId', v_invoice.id)
    );
  ELSE
    PERFORM public.portal_realtime_emit_customer(
      v_invoice.customer_id,
      'payments',
      'payment',
      v_row_id::text,
      lower(TG_OP),
      jsonb_build_object('paymentId', v_row_id, 'invoiceId', v_invoice.id)
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_assignment_sidecar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id uuid;
  v_row_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_assignment_id := OLD.assignment_id;
    v_row_id := OLD.id;
  ELSE
    v_assignment_id := NEW.assignment_id;
    v_row_id := NEW.id;
  END IF;

  PERFORM public.portal_realtime_emit_assignment(
    v_assignment_id,
    'planning',
    TG_TABLE_NAME,
    lower(TG_OP),
    jsonb_build_object('rowId', v_row_id, 'assignmentId', v_assignment_id)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_assignment_interest_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id uuid;
  v_personnel_id uuid;
  v_row_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_assignment_id := OLD.assignment_id;
    v_personnel_id := OLD.personnel_id;
    v_row_id := OLD.id;
    v_status := OLD.status;
  ELSE
    v_assignment_id := NEW.assignment_id;
    v_personnel_id := NEW.personnel_id;
    v_row_id := NEW.id;
    v_status := NEW.status;
  END IF;

  PERFORM public.portal_realtime_emit_assignment(
    v_assignment_id,
    'planning',
    'assignment_interest_response',
    lower(TG_OP),
    jsonb_build_object(
      'responseId', v_row_id,
      'assignmentId', v_assignment_id,
      'personnelId', v_personnel_id,
      'status', v_status
    )
  );

  PERFORM public.portal_realtime_emit_personnel(
    v_personnel_id,
    'planning',
    'assignment_interest_response',
    v_assignment_id::text,
    lower(TG_OP),
    jsonb_build_object(
      'responseId', v_row_id,
      'assignmentId', v_assignment_id,
      'status', v_status
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_tenant_owned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_row_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
    v_row_id := OLD.id;
  ELSE
    v_tenant_id := NEW.tenant_id;
    v_row_id := NEW.id;
  END IF;

  PERFORM public.portal_realtime_emit_management(
    v_tenant_id,
    TG_ARGV[0],
    TG_TABLE_NAME,
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('rowId', v_row_id)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_customer_portal_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_customer_id := OLD.customer_id;
  ELSE
    v_customer_id := NEW.customer_id;
  END IF;

  PERFORM public.portal_realtime_emit_customer(
    v_customer_id,
    'settings',
    'customer_portal_preferences',
    v_customer_id::text,
    lower(TG_OP),
    jsonb_build_object('customerId', v_customer_id)
  );

  PERFORM public.portal_realtime_emit_management(
    (SELECT tenant_id FROM customers WHERE id = v_customer_id),
    'settings',
    'customer_portal_preferences',
    v_customer_id::text,
    lower(TG_OP),
    jsonb_build_object('customerId', v_customer_id)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_customer_payment_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_row_id uuid;
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_customer_id := OLD.customer_id;
    v_row_id := OLD.id;
  ELSE
    v_customer_id := NEW.customer_id;
    v_row_id := NEW.id;
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM customers
  WHERE id = v_customer_id;

  PERFORM public.portal_realtime_emit_management(
    v_tenant_id,
    'payments',
    'customer_payment_batch',
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('batchId', v_row_id, 'customerId', v_customer_id)
  );

  PERFORM public.portal_realtime_emit_customer(
    v_customer_id,
    'payments',
    'customer_payment_batch',
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('batchId', v_row_id)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_customer_payment_batch_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  v_batch_id uuid;
  v_row_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_batch_id := OLD.batch_id;
    v_row_id := OLD.id;
  ELSE
    v_batch_id := NEW.batch_id;
    v_row_id := NEW.id;
  END IF;

  SELECT b.id, b.customer_id, c.tenant_id
  INTO v_batch
  FROM customer_payment_batches b
  JOIN customers c ON c.id = b.customer_id
  WHERE b.id = v_batch_id;

  IF v_batch.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  PERFORM public.portal_realtime_emit_management(
    v_batch.tenant_id,
    'payments',
    'customer_payment_batch_item',
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('batchId', v_batch.id, 'customerId', v_batch.customer_id)
  );

  PERFORM public.portal_realtime_emit_customer(
    v_batch.customer_id,
    'payments',
    'customer_payment_batch_item',
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('batchId', v_batch.id)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_customer_owned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_row_id uuid;
  v_row_tenant_id uuid;
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row_id := OLD.id;
    v_row_tenant_id := OLD.tenant_id;
    IF TG_TABLE_NAME = 'customers' THEN
      v_customer_id := OLD.id;
    ELSE
      v_customer_id := OLD.customer_id;
    END IF;
  ELSE
    v_row_id := NEW.id;
    v_row_tenant_id := NEW.tenant_id;
    IF TG_TABLE_NAME = 'customers' THEN
      v_customer_id := NEW.id;
    ELSE
      v_customer_id := NEW.customer_id;
    END IF;
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM customers WHERE id = v_customer_id;

  PERFORM public.portal_realtime_emit_management(
    COALESCE(v_tenant_id, v_row_tenant_id),
    TG_ARGV[0],
    TG_TABLE_NAME,
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('rowId', v_row_id, 'customerId', v_customer_id)
  );

  PERFORM public.portal_realtime_emit_customer(
    v_customer_id,
    TG_ARGV[0],
    TG_TABLE_NAME,
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('rowId', v_row_id, 'customerId', v_customer_id)
  );

  IF TG_TABLE_NAME = 'objects' THEN
    PERFORM public.portal_realtime_emit_assignment(
      a.id,
      'assignments',
      'object',
      lower(TG_OP),
      jsonb_build_object('objectId', v_row_id)
    )
    FROM assignments a
    WHERE a.object_id = v_row_id;
  END IF;

  IF TG_TABLE_NAME = 'customers' THEN
    PERFORM public.portal_realtime_emit_assignment(
      a.id,
      'assignments',
      'customer',
      lower(TG_OP),
      jsonb_build_object('customerId', v_row_id)
    )
    FROM assignments a
    WHERE a.customer_id = v_row_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_personnel_owned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_personnel_id uuid;
  v_row_id uuid;
  v_row_tenant_id uuid;
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row_id := OLD.id;
    IF TG_TABLE_NAME = 'personnel' THEN
      v_personnel_id := OLD.id;
      v_row_tenant_id := OLD.tenant_id;
    ELSE
      v_personnel_id := OLD.personnel_id;
    END IF;
  ELSE
    v_row_id := NEW.id;
    IF TG_TABLE_NAME = 'personnel' THEN
      v_personnel_id := NEW.id;
      v_row_tenant_id := NEW.tenant_id;
    ELSE
      v_personnel_id := NEW.personnel_id;
    END IF;
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM personnel WHERE id = v_personnel_id;

  PERFORM public.portal_realtime_emit_management(
    COALESCE(v_tenant_id, v_row_tenant_id, '00000000-0000-0000-0000-000000000010'::uuid),
    TG_ARGV[0],
    TG_TABLE_NAME,
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('rowId', v_row_id, 'personnelId', v_personnel_id)
  );

  PERFORM public.portal_realtime_emit_personnel(
    v_personnel_id,
    TG_ARGV[0],
    TG_TABLE_NAME,
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('rowId', v_row_id, 'personnelId', v_personnel_id)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_personnel_ticket_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread record;
  v_tenant_id uuid;
  v_thread_id uuid;
  v_row_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_thread_id := OLD.thread_id;
    v_row_id := OLD.id;
  ELSE
    v_thread_id := NEW.thread_id;
    v_row_id := NEW.id;
  END IF;

  SELECT id, personnel_id INTO v_thread
  FROM personnel_message_threads
  WHERE id = v_thread_id;

  IF v_thread.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM personnel
  WHERE id = v_thread.personnel_id;

  PERFORM public.portal_realtime_emit_personnel(
    v_thread.personnel_id,
    'tickets',
    'personnel_message_entry',
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('threadId', v_thread.id)
  );
  PERFORM public.portal_realtime_emit_management(
    COALESCE(v_tenant_id, '00000000-0000-0000-0000-000000000010'::uuid),
    'tickets',
    'personnel_message_entry',
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('threadId', v_thread.id, 'personnelId', v_thread.personnel_id)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_portal_realtime_customer_ticket_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread record;
  v_thread_id uuid;
  v_row_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_thread_id := OLD.thread_id;
    v_row_id := OLD.id;
  ELSE
    v_thread_id := NEW.thread_id;
    v_row_id := NEW.id;
  END IF;

  SELECT id, customer_id INTO v_thread
  FROM customer_message_threads
  WHERE id = v_thread_id;

  IF v_thread.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  PERFORM public.portal_realtime_emit_customer(
    v_thread.customer_id,
    'tickets',
    'customer_message_entry',
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('threadId', v_thread.id)
  );
  PERFORM public.portal_realtime_emit_management(
    (SELECT tenant_id FROM customers WHERE id = v_thread.customer_id),
    'tickets',
    'customer_message_entry',
    v_row_id::text,
    lower(TG_OP),
    jsonb_build_object('threadId', v_thread.id, 'customerId', v_thread.customer_id)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_portal_realtime_assignments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_assignment_personnel() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_assignment_child() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_quote_invoice_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_payment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_assignment_sidecar() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_assignment_interest_response() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_tenant_owned() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_customer_portal_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_customer_payment_batch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_customer_payment_batch_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_customer_owned() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_personnel_owned() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_personnel_ticket_entry() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_portal_realtime_customer_ticket_entry() FROM PUBLIC;

DROP TRIGGER IF EXISTS portal_realtime_assignments ON assignments;
CREATE TRIGGER portal_realtime_assignments
  AFTER INSERT OR UPDATE OR DELETE ON assignments
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignments();

DROP TRIGGER IF EXISTS portal_realtime_assignment_personnel ON assignment_personnel;
CREATE TRIGGER portal_realtime_assignment_personnel
  AFTER INSERT OR UPDATE OR DELETE ON assignment_personnel
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignment_personnel();

DROP TRIGGER IF EXISTS portal_realtime_assignment_tasks ON assignment_tasks;
CREATE TRIGGER portal_realtime_assignment_tasks
  AFTER INSERT OR UPDATE OR DELETE ON assignment_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignment_child('assignments');

DROP TRIGGER IF EXISTS portal_realtime_assignment_extra_work ON assignment_extra_work;
CREATE TRIGGER portal_realtime_assignment_extra_work
  AFTER INSERT OR UPDATE OR DELETE ON assignment_extra_work
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignment_child('assignments');

DROP TRIGGER IF EXISTS portal_realtime_assignment_photos ON assignment_photos;
CREATE TRIGGER portal_realtime_assignment_photos
  AFTER INSERT OR UPDATE OR DELETE ON assignment_photos
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignment_child('reports');

DROP TRIGGER IF EXISTS portal_realtime_assignment_report_notes ON assignment_report_notes;
CREATE TRIGGER portal_realtime_assignment_report_notes
  AFTER INSERT OR UPDATE OR DELETE ON assignment_report_notes
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignment_child('reports');

DROP TRIGGER IF EXISTS portal_realtime_assignment_report_note_attachments ON assignment_report_note_attachments;
CREATE TRIGGER portal_realtime_assignment_report_note_attachments
  AFTER INSERT OR UPDATE OR DELETE ON assignment_report_note_attachments
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignment_child('reports');

DROP TRIGGER IF EXISTS portal_realtime_quotes ON quotes;
CREATE TRIGGER portal_realtime_quotes
  AFTER INSERT OR UPDATE OR DELETE ON quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_quote_invoice_report('quotes');

DROP TRIGGER IF EXISTS portal_realtime_reports ON reports;
CREATE TRIGGER portal_realtime_reports
  AFTER INSERT OR UPDATE OR DELETE ON reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_quote_invoice_report('reports');

DROP TRIGGER IF EXISTS portal_realtime_invoices ON invoices;
CREATE TRIGGER portal_realtime_invoices
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_quote_invoice_report('invoices');

DROP TRIGGER IF EXISTS portal_realtime_payments ON payments;
CREATE TRIGGER portal_realtime_payments
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_payment();

DROP TRIGGER IF EXISTS portal_realtime_assignment_capacity_checks ON assignment_capacity_checks;
CREATE TRIGGER portal_realtime_assignment_capacity_checks
  AFTER INSERT OR UPDATE OR DELETE ON assignment_capacity_checks
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignment_sidecar();

DROP TRIGGER IF EXISTS portal_realtime_assignment_candidates ON assignment_candidates;
CREATE TRIGGER portal_realtime_assignment_candidates
  AFTER INSERT OR UPDATE OR DELETE ON assignment_candidates
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignment_sidecar();

DROP TRIGGER IF EXISTS portal_realtime_assignment_interest_rounds ON assignment_interest_rounds;
CREATE TRIGGER portal_realtime_assignment_interest_rounds
  AFTER INSERT OR UPDATE OR DELETE ON assignment_interest_rounds
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignment_sidecar();

DROP TRIGGER IF EXISTS portal_realtime_assignment_interest_responses ON assignment_interest_responses;
CREATE TRIGGER portal_realtime_assignment_interest_responses
  AFTER INSERT OR UPDATE OR DELETE ON assignment_interest_responses
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_assignment_interest_response();

DROP TRIGGER IF EXISTS portal_realtime_planning_sector_rules ON planning_sector_rules;
CREATE TRIGGER portal_realtime_planning_sector_rules
  AFTER INSERT OR UPDATE OR DELETE ON planning_sector_rules
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_tenant_owned('planning');

DROP TRIGGER IF EXISTS portal_realtime_customer_portal_preferences ON customer_portal_preferences;
CREATE TRIGGER portal_realtime_customer_portal_preferences
  AFTER INSERT OR UPDATE OR DELETE ON customer_portal_preferences
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_customer_portal_preferences();

DROP TRIGGER IF EXISTS portal_realtime_customer_payment_batches ON customer_payment_batches;
CREATE TRIGGER portal_realtime_customer_payment_batches
  AFTER INSERT OR UPDATE OR DELETE ON customer_payment_batches
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_customer_payment_batch();

DROP TRIGGER IF EXISTS portal_realtime_customer_payment_batch_items ON customer_payment_batch_items;
CREATE TRIGGER portal_realtime_customer_payment_batch_items
  AFTER INSERT OR UPDATE OR DELETE ON customer_payment_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_customer_payment_batch_item();

DROP TRIGGER IF EXISTS portal_realtime_customers ON customers;
CREATE TRIGGER portal_realtime_customers
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_customer_owned('customers');

DROP TRIGGER IF EXISTS portal_realtime_objects ON objects;
CREATE TRIGGER portal_realtime_objects
  AFTER INSERT OR UPDATE OR DELETE ON objects
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_customer_owned('objects');

DROP TRIGGER IF EXISTS portal_realtime_customer_notifications ON customer_notifications;
CREATE TRIGGER portal_realtime_customer_notifications
  AFTER INSERT OR UPDATE OR DELETE ON customer_notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_customer_owned('notifications');

DROP TRIGGER IF EXISTS portal_realtime_personnel_notifications ON personnel_notifications;
CREATE TRIGGER portal_realtime_personnel_notifications
  AFTER INSERT OR UPDATE OR DELETE ON personnel_notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_personnel_owned('notifications');

DROP TRIGGER IF EXISTS portal_realtime_personnel ON personnel;
CREATE TRIGGER portal_realtime_personnel
  AFTER INSERT OR UPDATE OR DELETE ON personnel
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_personnel_owned('personnel');

DROP TRIGGER IF EXISTS portal_realtime_availability_windows ON availability_windows;
CREATE TRIGGER portal_realtime_availability_windows
  AFTER INSERT OR UPDATE OR DELETE ON availability_windows
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_personnel_owned('availability');

DROP TRIGGER IF EXISTS portal_realtime_availability_day_entries ON availability_day_entries;
CREATE TRIGGER portal_realtime_availability_day_entries
  AFTER INSERT OR UPDATE OR DELETE ON availability_day_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_personnel_owned('availability');

DROP TRIGGER IF EXISTS portal_realtime_leave_periods ON leave_periods;
CREATE TRIGGER portal_realtime_leave_periods
  AFTER INSERT OR UPDATE OR DELETE ON leave_periods
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_personnel_owned('leave');

DROP TRIGGER IF EXISTS portal_realtime_personnel_message_threads ON personnel_message_threads;
CREATE TRIGGER portal_realtime_personnel_message_threads
  AFTER INSERT OR UPDATE OR DELETE ON personnel_message_threads
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_personnel_owned('tickets');

DROP TRIGGER IF EXISTS portal_realtime_personnel_message_entries ON personnel_message_entries;
CREATE TRIGGER portal_realtime_personnel_message_entries
  AFTER INSERT OR UPDATE OR DELETE ON personnel_message_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_personnel_ticket_entry();

DROP TRIGGER IF EXISTS portal_realtime_customer_message_threads ON customer_message_threads;
CREATE TRIGGER portal_realtime_customer_message_threads
  AFTER INSERT OR UPDATE OR DELETE ON customer_message_threads
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_customer_owned('tickets');

DROP TRIGGER IF EXISTS portal_realtime_customer_message_entries ON customer_message_entries;
CREATE TRIGGER portal_realtime_customer_message_entries
  AFTER INSERT OR UPDATE OR DELETE ON customer_message_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_realtime_customer_ticket_entry();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'portal_realtime_events'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE portal_realtime_events;
  END IF;
END $$;
