import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
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
  MIGRATION_SMOKE_MAX_AGE_MS,
  bindW00StagingPrincipalArtifactToRelease,
  buildStagingPromotionGatePlan,
  collectPromotionEvidence,
  readSourceContractText,
  validateMigrationSmokeEvidence,
  validateStagingSmokeEvidence,
  validateStagingPromotionGatePlan,
  validateStrictW00StagingPrincipalArtifact,
  validateW00StagingPrincipalEvidence,
} from "../scripts/fieldgrid-staging-promotion-gate.mjs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

function greenMigrationResult(target) {
  return {
    target,
    label: target,
    startedAt: "2026-09-08T01:00:00.000Z",
    finishedAt: "2026-09-08T01:00:01.000Z",
    durationMs: 1_000,
    readiness: "pass",
    safetyReason: null,
    redactedDatabaseUrl: `postgresql://***@localhost/${target}`,
    exitCode: 0,
    timedOut: false,
    appliedMigrations: [],
    skippedMigrations: [],
    compatibilitySkippedMigrations: [],
    unresolvedRows: [],
    failedStatement: null,
    drizzleStarted: true,
    complete: true,
  };
}

function greenMigrationReport(
  targets = ["empty-database", "staging-copy"],
  { expectedMain = "", expectedStaging = "", nowMs = Date.now() } = {},
) {
  return {
    version: "sprint-7-migration-smoke-v1",
    createdAt: new Date(nowMs - 1_000).toISOString(),
    refs:
      expectedMain && expectedStaging
        ? {
            main: expectedMain,
            staging: expectedStaging,
            checkout: expectedMain,
          }
        : null,
    command: "pnpm --filter @workspace/db run db:migrate",
    results: targets.map(greenMigrationResult),
    summary: {
      status: "pass",
      passedTargets: [...targets],
      failedTargets: [],
      appliedMigrations: 0,
      skippedMigrations: 0,
      compatibilitySkippedMigrations: 0,
      unresolvedRows: 0,
    },
  };
}

function greenStagingSmokeReport({
  expectedStaging = "b".repeat(40),
  nowMs = Date.now(),
} = {}) {
  const completedAt = new Date(nowMs - 1_000).toISOString();
  const startedAt = new Date(nowMs - 2_000).toISOString();
  const checks = [
    "FG-SMOKE-HOST",
    "FG-SMOKE-LOGIN",
    "FG-SMOKE-MODULES",
    "FG-SMOKE-SECTORS",
    "FG-SMOKE-STORAGE",
    "FG-SMOKE-PDF-DOWNLOADS",
    "FG-SMOKE-MIGRATIONS",
    "FG-SMOKE-SUPPORT",
    "FG-SMOKE-AUDIT",
  ].map((id) => ({ id, status: "ok" }));
  return {
    version: "sprint-15-staging-smoke-v1",
    createdAt: completedAt,
    startedAt,
    finishedAt: completedAt,
    durationMs: 1_000,
    apiUrl: "https://staging.fieldgrid.nl/api/platform/staging-smoke",
    expectedStagingSha: expectedStaging,
    deployedStagingSha: expectedStaging,
    releaseIdentity: {
      expectedStagingSha: expectedStaging,
      deployedStagingSha: expectedStaging,
      apiReleaseSha: expectedStaging,
      canonicalMarkerSha: null,
      source: "api",
    },
    status: "pass",
    httpStatus: 200,
    summary: { status: "pass", message: "ok" },
    checks: checks.map((check) => check.id),
    dashboard: {
      generatedAt: "2026-09-08T01:00:00.000Z",
      environment: {
        releaseSha: expectedStaging,
        platformHost: "platform.fieldgrid.nl",
        stagingHost: "staging.fieldgrid.nl",
        pilotTenantSlug: "field-demo",
        pilotTenantHost: "field-demo.staging.fieldgrid.nl",
        platformHostKnown: true,
        stagingHostKnown: true,
      },
      totals: { tenants: 1, activeTenants: 1 },
      checks,
      runHistory: [],
      liveSmokes: [],
      migrationSmoke: { status: "ok" },
      mutatingChecks: [],
      stagingPromotionGate: { status: "warning" },
      minimumGreen: [
        "FG-SMOKE-HOST",
        "FG-SMOKE-LOGIN",
        "FG-SMOKE-MODULES",
        "FG-SMOKE-SECTORS",
        "FG-SMOKE-STORAGE",
        "FG-SMOKE-MIGRATIONS",
      ],
    },
  };
}

function greenW00StagingPrincipalReport(
  nowMs = Date.now(),
  expectedDeployedSha = "b".repeat(40),
) {
  return {
    name: "fieldgrid-w00-staging-principal-gate",
    status: "passed",
    mode: "strict",
    destructive: false,
    transactionMode: "read only",
    completedAt: new Date(nowMs - 500).toISOString(),
    release: {
      version: "w00-staging-principal-release-binding-v1",
      expectedDeployedSha,
      markerSha: expectedDeployedSha,
      exactMatch: true,
      source: ".fieldgrid-release-sha",
      boundAt: new Date(nowMs - 250).toISOString(),
    },
    evidence: {
      projectFingerprint: "c".repeat(64),
      currentUser: "fieldgrid_migration_admin",
      sessionUser: "fieldgrid_migration_admin",
      currentUserIsSuperuser: false,
      currentUserBypassesRls: false,
      sessionIdentityMatches: true,
      sessionUserCanControlPrivilegedRole: false,
      transactionReadOnly: true,
      tables: ["organization_settings", "tenant_domains"].map((table_name) => ({
        table_name,
        owner: "fieldgrid_migration_admin",
        current_user_is_owner: true,
        owner_privileges_effective: true,
        owner_role_settable: false,
        rls_enabled: true,
        rls_forced: false,
      })),
      catalogClosure: {
        rolesVerified: 3,
        tablesVerified: 2,
        ownersUnified: true,
        currentUserOwnsAll: true,
        rlsEnabled: true,
        rlsForced: false,
        policies: 7,
        policyProfile: "runtime-data-v1",
        runtimeRolesVerified: 2,
        runtimeMembershipsVerified: 3,
        runtimeTablePrivilegesVerified: 32,
        directAclViolations: 0,
        effectivePrivilegeViolations: 0,
        controllableRoleViolations: 0,
      },
      paths: ["tenant-a", "tenant-b"].map((label) => ({
        label,
        inputFingerprint:
          label === "tenant-a" ? "d".repeat(64) : "e".repeat(64),
        resolvedExactlyOnce: true,
        hostTenantMatched: true,
        settingsTenantMatched: true,
      })),
      tenantPathsDistinct: true,
    },
  };
}

function greenConstraintProof() {
  return {
    version: "tenant-user-role-constraint-proof-v1",
    constraints: [
      {
        name: "tenant_user_roles_tenant_membership_fk",
        type: "f",
        validated: true,
        tableSchema: "public",
        table: "tenant_user_roles",
        columns: ["tenant_id", "user_id"],
        referencedSchema: "public",
        referencedTable: "tenant_users",
        referencedColumns: ["tenant_id", "user_id"],
      },
      {
        name: "tenant_user_roles_tenant_role_scope_fk",
        type: "f",
        validated: true,
        tableSchema: "public",
        table: "tenant_user_roles",
        columns: ["tenant_id", "tenant_role_id"],
        referencedSchema: "public",
        referencedTable: "tenant_roles",
        referencedColumns: ["tenant_id", "id"],
      },
    ],
  };
}

function writeJson(path, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, content, "utf8");
  return Buffer.from(content);
}

function writeGreenPromotionEvidence(
  root,
  mainSha,
  stagingSha,
  nowMs = Date.now(),
) {
  const stagingDirectory = join(root, "artifacts", "staging-smoke");
  const migrationDirectory = join(root, "artifacts", "migration-smoke");
  const phase2eDirectory = join(root, "artifacts", "phase2e-staging-preflight");
  const runtimeReportDirectory = join(
    root,
    "artifacts",
    "runtime-safety-harness",
    "reports",
  );
  for (const directory of [
    stagingDirectory,
    migrationDirectory,
    phase2eDirectory,
    runtimeReportDirectory,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  writeJson(
    join(stagingDirectory, "staging.json"),
    greenStagingSmokeReport({ expectedStaging: stagingSha, nowMs }),
  );
  const migrationReportPath = join(migrationDirectory, "migration.json");
  const migrationBytes = writeJson(
    migrationReportPath,
    greenMigrationReport(undefined, {
      expectedMain: mainSha,
      expectedStaging: stagingSha,
      nowMs,
    }),
  );
  const phase2e = {
    version: "phase2e-staging-preflight-v2",
    status: "pass",
    classification: {
      candidateDatabaseRehearsal: true,
      liveStagingEvidence: false,
      w12Evidence: false,
    },
    startedAt: new Date(nowMs - 2_000).toISOString(),
    finishedAt: new Date(nowMs - 1_000).toISOString(),
    environment: "staging",
    refs: { main: mainSha, staging: stagingSha, checkout: mainSha },
    rollback: {
      baseDir: "/var/www/veele/staging",
      currentRelease: `/var/www/veele/staging/releases/20260908000000-${stagingSha.slice(0, 7)}`,
      marker: stagingSha,
      servicesActive: [
        "veele-staging",
        "veele-staging-personeel",
        "veele-staging-klant",
        "veele-staging-api",
      ],
      expectedGitStagingSha: stagingSha,
      expectedActiveStagingReleaseSha: stagingSha,
      gitAndActiveAligned: true,
      recoveryMode: "aligned",
      recoveryProof: null,
    },
    database: {
      tls: {
        mode: "verify-full",
        rootCertificateSha256:
          "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa",
        certificatePathRecorded: false,
      },
      sourcePostgresMajor: 17,
      constraintReadiness: {
        version: "tenant-user-role-constraint-readiness-v1",
        roleScopeMismatches: 0,
        membershipMismatches: 0,
      },
      backup: { sizeBytes: 10, sha256: "a".repeat(64) },
      restore: { isolated: true, disposedAfterProof: true },
      migration: {
        status: "pass",
        artifact: {
          path: "artifacts/migration-smoke/migration.json",
          sizeBytes: migrationBytes.byteLength,
          sha256: createHash("sha256").update(migrationBytes).digest("hex"),
          version: "sprint-7-migration-smoke-v1",
          targets: ["empty-database", "staging-copy"],
        },
      },
      migrationDataIntegrity: {
        durableCountsMatched: true,
        rawIdentifiersRecorded: false,
      },
      proof: { tenantUserRoleConstraints: greenConstraintProof() },
    },
    promotionPerformed: false,
    deploymentPerformed: false,
  };
  writeJson(join(phase2eDirectory, "phase2e-staging-preflight.json"), phase2e);
  writeJson(
    join(runtimeReportDirectory, "w00-staging-principal-gate.json"),
    greenW00StagingPrincipalReport(nowMs, mainSha),
  );
  return { migrationReportPath, phase2e, phase2eDirectory };
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
      "w00-db-acl-hardening",
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
    "w00-db-acl-hardening",
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
      .find((layer) => layer.id === "security-source")
      ?.requiredTestFiles.includes(
        "tests/security/fieldgrid-w00-db-acl-hardening-source.test.mjs",
      ),
  );
  const rlsLayer = plan.layers.find((layer) => layer.id === "rls-security");
  assert.equal(
    rlsLayer?.ciCommand,
    "pnpm fieldgrid:runtime-safety:setup && pnpm fieldgrid:runtime-safety:fixtures && pnpm fieldgrid:runtime-safety:rls",
  );
  assert.deepEqual(rlsLayer?.requiredTestFiles, [
    "tests/security/assignment-personnel-tenant-guard-source.test.mjs",
    "scripts/fieldgrid-runtime-safety-rls-harness.mjs",
    "scripts/fieldgrid-w00-db-acl-closure.mjs",
  ]);
  assert.deepEqual(rlsLayer?.requiredSignals, [
    "FG-AUTHENTICATED-RLS",
    "FG-MULTI-TENANT-CONTEXT",
  ]);
  assert.equal(
    plan.packageScripts["fieldgrid:test:rls-security"],
    rlsLayer?.ciCommand,
  );
  const w00DbAclLayer = plan.layers.find(
    (layer) => layer.id === "w00-db-acl-hardening",
  );
  assert.equal(
    w00DbAclLayer?.ciCommand,
    "pnpm fieldgrid:runtime-safety:setup && pnpm fieldgrid:runtime-safety:fixtures && node scripts/fieldgrid-w00-db-acl-hardening-runtime.mjs",
  );
  assert.deepEqual(w00DbAclLayer?.requiredTestFiles, [
    "scripts/fieldgrid-w00-db-acl-hardening-runtime.mjs",
    "tests/security/fieldgrid-w00-db-acl-hardening-source.test.mjs",
  ]);
  assert.deepEqual(w00DbAclLayer?.requiredSignals, ["FG-W00-DB-ACL-HARDENING"]);
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
    plan.evidenceDirectories.includes("artifacts/phase2e-staging-preflight"),
  );
  assert.ok(
    plan.signals.some((signal) => signal.id === "FG-OPS-CI-RUN-HISTORY"),
  );
});

test("promotion evidence validators reject incomplete or non-green smoke artifacts", () => {
  const expectedStaging = "b".repeat(40);
  const nowMs = Date.now();
  assert.deepEqual(
    validateStagingSmokeEvidence(
      greenStagingSmokeReport({ expectedStaging, nowMs }),
      { expectedStaging, nowMs },
    ),
    [],
  );
  assert.deepEqual(validateMigrationSmokeEvidence(greenMigrationReport()), []);

  const exactMigration = greenMigrationReport(undefined, {
    expectedMain: "a".repeat(40),
    expectedStaging,
    nowMs,
  });
  assert.deepEqual(
    validateMigrationSmokeEvidence(exactMigration, {
      expectedMain: "a".repeat(40),
      expectedStaging,
      nowMs,
      maxAgeMs: MIGRATION_SMOKE_MAX_AGE_MS,
    }),
    [],
  );

  const staleMigration = greenMigrationReport(undefined, {
    expectedMain: "a".repeat(40),
    expectedStaging,
    nowMs: nowMs - MIGRATION_SMOKE_MAX_AGE_MS - 1,
  });
  assert.match(
    validateMigrationSmokeEvidence(staleMigration, {
      expectedMain: "a".repeat(40),
      expectedStaging,
      nowMs,
      maxAgeMs: MIGRATION_SMOKE_MAX_AGE_MS,
    }).join(" "),
    /stale/u,
  );

  const wrongShaMigration = structuredClone(exactMigration);
  wrongShaMigration.refs.main = "c".repeat(40);
  assert.match(
    validateMigrationSmokeEvidence(wrongShaMigration, {
      expectedMain: "a".repeat(40),
      expectedStaging,
      nowMs,
      maxAgeMs: MIGRATION_SMOKE_MAX_AGE_MS,
    }).join(" "),
    /exact release SHAs/u,
  );

  const failedStaging = greenStagingSmokeReport({ expectedStaging, nowMs });
  failedStaging.status = "fail";
  assert.match(
    validateStagingSmokeEvidence(failedStaging, {
      expectedStaging,
      nowMs,
    }).join(" "),
    /not pass/u,
  );
  const partialMigration = greenMigrationReport(["staging-copy"]);
  assert.match(
    validateMigrationSmokeEvidence(partialMigration).join(" "),
    /exactly: empty-database, staging-copy/u,
  );
  const unresolvedMigration = greenMigrationReport();
  unresolvedMigration.results[0].unresolvedRows = [1];
  unresolvedMigration.summary.unresolvedRows = 1;
  assert.match(
    validateMigrationSmokeEvidence(unresolvedMigration).join(" "),
    /unresolved rows/u,
  );
});

test("staging-smoke evidence rejects empty, fake, blocked, stale and wrong-SHA dashboards", () => {
  const expectedStaging = "a".repeat(40);
  const nowMs = Date.now();
  const validate = (report) =>
    validateStagingSmokeEvidence(report, { expectedStaging, nowMs }).join(" ");

  const empty = greenStagingSmokeReport({ expectedStaging, nowMs });
  empty.checks = [];
  empty.dashboard.checks = [];
  assert.match(validate(empty), /every known check|required check/u);

  const fake = greenStagingSmokeReport({ expectedStaging, nowMs });
  fake.dashboard.checks[0].id = "FG-FAKE";
  fake.checks = fake.dashboard.checks.map((check) => check.id);
  assert.match(validate(fake), /every known check/u);

  const blocked = greenStagingSmokeReport({ expectedStaging, nowMs });
  blocked.dashboard.checks.find(
    (check) => check.id === "FG-SMOKE-LOGIN",
  ).status = "blocked";
  assert.match(validate(blocked), /not ok|blocked dashboard/u);

  const stale = greenStagingSmokeReport({
    expectedStaging,
    nowMs: nowMs - 2 * 60 * 60 * 1000,
  });
  assert.match(validate(stale), /stale/u);

  const wrongSha = greenStagingSmokeReport({
    expectedStaging: "c".repeat(40),
    nowMs,
  });
  assert.match(validate(wrongSha), /exact staging SHA|release identity/u);
});

test("promotion evidence discovery is recursive, hashed and ignores symlinks", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-promotion-evidence-"));
  const outside = mkdtempSync(join(tmpdir(), "fieldgrid-promotion-outside-"));
  const expectedStaging = "b".repeat(40);
  const nowMs = Date.now();
  try {
    const directory = join(fixture, "artifacts", "staging-smoke", "nested");
    mkdirSync(directory, { recursive: true });
    const validPath = join(directory, "valid.json");
    const validBytes = writeJson(
      validPath,
      greenStagingSmokeReport({ expectedStaging, nowMs }),
    );
    writeFileSync(join(directory, "malformed.json"), "{", "utf8");
    writeJson(join(directory, "arbitrary.json"), {});
    const outsidePath = join(outside, "outside.json");
    writeJson(outsidePath, greenStagingSmokeReport({ expectedStaging, nowMs }));
    symlinkSync(outsidePath, join(directory, "outside-link.json"));

    const first = await collectPromotionEvidence({
      repoRoot: fixture,
      expectedStaging,
      nowMs,
    });
    const artifacts = first["artifacts/staging-smoke"];
    assert.equal(artifacts.length, 3);
    const valid = artifacts.find((artifact) =>
      artifact.path.endsWith("nested/valid.json"),
    );
    assert.equal(valid.semanticStatus, "valid");
    assert.equal(valid.sizeBytes, validBytes.byteLength);
    assert.equal(
      valid.sha256,
      createHash("sha256").update(validBytes).digest("hex"),
    );
    assert.equal(
      artifacts.filter((artifact) => artifact.semanticStatus === "invalid")
        .length,
      2,
    );
    assert.equal(
      artifacts.some((artifact) => artifact.path.includes("outside-link")),
      false,
    );

    const second = await collectPromotionEvidence({
      repoRoot: fixture,
      expectedStaging,
      nowMs,
    });
    assert.equal(
      second["artifacts/staging-smoke"].find((artifact) =>
        artifact.path.endsWith("nested/valid.json"),
      ).sha256,
      valid.sha256,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("W00 staging-principal evidence requires a fresh exact release-SHA binding", () => {
  const expectedDeployedSha = "f".repeat(40);
  const nowMs = Date.now();
  const green = greenW00StagingPrincipalReport(nowMs, expectedDeployedSha);
  assert.deepEqual(
    validateW00StagingPrincipalEvidence(green, {
      nowMs,
      expectedDeployedSha,
    }),
    [],
  );

  const wrongPolicyCount = structuredClone(green);
  wrongPolicyCount.evidence.catalogClosure.policies = 0;
  assert.match(
    validateW00StagingPrincipalEvidence(wrongPolicyCount, {
      nowMs,
      expectedDeployedSha,
    }).join(" "),
    /ACL closure proof/u,
  );

  const wrongPolicyProfile = structuredClone(green);
  wrongPolicyProfile.evidence.catalogClosure.policyProfile = "policy-free";
  assert.match(
    validateW00StagingPrincipalEvidence(wrongPolicyProfile, {
      nowMs,
      expectedDeployedSha,
    }).join(" "),
    /ACL closure proof/u,
  );

  for (const [field, value] of [
    ["runtimeRolesVerified", 0],
    ["runtimeMembershipsVerified", 4],
    ["runtimeTablePrivilegesVerified", 31],
  ]) {
    const wrongRuntimeClosure = structuredClone(green);
    wrongRuntimeClosure.evidence.catalogClosure[field] = value;
    assert.match(
      validateW00StagingPrincipalEvidence(wrongRuntimeClosure, {
        nowMs,
        expectedDeployedSha,
      }).join(" "),
      /ACL closure proof/u,
    );
  }

  const wrong = structuredClone(green);
  wrong.release.markerSha = "a".repeat(40);
  assert.match(
    validateW00StagingPrincipalEvidence(wrong, {
      nowMs,
      expectedDeployedSha,
    }).join(" "),
    /exact deployed release SHA/u,
  );

  const missing = structuredClone(green);
  delete missing.release;
  assert.match(
    validateW00StagingPrincipalEvidence(missing, {
      nowMs,
      expectedDeployedSha,
    }).join(" "),
    /exact deployed release SHA/u,
  );

  const stale = greenW00StagingPrincipalReport(
    nowMs - 60 * 60 * 1000,
    expectedDeployedSha,
  );
  assert.match(
    validateW00StagingPrincipalEvidence(stale, {
      nowMs,
      expectedDeployedSha,
    }).join(" "),
    /stale/u,
  );
});

test("pre-activation W00 gate binds the strict report to the fixed release marker", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-w00-activation-"));
  const expectedDeployedSha = "9".repeat(40);
  const nowMs = Date.now();
  const reportDirectory = join(
    fixture,
    "artifacts",
    "runtime-safety-harness",
    "reports",
  );
  try {
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(
      join(fixture, ".fieldgrid-release-sha"),
      `${expectedDeployedSha}\n`,
      "utf8",
    );
    const unbound = greenW00StagingPrincipalReport(nowMs, expectedDeployedSha);
    delete unbound.release;
    writeJson(
      join(reportDirectory, "w00-staging-principal-gate.json"),
      unbound,
    );

    const bound = await bindW00StagingPrincipalArtifactToRelease({
      repoRoot: fixture,
      expectedDeployedSha,
      nowMs,
    });
    assert.equal(bound.release.markerSha, expectedDeployedSha);
    assert.deepEqual(
      await validateStrictW00StagingPrincipalArtifact({
        repoRoot: fixture,
        expectedDeployedSha,
        nowMs,
      }),
      [],
    );

    writeFileSync(
      join(fixture, ".fieldgrid-release-sha"),
      `${"8".repeat(40)}\n`,
      "utf8",
    );
    await assert.rejects(
      bindW00StagingPrincipalArtifactToRelease({
        repoRoot: fixture,
        expectedDeployedSha,
        nowMs,
      }),
      /marker differs/u,
    );

    rmSync(join(fixture, ".fieldgrid-release-sha"));
    await assert.rejects(
      bindW00StagingPrincipalArtifactToRelease({
        repoRoot: fixture,
        expectedDeployedSha,
        nowMs,
      }),
      /must exist/u,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("Phase2E evidence is exact-SHA, child-hash bound and explicitly non-live/non-W12", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-phase2e-evidence-"));
  const expectedMain = "a".repeat(40);
  const expectedStaging = "b".repeat(40);
  try {
    const { migrationReportPath, phase2e, phase2eDirectory } =
      writeGreenPromotionEvidence(fixture, expectedMain, expectedStaging);
    let evidence = await collectPromotionEvidence({
      repoRoot: fixture,
      expectedMain,
      expectedStaging,
    });
    let artifact = evidence["artifacts/phase2e-staging-preflight"].find(
      (candidate) => candidate.kind === "phase2e-staging-preflight",
    );
    assert.equal(artifact.semanticStatus, "valid");
    assert.deepEqual(artifact.classification, {
      candidateDatabaseRehearsal: true,
      liveStagingEvidence: false,
      w12Evidence: false,
    });

    evidence = await collectPromotionEvidence({
      repoRoot: fixture,
      expectedMain: "c".repeat(40),
      expectedStaging,
    });
    artifact = evidence["artifacts/phase2e-staging-preflight"].find(
      (candidate) => candidate.kind === "phase2e-staging-preflight",
    );
    assert.equal(artifact.semanticStatus, "invalid");
    assert.match(artifact.validationErrors.join(" "), /exact release SHAs/u);

    writeFileSync(migrationReportPath, "{}\n", "utf8");
    evidence = await collectPromotionEvidence({
      repoRoot: fixture,
      expectedMain,
      expectedStaging,
    });
    artifact = evidence["artifacts/phase2e-staging-preflight"].find(
      (candidate) => candidate.kind === "phase2e-staging-preflight",
    );
    assert.equal(artifact.semanticStatus, "invalid");
    assert.match(artifact.validationErrors.join(" "), /hash does not match/u);

    phase2e.database.migration.artifact.path =
      "artifacts/migration-smoke/../../../outside.json";
    writeJson(
      join(phase2eDirectory, "phase2e-staging-preflight.json"),
      phase2e,
    );
    evidence = await collectPromotionEvidence({
      repoRoot: fixture,
      expectedMain,
      expectedStaging,
    });
    artifact = evidence["artifacts/phase2e-staging-preflight"].find(
      (candidate) => candidate.kind === "phase2e-staging-preflight",
    );
    assert.equal(artifact.semanticStatus, "invalid");
    assert.match(artifact.validationErrors.join(" "), /escapes/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("strict promotion counts only semantically valid evidence", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-strict-evidence-"));
  const expectedMain = "d".repeat(40);
  const expectedStaging = "e".repeat(40);
  try {
    writeGreenPromotionEvidence(fixture, expectedMain, expectedStaging);
    writeJson(
      join(fixture, "artifacts", "staging-smoke", "arbitrary.json"),
      {},
    );
    const plan = await buildStagingPromotionGatePlan({
      strictEvidence: true,
      repoRoot: fixture,
      expectedMain,
      expectedStaging,
    });
    assert.deepEqual(await validateStagingPromotionGatePlan(plan), []);
    assert.equal(
      plan.evidence["artifacts/staging-smoke"].filter(
        (artifact) => artifact.semanticStatus === "valid",
      ).length,
      1,
    );
    assert.equal(
      plan.evidence["artifacts/staging-smoke"].filter(
        (artifact) => artifact.semanticStatus === "invalid",
      ).length,
      1,
    );
    assert.deepEqual(plan.evidenceClassification.phase2e, {
      candidateDatabaseRehearsal: true,
      liveStagingEvidence: false,
      w12Evidence: false,
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("strict promotion reads evidence only from its isolated authenticated root", async () => {
  const localRoot = mkdtempSync(join(tmpdir(), "fieldgrid-local-forgery-"));
  const authenticatedRoot = mkdtempSync(
    join(tmpdir(), "fieldgrid-authenticated-root-"),
  );
  const expectedMain = "d".repeat(40);
  const expectedStaging = "e".repeat(40);
  const nowMs = Date.now();
  try {
    writeGreenPromotionEvidence(
      authenticatedRoot,
      expectedMain,
      expectedStaging,
      nowMs,
    );
    const forged = greenStagingSmokeReport({ expectedStaging, nowMs });
    forged.status = "fail";
    mkdirSync(join(localRoot, "artifacts", "staging-smoke"), {
      recursive: true,
    });
    writeJson(
      join(localRoot, "artifacts", "staging-smoke", "forged.json"),
      forged,
    );

    const plan = await buildStagingPromotionGatePlan({
      strictEvidence: true,
      repoRoot: localRoot,
      evidenceRoot: authenticatedRoot,
      expectedMain,
      expectedStaging,
      nowMs,
    });

    assert.deepEqual(await validateStagingPromotionGatePlan(plan), []);
    assert.equal(
      plan.evidence["artifacts/staging-smoke"].some((artifact) =>
        artifact.path.includes("forged.json"),
      ),
      false,
    );
  } finally {
    rmSync(localRoot, { recursive: true, force: true });
    rmSync(authenticatedRoot, { recursive: true, force: true });
  }
});

test("newer failed release evidence cannot be masked by an older pass", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-latest-evidence-"));
  const expectedMain = "d".repeat(40);
  const expectedStaging = "e".repeat(40);
  const nowMs = Date.now();
  try {
    writeGreenPromotionEvidence(fixture, expectedMain, expectedStaging, nowMs);
    const newerFailed = greenStagingSmokeReport({
      expectedStaging,
      nowMs: nowMs + 500,
    });
    newerFailed.status = "fail";
    writeJson(
      join(fixture, "artifacts", "staging-smoke", "newer-failed.json"),
      newerFailed,
    );

    const plan = await buildStagingPromotionGatePlan({
      strictEvidence: true,
      repoRoot: fixture,
      expectedMain,
      expectedStaging,
      nowMs,
    });
    const errors = await validateStagingPromotionGatePlan(plan);

    assert.match(
      errors.join(" "),
      /Strict evidence blokkeert op FG-OPS-CI-RUN-HISTORY/u,
    );
    assert.equal(
      plan.evidence["artifacts/staging-smoke"].filter(
        (artifact) => artifact.semanticStatus === "valid",
      ).length,
      1,
      "the older valid artifact remains visible for audit",
    );
    assert.equal(
      plan.signals.find((signal) => signal.id === "FG-OPS-CI-RUN-HISTORY")
        ?.status,
      "blocked",
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("strict promotion keeps the Git ref binding while validating a proven active rollback release", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-recovered-release-"));
  const expectedMain = "d".repeat(40);
  const expectedStaging = "e".repeat(40);
  const expectedActive = "c".repeat(40);
  const nowMs = Date.now();
  try {
    const { phase2e, phase2eDirectory } = writeGreenPromotionEvidence(
      fixture,
      expectedMain,
      expectedStaging,
      nowMs,
    );
    phase2e.rollback = {
      baseDir: "/var/www/veele/staging",
      currentRelease: `/var/www/veele/staging/releases/20260901000000-${expectedActive.slice(0, 7)}`,
      marker: expectedActive,
      servicesActive: [
        "veele-staging",
        "veele-staging-personeel",
        "veele-staging-klant",
        "veele-staging-api",
      ],
      expectedGitStagingSha: expectedStaging,
      expectedActiveStagingReleaseSha: expectedActive,
      gitAndActiveAligned: false,
      recoveryMode: "verified-deploy-rollback",
      recoveryProof: {
        version: "phase2e-staging-rollback-recovery-v1",
        mode: "verified-deploy-rollback",
        expectedGitStagingSha: expectedStaging,
        expectedActiveStagingReleaseSha: expectedActive,
        deployRun: {
          id: "12345",
          headSha: expectedStaging,
          branch: "staging",
          attempt: 1,
          status: "completed",
          conclusion: "failure",
          updatedAt: new Date(nowMs - 500).toISOString(),
          apiVerified: true,
        },
        diagnostics: {
          artifactId: 987,
          artifactName: "fieldgrid-staging-deploy-diagnostics-12345",
          updatedAt: new Date(nowMs - 250).toISOString(),
          sha256: "f".repeat(64),
          schemaVersion: "fieldgrid-deploy-health-gate-v2",
          exactSchemaVerified: true,
          checkCount: 10,
          failedCheckCount: 1,
        },
      },
    };
    writeJson(
      join(phase2eDirectory, "phase2e-staging-preflight.json"),
      phase2e,
    );
    writeJson(
      join(fixture, "artifacts", "staging-smoke", "staging.json"),
      greenStagingSmokeReport({
        expectedStaging: expectedActive,
        nowMs,
      }),
    );

    const plan = await buildStagingPromotionGatePlan({
      strictEvidence: true,
      repoRoot: fixture,
      expectedMain,
      expectedStaging,
      nowMs,
    });

    assert.deepEqual(await validateStagingPromotionGatePlan(plan), []);
    assert.equal(plan.expectedRefs.staging, expectedStaging);
    assert.equal(
      plan.evidence["artifacts/staging-smoke"].find(
        (artifact) => artifact.kind === "staging-smoke",
      )?.semanticStatus,
      "valid",
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
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
      "fieldgrid:test:rls-security",
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
      "Validate Fieldgrid release contracts (static)",
      "pnpm fieldgrid:migration-order-check:check",
      "pnpm fieldgrid:test-layers:check",
      "pnpm fieldgrid:staging-promotion-gate:check",
    ],
    "workflows",
  );
});

test("staging release paths separate runtime and migration principals with verified TLS", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const preflight = read(".github/workflows/phase2e-staging-preflight.yml");
  const promoter = read("scripts/fieldgrid-phase2e-staging-promote.mjs");
  const phase2e = read("scripts/fieldgrid-phase2e-staging-preflight.mjs");
  const runtimeConnection = read("lib/db/src/connection.ts");
  const databaseEnvironment = read("lib/db/src/database-environment.ts");
  const migrationRunner = read("lib/db/src/migrate.ts");
  const smtpBackfill = read("scripts/fieldgrid-smtp-credential-backfill.mts");
  const objectBackfill = read(
    "scripts/fieldgrid-object-security-legacy-backfill.mts",
  );

  assert.match(
    deploy,
    /FIELDGRID_MIGRATION_DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/u,
  );
  assert.match(
    deploy,
    /DATABASE_URL:\s*\$\{\{\s*secrets\.FIELDGRID_RUNTIME_DATABASE_URL\s*\}\}/u,
  );
  assert.match(deploy, /--require-migration-database/u);
  assert.match(deploy, /DB_SSL_REJECT_UNAUTHORIZED:\s*"true"/u);
  assert.match(deploy, /PGSSLMODE:\s*verify-full/u);
  assert.match(deploy, /FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64/u);
  assert.match(deploy, /fieldgrid-database-root-cert\.mjs/u);
  const environmentFileStep = deploy.slice(
    deploy.indexOf("- name: Write environment file"),
    deploy.indexOf("- name: Install dependencies"),
  );
  assert.match(environmentFileStep, /printf 'DATABASE_URL=%s\\n'/u);
  assert.match(environmentFileStep, /ENV_FILE="\$RELEASE\/\.env"/u);
  assert.doesNotMatch(
    environmentFileStep,
    /\}\s*>\s*"\$BASE_DIR\/shared\/\.env"/u,
  );
  assert.doesNotMatch(environmentFileStep, /FIELDGRID_MIGRATION_DATABASE_URL/u);

  const migrationIndex = deploy.indexOf("- name: Run database migrations");
  const smtpBackfillIndex = deploy.indexOf(
    "- name: Backfill staging SMTP credentials",
  );
  const objectBackfillIndex = deploy.indexOf(
    "- name: Encrypt and clear legacy object secrets",
  );
  const smtpPlaintextIndex = deploy.indexOf(
    "- name: Verify no plaintext SMTP credentials remain",
  );
  const objectPlaintextIndex = deploy.indexOf(
    "- name: Verify no plaintext object secrets remain",
  );
  const emailReadinessIndex = deploy.indexOf(
    "- name: Verify staging e-mail provider readiness",
  );
  const principalIndex = deploy.indexOf(
    "- name: Verify migration-admin ownership before runtime principal cutover",
  );
  const bindingIndex = deploy.indexOf("--strict-w00-principal");
  const runtimeProvisionIndex = deploy.indexOf(
    "- name: Provision staging runtime database principal",
  );
  const runtimePrincipalIndex = deploy.indexOf(
    "- name: Verify least-privileged staging runtime principal",
  );
  const activationIndex = deploy.indexOf("- name: Activate staging release");
  assert.ok(migrationIndex >= 0 && migrationIndex < principalIndex);
  for (const prerequisiteIndex of [
    smtpBackfillIndex,
    objectBackfillIndex,
    smtpPlaintextIndex,
    objectPlaintextIndex,
    emailReadinessIndex,
  ]) {
    assert.ok(
      prerequisiteIndex > migrationIndex && prerequisiteIndex < principalIndex,
      "every database-backed release prerequisite must finish before W00",
    );
  }
  assert.ok(
    principalIndex < bindingIndex &&
      bindingIndex < runtimeProvisionIndex &&
      runtimeProvisionIndex < runtimePrincipalIndex &&
      runtimePrincipalIndex < activationIndex,
    "admin ownership, idempotent runtime provisioning and runtime proof must all finish in fail-closed order before activation",
  );
  assert.match(
    deploy,
    /FIELDGRID_MIGRATION_DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}[\s\S]*FIELDGRID_W00_STAGING_DATABASE_URL="\$FIELDGRID_MIGRATION_DATABASE_URL"/u,
  );
  assert.doesNotMatch(
    deploy,
    /FIELDGRID_W00_STAGING_DATABASE_URL="\$DATABASE_URL"/u,
  );

  const runtimeProvisionStep = deploy.slice(
    runtimeProvisionIndex,
    runtimePrincipalIndex,
  );
  assert.match(
    runtimeProvisionStep,
    /FIELDGRID_MIGRATION_DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/u,
  );
  assert.match(
    runtimeProvisionStep,
    /FIELDGRID_RUNTIME_DATABASE_PASSWORD:\s*\$\{\{\s*secrets\.FIELDGRID_RUNTIME_DATABASE_PASSWORD\s*\}\}/u,
  );
  assert.match(
    runtimeProvisionStep,
    /FIELDGRID_RUNTIME_DATABASE_URL:\s*\$\{\{\s*secrets\.FIELDGRID_RUNTIME_DATABASE_URL\s*\}\}/u,
  );
  assert.match(
    runtimeProvisionStep,
    /FIELDGRID_RUNTIME_EXPECTED_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/u,
  );
  assert.match(
    runtimeProvisionStep,
    /FIELDGRID_RUNTIME_PRINCIPAL_CONFIRM:\s*fieldgrid-w00-runtime-principal-staging-v1/u,
  );
  assert.match(
    runtimeProvisionStep,
    /node scripts\/fieldgrid-w00-runtime-principal\.mjs --apply/u,
  );

  const runtimePrincipalStep = deploy.slice(
    runtimePrincipalIndex,
    activationIndex,
  );
  assert.match(
    runtimePrincipalStep,
    /FIELDGRID_RUNTIME_DATABASE_URL:\s*\$\{\{\s*secrets\.FIELDGRID_RUNTIME_DATABASE_URL\s*\}\}/u,
  );
  assert.match(
    runtimePrincipalStep,
    /node scripts\/fieldgrid-w00-runtime-principal-gate\.mjs --strict/u,
  );
  assert.doesNotMatch(
    runtimePrincipalStep,
    /FIELDGRID_MIGRATION_DATABASE_URL|FIELDGRID_RUNTIME_DATABASE_PASSWORD|secrets\.DATABASE_URL/u,
  );
  assert.match(deploy, /--prepared-env "\$RELEASE\/\.env"/u);
  assert.match(deploy, /--shared-env "\$BASE_DIR\/shared\/\.env"/u);
  assert.match(
    deploy,
    /--rollback-env "\$BASE_DIR\/shared\/\.env\.rollback-\$GITHUB_SHA"/u,
  );

  assert.match(
    runtimeConnection,
    /databaseConnectionConfig\([\s\S]*configuredDatabaseConnectionPurpose\(\)/u,
  );
  assert.match(
    databaseEnvironment,
    /if \(!configured \|\| configured === "runtime"\) return "runtime"/u,
  );
  assert.match(
    databaseEnvironment,
    /if \(configured === "migration"\) return "migration"/u,
  );
  assert.match(
    databaseEnvironment,
    /throw new Error\("Database connection purpose is invalid\."\)/u,
  );
  assert.match(migrationRunner, /databaseConnectionConfig\("migration"\)/u);
  assert.match(smtpBackfill, /databaseConnectionConfig\("migration"\)/u);
  assert.match(objectBackfill, /databaseConnectionConfig\("migration"\)/u);

  assert.match(
    preflight,
    /FIELDGRID_MIGRATION_DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/u,
  );
  assert.match(preflight, /FIELDGRID_STAGING_SMOKE_BEARER/u);
  assert.doesNotMatch(
    preflight,
    /secrets\.FIELDGRID_MIGRATION_SMOKE_(?:EMPTY|STAGING_COPY)_DATABASE_URL/u,
  );
  for (const directory of [
    "artifacts/phase2e-staging-preflight/",
    "artifacts/staging-smoke/",
    "artifacts/migration-smoke/",
  ]) {
    assert.match(preflight, new RegExp(directory, "u"));
  }
  assert.match(preflight, /Assemble bounded promotion evidence tree/u);
  assert.match(
    preflight,
    /path: \$\{\{ runner\.temp \}\}\/fieldgrid-phase2e-promotion-evidence-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\//u,
  );
  assert.match(preflight, /if-no-files-found: error/u);
  assert.match(
    phase2e,
    /parsePostgresEnv\(\s*env\.FIELDGRID_MIGRATION_DATABASE_URL/u,
  );
  assert.match(phase2e, /"--target",\s*"all"/u);
  assert.match(phase2e, /createApplicationEmptyTarget/u);
  assert.match(phase2e, /PGSSLMODE:\s*"verify-full"/u);
  assert.match(phase2e, /PGSSLROOTCERT:\s*rootCertificate\.path/u);

  const strictGateIndex = promoter.indexOf("runPromotionEvidenceGate(");
  const pushIndex = promoter.indexOf("updateRemoteRefs(");
  assert.ok(strictGateIndex >= 0 && strictGateIndex < pushIndex);
  assert.match(promoter, /mutation FieldgridAtomicPromotion/u);
  assert.match(promoter, /updateRefs\(input: \$input\)/u);
  assert.match(promoter, /beforeOid: approvedMain/u);
  assert.match(promoter, /beforeOid: expectedStaging/u);
  assert.match(promoter, /force: false/u);
  assert.match(promoter, /--preflight-run-id/u);
  assert.match(promoter, /--evidence-root/u);
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
