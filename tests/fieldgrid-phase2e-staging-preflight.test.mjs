import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { allowedHistoricalRecordedMigrations } from "../scripts/fieldgrid-migration-order-check.mjs";
import { SUPABASE_ROOT_2021_CA_PEM } from "./fixtures/fieldgrid-supabase-root-2021-ca.mjs";
import {
  CONFIRMATION,
  BACKUP_SCHEMAS,
  CRITICAL_RELATIONS,
  DURABLE_MIGRATION_RELATIONS,
  DEPLOY_HEALTH_EVIDENCE_VERSION,
  EXPECTED_STAGING_PROJECT_REF,
  KNOWN_LEGACY_ROLLBACK_RECOVERY,
  LEGACY_DEPLOY_HEALTH_EVIDENCE_VERSION,
  PAYMENT_INTENT_DIAGNOSTIC_QUERY,
  PAYMENT_INTENT_DIAGNOSTIC_VERSION,
  REALTIME_PUBLICATION,
  REALTIME_PUBLICATION_METADATA_VERSION,
  REQUIRED_SECRET_NAMES,
  REQUIRED_VARIABLE_NAMES,
  ROLLBACK_RECOVERY_PROOF_VERSION,
  TENANT_USER_ROLE_CONSTRAINT_PROOF_VERSION,
  TENANT_USER_ROLE_CONSTRAINT_READINESS_QUERY,
  TENANT_USER_ROLE_CONSTRAINT_READINESS_VERSION,
  assertCommittedMigrationPrefix,
  assertMigrationRehearsalReport,
  assertMatchingMigrationHistory,
  assertMatchingCounts,
  assertMigratedDataIntegrity,
  assertPathWithinDirectory,
  assertTenantUserRoleConstraintProof,
  assertTenantUserRoleConstraintReadiness,
  committedMigrationManifest,
  isAllowedRouteStatus,
  isFullSha,
  migrationHistoryEvidence,
  normalizeRecordedMigrationHistory,
  parseArgs,
  parsePaymentIntentDiagnostic,
  parsePostgresEnv,
  parseRealtimePublicationMetadata,
  parseTenantUserRoleConstraintReadiness,
  sanitizePublicUrl,
  validateCustomCandidateConfig,
  validateRollbackDeployDiagnostics,
  validateRuntimeConfig,
  verifyRollbackDeployRecovery,
} from "../scripts/fieldgrid-phase2e-staging-preflight.mjs";

const repoRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(join(repoRoot, path), "utf8");
const mainSha = "a".repeat(40);
const stagingSha = "b".repeat(40);
const certificateDirectory = mkdtempSync(
  join(tmpdir(), "fieldgrid-phase2e-cert-"),
);
const certificatePath = join(certificateDirectory, "supabase-root.crt");
writeFileSync(certificatePath, SUPABASE_ROOT_2021_CA_PEM, { mode: 0o600 });
after(() => rmSync(certificateDirectory, { recursive: true, force: true }));

function migrationRecords(names) {
  return names.map((name, index) => ({
    name,
    hash:
      allowedHistoricalRecordedMigrations[name]?.sqlSha256 ?? "0".repeat(64),
    appliedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    baselined: false,
  }));
}

function validConstraintProof() {
  return {
    version: TENANT_USER_ROLE_CONSTRAINT_PROOF_VERSION,
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

function validMigrationRehearsalReport() {
  const result = (target) => ({
    target,
    label:
      target === "empty-database" ? "Empty database" : "Staging-copy database",
    startedAt: "2026-09-08T01:00:00.000Z",
    finishedAt: "2026-09-08T01:00:01.000Z",
    durationMs: 1_000,
    readiness: "pass",
    safetyReason: null,
    redactedDatabaseUrl: `postgresql://***@127.0.0.1/${target}`,
    exitCode: 0,
    timedOut: false,
    appliedMigrations: [
      "20260908120000_validate_tenant_user_roles_tenant_scope.sql",
    ],
    skippedMigrations: [],
    compatibilitySkippedMigrations: [],
    unresolvedRows: [],
    failedStatement: null,
    drizzleStarted: true,
    complete: true,
  });
  return {
    version: "sprint-7-migration-smoke-v1",
    createdAt: "2026-09-08T01:00:00.000Z",
    refs: {
      main: mainSha,
      staging: stagingSha,
      checkout: mainSha,
    },
    command: "pnpm --filter @workspace/db run db:migrate",
    results: [result("empty-database"), result("staging-copy")],
    summary: {
      status: "pass",
      passedTargets: ["empty-database", "staging-copy"],
      failedTargets: [],
      appliedMigrations: 2,
      skippedMigrations: 0,
      compatibilitySkippedMigrations: 0,
      unresolvedRows: 0,
    },
  };
}

function validEnvironment() {
  const env = {
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    PHASE2E_CONFIRM: CONFIRMATION,
    GITHUB_REF_NAME: "main",
    GITHUB_REPOSITORY: "veele-services/platform",
    GITHUB_TOKEN: "test-token",
    APP_URL: "https://staging.fieldgrid.nl/",
    EXPECTED_SUPABASE_PROJECT_REF: EXPECTED_STAGING_PROJECT_REF,
    DATABASE_URL: `postgresql://postgres:test@db.${EXPECTED_STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
    FIELDGRID_MIGRATION_DATABASE_URL: `postgresql://supabase_admin.${EXPECTED_STAGING_PROJECT_REF}:migration-test@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${EXPECTED_STAGING_PROJECT_REF}.supabase.co`,
    FIELDGRID_DATABASE_SSL_ROOT_CERT: certificatePath,
  };
  for (const name of REQUIRED_SECRET_NAMES)
    env[name] ||= `${name.toLowerCase()}-configured`;
  for (const name of REQUIRED_VARIABLE_NAMES)
    env[name] ||= `${name.toLowerCase()}-configured`;
  Object.assign(env, {
    APP_URL: "https://staging.fieldgrid.nl/",
    BACKOFFICE_PORT: "3301",
    PERSONEEL_PORT: "3302",
    KLANT_PORT: "3303",
    API_PORT: "3304",
    BACKOFFICE_PUBLIC_LOGIN_URL: "https://staging.fieldgrid.nl/admin/login",
    PERSONEEL_PUBLIC_HEALTH_URL:
      "https://staging.fieldgrid.nl/personeel/healthz",
    KLANT_PUBLIC_HEALTH_URL: "https://staging.fieldgrid.nl/klant/healthz",
    API_PUBLIC_HEALTH_URL: "https://staging.fieldgrid.nl/api/healthz",
    NEXT_PUBLIC_MARKETING_SITE_URL:
      "https://veeleservices.staging.fieldgrid.nl/",
    FIELDGRID_CUSTOM_ROUTE_KEY: "veeleservices_staging_primary",
    FIELDGRID_CUSTOM_EXPECTED_HOST: "veeleservices.staging.fieldgrid.nl",
    FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON: JSON.stringify([
      {
        providerKey: "fieldgrid_vps",
        routeKey: "veeleservices_staging_primary",
        releaseId: `git-commit:${mainSha}`,
        expectedHosts: ["veeleservices.staging.fieldgrid.nl"],
        healthPath: "/api/health",
        status: "routable",
        upstreamOrigin: "https://veeleservices-origin.staging.fieldgrid.nl",
      },
    ]),
    API_PUBLIC_ROOT_URL: "https://staging.fieldgrid.nl/rest/v1/",
    PILOT_TENANT_LOGIN_URL:
      "https://field-demo.staging.fieldgrid.nl/admin/login",
  });
  return env;
}

function rollbackDeployDiagnostics({
  failedSha = stagingSha,
  activeSha = "c".repeat(40),
  version = DEPLOY_HEALTH_EVIDENCE_VERSION,
} = {}) {
  const baseDir = "/var/www/veele/staging";
  return {
    ...(version ? { version } : {}),
    tool: "fieldgrid-deploy-health-gate",
    environment: "staging",
    status: "fail",
    detail: "new release failed health gate; rollback health passed",
    rollbackStatus: "pass",
    baseDir,
    releasePath: `${baseDir}/releases/20260908060528-${failedSha.slice(0, 7)}`,
    expectedSha: failedSha,
    previousRelease: `${baseDir}/releases/20260901000000-${activeSha.slice(0, 7)}`,
    currentTarget: `${baseDir}/releases/20260901000000-${activeSha.slice(0, 7)}`,
    attempts: 12,
    retrySeconds: 5,
    checks: [
      { name: "activation:restart", status: "pass", detail: "ok" },
      { name: "endpoint:local-backoffice", status: "fail", detail: "404" },
      { name: "rollback:environment", status: "pass", detail: "ok" },
      { name: "rollback:symlink", status: "pass", detail: "ok" },
      { name: "rollback:restart", status: "pass", detail: "ok" },
      { name: "rollback:health", status: "pass", detail: "ok" },
    ],
  };
}

test("Phase 2E arguments and immutable SHAs are fail closed", () => {
  const options = parseArgs([
    "--run",
    "--expected-main",
    mainSha,
    "--expected-staging",
    stagingSha,
    "--expected-active-staging-release",
    stagingSha,
  ]);
  assert.equal(options.run, true);
  assert.equal(options.expectedMain, mainSha);
  assert.equal(options.expectedStaging, stagingSha);
  assert.equal(options.expectedActiveStagingRelease, stagingSha);
  assert.equal(isFullSha(mainSha), true);
  assert.equal(isFullSha("A".repeat(40)), false);
  assert.equal(isFullSha("abc"), false);

  assert.deepEqual(
    validateRuntimeConfig(
      {
        expectedMain: mainSha,
        expectedStaging: stagingSha,
        expectedActiveStagingRelease: stagingSha,
        rollbackDeployRunId: "",
      },
      validEnvironment(),
    ),
    [],
  );
  const moved = validEnvironment();
  moved.GITHUB_REF_NAME = "staging";
  assert.match(
    validateRuntimeConfig(
      {
        expectedMain: mainSha,
        expectedStaging: stagingSha,
        expectedActiveStagingRelease: stagingSha,
        rollbackDeployRunId: "",
      },
      moved,
    ).join(" "),
    /dispatched from main/u,
  );
});

test("active release divergence requires an explicit failed deploy run", () => {
  const activeSha = "c".repeat(40);
  const missingProof = validateRuntimeConfig(
    {
      expectedMain: mainSha,
      expectedStaging: stagingSha,
      expectedActiveStagingRelease: activeSha,
      rollbackDeployRunId: "",
    },
    validEnvironment(),
  );
  assert.match(missingProof.join(" "), /rollback-deploy-run-id is required/u);

  const explicitProof = validateRuntimeConfig(
    {
      expectedMain: mainSha,
      expectedStaging: stagingSha,
      expectedActiveStagingRelease: activeSha,
      rollbackDeployRunId: "34193169329",
    },
    validEnvironment(),
  );
  assert.deepEqual(explicitProof, []);

  const unnecessaryProof = validateRuntimeConfig(
    {
      expectedMain: mainSha,
      expectedStaging: stagingSha,
      expectedActiveStagingRelease: stagingSha,
      rollbackDeployRunId: "34193169329",
    },
    validEnvironment(),
  );
  assert.match(unnecessaryProof.join(" "), /allowed only/u);
});

test("rollback diagnostics requires exact paths, checks and runtime env restoration", () => {
  const activeSha = "c".repeat(40);
  const report = rollbackDeployDiagnostics({ activeSha });
  assert.equal(
    validateRollbackDeployDiagnostics(report, {
      expectedGitStagingSha: stagingSha,
      expectedActiveStagingReleaseSha: activeSha,
      baseDir: "/var/www/veele/staging",
      deployRunId: "12345",
      diagnosticsSha256: "d".repeat(64),
    }).schemaVersion,
    DEPLOY_HEALTH_EVIDENCE_VERSION,
  );

  const attackerPath = structuredClone(report);
  attackerPath.currentTarget = "/tmp/attacker-release";
  assert.throws(
    () =>
      validateRollbackDeployDiagnostics(attackerPath, {
        expectedGitStagingSha: stagingSha,
        expectedActiveStagingReleaseSha: activeSha,
        baseDir: "/var/www/veele/staging",
        deployRunId: "12345",
        diagnosticsSha256: "d".repeat(64),
      }),
    /escapes|outside|not bound/u,
  );

  const noEnvironmentRestore = structuredClone(report);
  noEnvironmentRestore.checks = noEnvironmentRestore.checks.filter(
    (check) => check.name !== "rollback:environment",
  );
  assert.throws(
    () =>
      validateRollbackDeployDiagnostics(noEnvironmentRestore, {
        expectedGitStagingSha: stagingSha,
        expectedActiveStagingReleaseSha: activeSha,
        baseDir: "/var/www/veele/staging",
        deployRunId: "12345",
        diagnosticsSha256: "d".repeat(64),
      }),
    /environment restoration/u,
  );
});

test("legacy bootstrap rollback diagnostics is accepted only by its pinned run and hash", () => {
  const report = rollbackDeployDiagnostics({
    failedSha: KNOWN_LEGACY_ROLLBACK_RECOVERY.failedReleaseSha,
    activeSha: KNOWN_LEGACY_ROLLBACK_RECOVERY.restoredReleaseSha,
    version: null,
  });
  report.checks = report.checks.filter(
    (check) => check.name !== "rollback:environment",
  );
  const options = {
    expectedGitStagingSha: KNOWN_LEGACY_ROLLBACK_RECOVERY.failedReleaseSha,
    expectedActiveStagingReleaseSha:
      KNOWN_LEGACY_ROLLBACK_RECOVERY.restoredReleaseSha,
    baseDir: "/var/www/veele/staging",
    deployRunId: KNOWN_LEGACY_ROLLBACK_RECOVERY.runId,
    diagnosticsSha256: KNOWN_LEGACY_ROLLBACK_RECOVERY.diagnosticsSha256,
  };
  assert.equal(
    validateRollbackDeployDiagnostics(report, options).schemaVersion,
    LEGACY_DEPLOY_HEALTH_EVIDENCE_VERSION,
  );
  assert.throws(
    () =>
      validateRollbackDeployDiagnostics(report, {
        ...options,
        diagnosticsSha256: "0".repeat(64),
      }),
    /pinned bootstrap recovery/u,
  );
});

test("rollback recovery proof binds GitHub run, job and diagnostics artifact", async () => {
  const activeSha = "c".repeat(40);
  const runId = "12345";
  const nowMs = Date.parse("2026-09-08T08:00:00.000Z");
  const reportBytes = Buffer.from(
    `${JSON.stringify(rollbackDeployDiagnostics({ activeSha }))}\n`,
  );
  const apiPayloads = new Map([
    [
      `/actions/runs/${runId}`,
      {
        id: Number(runId),
        name: "Deploy VEELE",
        path: ".github/workflows/deploy.yml",
        event: "workflow_dispatch",
        head_branch: "staging",
        head_sha: stagingSha,
        status: "completed",
        conclusion: "failure",
        run_attempt: 1,
        updated_at: "2026-09-08T07:59:00.000Z",
      },
    ],
    [
      `/actions/runs/${runId}/jobs?per_page=100`,
      {
        jobs: [
          {
            name: "deploy",
            status: "completed",
            conclusion: "failure",
            steps: [
              ["Activate staging release", "success"],
              ["Run staging deploy health gate", "failure"],
              ["Collect staging deploy diagnostics", "success"],
              ["Upload staging deploy diagnostics", "success"],
            ].map(([name, conclusion]) => ({
              name,
              status: "completed",
              conclusion,
            })),
          },
        ],
      },
    ],
    [
      `/actions/runs/${runId}/artifacts?per_page=100`,
      {
        artifacts: [
          {
            id: 999,
            name: `fieldgrid-staging-deploy-diagnostics-${runId}`,
            expired: false,
            size_in_bytes: 500,
            updated_at: "2026-09-08T07:59:30.000Z",
            workflow_run: {
              id: Number(runId),
              head_branch: "staging",
              head_sha: stagingSha,
            },
            archive_download_url:
              "https://api.github.com/repos/veele-services/platform/actions/artifacts/999/zip",
          },
        ],
      },
    ],
  ]);
  const proof = await verifyRollbackDeployRecovery(
    {
      deployRunId: runId,
      expectedGitStagingSha: stagingSha,
      expectedActiveStagingReleaseSha: activeSha,
      baseDir: "/var/www/veele/staging",
      tempDir: "/tmp",
      nowMs,
    },
    {
      GITHUB_REPOSITORY: "veele-services/platform",
      GITHUB_TOKEN: "test-token",
    },
    {
      githubApiJson: async (path) => apiPayloads.get(path),
      downloadRollbackDiagnostics: async () => reportBytes,
    },
  );

  assert.equal(proof.version, ROLLBACK_RECOVERY_PROOF_VERSION);
  assert.equal(proof.deployRun.apiVerified, true);
  assert.equal(proof.diagnostics.exactSchemaVerified, true);
  assert.equal(
    proof.diagnostics.sha256,
    createHash("sha256").update(reportBytes).digest("hex"),
  );

  apiPayloads.get(`/actions/runs/${runId}`).event = "push";
  await assert.rejects(
    () =>
      verifyRollbackDeployRecovery(
        {
          deployRunId: runId,
          expectedGitStagingSha: stagingSha,
          expectedActiveStagingReleaseSha: activeSha,
          baseDir: "/var/www/veele/staging",
          tempDir: "/tmp",
          nowMs,
        },
        {
          GITHUB_REPOSITORY: "veele-services/platform",
          GITHUB_TOKEN: "test-token",
        },
        {
          githubApiJson: async (path) => apiPayloads.get(path),
          downloadRollbackDiagnostics: async () => reportBytes,
        },
      ),
    /does not prove the exact failed staging release/u,
  );
});

test("restore verification derives the complete committed migration manifest", async () => {
  const manifest = await committedMigrationManifest();
  assert.ok(manifest.length > 100);
  assert.deepEqual(manifest, [...manifest].sort());
  assert.equal(manifest[0], "001_rbac_rls.sql");
  assert.ok(manifest.includes("20260731170000_portal_user_onboarding.sql"));
});

test("restore verification rejects missing and unexpected migration history", () => {
  const committed = [
    "001_legacy.sql",
    "20260731170000_portal_user_onboarding.sql",
    "20260801000000_release_gate.sql",
  ];
  assert.doesNotThrow(() =>
    assertMatchingMigrationHistory(migrationRecords(committed), committed),
  );
  assert.throws(
    () =>
      assertMatchingMigrationHistory(
        migrationRecords(["001_legacy.sql", "20260801000000_release_gate.sql"]),
        committed,
      ),
    /missing: 20260731170000_portal_user_onboarding\.sql/u,
  );
  assert.throws(
    () =>
      assertMatchingMigrationHistory(
        migrationRecords([
          "001_legacy.sql",
          "20260730000000_staging_only.sql",
          "20260731170000_portal_user_onboarding.sql",
          "20260801000000_release_gate.sql",
        ]),
        committed,
      ),
    /unexpected: 20260730000000_staging_only\.sql/u,
  );
});

test("pre-rehearsal history allows a complete legacy set plus a modern prefix", () => {
  const committed = [
    "001_legacy.sql",
    "20260731170000_portal_user_onboarding.sql",
    "20260801000000_release_gate.sql",
  ];
  assert.deepEqual(
    assertCommittedMigrationPrefix(
      migrationRecords([
        "001_legacy.sql",
        "20260731170000_portal_user_onboarding.sql",
      ]),
      committed,
    ),
    {
      recordedMigrationCount: 2,
      recognizedHistoricalMigrationCount: 0,
      activeRecordedMigrationCount: 2,
      semanticRecordedMigrationCount: 2,
      pendingMigrationCount: 1,
      requiredLegacyMigrationCount: 1,
      recordedModernMigrationCount: 1,
      pendingModernMigrationCount: 1,
      latestRecordedModernMigration:
        "20260731170000_portal_user_onboarding.sql",
    },
  );
  assert.deepEqual(
    assertCommittedMigrationPrefix(migrationRecords(committed), committed),
    {
      recordedMigrationCount: 3,
      recognizedHistoricalMigrationCount: 0,
      activeRecordedMigrationCount: 3,
      semanticRecordedMigrationCount: 3,
      pendingMigrationCount: 0,
      requiredLegacyMigrationCount: 1,
      recordedModernMigrationCount: 2,
      pendingModernMigrationCount: 0,
      latestRecordedModernMigration: "20260801000000_release_gate.sql",
    },
  );
});

test("pre-rehearsal history rejects missing-middle and staging-only entries", () => {
  const committed = [
    "001_legacy.sql",
    "20260731170000_portal_user_onboarding.sql",
    "20260801000000_release_gate.sql",
  ];
  assert.throws(
    () =>
      assertCommittedMigrationPrefix(
        migrationRecords(["001_legacy.sql", "20260801000000_release_gate.sql"]),
        committed,
      ),
    /expected 20260731170000_portal_user_onboarding\.sql, recorded 20260801000000_release_gate\.sql/u,
  );
  assert.throws(
    () =>
      assertCommittedMigrationPrefix(
        migrationRecords(["001_legacy.sql", "20260730000000_staging_only.sql"]),
        committed,
      ),
    /unexpected: 20260730000000_staging_only\.sql/u,
  );
  assert.throws(
    () =>
      assertCommittedMigrationPrefix(
        migrationRecords([
          "001_legacy.sql",
          "20260801000000_release_gate.sql",
          "20260731170000_portal_user_onboarding.sql",
        ]),
        committed,
      ),
    /expected 20260731170000_portal_user_onboarding\.sql, recorded 20260801000000_release_gate\.sql/u,
  );
  assert.throws(
    () =>
      assertCommittedMigrationPrefix(
        migrationRecords([...committed, "20260802000000_staging_only.sql"]),
        committed,
      ),
    /unexpected: 20260802000000_staging_only\.sql/u,
  );
});

test("historical legacy order is grandfathered while modern order stays strict", () => {
  const legacyTimestamp = "20260618201212_assignment_monthly_codes.sql";
  const committed = [
    "001_legacy.sql",
    "002_legacy.sql",
    legacyTimestamp,
    "20260707191000_first_modern.sql",
    "20260708120000_second_modern.sql",
  ];
  const historicallyApplied = [
    "001_legacy.sql",
    legacyTimestamp,
    "002_legacy.sql",
    "20260707191000_first_modern.sql",
  ];

  assert.deepEqual(
    assertCommittedMigrationPrefix(
      migrationRecords(historicallyApplied),
      committed,
    ),
    {
      recordedMigrationCount: 4,
      recognizedHistoricalMigrationCount: 0,
      activeRecordedMigrationCount: 4,
      semanticRecordedMigrationCount: 4,
      pendingMigrationCount: 1,
      requiredLegacyMigrationCount: 3,
      recordedModernMigrationCount: 1,
      pendingModernMigrationCount: 1,
      latestRecordedModernMigration: "20260707191000_first_modern.sql",
    },
  );
  assert.doesNotThrow(() =>
    assertMatchingMigrationHistory(
      migrationRecords([
        ...historicallyApplied,
        "20260708120000_second_modern.sql",
      ]),
      committed,
    ),
  );
  assert.throws(
    () =>
      assertCommittedMigrationPrefix(
        migrationRecords([
          "001_legacy.sql",
          legacyTimestamp,
          "20260707191000_first_modern.sql",
        ]),
        committed,
      ),
    /missing required legacy migrations: 002_legacy\.sql/u,
  );
  assert.throws(
    () =>
      assertCommittedMigrationPrefix(
        migrationRecords([
          "001_legacy.sql",
          legacyTimestamp,
          "002_legacy.sql",
          "20260708120000_second_modern.sql",
          "20260707191000_first_modern.sql",
        ]),
        committed,
      ),
    /invalid modern migration order/u,
  );
});

test("historical main-line migration names normalize fail closed to current canon", () => {
  const committed = [
    "001_legacy.sql",
    "056_fieldgrid_recovery_foundation.sql",
    "20260708121000_cleanup_staging_demo_sector_descriptions.sql",
    "20260708121100_enterprise_whitelabel_theme.sql",
    "20260801000000_release_gate.sql",
  ];
  const historical = [
    "001_legacy.sql",
    "055_platform_users.sql",
    "056_fieldgrid_recovery_foundation.sql",
    "102_cleanup_staging_demo_sector_descriptions.sql",
    "103_enterprise_whitelabel_theme.sql",
  ];

  const normalized = normalizeRecordedMigrationHistory(
    migrationRecords(historical),
  );
  assert.deepEqual(normalized.activeNames, [
    "001_legacy.sql",
    "056_fieldgrid_recovery_foundation.sql",
  ]);
  assert.deepEqual(normalized.semanticNames, committed.slice(0, 4));
  assert.deepEqual(
    normalized.historicalMigrationRecords.map((record) => record.name),
    [
      "055_platform_users.sql",
      "102_cleanup_staging_demo_sector_descriptions.sql",
      "103_enterprise_whitelabel_theme.sql",
    ],
  );
  assert.ok(
    normalized.historicalMigrationRecords.every(
      (record) => record.hashVerified === true,
    ),
  );
  assert.deepEqual(
    assertCommittedMigrationPrefix(migrationRecords(historical), committed),
    {
      recordedMigrationCount: 5,
      recognizedHistoricalMigrationCount: 3,
      activeRecordedMigrationCount: 2,
      semanticRecordedMigrationCount: 4,
      pendingMigrationCount: 3,
      requiredLegacyMigrationCount: 2,
      recordedModernMigrationCount: 0,
      pendingModernMigrationCount: 3,
      latestRecordedModernMigration: null,
    },
  );

  assert.doesNotThrow(() =>
    assertMatchingMigrationHistory(
      migrationRecords([
        ...historical,
        "20260708121000_cleanup_staging_demo_sector_descriptions.sql",
        "20260708121100_enterprise_whitelabel_theme.sql",
        "20260801000000_release_gate.sql",
      ]),
      committed,
    ),
  );
  assert.doesNotThrow(() =>
    assertMatchingMigrationHistory(
      migrationRecords([
        ...historical,
        "20260801000000_release_gate.sql",
        "20260708121000_cleanup_staging_demo_sector_descriptions.sql",
        "20260708121100_enterprise_whitelabel_theme.sql",
      ]),
      committed,
    ),
  );
  assert.throws(
    () =>
      assertMatchingMigrationHistory(
        migrationRecords([
          "001_legacy.sql",
          "056_fieldgrid_recovery_foundation.sql",
          "20260801000000_release_gate.sql",
          "20260708121000_cleanup_staging_demo_sector_descriptions.sql",
          "20260708121100_enterprise_whitelabel_theme.sql",
        ]),
        committed,
      ),
    /invalid modern migration order/u,
  );
  assert.throws(
    () =>
      assertMatchingMigrationHistory(
        migrationRecords([...historical, "20260801000000_release_gate.sql"]),
        committed,
      ),
    /missing: 20260708121000_cleanup_staging_demo_sector_descriptions\.sql, 20260708121100_enterprise_whitelabel_theme\.sql/u,
  );
  assert.throws(
    () =>
      assertCommittedMigrationPrefix(
        migrationRecords([...historical, "104_staging_only.sql"]),
        committed,
      ),
    /unexpected: 104_staging_only\.sql/u,
  );
  assert.throws(
    () =>
      assertCommittedMigrationPrefix(
        migrationRecords([...historical, "055_platform_users.sql"]),
        committed,
      ),
    /duplicate: 055_platform_users\.sql/u,
  );
  const wrongHash = migrationRecords(historical);
  wrongHash.find((record) => record.name === "055_platform_users.sql").hash =
    "f".repeat(64);
  assert.throws(
    () => assertCommittedMigrationPrefix(wrongHash, committed),
    /055_platform_users\.sql is recorded with an unexpected hash/u,
  );
  const renamedWrongHash = migrationRecords(historical);
  renamedWrongHash.find(
    (record) =>
      record.name === "102_cleanup_staging_demo_sector_descriptions.sql",
  ).hash = "e".repeat(64);
  assert.throws(
    () => assertCommittedMigrationPrefix(renamedWrongHash, committed),
    /102_cleanup_staging_demo_sector_descriptions\.sql is recorded with an unexpected hash/u,
  );
  const baselinedRename = migrationRecords(historical);
  baselinedRename.find(
    (record) =>
      record.name === "102_cleanup_staging_demo_sector_descriptions.sql",
  ).baselined = true;
  assert.throws(
    () => assertCommittedMigrationPrefix(baselinedRename, committed),
    /102_cleanup_staging_demo_sector_descriptions\.sql was baselined without execution/u,
  );
  const reorderedAliases = migrationRecords([
    "001_legacy.sql",
    "055_platform_users.sql",
    "056_fieldgrid_recovery_foundation.sql",
    "103_enterprise_whitelabel_theme.sql",
    "102_cleanup_staging_demo_sector_descriptions.sql",
  ]);
  assert.throws(
    () => assertCommittedMigrationPrefix(reorderedAliases, committed),
    /invalid modern migration order/u,
  );
  assert.throws(
    () =>
      assertCommittedMigrationPrefix(
        migrationRecords(historical).map((record, index) =>
          index === 0 ? { ...record, appliedAt: "not-a-date" } : record,
        ),
        committed,
      ),
    /migration history is invalid/u,
  );
  assert.throws(
    () =>
      assertCommittedMigrationPrefix(
        migrationRecords(historical).map((record, index) =>
          index === 0 ? { ...record, baselined: "false" } : record,
        ),
        committed,
      ),
    /migration history is invalid/u,
  );
});

test("restore verification reports evidence from the validated manifest", () => {
  assert.deepEqual(
    migrationHistoryEvidence([
      "001_legacy.sql",
      "20260801000000_release_gate.sql",
    ]),
    {
      latestMigration: "20260801000000_release_gate.sql",
      migrationCount: 2,
    },
  );
  assert.throws(
    () => migrationHistoryEvidence([]),
    /Committed SQL migration manifest is empty/u,
  );
});

test("restore verification fails closed for empty or invalid migration manifests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-phase2e-empty-"));
  try {
    await Promise.all([
      writeFile(join(directory, "baseline.json"), "{}"),
      writeFile(join(directory, "release.sql"), ""),
    ]);
    await assert.rejects(
      committedMigrationManifest(directory),
      /release\.sql gebruikt geen toegestaan migratiepatroon/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("secret and routing preflight lists every required deployment dependency by name only", () => {
  assert.ok(
    REQUIRED_SECRET_NAMES.includes("FIELDGRID_CREDENTIAL_RECOVERY_SECRET"),
  );
  assert.ok(REQUIRED_SECRET_NAMES.includes("MOLLIE_WEBHOOK_SECRET"));
  assert.ok(REQUIRED_SECRET_NAMES.includes("FIELDGRID_MIGRATION_DATABASE_URL"));
  assert.ok(REQUIRED_VARIABLE_NAMES.includes("PILOT_TENANT_LOGIN_URL"));
  assert.equal(REQUIRED_VARIABLE_NAMES.includes("WEBSITE_SERVICE_NAME"), false);
  assert.equal(
    REQUIRED_VARIABLE_NAMES.includes("MARKETING_SERVICE_NAME"),
    false,
  );
  assert.ok(
    REQUIRED_VARIABLE_NAMES.includes("FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON"),
  );
  assert.ok(REQUIRED_VARIABLE_NAMES.includes("NEXT_PUBLIC_MARKETING_SITE_URL"));

  const env = validEnvironment();
  delete env.FIELDGRID_CREDENTIAL_RECOVERY_SECRET;
  const errors = validateRuntimeConfig(
    {
      expectedMain: mainSha,
      expectedStaging: stagingSha,
      expectedActiveStagingRelease: stagingSha,
      rollbackDeployRunId: "",
    },
    env,
  );
  assert.match(errors.join(" "), /FIELDGRID_CREDENTIAL_RECOVERY_SECRET/u);
  assert.doesNotMatch(errors.join(" "), /test-token/u);

  const duplicatePort = validEnvironment();
  duplicatePort.API_PORT = duplicatePort.KLANT_PORT;
  assert.match(
    validateRuntimeConfig(
      {
        expectedMain: mainSha,
        expectedStaging: stagingSha,
        expectedActiveStagingRelease: stagingSha,
        rollbackDeployRunId: "",
      },
      duplicatePort,
    ).join(" "),
    /ports must be unique/u,
  );

  const invalidPort = validEnvironment();
  invalidPort.API_PORT = "not-a-port";
  assert.match(
    validateRuntimeConfig(
      {
        expectedMain: mainSha,
        expectedStaging: stagingSha,
        expectedActiveStagingRelease: stagingSha,
        rollbackDeployRunId: "",
      },
      invalidPort,
    ).join(" "),
    /API_PORT must be a valid TCP port/u,
  );

  const missingMigrationCredential = validEnvironment();
  delete missingMigrationCredential.FIELDGRID_MIGRATION_DATABASE_URL;
  assert.match(
    validateRuntimeConfig(
      {
        expectedMain: mainSha,
        expectedStaging: stagingSha,
        expectedActiveStagingRelease: stagingSha,
        rollbackDeployRunId: "",
      },
      missingMigrationCredential,
    ).join(" "),
    /FIELDGRID_MIGRATION_DATABASE_URL/u,
  );

  const sharedCredential = validEnvironment();
  sharedCredential.FIELDGRID_MIGRATION_DATABASE_URL =
    sharedCredential.DATABASE_URL;
  assert.match(
    validateRuntimeConfig(
      {
        expectedMain: mainSha,
        expectedStaging: stagingSha,
        expectedActiveStagingRelease: stagingSha,
        rollbackDeployRunId: "",
      },
      sharedCredential,
    ).join(" "),
    /must be distinct/u,
  );
});

test("custom candidate preflight is exact-main and staging-only", () => {
  assert.deepEqual(
    validateCustomCandidateConfig(mainSha, validEnvironment()),
    [],
  );

  const stale = validEnvironment();
  stale.FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON =
    stale.FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON.replace(
      `git-commit:${mainSha}`,
      `git-commit:${"c".repeat(40)}`,
    );
  assert.match(
    validateCustomCandidateConfig(mainSha, stale).join(" "),
    /bound to exact main/u,
  );

  const production = validEnvironment();
  production.NEXT_PUBLIC_MARKETING_SITE_URL = "https://www.veeleservices.nl/";
  production.FIELDGRID_CUSTOM_EXPECTED_HOST = "www.veeleservices.nl";
  assert.match(
    validateCustomCandidateConfig(mainSha, production).join(" "),
    /staging HTTPS origin/u,
  );
});

test("database URL parsing creates libpq fields without retaining a URL", () => {
  const fixtureUsername = ["run", "ner"].join("");
  const fixturePassword = ["p", "@", "ss"].join("");
  const fixtureUrl = new URL("postgresql://db.example.test:6543/staging_copy");
  fixtureUrl.username = fixtureUsername;
  fixtureUrl.password = fixturePassword;
  assert.deepEqual(
    parsePostgresEnv(
      fixtureUrl.toString(),
      "FIELDGRID_MIGRATION_DATABASE_URL",
      { FIELDGRID_DATABASE_SSL_ROOT_CERT: certificatePath },
    ),
    {
      PGHOST: "db.example.test",
      PGPORT: "6543",
      PGUSER: fixtureUsername,
      PGPASSWORD: fixturePassword,
      PGDATABASE: "staging_copy",
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: certificatePath,
    },
  );
  assert.throws(
    () =>
      parsePostgresEnv("https://example.test/db", undefined, {
        FIELDGRID_DATABASE_SSL_ROOT_CERT: certificatePath,
      }),
    /postgres/u,
  );
  assert.throws(
    () =>
      parsePostgresEnv(
        "postgresql://runner:secret@db.example.test/staging?sslmode=disable",
        "FIELDGRID_MIGRATION_DATABASE_URL",
        { FIELDGRID_DATABASE_SSL_ROOT_CERT: certificatePath },
      ),
    /connection overrides/u,
  );
  assert.deepEqual(BACKUP_SCHEMAS, [
    "public",
    "auth",
    "storage",
    "drizzle",
    "app_private",
  ]);
  assert.ok(CRITICAL_RELATIONS.includes("public.website_publications"));
  assert.ok(CRITICAL_RELATIONS.includes("public.website_delivery_activations"));
});

test("routing policies accept only explicit healthy outcomes", () => {
  assert.equal(
    sanitizePublicUrl("https://staging.fieldgrid.nl/admin/login?token=ignored"),
    "https://staging.fieldgrid.nl/admin/login",
  );
  assert.equal(isAllowedRouteStatus("exact-200", 200), true);
  assert.equal(isAllowedRouteStatus("exact-200", 302), false);
  assert.equal(isAllowedRouteStatus("login", 307), true);
  assert.equal(isAllowedRouteStatus("api-root", 401), true);
  assert.equal(isAllowedRouteStatus("api-root", 404), false);
  assert.equal(isAllowedRouteStatus("api-root", 500), false);
});

test("restored critical data must be exactly count-equal", () => {
  const counts = Object.fromEntries(
    CRITICAL_RELATIONS.map((relation, index) => [relation, index]),
  );
  assert.equal(assertMatchingCounts(counts, { ...counts }), true);
  assert.throws(
    () =>
      assertMatchingCounts(counts, { ...counts, [CRITICAL_RELATIONS[0]]: 999 }),
    /critical row counts differ/u,
  );
});

test("tenant-user-role constraint readiness is read-only, exact and fail closed", () => {
  assert.match(
    TENANT_USER_ROLE_CONSTRAINT_READINESS_QUERY,
    /select jsonb_build_object/iu,
  );
  assert.match(TENANT_USER_ROLE_CONSTRAINT_READINESS_QUERY, /not exists/iu);
  assert.match(TENANT_USER_ROLE_CONSTRAINT_READINESS_QUERY, /count\(\*\)/iu);
  assert.match(
    TENANT_USER_ROLE_CONSTRAINT_READINESS_QUERY,
    /tenant_role_id is not null/iu,
  );
  assert.match(
    TENANT_USER_ROLE_CONSTRAINT_READINESS_QUERY,
    /user_id is not null/iu,
  );
  assert.doesNotMatch(
    TENANT_USER_ROLE_CONSTRAINT_READINESS_QUERY,
    /\b(update|delete|insert|alter|drop|truncate)\b/iu,
  );

  const green = {
    version: TENANT_USER_ROLE_CONSTRAINT_READINESS_VERSION,
    roleScopeMismatches: 0,
    membershipMismatches: 0,
  };
  assert.deepEqual(
    assertTenantUserRoleConstraintReadiness(JSON.stringify(green)),
    green,
  );
  assert.throws(
    () =>
      assertTenantUserRoleConstraintReadiness({
        ...green,
        roleScopeMismatches: 1,
      }),
    /roleScopeMismatches=1, membershipMismatches=0/u,
  );
  assert.throws(
    () =>
      parseTenantUserRoleConstraintReadiness({
        ...green,
        membershipMismatches: -1,
      }),
    /non-negative safe integer/u,
  );
  assert.throws(
    () =>
      parseTenantUserRoleConstraintReadiness({
        ...green,
        membershipMismatches: 1.5,
      }),
    /non-negative safe integer/u,
  );
  assert.throws(
    () =>
      parseTenantUserRoleConstraintReadiness({
        ...green,
        membershipMismatches: "0",
      }),
    /non-negative safe integer/u,
  );
  assert.throws(
    () =>
      parseTenantUserRoleConstraintReadiness({
        ...green,
        roleScopeMismatches: undefined,
      }),
    /non-negative safe integer/u,
  );
  assert.throws(
    () => parseTenantUserRoleConstraintReadiness("not-json"),
    /not valid JSON/u,
  );
});

test("tenant-user-role constraint proof requires both exact validated foreign keys", () => {
  const proof = validConstraintProof();
  assert.deepEqual(assertTenantUserRoleConstraintProof(proof), proof);
  assert.throws(
    () =>
      assertTenantUserRoleConstraintProof({
        ...proof,
        constraints: proof.constraints.slice(0, 1),
      }),
    /both constraints exactly once/u,
  );
  assert.throws(
    () =>
      assertTenantUserRoleConstraintProof({
        ...proof,
        constraints: proof.constraints.map((constraint, index) =>
          index === 0 ? { ...constraint, validated: false } : constraint,
        ),
      }),
    /not validated/u,
  );
  assert.throws(
    () =>
      assertTenantUserRoleConstraintProof({
        ...proof,
        constraints: proof.constraints.map((constraint, index) =>
          index === 1
            ? { ...constraint, referencedColumns: ["id", "tenant_id"] }
            : constraint,
        ),
      }),
    /missing, invalid, or not validated/u,
  );
});

test("Phase2E accepts only a complete exact-ref dual-target migration report", () => {
  const report = validMigrationRehearsalReport();
  assert.deepEqual(assertMigrationRehearsalReport(report), report);
  assert.deepEqual(
    assertMigrationRehearsalReport(report, {
      requireExactRefs: true,
      expectedMain: mainSha,
      expectedStaging: stagingSha,
    }),
    report,
  );
  for (const mutate of [
    (candidate) => (candidate.version = "wrong"),
    (candidate) => candidate.results.push({ ...candidate.results[0] }),
    (candidate) => (candidate.results[0].target = "staging-copy"),
    (candidate) => (candidate.results[0].readiness = "fail"),
    (candidate) => (candidate.results[0].exitCode = 1),
    (candidate) => (candidate.results[0].timedOut = true),
    (candidate) => (candidate.results[0].complete = false),
    (candidate) => (candidate.results[0].failedStatement = "ERROR"),
    (candidate) => candidate.results[0].unresolvedRows.push(1),
    (candidate) => candidate.summary.failedTargets.push("staging-copy"),
  ]) {
    const candidate = structuredClone(report);
    mutate(candidate);
    assert.throws(() => assertMigrationRehearsalReport(candidate));
  }
  const wrongRef = structuredClone(report);
  wrongRef.refs.main = "c".repeat(40);
  assert.throws(
    () =>
      assertMigrationRehearsalReport(wrongRef, {
        requireExactRefs: true,
        expectedMain: mainSha,
        expectedStaging: stagingSha,
      }),
    /exact main and staging SHAs/u,
  );
  assert.equal(
    assertPathWithinDirectory(
      "/tmp/phase2e-output",
      "/tmp/phase2e-output/migration-smoke/report.json",
    ),
    "migration-smoke/report.json",
  );
  assert.throws(
    () =>
      assertPathWithinDirectory(
        "/tmp/phase2e-output",
        "/tmp/outside/report.json",
      ),
    /escapes/u,
  );
});

test("tenant-scope validation migration is forward-only and unconditional", () => {
  const migration = read(
    "lib/db/migrations/20260908120000_validate_tenant_user_roles_tenant_scope.sql",
  );
  const validateStatements = migration.match(/validate constraint/giu) ?? [];
  assert.equal(validateStatements.length, 2);
  assert.match(
    migration,
    /alter table public\.tenant_user_roles\s+validate constraint tenant_user_roles_tenant_role_scope_fk;/iu,
  );
  assert.match(
    migration,
    /alter table public\.tenant_user_roles\s+validate constraint tenant_user_roles_tenant_membership_fk;/iu,
  );
  assert.doesNotMatch(
    migration,
    /\b(do\s+\$\$|if\s+exists|if\s+not\s+exists|update|delete|insert|truncate|drop)\b/iu,
  );
});

test("post-migration proof permits only expired realtime pruning", () => {
  const restoredCounts = Object.fromEntries(
    CRITICAL_RELATIONS.map((relation, index) => [relation, index + 10]),
  );
  const migratedCounts = {
    ...restoredCounts,
    "public.portal_realtime_events": 2,
  };
  const result = assertMigratedDataIntegrity(
    restoredCounts,
    migratedCounts,
    [
      { id: "live-a", expiresAt: "2026-07-21T03:00:00.000Z" },
      { id: "just-expired", expiresAt: "2026-07-21T01:59:59.000Z" },
      { id: "live-b", expiresAt: "2026-07-21T04:00:00.000Z" },
    ],
    ["live-a", "live-b", "new-event"],
    "2026-07-21T02:00:00.000Z",
  );

  assert.equal(
    result.durableRelationsCount,
    DURABLE_MIGRATION_RELATIONS.length,
  );
  assert.equal(result.durableCountsMatched, true);
  assert.deepEqual(result.transientRelations, [
    "public.portal_realtime_events",
  ]);
  assert.deepEqual(result.realtimeEvents, {
    totalBeforeMigration: restoredCounts["public.portal_realtime_events"],
    totalAfterMigration: 2,
    liveBeforeMigration: 3,
    protectedAtRehearsalCompletion: 2,
    protectedPreserved: 2,
    expiredRowsMayBePruned: true,
  });
  assert.equal(result.rawIdentifiersRecorded, false);

  assert.throws(
    () =>
      assertMigratedDataIntegrity(
        restoredCounts,
        { ...migratedCounts, [DURABLE_MIGRATION_RELATIONS[0]]: 999 },
        [{ id: "live-a", expiresAt: "2026-07-21T03:00:00.000Z" }],
        ["live-a"],
        "2026-07-21T02:00:00.000Z",
      ),
    /durable row counts differ/iu,
  );
  assert.throws(
    () =>
      assertMigratedDataIntegrity(
        restoredCounts,
        migratedCounts,
        [
          { id: "live-a", expiresAt: "2026-07-21T03:00:00.000Z" },
          { id: "live-b", expiresAt: "2026-07-21T04:00:00.000Z" },
        ],
        ["live-a"],
        "2026-07-21T02:00:00.000Z",
      ),
    /retention window extends beyond the rehearsal/iu,
  );
});

test("payment duplicate diagnostics are read-only, secret-free and shape-checked", () => {
  assert.match(PAYMENT_INTENT_DIAGNOSTIC_QUERY, /select jsonb_build_object/iu);
  assert.match(PAYMENT_INTENT_DIAGNOSTIC_QUERY, /recordedPhase2c1Migrations/iu);
  assert.match(PAYMENT_INTENT_DIAGNOSTIC_QUERY, /duplicateSources/iu);
  assert.match(PAYMENT_INTENT_DIAGNOSTIC_QUERY, /hasMolliePaymentId/iu);
  assert.match(PAYMENT_INTENT_DIAGNOSTIC_QUERY, /allocationCount/iu);
  assert.doesNotMatch(PAYMENT_INTENT_DIAGNOSTIC_QUERY, /'molliePaymentId'/iu);
  assert.doesNotMatch(PAYMENT_INTENT_DIAGNOSTIC_QUERY, /'checkoutUrl'/iu);
  assert.doesNotMatch(
    PAYMENT_INTENT_DIAGNOSTIC_QUERY,
    /\b(update|delete|insert|alter|drop)\b/iu,
  );

  const parsed = parsePaymentIntentDiagnostic(
    JSON.stringify({
      version: PAYMENT_INTENT_DIAGNOSTIC_VERSION,
      recordedPhase2c1Migrations: [],
      duplicateSources: [],
    }),
  );
  assert.deepEqual(parsed.duplicateSources, []);
  assert.throws(
    () => parsePaymentIntentDiagnostic('{"version":"wrong"}'),
    /invalid shape/iu,
  );
});

test("realtime publication metadata is exact and fail closed", () => {
  const metadata = {
    version: REALTIME_PUBLICATION_METADATA_VERSION,
    ...REALTIME_PUBLICATION,
    member: true,
  };
  assert.deepEqual(
    parseRealtimePublicationMetadata(JSON.stringify(metadata)),
    metadata,
  );
  assert.deepEqual(
    parseRealtimePublicationMetadata(
      JSON.stringify({ ...metadata, member: false }),
    ),
    { ...metadata, member: false },
  );
  assert.throws(
    () =>
      parseRealtimePublicationMetadata(
        JSON.stringify({ ...metadata, member: "yes" }),
      ),
    /invalid shape/iu,
  );
  assert.throws(
    () =>
      parseRealtimePublicationMetadata(
        JSON.stringify({ ...metadata, table: "other_table" }),
      ),
    /invalid shape/iu,
  );
});

test("manual workflow is staging-only and never promotes or uploads the database dump", () => {
  const workflow = read(".github/workflows/phase2e-staging-preflight.yml");
  assert.match(
    workflow,
    /permissions:\s*\n\s+actions:\s*read\s*\n\s+contents:\s*read/u,
    "rollback run, job and artifact verification requires explicit Actions read access",
  );
  for (const marker of [
    "workflow_dispatch:",
    "Reject non-main preflight dispatch",
    'test "$GITHUB_EVENT_NAME" = "workflow_dispatch"',
    'test "$GITHUB_REF" = "refs/heads/main"',
    'test "$GITHUB_SHA" = "$EXPECTED_MAIN_SHA"',
    "environment: staging",
    "group: veele-staging",
    "persist-credentials: false",
    "phase2e-staging-only",
    "fieldgrid:phase2e-staging-preflight",
    "artifacts/phase2e-staging-preflight/",
  ])
    assert.match(
      workflow,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
    );
  assert.doesNotMatch(
    workflow,
    /^\s+if:\s*github\.ref_name == 'main'$/mu,
    "a skipped job must not satisfy the protected required-check context",
  );
  const postgresSetup = workflow.indexOf(
    "scripts/fieldgrid-setup-postgresql17.sh",
  );
  const runtimeCheck = workflow.indexOf("Check staging preflight runtime");
  const proofStep = workflow.indexOf(
    "Prove backup, isolated restore, migrations, secrets, routes and rollback target",
  );
  assert.ok(
    postgresSetup >= 0,
    "the self-hosted runner must provision unprivileged PostgreSQL 17",
  );
  assert.ok(
    postgresSetup < runtimeCheck,
    "PostgreSQL 17 must be available before the preflight runtime check",
  );
  for (const secretName of REQUIRED_SECRET_NAMES) {
    const storedSecretName =
      secretName === "DATABASE_URL"
        ? "FIELDGRID_RUNTIME_DATABASE_URL"
        : secretName === "FIELDGRID_MIGRATION_DATABASE_URL"
          ? "DATABASE_URL"
          : secretName;
    const secretBinding = workflow.lastIndexOf(`secrets.${storedSecretName}`);
    assert.ok(secretBinding > proofStep, `${secretName} must be step-scoped`);
  }
  assert.doesNotMatch(workflow, /secrets\.FIELDGRID_MIGRATION_DATABASE_URL/u);
  assert.match(
    workflow,
    /EXPECTED_SUPABASE_PROJECT_REF:\s*olyfmekyqozxrbrwwszu/u,
  );
  assert.doesNotMatch(
    workflow,
    /docker\/setup-docker-action|git push|refs\/heads\/staging|\.dump/u,
  );

  const script = read("scripts/fieldgrid-phase2e-staging-preflight.mjs");
  assert.match(script, /pg_dump/u);
  assert.match(script, /pg_restore/u);
  assert.match(script, /\.publication\.json/u);
  assert.match(script, /Realtime publication metadata hash does not match/u);
  assert.match(
    script,
    /alter publication \$\{REALTIME_PUBLICATION\.publication\} add table/u,
  );
  assert.match(script, /--serializable-deferrable/u);
  assert.match(script, /postgresql:17\.10-unprivileged-local/u);
  assert.match(script, /pg_ctl/u);
  assert.match(script, /"--auth-host",\s*"scram-sha-256"/u);
  assert.match(script, /randomBytes\(32\)/u);
  assert.match(
    script,
    /async function restoreBackup[\s\S]*?"--dbname",\s*target\.database/u,
  );
  const dropDefaultPublic = script.indexOf(
    'await psql(pgEnv, "drop schema public;")',
  );
  const createRestoreRoles = script.indexOf(
    "await psql(pgEnv, restoreRoleSql())",
  );
  assert.ok(dropDefaultPublic >= 0);
  assert.ok(dropDefaultPublic < createRestoreRoles);
  assert.doesNotMatch(script, /runCommand\("docker"|postgres:17/u);
  assert.match(script, /fieldgrid-backfill-release-sha-marker\.sh/u);
  assert.match(script, /createApplicationEmptyTarget/u);
  assert.match(script, /localSupabaseCompatibilitySql/u);
  assert.match(script, /FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL/u);
  assert.match(script, /FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL/u);
  assert.match(
    script,
    /parsePostgresEnv\(\s*env\.FIELDGRID_MIGRATION_DATABASE_URL/u,
  );
  assert.doesNotMatch(
    script,
    /sourcePgEnv\s*=\s*parsePostgresEnv\(env\.DATABASE_URL/u,
  );
  assert.match(script, /PGSSLMODE:\s*"verify-full"/u);
  assert.match(script, /PGSSLROOTCERT:\s*rootCertificate\.path/u);
  assert.match(workflow, /FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64/u);
  assert.match(workflow, /expected_active_staging_release_sha/u);
  assert.match(workflow, /rollback_deploy_run_id/u);
  assert.doesNotMatch(
    workflow,
    /secrets\.FIELDGRID_MIGRATION_SMOKE_(?:EMPTY|STAGING_COPY)_DATABASE_URL/u,
  );
  assert.match(
    script,
    /jsonb_agg\(jsonb_build_object\('name', name, 'hash', hash, 'appliedAt', applied_at, 'baselined', baselined\) order by applied_at, name\)[\s\S]*?from drizzle\.veele_sql_migrations/u,
  );
  assert.doesNotMatch(
    script,
    /jsonb_agg\(name order by name\)[\s\S]*?from drizzle\.veele_sql_migrations/u,
  );
  const diagnosticWrite = script.lastIndexOf("writePaymentIntentDiagnostic(");
  const sourcePublication = script.lastIndexOf(
    "collectRealtimePublicationMetadata(sourcePgEnv)",
  );
  const backupCreation = script.lastIndexOf(
    "const backup = await createBackup(",
  );
  const sourceCounts = script.lastIndexOf(
    "const sourceCounts = await collectCriticalCounts(sourcePgEnv)",
  );
  const constraintReadiness = script.lastIndexOf(
    "collectTenantUserRoleConstraintReadiness(sourcePgEnv)",
  );
  const migrationRehearsal = script.lastIndexOf(
    "const migration = await runMigrationRehearsal(",
  );
  const prefixValidation = script.lastIndexOf(
    "const migrationPrefix = assertCommittedMigrationPrefix(",
  );
  const postRehearsalHistoryProof = script.lastIndexOf(
    "const databaseProof = await verifyMigratedRestore(",
  );
  assert.ok(sourcePublication >= 0);
  assert.ok(sourcePublication < backupCreation);
  assert.ok(sourceCounts >= 0);
  assert.ok(sourceCounts < backupCreation);
  assert.ok(constraintReadiness >= 0);
  assert.ok(constraintReadiness < backupCreation);
  assert.ok(backupCreation < migrationRehearsal);
  assert.ok(diagnosticWrite >= 0);
  assert.ok(diagnosticWrite < migrationRehearsal);
  assert.ok(prefixValidation >= 0);
  assert.ok(prefixValidation < migrationRehearsal);
  assert.ok(postRehearsalHistoryProof > migrationRehearsal);
  assert.match(script, /providerIdentifiersRecorded: false/u);
  assert.match(script, /checkoutUrlsRecorded: false/u);
  assert.match(script, /phase2e-staging-preflight-v2/u);
  assert.match(script, /candidateDatabaseRehearsal: true/u);
  assert.match(script, /liveStagingEvidence: false/u);
  assert.match(script, /w12Evidence: false/u);
  assert.match(script, /sizeBytes: reportBytes\.byteLength/u);
  assert.match(script, /createHash\("sha256"\)\.update\(reportBytes\)/u);
  assert.match(script, /promotionPerformed: false/u);
  assert.doesNotMatch(script, /git", \["push"|gh pr merge|production/u);
});

test("runner setup uses checksum-pinned PostgreSQL 17 packages without host privilege", () => {
  const setup = read("scripts/fieldgrid-setup-postgresql17.sh");
  assert.match(setup, /POSTGRES_VERSION="17\.10"/u);
  assert.match(setup, /postgresql-client-17_/u);
  assert.match(setup, /postgresql-17_/u);
  assert.match(setup, /sha256sum --check --status/u);
  assert.match(setup, /apt\.postgresql\.org/u);
  assert.doesNotMatch(setup, /\bsudo\b|apt-get install|docker/u);
});

test("deployment receives the mandatory credential recovery secret", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const occurrences =
    deploy.match(/FIELDGRID_CREDENTIAL_RECOVERY_SECRET/gu) ?? [];
  assert.ok(occurrences.length >= 2);
  assert.match(deploy, /secrets\.FIELDGRID_CREDENTIAL_RECOVERY_SECRET/u);
  assert.match(deploy, /printf 'FIELDGRID_CREDENTIAL_RECOVERY_SECRET=%s\\n'/u);

  const packageJson = JSON.parse(read("package.json"));
  assert.equal(
    packageJson.scripts["fieldgrid:phase2e-staging-preflight:check"],
    "node scripts/fieldgrid-phase2e-staging-preflight.mjs --check",
  );
});
