-- ============================================================================
-- Close explicit Supabase and runtime-role ACLs on the Auth UUID row-version
-- barrier introduced by 20260913161000.
--
-- RLS without policies protects ordinary roles, but service_role bypasses RLS
-- and may retain provider-default table grants that a PUBLIC-only revoke does
-- not remove. Direct reads disclose bound Auth UUIDs; direct writes can corrupt
-- the revision barrier and deny future bindings. The trigger remains the only
-- supported access path through its reviewed SECURITY DEFINER function.
--
-- Forward-only rollback reasoning: retain the deny-by-default table ACL. Any
-- future operational access needs a separately reviewed capability and policy.
-- ============================================================================

DO $fieldgrid_auth_surface_lock_acl_prerequisites$
DECLARE
  exact_relation_capability_count integer;
  exact_trigger_count integer;
BEGIN
  IF pg_catalog.to_regclass(
       'public.fieldgrid_auth_surface_locks'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'app_private.fieldgrid_runtime_relation_capabilities'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.fieldgrid_enforce_auth_surface_separation()'
     ) IS NULL THEN
    RAISE EXCEPTION
      'Auth surface lock ACL prerequisites are incomplete';
  END IF;

  IF current_user IN ('fieldgrid_runtime_app', 'fieldgrid_runtime_data') THEN
    RAISE EXCEPTION
      'Runtime principals may not change the Auth surface lock ACL';
  END IF;

  IF NOT (
    SELECT relation_row.relrowsecurity
      FROM pg_catalog.pg_class AS relation_row
     WHERE relation_row.oid =
       'public.fieldgrid_auth_surface_locks'::regclass
  )
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid =
          'public.fieldgrid_auth_surface_locks'::regclass
     ) THEN
    RAISE EXCEPTION
      'Auth surface lock must retain RLS with no direct policies';
  END IF;

  SELECT COUNT(*)::integer
    INTO exact_relation_capability_count
    FROM app_private.fieldgrid_runtime_relation_capabilities AS capability
   WHERE capability.schema_name = 'public'
     AND capability.relation_name = 'fieldgrid_auth_surface_locks'
     AND capability.access_mode = 'function_only'
     AND capability.privileges = ARRAY[]::text[]
     AND capability.source_migration =
       '20260913161000_serialize_auth_surface_bindings_across_snapshots.sql';

  SELECT COUNT(*)::integer
    INTO exact_trigger_count
    FROM (
      VALUES
        (
          'tenant_users_auth_surface_separation'::name,
          'public.tenant_users'::regclass
        ),
        (
          'platform_users_auth_surface_separation'::name,
          'public.platform_users'::regclass
        )
    ) AS expected_trigger(trigger_name, relation_id)
    JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgname = expected_trigger.trigger_name
     AND trigger_row.tgrelid = expected_trigger.relation_id
     AND trigger_row.tgfoid =
       'public.fieldgrid_enforce_auth_surface_separation()'::regprocedure
     AND trigger_row.tgtype::integer = 23
     AND trigger_row.tgenabled = 'O'
     AND trigger_row.tgisinternal IS FALSE;

  IF exact_relation_capability_count <> 1 OR exact_trigger_count <> 2 THEN
    RAISE EXCEPTION
      'Auth surface lock does not match the reviewed authorization frontier';
  END IF;
END;
$fieldgrid_auth_surface_lock_acl_prerequisites$;

LOCK TABLE public.fieldgrid_auth_surface_locks
  IN ACCESS EXCLUSIVE MODE;

REVOKE ALL ON TABLE public.fieldgrid_auth_surface_locks
  FROM PUBLIC, anon, authenticated, service_role,
    fieldgrid_runtime_app, fieldgrid_runtime_data;

DO $fieldgrid_auth_surface_lock_acl_closure$
BEGIN
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
      CROSS JOIN unnest(
        ARRAY[
          'SELECT',
          'INSERT',
          'UPDATE',
          'DELETE',
          'TRUNCATE',
          'REFERENCES',
          'TRIGGER',
          'MAINTAIN'
        ]::text[]
      ) AS operation(privilege_name)
     WHERE pg_catalog.has_table_privilege(
       forbidden_role.role_name,
       'public.fieldgrid_auth_surface_locks'::regclass,
       operation.privilege_name
     )
  ) THEN
    RAISE EXCEPTION
      'Direct Supabase or runtime access to the Auth surface lock remains';
  END IF;

  IF NOT (
    SELECT relation_row.relrowsecurity
      FROM pg_catalog.pg_class AS relation_row
     WHERE relation_row.oid =
       'public.fieldgrid_auth_surface_locks'::regclass
  )
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid =
          'public.fieldgrid_auth_surface_locks'::regclass
     )
     OR EXISTS (
       SELECT 1
         FROM app_private.fieldgrid_runtime_relation_capabilities AS capability
        WHERE capability.schema_name = 'public'
          AND capability.relation_name = 'fieldgrid_auth_surface_locks'
          AND (
            capability.access_mode <> 'function_only'
            OR capability.privileges <> ARRAY[]::text[]
          )
     ) THEN
    RAISE EXCEPTION
      'Auth surface lock deny-by-default contract is not exact';
  END IF;
END;
$fieldgrid_auth_surface_lock_acl_closure$;

COMMENT ON TABLE public.fieldgrid_auth_surface_locks IS
  'Internal Auth UUID row-version barrier; direct Supabase and runtime access is revoked.';
