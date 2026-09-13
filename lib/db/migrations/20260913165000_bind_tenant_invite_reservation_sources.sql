-- ============================================================================
-- Bind incomplete tenant authorization reservations to their creating flow.
--
-- Auth finalization and the tenant_users activation cannot share one database
-- transaction. A process exit between those steps therefore leaves an invited
-- row behind. The durable source lets the same flow reclaim that reservation
-- on retry without allowing another invite path to adopt it.
--
-- Existing rows remain NULL and are not attributed retroactively. Active rows
-- must always clear the source. Rollback is forward-only: retain the nullable
-- column and constraint; removing either would re-open cross-flow adoption.
-- ============================================================================

DO $fieldgrid_tenant_invitation_source_prerequisites$
BEGIN
  IF pg_catalog.to_regclass('public.tenant_users') IS NULL THEN
    RAISE EXCEPTION 'tenant_users must exist before invitation sources are added';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_row
     WHERE attribute_row.attrelid = 'public.tenant_users'::regclass
       AND attribute_row.attname = 'invitation_source'
       AND attribute_row.attnum > 0
       AND attribute_row.attisdropped IS FALSE
  ) OR EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.tenant_users'::regclass
       AND constraint_row.conname =
         'tenant_users_invitation_source_state_check'
  ) THEN
    RAISE EXCEPTION 'tenant invitation source contract already exists outside migration history';
  END IF;
END;
$fieldgrid_tenant_invitation_source_prerequisites$;

LOCK TABLE public.tenant_users IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.tenant_users
  ADD COLUMN invitation_source varchar(64);

ALTER TABLE public.tenant_users
  ADD CONSTRAINT tenant_users_invitation_source_state_check
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
  );

COMMENT ON COLUMN public.tenant_users.invitation_source IS
  'Durable owner of an invited authorization reservation; cleared atomically on activation.';

DO $fieldgrid_tenant_invitation_source_closure$
DECLARE
  exact_column_count integer;
  exact_constraint_count integer;
  constraint_definition text;
BEGIN
  SELECT COUNT(*)::integer
    INTO exact_column_count
    FROM pg_catalog.pg_attribute AS attribute_row
    JOIN pg_catalog.pg_type AS type_row
      ON type_row.oid = attribute_row.atttypid
   WHERE attribute_row.attrelid = 'public.tenant_users'::regclass
     AND attribute_row.attname = 'invitation_source'
     AND attribute_row.attnum > 0
     AND attribute_row.attisdropped IS FALSE
     AND attribute_row.attnotnull IS FALSE
     AND type_row.typname = 'varchar'
     AND attribute_row.atttypmod = 68;

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

  IF exact_column_count <> 1
     OR exact_constraint_count <> 1
     OR constraint_definition IS NULL
     OR pg_catalog.strpos(constraint_definition, 'tenant_role_invite') = 0
     OR pg_catalog.strpos(constraint_definition, 'platform_tenant_admin') = 0
     OR pg_catalog.strpos(constraint_definition, 'platform_tenant_owner') = 0
     OR pg_catalog.strpos(constraint_definition, 'tenant_provisioning_owner') = 0
     OR pg_catalog.strpos(constraint_definition, 'invited') = 0
     OR pg_catalog.strpos(constraint_definition, 'member') = 0
     OR pg_catalog.strpos(constraint_definition, 'owner') = 0 THEN
    RAISE EXCEPTION 'tenant invitation source contract is not exact';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.tenant_users AS tenant_user
     WHERE tenant_user.invitation_source IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'existing tenant users may not be attributed retroactively';
  END IF;
END;
$fieldgrid_tenant_invitation_source_closure$;
