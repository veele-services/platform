import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

const ansiPattern = /\u001b\[[0-9;]*m/g;

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function normalizeFailureName(value) {
  return String(value)
    .replace(ansiPattern, "")
    .replace(/\\/g, "/")
    .replace(/^\d{4}-\d{2}-\d{2}T\S+\s+/, "")
    .replace(/^\[[^\]]+\]\s+/, "")
    .replace(/^#\s*/, "")
    .replace(/^(?:✖|x)\s+/u, "")
    .replace(/^not ok\s+\d+\s+-\s+/u, "")
    .replace(/\s+#\s*time=\d+(?:\.\d+)?m?s\s*$/u, "")
    .replace(/\s+\(\d+(?:\.\d+)?m?s\)\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFailureNames(logText) {
  const failures = [];

  for (const rawLine of String(logText).split(/\r?\n/u)) {
    const line = rawLine.replace(ansiPattern, "").trim();
    if (!line) continue;

    const crossMatch = line.match(/(?:^|\s)✖\s+(.+)$/u);
    if (crossMatch) {
      const failure = normalizeFailureName(crossMatch[1]);
      if (failure.toLowerCase() !== "failing tests:") failures.push(failure);
      continue;
    }

    const tapMatch = line.match(/^not ok\s+\d+\s+-\s+(.+)$/u);
    if (tapMatch) {
      const failure = normalizeFailureName(tapMatch[1]);
      if (failure.toLowerCase() !== "failing tests:") failures.push(failure);
    }
  }

  return uniqueSorted(failures);
}

export function compareFailureSets(mainFailuresInput, candidateFailuresInput) {
  const mainFailures = uniqueSorted(
    mainFailuresInput.map(normalizeFailureName),
  );
  const candidateFailures = uniqueSorted(
    candidateFailuresInput.map(normalizeFailureName),
  );
  const mainSet = new Set(mainFailures);
  const candidateSet = new Set(candidateFailures);
  const commonFailures = candidateFailures.filter((failure) =>
    mainSet.has(failure),
  );
  const candidateOnlyFailures = candidateFailures.filter(
    (failure) => !mainSet.has(failure),
  );
  const mainOnlyFailures = mainFailures.filter(
    (failure) => !candidateSet.has(failure),
  );
  const candidateHasMoreFailures =
    candidateFailures.length > mainFailures.length;
  const pass = candidateOnlyFailures.length === 0 && !candidateHasMoreFailures;

  return {
    pass,
    mainFailures,
    candidateFailures,
    commonFailures,
    candidateOnlyFailures,
    mainOnlyFailures,
    counts: {
      mainFailures: mainFailures.length,
      candidateFailures: candidateFailures.length,
      commonFailures: commonFailures.length,
      candidateOnlyFailures: candidateOnlyFailures.length,
      mainOnlyFailures: mainOnlyFailures.length,
    },
    reasons: [
      ...(candidateOnlyFailures.length > 0
        ? ["candidate-only failures present"]
        : []),
      ...(candidateHasMoreFailures
        ? ["candidate has more failures than origin/main"]
        : []),
    ],
  };
}

export function extractTestRunSummary(logText) {
  const counts = {};
  const duplicateCounts = new Set();
  for (const rawLine of String(logText).split(/\r?\n/u)) {
    const line = rawLine.replace(ansiPattern, "").trim();
    const match = line.match(
      /^(?:ℹ|#)\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)$/u,
    );
    if (match) {
      if (match[1] in counts) duplicateCounts.add(match[1]);
      counts[match[1]] = Number(match[2]);
    }
  }

  const requiredCounts = [
    "tests",
    "pass",
    "fail",
    "cancelled",
    "skipped",
    "todo",
  ];
  const hasRequiredCounts = requiredCounts.every((name) =>
    Number.isSafeInteger(counts[name]),
  );
  const totalFromOutcomes = hasRequiredCounts
    ? counts.pass +
      counts.fail +
      counts.cancelled +
      counts.skipped +
      (counts.todo ?? 0)
    : null;
  const valid =
    hasRequiredCounts &&
    duplicateCounts.size === 0 &&
    totalFromOutcomes === counts.tests;
  return {
    valid,
    tests: counts.tests ?? null,
    pass: counts.pass ?? null,
    fail: counts.fail ?? null,
    cancelled: counts.cancelled ?? null,
    skipped: counts.skipped ?? null,
    todo: counts.todo ?? 0,
    executedTests: valid ? counts.pass + counts.fail : null,
  };
}

export function compareTestCoverage(
  mainSummary,
  candidateSummary,
  mainTestFiles = [],
  candidateTestFiles = [],
) {
  const candidateFiles = new Set(candidateTestFiles);
  const missingTestFiles = uniqueSorted(
    mainTestFiles.filter((path) => !candidateFiles.has(path)),
  );
  const reasons = [
    ...(!mainSummary?.valid
      ? ["origin/main test summary is missing or invalid"]
      : []),
    ...(!candidateSummary?.valid
      ? ["candidate test summary is missing or invalid"]
      : []),
  ];

  if (mainSummary?.valid && candidateSummary?.valid) {
    if (candidateSummary.executedTests < mainSummary.executedTests) {
      reasons.push("candidate executed fewer tests than origin/main");
    }
    if (candidateSummary.tests < mainSummary.tests) {
      reasons.push("candidate reported fewer total tests than origin/main");
    }
    if (candidateSummary.skipped > mainSummary.skipped) {
      reasons.push(
        "candidate skipped more tests than origin/main without an allowlist",
      );
    }
    if (candidateSummary.todo > mainSummary.todo) {
      reasons.push(
        "candidate reported more todo tests than origin/main without an allowlist",
      );
    }
    if (candidateSummary.cancelled > mainSummary.cancelled) {
      reasons.push("candidate cancelled more tests than origin/main");
    }
  }
  if (missingTestFiles.length > 0) {
    reasons.push("candidate root test files are not a superset of origin/main");
  }

  return {
    pass: reasons.length === 0,
    mainSummary,
    candidateSummary,
    mainTestFiles: uniqueSorted(mainTestFiles),
    candidateTestFiles: uniqueSorted(candidateTestFiles),
    missingTestFiles,
    reasons,
  };
}

function spawnCapture(command, args, options) {
  return new Promise((resolvePromise) => {
    const startedAt = new Date().toISOString();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      stderr += `${String(error)}\n`;
    });
    child.on("close", (status, signal) => {
      resolvePromise({
        command,
        args,
        cwd: options.cwd,
        status: status ?? 1,
        signal,
        stdout,
        stderr,
        output: `${stdout}\n${stderr}`,
        startedAt,
        completedAt: new Date().toISOString(),
      });
    });
  });
}

async function runLogged(command, args, options) {
  const result = await spawnCapture(command, args, options);
  await writeFile(
    options.logFile,
    [
      `$ ${command} ${args.join(" ")}`,
      `cwd: ${options.cwd}`,
      `status: ${result.status}`,
      `signal: ${result.signal ?? ""}`,
      "",
      "## stdout",
      result.stdout,
      "",
      "## stderr",
      result.stderr,
    ].join("\n"),
  );
  return result;
}

async function gitOutput(args, cwd) {
  const result = await spawnCapture("git", args, { cwd });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed with ${result.status}\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function failuresFromTestResult(result) {
  const failures = extractFailureNames(result.output);
  if (result.status !== 0 && failures.length === 0) {
    return ["root test lane exited nonzero without parsed failing test names"];
  }
  return failures;
}

function markdownList(values) {
  return values.length === 0
    ? "- none"
    : values.map((value) => `- ${value}`).join("\n");
}

async function listRootTestFiles(cwd) {
  const entries = await readdir(join(cwd, "tests"), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => `tests/${entry.name}`)
    .sort((a, b) => a.localeCompare(b));
}

export function shouldFetchOriginMain(environment = process.env) {
  const mode = environment.FIELDGRID_BASELINE_DIFF_USE_CHECKOUT_MAIN;
  if (mode === undefined || mode === "" || mode === "0") return true;
  if (mode === "1") return false;
  throw new Error("FIELDGRID_BASELINE_DIFF_USE_CHECKOUT_MAIN must be 0 or 1.");
}

export function shouldInstallCandidate(environment = process.env) {
  const mode = environment.FIELDGRID_BASELINE_DIFF_CANDIDATE_PREINSTALLED;
  if (mode === undefined || mode === "" || mode === "0") return true;
  if (mode === "1") return false;
  throw new Error(
    "FIELDGRID_BASELINE_DIFF_CANDIDATE_PREINSTALLED must be 0 or 1.",
  );
}

async function main() {
  const repoRoot = resolve(process.cwd());
  const defaultOutDir = join(
    repoRoot,
    "outputs",
    "fieldgrid-test-baseline-differential",
  );
  const outDir = resolve(
    process.env.FIELDGRID_BASELINE_DIFF_OUT_DIR ?? defaultOutDir,
  );
  await mkdir(outDir, { recursive: true });

  if (shouldFetchOriginMain()) {
    const fetchResult = await runLogged(
      "git",
      [
        "fetch",
        "--no-tags",
        "origin",
        "+refs/heads/main:refs/remotes/origin/main",
      ],
      {
        cwd: repoRoot,
        logFile: join(outDir, "git-fetch-origin-main.log"),
      },
    );
    if (fetchResult.status !== 0) {
      throw new Error(
        "Unable to fetch origin/main for baseline differential gate.",
      );
    }
  } else {
    const verifyResult = await runLogged(
      "git",
      ["rev-parse", "--verify", "origin/main^{commit}"],
      {
        cwd: repoRoot,
        logFile: join(outDir, "git-verify-origin-main.log"),
      },
    );
    if (verifyResult.status !== 0) {
      throw new Error("Checkout did not provide a valid origin/main baseline.");
    }
  }

  const originMainSha = await gitOutput(["rev-parse", "origin/main"], repoRoot);
  const candidateSha = await gitOutput(["rev-parse", "HEAD"], repoRoot);
  const baselineParent = await mkdtemp(
    join(tmpdir(), "fieldgrid-origin-main-baseline-"),
  );
  const mainWorktree = join(baselineParent, "origin-main");

  let mainInstall;
  let candidateInstall;
  let mainTest;
  let candidateTest;
  let candidateNodeVersion;
  let candidatePnpmVersion;
  let mainNodeVersion;
  let mainPnpmVersion;
  let mainTestFiles;
  let candidateTestFiles;

  try {
    const addWorktree = await runLogged(
      "git",
      ["worktree", "add", "--detach", mainWorktree, originMainSha],
      {
        cwd: repoRoot,
        logFile: join(outDir, "main-worktree-add.log"),
      },
    );
    if (addWorktree.status !== 0) {
      throw new Error(
        "Unable to create clean origin/main worktree for baseline differential gate.",
      );
    }

    candidateNodeVersion = await runLogged("node", ["--version"], {
      cwd: repoRoot,
      logFile: join(outDir, "candidate-node-version.log"),
    });
    candidatePnpmVersion = await runLogged("pnpm", ["--version"], {
      cwd: repoRoot,
      logFile: join(outDir, "candidate-pnpm-version.log"),
    });
    mainNodeVersion = await runLogged("node", ["--version"], {
      cwd: mainWorktree,
      logFile: join(outDir, "main-node-version.log"),
    });
    mainPnpmVersion = await runLogged("pnpm", ["--version"], {
      cwd: mainWorktree,
      logFile: join(outDir, "main-pnpm-version.log"),
    });

    mainInstall = await runLogged("pnpm", ["install", "--frozen-lockfile"], {
      cwd: mainWorktree,
      logFile: join(outDir, "main-install.log"),
    });
    if (shouldInstallCandidate()) {
      candidateInstall = await runLogged(
        "pnpm",
        ["install", "--frozen-lockfile"],
        {
          cwd: repoRoot,
          logFile: join(outDir, "candidate-install.log"),
        },
      );
    } else {
      candidateInstall = { status: 0 };
      await writeFile(
        join(outDir, "candidate-install.log"),
        "Skipped: workflow supplied a frozen-installed candidate checkout.\n",
      );
    }

    if (mainInstall.status !== 0 || candidateInstall.status !== 0) {
      throw new Error(
        "Frozen install failed for baseline or candidate worktree.",
      );
    }

    [mainTestFiles, candidateTestFiles] = await Promise.all([
      listRootTestFiles(mainWorktree),
      listRootTestFiles(repoRoot),
    ]);
    mainTest = await runLogged("node", ["--test", ...mainTestFiles], {
      cwd: mainWorktree,
      logFile: join(outDir, "main-root-tests.log"),
    });
    candidateTest = await runLogged("node", ["--test", ...candidateTestFiles], {
      cwd: repoRoot,
      logFile: join(outDir, "candidate-root-tests.log"),
    });
  } finally {
    await spawnCapture("git", ["worktree", "remove", "--force", mainWorktree], {
      cwd: repoRoot,
    });
    await rm(baselineParent, { recursive: true, force: true });
  }

  const failureComparison = compareFailureSets(
    failuresFromTestResult(mainTest),
    failuresFromTestResult(candidateTest),
  );
  const testCoverage = compareTestCoverage(
    extractTestRunSummary(mainTest.output),
    extractTestRunSummary(candidateTest.output),
    mainTestFiles,
    candidateTestFiles,
  );
  const comparison = {
    ...failureComparison,
    pass: failureComparison.pass && testCoverage.pass,
    reasons: [...failureComparison.reasons, ...testCoverage.reasons],
    testCoverage,
  };
  const summary = {
    status: comparison.pass ? "pass" : "fail",
    gate: "baseline differential",
    originMainSha,
    candidateSha,
    nodeVersions: {
      main: mainNodeVersion.stdout.trim(),
      candidate: candidateNodeVersion.stdout.trim(),
    },
    pnpmVersions: {
      main: mainPnpmVersion.stdout.trim(),
      candidate: candidatePnpmVersion.stdout.trim(),
    },
    mainTestExitCode: mainTest.status,
    candidateTestExitCode: candidateTest.status,
    ...comparison,
  };

  await writeFile(
    join(outDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFile(
    join(outDir, "summary.md"),
    [
      "# Fieldgrid Baseline Differential Test Gate",
      "",
      `Status: ${summary.status}`,
      `origin/main SHA: ${originMainSha}`,
      `candidate SHA: ${candidateSha}`,
      `main Node: ${summary.nodeVersions.main}`,
      `candidate Node: ${summary.nodeVersions.candidate}`,
      `main pnpm: ${summary.pnpmVersions.main}`,
      `candidate pnpm: ${summary.pnpmVersions.candidate}`,
      `main root test exit code: ${mainTest.status}`,
      `candidate root test exit code: ${candidateTest.status}`,
      "",
      "## Counts",
      "",
      `- main failures: ${comparison.counts.mainFailures}`,
      `- candidate failures: ${comparison.counts.candidateFailures}`,
      `- common failures: ${comparison.counts.commonFailures}`,
      `- candidate-only failures: ${comparison.counts.candidateOnlyFailures}`,
      `- main-only failures: ${comparison.counts.mainOnlyFailures}`,
      `- main tests: ${testCoverage.mainSummary.tests ?? "invalid"}`,
      `- candidate tests: ${testCoverage.candidateSummary.tests ?? "invalid"}`,
      `- main executed tests: ${testCoverage.mainSummary.executedTests ?? "invalid"}`,
      `- candidate executed tests: ${testCoverage.candidateSummary.executedTests ?? "invalid"}`,
      `- main skipped tests: ${testCoverage.mainSummary.skipped ?? "invalid"}`,
      `- candidate skipped tests: ${testCoverage.candidateSummary.skipped ?? "invalid"}`,
      "",
      "## Coverage Regressions",
      markdownList(testCoverage.reasons),
      "",
      "## Missing Root Test Files",
      markdownList(testCoverage.missingTestFiles),
      "",
      "## Main Failures",
      markdownList(comparison.mainFailures),
      "",
      "## Candidate Failures",
      markdownList(comparison.candidateFailures),
      "",
      "## Common Failures",
      markdownList(comparison.commonFailures),
      "",
      "## Candidate-Only Failures",
      markdownList(comparison.candidateOnlyFailures),
    ].join("\n"),
  );

  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = comparison.pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
