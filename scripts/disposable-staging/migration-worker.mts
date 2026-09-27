import { createRequire } from "node:module";

import { databaseConnectionConfig } from "../../lib/db/src/database-environment";
import { migrateWithClient } from "../../lib/db/src/migrate";
import { seedRbac } from "../../lib/db/src/seed/rbac";
import { seedSectors } from "../../lib/db/src/seed/sectors";
import * as schema from "../../lib/db/src/schema";

const require = createRequire(
  new URL("../../lib/db/package.json", import.meta.url),
);
const { drizzle } =
  require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
const pg = require("pg") as typeof import("pg");
const { Client } = pg;
const connection = databaseConnectionConfig("migration");
const client = new Client({
  ...connection,
  application_name: "fieldgrid-disposable-staging-migration-worker",
});

async function report(value: Record<string, unknown>): Promise<void> {
  if (process.send) {
    await new Promise<void>((resolve, reject) => {
      process.send?.(value, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(
      `FIELDGRID_WORKER:${JSON.stringify(value)}\n`,
      (error) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

const SAFE_MIGRATION_FAILURE_STAGES = new Set([
  "prepare-bridge",
  "ensure-history",
  "schema-guard",
  "drizzle",
  "legacy-prerequisites",
  "sql",
  "finalize-bridge",
  "abort-bridge-cleanup",
  "seed-rbac",
  "seed-sectors",
]);
const SAFE_DATABASE_FAILURE_CODES = new Set([
  "hosted_migration_bridge_principal_invalid",
  "hosted_migration_bridge_requires_empty_application_schemas",
  "hosted_migration_bridge_history_missing",
  "hosted_migration_bridge_auth_snapshot_missing",
  "hosted_migration_bridge_obsolete_auth_trigger_present",
  "hosted_migration_bridge_storage_catalog_missing",
  "hosted_migration_bridge_storage_not_empty",
  "hosted_migration_bridge_unknown_storage_policy",
  "hosted_migration_bridge_required_table_missing",
  "hosted_migration_bridge_constraint_drift",
  "Hosted migration bridge mode is invalid.",
  "Hosted migration bridge is missing.",
]);

function errorChain(error: unknown): unknown[] {
  const queue: unknown[] = [error];
  const result: unknown[] = [];
  const visited = new Set<unknown>();
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);
    result.push(candidate);
    if (candidate instanceof AggregateError) queue.push(...candidate.errors);
    if ("cause" in candidate)
      queue.push((candidate as { cause?: unknown }).cause);
  }
  return result;
}

function safeFailureStage(error: unknown, fallback: string): string {
  const reported =
    error && typeof error === "object" && "migrationFailureStage" in error
      ? (error as { migrationFailureStage?: unknown }).migrationFailureStage
      : undefined;
  return typeof reported === "string" &&
    SAFE_MIGRATION_FAILURE_STAGES.has(reported)
    ? reported
    : fallback;
}

function safeSqlState(error: unknown): string | undefined {
  for (const candidate of errorChain(error)) {
    const code = (candidate as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code)) return code;
  }
  return undefined;
}

function safeMigrationName(error: unknown): string | undefined {
  for (const candidate of errorChain(error)) {
    const name = (candidate as { migrationFailureName?: unknown })
      .migrationFailureName;
    if (
      typeof name === "string" &&
      /^[0-9A-Za-z][0-9A-Za-z._-]{0,127}\.sql$/u.test(name)
    ) {
      return name;
    }
  }
  return undefined;
}

function safeDatabaseFailureCode(error: unknown): string | undefined {
  for (const candidate of errorChain(error)) {
    const message = (candidate as { message?: unknown }).message;
    if (
      typeof message === "string" &&
      SAFE_DATABASE_FAILURE_CODES.has(message)
    ) {
      return message
        .replaceAll(/[.]/gu, "")
        .replaceAll(/[ -]/gu, "_")
        .toUpperCase();
    }
  }
  return undefined;
}

await client.connect();
const identity = await client.query<{
  pid: number;
  role_name: string;
}>(`
  SELECT pg_backend_pid()::int AS pid,current_user::text AS role_name
  FROM pg_roles WHERE rolname=current_user
`);
const row = identity.rows[0];
if (!row) {
  throw new Error("MIGRATION_WORKER_ROLE_INVALID");
}
await report({
  state: "ready",
  pid: row.pid,
  role: row.role_name,
});

let recoveryPassword: string | undefined;
let activeFailureStage = "command";
async function restoreCredential(): Promise<void> {
  if (!recoveryPassword) return;
  await client.query(
    "SELECT set_config('fieldgrid.rebuild_role_password',$1,false)",
    [recoveryPassword],
  );
  try {
    await client.query(`
      DO $$
      BEGIN
        EXECUTE format(
          'ALTER ROLE %I PASSWORD %L',
          current_user,
          current_setting('fieldgrid.rebuild_role_password')
        );
      END
      $$
    `);
  } finally {
    await client.query("RESET fieldgrid.rebuild_role_password").catch(() => {});
  }
  recoveryPassword = undefined;
}

try {
  await new Promise<void>((resolve, reject) => {
    process.on("message", async (message) => {
      try {
        const command = (message as { command?: unknown })?.command;
        if (
          command === "arm" &&
          typeof (message as { originalPassword?: unknown })
            .originalPassword === "string"
        ) {
          recoveryPassword = (message as { originalPassword: string })
            .originalPassword;
          await report({ state: "armed" });
        } else if (command === "run") {
          const database = drizzle(client, { schema });
          activeFailureStage = "migrate";
          await migrateWithClient(client);
          activeFailureStage = "seed-rbac";
          await seedRbac(database);
          activeFailureStage = "seed-sectors";
          await seedSectors(database);
          await report({ state: "migrated" });
        } else if (command === "release") {
          recoveryPassword = undefined;
          await report({ state: "released" });
          resolve();
        } else if (command === "recover-release") {
          await restoreCredential();
          await report({ state: "released" });
          resolve();
        } else {
          throw new Error("MIGRATION_WORKER_COMMAND_INVALID");
        }
      } catch (error) {
        reject(error);
      }
    });
    process.once("disconnect", resolve);
  });
} catch (error) {
  await report({
    state: "failed",
    failureStage: safeFailureStage(error, activeFailureStage),
    sqlState: safeSqlState(error),
    migrationName: safeMigrationName(error),
    failureCode: safeDatabaseFailureCode(error),
    localCode:
      process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET === "1" &&
      error instanceof Error
        ? error.message
        : undefined,
  });
  throw error;
} finally {
  await restoreCredential().catch(() => {});
  await client.end().catch(() => {});
  process.disconnect?.();
}
