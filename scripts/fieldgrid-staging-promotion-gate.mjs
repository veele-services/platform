#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMigrationOrderReport,
  validateMigrationOrderReport,
} from "./fieldgrid-migration-order-check.mjs";
import {
  buildFieldgridTestLayersPlan,
  validateFieldgridTestLayersPlan,
} from "./fieldgrid-test-layers.mjs";
import {
  buildMigrationSmokePlan,
  validateMigrationSmokeContract,
} from "./fieldgrid-sprint7-migration-smoke.mjs";
import {
  buildSprint15StagingSmokePlan,
  validateSprint15StagingSmokePlan,
} from "./fieldgrid-sprint15-staging-smoke.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const FIELDGRID_STAGING_PROMOTION_GATE_VERSION =
  "fieldgrid-staging-promotion-gate-v1";
export const STAGING_PROMOTION_GATE_REPORT_DIR =
  "artifacts/staging-promotion-gate";

export const promotionEvidenceDirectories = [
  "artifacts/staging-smoke",
  "artifacts/migration-smoke",
  "artifacts/platform-admin-final-gate",
  "artifacts/final-gate",
  "artifacts/staging-promotion-gate",
];

export const promotionSourceContracts = [
  {
    path: "package.json",
    phrases: [
      "fieldgrid:migration-order-check",
      "fieldgrid:test-layers",
      "fieldgrid:staging-promotion-gate",
    ],
  },
  {
    path: ".github/workflows/promotion-guard.yml",
    phrases: [
      "pnpm fieldgrid:migration-order-check:check",
      "pnpm fieldgrid:test-layers:check",
      "pnpm fieldgrid:staging-promotion-gate:check",
      'STAGING_RECOVERY_FREEZE: "false"',
    ],
  },
  {
    path: ".github/workflows/fieldgrid-migration-smoke.yml",
    phrases: [
      "environment: staging",
      "pnpm fieldgrid:migration-order-check:check",
      "pnpm fieldgrid:sprint7-migration-smoke:check",
    ],
  },
  {
    path: ".github/workflows/deploy.yml",
    phrases: [
      "Validate Fieldgrid release signals",
      "pnpm fieldgrid:staging-promotion-gate:check",
    ],
  },
  {
    path: "artifacts/backoffice/src/app/actions/platform-smoke.ts",
    phrases: [
      "buildStagingPromotionGate",
      "stagingPromotionGate",
      "runHistory",
    ],
  },
  {
    path: "artifacts/backoffice/src/app/actions/platform-smoke.types.ts",
    phrases: [
      "PlatformStagingPromotionGate",
      "PlatformStagingPromotionGateSignal",
    ],
  },
  {
    path: "artifacts/backoffice/src/app/(platform)/platform/staging-smoke/page.tsx",
    phrases: [
      "Staging promotion gate",
      "dashboard.stagingPromotionGate",
      "Evidence directories",
    ],
  },
  {
    path: "docs/fieldgrid-staging-promotion-checklist.md",
    phrases: [
      "Fase 9 - Ops, CI en teststructuur",
      "fieldgrid:staging-promotion-gate:check",
    ],
  },
  {
    path: "docs/fieldgrid-phase-4-ops-ci-teststructure.md",
    phrases: [
      "Definition of done",
      "security guards",
      "staging promotion gate",
    ],
  },
  {
    path: "docs/fieldgrid-docs-maintenance.md",
    phrases: ["Canonical docs", "Samenvoegen", "Verwijderen"],
  },
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    json: false,
    help: false,
    strictEvidence: false,
    write: false,
    outDir: join(repoRoot, STAGING_PROMOTION_GATE_REPORT_DIR),
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
      case "--strict":
      case "--strict-evidence":
        options.strictEvidence = true;
        break;
      case "--write":
        options.write = true;
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

async function listJsonArtifacts(relativeDir) {
  const directory = join(repoRoot, relativeDir);

  try {
    const filenames = (await readdir(directory))
      .filter((filename) => filename.endsWith(".json"))
      .sort()
      .reverse();
    const artifacts = [];

    for (const filename of filenames.slice(0, 5)) {
      const relativePath = `${relativeDir}/${filename}`;
      let summary = "JSON artifact";

      try {
        const content = await readFile(join(repoRoot, relativePath), "utf8");
        const parsed = JSON.parse(content);
        summary =
          parsed.summary ??
          parsed.status ??
          parsed.readiness ??
          parsed.target ??
          parsed.version ??
          summary;
      } catch {
        summary = "JSON artifact kon niet worden gelezen door de gate";
      }

      artifacts.push({ path: relativePath, summary });
    }

    return artifacts;
  } catch {
    return [];
  }
}

export async function collectPromotionEvidence() {
  const entries = await Promise.all(
    promotionEvidenceDirectories.map(async (directory) => [
      directory,
      await listJsonArtifacts(directory),
    ]),
  );

  return Object.fromEntries(entries);
}

function statusFromErrors(errors) {
  return errors.length > 0 ? "blocked" : "ok";
}

function evidenceStatus(artifacts, strictEvidence) {
  if (artifacts.length > 0) return "ok";
  return strictEvidence ? "blocked" : "warning";
}

function summarizeErrors(errors, fallback) {
  return errors.length > 0 ? errors.join(" | ") : fallback;
}

export async function buildStagingPromotionGatePlan(options = {}) {
  const strictEvidence = Boolean(options.strictEvidence);
  const [migrationOrderReport, testLayersPlan, evidence] = await Promise.all([
    buildMigrationOrderReport(),
    buildFieldgridTestLayersPlan(),
    collectPromotionEvidence(),
  ]);

  const migrationOrderValidation =
    validateMigrationOrderReport(migrationOrderReport);
  const testLayerErrors = await validateFieldgridTestLayersPlan(testLayersPlan);
  const migrationSmokeErrors = validateMigrationSmokeContract(
    buildMigrationSmokePlan({}),
  );
  const stagingSmokeErrors = validateSprint15StagingSmokePlan(
    buildSprint15StagingSmokePlan({}),
  );
  const smokeContractErrors = [...migrationSmokeErrors, ...stagingSmokeErrors];

  const stagingEvidence = evidence["artifacts/staging-smoke"] ?? [];
  const migrationEvidence = evidence["artifacts/migration-smoke"] ?? [];
  const platformAdminEvidence =
    evidence["artifacts/platform-admin-final-gate"] ?? [];
  const finalGateEvidence = evidence["artifacts/final-gate"] ?? [];

  const signals = [
    {
      id: "FG-OPS-CI-MIGRATION-ORDER",
      label: "Migratievolgorde en naming",
      status: statusFromErrors(migrationOrderValidation.errors),
      owner: "Platform engineering",
      command: "pnpm fieldgrid:migration-order-check:check",
      evidence: summarizeErrors(
        migrationOrderValidation.errors,
        `Policy ${migrationOrderReport.policy}; laatste numerieke prefix ${String(migrationOrderReport.latestNumericPrefix).padStart(3, "0")}; timestamp cutover ${migrationOrderReport.legacy.timestampFloor}.`,
      ),
      nextAction:
        "Gebruik na 101 alleen timestamp-migraties die na de bestaande timestamp sorteren.",
      testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
      blocksPromotion: true,
    },
    {
      id: "FG-OPS-CI-TEST-LAYERS",
      label: "Testsuite in lagen",
      status: statusFromErrors(testLayerErrors),
      owner: "Platform engineering",
      command: "pnpm fieldgrid:test-layers:check",
      evidence: summarizeErrors(
        testLayerErrors,
        `${testLayersPlan.layers.length} testlagen met owner, command en signalen.`,
      ),
      nextAction:
        "Draai per risico de passende laag: security, UI, DB/migration of live E2E.",
      testIds: ["FG-OPS-008"],
      blocksPromotion: true,
    },
    {
      id: "FG-OPS-CI-SMOKE-CONTRACTS",
      label: "Smoke-contracten",
      status: statusFromErrors(smokeContractErrors),
      owner: "Platform operations",
      command:
        "pnpm fieldgrid:sprint7-migration-smoke:check && pnpm fieldgrid:sprint15-staging-smoke:check",
      evidence: summarizeErrors(
        smokeContractErrors,
        "Migration smoke en staging smoke contracten zijn statisch valide.",
      ),
      nextAction:
        "Gebruik deze statische checks als minimum voor elke PR en de live runs als promotion evidence.",
      testIds: ["FG-MIG-001", "FG-OPS-008"],
      blocksPromotion: true,
    },
    {
      id: "FG-OPS-CI-RUN-HISTORY",
      label: "Run history en evidence",
      status:
        stagingEvidence.length > 0 && migrationEvidence.length > 0
          ? "ok"
          : strictEvidence
            ? "blocked"
            : "warning",
      owner: "Platform operations",
      command:
        "pnpm fieldgrid:sprint15-staging-smoke:run-read-only && pnpm fieldgrid:sprint7-migration-smoke --run --target all",
      evidence: `${stagingEvidence.length} staging-smoke artifact(s), ${migrationEvidence.length} migration-smoke artifact(s).`,
      nextAction:
        "Koppel de laatste Actions artifact-URL of JSON-run aan de staging promotion.",
      testIds: ["FG-LIVE-HOST", "FG-LIVE-STORAGE", "FG-OPS-008"],
      blocksPromotion: true,
    },
    {
      id: "FG-OPS-CI-FINAL-GATES",
      label: "Final gates en platform-admin",
      status: evidenceStatus(
        [...platformAdminEvidence, ...finalGateEvidence],
        strictEvidence,
      ),
      owner: "Platform engineering",
      command:
        "pnpm fieldgrid:sprint16-final-gate:check && pnpm fieldgrid:platform-admin-final-gate:check",
      evidence: `${platformAdminEvidence.length} platform-admin artifact(s), ${finalGateEvidence.length} final-gate artifact(s).`,
      nextAction:
        "Voeg strict evidence toe voordat externe tenants of productiepromotie worden vrijgegeven.",
      testIds: [
        "FG-PA-GATE-HOST-FIRST",
        "FG-FINAL-STAGING-COPY",
        "FG-FINAL-EXTERNAL-TENANT",
      ],
      blocksPromotion: false,
    },
    {
      id: "FG-OPS-CI-DOCS-CHECKLIST",
      label: "Releasechecklist en docs",
      status: "ok",
      owner: "Platform operations",
      command: "pnpm fieldgrid:staging-promotion-gate:check",
      evidence:
        "Staging promotion checklist, Fase 4 runbook en docs-maintenance inventaris bestaan.",
      nextAction:
        "Gebruik de checklist als releaseformulier en noteer owners voor handmatige restpunten.",
      testIds: ["FG-OPS-008"],
      blocksPromotion: true,
    },
  ];

  const blockingSignals = signals.filter(
    (signal) => signal.blocksPromotion && signal.status === "blocked",
  );
  const openSignals = signals.filter((signal) => signal.status !== "ok");
  const status =
    blockingSignals.length > 0
      ? "blocked"
      : openSignals.length > 0
        ? "warning"
        : "ok";
  const decision =
    status === "ok"
      ? "ready"
      : status === "blocked"
        ? "blocked"
        : "conditional-go";

  return {
    version: FIELDGRID_STAGING_PROMOTION_GATE_VERSION,
    marker: "fieldgrid-phase-4-staging-promotion-gate",
    destructive: false,
    noTenantMutation: true,
    strictEvidence,
    promotionPath: "main -> staging",
    status,
    decision,
    summary:
      decision === "ready"
        ? "Staging promotion gate is groen met automatische signalen en evidence."
        : decision === "blocked"
          ? "Staging promotion gate blokkeert tot automatische signalen of strict evidence groen zijn."
          : "Staging promotion gate is conditioneel: statische signalen zijn bruikbaar, runtime evidence moet aan de release worden gekoppeld.",
    signals,
    evidence,
    evidenceDirectories: promotionEvidenceDirectories,
    reportDirectory: STAGING_PROMOTION_GATE_REPORT_DIR,
    checklist: "docs/fieldgrid-staging-promotion-checklist.md",
    sourceContracts: promotionSourceContracts,
    requiredCommands: [
      "pnpm fieldgrid:migration-order-check:check",
      "pnpm fieldgrid:test-layers:check",
      "pnpm fieldgrid:sprint7-migration-smoke:check",
      "pnpm fieldgrid:sprint15-staging-smoke:check",
      "pnpm fieldgrid:sprint16-final-gate:check",
      "pnpm fieldgrid:platform-admin-final-gate:check",
      "pnpm fieldgrid:staging-promotion-gate:check",
    ],
  };
}

export async function readSourceContractText(relativePath, options = {}) {
  const roots = [options.repoRoot ?? repoRoot];
  const githubWorkspace =
    options.githubWorkspace ?? process.env.GITHUB_WORKSPACE?.trim();

  if (githubWorkspace && !roots.includes(githubWorkspace)) {
    roots.push(githubWorkspace);
  }

  let firstError = null;
  for (const root of roots) {
    try {
      return await readFile(join(root, relativePath), "utf8");
    } catch (error) {
      firstError ??= error;
    }
  }

  throw firstError ?? new Error(`Bronbestand ontbreekt: ${relativePath}`);
}

async function readText(relativePath) {
  return readSourceContractText(relativePath);
}

export async function validateStagingPromotionGatePlan(plan) {
  const errors = [];
  const requiredSignalIds = [
    "FG-OPS-CI-MIGRATION-ORDER",
    "FG-OPS-CI-TEST-LAYERS",
    "FG-OPS-CI-SMOKE-CONTRACTS",
    "FG-OPS-CI-RUN-HISTORY",
    "FG-OPS-CI-FINAL-GATES",
    "FG-OPS-CI-DOCS-CHECKLIST",
  ];
  const signalIds = new Set(plan.signals.map((signal) => signal.id));

  if (plan.destructive)
    errors.push(
      "Staging promotion gate mag geen destructieve acties uitvoeren.",
    );
  if (!plan.noTenantMutation)
    errors.push("Staging promotion gate moet read-only zijn.");
  if (plan.version !== FIELDGRID_STAGING_PROMOTION_GATE_VERSION)
    errors.push("Onverwachte staging promotion gate versie.");
  if (plan.promotionPath !== "main -> staging")
    errors.push("Promotion path moet main -> staging zijn.");

  for (const signalId of requiredSignalIds) {
    if (!signalIds.has(signalId))
      errors.push(`Staging promotion gate mist signaal ${signalId}.`);
  }

  for (const signal of plan.signals) {
    if (!signal.owner) errors.push(`${signal.id} mist owner.`);
    if (!signal.command) errors.push(`${signal.id} mist command.`);
    if (!signal.evidence) errors.push(`${signal.id} mist evidence.`);
    if (!signal.nextAction) errors.push(`${signal.id} mist nextAction.`);
    if (!Array.isArray(signal.testIds) || signal.testIds.length === 0)
      errors.push(`${signal.id} mist testIds.`);
  }

  for (const contract of plan.sourceContracts) {
    let source = "";
    try {
      source = await readText(contract.path);
    } catch {
      errors.push(`Bronbestand ontbreekt: ${contract.path}.`);
      continue;
    }

    for (const phrase of contract.phrases) {
      if (!source.includes(phrase))
        errors.push(`${contract.path} mist "${phrase}".`);
    }
  }

  if (plan.strictEvidence) {
    if ((plan.evidence["artifacts/staging-smoke"] ?? []).length === 0) {
      errors.push("Strict evidence mist artifacts/staging-smoke JSON.");
    }
    if ((plan.evidence["artifacts/migration-smoke"] ?? []).length === 0) {
      errors.push("Strict evidence mist artifacts/migration-smoke JSON.");
    }
    for (const signal of plan.signals.filter(
      (candidate) => candidate.blocksPromotion,
    )) {
      if (signal.status !== "ok")
        errors.push(`Strict evidence blokkeert op ${signal.id}.`);
    }
  }

  return errors;
}

async function writeReport(plan, outDir) {
  await mkdir(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const path = join(outDir, `staging-promotion-gate-${timestamp}.json`);
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return path.replace(/\\/gu, "/");
}

function usage() {
  return `Fieldgrid staging promotion gate

Usage:
  pnpm fieldgrid:staging-promotion-gate:check
  pnpm fieldgrid:staging-promotion-gate --json
  pnpm fieldgrid:staging-promotion-gate:strict

Modes:
  --check validates static CI contracts.
  --strict-evidence also requires staging-smoke and migration-smoke JSON artifacts.
  --write writes a JSON report under ${STAGING_PROMOTION_GATE_REPORT_DIR}.
`;
}

function printPlan(plan) {
  console.log("Fieldgrid staging promotion gate");
  console.log("");
  console.log(`Version: ${plan.version}`);
  console.log(`Promotion path: ${plan.promotionPath}`);
  console.log(`Decision: ${plan.decision}`);
  console.log(`Status: ${plan.status}`);
  console.log(`Signals: ${plan.signals.length}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(usage());
    return 0;
  }

  const plan = await buildStagingPromotionGatePlan({
    strictEvidence: options.strictEvidence,
  });
  const errors = await validateStagingPromotionGatePlan(plan);

  if (options.write) {
    const reportPath = await writeReport(plan, options.outDir);
    plan.writtenReport = reportPath;
  }

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  }

  if (errors.length > 0) {
    console.error("Fieldgrid staging promotion gate failed:");
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }

  if (options.check) {
    console.log("Fieldgrid staging promotion gate contract is valid.");
    return 0;
  }

  if (!options.json) printPlan(plan);
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
