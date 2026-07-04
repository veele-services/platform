-- ============================================================================
-- Sprint 8: tenant-id default hardening
-- ============================================================================
-- Tenant-scoped runtime/configuration tables must receive tenant_id from the
-- authenticated tenant context, parent trigger, or explicit provisioning flow.
-- Missing tenant context should fail instead of silently writing to the default
-- tenant.

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'customers',
    'customer_users',
    'customer_message_threads',
    'domain_events',
    'push_subscriptions',
    'native_push_device_tokens',
    'customer_notifications',
    'notification_dispatches',
    'notification_delivery_queue',
    'notification_delivery_attempts',
    'objects',
    'organization_settings',
    'personnel',
    'personnel_notifications',
    'personnel_message_threads',
    'assignment_capacity_checks',
    'assignment_candidates',
    'assignment_interest_rounds',
    'assignment_interest_responses',
    'planning_sector_rules',
    'qualification_items',
    'personnel_qualifications',
    'role_qualifications',
    'task_code_qualifications',
    'task_codes',
    'tenant_domains',
    'tenant_roles',
    'tenant_user_roles',
    'tenant_sectors'
  ]
  LOOP
    IF to_regclass(format('public.%I', target_table)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id DROP DEFAULT', target_table);
    END IF;
  END LOOP;
END $$;
