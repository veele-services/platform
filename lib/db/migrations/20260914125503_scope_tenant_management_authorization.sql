-- Forward-only: derive tenant Management from independent, canonical tenant
-- grants. Preserve every existing legacy-authorized pair before switching.
-- No account, membership, role, permission or application-data mutation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Every runner must use fresh post-lock snapshots, including db:migrate when
-- its login has a non-default transaction isolation setting.
DO $isolation_contract$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'tenant_management_requires_read_committed';
  END IF;
END;
$isolation_contract$;

-- READ COMMITTED runners evaluate the guards AFTER these write barriers.
LOCK TABLE public.platform_users, public.role_permissions, public.roles,
  public.tenant_role_permissions, public.tenant_roles, public.tenant_user_roles,
  public.tenant_users, public.tenants, public.user_roles IN SHARE MODE;

DO $legacy_contract$
BEGIN
  IF to_regprocedure('app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_management_unexpected_existing_private_helper';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.oid = to_regprocedure('public.is_management_for_tenant(uuid)')
      AND p.prosrc = $legacy_body$
  SELECT p_tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      JOIN public.tenant_users tu
        ON tu.user_id = ur.user_id
       AND tu.tenant_id = p_tenant_id
       AND tu.status = 'active'
      JOIN public.tenants t
        ON t.id = tu.tenant_id
       AND t.is_active IS TRUE
       AND t.status IN ('provisioning', 'trial', 'active')
      WHERE ur.user_id = auth.uid()
        AND r.name = 'Management'
    );
$legacy_body$
      AND p.prosecdef AND p.provolatile = 's' AND l.lanname = 'sql'
      AND p.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
      AND p.prorettype = 'boolean'::regtype AND NOT p.proretset
      AND p.proargnames = ARRAY['p_tenant_id'] AND p.pronargdefaults = 0
      AND p.prokind = 'f' AND p.proparallel = 'u'
      AND NOT p.proisstrict AND NOT p.proleakproof
      AND p.proowner = (SELECT relowner FROM pg_class WHERE oid = 'public.tenant_users'::regclass)
      AND pg_has_role(current_user, p.proowner, 'MEMBER')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.grantee NOT IN (p.proowner, 'authenticated'::regrole)
      )
  ) THEN
    RAISE EXCEPTION 'tenant_management_legacy_contract_drift';
  END IF;
  -- The no-argument helper is not an authorization path after reconciliation.
  -- pg_depend alone cannot discover references in string SQL/PLpgSQL bodies.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE coalesce(qual, '') ~ '\mis_management[[:space:]]*\('
       OR coalesce(with_check, '') ~ '\mis_management[[:space:]]*\('
       OR coalesce(qual, '') ~ '\muser_roles\M'
       OR coalesce(with_check, '') ~ '\muser_roles\M'
       OR policyname = 'assignment_material_usage_backoffice_all'
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND p.prosrc ~ '\mis_management[[:space:]]*\('
  ) OR EXISTS (
    SELECT 1 FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND pg_get_ruledef(r.oid) ~ '\mis_management[[:space:]]*\('
  ) THEN
    RAISE EXCEPTION 'tenant_management_unexpected_legacy_consumer';
  END IF;
END;
$legacy_contract$;

CREATE FUNCTION app_private.fieldgrid_has_canonical_tenant_management(
  p_user_id uuid, p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $canonical_tenant_management$
  SELECT p_user_id IS NOT NULL AND p_tenant_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.tenant_users membership
    JOIN public.tenants tenant ON tenant.id = membership.tenant_id
    JOIN public.tenant_user_roles grant_link
      ON grant_link.user_id = membership.user_id
     AND grant_link.tenant_id = membership.tenant_id
    JOIN public.tenant_roles scoped_role
      ON scoped_role.id = grant_link.tenant_role_id
     AND scoped_role.tenant_id = grant_link.tenant_id
    JOIN public.roles template ON template.id = scoped_role.template_role_id
    WHERE membership.user_id = p_user_id AND membership.tenant_id = p_tenant_id
      AND membership.status = 'active'
      AND tenant.is_active IS TRUE
      AND tenant.status IN ('provisioning', 'trial', 'active')
      AND scoped_role.name = 'Management' AND scoped_role.is_system IS TRUE
      AND scoped_role.is_custom IS FALSE
      AND template.name = 'Management' AND template.is_system IS TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_users platform_user
        WHERE platform_user.user_id = membership.user_id
      )
      AND EXISTS (
        SELECT 1 FROM public.role_permissions expected
        WHERE expected.role_id = template.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.role_permissions expected
        WHERE expected.role_id = template.id AND NOT EXISTS (
          SELECT 1 FROM public.tenant_role_permissions actual
          WHERE actual.tenant_role_id = scoped_role.id
            AND actual.permission_id = expected.permission_id
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_role_permissions actual
        WHERE actual.tenant_role_id = scoped_role.id AND NOT EXISTS (
          SELECT 1 FROM public.role_permissions expected
          WHERE expected.role_id = template.id
            AND expected.permission_id = actual.permission_id
        )
      )
  );
$canonical_tenant_management$;
REVOKE ALL ON FUNCTION app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- The wrapper's trusted existing owner must be able to invoke the private
-- predicate, including deployments whose migration login inherits that owner.
DO $align_helper_owner$
BEGIN
  EXECUTE format(
    'ALTER FUNCTION app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid) OWNER TO %I',
    (SELECT pg_get_userbyid(proowner) FROM pg_proc
      WHERE oid = 'public.is_management_for_tenant(uuid)'::regprocedure)
  );
END;
$align_helper_owner$;

DO $preserve_existing_access$
DECLARE missing_pairs integer;
BEGIN
  SELECT count(*)::integer INTO missing_pairs
  FROM public.tenant_users membership
  JOIN public.tenants tenant ON tenant.id = membership.tenant_id
  WHERE membership.status = 'active' AND tenant.is_active IS TRUE
    AND tenant.status IN ('provisioning', 'trial', 'active')
    AND EXISTS (
      SELECT 1 FROM public.user_roles legacy_link
      JOIN public.roles legacy_role ON legacy_role.id = legacy_link.role_id
      WHERE legacy_link.user_id = membership.user_id AND legacy_role.name = 'Management'
    )
    AND NOT app_private.fieldgrid_has_canonical_tenant_management(membership.user_id, membership.tenant_id);
  IF missing_pairs <> 0 THEN
    RAISE EXCEPTION 'tenant_management_scope_preservation_failed'
      USING DETAIL = 'missing_pairs=' || missing_pairs::text;
  END IF;
END;
$preserve_existing_access$;

CREATE OR REPLACE FUNCTION public.is_management_for_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $tenant_management_v2$
  SELECT app_private.fieldgrid_has_canonical_tenant_management(auth.uid(), p_tenant_id);
$tenant_management_v2$;
REVOKE ALL ON FUNCTION public.is_management_for_tenant(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_management_for_tenant(uuid) TO authenticated;

COMMIT;
