-- ============================================================================
-- Preserve platform-notification recipient history after role removal.
--
-- The original foreign key uses ON DELETE SET NULL, but its scope CHECK also
-- requires platform_user_id for every platform recipient. Those two contracts
-- contradict each other and make a platform role impossible to remove once it
-- has received a notification. recipient_user_id is the immutable Auth-user
-- snapshot written for platform recipients. Backfill older linked rows before
-- making that snapshot mandatory, so it can retain the historical recipient
-- identity after the revocable platform role is removed.
--
-- Tenant isolation and RLS are unchanged. Forward-only rollback reasoning:
-- retain the relaxed history shape because a later role removal can create
-- legitimate NULL platform_user_id values. If a stricter archival contract is
-- needed, add and backfill a dedicated immutable recipient snapshot in a later
-- migration before tightening this constraint again.
-- ============================================================================

DO $fieldgrid_platform_recipient_history_prerequisites$
DECLARE
  old_scope_count integer;
BEGIN
  IF pg_catalog.to_regclass(
    'public.platform_notification_recipients'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Platform notification recipients must exist before history repair';
  END IF;

  IF current_user IN ('fieldgrid_runtime_app', 'fieldgrid_runtime_data') THEN
    RAISE EXCEPTION
      'Runtime principals may not change platform notification constraints';
  END IF;

  SELECT COUNT(*)::integer
    INTO old_scope_count
    FROM pg_catalog.pg_constraint AS constraint_row
   WHERE constraint_row.contype = 'c'
     AND constraint_row.convalidated = true
     AND constraint_row.conname =
       'platform_notification_recipients_scope_check'
     AND constraint_row.conrelid =
       'public.platform_notification_recipients'::regclass
     AND regexp_replace(
       lower(pg_catalog.pg_get_expr(
         constraint_row.conbin,
         constraint_row.conrelid,
         false
       )),
       '[[:space:]]+',
       '',
       'g'
     ) = $scope$((((recipient_type)::text='platform_user'::text)and(platform_user_idisnotnull)and(tenant_idisnull))or(((recipient_type)::text='tenant_owner'::text)and(tenant_idisnotnull)and((tenant_owner_invite_idisnotnull)or(recipient_emailisnotnull))))$scope$;

  IF old_scope_count <> 1 THEN
    RAISE EXCEPTION
      'Platform notification recipient scope constraint is not the exact predecessor';
  END IF;
END;
$fieldgrid_platform_recipient_history_prerequisites$;

DO $fieldgrid_platform_recipient_history_identity_guard$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.platform_notification_recipients AS recipient
      JOIN public.platform_users AS platform_user
        ON platform_user.id = recipient.platform_user_id
     WHERE recipient.recipient_type = 'platform_user'
       AND recipient.recipient_user_id IS NOT NULL
       AND recipient.recipient_user_id <> platform_user.user_id
  ) THEN
    RAISE EXCEPTION
      'Linked platform notification recipient identity is inconsistent';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.platform_notification_recipients AS recipient
      JOIN public.tenants AS tenant ON tenant.id = recipient.tenant_id
     WHERE recipient.recipient_type = 'tenant_owner'
       AND recipient.tenant_slug IS NOT NULL
       AND recipient.tenant_slug <> tenant.slug
  ) THEN
    RAISE EXCEPTION
      'Linked tenant notification recipient identity is inconsistent';
  END IF;
END;
$fieldgrid_platform_recipient_history_identity_guard$;

UPDATE public.platform_notification_recipients AS recipient
   SET recipient_user_id = platform_user.user_id
  FROM public.platform_users AS platform_user
 WHERE recipient.recipient_type = 'platform_user'
   AND recipient.platform_user_id = platform_user.id
   AND recipient.recipient_user_id IS NULL;

UPDATE public.platform_notification_recipients AS recipient
   SET tenant_slug = tenant.slug,
       tenant_name = COALESCE(recipient.tenant_name, tenant.name)
  FROM public.tenants AS tenant
 WHERE recipient.recipient_type = 'tenant_owner'
   AND recipient.tenant_id = tenant.id
   AND recipient.tenant_slug IS NULL;

ALTER TABLE public.platform_notification_recipients
  ADD CONSTRAINT platform_notification_recipients_scope_history_check_v2 CHECK (
    (
      recipient_type = 'platform_user'
      AND tenant_id IS NULL
      AND tenant_owner_invite_id IS NULL
      AND recipient_user_id IS NOT NULL
      AND (
        platform_user_id IS NOT NULL
        OR delivery_status IN ('sent', 'skipped', 'failed')
      )
    )
    OR
    (
      recipient_type = 'tenant_owner'
      AND platform_user_id IS NULL
      AND tenant_slug IS NOT NULL
      AND (
        tenant_owner_invite_id IS NOT NULL
        OR recipient_email IS NOT NULL
      )
      AND (
        tenant_id IS NOT NULL
        OR delivery_status IN ('sent', 'skipped', 'failed')
      )
    )
  ) NOT VALID;

ALTER TABLE public.platform_notification_recipients
  VALIDATE CONSTRAINT platform_notification_recipients_scope_history_check_v2;

ALTER TABLE public.platform_notification_recipients
  DROP CONSTRAINT platform_notification_recipients_scope_check;

ALTER TABLE public.platform_notification_recipients
  RENAME CONSTRAINT platform_notification_recipients_scope_history_check_v2
  TO platform_notification_recipients_scope_check;
