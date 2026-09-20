import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  compilePolicyDefinitionContract,
  compileSelfPinningPolicyDefinitionContractSql,
  type PolicyDefinitionManifest,
  type PolicyDefinitionQueryable,
} from "./fieldgrid-tenant-management-policy-definition-contract.mts";
import { tenantManagementScopeContractSql } from "./fieldgrid-tenant-management-authorization-contract.mts";
import { withHostedAuthVariants } from "./fieldgrid-hosted-policy-variants.mts";
import { withPg17RestoredTargetVariants } from "./fieldgrid-pg17-restored-policy-variants.mts";
import { HOSTED_POLICY_REPLACEMENT } from "../lib/db/src/hosted-policy-compatibility-identity.ts";

export const TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME =
  "20260919220633_repair_tenant_management_policy_consumers.sql";
const reconciliationName = "20260914125400_reconcile_legacy_global_rbac_policies.sql";
const reconciliationHash = "421fde7810185af215b46b733bcf09878c78812a6a151850bb52536ddcc7ba5c";
const sourceRoot = new URL("../", import.meta.url);
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const states = ["clean", "legacy", "targetClean", "targetUpgrade"] as const;
export type RepairVariant = {
  state: typeof states[number]; profile: string; manifest: PolicyDefinitionManifest;
};
const readinessKeys = ["legacyDefinitionMatches", "cleanDefinitionMatches", "targetDefinitionMatches", "dependenciesValid"] as const;
export type PolicyRepairReadiness = Record<typeof readinessKeys[number], boolean>;

function sourceText(path: string): string {
  if (!/^(?:lib\/db\/)?migrations\/[A-Za-z0-9_]+\.sql$/u.test(path) &&
      !["tests/fixtures/fieldgrid-supabase-auth-functions.sql", "scripts/fieldgrid-runtime-safety-setup.mjs"].includes(path)) {
    throw new Error("policy_repair_source_invalid");
  }
  return readFileSync(new URL(path, sourceRoot), "utf8");
}

export function validateRepairVariants(value: unknown): RepairVariant[] {
  if (!Array.isArray(value) || value.length < 4 || value.length > 32) throw new Error("policy_repair_source_invalid");
  const identities = new Set<string>();
  for (const variant of value as RepairVariant[]) {
    if (!variant || Object.keys(variant).sort().join(",") !== "manifest,profile,state" ||
        !states.includes(variant.state) || !/^[A-Za-z][A-Za-z0-9]{0,39}$/u.test(variant.profile)) {
      throw new Error("policy_repair_source_invalid");
    }
    const identity = `${variant.state}/${variant.profile}`;
    if (identities.has(identity)) throw new Error("policy_repair_source_invalid");
    identities.add(identity);
    compilePolicyDefinitionContract(variant.manifest, new Map(
      variant.manifest.sources.map(({ path }) => [path, sourceText(path)]),
    ));
  }
  if (states.some((state) => !value.some((variant) => variant.state === state))) throw new Error("policy_repair_source_invalid");
  return value as RepairVariant[];
}

// Reuse the complete immutable legacy-helper predicate, rather than invent a
// second approximation. The adjacent absence check is also required: the scope
// migration deliberately creates the private helper only after reconciliation.
export function legacyTenantManagementHelperContractSql(): string {
  const sql = sourceText("lib/db/migrations/20260914125503_scope_tenant_management_authorization.sql").replaceAll("\r\n", "\n");
  const begin = "  IF NOT EXISTS (\n    SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang";
  const end = ") THEN\n    RAISE EXCEPTION 'tenant_management_legacy_contract_drift';";
  const parts = sql.split(begin);
  if (parts.length !== 2 || parts[1]!.split(end).length !== 2) throw new Error("policy_repair_source_invalid");
  const predicate = "SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang" + parts[1]!.split(end)[0]!;
  return `(pg_catalog.to_regprocedure('app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)') IS NULL
    AND EXISTS (${predicate}))`;
}

// This SELECT is also embedded verbatim in the standalone SQL migration. The
// only substitutions are reviewed source JSON and fixed helper contracts.
export function policyRepairReadinessSql(variants: RepairVariant[], manifestExpression?: string, targetOnly = false): string {
  validateRepairVariants(variants);
  const example = variants[0]!.manifest;
  const compiled = compilePolicyDefinitionContract(example, new Map(example.sources.map(({ path }) => [path, sourceText(path)])));
  const comparison = compileSelfPinningPolicyDefinitionContractSql(compiled)
    .replace("$1", "(candidate.value->'manifest')");
  const included = targetOnly ? variants.filter((variant) => variant.state.startsWith("target")) : variants;
  const input = manifestExpression ?? `${quote(JSON.stringify(included))}::jsonb`;
  return `WITH matches AS (
    SELECT candidate.value->>'state' AS state,
      definition."policySetMatches" AS policy_matches,
      (definition."policySetMatches" AND definition."relationsMatch"
       AND definition."helperContractsMatch" AND definition."postgresMajorMatches"
       AND CASE candidate.value->>'state'
         WHEN 'legacy' THEN ${legacyTenantManagementHelperContractSql()}
         WHEN 'clean' THEN ${tenantManagementScopeContractSql(false)}
         ELSE (${legacyTenantManagementHelperContractSql()} OR ${tenantManagementScopeContractSql(false)}) END) AS valid
    FROM pg_catalog.jsonb_array_elements(${input}) candidate(value)
    CROSS JOIN LATERAL (${comparison}) definition
  ) SELECT
    coalesce(pg_catalog.bool_or(policy_matches AND state = 'legacy'), false) AS "legacyDefinitionMatches",
    coalesce(pg_catalog.bool_or(policy_matches AND state = 'clean'), false) AS "cleanDefinitionMatches",
    coalesce(pg_catalog.bool_or(policy_matches AND state IN ('targetClean', 'targetUpgrade')), false) AS "targetDefinitionMatches",
    coalesce(pg_catalog.bool_or(valid), false) AS "dependenciesValid"
  FROM matches`;
}

let cached: { name: string; hash: string; sql: string; variants: RepairVariant[]; readinessSql: string } | undefined;
function repairSource() {
  if (cached) return cached;
  const sql = sourceText(`lib/db/migrations/${TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME}`).replaceAll("\r\n", "\n");
  const parts = sql.split("$policy_repair_manifest$");
  if (parts.length !== 3) throw new Error("policy_repair_source_invalid");
  const variants = validateRepairVariants(JSON.parse(parts[1]!));
  const readinessSql = policyRepairReadinessSql(variants);
  // The migration must execute this same comparator, not a weaker duplicate.
  const embeddedQuery = policyRepairReadinessSql(variants, "repair_manifest");
  if (!sql.includes(embeddedQuery)) throw new Error("policy_repair_source_invalid");
  cached = { name: TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME,
    hash: createHash("sha256").update(sql).digest("hex"), sql, variants, readinessSql };
  return cached;
}

export async function loadTenantManagementPolicyRepairSource() {
  const { name, hash, sql } = repairSource();
  return { name, hash, sql };
}

export async function readTenantManagementPolicyRepairReadiness(queryable: PolicyDefinitionQueryable): Promise<PolicyRepairReadiness> {
  try {
    const result = await queryable.query(policyRepairReadinessSql(withPg17RestoredTargetVariants(
      withHostedAuthVariants(repairSource().variants))));
    const row = result.rows[0];
    if (result.rowCount !== 1 || result.rows.length !== 1 || !row || Object.keys(row).length !== 4 ||
        readinessKeys.some((key) => typeof row[key] !== "boolean")) throw new Error();
    return Object.fromEntries(readinessKeys.map((key) => [key, row[key]])) as PolicyRepairReadiness;
  } catch { throw new Error("policy_repair_catalog_invalid"); }
}

export function tenantManagementPolicyRepairContractSql(includeJournal = true): string {
  const source = repairSource();
  const journal = [
    { name: source.name, hash: source.hash },
    { name: reconciliationName, hash: reconciliationHash },
  ].map(({ name, hash }) => `(SELECT count(*) FROM drizzle.veele_sql_migrations WHERE name = ${quote(name)}) = 1
    AND EXISTS (SELECT 1 FROM drizzle.veele_sql_migrations WHERE name = ${quote(name)} AND hash = ${quote(hash)}
      AND (baselined = false${name === source.name ? ` OR (baselined = true AND EXISTS (
        SELECT 1 FROM drizzle.veele_sql_migrations WHERE name = ${quote(HOSTED_POLICY_REPLACEMENT.name)}
          AND hash = ${quote(HOSTED_POLICY_REPLACEMENT.hash)} AND baselined = false))` : ""}))`).join(" AND ");
  return `(EXISTS (SELECT 1 FROM (${policyRepairReadinessSql(withPg17RestoredTargetVariants(withHostedAuthVariants(source.variants)), undefined, true)}) repair
    WHERE repair."targetDefinitionMatches" AND repair."dependenciesValid")${includeJournal ? ` AND ${journal}` : ""})`;
}

export async function verifyTenantManagementPolicyRepairCatalog(queryable: PolicyDefinitionQueryable): Promise<boolean> {
  const result = await readTenantManagementPolicyRepairReadiness(queryable);
  return result.targetDefinitionMatches && result.dependenciesValid;
}
