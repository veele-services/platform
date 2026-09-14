BEGIN;

-- Existing active tenant members may receive an additional tenant role or be
-- promoted through a platform-managed invite. Keep that operation durable
-- across Auth finalization without suspending the member's existing access.

DO $fieldgrid_active_tenant_invitation_prerequisites$
DECLARE
  source_constraint_count integer;
  reservation_constraint_count integer;
  source_constraint_definition text;
BEGIN
  IF pg_catalog.to_regclass('public.tenant_users') IS NULL THEN
    RAISE EXCEPTION
      'tenant_users must exist before active invitation reservations are enabled';
  END IF;

  SELECT COUNT(*)::integer,
         pg_catalog.max(
           pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
         )
    INTO source_constraint_count, source_constraint_definition
    FROM pg_catalog.pg_constraint AS constraint_row
   WHERE constraint_row.conrelid = 'public.tenant_users'::regclass
     AND constraint_row.conname =
       'tenant_users_invitation_source_state_check'
     AND constraint_row.contype = 'c'
     AND constraint_row.convalidated IS TRUE;

  SELECT COUNT(*)::integer
    INTO reservation_constraint_count
    FROM pg_catalog.pg_constraint AS constraint_row
   WHERE constraint_row.conrelid = 'public.tenant_users'::regclass
     AND constraint_row.conname =
       'tenant_users_invitation_reservation_check'
     AND constraint_row.contype = 'c'
     AND constraint_row.convalidated IS TRUE;

  IF source_constraint_count <> 1
     OR reservation_constraint_count <> 1
     OR source_constraint_definition IS NULL
     OR pg_catalog.strpos(
          source_constraint_definition,
          'tenant_role_invite'
        ) = 0
     OR pg_catalog.strpos(
          source_constraint_definition,
          'platform_tenant_admin'
        ) = 0
     OR pg_catalog.strpos(
          source_constraint_definition,
          'platform_tenant_owner'
        ) = 0
     OR pg_catalog.strpos(
          source_constraint_definition,
          'tenant_provisioning_owner'
        ) = 0
     OR pg_catalog.strpos(source_constraint_definition, 'invited') = 0
     OR pg_catalog.strpos(source_constraint_definition, 'active') > 0 THEN
    RAISE EXCEPTION
      'tenant invitation reservation prerequisite contract is not exact';
  END IF;
END;
$fieldgrid_active_tenant_invitation_prerequisites$;

LOCK TABLE public.tenant_users IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.tenant_users
  ADD CONSTRAINT tenant_users_invitation_source_state_check_v2
  CHECK (
    invitation_source IS NULL
    OR (
      status = 'invited'
      AND (
        (invitation_source = 'tenant_role_invite' AND role = 'member')
        OR invitation_source = 'platform_tenant_admin'
        OR (
          invitation_source IN (
            'platform_tenant_owner',
            'tenant_provisioning_owner'
          )
          AND role = 'owner'
        )
      )
    )
    OR (
      status = 'active'
      AND invitation_source IN (
        'tenant_role_invite',
        'platform_tenant_admin',
        'platform_tenant_owner'
      )
    )
  ) NOT VALID;

ALTER TABLE public.tenant_users
  VALIDATE CONSTRAINT tenant_users_invitation_source_state_check_v2;

ALTER TABLE public.tenant_users
  DROP CONSTRAINT tenant_users_invitation_source_state_check;

ALTER TABLE public.tenant_users
  RENAME CONSTRAINT tenant_users_invitation_source_state_check_v2
  TO tenant_users_invitation_source_state_check;

COMMENT ON COLUMN public.tenant_users.invitation_source IS
  'Durable owner of a tenant authorization reservation; cleared atomically on activation.';
COMMENT ON COLUMN public.tenant_users.invitation_reservation_id IS
  'Opaque owner token for a tenant authorization reservation; replaced on reclaim and cleared on activation.';

DO $fieldgrid_active_tenant_invitation_closure$
DECLARE
  exact_constraint_count integer;
  constraint_definition text;
BEGIN
  SELECT COUNT(*)::integer,
         pg_catalog.max(
           pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
         )
    INTO exact_constraint_count, constraint_definition
    FROM pg_catalog.pg_constraint AS constraint_row
   WHERE constraint_row.conrelid = 'public.tenant_users'::regclass
     AND constraint_row.conname =
       'tenant_users_invitation_source_state_check'
     AND constraint_row.contype = 'c'
     AND constraint_row.convalidated IS TRUE;

  IF exact_constraint_count <> 1
     OR constraint_definition IS NULL
     OR pg_catalog.strpos(constraint_definition, 'invited') = 0
     OR pg_catalog.strpos(constraint_definition, 'active') = 0
     OR pg_catalog.strpos(constraint_definition, 'tenant_role_invite') = 0
     OR pg_catalog.strpos(constraint_definition, 'platform_tenant_admin') = 0
     OR pg_catalog.strpos(constraint_definition, 'platform_tenant_owner') = 0
     OR pg_catalog.strpos(constraint_definition, 'tenant_provisioning_owner') = 0 THEN
    RAISE EXCEPTION
      'active tenant invitation reservation contract is not exact';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.tenant_users AS tenant_user
     WHERE tenant_user.invitation_source IS NOT NULL
       AND (
         tenant_user.invitation_reservation_id IS NULL
         OR NOT (
           (
             tenant_user.status = 'invited'
             AND (
               (
                 tenant_user.invitation_source = 'tenant_role_invite'
                 AND tenant_user.role = 'member'
               )
               OR tenant_user.invitation_source = 'platform_tenant_admin'
               OR (
                 tenant_user.invitation_source IN (
                   'platform_tenant_owner',
                   'tenant_provisioning_owner'
                 )
                 AND tenant_user.role = 'owner'
               )
             )
           )
           OR (
             tenant_user.status = 'active'
             AND tenant_user.invitation_source IN (
               'tenant_role_invite',
               'platform_tenant_admin',
               'platform_tenant_owner'
             )
           )
         )
       )
  ) THEN
    RAISE EXCEPTION
      'tenant invitation reservations violate the active reservation contract';
  END IF;
END;
$fieldgrid_active_tenant_invitation_closure$;

COMMIT;
