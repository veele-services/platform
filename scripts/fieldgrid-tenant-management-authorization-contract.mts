import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const TENANT_MANAGEMENT_MIGRATION_NAME =
  "20260914125503_scope_tenant_management_authorization.sql";

const sql = readFileSync(
  new URL(`../lib/db/migrations/${TENANT_MANAGEMENT_MIGRATION_NAME}`, import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const hash = createHash("sha256").update(sql).digest("hex");

function body(tag: string): string {
  const parts = sql.split(`$${tag}$`);
  if (parts.length !== 3) throw new Error("Ambiguous tenant-management source contract");
  return parts[1]!;
}

const canonicalBody = body("canonical_tenant_management");
const wrapperBody = body("tenant_management_v2");
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

export async function loadTenantManagementAuthorizationSource() {
  return { name: TENANT_MANAGEMENT_MIGRATION_NAME, hash, sql };
}

export type TenantManagementQueryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string, values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

// Authorization cannot be inferred from a migration marker alone: verify the
// exact installed bodies, signatures, owners, search paths and effective ACLs.
// This expression only reads catalogs/history; it never calls a missing helper.
export function tenantManagementAuthorizationContractSql(): string {
  return `(EXISTS (
    SELECT 1 FROM pg_proc wrapper
    JOIN pg_proc predicate ON predicate.oid =
      to_regprocedure('app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)')
    JOIN pg_language wrapper_language ON wrapper_language.oid = wrapper.prolang
    JOIN pg_language predicate_language ON predicate_language.oid = predicate.prolang
    JOIN pg_class membership_table ON membership_table.oid = 'public.tenant_users'::regclass
    WHERE wrapper.oid = to_regprocedure('public.is_management_for_tenant(uuid)')
      AND wrapper.prosrc = ${quote(wrapperBody)}
      AND predicate.prosrc = ${quote(canonicalBody)}
      AND wrapper.prosecdef AND NOT predicate.prosecdef
      AND wrapper.provolatile = 's' AND predicate.provolatile = 's'
      AND wrapper_language.lanname = 'sql' AND predicate_language.lanname = 'sql'
      AND wrapper.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
      AND predicate.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
      AND wrapper.prorettype = 'boolean'::regtype AND NOT wrapper.proretset
      AND predicate.prorettype = 'boolean'::regtype AND NOT predicate.proretset
      AND wrapper.proargnames = ARRAY['p_tenant_id']
      AND predicate.proargnames = ARRAY['p_user_id', 'p_tenant_id']
      AND wrapper.pronargdefaults = 0 AND predicate.pronargdefaults = 0
      AND wrapper.prokind = 'f' AND predicate.prokind = 'f'
      AND wrapper.proparallel = 'u' AND predicate.proparallel = 'u'
      AND NOT wrapper.proisstrict AND NOT predicate.proisstrict
      AND NOT wrapper.proleakproof AND NOT predicate.proleakproof
      AND wrapper.proowner = membership_table.relowner
      AND predicate.proowner = wrapper.proowner
      AND has_function_privilege('authenticated', wrapper.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', wrapper.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', wrapper.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', predicate.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', predicate.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', predicate.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(wrapper.proacl, acldefault('f', wrapper.proowner))) acl
        WHERE acl.grantee NOT IN (wrapper.proowner, 'authenticated'::regrole)
           OR (acl.grantee <> wrapper.proowner AND acl.is_grantable)
      )
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(predicate.proacl, acldefault('f', predicate.proowner))) acl
        WHERE acl.grantee <> predicate.proowner
      )
  ) AND (SELECT count(*) FROM drizzle.veele_sql_migrations
          WHERE name = ${quote(TENANT_MANAGEMENT_MIGRATION_NAME)}) = 1
    AND EXISTS (SELECT 1 FROM drizzle.veele_sql_migrations
      WHERE name = ${quote(TENANT_MANAGEMENT_MIGRATION_NAME)}
        AND hash = ${quote(hash)} AND baselined = false)
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE coalesce(qual, '') ~ '\\mis_management[[:space:]]*\\('
         OR coalesce(with_check, '') ~ '\\mis_management[[:space:]]*\\('
         OR coalesce(qual, '') ~ '\\muser_roles\\M'
         OR coalesce(with_check, '') ~ '\\muser_roles\\M'
         OR policyname = 'assignment_material_usage_backoffice_all'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND p.prosrc ~ '\\mis_management[[:space:]]*\\('
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND pg_get_ruledef(r.oid) ~ '\\mis_management[[:space:]]*\\('
    ))`;
}

export async function verifyTenantManagementAuthorizationContract(
  queryable: TenantManagementQueryable,
): Promise<boolean> {
  const result = await queryable.query<{ valid: boolean }>(
    `SELECT ${tenantManagementAuthorizationContractSql()} AS valid`,
  );
  return result.rows.length === 1 && result.rows[0]?.valid === true;
}

export type TenantManagementAuthorizationImpact = {
  legacy_pairs: number;
  preserved_pairs: number;
  missing_pairs: number;
  scoped_pairs: number;
};

export async function readTenantManagementAuthorizationImpact(
  queryable: TenantManagementQueryable,
): Promise<TenantManagementAuthorizationImpact> {
  // Only source-owned identifiers are substituted. A distinct outer alias is
  // essential: the predicate has its own membership/tenant aliases.
  const candidate = canonicalBody.trim().replace(/;$/u, "")
    .replaceAll(/\bp_user_id\b/gu, "candidate.user_id")
    .replaceAll(/\bp_tenant_id\b/gu, "candidate.tenant_id");
  const result = await queryable.query<TenantManagementAuthorizationImpact>(`
    WITH access_pairs AS (
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles legacy_link
        JOIN public.roles legacy_role ON legacy_role.id = legacy_link.role_id
        WHERE legacy_link.user_id = candidate.user_id AND legacy_role.name = 'Management'
      ) AS legacy, (${candidate}) AS scoped
      FROM public.tenant_users candidate
      JOIN public.tenants tenant ON tenant.id = candidate.tenant_id
      WHERE candidate.status = 'active' AND tenant.is_active IS TRUE
        AND tenant.status IN ('provisioning', 'trial', 'active')
    ) SELECT count(*) FILTER (WHERE legacy)::integer AS legacy_pairs,
      count(*) FILTER (WHERE legacy AND scoped)::integer AS preserved_pairs,
      count(*) FILTER (WHERE legacy AND NOT scoped)::integer AS missing_pairs,
      count(*) FILTER (WHERE scoped)::integer AS scoped_pairs FROM access_pairs
  `);
  const impact = result.rows[0];
  if (result.rows.length !== 1 || !impact ||
      Object.values(impact).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Invalid tenant-management impact counts");
  }
  return impact;
}
