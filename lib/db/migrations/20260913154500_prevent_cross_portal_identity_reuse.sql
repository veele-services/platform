-- ============================================================================
-- Prevent one Auth identity from being newly bound to both tenant and platform
-- authorization surfaces.
--
-- Existing rows are deliberately not rewritten: staging has one known legacy
-- overlap that is removed by the separately reviewed field-demo repair. New
-- INSERTs and user_id changes on both membership tables are serialized on the
-- Auth UUID and rejected if the opposite surface already owns that identity.
-- Ordinary role/status updates and deletes remain available for remediation.
--
-- Tenant isolation, table RLS and grants are unchanged. Forward-only rollback
-- reasoning: retain this invariant. A future product-supported surface transfer
-- must use a new explicit transition contract rather than weakening the guard.
-- ============================================================================

DO $fieldgrid_auth_surface_separation_prerequisites$
BEGIN
  IF pg_catalog.to_regclass('public.tenant_users') IS NULL
     OR pg_catalog.to_regclass('public.platform_users') IS NULL THEN
    RAISE EXCEPTION
      'Tenant and platform user tables must exist before surface separation';
  END IF;

  IF current_user IN ('fieldgrid_runtime_app', 'fieldgrid_runtime_data') THEN
    RAISE EXCEPTION
      'Runtime principals may not install Auth surface separation';
  END IF;

  IF pg_catalog.to_regprocedure(
       'public.fieldgrid_enforce_auth_surface_separation()'
     ) IS NOT NULL
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger AS trigger_row
        WHERE trigger_row.tgname IN (
          'tenant_users_auth_surface_separation',
          'platform_users_auth_surface_separation'
        )
          AND trigger_row.tgisinternal = false
     ) THEN
    RAISE EXCEPTION
      'Auth surface separation objects already exist outside migration history';
  END IF;
END;
$fieldgrid_auth_surface_separation_prerequisites$;

CREATE FUNCTION public.fieldgrid_enforce_auth_surface_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fieldgrid_auth_surface_separation_function$
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Auth identity requires exactly one authorization surface',
      CONSTRAINT = 'fieldgrid_auth_surface_separation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'fieldgrid:auth-surface-separation:v1:' || NEW.user_id::text,
      0
    )
  );

  IF TG_TABLE_SCHEMA <> 'public' THEN
    RAISE EXCEPTION 'Auth surface separation trigger schema is invalid';
  ELSIF TG_TABLE_NAME = 'tenant_users' THEN
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
  ELSIF TG_TABLE_NAME = 'platform_users' THEN
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
  ELSE
    RAISE EXCEPTION 'Auth surface separation trigger target is invalid';
  END IF;

  RETURN NEW;
END;
$fieldgrid_auth_surface_separation_function$;

REVOKE ALL ON FUNCTION public.fieldgrid_enforce_auth_surface_separation()
  FROM PUBLIC;

CREATE TRIGGER tenant_users_auth_surface_separation
BEFORE INSERT OR UPDATE OF user_id ON public.tenant_users
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_enforce_auth_surface_separation();

CREATE TRIGGER platform_users_auth_surface_separation
BEFORE INSERT OR UPDATE OF user_id ON public.platform_users
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_enforce_auth_surface_separation();
