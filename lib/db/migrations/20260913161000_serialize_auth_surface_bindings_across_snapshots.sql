-- ============================================================================
-- Make Auth-surface serialization independent of the caller's MVCC snapshot.
--
-- The preceding migration introduced symmetric membership triggers and a
-- transaction-scoped advisory lock. Under REPEATABLE READ, however, a waiter
-- can retain a snapshot from before the winning membership committed. This
-- forward-only migration adds a durable row-version barrier keyed by Auth UUID.
-- Every new binding writes that row before inspecting the opposite surface, so
-- READ COMMITTED sees the winner and stronger isolation levels abort a stale
-- waiter with a serialization failure. Existing overlap remains removable.
--
-- The barrier is internal, has no browser/runtime table grants, and has RLS
-- enabled with no policies. It is intentionally retained after unbinding so a
-- long-running transaction can never miss a completed identity transition.
-- ============================================================================

DO $fieldgrid_auth_surface_snapshot_prerequisites$
DECLARE
  exact_trigger_count integer;
BEGIN
  IF pg_catalog.to_regclass('public.tenant_users') IS NULL
     OR pg_catalog.to_regclass('public.platform_users') IS NULL
     OR pg_catalog.to_regprocedure(
       'public.fieldgrid_enforce_auth_surface_separation()'
     ) IS NULL THEN
    RAISE EXCEPTION
      'Auth surface separation must exist before snapshot serialization';
  END IF;

  IF pg_catalog.to_regclass('public.fieldgrid_auth_surface_locks') IS NOT NULL THEN
    RAISE EXCEPTION
      'Auth surface lock table already exists outside migration history';
  END IF;

  IF current_user IN ('fieldgrid_runtime_app', 'fieldgrid_runtime_data') THEN
    RAISE EXCEPTION
      'Runtime principals may not install Auth surface serialization';
  END IF;

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
   WHERE trigger_row.tgfoid =
       'public.fieldgrid_enforce_auth_surface_separation()'::regprocedure
     AND trigger_row.tgtype::integer = 23
     AND trigger_row.tgenabled = 'O'
     AND trigger_row.tgisinternal = false;

  IF exact_trigger_count <> 2 THEN
    RAISE EXCEPTION
      'Auth surface separation triggers do not match the reviewed predecessor';
  END IF;
END;
$fieldgrid_auth_surface_snapshot_prerequisites$;

LOCK TABLE public.tenant_users, public.platform_users
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.fieldgrid_auth_surface_locks (
  user_id uuid PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1,
  CONSTRAINT fieldgrid_auth_surface_locks_revision_check
    CHECK (revision > 0)
);

ALTER TABLE public.fieldgrid_auth_surface_locks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fieldgrid_auth_surface_locks FROM PUBLIC;

INSERT INTO public.fieldgrid_auth_surface_locks (user_id)
SELECT membership.user_id
  FROM public.tenant_users AS membership
UNION
SELECT platform_user.user_id
  FROM public.platform_users AS platform_user;

CREATE OR REPLACE FUNCTION public.fieldgrid_enforce_auth_surface_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fieldgrid_auth_surface_snapshot_function$
DECLARE
  barrier_user_id uuid;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME NOT IN ('tenant_users', 'platform_users') THEN
    RAISE EXCEPTION 'Auth surface separation trigger target is invalid';
  END IF;

  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Auth identity requires exactly one authorization surface',
      CONSTRAINT = 'fieldgrid_auth_surface_separation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.fieldgrid_auth_surface_locks AS surface_lock (
    user_id,
    revision
  ) VALUES (
    NEW.user_id,
    1
  )
  ON CONFLICT (user_id) DO UPDATE
    SET revision = surface_lock.revision + 1
  RETURNING user_id INTO barrier_user_id;

  IF barrier_user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Auth surface serialization barrier is invalid';
  END IF;

  IF TG_TABLE_NAME = 'tenant_users' THEN
    IF EXISTS (
      SELECT 1
        FROM public.platform_users AS platform_user
       WHERE platform_user.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Auth identity is already bound to another authorization surface',
        CONSTRAINT = 'fieldgrid_auth_surface_separation';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
        FROM public.tenant_users AS tenant_user
       WHERE tenant_user.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Auth identity is already bound to another authorization surface',
        CONSTRAINT = 'fieldgrid_auth_surface_separation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fieldgrid_auth_surface_snapshot_function$;

REVOKE ALL ON FUNCTION public.fieldgrid_enforce_auth_surface_separation()
  FROM PUBLIC;

INSERT INTO app_private.fieldgrid_runtime_relation_capabilities (
  schema_name,
  relation_name,
  access_mode,
  privileges,
  source_migration
) VALUES (
  'public',
  'fieldgrid_auth_surface_locks',
  'function_only',
  ARRAY[]::text[],
  '20260913161000_serialize_auth_surface_bindings_across_snapshots.sql'
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
  'fieldgrid_enforce_auth_surface_separation',
  '',
  'trigger_dependency',
  '20260913161000_serialize_auth_surface_bindings_across_snapshots.sql'
)
ON CONFLICT (schema_name, function_name, argument_types) DO UPDATE
SET access_mode = excluded.access_mode,
    source_migration = excluded.source_migration;

COMMENT ON TABLE public.fieldgrid_auth_surface_locks IS
  'Internal Auth UUID row-version barrier for cross-surface membership serialization.';
