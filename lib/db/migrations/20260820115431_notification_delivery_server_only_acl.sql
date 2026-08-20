-- Delivery state can cause external provider side effects. Tenant management
-- may inspect its own evidence, but only trusted server roles may enqueue,
-- mutate, retry or delete queue and attempt rows.

DROP POLICY IF EXISTS notification_delivery_queue_management
  ON public.notification_delivery_queue;
CREATE POLICY notification_delivery_queue_management_read
  ON public.notification_delivery_queue
  FOR SELECT
  TO authenticated
  USING (public.is_management_for_tenant(tenant_id));

DROP POLICY IF EXISTS notification_delivery_attempts_management
  ON public.notification_delivery_attempts;
CREATE POLICY notification_delivery_attempts_management_read
  ON public.notification_delivery_attempts
  FOR SELECT
  TO authenticated
  USING (public.is_management_for_tenant(tenant_id));

REVOKE INSERT, UPDATE, DELETE
  ON public.notification_delivery_queue
  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE
  ON public.notification_delivery_attempts
  FROM authenticated;
GRANT SELECT ON public.notification_delivery_queue TO authenticated;
GRANT SELECT ON public.notification_delivery_attempts TO authenticated;

COMMENT ON POLICY notification_delivery_queue_management_read
  ON public.notification_delivery_queue IS
  'Tenant-bound management read access only; provider-driving writes are server-only.';
COMMENT ON POLICY notification_delivery_attempts_management_read
  ON public.notification_delivery_attempts IS
  'Tenant-bound management read access only; delivery evidence writes are server-only.';
