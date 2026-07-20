import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONFIRMATION = "phase2e-fast-forward-staging";
export const SOURCE_BRANCH = "main";
export const TARGET_BRANCH = "staging";
export const REMOTE = "origin";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FORBIDDEN_UPDATE_ARGUMENTS = new Set(["--force", "--force-with-lease"]);

export function isFullSha(value) {
  return /^[0-9a-f]{40}$/u.test(value ?? "");
}

function takeValue(argv, index, argument) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${argument} requires a value`);
  return value;
}

export function parseArgs(argv) {
  const options = {
    check: false,
    run: false,
    source: SOURCE_BRANCH,
    target: TARGET_BRANCH,
    approvedMain: "",
    expectedStaging: "",
    confirmation: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const argumentName = argument.split("=", 1)[0];
    if (FORBIDDEN_UPDATE_ARGUMENTS.has(argumentName))
      throw new Error(
        `${argumentName} is forbidden by the staging promotion contract`,
      );

    switch (argument) {
      case "--check":
        options.check = true;
        break;
      case "--run":
        options.run = true;
        break;
      case "--source":
        options.source = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--target":
        options.target = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--approved-main":
        options.approvedMain = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--expected-staging":
        options.expectedStaging = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--confirm":
        options.confirmation = takeValue(argv, index, argument);
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${argument}`);
    }
  }

  return options;
}

export function assertPromotionContract(
  options,
  { requireRunInputs = true } = {},
) {
  if (options.source !== SOURCE_BRANCH) {
    if (options.source.startsWith("release/"))
      throw new Error(
        "release branches are forbidden as a staging promotion source",
      );
    throw new Error(`promotion source must be ${SOURCE_BRANCH}`);
  }
  if (options.target === "production")
    throw new Error("production is forbidden as a Phase 2E promotion target");
  if (options.target !== TARGET_BRANCH)
    throw new Error(`promotion target must be ${TARGET_BRANCH}`);

  if (!requireRunInputs) return true;
  if (!isFullSha(options.approvedMain))
    throw new Error(
      "--approved-main must be a lowercase 40-character commit SHA",
    );
  if (!isFullSha(options.expectedStaging))
    throw new Error(
      "--expected-staging must be a lowercase 40-character commit SHA",
    );
  if (options.confirmation !== CONFIRMATION)
    throw new Error(`--confirm must equal ${CONFIRMATION}`);
  return true;
}

function gitResult(repoDir, args) {
  return spawnSync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function git(repoDir, args) {
  const result = gitResult(repoDir, args);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (
      result.stderr ||
      result.stdout ||
      "Git command failed"
    ).trim();
    throw new Error(detail);
  }
  return result.stdout.trim();
}

export function buildPushArgs(approvedMain) {
  if (!isFullSha(approvedMain)) throw new Error("approved main SHA is invalid");
  return ["push", REMOTE, `${approvedMain}:refs/heads/${TARGET_BRANCH}`];
}

function assertExactRef(actual, expected, branch) {
  if (actual !== expected)
    throw new Error(
      `origin/${branch} changed: expected ${expected}, received ${actual}`,
    );
}

export function promoteExactMainToStaging(
  options,
  { repoDir = repoRoot } = {},
) {
  assertPromotionContract(options);

  git(repoDir, [
    "fetch",
    "--prune",
    REMOTE,
    `refs/heads/${SOURCE_BRANCH}:refs/remotes/${REMOTE}/${SOURCE_BRANCH}`,
    `refs/heads/${TARGET_BRANCH}:refs/remotes/${REMOTE}/${TARGET_BRANCH}`,
  ]);

  const currentMain = git(repoDir, [
    "rev-parse",
    `refs/remotes/${REMOTE}/${SOURCE_BRANCH}`,
  ]);
  const currentStaging = git(repoDir, [
    "rev-parse",
    `refs/remotes/${REMOTE}/${TARGET_BRANCH}`,
  ]);
  assertExactRef(currentMain, options.approvedMain, SOURCE_BRANCH);
  assertExactRef(currentStaging, options.expectedStaging, TARGET_BRANCH);

  const ancestor = gitResult(repoDir, [
    "merge-base",
    "--is-ancestor",
    options.expectedStaging,
    options.approvedMain,
  ]);
  if (ancestor.error) throw ancestor.error;
  if (ancestor.status !== 0)
    throw new Error(
      "expected staging SHA is not an ancestor of the approved main SHA",
    );

  git(repoDir, buildPushArgs(options.approvedMain));

  const remoteLine = git(repoDir, [
    "ls-remote",
    "--exit-code",
    REMOTE,
    `refs/heads/${TARGET_BRANCH}`,
  ]);
  const promotedStaging = remoteLine.split(/\s+/u)[0];
  assertExactRef(promotedStaging, options.approvedMain, TARGET_BRANCH);

  return {
    approvedMain: options.approvedMain,
    previousStaging: options.expectedStaging,
    promotedStaging,
    source: SOURCE_BRANCH,
    target: TARGET_BRANCH,
  };
}

function usage() {
  return [
    "Fieldgrid Phase 2E exact-ref staging promotion",
    "",
    "Usage:",
    "  pnpm fieldgrid:phase2e-staging-promote:check",
    "  pnpm fieldgrid:phase2e-staging-promote --run \\",
    "    --approved-main SHA --expected-staging SHA \\",
    `    --confirm ${CONFIRMATION}`,
    "",
    "The run fetches only main and staging, verifies both exact refs and their",
    "fast-forward relationship, then performs one normal push of the approved main",
    "SHA to staging. Production is never a target.",
    "",
  ].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (options.check === options.run)
    throw new Error("choose exactly one of --check or --run");
  assertPromotionContract(options, { requireRunInputs: options.run });
  if (options.check) {
    process.stdout.write(
      "[fieldgrid:phase2e-staging-promote] PASS: main to staging, exact-ref, fast-forward-only contract\n",
    );
    return;
  }

  const result = promoteExactMainToStaging(options);
  process.stdout.write(
    `[fieldgrid:phase2e-staging-promote] PASS: staging moved from ${result.previousStaging} to ${result.promotedStaging}\n`,
  );
}

if (resolve(process.argv[1] ?? "") === resolve(scriptPath)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `[fieldgrid:phase2e-staging-promote] FAIL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
