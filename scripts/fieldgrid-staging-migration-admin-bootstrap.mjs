#!/usr/bin/env node

import { resolve } from "node:path";

import { runApply, runPlan } from "./staging-migration-admin/runner.mjs";

function parseArgs(argv) {
  const modes = argv.filter(
    (value) => value === "--plan" || value === "--apply",
  );
  if (
    modes.length !== 1 ||
    argv.some(
      (value) => !modes.includes(value) && !value.startsWith("--output-dir="),
    )
  ) {
    throw new Error("choose exactly one of --plan or --apply");
  }
  return {
    mode: modes[0].slice(2),
    outputDir: argv
      .find((value) => value.startsWith("--output-dir="))
      ?.slice("--output-dir=".length),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result =
    options.mode === "plan" ? await runPlan(options) : await runApply(options);
  process.stdout.write(
    `[fieldgrid:staging-migration-admin-bootstrap] PASS: ${result.operation}:${result.status}\n`,
  );
}

if (
  resolve(process.argv[1] ?? "") === resolve(new URL(import.meta.url).pathname)
) {
  main().catch((error) => {
    process.stderr.write(
      `[fieldgrid:staging-migration-admin-bootstrap] FAIL: ${error?.code ?? "OPERATION_FAILED"}\n`,
    );
    process.exitCode = 1;
  });
}
