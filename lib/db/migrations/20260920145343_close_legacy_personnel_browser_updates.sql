-- Forward-only prerequisite for the immutable hosted-policy replacement.
-- The compatibility runner executes this pinned source in the same transaction
-- as that replacement and journals all sources in chronological order only
-- after their postconditions pass. Ordinary fresh installs have no legacy
-- policy and execute this source as a verified no-op.
-- Tenant/owner bindings, policies, role memberships and SELECT rights are never
-- changed here. Rollback is transactional; do not restore browser UPDATE.
BEGIN;
LOCK TABLE public.personnel IN ACCESS EXCLUSIVE MODE;
DO $personnel_browser_update_closure$
DECLARE
  repairable boolean;
  anon_select boolean;
  authenticated_select boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid = 'public.personnel'::regclass AND polname = 'personnel_update_own_phone') THEN
    RETURN;
  END IF;
  -- The diagnostic reads this identical pinned predicate without running DDL.
  EXECUTE $personnel_closure_readiness$
WITH relation AS (
  SELECT oid, relowner FROM pg_catalog.pg_class
  WHERE oid = pg_catalog.to_regclass('public.personnel') AND relkind = 'r'
    AND relrowsecurity AND relowner = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
), browser AS (
  SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated')
    AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication
), update_acl AS (
  SELECT acl.* FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
    WHERE c.oid = pg_catalog.to_regclass('public.personnel') AND acl.privilege_type = 'UPDATE'
  UNION ALL
  SELECT acl.* FROM pg_catalog.pg_attribute a
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
    WHERE a.attrelid = pg_catalog.to_regclass('public.personnel') AND a.attnum > 0
      AND NOT a.attisdropped AND acl.privilege_type = 'UPDATE'
)
SELECT
  EXISTS (SELECT 1 FROM relation)
  AND (SELECT count(*) FROM browser) = 2
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_policy p
    WHERE p.polrelid = pg_catalog.to_regclass('public.personnel')
      AND p.polname = 'personnel_update_own_phone' AND p.polcmd = 'w' AND p.polpermissive
      AND p.polroles = ARRAY[pg_catalog.to_regrole('authenticated')::oid]
      AND pg_catalog.pg_get_expr(p.polqual, p.polrelid) = '(user_id = auth.uid())'
      AND pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) = '(user_id = auth.uid())')
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fieldgrid_runtime_app'
    AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolinherit)
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fieldgrid_runtime_data'
    AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
    AND NOT rolcanlogin AND NOT rolinherit)
  AND (SELECT count(*) FROM pg_catalog.pg_auth_members
    WHERE member = pg_catalog.to_regrole('fieldgrid_runtime_app')::oid) = 1
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
    WHERE member = pg_catalog.to_regrole('fieldgrid_runtime_app')::oid
      AND roleid = pg_catalog.to_regrole('fieldgrid_runtime_data')::oid
      AND inherit_option AND NOT set_option AND NOT admin_option)
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
    WHERE member = pg_catalog.to_regrole('fieldgrid_runtime_data')::oid)
  AND coalesce(pg_catalog.has_table_privilege(pg_catalog.to_regrole('fieldgrid_runtime_app')::oid,
    pg_catalog.to_regclass('public.personnel')::oid, 'SELECT'), false)
  AND coalesce(pg_catalog.has_table_privilege(pg_catalog.to_regrole('fieldgrid_runtime_app')::oid,
    pg_catalog.to_regclass('public.personnel')::oid, 'UPDATE'), false)
  AND NOT EXISTS (SELECT 1 FROM browser b CROSS JOIN relation r
    WHERE pg_catalog.pg_has_role(b.oid, r.relowner, 'USAGE'))
  AND NOT EXISTS (SELECT 1 FROM update_acl a CROSS JOIN browser b CROSS JOIN relation r
    WHERE CASE WHEN a.grantee = 0 THEN true ELSE pg_catalog.pg_has_role(b.oid, a.grantee, 'USAGE')
      AND (a.grantee <> b.oid OR a.grantor <> r.relowner OR a.is_grantable) END) AS repairable
  $personnel_closure_readiness$ INTO repairable;
  IF repairable IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'hosted_policy_personnel_closure_precondition_failed';
  END IF;
  anon_select := has_table_privilege('anon', 'public.personnel', 'SELECT');
  authenticated_select := has_table_privilege('authenticated', 'public.personnel', 'SELECT');
  -- PostgreSQL also revokes direct column UPDATE privileges when revoking the
  -- table privilege. RESTRICT rejects dependent grants; never cascade.
  REVOKE UPDATE ON TABLE public.personnel FROM anon, authenticated RESTRICT;
  IF has_table_privilege('anon', 'public.personnel', 'UPDATE')
    OR has_any_column_privilege('anon', 'public.personnel', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.personnel', 'UPDATE')
    OR has_any_column_privilege('authenticated', 'public.personnel', 'UPDATE')
    OR NOT has_table_privilege('fieldgrid_runtime_app', 'public.personnel', 'SELECT')
    OR NOT has_table_privilege('fieldgrid_runtime_app', 'public.personnel', 'UPDATE')
    OR has_table_privilege('anon', 'public.personnel', 'SELECT') IS DISTINCT FROM anon_select
    OR has_table_privilege('authenticated', 'public.personnel', 'SELECT') IS DISTINCT FROM authenticated_select THEN
    RAISE EXCEPTION 'hosted_policy_personnel_closure_postcondition_failed';
  END IF;
END;
$personnel_browser_update_closure$;
COMMIT;
