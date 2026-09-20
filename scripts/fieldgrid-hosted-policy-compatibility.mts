import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { HOSTED_POLICY_REPLACEMENT, HOSTED_POLICY_SUPERSEDED } from "../lib/db/src/hosted-policy-compatibility-identity.ts";
import { sqlForManagedMigrationTransaction } from "../lib/db/src/migration-transaction-retry.ts";
import { loadPlatformPrivilegeMigrationFrontier, assertPlatformPrivilegeMigrationFrontier } from "./fieldgrid-staging-field-demo-owner-binding-repair.mts";
import { assertTenantManagementAuthorizationHistory, tenantManagementAuthorizationFrontier,
  type AuthorizationQueryable } from "./fieldgrid-staging-tenant-management-authorization.mts";
import { loadTenantManagementAuthorizationSource, readTenantManagementAuthorizationImpact,
  verifyTenantManagementScopeCatalog, verifyTenantManagementScopeContract } from "./fieldgrid-tenant-management-authorization-contract.mts";
import { loadTenantManagementPolicyRepairSource, policyRepairReadinessSql, validateRepairVariants,
  verifyTenantManagementPolicyRepairCatalog, tenantManagementPolicyRepairContractSql } from "./fieldgrid-tenant-management-policy-repair-contract.mts";

const lockKey = "fieldgrid:database-migrations:v1";
const reconciliation = "20260914125400_reconcile_legacy_global_rbac_policies.sql";
type MigrationRecord = { name: string; hash: string; baselined: boolean; appliedAt: string };
export function loadHostedPolicyCompatibilitySource() {
  const sql = readFileSync(new URL(`../lib/db/migrations/${HOSTED_POLICY_REPLACEMENT.name}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
  if (createHash("sha256").update(sql).digest("hex") !== HOSTED_POLICY_REPLACEMENT.hash) throw new Error("hosted_policy_source_invalid");
  const parts = sql.split("$policy_repair_manifest$");
  if (parts.length !== 3) throw new Error("hosted_policy_source_invalid");
  const variants = validateRepairVariants(JSON.parse(parts[1]!));
  if (!sql.includes(policyRepairReadinessSql(variants, "repair_manifest"))) throw new Error("hosted_policy_source_invalid");
  const hosted = variants.filter((variant) => variant.profile.startsWith("hosted"));
  if (hosted.length !== 5) throw new Error("hosted_policy_source_invalid");
  return { ...HOSTED_POLICY_REPLACEMENT, sql, readinessSql: policyRepairReadinessSql(hosted) };
}

export function boundedHostedPolicyHistory(base: Awaited<ReturnType<typeof loadPlatformPrivilegeMigrationFrontier>>,
  scope: Awaited<ReturnType<typeof loadTenantManagementAuthorizationSource>>,
  repair: Awaited<ReturnType<typeof loadTenantManagementPolicyRepairSource>>, records: MigrationRecord[]) {
  if (repair.hash !== HOSTED_POLICY_SUPERSEDED.hash) throw new Error("hosted_policy_source_invalid");
  // Later reviewed migrations remain ordinary migrations. Validate their exact
  // hashes and chronological prefix, then narrow this repair to its fixed span.
  assertPlatformPrivilegeMigrationFrontier(base, records);
  const replacementIndex = base.committed.findIndex((entry) => entry.name === HOSTED_POLICY_REPLACEMENT.name);
  if (replacementIndex < 0 || base.committed[replacementIndex]?.hash !== HOSTED_POLICY_REPLACEMENT.hash) {
    throw new Error("hosted_policy_source_invalid");
  }
  const boundedBase = { ...base, committed: base.committed.slice(0, replacementIndex + 1) };
  const frontier = tenantManagementAuthorizationFrontier(boundedBase, scope, repair);
  const laterNames = new Set(base.committed.slice(replacementIndex + 1).map((entry) => entry.name));
  const pending = assertTenantManagementAuthorizationHistory(frontier, records.filter((record) => !laterNames.has(record.name)));
  return { frontier, records, pending };
}

async function frontierAndHistory(queryable: AuthorizationQueryable) {
  const [base, scope, repair] = await Promise.all([loadPlatformPrivilegeMigrationFrontier(),
    loadTenantManagementAuthorizationSource(), loadTenantManagementPolicyRepairSource()]);
  const records = (await queryable.query<MigrationRecord>(
    'SELECT name, hash, baselined, applied_at AS "appliedAt" FROM drizzle.veele_sql_migrations ORDER BY applied_at, name')).rows;
  return boundedHostedPolicyHistory(base, scope, repair, records);
}

export async function runHostedPolicyCompatibility(queryable: AuthorizationQueryable,
  operation: "diagnose" | "apply", candidateName?: string) {
  if (!["diagnose", "apply"].includes(operation)) throw new Error("hosted_policy_configuration_invalid");
  const source = loadHostedPolicyCompatibilitySource();
  let locked = false, transaction = false;
  try {
    const lock = await queryable.query("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired", [lockKey]);
    if (lock.rows[0]?.acquired !== true) throw new Error("hosted_policy_lock_unavailable");
    locked = true;
    await queryable.query(operation === "diagnose" ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
    transaction = true;
    await queryable.query("SET LOCAL lock_timeout='5s'");
    await queryable.query("SET LOCAL statement_timeout='120s'");
    if (operation === "apply") await queryable.query("LOCK TABLE drizzle.veele_sql_migrations IN SHARE ROW EXCLUSIVE MODE");
    const { records, pending } = await frontierAndHistory(queryable);
    const result = await queryable.query(source.readinessSql);
    const state = result.rows[0];
    if (result.rows.length !== 1 || !state || Object.keys(state).length !== 4 ||
        Object.values(state).some((value) => typeof value !== "boolean")) throw new Error("hosted_policy_catalog_invalid");
    const replacementRecorded = records.some((record) => record.name === source.name && record.hash === source.hash && !record.baselined);
    if (replacementRecorded && (!await verifyTenantManagementScopeContract(queryable) ||
        !await verifyTenantManagementPolicyRepairCatalog(queryable))) {
      throw new Error("hosted_policy_postcondition_failed");
    }
    const ready = state.dependenciesValid === true && pending.length > 0 && !replacementRecorded &&
      (!candidateName || candidateName === pending[0]?.name);
    const diagnosis = { ready, replacementRecorded, pendingCount: pending.length, state, changed: false };
    if (operation === "diagnose" || !ready) {
      await queryable.query("ROLLBACK"); transaction = false;
      return diagnosis;
    }
    if (candidateName && ![reconciliation, HOSTED_POLICY_SUPERSEDED.name].includes(candidateName)) throw new Error("hosted_policy_frontier_invalid");
    const before = await readTenantManagementAuthorizationImpact(queryable);
    if (pending.length === 3 && (before.missing_pairs !== 0 || before.preserved_pairs !== before.legacy_pairs)) {
      throw new Error("hosted_policy_access_preservation_failed");
    }
    // Execute the new reviewed migration first, then the unchanged historical
    // pair. Journal insertion remains chronological and commits with all DDL.
    await queryable.query(sqlForManagedMigrationTransaction(source.sql));
    for (const migration of pending) {
      if (migration.name !== HOSTED_POLICY_SUPERSEDED.name) {
        await queryable.query(sqlForManagedMigrationTransaction(migration.sql));
      }
    }
    if (!await verifyTenantManagementScopeCatalog(queryable) || !await verifyTenantManagementPolicyRepairCatalog(queryable)) {
      throw new Error("hosted_policy_postcondition_failed");
    }
    const after = await readTenantManagementAuthorizationImpact(queryable);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("hosted_policy_access_preservation_failed");
    for (const migration of [...pending, source]) {
      const baselined = migration.name === HOSTED_POLICY_SUPERSEDED.name;
      const recorded = await queryable.query<{ name: string; hash: string; baselined: boolean }>(
        "INSERT INTO drizzle.veele_sql_migrations(name,hash,baselined) VALUES($1,$2,$3) RETURNING name,hash,baselined",
        [migration.name, migration.hash, baselined]);
      if (recorded.rows.length !== 1 || recorded.rows[0]?.name !== migration.name ||
          recorded.rows[0]?.hash !== migration.hash || recorded.rows[0]?.baselined !== baselined) throw new Error("hosted_policy_history_write_failed");
    }
    if ((await frontierAndHistory(queryable)).pending.length !== 0 || !await verifyTenantManagementScopeContract(queryable)) {
      throw new Error("hosted_policy_history_invalid");
    }
    const complete = await queryable.query(`SELECT ${tenantManagementPolicyRepairContractSql()} AS verified`);
    if (complete.rows[0]?.verified !== true) throw new Error("hosted_policy_postcondition_failed");
    await queryable.query("COMMIT"); transaction = false;
    return { ...diagnosis, ready: false, replacementRecorded: true, pendingCount: 0, changed: true };
  } catch (error) {
    if (transaction) await queryable.query("ROLLBACK");
    throw error;
  } finally {
    if (locked) {
      const released = await queryable.query("SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released", [lockKey]);
      if (released.rows[0]?.released !== true) throw new Error("hosted_policy_cleanup_failed");
    }
  }
}
