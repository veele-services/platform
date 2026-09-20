#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { databaseProjectRef } from "../lib/db/src/database-environment.ts";
import { sqlForManagedMigrationTransaction } from "../lib/db/src/migration-transaction-retry.ts";
import {
  assertPlatformPrivilegeMigrationFrontier,
  loadPlatformPrivilegeMigrationFrontier,
} from "./fieldgrid-staging-field-demo-owner-binding-repair.mts";
import {
  TENANT_MANAGEMENT_MIGRATION_NAME,
  loadTenantManagementAuthorizationSource,
  readTenantManagementAuthorizationImpact,
  verifyTenantManagementScopeContract,
  verifyTenantManagementScopeCatalog,
} from "./fieldgrid-tenant-management-authorization-contract.mts";
import {
  loadTenantManagementPolicyRepairSource,
  readTenantManagementPolicyRepairReadiness,
  verifyTenantManagementPolicyRepairCatalog,
} from "./fieldgrid-tenant-management-policy-repair-contract.mts";
import {
  readTenantManagementPolicyDriftDiagnostic,
  sanitizeTenantManagementPolicyDriftDiagnostic,
  type TenantManagementPolicyDriftDiagnostic,
} from "./fieldgrid-tenant-management-policy-drift-diagnostic.mts";

export const TENANT_MANAGEMENT_AUTHORIZATION_VERSION =
  "fieldgrid-staging-tenant-management-authorization-v1";
export const TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION =
  TENANT_MANAGEMENT_AUTHORIZATION_VERSION;
export const TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF = "olyfmekyqozxrbrwwszu";
export const TENANT_MANAGEMENT_POLICY_RECONCILIATION_MIGRATION_NAME =
  "20260914125400_reconcile_legacy_global_rbac_policies.sql";
export const TENANT_MANAGEMENT_POLICY_RECONCILIATION_MIGRATION_HASH =
  "421fde7810185af215b46b733bcf09878c78812a6a151850bb52536ddcc7ba5c";
export const TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME =
  "20260919220633_repair_tenant_management_policy_consumers.sql";
const DATABASE_MIGRATION_LOCK_KEY = "fieldgrid:database-migrations:v1";
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const RUN_PATTERN = /^[1-9][0-9]{0,19}$/u;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type Mode = "check" | "diagnose" | "apply";
export type TenantManagementAuthorizationOptions = { mode: Mode; expectedSha: string };
type Environment = Record<string, string | undefined>;
export type AuthorizationQueryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};
type Frontier = Awaited<ReturnType<typeof loadPlatformPrivilegeMigrationFrontier>>;
type Source = Frontier["committed"][number];
type History = Parameters<typeof assertPlatformPrivilegeMigrationFrontier>[1];
export type AuthorizationImpact = {
  legacy_pairs: number;
  preserved_pairs: number;
  missing_pairs: number;
  scoped_pairs: number;
};
type ErrorCode =
  | "configuration_invalid"
  | "main_validation_failed"
  | "source_invalid"
  | "history_invalid"
  | "lock_unavailable"
  | "impact_invalid"
  | "access_preservation_failed"
  | "catalog_invalid"
  | "history_write_failed"
  | "transaction_failed"
  | "repair_not_ready"
  | "repair_failed"
  | "scope_not_ready"
  | "scope_failed"
  | "commit_uncertain"
  | "cleanup_failed"
  | "operation_failed";

class AuthorizationError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = "TenantManagementAuthorizationError";
  }
}

export function formatSafeTenantManagementAuthorizationError(error: unknown): string {
  const code = error instanceof AuthorizationError ? error.code : "operation_failed";
  return `${TENANT_MANAGEMENT_AUTHORIZATION_VERSION}: ${code}`;
}

export function parseTenantManagementAuthorizationArgs(
  argv: string[],
): TenantManagementAuthorizationOptions {
  let mode: Mode | null = null;
  let expectedSha = "";
  let seenSha = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (["--check", "--diagnose", "--apply"].includes(argument ?? "")) {
      if (mode) throw new AuthorizationError("configuration_invalid");
      mode = argument!.slice(2) as Mode;
    } else if (argument === "--expected-sha" && !seenSha) {
      seenSha = true;
      expectedSha = argv[++index] ?? "";
    } else {
      throw new AuthorizationError("configuration_invalid");
    }
  }
  if (!mode || (mode !== "check" && !SHA_PATTERN.test(expectedSha)) ||
      (seenSha && !SHA_PATTERN.test(expectedSha))) {
    throw new AuthorizationError("configuration_invalid");
  }
  return { mode, expectedSha };
}

export function validateTenantManagementAuthorizationConfig(
  options: TenantManagementAuthorizationOptions,
  environment: Environment,
): string[] {
  if (options.mode === "check") return [];
  const errors: string[] = [];
  const expected: Record<string, string> = {
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REF_NAME: "main",
    GITHUB_REPOSITORY: "veele-services/platform",
    EXPECTED_SUPABASE_PROJECT_REF: TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF,
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
    FIELDGRID_TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION:
      TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION,
    DB_SSL: "true",
    DB_SSL_REJECT_UNAUTHORIZED: "true",
    PGSSLMODE: "verify-full",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (environment[key] !== value) errors.push(`${key} is invalid`);
  }
  if (!SHA_PATTERN.test(options.expectedSha) || environment.GITHUB_SHA !== options.expectedSha) {
    errors.push("reviewed main SHA is invalid");
  }
  if (!["diagnose", "apply"].includes(options.mode)) errors.push("operation is invalid");
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"]) {
    if (!RUN_PATTERN.test(environment[key] ?? "")) errors.push(`${key} is invalid`);
  }
  const publicUrl = `https://${TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF}.supabase.co`;
  if (![publicUrl, `${publicUrl}/`].includes(environment.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
    errors.push("Supabase origin is invalid");
  }
  if (!isAbsolute(environment.FIELDGRID_DATABASE_SSL_ROOT_CERT ?? "")) {
    errors.push("pinned TLS certificate path is invalid");
  }
  try {
    const runtimeUrl = environment.DATABASE_URL ?? "";
    const migrationUrl = environment.FIELDGRID_MIGRATION_DATABASE_URL ?? "";
    if ([runtimeUrl, migrationUrl].some((url) => databaseProjectRef(url) !== TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF)) {
      throw new Error("project mismatch");
    }
    const identity = (value: string) => {
      const url = new URL(value);
      const role = decodeURIComponent(url.username);
      return {
        url,
        role: url.hostname.endsWith(".pooler.supabase.com")
          ? role.replace(`.${TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF}`, "") : role,
        password: decodeURIComponent(url.password),
      };
    };
    const runtime = identity(runtimeUrl);
    const migration = identity(migrationUrl);
    if (runtime.role !== "fieldgrid_runtime_app" || !runtime.password || !migration.password ||
        !migration.role || migration.role === runtime.role || migration.password === runtime.password ||
        migration.url.port !== "5432" || !runtime.url.pathname.slice(1) || !migration.url.pathname.slice(1)) {
      throw new Error("connection mismatch");
    }
    // The canonical connection module rechecks these boundaries and validates
    // the exact pinned certificate before opening the dedicated connection.
  } catch {
    errors.push("migration connection configuration is invalid");
  }
  return errors;
}

export function assertSuccessfulTenantManagementValidationRun(value: unknown, expectedSha: string): void {
  if (!value || typeof value !== "object") throw new AuthorizationError("main_validation_failed");
  const response = value as { total_count?: unknown; workflow_runs?: unknown };
  if (!Number.isSafeInteger(response.total_count) || (response.total_count as number) < 1 ||
      (response.total_count as number) > 100 || !Array.isArray(response.workflow_runs) ||
      response.workflow_runs.length !== response.total_count) throw new AuthorizationError("main_validation_failed");
  const runs = response.workflow_runs as Array<Record<string, unknown>>;
  const matches = runs.filter((run) => run.head_sha === expectedSha && run.head_branch === "main" &&
    run.path === ".github/workflows/main-exact-head-validation.yml" &&
    run.name === "Main Exact Head Validation" && ["push", "workflow_dispatch"].includes(String(run.event)) &&
    (run.head_repository as { full_name?: string } | undefined)?.full_name === "veele-services/platform");
  if (matches.length === 0 || matches.some((run) => !Number.isSafeInteger(run.id))) {
    throw new AuthorizationError("main_validation_failed");
  }
  matches.sort((left, right) => (right.id as number) - (left.id as number));
  if (matches[0]?.status !== "completed" || matches[0]?.conclusion !== "success") {
    throw new AuthorizationError("main_validation_failed");
  }
}

export async function verifyTenantManagementAuthorizationMainHead(
  expectedSha: string,
  operation: "diagnose" | "apply",
  environment: Environment = process.env,
  request: typeof fetch = fetch,
): Promise<void> {
  if (!SHA_PATTERN.test(expectedSha) || environment.GITHUB_REPOSITORY !== "veele-services/platform" ||
      !environment.GITHUB_TOKEN || !["diagnose", "apply"].includes(operation)) {
    throw new AuthorizationError("configuration_invalid");
  }
  const apiRoot = "https://api.github.com/repos/veele-services/platform";
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${environment.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  try {
    const head = await request(`${apiRoot}/git/ref/heads/main`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!head.ok || (await head.json() as { object?: { sha?: string } }).object?.sha !== expectedSha) {
      throw new Error("head mismatch");
    }
    if (operation === "apply") {
      const runs = await request(
        `${apiRoot}/actions/workflows/main-exact-head-validation.yml/runs?branch=main&head_sha=${expectedSha}&per_page=100`,
        { headers, signal: AbortSignal.timeout(15_000) },
      );
      if (!runs.ok) throw new Error("validation unavailable");
      assertSuccessfulTenantManagementValidationRun(await runs.json(), expectedSha);
    }
  } catch { throw new AuthorizationError("main_validation_failed"); }
}

export function tenantManagementAuthorizationFrontier(
  base: Frontier, source: Source, repair: Source,
): Frontier {
  const index = base.committed.findIndex((entry) => entry.name === TENANT_MANAGEMENT_MIGRATION_NAME);
  const policyIndex = index - 1;
  const policySource = base.committed[policyIndex];
  const committedSource = base.committed[index];
  const committedRepair = base.committed[index + 1];
  const exactSource = (candidate: Source, committed: Source | undefined, name: string) =>
    candidate.name === name && HASH_PATTERN.test(candidate.hash) &&
    candidate.hash === createHash("sha256").update(candidate.sql.replaceAll("\r\n", "\n")).digest("hex") &&
    committed?.hash === candidate.hash && committed.sql === candidate.sql &&
    base.committed.filter((entry) => entry.name === name).length === 1;
  // This is one reviewed suffix, not an extensible pending-migration runner.
  if (index < 1 || policySource?.name !== TENANT_MANAGEMENT_POLICY_RECONCILIATION_MIGRATION_NAME ||
      policySource.hash !== TENANT_MANAGEMENT_POLICY_RECONCILIATION_MIGRATION_HASH ||
      !exactSource(source, committedSource, TENANT_MANAGEMENT_MIGRATION_NAME) ||
      !exactSource(repair, committedRepair, TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME) ||
      base.committed.length !== index + 2) {
    throw new AuthorizationError("source_invalid");
  }
  return {
    ...base,
    predecessors: base.committed.slice(0, policyIndex),
    required: [policySource, committedSource!, committedRepair!],
    successors: new Set(),
  };
}

export function assertTenantManagementAuthorizationHistory(frontier: Frontier, records: History): Source[] {
  try {
    const committed = new Map(frontier.committed.map((entry) => [entry.name, entry]));
    for (const record of records) {
      const exactHash = committed.get(record.name)?.hash ?? frontier.historical.get(record.name)?.hash;
      // Unlike the platform repair, even a reconcilable hash must already match.
      if (!exactHash || record.hash !== exactHash || typeof record.baselined !== "boolean") {
        throw new Error("history mismatch");
      }
    }
    const pending = assertPlatformPrivilegeMigrationFrontier(frontier, records);
    const allowedPendingNames = new Set(frontier.required.map((entry) => entry.name));
    if (frontier.required.length !== 3 ||
        ![0, 1, 3].includes(pending.length) ||
        pending.some((entry) => !allowedPendingNames.has(entry.name)) ||
        (pending.length === 1 && pending[0]?.name !== TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME)) {
      throw new Error("unbounded migration request");
    }
    return pending;
  } catch {
    throw new AuthorizationError("history_invalid");
  }
}

export function sanitizeTenantManagementAuthorizationImpact(value: unknown): AuthorizationImpact {
  if (!value || typeof value !== "object") throw new AuthorizationError("impact_invalid");
  const input = value as Record<string, unknown>;
  const result = {} as AuthorizationImpact;
  for (const key of ["legacy_pairs", "preserved_pairs", "missing_pairs", "scoped_pairs"] as const) {
    const count = input[key];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new AuthorizationError("impact_invalid");
    }
    result[key] = count;
  }
  if (result.preserved_pairs + result.missing_pairs !== result.legacy_pairs ||
      result.preserved_pairs > result.scoped_pairs) throw new AuthorizationError("impact_invalid");
  return result;
}

export type RepairReadiness = {
  legacyDefinitionMatches: boolean;
  cleanDefinitionMatches: boolean;
  targetDefinitionMatches: boolean;
  dependenciesValid: boolean;
};
export type AuthorizationDependencies = {
  loadFrontier: () => Promise<Frontier>;
  loadSource: () => Promise<Source>;
  loadRepairSource: () => Promise<Source>;
  verifyScopeContract: (queryable: AuthorizationQueryable) => Promise<boolean>;
  verifyScopeCatalog: (queryable: AuthorizationQueryable) => Promise<boolean>;
  verifyRepairCatalog: (queryable: AuthorizationQueryable) => Promise<boolean>;
  readRepairReadiness: (queryable: AuthorizationQueryable) => Promise<RepairReadiness>;
  readScopeReadiness: (queryable: AuthorizationQueryable) => Promise<{ readyForApply: boolean }>;
  readImpact: (queryable: AuthorizationQueryable) => Promise<unknown>;
  readDriftDiagnostic?: (queryable: AuthorizationQueryable) => Promise<unknown>;
};
const defaultDependencies: AuthorizationDependencies = {
  loadFrontier: loadPlatformPrivilegeMigrationFrontier,
  loadSource: loadTenantManagementAuthorizationSource,
  loadRepairSource: loadTenantManagementPolicyRepairSource,
  verifyScopeContract: verifyTenantManagementScopeContract,
  verifyScopeCatalog: verifyTenantManagementScopeCatalog,
  verifyRepairCatalog: verifyTenantManagementPolicyRepairCatalog,
  readRepairReadiness: readTenantManagementPolicyRepairReadiness,
  readScopeReadiness: async (queryable) => {
    // Defer the import: the legacy diagnostic also imports dispatch guards from
    // this runner. Only call it before the canonical scope has been installed.
    const { readTenantManagementSqlDiagnostic } = await import(
      "./fieldgrid-staging-tenant-management-sql-diagnostic.mts"
    );
    return readTenantManagementSqlDiagnostic(queryable);
  },
  readImpact: readTenantManagementAuthorizationImpact,
  readDriftDiagnostic: readTenantManagementPolicyDriftDiagnostic,
};

export type AuthorizationState = "legacy-state" | "clean-state" | "repaired-state" | "canonical-state" | "unknown-state";
export type AuthorizationResult = {
  result: "diagnosed" | "applied" | "already-applied";
  state: AuthorizationState;
  migrationRecorded: boolean;
  scopeMigrationRecorded: boolean;
  repairMigrationRecorded: boolean;
  contractVerified: boolean;
  readyForApply: boolean;
  readyForPrerequisiteRepair: boolean;
  repairReadiness: RepairReadiness;
  impact: AuthorizationImpact;
  catalogChecks?: { scopeContractMatches: boolean; scopeCatalogMatches: boolean; repairCatalogMatches: boolean };
  driftDiagnostic?: TenantManagementPolicyDriftDiagnostic;
};

function contractBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AuthorizationError("catalog_invalid");
  return value;
}

function repairReadiness(value: unknown): RepairReadiness {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AuthorizationError("catalog_invalid");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 4 ||
      Object.keys(input).some((key) => !["legacyDefinitionMatches", "cleanDefinitionMatches", "targetDefinitionMatches", "dependenciesValid"].includes(key))) {
    throw new AuthorizationError("catalog_invalid");
  }
  const result = {
    legacyDefinitionMatches: contractBoolean(input.legacyDefinitionMatches),
    cleanDefinitionMatches: contractBoolean(input.cleanDefinitionMatches),
    targetDefinitionMatches: contractBoolean(input.targetDefinitionMatches),
    dependenciesValid: contractBoolean(input.dependenciesValid),
  };
  if ([result.legacyDefinitionMatches, result.cleanDefinitionMatches, result.targetDefinitionMatches]
    .filter(Boolean).length > 1) throw new AuthorizationError("catalog_invalid");
  return result;
}

async function scopeReadiness(queryable: AuthorizationQueryable, dependencies: AuthorizationDependencies): Promise<boolean> {
  const value = await dependencies.readScopeReadiness(queryable);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AuthorizationError("catalog_invalid");
  return contractBoolean(value.readyForApply);
}

// SHARE blocks grant/membership changes while allowing ordinary reads. The
// migration takes its own catalog locks and repeats its preservation guards.
const AUTHORIZATION_LOCKS = `LOCK TABLE
  public.platform_users, public.role_permissions, public.roles, public.tenant_role_permissions,
  public.tenant_roles, public.tenant_user_roles, public.tenant_users,
  public.tenants, public.user_roles IN SHARE MODE`;

// Preserve the existing authorization order, then lock the repair relations
// alphabetically. Policy tables also serialize concurrent policy DDL.
const POLICY_REPAIR_LOCKS = `LOCK TABLE public.invoices IN SHARE MODE;
LOCK TABLE public.object_contacts, public.object_personnel IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.objects IN SHARE MODE;
LOCK TABLE public.payments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.personnel IN SHARE MODE`;

export async function runTenantManagementAuthorization(
  queryable: AuthorizationQueryable,
  operation: "diagnose" | "apply",
  dependencies: AuthorizationDependencies = defaultDependencies,
): Promise<AuthorizationResult> {
  let locked = false;
  let transactionStarted = false;
  let stage: ErrorCode = "source_invalid";
  try {
    if (operation !== "diagnose" && operation !== "apply") throw new AuthorizationError("configuration_invalid");
    const [base, source, repair] = await Promise.all([
      dependencies.loadFrontier(), dependencies.loadSource(), dependencies.loadRepairSource(),
    ]);
    const frontier = tenantManagementAuthorizationFrontier(base, source, repair);
    stage = "lock_unavailable";
    const lock = await queryable.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
      [DATABASE_MIGRATION_LOCK_KEY],
    );
    if (lock.rows.length !== 1 || lock.rows[0]?.acquired !== true) throw new AuthorizationError(stage);
    locked = true;
    stage = "transaction_failed";
    await queryable.query(operation === "diagnose"
      ? "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
      : "BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE");
    transactionStarted = true;
    await queryable.query("SET LOCAL lock_timeout = '5s'");
    await queryable.query("SET LOCAL statement_timeout = '120s'");
    stage = "history_invalid";
    if (operation === "apply") {
      await queryable.query("LOCK TABLE drizzle.veele_sql_migrations IN SHARE ROW EXCLUSIVE MODE");
      await queryable.query(AUTHORIZATION_LOCKS);
      await queryable.query(POLICY_REPAIR_LOCKS);
    }
    const readHistory = async () => (await queryable.query<History[number]>(
      `SELECT name, hash, baselined, applied_at AS "appliedAt"
         FROM drizzle.veele_sql_migrations ORDER BY applied_at, name`,
    )).rows;
    const pending = assertTenantManagementAuthorizationHistory(frontier, await readHistory());
    const scopeRecorded = pending.length < 3;
    const repairRecorded = pending.length === 0;
    stage = "catalog_invalid";
    const scopeInstalled = contractBoolean(await dependencies.verifyScopeContract(queryable));
    const scopeCatalog = contractBoolean(await dependencies.verifyScopeCatalog(queryable));
    const readiness = repairReadiness(await dependencies.readRepairReadiness(queryable));
    const repairCanonical = contractBoolean(await dependencies.verifyRepairCatalog(queryable));
    // A clean sorted installation reaches the repair after the historical pair.
    // An installed scope never makes reintroduced legacy policies repairable.
    const catalogConsistent = scopeInstalled === scopeRecorded && scopeCatalog === scopeRecorded &&
      repairCanonical === readiness.targetDefinitionMatches && (!scopeRecorded ||
        (readiness.dependenciesValid && (readiness.cleanDefinitionMatches || repairCanonical) &&
          (!repairRecorded || repairCanonical)));
    if (!catalogConsistent && operation === "apply") throw new AuthorizationError(stage);
    stage = "impact_invalid";
    const before = sanitizeTenantManagementAuthorizationImpact(await dependencies.readImpact(queryable));
    const preserved = before.missing_pairs === 0 && before.preserved_pairs === before.legacy_pairs;
    stage = "catalog_invalid";
    const rawScopeReady = scopeRecorded || !catalogConsistent ? false : await scopeReadiness(queryable, dependencies);
    const readyForApply = catalogConsistent && !scopeRecorded && preserved && readiness.dependenciesValid &&
      repairCanonical && rawScopeReady;
    const acceptedRepairDefinition = scopeRecorded
      ? readiness.cleanDefinitionMatches || readiness.targetDefinitionMatches
      : readiness.legacyDefinitionMatches || readiness.targetDefinitionMatches;
    const readyForPrerequisiteRepair = catalogConsistent && !repairRecorded && readiness.dependenciesValid &&
      acceptedRepairDefinition && (scopeRecorded || preserved);
    const installed = catalogConsistent && scopeInstalled && repairCanonical && repairRecorded;
    const state: AuthorizationState = !catalogConsistent || !readiness.dependenciesValid ||
      (!readiness.legacyDefinitionMatches && !readiness.cleanDefinitionMatches && !readiness.targetDefinitionMatches)
      ? "unknown-state" : installed ? "canonical-state"
      : readiness.cleanDefinitionMatches ? "clean-state"
      : repairCanonical ? "repaired-state" : "legacy-state";
    const result = (kind: AuthorizationResult["result"], impact = before): AuthorizationResult => ({
      result: kind, state, migrationRecorded: repairRecorded, scopeMigrationRecorded: scopeRecorded,
      repairMigrationRecorded: repairRecorded, contractVerified: installed,
      readyForApply, readyForPrerequisiteRepair, repairReadiness: readiness, impact,
    });
    if (operation === "diagnose" || pending.length === 0) {
      // Even apply/already-applied is a non-mutating postcheck.
      const diagnosed = result(operation === "diagnose" ? "diagnosed" : "already-applied");
      if (operation === "diagnose" && state === "unknown-state") {
        // Explain only an already-blocked state, in the same read-only snapshot.
        // These observations never participate in either readiness decision.
        diagnosed.catalogChecks = { scopeContractMatches: scopeInstalled,
          scopeCatalogMatches: scopeCatalog, repairCatalogMatches: repairCanonical };
        if (dependencies.readDriftDiagnostic) {
          diagnosed.driftDiagnostic = sanitizeTenantManagementPolicyDriftDiagnostic(
            await dependencies.readDriftDiagnostic(queryable),
          );
        }
      }
      await queryable.query("ROLLBACK");
      transactionStarted = false;
      return diagnosed;
    }
    if (!scopeRecorded && !preserved) throw new AuthorizationError("access_preservation_failed");
    if (!readyForPrerequisiteRepair) throw new AuthorizationError("repair_not_ready");
    // Explicit prerequisite execution; journal order remains chronological.
    stage = "repair_failed";
    await queryable.query(sqlForManagedMigrationTransaction(repair.sql));
    if (contractBoolean(await dependencies.verifyRepairCatalog(queryable)) !== true) throw new AuthorizationError(stage);
    if (!scopeRecorded) {
      stage = "scope_not_ready";
      if (!await scopeReadiness(queryable, dependencies)) throw new AuthorizationError(stage);
      stage = "repair_failed";
      await queryable.query(sqlForManagedMigrationTransaction(frontier.required[0]!.sql));
      stage = "scope_not_ready";
      if (!await scopeReadiness(queryable, dependencies)) throw new AuthorizationError(stage);
      stage = "scope_failed";
      await queryable.query(sqlForManagedMigrationTransaction(source.sql));
    }
    stage = "catalog_invalid";
    if (!contractBoolean(await dependencies.verifyScopeCatalog(queryable)) ||
        !contractBoolean(await dependencies.verifyRepairCatalog(queryable))) throw new AuthorizationError(stage);
    stage = "impact_invalid";
    const after = sanitizeTenantManagementAuthorizationImpact(await dependencies.readImpact(queryable));
    if (Object.keys(before).some((key) => before[key as keyof AuthorizationImpact] !== after[key as keyof AuthorizationImpact])) {
      throw new AuthorizationError("access_preservation_failed");
    }
    stage = "history_write_failed";
    for (const migration of pending) {
      const recorded = await queryable.query<{ name: string; hash: string; baselined: boolean }>(
        `INSERT INTO drizzle.veele_sql_migrations (name, hash, baselined)
         VALUES ($1, $2, false) RETURNING name, hash, baselined`,
        [migration.name, migration.hash],
      );
      if (recorded.rowCount !== 1 || recorded.rows.length !== 1 ||
          recorded.rows[0]?.name !== migration.name || recorded.rows[0]?.hash !== migration.hash ||
          recorded.rows[0]?.baselined !== false) throw new AuthorizationError(stage);
    }
    stage = "history_invalid";
    if (assertTenantManagementAuthorizationHistory(frontier, await readHistory()).length !== 0) throw new AuthorizationError(stage);
    stage = "catalog_invalid";
    if (!contractBoolean(await dependencies.verifyScopeContract(queryable)) ||
        !contractBoolean(await dependencies.verifyScopeCatalog(queryable)) ||
        !contractBoolean(await dependencies.verifyRepairCatalog(queryable))) throw new AuthorizationError(stage);
    stage = "commit_uncertain";
    await queryable.query("COMMIT");
    transactionStarted = false;
    stage = "cleanup_failed";
    return {
      result: "applied", state: "canonical-state", migrationRecorded: true,
      scopeMigrationRecorded: true, repairMigrationRecorded: true, contractVerified: true,
      readyForApply: false, readyForPrerequisiteRepair: false,
      repairReadiness: {
        legacyDefinitionMatches: false, cleanDefinitionMatches: false,
        targetDefinitionMatches: true, dependenciesValid: true,
      },
      impact: after,
    };
  } catch (error) {
    if (transactionStarted) {
      try { await queryable.query("ROLLBACK"); }
      catch { throw new AuthorizationError(stage === "commit_uncertain" ? stage : "cleanup_failed"); }
    }
    throw error instanceof AuthorizationError ? error : new AuthorizationError(stage);
  } finally {
    if (locked) {
      try {
        const unlocked = await queryable.query<{ released: boolean }>(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released",
          [DATABASE_MIGRATION_LOCK_KEY],
        );
        if (unlocked.rows.length !== 1 || unlocked.rows[0]?.released !== true) throw new Error("unlock failed");
      } catch { throw new AuthorizationError(stage === "commit_uncertain" ? stage : "cleanup_failed"); }
    }
  }
}

type DatabaseModule = {
  pool: {
    connect: () => Promise<AuthorizationQueryable & { release: (error?: boolean) => void }>;
    end: () => Promise<void>;
  };
};

// Return evidence only after both cleanup operations have been attempted.
export async function runTenantManagementAuthorizationSession(
  database: DatabaseModule,
  operation: "diagnose" | "apply",
  dependencies: AuthorizationDependencies = defaultDependencies,
): Promise<AuthorizationResult> {
  let client: Awaited<ReturnType<DatabaseModule["pool"]["connect"]>> | undefined;
  let operationError: unknown;
  try {
    client = await database.pool.connect();
    return await runTenantManagementAuthorization(client, operation, dependencies);
  } catch (error) {
    operationError = error instanceof AuthorizationError ? error : new AuthorizationError("operation_failed");
    throw operationError;
  } finally {
    let cleanupFailed = false;
    try { client?.release(true); } catch { cleanupFailed = true; }
    try { await database.pool.end(); } catch { cleanupFailed = true; }
    if (cleanupFailed) {
      if (operationError instanceof AuthorizationError && operationError.code === "commit_uncertain") throw operationError;
      throw new AuthorizationError("cleanup_failed");
    }
  }
}

async function main(): Promise<void> {
  const options = parseTenantManagementAuthorizationArgs(process.argv.slice(2));
  if (options.mode === "check") {
    const [base, source, repair] = await Promise.all([
      defaultDependencies.loadFrontier(), defaultDependencies.loadSource(), defaultDependencies.loadRepairSource(),
    ]);
    tenantManagementAuthorizationFrontier(base, source, repair);
    console.log(`${TENANT_MANAGEMENT_AUTHORIZATION_VERSION}: static checks passed`);
    return;
  }
  const environment = process.env;
  if (validateTenantManagementAuthorizationConfig(options, environment).length > 0) {
    throw new AuthorizationError("configuration_invalid");
  }
  const startedAt = new Date().toISOString();
  let result: AuthorizationResult | null = null;
  let errorCode: ErrorCode | null = null;
  try {
    await verifyTenantManagementAuthorizationMainHead(options.expectedSha, options.mode, environment);
    // Import only after dispatch/project/purpose validation; never load Auth APIs.
    const database = await import(pathToFileURL(join(repoRoot, "lib/db/src/connection.ts")).href) as DatabaseModule;
    result = await runTenantManagementAuthorizationSession(database, options.mode);
  } catch (error) {
    errorCode = error instanceof AuthorizationError ? error.code : "operation_failed";
    throw new AuthorizationError(errorCode);
  } finally {
    const directory = join(repoRoot, "artifacts", "tenant-management-authorization");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const path = join(directory, `${options.mode}-${environment.GITHUB_RUN_ID}-${environment.GITHUB_RUN_ATTEMPT}.json`);
    await writeFile(path, JSON.stringify({
      schemaVersion: 2,
      contract: TENANT_MANAGEMENT_AUTHORIZATION_VERSION,
      environment: "staging",
      operation: options.mode,
      expectedMainSha: options.expectedSha,
      migrationNames: [TENANT_MANAGEMENT_POLICY_RECONCILIATION_MIGRATION_NAME,
        TENANT_MANAGEMENT_MIGRATION_NAME, TENANT_MANAGEMENT_POLICY_REPAIR_MIGRATION_NAME],
      status: result ? "passed" : "failed",
      result,
      errorCode,
      startedAt,
      completedAt: new Date().toISOString(),
    }, null, 2) + "\n", { mode: 0o600 });
    await chmod(path, 0o600);
  }
  console.log(`${TENANT_MANAGEMENT_AUTHORIZATION_VERSION}: ${result!.result}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(formatSafeTenantManagementAuthorizationError(error));
    process.exitCode = 1;
  });
}
