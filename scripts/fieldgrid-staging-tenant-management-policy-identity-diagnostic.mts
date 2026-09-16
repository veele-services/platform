#!/usr/bin/env node
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type AuthorizationQueryable,
  validateTenantManagementAuthorizationConfig,
  verifyTenantManagementAuthorizationMainHead,
} from "./fieldgrid-staging-tenant-management-authorization.mts";

export const TENANT_MANAGEMENT_POLICY_IDENTITY_DIAGNOSTIC_VERSION =
  "fieldgrid-staging-tenant-management-policy-identity-diagnostic-v1";

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u;
const MAX_UNKNOWN_POLICY_CONSUMERS = 10;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type Mode = "check" | "diagnose";
type DiagnosticErrorCode =
  | "configuration_invalid"
  | "main_validation_failed"
  | "diagnostic_failed"
  | "too_many_consumers"
  | "cleanup_failed"
  | "operation_failed";

class PolicyIdentityDiagnosticError extends Error {
  constructor(readonly code: DiagnosticErrorCode) {
    super(code);
    this.name = "TenantManagementPolicyIdentityDiagnosticError";
  }
}

export type UnknownPolicyConsumerIdentity = {
  schema: string;
  table: string;
  policy: string;
};

export type TenantManagementPolicyIdentityDiagnosticResult = {
  unknownConsumerCount: number;
  identities: UnknownPolicyConsumerIdentity[];
};

export function parseTenantManagementPolicyIdentityDiagnosticArgs(argv: string[]): {
  mode: Mode;
  expectedSha: string;
} {
  let mode: Mode | null = null;
  let expectedSha = "";
  let seenSha = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check" || argument === "--diagnose") {
      if (mode) throw new PolicyIdentityDiagnosticError("configuration_invalid");
      mode = argument.slice(2) as Mode;
    } else if (argument === "--expected-sha" && !seenSha) {
      seenSha = true;
      expectedSha = argv[++index] ?? "";
    } else {
      throw new PolicyIdentityDiagnosticError("configuration_invalid");
    }
  }
  if (!mode || (mode === "diagnose" && !SHA_PATTERN.test(expectedSha)) ||
      (mode === "check" && seenSha)) {
    throw new PolicyIdentityDiagnosticError("configuration_invalid");
  }
  return { mode, expectedSha };
}

export function tenantManagementPolicyIdentityDiagnosticSql(): string {
  return `
    SELECT
      schemaname AS schema,
      tablename AS table,
      policyname AS policy
    FROM pg_policies
    WHERE (
      coalesce(qual, '') ~ '\\mis_management[[:space:]]*\\('
      OR coalesce(with_check, '') ~ '\\mis_management[[:space:]]*\\('
      OR coalesce(qual, '') ~ '\\muser_roles\\M'
      OR coalesce(with_check, '') ~ '\\muser_roles\\M'
    )
    AND NOT (
      schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname IN (
        'user_roles_select_own',
        'user_roles_insert_management',
        'user_roles_delete_management'
      )
    )
    ORDER BY schemaname, tablename, policyname
    LIMIT ${MAX_UNKNOWN_POLICY_CONSUMERS + 1}
  `;
}

function safeIdentifier(value: unknown): string {
  if (typeof value !== "string" || !SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new PolicyIdentityDiagnosticError("diagnostic_failed");
  }
  return value;
}

export function sanitizeUnknownPolicyConsumerIdentities(
  rows: unknown,
): TenantManagementPolicyIdentityDiagnosticResult {
  if (!Array.isArray(rows)) {
    throw new PolicyIdentityDiagnosticError("diagnostic_failed");
  }
  if (rows.length > MAX_UNKNOWN_POLICY_CONSUMERS) {
    throw new PolicyIdentityDiagnosticError("too_many_consumers");
  }
  const identities = rows.map((row) => {
    if (!row || typeof row !== "object") {
      throw new PolicyIdentityDiagnosticError("diagnostic_failed");
    }
    const input = row as Record<string, unknown>;
    return {
      schema: safeIdentifier(input.schema),
      table: safeIdentifier(input.table),
      policy: safeIdentifier(input.policy),
    };
  });
  const distinct = new Set(
    identities.map(({ schema, table, policy }) => `${schema}\u0000${table}\u0000${policy}`),
  );
  if (distinct.size !== identities.length) {
    throw new PolicyIdentityDiagnosticError("diagnostic_failed");
  }
  return { unknownConsumerCount: identities.length, identities };
}

export async function readTenantManagementPolicyIdentityDiagnostic(
  queryable: AuthorizationQueryable,
): Promise<TenantManagementPolicyIdentityDiagnosticResult> {
  const response = await queryable.query<Record<string, unknown>>(
    tenantManagementPolicyIdentityDiagnosticSql(),
  );
  if (response.rows.length > MAX_UNKNOWN_POLICY_CONSUMERS) {
    throw new PolicyIdentityDiagnosticError("too_many_consumers");
  }
  return sanitizeUnknownPolicyConsumerIdentities(response.rows);
}

export async function runTenantManagementPolicyIdentityDiagnostic(
  queryable: AuthorizationQueryable,
): Promise<TenantManagementPolicyIdentityDiagnosticResult> {
  let transactionStarted = false;
  try {
    await queryable.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    transactionStarted = true;
    await queryable.query("SET LOCAL statement_timeout = '30s'");
    const result = await readTenantManagementPolicyIdentityDiagnostic(queryable);
    await queryable.query("ROLLBACK");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await queryable.query("ROLLBACK");
      } catch {
        throw new PolicyIdentityDiagnosticError("cleanup_failed");
      }
    }
    throw error instanceof PolicyIdentityDiagnosticError
      ? error
      : new PolicyIdentityDiagnosticError("diagnostic_failed");
  }
}

export function formatSafeTenantManagementPolicyIdentityDiagnosticError(
  error: unknown,
): string {
  const code = error instanceof PolicyIdentityDiagnosticError
    ? error.code
    : "operation_failed";
  return `${TENANT_MANAGEMENT_POLICY_IDENTITY_DIAGNOSTIC_VERSION}: ${code}`;
}

type DatabaseModule = {
  pool: {
    connect: () => Promise<AuthorizationQueryable & { release: (error?: boolean) => void }>;
    end: () => Promise<void>;
  };
};

async function main(): Promise<void> {
  const options = parseTenantManagementPolicyIdentityDiagnosticArgs(
    process.argv.slice(2),
  );
  if (options.mode === "check") {
    tenantManagementPolicyIdentityDiagnosticSql();
    console.log(
      `${TENANT_MANAGEMENT_POLICY_IDENTITY_DIAGNOSTIC_VERSION}: static checks passed`,
    );
    return;
  }

  const environment = process.env;
  const configErrors = validateTenantManagementAuthorizationConfig(
    { mode: "diagnose", expectedSha: options.expectedSha },
    environment,
  );
  if (configErrors.length > 0 ||
      environment.FIELDGRID_TENANT_MANAGEMENT_POLICY_IDENTITY_CONFIRMATION !==
        TENANT_MANAGEMENT_POLICY_IDENTITY_DIAGNOSTIC_VERSION) {
    throw new PolicyIdentityDiagnosticError("configuration_invalid");
  }

  const startedAt = new Date().toISOString();
  let database: DatabaseModule | undefined;
  let client: Awaited<ReturnType<DatabaseModule["pool"]["connect"]>> | undefined;
  let result: TenantManagementPolicyIdentityDiagnosticResult | null = null;
  let errorCode: DiagnosticErrorCode | null = null;
  try {
    try {
      await verifyTenantManagementAuthorizationMainHead(
        options.expectedSha,
        "diagnose",
        environment,
      );
    } catch {
      throw new PolicyIdentityDiagnosticError("main_validation_failed");
    }
    database = await import(
      pathToFileURL(join(repoRoot, "lib/db/src/connection.ts")).href
    ) as DatabaseModule;
    client = await database.pool.connect();
    result = await runTenantManagementPolicyIdentityDiagnostic(client);
  } catch (error) {
    errorCode = error instanceof PolicyIdentityDiagnosticError
      ? error.code
      : "operation_failed";
    throw new PolicyIdentityDiagnosticError(errorCode);
  } finally {
    client?.release(true);
    await database?.pool.end();
    const directory = join(
      repoRoot,
      "artifacts",
      "tenant-management-policy-identity-diagnostic",
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
        contract: TENANT_MANAGEMENT_POLICY_IDENTITY_DIAGNOSTIC_VERSION,
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

  console.log(
    `${TENANT_MANAGEMENT_POLICY_IDENTITY_DIAGNOSTIC_VERSION}: diagnosed`,
  );
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(formatSafeTenantManagementPolicyIdentityDiagnosticError(error));
    process.exitCode = 1;
  });
}
