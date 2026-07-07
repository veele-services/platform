#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const SPRINT7_MIGRATION_SMOKE_VERSION = "sprint-7-migration-smoke-v1";
export const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

export const MIGRATION_SMOKE_TARGETS = [
  {
    id: "empty-database",
    aliases: ["empty", "empty-db", "blank"],
    label: "Lege database",
    envVar: "FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL",
    confirmVar: "FIELDGRID_MIGRATION_SMOKE_EMPTY_CONFIRM",
    testIds: ["FG-MIG-001", "FG-MIG-003"],
    requiredReadiness: "pass",
    requiredUrlMarkers: ["empty", "smoke", "test", "ci", "migration"],
  },
  {
    id: "staging-copy",
    aliases: ["copy", "staging_clone", "staging-clone", "staging-copy"],
    label: "Staging-copy database",
    envVar: "FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL",
    confirmVar: "FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_CONFIRM",
    testIds: ["FG-MIG-002", "FG-MIG-003"],
    requiredReadiness: "pass",
    requiredUrlMarkers: ["copy", "clone", "smoke", "test", "migration"],
  },
];

export const REQUIRED_REPORT_FIELDS = [
  "target",
  "startedAt",
  "finishedAt",
  "durationMs",
  "readiness",
  "exitCode",
  "appliedMigrations",
  "skippedMigrations",
  "compatibilitySkippedMigrations",
  "unresolvedRows",
  "failedStatement",
];

function usage() {
  return `Fieldgrid sprint 7 migration smoke\n\nUsage:\n  pnpm fieldgrid:sprint7-migration-smoke:check\n  pnpm fieldgrid:sprint7-migration-smoke --json\n  pnpm fieldgrid:sprint7-migration-smoke --run --target empty-database\n  pnpm fieldgrid:sprint7-migration-smoke --run --target staging-copy\n  pnpm fieldgrid:sprint7-migration-smoke --run --target all\n\nEnvironment:\n  FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL        Database URL for a disposable empty DB\n  FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL Database URL for a restored staging copy\n  FIELDGRID_MIGRATION_SMOKE_EMPTY_CONFIRM=empty-database\n  FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_CONFIRM=staging-copy\n\nSafety:\n  URLs must contain a safe marker such as empty, smoke, test, migration, copy or clone,\n  or the matching CONFIRM variable must be set. Use --allow-unsafe-url only for a\n  deliberately isolated CI database.\n`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    json: false,
    run: false,
    help: false,
    target: "all",
    outDir: join(repoRoot, "artifacts", "migration-smoke"),
    timeoutMs: Number(process.env.FIELDGRID_MIGRATION_SMOKE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    allowUnsafeUrl: false,
    envFiles: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index];

    switch (flag) {
      case "--check":
        options.check = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--run":
        options.run = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--target":
        options.target = nextValue();
        break;
      case "--out":
      case "--out-dir":
        options.outDir = resolve(repoRoot, nextValue());
        break;
      case "--timeout-ms":
        options.timeoutMs = Number(nextValue());
        break;
      case "--allow-unsafe-url":
        options.allowUnsafeUrl = true;
        break;
      case "--empty-env-file":
        options.envFiles["empty-database"] = resolve(repoRoot, nextValue());
        break;
      case "--staging-copy-env-file":
        options.envFiles["staging-copy"] = resolve(repoRoot, nextValue());
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }

  return options;
}

export function resolveTarget(value) {
  if (value === "all") return "all";

  const normalized = value.toLowerCase();
  const target = MIGRATION_SMOKE_TARGETS.find(
    (candidate) => candidate.id === normalized || candidate.aliases.includes(normalized),
  );

  if (!target) {
    throw new Error(`Unknown migration smoke target: ${value}`);
  }

  return target.id;
}

export function targetsFor(value) {
  const resolved = resolveTarget(value);
  if (resolved === "all") return MIGRATION_SMOKE_TARGETS;
  return MIGRATION_SMOKE_TARGETS.filter((target) => target.id === resolved);
}

export function parseEnvFileContent(content) {
  const env = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) env[key] = value;
  }

  return env;
}

async function readEnvFile(filePath) {
  if (!filePath) return {};
  return parseEnvFileContent(await readFile(filePath, "utf8"));
}

export function redactDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return null;

  try {
    const parsed = new URL(databaseUrl);
    const auth = parsed.username || parsed.password ? "***@" : "";
    return `${parsed.protocol}//${auth}${parsed.host}${parsed.pathname}`;
  } catch {
    return "<redacted invalid database url>";
  }
}

export function databaseUrlContainsSafeMarker(databaseUrl, target) {
  if (!databaseUrl) return false;

  try {
    const parsed = new URL(databaseUrl);
    const searchable = `${parsed.hostname}/${parsed.pathname}`.toLowerCase();
    return target.requiredUrlMarkers.some((marker) => searchable.includes(marker));
  } catch {
    return false;
  }
}

export function classifyDatabaseUrlSafety(databaseUrl, target, env = process.env, allowUnsafeUrl = false) {
  if (!databaseUrl) {
    return {
      safe: false,
      readiness: "not-configured",
      reason: `${target.envVar} or DATABASE_URL is required for --run target ${target.id}.`,
    };
  }

  const confirmedTargets = new Set(
    String(env.FIELDGRID_MIGRATION_SMOKE_CONFIRM ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const isConfirmed = env[target.confirmVar] === target.id || confirmedTargets.has(target.id);
  const isExplicitlyAllowed = allowUnsafeUrl || env.FIELDGRID_MIGRATION_SMOKE_ALLOW_UNSAFE_URL === "1";

  if (isExplicitlyAllowed || isConfirmed || databaseUrlContainsSafeMarker(databaseUrl, target)) {
    return { safe: true, readiness: "configured", reason: null };
  }

  return {
    safe: false,
    readiness: "blocked",
    reason: [
      `${target.id} database URL does not look like an isolated smoke target.`,
      `Use a URL containing one of: ${target.requiredUrlMarkers.join(", ")}.`,
      `Or set ${target.confirmVar}=${target.id} for a deliberate staging-copy/empty DB run.`,
    ].join(" "),
  };
}

export async function buildEnvForTarget(target, options = parseArgs([])) {
  const envFile = await readEnvFile(options.envFiles?.[target.id]);
  const env = { ...process.env, ...envFile };
  const databaseUrl = env[target.envVar] || env.DATABASE_URL || "";

  if (databaseUrl) {
    env[target.envVar] = databaseUrl;
    env.DATABASE_URL = databaseUrl;
  }

  env.DB_MIGRATION_SMOKE_TARGET = target.id;
  env.FIELDGRID_MIGRATION_SMOKE_VERSION = SPRINT7_MIGRATION_SMOKE_VERSION;

  return { env, databaseUrl };
}

export function parseMigrationOutput(stdout = "", stderr = "") {
  const output = `${stdout}\n${stderr}`;
  const appliedMigrations = [];
  const skippedMigrations = [];
  const compatibilitySkippedMigrations = [];
  const unresolvedRows = [];
  let failedStatement = null;

  for (const line of output.split(/\r?\n/u)) {
    const applying = line.match(/\[db:migrate\]\s+SQL applying:\s+(.+)$/u);
    if (applying) appliedMigrations.push(applying[1].trim());

    const skipped = line.match(/\[db:migrate\]\s+SQL skipped:\s+(.+)$/u);
    if (skipped) skippedMigrations.push(skipped[1].trim());

    const compatibilitySkipped = line.match(/\[db:migrate\]\s+SQL compatibility skipped:\s+([^()]+)(?:\s+\((.+)\))?/u);
    if (compatibilitySkipped) {
      compatibilitySkippedMigrations.push({
        name: compatibilitySkipped[1].trim(),
        reason: compatibilitySkipped[2]?.trim() ?? null,
      });
    }

    const unresolved = line.match(/unresolved(?: rows|_rows)?\s*[:=]\s*(\d+)/iu);
    if (unresolved) unresolvedRows.push(Number(unresolved[1]));

    if (!failedStatement && /(^|\s)(error|fatal):/iu.test(line)) {
      failedStatement = line.trim();
    }
  }

  return {
    appliedMigrations,
    skippedMigrations,
    compatibilitySkippedMigrations,
    unresolvedRows,
    failedStatement,
    drizzleStarted: /\[db:migrate\]\s+Applying Drizzle generated migrations\./u.test(output),
    complete: /\[db:migrate\]\s+Complete\./u.test(output),
  };
}

export function buildMigrationSmokePlan(env = process.env) {
  return {
    version: SPRINT7_MIGRATION_SMOKE_VERSION,
    sprint: 7,
    destructive: false,
    mutatesStagingDirectly: false,
    command: "pnpm --filter @workspace/db run db:migrate",
    reportDirectory: "artifacts/migration-smoke",
    requiredReportFields: REQUIRED_REPORT_FIELDS,
    targets: MIGRATION_SMOKE_TARGETS.map((target) => {
      const databaseUrl = env[target.envVar] || env.DATABASE_URL || "";
      const safety = classifyDatabaseUrlSafety(databaseUrl, target, env, false);

      return {
        id: target.id,
        label: target.label,
        envVar: target.envVar,
        confirmVar: target.confirmVar,
        configured: Boolean(databaseUrl),
        redactedDatabaseUrl: redactDatabaseUrl(databaseUrl),
        readiness: safety.readiness,
        safetyReason: safety.reason,
        testIds: target.testIds,
        requiredUrlMarkers: target.requiredUrlMarkers,
      };
    }),
    requiredDocs: [
      "docs/fieldgrid-sprint-7-migration-smoke.md",
      "docs/fieldgrid-saas-proof-sprint-plan.md",
      "docs/fieldgrid-cross-tenant-testmatrix.md",
      "docs/fieldgrid-staging-promotion-checklist.md",
    ],
    prTemplateChecks: [
      "pnpm fieldgrid:sprint7-migration-smoke:check",
      "pnpm fieldgrid:sprint7-migration-smoke --run --target empty-database",
      "pnpm fieldgrid:sprint7-migration-smoke --run --target staging-copy",
    ],
  };
}

export function validateMigrationSmokeContract(plan = buildMigrationSmokePlan()) {
  const errors = [];
  const targetIds = new Set(plan.targets.map((target) => target.id));

  for (const requiredTarget of ["empty-database", "staging-copy"]) {
    if (!targetIds.has(requiredTarget)) errors.push(`${requiredTarget} target ontbreekt.`);
  }

  for (const field of REQUIRED_REPORT_FIELDS) {
    if (!plan.requiredReportFields.includes(field)) errors.push(`Rapportveld ${field} ontbreekt.`);
  }

  for (const target of plan.targets) {
    if (!target.envVar) errors.push(`${target.id} mist envVar.`);
    if (!target.confirmVar) errors.push(`${target.id} mist confirmVar.`);
    if (!target.testIds?.some((testId) => testId === "FG-MIG-001" || testId === "FG-MIG-002")) {
      errors.push(`${target.id} mist FG-MIG test-id.`);
    }
  }

  if (plan.destructive) errors.push("Migration smoke mag niet destructief zijn.");
  if (plan.mutatesStagingDirectly) errors.push("Migration smoke mag niet direct tegen staging schrijven.");
  if (!plan.command.includes("@workspace/db") || !plan.command.includes("db:migrate")) {
    errors.push("Migration smoke moet de bestaande db:migrate runner gebruiken.");
  }

  return errors;
}

function summarizeReport(results) {
  const failed = results.filter((result) => result.readiness !== "pass");

  return {
    status: failed.length === 0 ? "pass" : "fail",
    passedTargets: results.filter((result) => result.readiness === "pass").map((result) => result.target),
    failedTargets: failed.map((result) => result.target),
    appliedMigrations: results.reduce((total, result) => total + result.appliedMigrations.length, 0),
    skippedMigrations: results.reduce((total, result) => total + result.skippedMigrations.length, 0),
    compatibilitySkippedMigrations: results.reduce(
      (total, result) => total + result.compatibilitySkippedMigrations.length,
      0,
    ),
    unresolvedRows: results.reduce(
      (total, result) => total + result.unresolvedRows.reduce((sum, value) => sum + value, 0),
      0,
    ),
  };
}

export function formatMigrationSmokeResult(result) {
  const details = [];
  if (result.exitCode !== null && result.exitCode !== undefined) details.push(`exit=${result.exitCode}`);
  if (result.timedOut) details.push("timed-out");
  if (result.appliedMigrations?.length > 0) details.push(`applied=${result.appliedMigrations.length}`);
  if (result.skippedMigrations?.length > 0) details.push(`skipped=${result.skippedMigrations.length}`);
  if (result.compatibilitySkippedMigrations?.length > 0) {
    details.push(`compatibility-skipped=${result.compatibilitySkippedMigrations.length}`);
  }

  const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
  const lines = [`[fieldgrid:migration-smoke] ${result.target}: ${result.readiness}${suffix}`];

  if (result.readiness !== "pass" && result.safetyReason) {
    lines.push(`[fieldgrid:migration-smoke] ${result.target} reason: ${result.safetyReason}`);
  } else if (result.readiness !== "pass" && result.failedStatement) {
    lines.push(`[fieldgrid:migration-smoke] ${result.target} failure: ${result.failedStatement}`);
  }

  return lines.join("\n");
}

async function runCommand(command, args, options) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: options.env,
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode, stdout, stderr, timedOut });
    });
  });
}

export async function runMigrationSmokeTarget(target, options = parseArgs([])) {
  const { env, databaseUrl } = await buildEnvForTarget(target, options);
  const safety = classifyDatabaseUrlSafety(databaseUrl, target, env, options.allowUnsafeUrl);
  const startedAt = new Date();

  if (!safety.safe) {
    return {
      target: target.id,
      label: target.label,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      readiness: safety.readiness,
      safetyReason: safety.reason,
      redactedDatabaseUrl: redactDatabaseUrl(databaseUrl),
      exitCode: null,
      timedOut: false,
      appliedMigrations: [],
      skippedMigrations: [],
      compatibilitySkippedMigrations: [],
      unresolvedRows: [],
      failedStatement: safety.reason,
    };
  }

  const result = await runCommand("pnpm", ["--filter", "@workspace/db", "run", "db:migrate"], {
    env,
    timeoutMs: options.timeoutMs,
  });
  const finishedAt = new Date();
  const parsed = parseMigrationOutput(result.stdout, result.stderr);
  const readiness = result.exitCode === 0 && parsed.complete && !result.timedOut ? "pass" : "fail";

  return {
    target: target.id,
    label: target.label,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    readiness,
    safetyReason: safety.reason,
    redactedDatabaseUrl: redactDatabaseUrl(databaseUrl),
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    ...parsed,
  };
}

export async function runMigrationSmoke(options = parseArgs([])) {
  const selectedTargets = targetsFor(options.target);
  const results = [];

  for (const target of selectedTargets) {
    console.log(`\n[fieldgrid:migration-smoke] Running ${target.id}`);
    const result = await runMigrationSmokeTarget(target, options);
    console.log(formatMigrationSmokeResult(result));
    results.push(result);
  }

  const report = {
    version: SPRINT7_MIGRATION_SMOKE_VERSION,
    createdAt: new Date().toISOString(),
    command: "pnpm --filter @workspace/db run db:migrate",
    results,
    summary: summarizeReport(results),
  };

  await mkdir(options.outDir, { recursive: true });
  const reportPath = join(
    options.outDir,
    `${new Date().toISOString().replace(/[:.]/gu, "-")}-migration-smoke.json`,
  );
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return { report, reportPath };
}

function printPlan(plan) {
  console.log("Fieldgrid sprint 7 migration smoke workflow");
  console.log("");
  console.log(`Version: ${plan.version}`);
  console.log(`Command: ${plan.command}`);
  console.log(`Report directory: ${plan.reportDirectory}`);
  console.log("");
  console.log("Targets:");
  for (const target of plan.targets) {
    console.log(`- ${target.id}: ${target.readiness}${target.configured ? ` (${target.redactedDatabaseUrl})` : ""}`);
    if (target.safetyReason) console.log(`  ${target.safetyReason}`);
  }
  console.log("");
  console.log("Use --run to execute against configured isolated databases.");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const plan = buildMigrationSmokePlan();
  const errors = validateMigrationSmokeContract(plan);

  if (options.help) {
    console.log(usage());
    return 0;
  }

  if (errors.length > 0) {
    console.error("Fieldgrid sprint 7 migration smoke contract failed:");
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }

  if (options.check) {
    console.log("Fieldgrid sprint 7 migration smoke contract is valid.");
    return 0;
  }

  if (options.run) {
    const { report, reportPath } = await runMigrationSmoke(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    console.log(`[fieldgrid:migration-smoke] Report written: ${reportPath}`);
    return report.summary.status === "pass" ? 0 : 1;
  }

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }

  printPlan(plan);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
