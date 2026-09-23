import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const { Client } = require("pg");
const source = new URL(process.env.DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(source.hostname) ||
  source.pathname !== "/fieldgrid_runtime_safety"
) {
  throw new Error(
    "twice-clean test requires the guarded local fieldgrid_runtime_safety database",
  );
}

const databaseNames = [
  "fieldgrid_disposable_rebuild_one",
  "fieldgrid_disposable_rebuild_two",
];

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with status ${result.status}`);
}

const admin = new Client({ connectionString: source.toString() });
await admin.connect();
try {
  for (const databaseName of databaseNames) {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1",
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const target = new URL(source);
    target.pathname = `/${databaseName}`;
    const env = {
      ...process.env,
      DATABASE_URL: target.toString(),
      FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET: "1",
      FIELDGRID_RUNTIME_SAFETY_RESET_CONFIRM: databaseName,
    };
    run("pnpm", ["fieldgrid:runtime-safety:setup"], env);
    run(
      "pnpm",
      ["--filter", "@workspace/db", "exec", "tsx", "src/seed/rbac.ts"],
      env,
    );
    run(
      "pnpm",
      ["--filter", "@workspace/db", "exec", "tsx", "src/seed/sectors.ts"],
      env,
    );
    run(
      process.execPath,
      ["scripts/fieldgrid-disposable-staging-postgres17.mjs"],
      env,
    );
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1",
      [databaseName],
    );
    await admin.query(`DROP DATABASE ${databaseName}`);
  }
} finally {
  for (const databaseName of databaseNames) {
    await admin
      .query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1",
        [databaseName],
      )
      .catch(() => {});
    await admin
      .query(`DROP DATABASE IF EXISTS ${databaseName}`)
      .catch(() => {});
  }
  await admin.end();
}
