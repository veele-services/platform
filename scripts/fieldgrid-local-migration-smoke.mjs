#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSelfContainedLocalMigrationSmoke } from "./fieldgrid-phase2e-staging-preflight.mjs";

function usage() {
  return `Fieldgrid self-contained local migration smoke

Usage:
  node scripts/fieldgrid-local-migration-smoke.mjs --run [--out artifacts/migration-smoke]

Runs both the application-empty and deterministic staging-compatibility targets
inside one disposable, unprivileged PostgreSQL 17 cluster. It never reads a
live or remote database URL.
`;
}

function parseArgs(argv) {
  const options = {
    run: false,
    help: false,
    outDir: resolve("artifacts/migration-smoke"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run") options.run = true;
    else if (argument === "--out" || argument === "--out-dir") {
      options.outDir = resolve(argv[++index] ?? "");
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help || !options.run) {
    process.stdout.write(usage());
    return 0;
  }
  const result = await runSelfContainedLocalMigrationSmoke(options);
  process.stdout.write(
    `[fieldgrid:local-migration-smoke] PASS; report ${result.artifact.path}\n`,
  );
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(
        `[fieldgrid:local-migration-smoke] ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
