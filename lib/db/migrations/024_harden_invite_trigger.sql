-- Harden invite trigger function.
--
-- The original trigger function was created as public.link_personnel_on_signup().
-- Supabase exposes the public schema through the Data API, so SECURITY DEFINER
-- functions should live in a private schema and should not be executable by
-- anon/authenticated clients.

CREATE SCHEMA IF NOT EXISTS app_private;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON SCHEMA app_private FROM anon;
REVOKE ALL ON SCHEMA app_private FROM authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.link_personnel_on_signup()') IS NOT NULL THEN
    ALTER FUNCTION public.link_personnel_on_signup() SET SCHEMA app_private;
  END IF;
END;
$$;

ALTER FUNCTION app_private.link_personnel_on_signup()
  SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION app_private.link_personnel_on_signup() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.link_personnel_on_signup() FROM anon;
REVOKE ALL ON FUNCTION app_private.link_personnel_on_signup() FROM authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION app_private.link_personnel_on_signup();
