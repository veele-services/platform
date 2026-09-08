#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const SPRINT15_STAGING_SMOKE_VERSION = "sprint-15-staging-smoke-v1";
export const DEFAULT_STAGING_SMOKE_API_URL =
  "https://staging.fieldgrid.nl/api/platform/staging-smoke";
export const DEFAULT_STAGING_PILOT_TENANT_SLUG = "field-demo";
export const DEFAULT_MUTATING_SMOKE_CONFIRM_VALUE = "field-demo-only";
const REQUIRED_LIVE_SMOKE_TARGET_IDS = [
  "FG-LIVE-HOST",
  "FG-LIVE-MODULES",
  "FG-LIVE-REGIONS",
  "FG-LIVE-CUSTOMER-PORTAL",
  "FG-LIVE-PERSONNEL-PLANNING",
  "FG-LIVE-STORAGE-PDF",
];

function pilotTenantSlug(env = process.env) {
  return (
    env.FIELDGRID_STAGING_PILOT_TENANT_SLUG?.trim() ||
    DEFAULT_STAGING_PILOT_TENANT_SLUG
  );
}

function pilotTenantHost(env = process.env) {
  return `${pilotTenantSlug(env)}.staging.fieldgrid.nl`;
}

function mutatingSmokeConfirmValue(env = process.env) {
  return (
    env.FIELDGRID_MUTATING_SMOKE_CONFIRM_VALUE?.trim() ||
    DEFAULT_MUTATING_SMOKE_CONFIRM_VALUE
  );
}

export function buildLiveSmokeTargets(env = process.env) {
  const host = pilotTenantHost(env);

  return [
    {
      id: "FG-LIVE-HOST",
      label: "Host-first platform en tenants",
      runner: "Playwright",
      host: "staging.fieldgrid.nl",
      route: "/admin/platform",
      testIds: ["FG-HOST-001", "FG-HOST-002", "FG-HOST-003", "FG-HOST-004"],
    },
    {
      id: "FG-LIVE-MODULES",
      label: "Modules en sectoren",
      runner: "Playwright",
      host,
      route: "/admin",
      testIds: [
        "FG-MODULE-001",
        "FG-MODULE-003",
        "FG-SECTOR-001",
        "FG-SECTOR-006",
      ],
    },
    {
      id: "FG-LIVE-REGIONS",
      label: "Regio planning",
      runner: "Playwright",
      host,
      route: "/admin/planning",
      testIds: ["FG-REGION-003", "FG-REGION-006", "FG-REGION-007"],
    },
    {
      id: "FG-LIVE-CUSTOMER-PORTAL",
      label: "Klantportaal",
      runner: "Playwright",
      host,
      route: "/klant",
      testIds: ["FG-PORTAL-C-001", "FG-PORTAL-C-002", "FG-PORTAL-C-004"],
    },
    {
      id: "FG-LIVE-PERSONNEL-PLANNING",
      label: "Personeelsapp planning",
      runner: "Playwright",
      host,
      route: "/personeel",
      testIds: ["FG-PORTAL-P-001", "FG-PORTAL-P-002", "FG-PORTAL-P-005"],
    },
    {
      id: "FG-LIVE-STORAGE-PDF",
      label: "Storage en PDF/downloads",
      runner: "Playwright",
      host,
      route: "/admin/documents",
      testIds: [
        "FG-STORAGE-001",
        "FG-STORAGE-002",
        "FG-DATA-004",
        "FG-AUDIT-001",
      ],
    },
  ];
}

export const liveSmokeTargets = buildLiveSmokeTargets();

export function buildMutatingChecks(env = process.env) {
  const tenantScope = pilotTenantSlug(env);
  const confirmVar = `FIELDGRID_MUTATING_SMOKE_CONFIRM=${mutatingSmokeConfirmValue(env)}`;

  return [
    {
      id: "FG-MUTATE-LIFECYCLE",
      label: "Lifecycle mutatie met rollback",
      tenantScope,
      confirmVar,
      cleanupSelector: "fieldgrid-sprint-15-mutating-lifecycle",
      testIds: ["FG-LIFE-001", "FG-LIFE-002", "FG-PLATFORM-004"],
    },
    {
      id: "FG-MUTATE-SUPPORT-GRANT",
      label: "Supportgrant aanmaken en revoken",
      tenantScope,
      confirmVar,
      cleanupSelector: "fieldgrid-sprint-15-mutating-support",
      testIds: ["FG-SUPPORT-002", "FG-SUPPORT-003", "FG-PLATFORM-006"],
    },
    {
      id: "FG-MUTATE-DOCUMENT-DOWNLOAD",
      label: "Document/PDF audit met cleanup",
      tenantScope,
      confirmVar,
      cleanupSelector: "fieldgrid-sprint-15-mutating-document",
      testIds: ["FG-DATA-004", "FG-STORAGE-001", "FG-AUDIT-001"],
    },
  ];
}

export const mutatingChecks = buildMutatingChecks();

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    json: false,
    runReadOnly: false,
    help: false,
    apiUrl:
      process.env.FIELDGRID_STAGING_SMOKE_API_URL ||
      DEFAULT_STAGING_SMOKE_API_URL,
    outDir: join(repoRoot, "artifacts", "staging-smoke"),
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
      case "--run-read-only":
      case "--run":
        options.runReadOnly = true;
        break;
      case "--api-url":
        options.apiUrl = nextValue();
        break;
      case "--out":
      case "--out-dir":
        options.outDir = resolve(repoRoot, nextValue());
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function buildSprint15StagingSmokePlan(env = process.env) {
  const liveSmokeTargets = buildLiveSmokeTargets(env);
  const mutatingChecks = buildMutatingChecks(env);

  return {
    version: SPRINT15_STAGING_SMOKE_VERSION,
    sprint: 15,
    marker: "fieldgrid-sprint-15-staging-smoke",
    pilotTenantSlug: pilotTenantSlug(env),
    destructive: false,
    mutatesExistingTenants: false,
    dashboardRoute: "/admin/platform/staging-smoke",
    smokeApiRoute: "/api/platform/staging-smoke",
    runHistoryDirectories: [
      "artifacts/staging-smoke",
      "artifacts/migration-smoke",
    ],
    readOnlySnapshot: {
      apiUrl:
        env.FIELDGRID_STAGING_SMOKE_API_URL || DEFAULT_STAGING_SMOKE_API_URL,
      requiresAuth: true,
      authOptions: [
        "FIELDGRID_STAGING_SMOKE_COOKIE",
        "FIELDGRID_STAGING_SMOKE_BEARER",
      ],
      command: "pnpm fieldgrid:sprint15-staging-smoke --run-read-only",
    },
    migrationSmokeStatus: {
      command: "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
      reportDirectory: "artifacts/migration-smoke",
      targets: ["empty-database", "staging-copy"],
    },
    liveSmokeTargets,
    mutatingChecks,
    cleanupSelectors: mutatingChecks.map((check) => check.cleanupSelector),
    requiredDocs: [
      "docs/fieldgrid-sprint-15-staging-smoke.md",
      "docs/fieldgrid-saas-proof-sprint-plan.md",
      "docs/fieldgrid-cross-tenant-testmatrix.md",
      "docs/fieldgrid-staging-promotion-checklist.md",
      "docs/fieldgrid-phase-7-operations.md",
    ],
    requiredDashboardFields: [
      "runHistory",
      "liveSmokes",
      "migrationSmoke",
      "mutatingChecks",
    ],
  };
}

export function validateSprint15StagingSmokePlan(
  plan = buildSprint15StagingSmokePlan(),
) {
  const errors = [];
  const expectedPilotHost = `${plan.pilotTenantSlug}.staging.fieldgrid.nl`;

  if (plan.destructive)
    errors.push("Sprint 15 smokeplan mag niet destructief zijn.");
  if (plan.mutatesExistingTenants)
    errors.push("Sprint 15 smokeplan mag bestaande tenants niet muteren.");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(plan.pilotTenantSlug)) {
    errors.push("Pilottenant-slug is geen geldige DNS-label.");
  }
  if (plan.pilotTenantSlug !== DEFAULT_STAGING_PILOT_TENANT_SLUG) {
    errors.push(
      "Sprint 15 mag uitsluitend de vaste field-demo pilottenant gebruiken.",
    );
  }
  if (!plan.runHistoryDirectories.includes("artifacts/staging-smoke"))
    errors.push("Run history mist artifacts/staging-smoke.");
  if (!plan.runHistoryDirectories.includes("artifacts/migration-smoke"))
    errors.push("Run history mist artifacts/migration-smoke.");
  const targetIds = plan.liveSmokeTargets.map((target) => target.id);
  if (
    targetIds.length !== REQUIRED_LIVE_SMOKE_TARGET_IDS.length ||
    new Set(targetIds).size !== targetIds.length ||
    REQUIRED_LIVE_SMOKE_TARGET_IDS.some((id) => !targetIds.includes(id))
  ) {
    errors.push(
      "Live Playwright-smokes moeten alle vaste target-ID's exact eenmaal bevatten.",
    );
  }
  if (plan.mutatingChecks.length < 3)
    errors.push("Mutating checks missen cleanupcontracten.");

  for (const target of plan.liveSmokeTargets) {
    if (
      target.id === "FG-LIVE-HOST" &&
      target.host !== "staging.fieldgrid.nl"
    ) {
      errors.push("FG-LIVE-HOST gebruikt niet de vaste platform staging-host.");
    } else if (
      target.id !== "FG-LIVE-HOST" &&
      target.host !== expectedPilotHost
    ) {
      errors.push(`${target.id} gebruikt niet de vaste pilottenant-host.`);
    }
  }
  for (const check of plan.mutatingChecks) {
    if (
      check.tenantScope !== DEFAULT_STAGING_PILOT_TENANT_SLUG ||
      check.confirmVar !==
        `FIELDGRID_MUTATING_SMOKE_CONFIRM=${DEFAULT_MUTATING_SMOKE_CONFIRM_VALUE}`
    ) {
      errors.push(`${check.id} wijkt af van de vaste pilottenantbevestiging.`);
    }
    if (!check.cleanupSelector.includes("fieldgrid-sprint-15")) {
      errors.push(`${check.id} mist marker-scoped cleanup selector.`);
    }
  }

  return errors;
}

function authHeaders(env = process.env) {
  const headers = { accept: "application/json" };
  if (env.FIELDGRID_STAGING_SMOKE_COOKIE)
    headers.cookie = env.FIELDGRID_STAGING_SMOKE_COOKIE;
  if (env.FIELDGRID_STAGING_SMOKE_BEARER)
    headers.authorization = `Bearer ${env.FIELDGRID_STAGING_SMOKE_BEARER}`;
  return headers;
}

export async function runReadOnlySnapshot(
  options = parseArgs([]),
  env = process.env,
) {
  const headers = authHeaders(env);
  const startedAt = new Date();
  const response = await fetch(options.apiUrl, { headers });
  const finishedAt = new Date();
  const body = await response.text();
  let dashboard = null;

  try {
    dashboard = JSON.parse(body);
  } catch {
    dashboard = { error: body.slice(0, 500) };
  }

  const report = {
    version: SPRINT15_STAGING_SMOKE_VERSION,
    createdAt: finishedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    apiUrl: options.apiUrl,
    status: response.ok ? "pass" : "fail",
    httpStatus: response.status,
    summary: {
      status: response.ok ? "pass" : "fail",
      message: response.ok
        ? "Read-only staging smoke snapshot opgehaald."
        : "Read-only staging smoke snapshot faalde.",
    },
    checks: Array.isArray(dashboard?.checks)
      ? dashboard.checks.map((check) => check.id).filter(Boolean)
      : [],
    dashboard,
  };

  await mkdir(options.outDir, { recursive: true });
  const reportPath = join(
    options.outDir,
    `${new Date().toISOString().replace(/[:.]/gu, "-")}-staging-smoke.json`,
  );
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, reportPath };
}

function usage() {
  return `Fieldgrid sprint 15 staging smoke\n\nUsage:\n  pnpm fieldgrid:sprint15-staging-smoke:check\n  pnpm fieldgrid:sprint15-staging-smoke --json\n  pnpm fieldgrid:sprint15-staging-smoke --run-read-only\n\nEnvironment:\n  FIELDGRID_STAGING_SMOKE_API_URL      Defaults to ${DEFAULT_STAGING_SMOKE_API_URL}\n  FIELDGRID_STAGING_SMOKE_COOKIE       Platform-admin session cookie for the read-only API\n  FIELDGRID_STAGING_SMOKE_BEARER       Optional bearer token for the read-only API\n  FIELDGRID_STAGING_PILOT_TENANT_SLUG  Defaults to ${DEFAULT_STAGING_PILOT_TENANT_SLUG}\n  FIELDGRID_MUTATING_SMOKE_CONFIRM     Must be ${DEFAULT_MUTATING_SMOKE_CONFIRM_VALUE} before any future mutating runner exists\n`;
}

function printPlan(plan) {
  console.log("Fieldgrid sprint 15 staging smoke dashboard");
  console.log("");
  console.log(`Version: ${plan.version}`);
  console.log(`Pilot tenant: ${plan.pilotTenantSlug}`);
  console.log(`Dashboard: ${plan.dashboardRoute}`);
  console.log(`JSON API: ${plan.smokeApiRoute}`);
  console.log(`Run history: ${plan.runHistoryDirectories.join(", ")}`);
  console.log(`Live Playwright-smokes: ${plan.liveSmokeTargets.length}`);
  console.log(`Mutating cleanup contracts: ${plan.mutatingChecks.length}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const plan = buildSprint15StagingSmokePlan();
  const errors = validateSprint15StagingSmokePlan(plan);

  if (options.help) {
    console.log(usage());
    return 0;
  }

  if (errors.length > 0) {
    console.error("Fieldgrid sprint 15 staging smoke contract failed:");
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }

  if (options.check) {
    console.log("Fieldgrid sprint 15 staging smoke contract is valid.");
    return 0;
  }

  if (options.runReadOnly) {
    const { report, reportPath } = await runReadOnlySnapshot(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    console.log(
      `[fieldgrid:sprint15-staging-smoke] Report written: ${reportPath}`,
    );
    return report.status === "pass" ? 0 : 1;
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
