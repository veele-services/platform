import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  FROZEN_LEGACY_MIGRATION_MANIFEST_SHA256,
  LEGACY_TIMESTAMP_FLOOR,
  MIGRATION_ORDER_POLICY,
  allowedHistoricalRecordedMigrations,
  allowedLegacyTimestampMigrations,
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
  assert.equal(report.legacy.manifestFilenames.length, 95);
  assert.equal(
    new Set(report.legacy.manifestFilenames).size,
    report.legacy.manifestFilenames.length,
  );
  assert.equal(
    report.legacy.manifestSha256,
    FROZEN_LEGACY_MIGRATION_MANIFEST_SHA256,
  );
  for (const filename of allowedLegacyTimestampMigrations) {
    assert.equal(
      report.runnerOrder.filter((name) => name === filename).length,
      1,
    );
    assert.equal(
      classifyMigrationFilename(filename).prefix,
      LEGACY_TIMESTAMP_FLOOR,
    );
  }
  assert.deepEqual(
    report.historicalRecordedMigrations.map((entry) => entry.recordedName),
    Object.keys(allowedHistoricalRecordedMigrations),
  );
  assert.ok(
    report.historicalRecordedMigrations.every(
      (entry) =>
        entry.recordedNamePresentInRunner === false &&
        (entry.kind === "tombstone" ||
          (entry.canonicalNamePresentInRunner === true &&
            entry.canonicalSha256 === entry.sqlSha256)),
    ),
  );
  const baseline = JSON.parse(read("lib/db/migrations/baseline.json"));
  assert.ok(
    baseline.sql.every((name) =>
      report.legacy.manifestFilenames.includes(name),
    ),
  );
});

test("phase 4 migration order check freezes every legacy filename and SQL hash", async () => {
  const source = new URL("../lib/db/migrations/", import.meta.url);
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-legacy-freeze-"));
  try {
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".sql")) {
        copyFileSync(new URL(entry.name, source), join(fixture, entry.name));
      }
    }

    writeFileSync(join(fixture, "003_retroactive.sql"), "select 1;\n");
    let report = await buildMigrationOrderReport({ migrationsDir: fixture });
    assert.match(
      validateMigrationOrderReport(report).errors.join("\n"),
      /bevroren legacy-migratiemanifest wijkt af/u,
    );

    rmSync(join(fixture, "003_retroactive.sql"));
    renameSync(
      join(fixture, "027_smtp_mail_settings.sql"),
      join(fixture, "027_renamed_mail_settings.sql"),
    );
    report = await buildMigrationOrderReport({ migrationsDir: fixture });
    assert.match(
      validateMigrationOrderReport(report).errors.join("\n"),
      /bevroren legacy-migratiemanifest wijkt af/u,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("phase 4 migration order check freezes renamed historical migration aliases", async () => {
  const source = new URL("../lib/db/migrations/", import.meta.url);
  const fixture = mkdtempSync(
    join(tmpdir(), "fieldgrid-historical-alias-freeze-"),
  );
  try {
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".sql")) {
        copyFileSync(new URL(entry.name, source), join(fixture, entry.name));
      }
    }
    const canonical = join(
      fixture,
      "20260708121000_cleanup_staging_demo_sector_descriptions.sql",
    );
    writeFileSync(canonical, `${readFileSync(canonical, "utf8")}\n`);
    const report = await buildMigrationOrderReport({
      migrationsDir: fixture,
    });
    assert.match(
      validateMigrationOrderReport(report).errors.join("\n"),
      /historische migratie-alias 102_cleanup_staging_demo_sector_descriptions\.sql wijkt af/iu,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
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

test("phase 4 test layers define runtime safety, security, UI, DB and live E2E lanes", async () => {
  const plan = await buildFieldgridTestLayersPlan();
  const errors = await validateFieldgridTestLayersPlan(plan);

  assert.deepEqual(errors, []);
  assert.deepEqual(
    plan.layers.map((layer) => layer.id),
    [
      "contract-static",
      "unit-domain",
      "security-source",
      "postgres17-migration-smoke",
      "db-integration-tenant-ab",
      "rls-security",
      "phase-b-previous-release-database-compatibility",
      "api-runtime",
      "security-guards",
      "ui-contracttests",
      "db-migration-smoke",
      "live-e2e",
    ],
  );
  assert.deepEqual(plan.requiredLayerIds, [
    "contract-static",
    "unit-domain",
    "security-source",
    "postgres17-migration-smoke",
    "db-integration-tenant-ab",
    "rls-security",
    "phase-b-previous-release-database-compatibility",
    "api-runtime",
  ]);
  assert.ok(
    plan.layers
      .find((layer) => layer.id === "contract-static")
      ?.ciCommand.includes("fieldgrid:runtime-safety:fixture-contract"),
  );
  assert.ok(
    plan.layers
      .find((layer) => layer.id === "security-source")
      ?.ciCommand.includes("fieldgrid:test:security-recursive"),
  );
  assert.ok(
    plan.layers
      .find((layer) => layer.id === "unit-domain")
      ?.ciCommand.includes("fieldgrid:test:domain-typescript"),
  );
  assert.ok(
    plan.layers
      .find((layer) => layer.id === "db-integration-tenant-ab")
      ?.ciCommand.includes("fieldgrid:test:db-regressions"),
  );
  assert.ok(
    plan.layers
      .find((layer) => layer.id === "rls-security")
      ?.ciCommand.includes("fieldgrid:runtime-safety:rls"),
  );
  assert.ok(
    plan.layers
      .find((layer) => layer.id === "api-runtime")
      ?.ciCommand.includes("fieldgrid:runtime-safety:api"),
  );
  assert.ok(
    plan.layers
      .find(
        (layer) =>
          layer.id === "phase-b-previous-release-database-compatibility",
      )
      ?.ciCommand.includes(
        "fieldgrid:runtime-safety:previous-release-compatibility",
      ),
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

test("phase 4 test layers reject no-op package scripts", async () => {
  const plan = await buildFieldgridTestLayersPlan();
  const packageManifest = JSON.parse(read("package.json"));
  packageManifest.scripts["fieldgrid:test:security-source"] = "true";

  assert.match(
    (
      await validateFieldgridTestLayersPlan(plan, {
        packageManifest,
      })
    ).join("\n"),
    /fieldgrid:test:security-source wijkt af/u,
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

    const content = await readSourceContractText(
      ".github/workflows/deploy.yml",
      {
        repoRoot: releaseRoot,
        githubWorkspace: workspaceRoot,
      },
    );

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
      "fieldgrid:test:domain-typescript",
      "fieldgrid:test:db-regressions",
      "fieldgrid:test:ui-contracts",
      "fieldgrid:test:db-migration",
      "fieldgrid:test:live-e2e",
      "fieldgrid:staging-promotion-gate",
      "fieldgrid:staging-promotion-gate:strict",
    ],
    "package scripts",
  );
  assert.match(
    packageJson,
    /DATABASE_URL is required for fieldgrid:test:db-regressions/u,
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
