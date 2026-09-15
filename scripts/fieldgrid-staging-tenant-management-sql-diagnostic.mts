#!/usr/bin/env node
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION,
  TENANT_MANAGEMENT_AUTHORIZATION_VERSION,
  type AuthorizationQueryable,
  validateTenantManagementAuthorizationConfig,
  verifyTenantManagementAuthorizationMainHead,
} from "./fieldgrid-staging-tenant-management-authorization.mts";

export const TENANT_MANAGEMENT_SQL_DIAGNOSTIC_VERSION =
  "fieldgrid-staging-tenant-management-sql-diagnostic-v1";

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scopeMigration = readFileSync(
  new URL(
    "../lib/db/migrations/20260914125503_scope_tenant_management_authorization.sql",
    import.meta.url,
  ),
  "utf8",
).replaceAll("\r\n", "\n");

function taggedBody(tag: string): string {
  const parts = scopeMigration.split(`$${tag}$`);
  if (parts.length !== 3) throw new Error("ambiguous diagnostic source contract");
  return parts[1]!;
}

const legacyTenantHelperBody = taggedBody("legacy_body");

type Mode = "check" | "diagnose";
type DiagnosticErrorCode =
  | "configuration_invalid"
  | "main_validation_failed"
  | "diagnostic_failed"
  | "cleanup_failed"
  | "operation_failed";

class DiagnosticError extends Error {
  constructor(readonly code: DiagnosticErrorCode) {
    super(code);
    this.name = "TenantManagementSqlDiagnosticError";
  }
}

export type TenantManagementSqlDiagnostic = {
  user_roles_table_present: boolean;
  policy_consumer_count: number;
  recognized_policy_consumer_count: number;
  user_roles_policy_count: number;
  unknown_policy_consumer_count: number;
  platform_permission_helper_exact: boolean;
  can_manage_user_roles_policies: boolean;
  private_canonical_helper_present: boolean;
  legacy_tenant_helper_exact: boolean;
  assignment_material_usage_policy_present: boolean;
  legacy_function_consumer_count: number;
  legacy_rule_consumer_count: number;
  can_create_private_helper: boolean;
};

export type TenantManagementSqlBlocker =
  | "user_roles_table_missing"
  | "unknown_policy_consumer"
  | "legacy_user_roles_policy_drift"
  | "platform_permission_helper_drift"
  | "user_roles_policy_ownership_invalid"
  | "private_helper_already_present"
  | "legacy_tenant_helper_drift"
  | "assignment_material_usage_policy_present"
  | "legacy_function_consumer_present"
  | "legacy_rule_consumer_present"
  | "app_private_create_unavailable";

export type TenantManagementSqlDiagnosticResult = {
  diagnostics: TenantManagementSqlDiagnostic;
  blockers: TenantManagementSqlBlocker[];
  likelyFailurePhase: "policy-reconciliation" | "tenant-scope" | "none";
  readyForApply: boolean;
};

export function parseTenantManagementSqlDiagnosticArgs(argv: string[]): {
  mode: Mode;
  expectedSha: string;
} {
  let mode: Mode | null = null;
  let expectedSha = "";
  let seenSha = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check" || argument === "--diagnose") {
      if (mode) throw new DiagnosticError("configuration_invalid");
      mode = argument.slice(2) as Mode;
    } else if (argument === "--expected-sha" && !seenSha) {
      seenSha = true;
      expectedSha = argv[++index] ?? "";
    } else {
      throw new DiagnosticError("configuration_invalid");
    }
  }
  if (!mode || (mode === "diagnose" && !SHA_PATTERN.test(expectedSha)) ||
      (mode === "check" && seenSha)) {
    throw new DiagnosticError("configuration_invalid");
  }
  return { mode, expectedSha };
}

export function tenantManagementSqlDiagnosticSql(): string {
  return `
    WITH policy_counts AS (
      SELECT
        count(*) FILTER (
          WHERE coalesce(qual, '') ~ '\\mis_management[[:space:]]*\\('
             OR coalesce(with_check, '') ~ '\\mis_management[[:space:]]*\\('
             OR coalesce(qual, '') ~ '\\muser_roles\\M'
             OR coalesce(with_check, '') ~ '\\muser_roles\\M'
        )::integer AS policy_consumer_count,
        count(*) FILTER (
          WHERE (
            coalesce(qual, '') ~ '\\mis_management[[:space:]]*\\('
            OR coalesce(with_check, '') ~ '\\mis_management[[:space:]]*\\('
            OR coalesce(qual, '') ~ '\\muser_roles\\M'
            OR coalesce(with_check, '') ~ '\\muser_roles\\M'
          )
          AND schemaname = 'public'
          AND tablename = 'user_roles'
          AND policyname IN (
            'user_roles_select_own',
            'user_roles_insert_management',
            'user_roles_delete_management'
          )
        )::integer AS recognized_policy_consumer_count,
        count(*) FILTER (
          WHERE schemaname = 'public'
            AND tablename = 'user_roles'
            AND policyname IN (
              'user_roles_select_own',
              'user_roles_insert_management',
              'user_roles_delete_management'
            )
        )::integer AS user_roles_policy_count,
        EXISTS (
          SELECT 1 FROM pg_policies named_policy
          WHERE named_policy.policyname = 'assignment_material_usage_backoffice_all'
        ) AS assignment_material_usage_policy_present
      FROM pg_policies
    ), function_counts AS (
      SELECT count(*)::integer AS legacy_function_consumer_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND p.prosrc ~ '\\mis_management[[:space:]]*\\('
    ), rule_counts AS (
      SELECT count(*)::integer AS legacy_rule_consumer_count
      FROM pg_rewrite r
      JOIN pg_class c ON c.oid = r.ev_class
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND pg_get_ruledef(r.oid) ~ '\\mis_management[[:space:]]*\\('
    )
    SELECT
      to_regclass('public.user_roles') IS NOT NULL AS user_roles_table_present,
      policy_counts.policy_consumer_count,
      policy_counts.recognized_policy_consumer_count,
      policy_counts.user_roles_policy_count,
      (policy_counts.policy_consumer_count -
        policy_counts.recognized_policy_consumer_count)::integer AS unknown_policy_consumer_count,
      EXISTS (
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
          AND p.proowner = (
            SELECT relowner FROM pg_class
            WHERE oid = to_regclass('public.platform_users')
          )
          AND pg_has_role(current_user, p.proowner, 'MEMBER')
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
          AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
          AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      ) AS platform_permission_helper_exact,
      coalesce(pg_has_role(
        current_user,
        (SELECT relowner FROM pg_class WHERE oid = to_regclass('public.user_roles')),
        'MEMBER'
      ), false) AS can_manage_user_roles_policies,
      to_regprocedure(
        'app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)'
      ) IS NOT NULL AS private_canonical_helper_present,
      EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_language l ON l.oid = p.prolang
        WHERE p.oid = to_regprocedure('public.is_management_for_tenant(uuid)')
          AND p.prosrc = $1::text
          AND p.prosecdef
          AND p.provolatile = 's'
          AND l.lanname = 'sql'
          AND p.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
          AND p.prorettype = 'boolean'::regtype
          AND NOT p.proretset
          AND p.proargnames = ARRAY['p_tenant_id']
          AND p.pronargdefaults = 0
          AND p.prokind = 'f'
          AND p.proparallel = 'u'
          AND NOT p.proisstrict
          AND NOT p.proleakproof
          AND p.proowner = (
            SELECT relowner FROM pg_class
            WHERE oid = to_regclass('public.tenant_users')
          )
          AND pg_has_role(current_user, p.proowner, 'MEMBER')
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
          AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
          AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
          AND NOT EXISTS (
            SELECT 1
            FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
            WHERE acl.grantee NOT IN (p.proowner, 'authenticated'::regrole)
          )
      ) AS legacy_tenant_helper_exact,
      policy_counts.assignment_material_usage_policy_present,
      function_counts.legacy_function_consumer_count,
      rule_counts.legacy_rule_consumer_count,
      CASE
        WHEN to_regnamespace('app_private') IS NULL THEN false
        ELSE has_schema_privilege(current_user, 'app_private', 'CREATE')
      END AS can_create_private_helper
    FROM policy_counts, function_counts, rule_counts
  `;
}

export function sanitizeTenantManagementSqlDiagnostic(
  value: unknown,
): TenantManagementSqlDiagnostic {
  if (!value || typeof value !== "object") {
    throw new DiagnosticError("diagnostic_failed");
  }
  const input = value as Record<string, unknown>;
  const booleans = [
    "user_roles_table_present",
    "platform_permission_helper_exact",
    "can_manage_user_roles_policies",
    "private_canonical_helper_present",
    "legacy_tenant_helper_exact",
    "assignment_material_usage_policy_present",
    "can_create_private_helper",
  ] as const;
  const counts = [
    "policy_consumer_count",
    "recognized_policy_consumer_count",
    "user_roles_policy_count",
    "unknown_policy_consumer_count",
    "legacy_function_consumer_count",
    "legacy_rule_consumer_count",
  ] as const;
  const result = {} as TenantManagementSqlDiagnostic;
  for (const key of booleans) {
    if (typeof input[key] !== "boolean") throw new DiagnosticError("diagnostic_failed");
    result[key] = input[key] as boolean;
  }
  for (const key of counts) {
    const count = input[key];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new DiagnosticError("diagnostic_failed");
    }
    result[key] = count;
  }
  if (result.recognized_policy_consumer_count > result.policy_consumer_count ||
      result.unknown_policy_consumer_count !==
        result.policy_consumer_count - result.recognized_policy_consumer_count) {
    throw new DiagnosticError("diagnostic_failed");
  }
  return result;
}

export function tenantManagementSqlDiagnosticBlockers(
  diagnostics: TenantManagementSqlDiagnostic,
): TenantManagementSqlBlocker[] {
  const blockers: TenantManagementSqlBlocker[] = [];
  if (!diagnostics.user_roles_table_present) blockers.push("user_roles_table_missing");
  if (diagnostics.unknown_policy_consumer_count > 0) blockers.push("unknown_policy_consumer");
  if (diagnostics.policy_consumer_count > 0 && diagnostics.user_roles_policy_count !== 3) {
    blockers.push("legacy_user_roles_policy_drift");
  }
  if (diagnostics.policy_consumer_count > 0 && !diagnostics.platform_permission_helper_exact) {
    blockers.push("platform_permission_helper_drift");
  }
  if (diagnostics.policy_consumer_count > 0 && !diagnostics.can_manage_user_roles_policies) {
    blockers.push("user_roles_policy_ownership_invalid");
  }
  if (diagnostics.private_canonical_helper_present) blockers.push("private_helper_already_present");
  if (!diagnostics.legacy_tenant_helper_exact) blockers.push("legacy_tenant_helper_drift");
  if (diagnostics.assignment_material_usage_policy_present) {
    blockers.push("assignment_material_usage_policy_present");
  }
  if (diagnostics.legacy_function_consumer_count > 0) blockers.push("legacy_function_consumer_present");
  if (diagnostics.legacy_rule_consumer_count > 0) blockers.push("legacy_rule_consumer_present");
  if (!diagnostics.can_create_private_helper) blockers.push("app_private_create_unavailable");
  return blockers;
}

export function classifyTenantManagementSqlDiagnostic(
  diagnostics: TenantManagementSqlDiagnostic,
): TenantManagementSqlDiagnosticResult {
  const blockers = tenantManagementSqlDiagnosticBlockers(diagnostics);
  const policyBlockers = new Set<TenantManagementSqlBlocker>([
    "user_roles_table_missing",
    "unknown_policy_consumer",
    "legacy_user_roles_policy_drift",
    "platform_permission_helper_drift",
    "user_roles_policy_ownership_invalid",
  ]);
  return {
    diagnostics,
    blockers,
    likelyFailurePhase: blockers.some((blocker) => policyBlockers.has(blocker))
      ? "policy-reconciliation"
      : blockers.length > 0
        ? "tenant-scope"
        : "none",
    readyForApply: blockers.length === 0,
  };
}

export async function readTenantManagementSqlDiagnostic(
  queryable: AuthorizationQueryable,
): Promise<TenantManagementSqlDiagnosticResult> {
  const response = await queryable.query<Record<string, unknown>>(
    tenantManagementSqlDiagnosticSql(),
    [legacyTenantHelperBody],
  );
  if (response.rows.length !== 1) throw new DiagnosticError("diagnostic_failed");
  return classifyTenantManagementSqlDiagnostic(
    sanitizeTenantManagementSqlDiagnostic(response.rows[0]),
  );
}

export async function runTenantManagementSqlDiagnostic(
  queryable: AuthorizationQueryable,
): Promise<TenantManagementSqlDiagnosticResult> {
  let transactionStarted = false;
  try {
    await queryable.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    transactionStarted = true;
    await queryable.query("SET LOCAL statement_timeout = '30s'");
    const result = await readTenantManagementSqlDiagnostic(queryable);
    await queryable.query("ROLLBACK");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await queryable.query("ROLLBACK");
      } catch {
        throw new DiagnosticError("cleanup_failed");
      }
    }
    throw error instanceof DiagnosticError
      ? error
      : new DiagnosticError("diagnostic_failed");
  }
}

export function formatSafeTenantManagementSqlDiagnosticError(error: unknown): string {
  const code = error instanceof DiagnosticError ? error.code : "operation_failed";
  return `${TENANT_MANAGEMENT_SQL_DIAGNOSTIC_VERSION}: ${code}`;
}

type DatabaseModule = {
  pool: {
    connect: () => Promise<AuthorizationQueryable & { release: (error?: boolean) => void }>;
    end: () => Promise<void>;
  };
};

async function main(): Promise<void> {
  const options = parseTenantManagementSqlDiagnosticArgs(process.argv.slice(2));
  if (options.mode === "check") {
    tenantManagementSqlDiagnosticSql();
    taggedBody("legacy_body");
    console.log(`${TENANT_MANAGEMENT_SQL_DIAGNOSTIC_VERSION}: static checks passed`);
    return;
  }

  const environment = process.env;
  const configErrors = validateTenantManagementAuthorizationConfig(
    { mode: "diagnose", expectedSha: options.expectedSha },
    environment,
  );
  if (configErrors.length > 0 ||
      environment.FIELDGRID_TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION !==
        TENANT_MANAGEMENT_AUTHORIZATION_CONFIRMATION) {
    throw new DiagnosticError("configuration_invalid");
  }

  const startedAt = new Date().toISOString();
  let database: DatabaseModule | undefined;
  let client: Awaited<ReturnType<DatabaseModule["pool"]["connect"]>> | undefined;
  let result: TenantManagementSqlDiagnosticResult | null = null;
  let errorCode: DiagnosticErrorCode | null = null;
  try {
    try {
      await verifyTenantManagementAuthorizationMainHead(
        options.expectedSha,
        "diagnose",
        environment,
      );
    } catch {
      throw new DiagnosticError("main_validation_failed");
    }
    database = await import(
      pathToFileURL(join(repoRoot, "lib/db/src/connection.ts")).href
    ) as DatabaseModule;
    client = await database.pool.connect();
    result = await runTenantManagementSqlDiagnostic(client);
  } catch (error) {
    errorCode = error instanceof DiagnosticError ? error.code : "operation_failed";
    throw new DiagnosticError(errorCode);
  } finally {
    client?.release(true);
    await database?.pool.end();
    const directory = join(
      repoRoot,
      "artifacts",
      "tenant-management-sql-diagnostic",
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const path = join(
      directory,
      `diagnose-${environment.GITHUB_RUN_ID}-${environment.GITHUB_RUN_ATTEMPT}.json`,
    );
    await writeFile(
      path,
      `${JSON.stringify({
        schemaVersion: 1,
        contract: TENANT_MANAGEMENT_SQL_DIAGNOSTIC_VERSION,
        authorizationContract: TENANT_MANAGEMENT_AUTHORIZATION_VERSION,
        environment: "staging",
        operation: "diagnose",
        expectedMainSha: options.expectedSha,
        status: result ? "passed" : "failed",
        result,
        errorCode,
        startedAt,
        completedAt: new Date().toISOString(),
      }, null, 2)}\n`,
      { mode: 0o600 },
    );
    await chmod(path, 0o600);
  }
  console.log(`${TENANT_MANAGEMENT_SQL_DIAGNOSTIC_VERSION}: diagnosed`);
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(formatSafeTenantManagementSqlDiagnosticError(error));
    process.exitCode = 1;
  });
}
