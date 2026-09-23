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

function report(value: Record<string, unknown>): void {
  if (process.send) process.send(value);
  else process.stdout.write(`FIELDGRID_WORKER:${JSON.stringify(value)}\n`);
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
report({
  state: "ready",
  pid: row.pid,
  role: row.role_name,
});

let recoveryPassword: string | undefined;
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
          report({ state: "armed" });
        } else if (command === "run") {
          const database = drizzle(client, { schema });
          await migrateWithClient(client);
          await seedRbac(database);
          await seedSectors(database);
          report({ state: "migrated" });
        } else if (command === "release") {
          recoveryPassword = undefined;
          report({ state: "released" });
          resolve();
        } else if (command === "recover-release") {
          await restoreCredential();
          report({ state: "released" });
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
  report({
    state: "failed",
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
