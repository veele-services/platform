#!/usr/bin/env node
import { join } from "node:path";
import { connect, databaseUrl, writeJsonArtifact, writeTextArtifact } from "./fieldgrid-runtime-safety-lib.mjs";

async function main() {
  const startedAt = new Date().toISOString();
  const shouldReset = process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET === "1";
  const client = await connect();
  try {
    if (shouldReset) {
      await client.query(`
        drop schema if exists public cascade;
        drop schema if exists drizzle cascade;
        drop schema if exists auth cascade;
        drop schema if exists storage cascade;
        create schema public;
        grant usage, create on schema public to public;
      `);
    }

    await writeJsonArtifact(join("reports", "teardown.json"), {
      name: "runtime-safety-teardown",
      status: "passed",
      startedAt,
      completedAt: new Date().toISOString(),
      databaseHost: new URL(databaseUrl()).hostname,
      resetPerformed: shouldReset,
      note: shouldReset
        ? "Disposable schemas were dropped and public was recreated."
        : "No destructive cleanup was performed. Set FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET=1 only for disposable local databases.",
    });
  } finally {
    await client.end();
  }
}

main().catch(async (error) => {
  await writeTextArtifact(
    join("logs", "teardown-error.log"),
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
