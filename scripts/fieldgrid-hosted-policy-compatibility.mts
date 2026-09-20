import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { HOSTED_POLICY_CLEAN_HELPER_CLOSURE, HOSTED_POLICY_PERSONNEL_CLOSURE, HOSTED_POLICY_REPLACEMENT, HOSTED_POLICY_SUPERSEDED } from "../lib/db/src/hosted-policy-compatibility-identity.ts";
import { sqlForManagedMigrationTransaction } from "../lib/db/src/migration-transaction-retry.ts";
import { loadPlatformPrivilegeMigrationFrontier, assertPlatformPrivilegeMigrationFrontier } from "./fieldgrid-staging-field-demo-owner-binding-repair.mts";
import { assertTenantManagementAuthorizationHistory, tenantManagementAuthorizationFrontier,
  type AuthorizationQueryable } from "./fieldgrid-staging-tenant-management-authorization.mts";
import { loadTenantManagementAuthorizationSource, readTenantManagementAuthorizationImpact,
  verifyTenantManagementScopeCatalog, verifyTenantManagementScopeContract } from "./fieldgrid-tenant-management-authorization-contract.mts";
import { loadTenantManagementPolicyRepairSource, policyRepairReadinessSql, validateRepairVariants,
  verifyTenantManagementPolicyRepairCatalog, tenantManagementPolicyRepairContractSql } from "./fieldgrid-tenant-management-policy-repair-contract.mts";

import { withPg17RestoredTargetVariants } from "./fieldgrid-pg17-restored-policy-variants.mts";

const lockKey = "fieldgrid:database-migrations:v1";
const reconciliation = "20260914125400_reconcile_legacy_global_rbac_policies.sql";
type MigrationRecord = { name: string; hash: string; baselined: boolean; appliedAt: string };
const personnelPathKeys = ["legacyPolicyExists", "anonTableUpdate", "anonColumnUpdate",
  "authenticatedTableUpdate", "authenticatedColumnUpdate", "runtimeSelect", "runtimeUpdate",
  "runtimeRoleRestricted"] as const;
export type HostedPolicyPersonnelPath = Record<typeof personnelPathKeys[number], boolean>;

// Observe the immutable replacement's personnel closure guard without exposing
// role members, policy expressions, row data or connection details. Resolve OIDs
// first so a missing runtime role reports false rather than a driver exception.
export const HOSTED_POLICY_PERSONNEL_PATH_SQL = `SELECT
  EXISTS (SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid = pg_catalog.to_regclass('public.personnel')
      AND polname = 'personnel_update_own_phone') AS "legacyPolicyExists",
  coalesce(pg_catalog.has_table_privilege(pg_catalog.to_regrole('anon')::oid,
    pg_catalog.to_regclass('public.personnel')::oid, 'UPDATE'), false) AS "anonTableUpdate",
  coalesce(pg_catalog.has_any_column_privilege(pg_catalog.to_regrole('anon')::oid,
    pg_catalog.to_regclass('public.personnel')::oid, 'UPDATE'), false) AS "anonColumnUpdate",
  coalesce(pg_catalog.has_table_privilege(pg_catalog.to_regrole('authenticated')::oid,
    pg_catalog.to_regclass('public.personnel')::oid, 'UPDATE'), false) AS "authenticatedTableUpdate",
  coalesce(pg_catalog.has_any_column_privilege(pg_catalog.to_regrole('authenticated')::oid,
    pg_catalog.to_regclass('public.personnel')::oid, 'UPDATE'), false) AS "authenticatedColumnUpdate",
  coalesce(pg_catalog.has_table_privilege(pg_catalog.to_regrole('fieldgrid_runtime_app')::oid,
    pg_catalog.to_regclass('public.personnel')::oid, 'SELECT'), false) AS "runtimeSelect",
  coalesce(pg_catalog.has_table_privilege(pg_catalog.to_regrole('fieldgrid_runtime_app')::oid,
    pg_catalog.to_regclass('public.personnel')::oid, 'UPDATE'), false) AS "runtimeUpdate",
  EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fieldgrid_runtime_app'
    AND NOT rolsuper AND NOT rolbypassrls) AS "runtimeRoleRestricted"`;

export async function readHostedPolicyPersonnelPath(queryable: AuthorizationQueryable) {
  const result = await queryable.query<HostedPolicyPersonnelPath>(HOSTED_POLICY_PERSONNEL_PATH_SQL);
  const row = result.rows[0];
  if (result.rows.length !== 1 || !row || Object.keys(row).length !== personnelPathKeys.length ||
      personnelPathKeys.some((key) => typeof row[key] !== "boolean")) {
    throw new Error("hosted_policy_personnel_diagnostic_invalid");
  }
  const personnelPath = Object.fromEntries(personnelPathKeys.map((key) => [key, row[key]])) as HostedPolicyPersonnelPath;
  const closed = !personnelPath.legacyPolicyExists || (!personnelPath.anonTableUpdate &&
    !personnelPath.anonColumnUpdate && !personnelPath.authenticatedTableUpdate &&
    !personnelPath.authenticatedColumnUpdate && personnelPath.runtimeSelect &&
    personnelPath.runtimeUpdate && personnelPath.runtimeRoleRestricted);
  return { ...personnelPath, closed };
}

export function loadHostedPolicyCompatibilitySource() {
  const sql = readFileSync(new URL(`../lib/db/migrations/${HOSTED_POLICY_REPLACEMENT.name}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
  if (createHash("sha256").update(sql).digest("hex") !== HOSTED_POLICY_REPLACEMENT.hash) throw new Error("hosted_policy_source_invalid");
  const parts = sql.split("$policy_repair_manifest$");
  if (parts.length !== 3) throw new Error("hosted_policy_source_invalid");
  const variants = validateRepairVariants(JSON.parse(parts[1]!));
  if (!sql.includes(policyRepairReadinessSql(variants, "repair_manifest"))) throw new Error("hosted_policy_source_invalid");
  const hosted = variants.filter((variant) => variant.profile.startsWith("hosted"));
  if (hosted.length !== 5) throw new Error("hosted_policy_source_invalid");
  return { ...HOSTED_POLICY_REPLACEMENT, sql, readinessSql: policyRepairReadinessSql(withPg17RestoredTargetVariants(hosted)) };
}

export function loadHostedPolicyPersonnelClosureSource() {
  const sql = readFileSync(new URL(`../lib/db/migrations/${HOSTED_POLICY_PERSONNEL_CLOSURE.name}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
  if (createHash("sha256").update(sql).digest("hex") !== HOSTED_POLICY_PERSONNEL_CLOSURE.hash) {
    throw new Error("hosted_policy_source_invalid");
  }
  const parts = sql.split("$personnel_closure_readiness$");
  if (parts.length !== 3) throw new Error("hosted_policy_source_invalid");
  return { ...HOSTED_POLICY_PERSONNEL_CLOSURE, sql, readinessSql: parts[1]! };
}

export function loadHostedCleanHelperClosureSource() {
  const sql = readFileSync(new URL(`../lib/db/migrations/${HOSTED_POLICY_CLEAN_HELPER_CLOSURE.name}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
  if (createHash("sha256").update(sql).digest("hex") !== HOSTED_POLICY_CLEAN_HELPER_CLOSURE.hash) {
    throw new Error("hosted_policy_source_invalid");
  }
  const parts = sql.split("$clean_helper_manifest$");
  if (parts.length !== 3) throw new Error("hosted_policy_source_invalid");
  const variants = validateRepairVariants(JSON.parse(parts[1]!));
  if (!sql.includes(policyRepairReadinessSql(variants, "observed_manifest"))) throw new Error("hosted_policy_source_invalid");
  const observed = variants.filter((variant) => variant.state === "clean" && variant.profile === "hostedObservedClean");
  if (observed.length !== 1) throw new Error("hosted_policy_source_invalid");
  const manifest = `'${JSON.stringify(observed).replaceAll("'", "''")}'::jsonb`;
  return { ...HOSTED_POLICY_CLEAN_HELPER_CLOSURE, sql, readinessSql: policyRepairReadinessSql(variants, manifest) };
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
  const closureIndex = replacementIndex + 1;
  if (base.committed[closureIndex]?.name !== HOSTED_POLICY_PERSONNEL_CLOSURE.name ||
      base.committed[closureIndex]?.hash !== HOSTED_POLICY_PERSONNEL_CLOSURE.hash) throw new Error("hosted_policy_source_invalid");
  const helperClosureIndex = closureIndex + 1;
  if (base.committed[helperClosureIndex]?.name !== HOSTED_POLICY_CLEAN_HELPER_CLOSURE.name ||
      base.committed[helperClosureIndex]?.hash !== HOSTED_POLICY_CLEAN_HELPER_CLOSURE.hash) throw new Error("hosted_policy_source_invalid");
  const boundedBase = { ...base, committed: base.committed.slice(0, helperClosureIndex + 1) };
  const frontier = tenantManagementAuthorizationFrontier(boundedBase, scope, repair);
  const laterNames = new Set(base.committed.slice(helperClosureIndex + 1).map((entry) => entry.name));
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
  const closure = loadHostedPolicyPersonnelClosureSource();
  const helperClosure = loadHostedCleanHelperClosureSource();
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
    let cleanHelperClosureRepairable = false;
    if (!state.dependenciesValid && state.cleanDefinitionMatches) {
      const readiness = await queryable.query(helperClosure.readinessSql);
      const candidate = readiness.rows[0];
      if (readiness.rows.length !== 1 || !candidate || Object.keys(candidate).length !== 4 ||
          Object.values(candidate).some((value) => typeof value !== "boolean")) throw new Error("hosted_policy_catalog_invalid");
      cleanHelperClosureRepairable = candidate.cleanDefinitionMatches === true && candidate.dependenciesValid === true;
    }
    const personnelPath = await readHostedPolicyPersonnelPath(queryable);
    const replacementRecorded = records.some((record) => record.name === source.name && record.hash === source.hash && !record.baselined);
    if (replacementRecorded && (!await verifyTenantManagementScopeContract(queryable) ||
        !await verifyTenantManagementPolicyRepairCatalog(queryable))) {
      throw new Error("hosted_policy_postcondition_failed");
    }
    let personnelClosureRepairable = false;
    const requiresClosedPersonnel = state.legacyDefinitionMatches || state.cleanDefinitionMatches;
    if (requiresClosedPersonnel && !personnelPath.closed) {
      const readiness = await queryable.query(closure.readinessSql);
      if (readiness.rows.length !== 1 || Object.keys(readiness.rows[0] ?? {}).length !== 1 ||
          typeof readiness.rows[0]?.repairable !== "boolean") throw new Error("hosted_policy_catalog_invalid");
      personnelClosureRepairable = readiness.rows[0].repairable;
    }
    const personnelPathReady = !requiresClosedPersonnel || personnelPath.closed || personnelClosureRepairable;
    const applicable = (state.dependenciesValid === true || cleanHelperClosureRepairable) && pending.length > 0 && !replacementRecorded &&
      (!candidateName || candidateName === pending[0]?.name);
    // A rejected applicable repair must stop the ordinary migration runner.
    // Returning changed:false would let it commit historical prerequisites.
    // The catch below rolls back before propagating this bounded error.
    if (operation === "apply" && applicable && !personnelPathReady) {
      throw new Error("hosted_policy_personnel_path_not_closed");
    }
    const ready = applicable && personnelPathReady;
    const diagnosis = { ready, replacementRecorded, pendingCount: pending.length, state, personnelPath, personnelClosureRepairable, cleanHelperClosureRepairable, changed: false };
    if (operation === "diagnose" || !ready) {
      await queryable.query("ROLLBACK"); transaction = false;
      return diagnosis;
    }
    if (candidateName && ![reconciliation, HOSTED_POLICY_SUPERSEDED.name].includes(candidateName)) throw new Error("hosted_policy_frontier_invalid");
    const before = await readTenantManagementAuthorizationImpact(queryable);
    if (pending.length === 3 && (before.missing_pairs !== 0 || before.preserved_pairs !== before.legacy_pairs)) {
      throw new Error("hosted_policy_access_preservation_failed");
    }
    // Apply the exact ACL prerequisite before the immutable personnel guard.
    // All source execution and chronological journal writes share this transaction.
    await queryable.query(sqlForManagedMigrationTransaction(helperClosure.sql));
    if (cleanHelperClosureRepairable) {
      const normalized = (await queryable.query(source.readinessSql)).rows[0];
      if (normalized?.cleanDefinitionMatches !== true || normalized.dependenciesValid !== true) {
        throw new Error("hosted_policy_clean_helper_postcondition_failed");
      }
    }
    await queryable.query(sqlForManagedMigrationTransaction(closure.sql));
    if (requiresClosedPersonnel && !(await readHostedPolicyPersonnelPath(queryable)).closed) {
      throw new Error("hosted_policy_personnel_path_not_closed");
    }
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
    for (const migration of [...pending, source, closure, helperClosure]) {
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
