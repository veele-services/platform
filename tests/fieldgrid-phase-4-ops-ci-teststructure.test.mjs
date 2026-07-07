import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  MIGRATION_ORDER_POLICY,
  classifyMigrationFilename,
  buildMigrationOrderReport,
  validateMigrationOrderReport,
} from "../scripts/fieldgrid-migration-order-check.mjs";
import {
  buildFieldgridTestLayersPlan,
  validateFieldgridTestLayersPlan,
} from "../scripts/fieldgrid-test-layers.mjs";
import {
  buildStagingPromotionGatePlan,
  readSourceContractText,
  validateStagingPromotionGatePlan,
} from "../scripts/fieldgrid-staging-promotion-gate.mjs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("phase 4 migration order check accepts current legacy state and documents the cutover", async () => {
  const report = await buildMigrationOrderReport();
  const validation = validateMigrationOrderReport(report);

  assert.deepEqual(validation.errors, []);
  assert.equal(report.policy, MIGRATION_ORDER_POLICY);
  assert.equal(report.latestNumericPrefix, 101);
  assert.equal(report.legacy.timestampFloor, "20260618201212");
  assert.ok(
    report.runnerOrder.includes("20260618201212_assignment_monthly_codes.sql"),
  );
  assert.ok(
    Object.keys(report.legacy.allowedDuplicateNumericPrefixes).includes("055"),
  );
  assert.ok(
    Object.keys(report.legacy.allowedDuplicateNumericPrefixes).includes("064"),
  );
});

test("phase 4 migration order check blocks new numeric migrations after timestamp cutover", () => {
  const entries = [
    classifyMigrationFilename("101_fieldgrid_notification_content_v1.sql"),
    classifyMigrationFilename("102_future_numeric_migration.sql"),
    classifyMigrationFilename("20260618201212_assignment_monthly_codes.sql"),
  ];
  const validation = validateMigrationOrderReport({
    entries,
    totals: { sqlMigrations: entries.length },
    numericGaps: [],
  });

  assert.match(
    validation.errors.join("\n"),
    /102_future_numeric_migration\.sql/u,
  );
});

test("phase 4 test layers define security, UI, DB and live E2E lanes", async () => {
  const plan = await buildFieldgridTestLayersPlan();
  const errors = await validateFieldgridTestLayersPlan(plan);

  assert.deepEqual(errors, []);
  assert.deepEqual(
    plan.layers.map((layer) => layer.id),
    ["security-guards", "ui-contracttests", "db-migration-smoke", "live-e2e"],
  );
  assert.ok(
    plan.layers
      .find((layer) => layer.id === "security-guards")
      ?.ciCommand.includes("tenant-permissions"),
  );
  assert.ok(
    plan.layers
      .find((layer) => layer.id === "db-migration-smoke")
      ?.ciCommand.includes("fieldgrid:migration-order-check:check"),
  );
});

test("phase 4 staging promotion gate validates static CI contracts", async () => {
  const plan = await buildStagingPromotionGatePlan();
  const errors = await validateStagingPromotionGatePlan(plan);

  assert.deepEqual(errors, []);
  assert.equal(plan.promotionPath, "main -> staging");
  assert.ok(
    plan.requiredCommands.includes(
      "pnpm fieldgrid:staging-promotion-gate:check",
    ),
  );
  assert.ok(plan.evidenceDirectories.includes("artifacts/staging-smoke"));
  assert.ok(
    plan.signals.some((signal) => signal.id === "FG-OPS-CI-RUN-HISTORY"),
  );
});

test("phase 4 staging promotion gate can validate workflow contracts from GitHub workspace", async () => {
  const releaseRoot = mkdtempSync(join(tmpdir(), "fieldgrid-release-"));
  const workspaceRoot = mkdtempSync(join(tmpdir(), "fieldgrid-workspace-"));

  try {
    mkdirSync(join(workspaceRoot, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(workspaceRoot, ".github", "workflows", "deploy.yml"),
      "Validate Fieldgrid release signals\npnpm fieldgrid:staging-promotion-gate:check\n",
      "utf8",
    );

    const content = await readSourceContractText(".github/workflows/deploy.yml", {
      repoRoot: releaseRoot,
      githubWorkspace: workspaceRoot,
    });

    assert.match(content, /Validate Fieldgrid release signals/u);
    assert.match(content, /pnpm fieldgrid:staging-promotion-gate:check/u);
  } finally {
    rmSync(releaseRoot, { recursive: true, force: true });
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("phase 4 package scripts and workflows expose the release signals", () => {
  const packageJson = read("package.json");
  const promotionGuard = read(".github/workflows/promotion-guard.yml");
  const migrationSmoke = read(
    ".github/workflows/fieldgrid-migration-smoke.yml",
  );
  const deploy = read(".github/workflows/deploy.yml");

  assertContains(
    packageJson,
    [
      "fieldgrid:migration-order-check",
      "fieldgrid:test-layers",
      "fieldgrid:test:security",
      "fieldgrid:test:ui-contracts",
      "fieldgrid:test:db-migration",
      "fieldgrid:test:live-e2e",
      "fieldgrid:staging-promotion-gate",
      "fieldgrid:staging-promotion-gate:strict",
    ],
    "package scripts",
  );

  assertContains(
    `${promotionGuard}\n${migrationSmoke}\n${deploy}`,
    [
      'STAGING_RECOVERY_FREEZE: "false"',
      "Validate Fieldgrid release signals",
      "pnpm fieldgrid:migration-order-check:check",
      "pnpm fieldgrid:test-layers:check",
      "pnpm fieldgrid:staging-promotion-gate:check",
    ],
    "workflows",
  );
});

test("phase 4 dashboard surfaces staging promotion evidence", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-smoke.ts");
  const types = read(
    "artifacts/backoffice/src/app/actions/platform-smoke.types.ts",
  );
  const page = read(
    "artifacts/backoffice/src/app/(platform)/platform/staging-smoke/page.tsx",
  );

  assertContains(
    `${action}\n${types}\n${page}`,
    [
      "PlatformStagingPromotionGate",
      "PlatformStagingPromotionGateSignal",
      "buildStagingPromotionGate",
      "stagingPromotionGate",
      "StagingPromotionGateCard",
      "Staging promotion gate",
      "Evidence directories",
      "dashboard.stagingPromotionGate",
      "artifacts/staging-promotion-gate",
    ],
    "platform smoke dashboard",
  );
});

test("phase 4 docs record the promotion gate and docs cleanup policy", () => {
  const phase4 = read("docs/fieldgrid-phase-4-ops-ci-teststructure.md");
  const checklist = read("docs/fieldgrid-staging-promotion-checklist.md");
  const migrationSmoke = read("docs/fieldgrid-sprint-7-migration-smoke.md");
  const docsMaintenance = read("docs/fieldgrid-docs-maintenance.md");
  const prTemplate = read(".github/pull_request_template.md");

  assertContains(
    `${phase4}\n${checklist}\n${migrationSmoke}\n${docsMaintenance}\n${prTemplate}`,
    [
      "Definition of done",
      "security guards",
      "staging promotion gate",
      "Fase 9 - Ops, CI en teststructuur",
      "fieldgrid:migration-order-check:check",
      "fieldgrid:staging-promotion-gate:check",
      "Canonical docs",
      "Samenvoegen",
      "Verwijderen",
    ],
    "phase 4 docs",
  );
});

test("phase 4 command-line contracts validate", () => {
  const cwd = new URL("..", import.meta.url);

  assert.match(
    execFileSync(
      process.execPath,
      ["scripts/fieldgrid-migration-order-check.mjs", "--check"],
      {
        cwd,
        encoding: "utf8",
      },
    ),
    /migration order check is valid/u,
  );
  assert.match(
    execFileSync(
      process.execPath,
      ["scripts/fieldgrid-test-layers.mjs", "--check"],
      {
        cwd,
        encoding: "utf8",
      },
    ),
    /test layers contract is valid/u,
  );
  assert.match(
    execFileSync(
      process.execPath,
      ["scripts/fieldgrid-staging-promotion-gate.mjs", "--check"],
      {
        cwd,
        encoding: "utf8",
      },
    ),
    /staging promotion gate contract is valid/u,
  );
});
