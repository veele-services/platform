import { resolve } from "node:path";

import {
  finalizeRebuild,
  runPlan,
  runRebuild,
  safeStopRebuild,
} from "./disposable-staging/runner.mjs";

function parseArgs(argv) {
  const modes = argv.filter((value) =>
    ["--plan", "--rebuild", "--finalize", "--safe-stop"].includes(value),
  );
  if (
    modes.length !== 1 ||
    argv.some(
      (value) => !modes.includes(value) && !value.startsWith("--output-dir="),
    )
  ) {
    throw new Error(
      "choose exactly one mode and an optional --output-dir=PATH",
    );
  }
  const output = argv.find((value) => value.startsWith("--output-dir="));
  return {
    mode: modes[0].slice(2),
    outputDir: output?.slice("--output-dir=".length),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { mode, outputDir } = parseArgs(argv);
  const options = { outputDir, repoRoot: process.cwd() };
  const result =
    mode === "plan"
      ? await runPlan(options)
      : mode === "rebuild"
        ? await runRebuild(options)
        : mode === "finalize"
          ? await finalizeRebuild(options)
          : await safeStopRebuild(options);
  process.stdout.write(
    `[fieldgrid:disposable-staging-rebuild] PASS: ${result.mode}:${result.status ?? "planned"}\n`,
  );
}

if (
  resolve(process.argv[1] ?? "") === resolve(new URL(import.meta.url).pathname)
) {
  main().catch((error) => {
    process.stderr.write(
      `[fieldgrid:disposable-staging-rebuild] FAIL: ${error?.code ?? "OPERATION_FAILED"}\n`,
    );
    process.exitCode = 1;
  });
}
