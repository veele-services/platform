-- ============================================================================
-- Give only the configured migration administrator the DELETE path needed by
-- the reviewed staging identity-overlap repair.
--
-- platform_users uses FORCE RLS. The existing migration-admin compatibility
-- policy intentionally mirrors runtime INSERT/SELECT/UPDATE capabilities and
-- therefore cannot delete the quarantined duplicate platform row. This policy
-- permits deletion only when that row is a suspended platform owner and the
-- same Auth UUID already has an active tenant membership. Runtime, browser and
-- service roles receive neither DELETE privilege nor this policy.
--
-- Forward-only rollback reasoning: retain the narrow policy so the immutable
-- repair workflow remains reproducible. Removing it later requires a successor
-- migration after every affected environment has recorded successful repair.
-- ============================================================================

DO $fieldgrid_platform_overlap_delete_prerequisites$
DECLARE
  configured_migration_admin name;
  exact_continuity_trigger_count integer;
  exact_runtime_capability_count integer;
BEGIN
  IF pg_catalog.to_regclass('public.platform_users') IS NULL
     OR pg_catalog.to_regclass('public.tenant_users') IS NULL
     OR pg_catalog.to_regclass(
       'app_private.fieldgrid_runtime_principal_configuration'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'app_private.fieldgrid_runtime_relation_capabilities'
     ) IS NULL THEN
    RAISE EXCEPTION
      'Platform overlap repair policy prerequisites are incomplete';
  END IF;

  SELECT configuration.migration_admin
    INTO configured_migration_admin
    FROM app_private.fieldgrid_runtime_principal_configuration AS configuration
   WHERE configuration.singleton IS TRUE;

  IF configured_migration_admin IS NULL
     OR configured_migration_admin <> current_user THEN
    RAISE EXCEPTION
      'Platform overlap repair policy must be installed by the configured migration admin';
  END IF;

  IF current_user IN ('fieldgrid_runtime_app', 'fieldgrid_runtime_data') THEN
    RAISE EXCEPTION
      'Runtime principals may not install the platform overlap repair policy';
  END IF;

  IF NOT (
    SELECT relation_row.relrowsecurity AND relation_row.relforcerowsecurity
      FROM pg_catalog.pg_class AS relation_row
     WHERE relation_row.oid = 'public.platform_users'::regclass
  ) THEN
    RAISE EXCEPTION 'platform_users must retain FORCE ROW LEVEL SECURITY';
  END IF;

  SELECT COUNT(*)::integer
    INTO exact_continuity_trigger_count
    FROM pg_catalog.pg_trigger AS trigger_row
   WHERE trigger_row.tgrelid = 'public.platform_users'::regclass
     AND trigger_row.tgname IN (
       'platform_users_owner_continuity_update',
       'platform_users_owner_continuity_delete'
     )
     AND trigger_row.tgenabled = 'O'
     AND trigger_row.tgisinternal IS FALSE;

  SELECT COUNT(*)::integer
    INTO exact_runtime_capability_count
    FROM app_private.fieldgrid_runtime_relation_capabilities AS capability
   WHERE capability.schema_name = 'public'
     AND capability.relation_name = 'platform_users'
     AND capability.access_mode = 'direct'
     AND capability.privileges = ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]
     AND NOT ('DELETE' = ANY(capability.privileges));

  IF exact_continuity_trigger_count <> 2
     OR exact_runtime_capability_count <> 1 THEN
    RAISE EXCEPTION
      'Platform overlap repair policy does not match the reviewed authorization frontier';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policy AS policy_row
     WHERE policy_row.polrelid = 'public.platform_users'::regclass
       AND policy_row.polname =
         'fieldgrid_migration_admin_platform_overlap_delete'
  ) THEN
    RAISE EXCEPTION
      'Platform overlap repair policy already exists outside migration history';
  END IF;
END;
$fieldgrid_platform_overlap_delete_prerequisites$;

LOCK TABLE public.platform_users IN SHARE ROW EXCLUSIVE MODE;

DO $fieldgrid_create_platform_overlap_delete_policy$
DECLARE
  configured_migration_admin name;
BEGIN
  SELECT configuration.migration_admin
    INTO STRICT configured_migration_admin
    FROM app_private.fieldgrid_runtime_principal_configuration AS configuration
   WHERE configuration.singleton IS TRUE;

  EXECUTE pg_catalog.format(
    'GRANT DELETE ON TABLE public.platform_users TO %I',
    configured_migration_admin
  );
  EXECUTE pg_catalog.format(
    'CREATE POLICY fieldgrid_migration_admin_platform_overlap_delete '
    'ON public.platform_users AS PERMISSIVE FOR DELETE TO %I '
    'USING ('
      'role = ''owner'' '
      'AND status = ''suspended'' '
      'AND EXISTS ('
        'SELECT 1 FROM public.tenant_users AS tenant_membership '
        'WHERE tenant_membership.user_id = platform_users.user_id '
          'AND tenant_membership.status = ''active'''
      ')'
    ')',
    configured_migration_admin
  );
END;
$fieldgrid_create_platform_overlap_delete_policy$;

DO $fieldgrid_platform_overlap_delete_closure$
DECLARE
  configured_migration_admin name;
  policy_expression text;
  forbidden_delete_policy_count integer;
BEGIN
  SELECT configuration.migration_admin
    INTO STRICT configured_migration_admin
    FROM app_private.fieldgrid_runtime_principal_configuration AS configuration
   WHERE configuration.singleton IS TRUE;

  SELECT pg_catalog.pg_get_expr(policy_row.polqual, policy_row.polrelid)
    INTO STRICT policy_expression
    FROM pg_catalog.pg_policy AS policy_row
   WHERE policy_row.polrelid = 'public.platform_users'::regclass
     AND policy_row.polname =
       'fieldgrid_migration_admin_platform_overlap_delete'
     AND policy_row.polcmd = 'd'
     AND policy_row.polpermissive IS TRUE
     AND policy_row.polwithcheck IS NULL
     AND policy_row.polroles = ARRAY[
       configured_migration_admin::text::pg_catalog.regrole::oid
     ]::oid[];

  IF policy_expression IS NULL
     OR pg_catalog.strpos(policy_expression, 'role') = 0
     OR pg_catalog.strpos(policy_expression, 'owner') = 0
     OR pg_catalog.strpos(policy_expression, 'status') = 0
     OR pg_catalog.strpos(policy_expression, 'suspended') = 0
     OR pg_catalog.strpos(policy_expression, 'tenant_users') = 0
     OR pg_catalog.strpos(policy_expression, 'user_id') = 0
     OR pg_catalog.strpos(policy_expression, 'active') = 0 THEN
    RAISE EXCEPTION
      'Platform overlap repair DELETE policy is not exact';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
    configured_migration_admin,
    'public.platform_users'::regclass,
    'DELETE'
  ) THEN
    RAISE EXCEPTION
      'Configured migration admin lacks platform overlap DELETE privilege';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (
        VALUES
          ('anon'::name),
          ('authenticated'::name),
          ('service_role'::name),
          ('fieldgrid_runtime_app'::name),
          ('fieldgrid_runtime_data'::name)
      ) AS forbidden_role(role_name)
     WHERE pg_catalog.has_table_privilege(
       forbidden_role.role_name,
       'public.platform_users'::regclass,
       'DELETE'
     )
  ) THEN
    RAISE EXCEPTION
      'Runtime, browser or service platform_users DELETE privilege remains';
  END IF;

  SELECT COUNT(*)::integer
    INTO forbidden_delete_policy_count
    FROM pg_catalog.pg_policy AS policy_row
    CROSS JOIN LATERAL unnest(policy_row.polroles) AS policy_role(role_oid)
   WHERE policy_row.polrelid = 'public.platform_users'::regclass
     AND policy_row.polcmd IN ('*', 'd')
     AND policy_role.role_oid = ANY(
       ARRAY[
         0::oid,
         'anon'::pg_catalog.regrole::oid,
         'authenticated'::pg_catalog.regrole::oid,
         'service_role'::pg_catalog.regrole::oid,
         'fieldgrid_runtime_app'::pg_catalog.regrole::oid,
         'fieldgrid_runtime_data'::pg_catalog.regrole::oid
       ]::oid[]
     );

  IF forbidden_delete_policy_count <> 0 THEN
    RAISE EXCEPTION
      'Runtime, browser or service DELETE policy applies to platform_users';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM app_private.fieldgrid_runtime_relation_capabilities AS capability
     WHERE capability.schema_name = 'public'
       AND capability.relation_name = 'platform_users'
       AND 'DELETE' = ANY(capability.privileges)
  ) THEN
    RAISE EXCEPTION
      'Platform overlap repair must not expand runtime capabilities';
  END IF;
END;
$fieldgrid_platform_overlap_delete_closure$;

COMMENT ON POLICY fieldgrid_migration_admin_platform_overlap_delete
  ON public.platform_users IS
  'Migration-admin-only delete path for a suspended platform owner whose Auth UUID has an active tenant membership.';
