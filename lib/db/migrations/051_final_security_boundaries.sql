-- TAAK-25: Final security/privacy boundary hardening.
-- Replace historical email-based customer RLS with explicit customer_users
-- membership checks and add defense-in-depth policies for core workflow tables.

CREATE OR REPLACE FUNCTION public.customer_has_access(p_customer_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM customer_users cu
    WHERE cu.customer_id = p_customer_id
      AND cu.tenant_id = p_tenant_id
      AND cu.user_id = (SELECT auth.uid())
      AND cu.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.customer_has_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_has_access(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.personnel_assigned_to_assignment(p_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assignment_personnel ap
    JOIN personnel p ON p.id = ap.personnel_id
    WHERE ap.assignment_id = p_assignment_id
      AND ap.status = 'assigned'
      AND p.user_id = (SELECT auth.uid())
      AND p.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.personnel_assigned_to_assignment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.personnel_assigned_to_assignment(uuid) TO authenticated;

-- Customer membership itself: no customer authorization by e-mail-only RLS.
DROP POLICY IF EXISTS customer_users_self_or_management ON customer_users;
DROP POLICY IF EXISTS customer_users_management_write ON customer_users;

CREATE POLICY customer_users_self_or_management
  ON customer_users
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()) OR is_management());

CREATE POLICY customer_users_management_write
  ON customer_users
  FOR ALL
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

-- Remove legacy email-based customer/object policies.
DROP POLICY IF EXISTS customers_select_own ON customers;
DROP POLICY IF EXISTS customers_select_own_email_ci ON customers;
DROP POLICY IF EXISTS objects_select_customer ON objects;
DROP POLICY IF EXISTS objects_select_customer_email_ci ON objects;
DROP POLICY IF EXISTS objects_insert_customer ON objects;
DROP POLICY IF EXISTS objects_update_customer ON objects;
DROP POLICY IF EXISTS object_contacts_select_customer ON object_contacts;
DROP POLICY IF EXISTS object_contacts_insert_customer ON object_contacts;
DROP POLICY IF EXISTS object_contacts_update_customer ON object_contacts;
DROP POLICY IF EXISTS object_contacts_delete_customer ON object_contacts;

DROP POLICY IF EXISTS customers_customer_users_select ON customers;
CREATE POLICY customers_customer_users_select
  ON customers
  FOR SELECT
  TO authenticated
  USING (public.customer_has_access(id, tenant_id));

DROP POLICY IF EXISTS objects_customer_users_select ON objects;
CREATE POLICY objects_customer_users_select
  ON objects
  FOR SELECT
  TO authenticated
  USING (public.customer_has_access(customer_id, tenant_id));

DROP POLICY IF EXISTS objects_customer_users_insert ON objects;
CREATE POLICY objects_customer_users_insert
  ON objects
  FOR INSERT
  TO authenticated
  WITH CHECK (public.customer_has_access(customer_id, tenant_id));

DROP POLICY IF EXISTS objects_customer_users_update ON objects;
CREATE POLICY objects_customer_users_update
  ON objects
  FOR UPDATE
  TO authenticated
  USING (public.customer_has_access(customer_id, tenant_id))
  WITH CHECK (public.customer_has_access(customer_id, tenant_id));

DROP POLICY IF EXISTS object_contacts_customer_users_select ON object_contacts;
CREATE POLICY object_contacts_customer_users_select
  ON object_contacts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM objects o
      WHERE o.id = object_contacts.object_id
        AND public.customer_has_access(o.customer_id, o.tenant_id)
    )
  );

DROP POLICY IF EXISTS object_contacts_customer_users_insert ON object_contacts;
CREATE POLICY object_contacts_customer_users_insert
  ON object_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM objects o
      WHERE o.id = object_contacts.object_id
        AND public.customer_has_access(o.customer_id, o.tenant_id)
    )
  );

DROP POLICY IF EXISTS object_contacts_customer_users_update ON object_contacts;
CREATE POLICY object_contacts_customer_users_update
  ON object_contacts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM objects o
      WHERE o.id = object_contacts.object_id
        AND public.customer_has_access(o.customer_id, o.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM objects o
      WHERE o.id = object_contacts.object_id
        AND public.customer_has_access(o.customer_id, o.tenant_id)
    )
  );

DROP POLICY IF EXISTS object_contacts_customer_users_delete ON object_contacts;
CREATE POLICY object_contacts_customer_users_delete
  ON object_contacts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM objects o
      WHERE o.id = object_contacts.object_id
        AND public.customer_has_access(o.customer_id, o.tenant_id)
    )
  );

-- Customer portal financial/notification policies previously used contact_email.
DROP POLICY IF EXISTS customer_portal_preferences_own ON customer_portal_preferences;
CREATE POLICY customer_portal_preferences_own
  ON customer_portal_preferences
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM customers c
      WHERE c.id = customer_portal_preferences.customer_id
        AND public.customer_has_access(c.id, c.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM customers c
      WHERE c.id = customer_portal_preferences.customer_id
        AND public.customer_has_access(c.id, c.tenant_id)
    )
  );

DROP POLICY IF EXISTS customer_payment_batches_own ON customer_payment_batches;
CREATE POLICY customer_payment_batches_own
  ON customer_payment_batches
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM customers c
      WHERE c.id = customer_payment_batches.customer_id
        AND public.customer_has_access(c.id, c.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM customers c
      WHERE c.id = customer_payment_batches.customer_id
        AND public.customer_has_access(c.id, c.tenant_id)
    )
  );

DROP POLICY IF EXISTS customer_payment_batch_items_own ON customer_payment_batch_items;
CREATE POLICY customer_payment_batch_items_own
  ON customer_payment_batch_items
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM customer_payment_batches b
      JOIN customers c ON c.id = b.customer_id
      WHERE b.id = customer_payment_batch_items.batch_id
        AND public.customer_has_access(c.id, c.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM customer_payment_batches b
      JOIN customers c ON c.id = b.customer_id
      WHERE b.id = customer_payment_batch_items.batch_id
        AND public.customer_has_access(c.id, c.tenant_id)
    )
  );

DROP POLICY IF EXISTS customer_notifications_own ON customer_notifications;
CREATE POLICY customer_notifications_own
  ON customer_notifications
  TO authenticated
  USING (public.customer_has_access(customer_id, tenant_id))
  WITH CHECK (public.customer_has_access(customer_id, tenant_id));

DROP POLICY IF EXISTS push_subscriptions_customer_own ON push_subscriptions;
CREATE POLICY push_subscriptions_customer_own
  ON push_subscriptions
  TO authenticated
  USING (
    owner_type = 'customer'
    AND customer_id IS NOT NULL
    AND public.customer_has_access(customer_id, tenant_id)
  )
  WITH CHECK (
    owner_type = 'customer'
    AND customer_id IS NOT NULL
    AND public.customer_has_access(customer_id, tenant_id)
  );

-- Core workflow tables: RLS defense in depth for Data API access.
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_extra_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_report_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_report_note_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assignments_management_all ON assignments;
CREATE POLICY assignments_management_all
  ON assignments
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS assignments_customer_users_select ON assignments;
CREATE POLICY assignments_customer_users_select
  ON assignments
  FOR SELECT
  TO authenticated
  USING (public.customer_has_access(customer_id, tenant_id));

DROP POLICY IF EXISTS assignments_personnel_assigned_select ON assignments;
CREATE POLICY assignments_personnel_assigned_select
  ON assignments
  FOR SELECT
  TO authenticated
  USING (public.personnel_assigned_to_assignment(id));

DROP POLICY IF EXISTS assignment_personnel_management_all ON assignment_personnel;
CREATE POLICY assignment_personnel_management_all
  ON assignment_personnel
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS assignment_personnel_own_select ON assignment_personnel;
CREATE POLICY assignment_personnel_own_select
  ON assignment_personnel
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM personnel p
      WHERE p.id = assignment_personnel.personnel_id
        AND p.user_id = (SELECT auth.uid())
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS assignment_tasks_management_all ON assignment_tasks;
CREATE POLICY assignment_tasks_management_all
  ON assignment_tasks
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS assignment_tasks_customer_users_select ON assignment_tasks;
CREATE POLICY assignment_tasks_customer_users_select
  ON assignment_tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM assignments a
      WHERE a.id = assignment_tasks.assignment_id
        AND public.customer_has_access(a.customer_id, a.tenant_id)
    )
  );

DROP POLICY IF EXISTS assignment_tasks_personnel_assigned_select ON assignment_tasks;
CREATE POLICY assignment_tasks_personnel_assigned_select
  ON assignment_tasks
  FOR SELECT
  TO authenticated
  USING (public.personnel_assigned_to_assignment(assignment_id));

DROP POLICY IF EXISTS assignment_extra_work_customer_users_select ON assignment_extra_work;
CREATE POLICY assignment_extra_work_customer_users_select
  ON assignment_extra_work
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM assignments a
      WHERE a.id = assignment_extra_work.assignment_id
        AND public.customer_has_access(a.customer_id, a.tenant_id)
    )
  );

DROP POLICY IF EXISTS assignment_extra_work_personnel_assigned_select ON assignment_extra_work;
CREATE POLICY assignment_extra_work_personnel_assigned_select
  ON assignment_extra_work
  FOR SELECT
  TO authenticated
  USING (public.personnel_assigned_to_assignment(assignment_id));

DROP POLICY IF EXISTS assignment_photos_customer_approved_select ON assignment_photos;
CREATE POLICY assignment_photos_customer_approved_select
  ON assignment_photos
  FOR SELECT
  TO authenticated
  USING (
    is_approved = true
    AND EXISTS (
      SELECT 1
      FROM assignments a
      WHERE a.id = assignment_photos.assignment_id
        AND public.customer_has_access(a.customer_id, a.tenant_id)
    )
  );

DROP POLICY IF EXISTS assignment_photos_personnel_assigned_select ON assignment_photos;
CREATE POLICY assignment_photos_personnel_assigned_select
  ON assignment_photos
  FOR SELECT
  TO authenticated
  USING (public.personnel_assigned_to_assignment(assignment_id));

DROP POLICY IF EXISTS reports_management_all ON reports;
CREATE POLICY reports_management_all
  ON reports
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS reports_customer_approved_select ON reports;
CREATE POLICY reports_customer_approved_select
  ON reports
  FOR SELECT
  TO authenticated
  USING (
    status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM assignments a
      WHERE a.id = reports.assignment_id
        AND public.customer_has_access(a.customer_id, a.tenant_id)
    )
  );

DROP POLICY IF EXISTS reports_personnel_own_select ON reports;
CREATE POLICY reports_personnel_own_select
  ON reports
  FOR SELECT
  TO authenticated
  USING (
    submitted_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM assignments a
      WHERE a.id = reports.assignment_id
        AND public.personnel_assigned_to_assignment(a.id)
    )
  );

DROP POLICY IF EXISTS quotes_management_all ON quotes;
CREATE POLICY quotes_management_all
  ON quotes
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS quotes_customer_sent_select ON quotes;
CREATE POLICY quotes_customer_sent_select
  ON quotes
  FOR SELECT
  TO authenticated
  USING (
    status IN ('sent', 'approved', 'rejected', 'expired')
    AND EXISTS (
      SELECT 1
      FROM customers c
      WHERE c.id = quotes.customer_id
        AND public.customer_has_access(c.id, c.tenant_id)
    )
  );

DROP POLICY IF EXISTS invoices_management_all ON invoices;
CREATE POLICY invoices_management_all
  ON invoices
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS invoices_customer_sent_select ON invoices;
CREATE POLICY invoices_customer_sent_select
  ON invoices
  FOR SELECT
  TO authenticated
  USING (
    status IN ('sent', 'paid', 'cancelled')
    AND EXISTS (
      SELECT 1
      FROM customers c
      WHERE c.id = invoices.customer_id
        AND public.customer_has_access(c.id, c.tenant_id)
    )
  );
