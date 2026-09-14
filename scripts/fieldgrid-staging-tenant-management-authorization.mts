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
  verifyTenantManagementAuthorizationContract,
} from "./fieldgrid-tenant-management-authorization-contract.mts";

export const TENANT_MANAGEMENT_AUTHORIZATION_VERSION =
  "fieldgrid-staging-tenant-management-authorization-v1";
export const TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION =
  TENANT_MANAGEMENT_AUTHORIZATION_VERSION;
export const TENANT_MANAGEMENT_AUTHORIZATION_PROJECT_REF = "olyfmekyqozxrbrwwszu";
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

export function tenantManagementAuthorizationFrontier(base: Frontier, source: Source): Frontier {
  const index = base.committed.findIndex((entry) => entry.name === TENANT_MANAGEMENT_MIGRATION_NAME);
  const committedSource = base.committed[index];
  const hash = createHash("sha256").update(source.sql.replaceAll("\r\n", "\n")).digest("hex");
  if (index < 0 || source.name !== TENANT_MANAGEMENT_MIGRATION_NAME ||
      !HASH_PATTERN.test(source.hash) || source.hash !== hash ||
      committedSource?.hash !== source.hash || committedSource.sql !== source.sql ||
      base.committed.filter((entry) => entry.name === source.name).length !== 1) {
    throw new AuthorizationError("source_invalid");
  }
  return {
    ...base,
    predecessors: base.committed.slice(0, index),
    required: [committedSource],
    successors: new Set(base.committed.slice(index + 1).map((entry) => entry.name)),
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
    if (pending.length > 1 || pending.some((entry) => entry.name !== TENANT_MANAGEMENT_MIGRATION_NAME)) {
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

type Dependencies = {
  loadFrontier: () => Promise<Frontier>;
  loadSource: () => Promise<Source>;
  verifyContract: (queryable: AuthorizationQueryable) => Promise<boolean>;
  readImpact: (queryable: AuthorizationQueryable) => Promise<unknown>;
};
const defaultDependencies: Dependencies = {
  loadFrontier: loadPlatformPrivilegeMigrationFrontier,
  loadSource: loadTenantManagementAuthorizationSource,
  verifyContract: verifyTenantManagementAuthorizationContract,
  readImpact: readTenantManagementAuthorizationImpact,
};

export type AuthorizationResult = {
  result: "diagnosed" | "applied" | "already-applied";
  migrationRecorded: boolean;
  contractVerified: boolean;
  impact: AuthorizationImpact;
};

// SHARE blocks grant/membership changes while allowing ordinary reads. The
// migration takes its own catalog locks and repeats its preservation guards.
const AUTHORIZATION_LOCKS = `LOCK TABLE
  public.platform_users, public.role_permissions, public.roles, public.tenant_role_permissions,
  public.tenant_roles, public.tenant_user_roles, public.tenant_users,
  public.tenants, public.user_roles IN SHARE MODE`;

export async function runTenantManagementAuthorization(
  queryable: AuthorizationQueryable,
  operation: "diagnose" | "apply",
  dependencies: Dependencies = defaultDependencies,
): Promise<AuthorizationResult> {
  let locked = false;
  let transactionStarted = false;
  let stage: ErrorCode = "source_invalid";
  try {
    if (operation !== "diagnose" && operation !== "apply") throw new AuthorizationError("configuration_invalid");
    const [base, source] = await Promise.all([dependencies.loadFrontier(), dependencies.loadSource()]);
    const frontier = tenantManagementAuthorizationFrontier(base, source);
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
    }
    const history = await queryable.query<History[number]>(
      `SELECT name, hash, baselined, applied_at AS "appliedAt"
         FROM drizzle.veele_sql_migrations ORDER BY applied_at, name`,
    );
    const pending = assertTenantManagementAuthorizationHistory(frontier, history.rows);
    stage = "catalog_invalid";
    const installed = await dependencies.verifyContract(queryable);
    if (typeof installed !== "boolean" || installed !== (pending.length === 0)) {
      throw new AuthorizationError(stage);
    }
    stage = "impact_invalid";
    const before = sanitizeTenantManagementAuthorizationImpact(await dependencies.readImpact(queryable));
    if (operation === "diagnose") {
      await queryable.query("ROLLBACK");
      transactionStarted = false;
      return { result: "diagnosed", migrationRecorded: pending.length === 0, contractVerified: installed, impact: before };
    }
    if (pending.length === 0) {
      await queryable.query("COMMIT");
      transactionStarted = false;
      return { result: "already-applied", migrationRecorded: true, contractVerified: true, impact: before };
    }
    if (before.missing_pairs !== 0) throw new AuthorizationError("access_preservation_failed");
    stage = "transaction_failed";
    await queryable.query(sqlForManagedMigrationTransaction(source.sql));
    stage = "impact_invalid";
    const after = sanitizeTenantManagementAuthorizationImpact(await dependencies.readImpact(queryable));
    if (Object.keys(before).some((key) => before[key as keyof AuthorizationImpact] !== after[key as keyof AuthorizationImpact])) {
      throw new AuthorizationError("access_preservation_failed");
    }
    stage = "history_write_failed";
    const recorded = await queryable.query<{ name: string; hash: string; baselined: boolean }>(
      `INSERT INTO drizzle.veele_sql_migrations (name, hash, baselined)
       VALUES ($1, $2, false) RETURNING name, hash, baselined`,
      [source.name, source.hash],
    );
    if (recorded.rowCount !== 1 || recorded.rows.length !== 1 ||
        recorded.rows[0]?.name !== source.name || recorded.rows[0]?.hash !== source.hash ||
        recorded.rows[0]?.baselined !== false) throw new AuthorizationError(stage);
    // The source-owned catalog contract also requires this exact journal hash.
    stage = "catalog_invalid";
    if (await dependencies.verifyContract(queryable) !== true) throw new AuthorizationError(stage);
    stage = "transaction_failed";
    await queryable.query("COMMIT");
    transactionStarted = false;
    return { result: "applied", migrationRecorded: true, contractVerified: true, impact: after };
  } catch (error) {
    if (transactionStarted) {
      try { await queryable.query("ROLLBACK"); }
      catch { throw new AuthorizationError("cleanup_failed"); }
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
      } catch { throw new AuthorizationError("cleanup_failed"); }
    }
  }
}

type DatabaseModule = {
  pool: {
    connect: () => Promise<AuthorizationQueryable & { release: (error?: boolean) => void }>;
    end: () => Promise<void>;
  };
};

async function main(): Promise<void> {
  const options = parseTenantManagementAuthorizationArgs(process.argv.slice(2));
  if (options.mode === "check") {
    const [base, source] = await Promise.all([
      loadPlatformPrivilegeMigrationFrontier(), loadTenantManagementAuthorizationSource(),
    ]);
    tenantManagementAuthorizationFrontier(base, source);
    console.log(`${TENANT_MANAGEMENT_AUTHORIZATION_VERSION}: static checks passed`);
    return;
  }
  const environment = process.env;
  if (validateTenantManagementAuthorizationConfig(options, environment).length > 0) {
    throw new AuthorizationError("configuration_invalid");
  }
  const startedAt = new Date().toISOString();
  let database: DatabaseModule | undefined;
  let client: Awaited<ReturnType<DatabaseModule["pool"]["connect"]>> | undefined;
  let result: AuthorizationResult | null = null;
  let errorCode: ErrorCode | null = null;
  try {
    await verifyTenantManagementAuthorizationMainHead(options.expectedSha, options.mode, environment);
    // Import only after dispatch/project/purpose validation; never load Auth APIs.
    database = await import(pathToFileURL(join(repoRoot, "lib/db/src/connection.ts")).href) as DatabaseModule;
    client = await database.pool.connect();
    result = await runTenantManagementAuthorization(client, options.mode);
  } catch (error) {
    errorCode = error instanceof AuthorizationError ? error.code : "operation_failed";
    throw new AuthorizationError(errorCode);
  } finally {
    // Always discard this dedicated connection, including uncertain rollback/commit.
    client?.release(true);
    await database?.pool.end();
    const directory = join(repoRoot, "artifacts", "tenant-management-authorization");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const path = join(directory, `${options.mode}-${environment.GITHUB_RUN_ID}-${environment.GITHUB_RUN_ATTEMPT}.json`);
    await writeFile(path, JSON.stringify({
      schemaVersion: 1,
      contract: TENANT_MANAGEMENT_AUTHORIZATION_VERSION,
      environment: "staging",
      operation: options.mode,
      expectedMainSha: options.expectedSha,
      migrationName: TENANT_MANAGEMENT_MIGRATION_NAME,
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
