-- ============================================================================
-- Serialize removal of active platform owners and close the runtime ACL for
-- the Auth-surface trigger introduced by the preceding migrations.
--
-- A read-before-write owner count is vulnerable to concurrent demotions: both
-- transactions can observe the other owner and then remove both. A durable
-- singleton row-version barrier makes those writes serial under READ COMMITTED
-- and forces a stale stronger-isolation waiter to abort. The trigger remains
-- transparent for promotions, unchanged active owners and non-owner updates.
--
-- The barrier has RLS, no policies and no direct runtime/browser grants. Both
-- trigger functions are executable only through the runtime-data capability
-- role, matching the existing runtime capability registry. Forward-only
-- rollback reasoning: retain the continuity invariant and ACL closure. Any
-- future zero-owner transition needs a separately reviewed replacement-owner
-- protocol rather than weakening this guard.
-- ============================================================================

DO $fieldgrid_platform_owner_continuity_prerequisites$
DECLARE
  exact_auth_capability_count integer;
BEGIN
  IF pg_catalog.to_regclass('public.platform_users') IS NULL
     OR pg_catalog.to_regclass(
       'app_private.fieldgrid_runtime_relation_capabilities'
     ) IS NULL
     OR pg_catalog.to_regclass(
       'app_private.fieldgrid_runtime_function_capabilities'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'public.fieldgrid_enforce_auth_surface_separation()'
     ) IS NULL THEN
    RAISE EXCEPTION
      'Platform authorization prerequisites must exist before continuity hardening';
  END IF;

  IF current_user IN ('fieldgrid_runtime_app', 'fieldgrid_runtime_data') THEN
    RAISE EXCEPTION
      'Runtime principals may not install platform authorization continuity';
  END IF;

  IF pg_catalog.to_regclass(
       'public.fieldgrid_platform_owner_continuity_lock'
     ) IS NOT NULL
     OR pg_catalog.to_regprocedure(
       'public.fieldgrid_enforce_platform_owner_continuity()'
     ) IS NOT NULL
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger AS trigger_row
        WHERE trigger_row.tgname IN (
          'platform_users_owner_continuity_update',
          'platform_users_owner_continuity_delete'
        )
          AND trigger_row.tgisinternal = false
     ) THEN
    RAISE EXCEPTION
      'Platform owner continuity objects already exist outside migration history';
  END IF;

  SELECT COUNT(*)::integer
    INTO exact_auth_capability_count
    FROM app_private.fieldgrid_runtime_function_capabilities AS capability
   WHERE capability.schema_name = 'public'
     AND capability.function_name =
       'fieldgrid_enforce_auth_surface_separation'
     AND capability.argument_types = ''
     AND capability.access_mode = 'trigger_dependency'
     AND capability.source_migration =
       '20260913161000_serialize_auth_surface_bindings_across_snapshots.sql';

  IF exact_auth_capability_count <> 1 THEN
    RAISE EXCEPTION
      'Auth surface trigger capability does not match the reviewed predecessor';
  END IF;
END;
$fieldgrid_platform_owner_continuity_prerequisites$;

LOCK TABLE public.platform_users IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.fieldgrid_platform_owner_continuity_lock (
  singleton boolean PRIMARY KEY DEFAULT true,
  revision bigint NOT NULL DEFAULT 1,
  CONSTRAINT fieldgrid_platform_owner_continuity_lock_singleton_check
    CHECK (singleton),
  CONSTRAINT fieldgrid_platform_owner_continuity_lock_revision_check
    CHECK (revision > 0)
);

ALTER TABLE public.fieldgrid_platform_owner_continuity_lock
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fieldgrid_platform_owner_continuity_lock
  FROM PUBLIC, anon, authenticated, service_role,
    fieldgrid_runtime_app, fieldgrid_runtime_data;

INSERT INTO public.fieldgrid_platform_owner_continuity_lock (
  singleton,
  revision
) VALUES (
  true,
  1
);

CREATE FUNCTION public.fieldgrid_enforce_platform_owner_continuity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fieldgrid_platform_owner_continuity_function$
DECLARE
  barrier_revision bigint;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'platform_users' THEN
    RAISE EXCEPTION 'Platform owner continuity trigger target is invalid';
  END IF;

  IF TG_OP NOT IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Platform owner continuity trigger operation is invalid';
  END IF;

  IF OLD.role <> 'owner' OR OLD.status <> 'active' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.role = 'owner'
     AND NEW.status = 'active' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.fieldgrid_platform_owner_continuity_lock AS continuity_lock (
    singleton,
    revision
  ) VALUES (
    true,
    1
  )
  ON CONFLICT (singleton) DO UPDATE
    SET revision = continuity_lock.revision + 1
  RETURNING revision INTO barrier_revision;

  IF barrier_revision <= 1 THEN
    RAISE EXCEPTION 'Platform owner continuity barrier is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.platform_users AS other_owner
     WHERE other_owner.id <> OLD.id
       AND other_owner.role = 'owner'
       AND other_owner.status = 'active'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'At least one active platform owner must remain',
      CONSTRAINT = 'fieldgrid_platform_owner_continuity';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fieldgrid_platform_owner_continuity_function$;

CREATE TRIGGER platform_users_owner_continuity_update
BEFORE UPDATE OF role, status ON public.platform_users
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_enforce_platform_owner_continuity();

CREATE TRIGGER platform_users_owner_continuity_delete
BEFORE DELETE ON public.platform_users
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_enforce_platform_owner_continuity();

REVOKE EXECUTE ON FUNCTION
  public.fieldgrid_enforce_auth_surface_separation(),
  public.fieldgrid_enforce_platform_owner_continuity()
FROM PUBLIC, anon, authenticated, service_role,
  fieldgrid_runtime_app, fieldgrid_runtime_data;

GRANT EXECUTE ON FUNCTION
  public.fieldgrid_enforce_auth_surface_separation(),
  public.fieldgrid_enforce_platform_owner_continuity()
TO fieldgrid_runtime_data;

INSERT INTO app_private.fieldgrid_runtime_relation_capabilities (
  schema_name,
  relation_name,
  access_mode,
  privileges,
  source_migration
) VALUES (
  'public',
  'fieldgrid_platform_owner_continuity_lock',
  'function_only',
  ARRAY[]::text[],
  '20260913162000_harden_platform_authorization_continuity.sql'
)
ON CONFLICT (schema_name, relation_name) DO UPDATE
SET access_mode = excluded.access_mode,
    privileges = excluded.privileges,
    source_migration = excluded.source_migration;

INSERT INTO app_private.fieldgrid_runtime_function_capabilities (
  schema_name,
  function_name,
  argument_types,
  access_mode,
  source_migration
) VALUES (
  'public',
  'fieldgrid_enforce_platform_owner_continuity',
  '',
  'trigger_dependency',
  '20260913162000_harden_platform_authorization_continuity.sql'
)
ON CONFLICT (schema_name, function_name, argument_types) DO UPDATE
SET access_mode = excluded.access_mode,
    source_migration = excluded.source_migration;

DO $fieldgrid_platform_owner_continuity_closure$
DECLARE
  exact_trigger_count integer;
  exact_capability_count integer;
  continuity_function oid :=
    'public.fieldgrid_enforce_platform_owner_continuity()'::regprocedure::oid;
  auth_surface_function oid :=
    'public.fieldgrid_enforce_auth_surface_separation()'::regprocedure::oid;
BEGIN
  SELECT COUNT(*)::integer
    INTO exact_trigger_count
    FROM (
      VALUES
        (
          'platform_users_owner_continuity_update'::name,
          19::smallint
        ),
        (
          'platform_users_owner_continuity_delete'::name,
          11::smallint
        )
    ) AS expected_trigger(trigger_name, trigger_type)
    JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgname = expected_trigger.trigger_name
     AND trigger_row.tgrelid = 'public.platform_users'::regclass
     AND trigger_row.tgfoid = continuity_function
     AND trigger_row.tgtype = expected_trigger.trigger_type
     AND trigger_row.tgenabled = 'O'
     AND trigger_row.tgisinternal = false;

  SELECT COUNT(*)::integer
    INTO exact_capability_count
    FROM (
      SELECT 1
        FROM app_private.fieldgrid_runtime_relation_capabilities AS capability
       WHERE capability.schema_name = 'public'
         AND capability.relation_name =
           'fieldgrid_platform_owner_continuity_lock'
         AND capability.access_mode = 'function_only'
         AND capability.privileges = ARRAY[]::text[]
         AND capability.source_migration =
           '20260913162000_harden_platform_authorization_continuity.sql'
      UNION ALL
      SELECT 1
        FROM app_private.fieldgrid_runtime_function_capabilities AS capability
       WHERE capability.schema_name = 'public'
         AND capability.function_name =
           'fieldgrid_enforce_platform_owner_continuity'
         AND capability.argument_types = ''
         AND capability.access_mode = 'trigger_dependency'
         AND capability.source_migration =
           '20260913162000_harden_platform_authorization_continuity.sql'
    ) AS exact_capability;

  IF exact_trigger_count <> 2 OR exact_capability_count <> 2 THEN
    RAISE EXCEPTION
      'Platform owner continuity catalog objects are not exact';
  END IF;

  IF NOT (
    SELECT function_row.prosecdef
       AND function_row.proconfig =
         ARRAY['search_path=pg_catalog, public']::text[]
      FROM pg_catalog.pg_proc AS function_row
     WHERE function_row.oid = continuity_function
  ) THEN
    RAISE EXCEPTION
      'Platform owner continuity function security is not exact';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'fieldgrid_runtime_data', continuity_function, 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'fieldgrid_runtime_app', continuity_function, 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'fieldgrid_runtime_data', auth_surface_function, 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'fieldgrid_runtime_app', auth_surface_function, 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Runtime trigger EXECUTE closure is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (
        VALUES
          ('anon'::name),
          ('authenticated'::name),
          ('service_role'::name)
      ) AS browser_role(role_name)
     WHERE pg_catalog.has_function_privilege(
       browser_role.role_name,
       continuity_function,
       'EXECUTE'
     )
        OR pg_catalog.has_function_privilege(
          browser_role.role_name,
          auth_surface_function,
          'EXECUTE'
        )
  ) THEN
    RAISE EXCEPTION 'Browser or service trigger EXECUTE access remains';
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
      ) AS runtime_role(role_name)
      CROSS JOIN unnest(
        ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]
      ) AS operation(privilege_name)
     WHERE pg_catalog.has_table_privilege(
       runtime_role.role_name,
       'public.fieldgrid_platform_owner_continuity_lock'::regclass,
       operation.privilege_name
     )
  ) THEN
    RAISE EXCEPTION 'Direct platform owner continuity lock access remains';
  END IF;

  IF NOT (
    SELECT relation_row.relrowsecurity
       AND NOT relation_row.relforcerowsecurity
      FROM pg_catalog.pg_class AS relation_row
     WHERE relation_row.oid =
       'public.fieldgrid_platform_owner_continuity_lock'::regclass
  )
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.pg_policy AS policy_row
        WHERE policy_row.polrelid =
          'public.fieldgrid_platform_owner_continuity_lock'::regclass
     )
     OR (
       SELECT COUNT(*)
         FROM public.fieldgrid_platform_owner_continuity_lock
        WHERE singleton IS TRUE
          AND revision > 0
     ) <> 1 THEN
    RAISE EXCEPTION 'Platform owner continuity lock state is not exact';
  END IF;
END;
$fieldgrid_platform_owner_continuity_closure$;

COMMENT ON TABLE public.fieldgrid_platform_owner_continuity_lock IS
  'Internal singleton row-version barrier for active platform-owner continuity.';
