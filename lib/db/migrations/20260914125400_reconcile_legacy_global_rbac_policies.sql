-- Forward-only repair of the three legacy global RBAC policy consumers found
-- in staging. This migration changes RLS policy metadata only; it never
-- changes users, memberships, roles, permissions or application rows.
--
-- It must precede 20260914125503_scope_tenant_management_authorization.sql so
-- that the latter can prove that no global is_management/user_roles policy
-- remains before installing the tenant-scoped Management predicate.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, auth, pg_temp;

LOCK TABLE public.platform_users, public.role_permissions, public.roles,
  public.tenant_role_permissions, public.tenant_roles, public.tenant_user_roles,
  public.tenant_users, public.tenants, public.user_roles IN SHARE MODE;

DO $reconcile_legacy_global_rbac_policies$
DECLARE
  consumer_count integer;
  recognized_consumer_count integer;
  user_roles_policy_count integer;
BEGIN
  IF to_regclass('public.user_roles') IS NULL THEN
    RAISE EXCEPTION 'tenant_management_legacy_policy_table_missing';
  END IF;

  -- The allowlist is deliberately narrow. Unknown policy consumers remain a
  -- hard stop instead of being rewritten by a generic text substitution.
  SELECT count(*)::integer
    INTO consumer_count
    FROM pg_policies
   WHERE coalesce(qual, '') ~ '\mis_management[[:space:]]*\('
      OR coalesce(with_check, '') ~ '\mis_management[[:space:]]*\('
      OR coalesce(qual, '') ~ '\muser_roles\M'
      OR coalesce(with_check, '') ~ '\muser_roles\M';

  SELECT count(*)::integer
    INTO recognized_consumer_count
    FROM pg_policies
   WHERE (
       coalesce(qual, '') ~ '\mis_management[[:space:]]*\('
       OR coalesce(with_check, '') ~ '\mis_management[[:space:]]*\('
       OR coalesce(qual, '') ~ '\muser_roles\M'
       OR coalesce(with_check, '') ~ '\muser_roles\M'
     )
     AND (
       (schemaname = 'public' AND tablename = 'user_roles' AND policyname IN (
         'user_roles_select_own',
         'user_roles_insert_management',
         'user_roles_delete_management'
       ))
     );

  IF consumer_count <> recognized_consumer_count THEN
    RAISE EXCEPTION 'tenant_management_legacy_policy_consumer_drift';
  END IF;

  SELECT count(*)::integer
    INTO user_roles_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'user_roles'
     AND policyname IN (
       'user_roles_select_own',
       'user_roles_insert_management',
       'user_roles_delete_management'
     );

  IF consumer_count > 0 AND user_roles_policy_count <> 3 THEN
    RAISE EXCEPTION 'tenant_management_legacy_user_roles_policy_drift';
  END IF;

  -- A clean installation already has the phase-2 platform permission helper
  -- and no legacy consumers. Leave that state untouched. The staging drift
  -- path below requires the exact constrained helper before rebuilding policy
  -- definitions around it.
  IF consumer_count > 0 AND NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_language l ON l.oid = p.prolang
     WHERE p.oid = to_regprocedure('public.fieldgrid_has_platform_permission(text)')
       AND l.lanname = 'sql'
       AND p.prosecdef
       AND p.provolatile = 's'
       AND p.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
       AND p.prorettype = 'boolean'::regtype
       AND NOT p.proretset
       AND p.proargnames = ARRAY['p_permission']
       AND p.pronargdefaults = 0
       AND p.prokind = 'f'
       AND p.proparallel = 'u'
       AND NOT p.proisstrict
       AND NOT p.proleakproof
       AND p.proowner = (SELECT relowner FROM pg_class WHERE oid = 'public.platform_users'::regclass)
       AND pg_has_role(current_user, p.proowner, 'MEMBER')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'tenant_management_platform_permission_helper_drift';
  END IF;

  IF consumer_count > 0 THEN
    -- Global RBAC administration is a platform capability. Ordinary
    -- tenant-Management members retain their tenant access, but cannot gain
    -- global role-management authority merely from that tenant role.
    EXECUTE 'DROP POLICY user_roles_select_own ON public.user_roles';
    EXECUTE 'DROP POLICY user_roles_insert_management ON public.user_roles';
    EXECUTE 'DROP POLICY user_roles_delete_management ON public.user_roles';

    EXECUTE $create_select$
      CREATE POLICY user_roles_select_own ON public.user_roles
        FOR SELECT TO authenticated
        USING (
          (SELECT auth.uid()) = user_id
          OR (SELECT public.fieldgrid_has_platform_permission('global.rbac.manage'))
        )
    $create_select$;
    EXECUTE $create_insert$
      CREATE POLICY user_roles_insert_management ON public.user_roles
        FOR INSERT TO authenticated
        WITH CHECK (
          (SELECT public.fieldgrid_has_platform_permission('global.rbac.manage'))
        )
    $create_insert$;
    EXECUTE $create_delete$
      CREATE POLICY user_roles_delete_management ON public.user_roles
        FOR DELETE TO authenticated
        USING (
          (SELECT public.fieldgrid_has_platform_permission('global.rbac.manage'))
        )
    $create_delete$;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE coalesce(qual, '') ~ '\mis_management[[:space:]]*\('
        OR coalesce(with_check, '') ~ '\mis_management[[:space:]]*\('
        OR coalesce(qual, '') ~ '\muser_roles\M'
        OR coalesce(with_check, '') ~ '\muser_roles\M'
  ) THEN
    RAISE EXCEPTION 'tenant_management_legacy_policy_reconciliation_incomplete';
  END IF;
END;
$reconcile_legacy_global_rbac_policies$;

COMMIT;
