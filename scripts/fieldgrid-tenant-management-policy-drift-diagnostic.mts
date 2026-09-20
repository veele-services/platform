import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  compilePolicyDefinitionContract,
  compileSelfPinningPolicyDefinitionContractSql,
  type PolicyDefinitionQueryable,
} from "./fieldgrid-tenant-management-policy-definition-contract.mts";
import {
  TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME,
  validateRepairVariants,
  type RepairVariant,
} from "./fieldgrid-tenant-management-policy-repair-contract.mts";

// This module explains a refused comparison. It never supplies apply readiness.
const root = new URL("../", import.meta.url);
const historicalPath = "migrations/015_pwa_rls_policies.sql";
const historicalHash = "75d9ccd99bfb5fab852bf891216859e489958b234bf6c3aec0d8a551cec35fdf";
const historicalPolicy = {
  schema: "public", table: "personnel", name: "personnel_update_own_phone",
  command: "w", permissive: true, roles: ["authenticated"],
  usingExpression: "(user_id = auth.uid())",
  checkExpression: "(user_id = auth.uid())",
};
const MAX_EXTRAS = 10;
const MAX_RESULT_BYTES = 262144;
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u;
const aggregateKeys = ["postgresMajorMatches", "policySetMatches", "helperContractsMatch", "relationsMatch",
  "baselinePlusHistoricalOwnUpdateSetMatches"] as const;
const policyKeys = ["present", "commandMatches", "permissiveMatches", "rolesMatch", "usingMatches", "checkMatches"] as const;
const helperKeys = ["present", "namePresent", "signatureMatches", "bodyMatches", "languageMatches", "kindMatches",
  "securityDefinerMatches", "volatilityMatches", "parallelMatches", "strictMatches", "leakproofMatches",
  "scalarMatches", "argumentModesMatch", "supportMatches", "defaultsMatch", "configMatches",
  "argumentNamesMatch", "ownerMatches", "directAclCountMatches", "directAclMatches", "effectiveExecuteMatches"] as const;
const relationKeys = ["present", "kindMatches", "rowSecurityMatches", "forceRowSecurityMatches"] as const;
const columnKeys = ["present", "typeMatches", "typeModifierMatches", "notNullMatches"] as const;
const contextKeys = ["transactionReadOnly", "repeatableRead", "postgresMajorMatches", "searchPathMatches",
  "exactHistoricalOwnUpdateMatches"] as const;
type Flags<T extends readonly string[]> = Record<T[number], boolean>;
type PolicyIdentity = { schema: string; table: string; name: string };
export type TenantManagementPolicyDriftDiagnostic = Flags<typeof contextKeys> & {
  postgresMajor: number;
  variants: Array<Flags<typeof aggregateKeys> & {
    state: RepairVariant["state"]; profile: string;
    policies: Array<PolicyIdentity & Flags<typeof policyKeys>>;
    helpers: Array<{ schema: string; name: string; argumentTypes: string[];
      directAclEntries: Array<{ grantee: string; grantor: string; matches: boolean }>;
      effectiveExecute: Array<{ role: string; roleExists: boolean; matches: boolean }>;
    } & Flags<typeof helperKeys>>;
    relations: Array<{ schema: string; table: string; columns: Array<{ name: string } & Flags<typeof columnKeys>> }
      & Flags<typeof relationKeys>>;
    unexpectedPolicies: PolicyIdentity[];
  }>;
};
export type TenantManagementPolicyDriftDiagnosticSource = Readonly<{
  sql: string; values: readonly [string, string]; variants: readonly RepairVariant[];
}>;
const issuedSources = new WeakSet<TenantManagementPolicyDriftDiagnosticSource>();
type FailureCode = "source_invalid" | "transaction_invalid" | "catalog_invalid" | "catalog_read_failed" | "policy_limit_exceeded";
class DriftDiagnosticError extends Error {
  constructor(readonly code: FailureCode) { super(`tenant_management_policy_drift_${code}`); }
}
const fail = (code: FailureCode): never => { throw new DriftDiagnosticError(code); };
export function formatSafeTenantManagementPolicyDriftDiagnosticError(error: unknown): string {
  return error instanceof DriftDiagnosticError ? error.message : "tenant_management_policy_drift_operation_failed";
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function flagsSql(expressions: Record<string, string>): string {
  return Object.entries(expressions).map(([key, expression]) => `'${key}', coalesce((${expression}), false)`).join(",\n");
}
const policyFlags = flagsSql({
  present: "a.value IS NOT NULL",
  commandMatches: "a.value->'command' = e.value->'command'",
  permissiveMatches: "a.value->'permissive' = e.value->'permissive'",
  rolesMatch: "a.value->'roles' = e.value->'roles'",
  usingMatches: "a.value->'usingExpression' = e.value->'usingExpression'",
  checkMatches: "a.value->'checkExpression' = e.value->'checkExpression'",
});
const helperPresent = "h.oid IS NOT NULL";
const aclMatch = `NOT EXISTS (
  SELECT 1 FROM pg_catalog.aclexplode(coalesce(h.proacl, pg_catalog.acldefault('f', h.proowner))) acl
  WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(e.value->'directAcl') required
    WHERE acl.privilege_type = required->>'privilege' AND acl.is_grantable = (required->>'grantable')::pg_catalog.bool
      AND acl.grantee = CASE required->>'grantee' WHEN '$owner' THEN h.proowner WHEN 'PUBLIC' THEN 0::pg_catalog.oid
        ELSE pg_catalog.to_regrole(required->>'grantee')::pg_catalog.oid END
      AND acl.grantor = CASE required->>'grantor' WHEN '$owner' THEN h.proowner
        ELSE pg_catalog.to_regrole(required->>'grantor')::pg_catalog.oid END))`;
const aclCountMatch = `(SELECT pg_catalog.count(*) FROM pg_catalog.aclexplode(coalesce(h.proacl, pg_catalog.acldefault('f', h.proowner))))
  = pg_catalog.jsonb_array_length(e.value->'directAcl')`;
const effectiveMatch = `NOT EXISTS (
  SELECT 1 FROM pg_catalog.jsonb_array_elements(e.value->'effectiveExecute') permission
  WHERE CASE permission->>'role'
    WHEN 'PUBLIC' THEN EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(h.proacl, pg_catalog.acldefault('f', h.proowner))) acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') IS DISTINCT FROM (permission->>'allowed')::pg_catalog.bool
    WHEN '$owner' THEN pg_catalog.has_function_privilege(h.proowner, h.oid, 'EXECUTE') IS DISTINCT FROM (permission->>'allowed')::pg_catalog.bool
    ELSE CASE WHEN pg_catalog.to_regrole(permission->>'role') IS NULL THEN true
      ELSE pg_catalog.has_function_privilege(pg_catalog.to_regrole(permission->>'role')::pg_catalog.oid, h.oid, 'EXECUTE')
        IS DISTINCT FROM (permission->>'allowed')::pg_catalog.bool END
  END)`;
const helperFlags = flagsSql({
  present: helperPresent,
  namePresent: "EXISTS (SELECT 1 FROM pg_catalog.pg_proc named JOIN pg_catalog.pg_namespace ns ON ns.oid=named.pronamespace WHERE ns.nspname=e.value->>'schema' AND named.proname=e.value->>'name')",
  signatureMatches: "h.pronargs = pg_catalog.jsonb_array_length(e.value->'argumentTypes') AND h.prorettype = pg_catalog.to_regtype('pg_catalog.' || (e.value->>'returnType'))",
  bodyMatches: "h.prosrc = e.value->>'body' AND h.prosqlbody IS NULL",
  languageMatches: "language.lanname = e.value->>'language'",
  kindMatches: "h.prokind = 'f'",
  securityDefinerMatches: "h.prosecdef = (e.value->>'securityDefiner')::pg_catalog.bool",
  volatilityMatches: "h.provolatile::pg_catalog.text = e.value->>'volatility'",
  parallelMatches: "h.proparallel::pg_catalog.text = e.value->>'parallel'",
  strictMatches: "h.proisstrict = (e.value->>'strict')::pg_catalog.bool",
  leakproofMatches: "h.proleakproof = (e.value->>'leakproof')::pg_catalog.bool",
  scalarMatches: "NOT h.proretset",
  argumentModesMatch: `${helperPresent} AND h.proargmodes IS NULL AND h.proallargtypes IS NULL`,
  supportMatches: "h.prosupport = 0",
  defaultsMatch: "h.pronargdefaults = 0 AND h.proargdefaults IS NULL",
  configMatches: `${helperPresent} AND coalesce(pg_catalog.to_jsonb(h.proconfig), 'null'::pg_catalog.jsonb) = e.value->'config'`,
  argumentNamesMatch: `${helperPresent} AND coalesce(pg_catalog.to_jsonb(h.proargnames), 'null'::pg_catalog.jsonb) = e.value->'argNames'`,
  ownerMatches: "h.proowner = owner_relation.relowner",
  directAclCountMatches: `${helperPresent} AND (${aclCountMatch})`,
  directAclMatches: `${helperPresent} AND (${aclCountMatch}) AND (${aclMatch})`,
  effectiveExecuteMatches: `${helperPresent} AND (${effectiveMatch})`,
});

function comparisonQuery(comparison: string): string {
  // Each deparser depends on the volatile path pin; no planner-order assumption.
  const deparseRelation = "(CASE WHEN pg_catalog.set_config('search_path', 'pg_catalog', true) OPERATOR(pg_catalog.=) 'pg_catalog' THEN policy.polrelid END)";
  return `WITH variants AS MATERIALIZED (
    SELECT value, ordinal FROM pg_catalog.jsonb_array_elements($1::pg_catalog.jsonb) WITH ORDINALITY v(value, ordinal)
  ), context AS MATERIALIZED (
    SELECT pg_catalog.current_setting('transaction_read_only') = 'on' AS readonly,
      pg_catalog.current_setting('transaction_isolation') = 'repeatable read' AS repeatable,
      pg_catalog.current_setting('server_version_num')::pg_catalog.int4 / 10000 AS major_number,
      pg_catalog.current_setting('server_version_num')::pg_catalog.int4 / 10000 = 17 AS major,
      pg_catalog.set_config('search_path', 'pg_catalog', true) OPERATOR(pg_catalog.=) 'pg_catalog' AS path
  ), actual_policies AS MATERIALIZED (
    SELECT pg_catalog.jsonb_build_object(
      'schema', ns.nspname, 'table', relation.relname, 'name', policy.polname,
      'command', policy.polcmd::pg_catalog.text, 'permissive', policy.polpermissive,
      'roles', (SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name COLLATE pg_catalog."C") FROM (
        SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid)::pg_catalog.text END AS role_name
        FROM pg_catalog.unnest(policy.polroles) role_oid) names),
      'usingExpression', pg_catalog.pg_get_expr(policy.polqual, ${deparseRelation}, false),
      'checkExpression', pg_catalog.pg_get_expr(policy.polwithcheck, ${deparseRelation}, false)
    ) AS value
    FROM pg_catalog.pg_policy policy
    JOIN pg_catalog.pg_class relation ON relation.oid=policy.polrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid=relation.relnamespace
    WHERE EXISTS (SELECT 1 FROM variants v, pg_catalog.jsonb_array_elements(v.value->'manifest'->'relations') expected
      WHERE expected->>'schema'=ns.nspname AND expected->>'table'=relation.relname)
  )
  SELECT context.readonly AS "transactionReadOnly", context.repeatable AS "repeatableRead",
    context.major_number AS "postgresMajor",
    context.major AS "postgresMajorMatches", context.path AS "searchPathMatches",
    (context.major AND context.path AND EXISTS (SELECT 1 FROM actual_policies WHERE value=$2::pg_catalog.jsonb)) AS "exactHistoricalOwnUpdateMatches",
    (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'state', variant.value->>'state', 'profile', variant.value->>'profile',
      'postgresMajorMatches', summary."postgresMajorMatches",
      'policySetMatches', summary."policySetMatches",
      'helperContractsMatch', summary."helperContractsMatch",
      'relationsMatch', summary."relationsMatch",
      'baselinePlusHistoricalOwnUpdateSetMatches', context.major AND context.path AND NOT EXISTS (
        (SELECT value FROM actual_policies EXCEPT
          (SELECT p FROM pg_catalog.jsonb_array_elements(variant.value->'manifest'->'policies') p UNION SELECT $2::pg_catalog.jsonb))
        UNION ALL
        ((SELECT p FROM pg_catalog.jsonb_array_elements(variant.value->'manifest'->'policies') p UNION SELECT $2::pg_catalog.jsonb)
          EXCEPT SELECT value FROM actual_policies)
      ),
      'policies', (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'schema', e.value->>'schema', 'table', e.value->>'table', 'name', e.value->>'name',
        ${policyFlags}
      ) ORDER BY e.ordinal), '[]'::pg_catalog.jsonb)
        FROM pg_catalog.jsonb_array_elements(variant.value->'manifest'->'policies') WITH ORDINALITY e(value, ordinal)
        LEFT JOIN actual_policies a ON a.value->>'schema'=e.value->>'schema'
          AND a.value->>'table'=e.value->>'table' AND a.value->>'name'=e.value->>'name'),
      'helpers', (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'schema', e.value->>'schema', 'name', e.value->>'name', 'argumentTypes', e.value->'argumentTypes',
        ${helperFlags},
        'directAclEntries', (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'grantee', required.value->>'grantee', 'grantor', required.value->>'grantor',
          'matches', h.oid IS NOT NULL AND EXISTS (
            SELECT 1 FROM pg_catalog.aclexplode(coalesce(h.proacl, pg_catalog.acldefault('f', h.proowner))) acl
            WHERE acl.privilege_type=required.value->>'privilege'
              AND acl.is_grantable=(required.value->>'grantable')::pg_catalog.bool
              AND acl.grantee=CASE required.value->>'grantee' WHEN '$owner' THEN h.proowner WHEN 'PUBLIC' THEN 0::pg_catalog.oid
                ELSE pg_catalog.to_regrole(required.value->>'grantee')::pg_catalog.oid END
              AND acl.grantor=CASE required.value->>'grantor' WHEN '$owner' THEN h.proowner
                ELSE pg_catalog.to_regrole(required.value->>'grantor')::pg_catalog.oid END)
        ) ORDER BY required.ordinal), '[]'::pg_catalog.jsonb)
          FROM pg_catalog.jsonb_array_elements(e.value->'directAcl') WITH ORDINALITY required(value,ordinal)),
        'effectiveExecute', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'role', permission.value->>'role',
          'roleExists', CASE WHEN permission.value->>'role' IN ('$owner','PUBLIC') THEN h.oid IS NOT NULL
            ELSE pg_catalog.to_regrole(permission.value->>'role') IS NOT NULL END,
          'matches', coalesce(h.oid IS NOT NULL AND CASE permission.value->>'role'
            WHEN 'PUBLIC' THEN EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(h.proacl, pg_catalog.acldefault('f', h.proowner))) acl
              WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') IS NOT DISTINCT FROM (permission.value->>'allowed')::pg_catalog.bool
            WHEN '$owner' THEN pg_catalog.has_function_privilege(h.proowner,h.oid,'EXECUTE')
              IS NOT DISTINCT FROM (permission.value->>'allowed')::pg_catalog.bool
            ELSE CASE WHEN pg_catalog.to_regrole(permission.value->>'role') IS NULL THEN false
              ELSE pg_catalog.has_function_privilege(pg_catalog.to_regrole(permission.value->>'role')::pg_catalog.oid,h.oid,'EXECUTE')
                IS NOT DISTINCT FROM (permission.value->>'allowed')::pg_catalog.bool END END, false)
        ) ORDER BY permission.ordinal)
          FROM pg_catalog.jsonb_array_elements(e.value->'effectiveExecute') WITH ORDINALITY permission(value,ordinal))
      ) ORDER BY e.ordinal), '[]'::pg_catalog.jsonb)
        FROM pg_catalog.jsonb_array_elements(variant.value->'manifest'->'helpers') WITH ORDINALITY e(value, ordinal)
        LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname=e.value->>'schema'
        LEFT JOIN pg_catalog.pg_proc h ON h.pronamespace=ns.oid AND h.proname=e.value->>'name'
          AND h.proargtypes::pg_catalog.text = coalesce((SELECT pg_catalog.string_agg(
            pg_catalog.to_regtype('pg_catalog.' || argument)::pg_catalog.oid::pg_catalog.text, ' ' ORDER BY position)
            FROM pg_catalog.jsonb_array_elements_text(e.value->'argumentTypes') WITH ORDINALITY args(argument,position)), '')
        LEFT JOIN pg_catalog.pg_language language ON language.oid=h.prolang
        LEFT JOIN pg_catalog.pg_namespace owner_ns ON owner_ns.nspname=e.value->'ownerRelation'->>'schema'
        LEFT JOIN pg_catalog.pg_class owner_relation ON owner_relation.relnamespace=owner_ns.oid
          AND owner_relation.relname=e.value->'ownerRelation'->>'table'),
      'relations', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'schema', e.value->>'schema', 'table', e.value->>'table',
        ${flagsSql({
          present: "relation.oid IS NOT NULL",
          kindMatches: "relation.relkind::pg_catalog.text=e.value->>'kind'",
          rowSecurityMatches: "relation.relrowsecurity=(e.value->>'rowSecurity')::pg_catalog.bool",
          forceRowSecurityMatches: "relation.relforcerowsecurity=(e.value->>'forceRowSecurity')::pg_catalog.bool",
        })},
        'columns', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name', dependency.value->>'name',
          ${flagsSql({
            present: "attribute.attnum IS NOT NULL",
            typeMatches: "type_ns.nspname='pg_catalog' AND column_type.typname=dependency.value->>'typeName'",
            typeModifierMatches: "attribute.atttypmod=(dependency.value->>'typeModifier')::pg_catalog.int4",
            notNullMatches: "attribute.attnotnull=(dependency.value->>'notNull')::pg_catalog.bool",
          })}
        ) ORDER BY dependency.ordinal)
          FROM pg_catalog.jsonb_array_elements(e.value->'columns') WITH ORDINALITY dependency(value,ordinal)
          LEFT JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid=relation.oid AND attribute.attnum>0
            AND NOT attribute.attisdropped AND attribute.attname=dependency.value->>'name'
          LEFT JOIN pg_catalog.pg_type column_type ON column_type.oid=attribute.atttypid
          LEFT JOIN pg_catalog.pg_namespace type_ns ON type_ns.oid=column_type.typnamespace)
      ) ORDER BY e.ordinal)
        FROM pg_catalog.jsonb_array_elements(variant.value->'manifest'->'relations') WITH ORDINALITY e(value,ordinal)
        LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname=e.value->>'schema'
        LEFT JOIN pg_catalog.pg_class relation ON relation.relnamespace=ns.oid AND relation.relname=e.value->>'table'),
      'unexpectedPolicies', (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'schema', extra.value->>'schema', 'table', extra.value->>'table', 'name', extra.value->>'name')
        ORDER BY extra.value->>'schema', extra.value->>'table', extra.value->>'name'), '[]'::pg_catalog.jsonb)
        FROM (SELECT a.value FROM actual_policies a WHERE NOT EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements(variant.value->'manifest'->'policies') e
          WHERE a.value->>'schema'=e->>'schema' AND a.value->>'table'=e->>'table' AND a.value->>'name'=e->>'name')
          ORDER BY a.value->>'schema', a.value->>'table', a.value->>'name' LIMIT 11) extra)
    ) ORDER BY variant.ordinal)
      FROM variants variant CROSS JOIN LATERAL (${comparison}) summary) AS variants
  FROM context`;
}

let cachedSource: TenantManagementPolicyDriftDiagnosticSource | undefined;
export function loadTenantManagementPolicyDriftDiagnosticSource(): TenantManagementPolicyDriftDiagnosticSource {
  if (cachedSource) return cachedSource;
  try {
    const sql = readFileSync(new URL(`lib/db/migrations/${TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME}`, root), "utf8");
    const parts = sql.split("$policy_repair_manifest$");
    if (parts.length !== 3) fail("source_invalid");
    const variants = validateRepairVariants(JSON.parse(parts[1]!));
    if (variants.length !== 8) fail("source_invalid");
    const historical = readFileSync(new URL(historicalPath, root), "utf8").replaceAll("\r\n", "\n");
    if (createHash("sha256").update(historical).digest("hex") !== historicalHash) fail("source_invalid");
    const manifest = variants[0]!.manifest;
    const sourceBytes = new Map(manifest.sources.map(({ path }) =>
      [path, readFileSync(new URL(path, root), "utf8")] as const));
    const compiled = compilePolicyDefinitionContract(manifest, sourceBytes);
    const original = compileSelfPinningPolicyDefinitionContractSql(compiled);
    if (original.split("$1").length !== 2) fail("source_invalid");
    const source = freeze({
      sql: comparisonQuery(original.replace("$1", "(variant.value->'manifest')")),
      values: [JSON.stringify(variants), JSON.stringify(historicalPolicy)] as const,
      variants,
    });
    issuedSources.add(source);
    cachedSource = source;
    return source;
  } catch { return fail("source_invalid"); }
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)) ||
      Object.getOwnPropertySymbols(value).length ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some((property) => !("value" in property))) fail("catalog_invalid");
  return value as Record<string, unknown>;
}
function booleans<T extends readonly string[]>(value: Record<string, unknown>, keys: T): Flags<T> {
  if (keys.some((key) => typeof value[key] !== "boolean")) fail("catalog_invalid");
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Flags<T>;
}
function array(value: unknown, length: number): unknown[] {
  if (!Array.isArray(value) || value.length !== length || Object.keys(value).length !== length ||
      Array.from({ length }, (_, index) => index).some((index) => !Object.hasOwn(value, index))) fail("catalog_invalid");
  return value as unknown[];
}
function exact(value: unknown, expected: unknown): void {
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail("catalog_invalid");
}
export function sanitizeTenantManagementPolicyDriftDiagnostic(
  value: unknown, source = loadTenantManagementPolicyDriftDiagnosticSource(),
): TenantManagementPolicyDriftDiagnostic {
  try {
    if (!issuedSources.has(source)) fail("source_invalid");
    const top = record(value, [...contextKeys, "postgresMajor", "variants"]);
    const context = booleans(top, contextKeys);
    if (!Number.isSafeInteger(top.postgresMajor) || (top.postgresMajor as number) < 10 || (top.postgresMajor as number) > 99 ||
        context.postgresMajorMatches !== (top.postgresMajor === 17)) fail("catalog_invalid");
    if (!context.transactionReadOnly || !context.repeatableRead || !context.searchPathMatches) fail("transaction_invalid");
    const variants = array(top.variants, source.variants.length).map((item, index) => {
      const expected = source.variants[index]!;
      const variant = record(item, ["state", "profile", ...aggregateKeys, "policies", "helpers", "relations", "unexpectedPolicies"]);
      exact(variant.state, expected.state); exact(variant.profile, expected.profile);
      const flags = booleans(variant, aggregateKeys);
      if (flags.postgresMajorMatches !== context.postgresMajorMatches) fail("catalog_invalid");
      const policies = array(variant.policies, expected.manifest.policies.length).map((item, position) => {
        const e = expected.manifest.policies[position]!;
        const row = record(item, ["schema", "table", "name", ...policyKeys]);
        for (const key of ["schema", "table", "name"] as const) exact(row[key], e[key]);
        return { schema: e.schema, table: e.table, name: e.name, ...booleans(row, policyKeys) };
      });
      const helpers = array(variant.helpers, expected.manifest.helpers.length).map((item, position) => {
        const e = expected.manifest.helpers[position]!;
        const row = record(item, ["schema", "name", "argumentTypes", ...helperKeys, "directAclEntries", "effectiveExecute"]);
        exact(row.schema, e.schema); exact(row.name, e.name);
        array(row.argumentTypes, e.argumentTypes.length); exact(row.argumentTypes, e.argumentTypes);
        const directAclEntries = array(row.directAclEntries, e.directAcl.length).map((item, offset) => {
          const acl = record(item, ["grantee", "grantor", "matches"]);
          const known = e.directAcl[offset]!;
          exact(acl.grantee, known.grantee); exact(acl.grantor, known.grantor);
          return { grantee: known.grantee, grantor: known.grantor, ...booleans(acl, ["matches"] as const) };
        });
        const effectiveExecute = array(row.effectiveExecute, e.effectiveExecute.length).map((item, offset) => {
          const permission = record(item, ["role", "roleExists", "matches"]);
          const role = e.effectiveExecute[offset]!.role; exact(permission.role, role);
          return { role, ...booleans(permission, ["roleExists", "matches"] as const) };
        });
        return { schema: e.schema, name: e.name, argumentTypes: [...e.argumentTypes],
          ...booleans(row, helperKeys), directAclEntries, effectiveExecute };
      });
      const relations = array(variant.relations, expected.manifest.relations.length).map((item, position) => {
        const e = expected.manifest.relations[position]!;
        const row = record(item, ["schema", "table", ...relationKeys, "columns"]);
        exact(row.schema, e.schema); exact(row.table, e.table);
        const columns = array(row.columns, e.columns.length).map((item, offset) => {
          const column = record(item, ["name", ...columnKeys]);
          const name = e.columns[offset]!.name; exact(column.name, name);
          return { name, ...booleans(column, columnKeys) };
        });
        return { schema: e.schema, table: e.table, ...booleans(row, relationKeys), columns };
      });
      if (!Array.isArray(variant.unexpectedPolicies)) fail("catalog_invalid");
      const extras = variant.unexpectedPolicies as unknown[];
      if (extras.length > MAX_EXTRAS) fail("policy_limit_exceeded");
      const seen = new Set<string>();
      const unexpectedPolicies = array(extras, extras.length).map((item) => {
        const row = record(item, ["schema", "table", "name"]);
        if (["schema", "table", "name"].some((key) => typeof row[key] !== "string" || !identifierPattern.test(row[key] as string))) fail("catalog_invalid");
        if (!expected.manifest.relations.some((relation) => relation.schema === row.schema && relation.table === row.table) ||
            expected.manifest.policies.some((policy) => policy.schema === row.schema && policy.table === row.table && policy.name === row.name)) fail("catalog_invalid");
        const identity = `${row.schema}.${row.table}.${row.name}`;
        if (seen.has(identity)) fail("catalog_invalid");
        seen.add(identity);
        return { schema: row.schema as string, table: row.table as string, name: row.name as string };
      });
      return { state: expected.state, profile: expected.profile, ...flags, policies, helpers, relations, unexpectedPolicies };
    });
    const result = { ...context, postgresMajor: top.postgresMajor as number, variants };
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESULT_BYTES) fail("catalog_invalid");
    return result;
  } catch (error) {
    if (error instanceof DriftDiagnosticError) throw error;
    return fail("catalog_invalid");
  }
}

export async function readTenantManagementPolicyDriftDiagnostic(
  queryable: PolicyDefinitionQueryable, source = loadTenantManagementPolicyDriftDiagnosticSource(),
): Promise<TenantManagementPolicyDriftDiagnostic> {
  try {
    if (!issuedSources.has(source)) fail("source_invalid");
    const check = await queryable.query(
      "SELECT pg_catalog.current_setting('transaction_read_only') OPERATOR(pg_catalog.=) 'on' AS \"transactionReadOnly\", pg_catalog.current_setting('transaction_isolation') OPERATOR(pg_catalog.=) 'repeatable read' AS \"repeatableRead\"",
    );
    if (check.rowCount !== 1 || check.rows.length !== 1) fail("transaction_invalid");
    const context = record(check.rows[0], ["transactionReadOnly", "repeatableRead"]);
    if (context.transactionReadOnly !== true || context.repeatableRead !== true) fail("transaction_invalid");
    // Pin before parsing the comparison too: its operators must be bound in a
    // trusted namespace, independently of the later deparser argument pin.
    const pin = await queryable.query(
      "SELECT pg_catalog.set_config('search_path', 'pg_catalog', true) OPERATOR(pg_catalog.=) 'pg_catalog' AS \"searchPathMatches\"",
    );
    if (pin.rowCount !== 1 || pin.rows.length !== 1) fail("transaction_invalid");
    if (record(pin.rows[0], ["searchPathMatches"]).searchPathMatches !== true) fail("transaction_invalid");
    const result = await queryable.query(source.sql, [...source.values]);
    if (result.rowCount !== 1 || result.rows.length !== 1) fail("catalog_invalid");
    return sanitizeTenantManagementPolicyDriftDiagnostic(result.rows[0], source);
  } catch (error) {
    if (error instanceof DriftDiagnosticError) throw error;
    return fail("catalog_read_failed");
  }
}
