import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { allowedHistoricalRecordedMigrations } from "../scripts/fieldgrid-migration-order-check.mjs";
import {
  CONFIRMATION,
  BACKUP_SCHEMAS,
  CRITICAL_RELATIONS,
  DURABLE_MIGRATION_RELATIONS,
  EXPECTED_STAGING_PROJECT_REF,
  PAYMENT_INTENT_DIAGNOSTIC_QUERY,
  PAYMENT_INTENT_DIAGNOSTIC_VERSION,
  REALTIME_PUBLICATION,
  REALTIME_PUBLICATION_METADATA_VERSION,
  REQUIRED_SECRET_NAMES,
  REQUIRED_VARIABLE_NAMES,
  assertCommittedMigrationPrefix,
  assertMatchingMigrationHistory,
  assertMatchingCounts,
  assertMigratedDataIntegrity,
  committedMigrationManifest,
  isAllowedRouteStatus,
  isFullSha,
  migrationHistoryEvidence,
  normalizeRecordedMigrationHistory,
  parseArgs,
  parsePaymentIntentDiagnostic,
  parsePostgresEnv,
  parseRealtimePublicationMetadata,
  sanitizePublicUrl,
  validateCustomCandidateConfig,
  validateRuntimeConfig,
} from "../scripts/fieldgrid-phase2e-staging-preflight.mjs";

const repoRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(join(repoRoot, path), "utf8");
const mainSha = "a".repeat(40);
const stagingSha = "b".repeat(40);

function migrationRecords(names) {
  return names.map((name, index) => ({
    name,
    hash:
      allowedHistoricalRecordedMigrations[name]?.sqlSha256 ?? "0".repeat(64),
    appliedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    baselined: false,
  }));
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
    DATABASE_URL: `postgresql://postgres:test@db.${EXPECTED_STAGING_PROJECT_REF}.supabase.co:5432/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${EXPECTED_STAGING_PROJECT_REF}.supabase.co`,
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

test("Phase 2E arguments and immutable SHAs are fail closed", () => {
  const options = parseArgs([
    "--run",
    "--expected-main",
    mainSha,
    "--expected-staging",
    stagingSha,
  ]);
  assert.equal(options.run, true);
  assert.equal(options.expectedMain, mainSha);
  assert.equal(options.expectedStaging, stagingSha);
  assert.equal(isFullSha(mainSha), true);
  assert.equal(isFullSha("A".repeat(40)), false);
  assert.equal(isFullSha("abc"), false);

  assert.deepEqual(
    validateRuntimeConfig(
      { expectedMain: mainSha, expectedStaging: stagingSha },
      validEnvironment(),
    ),
    [],
  );
  const moved = validEnvironment();
  moved.GITHUB_REF_NAME = "staging";
  assert.match(
    validateRuntimeConfig(
      { expectedMain: mainSha, expectedStaging: stagingSha },
      moved,
    ).join(" "),
    /dispatched from main/u,
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
    { expectedMain: mainSha, expectedStaging: stagingSha },
    env,
  );
  assert.match(errors.join(" "), /FIELDGRID_CREDENTIAL_RECOVERY_SECRET/u);
  assert.doesNotMatch(errors.join(" "), /test-token/u);

  const duplicatePort = validEnvironment();
  duplicatePort.API_PORT = duplicatePort.KLANT_PORT;
  assert.match(
    validateRuntimeConfig(
      { expectedMain: mainSha, expectedStaging: stagingSha },
      duplicatePort,
    ).join(" "),
    /ports must be unique/u,
  );

  const invalidPort = validEnvironment();
  invalidPort.API_PORT = "not-a-port";
  assert.match(
    validateRuntimeConfig(
      { expectedMain: mainSha, expectedStaging: stagingSha },
      invalidPort,
    ).join(" "),
    /API_PORT must be a valid TCP port/u,
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
  assert.deepEqual(
    parsePostgresEnv(
      "postgresql://runner:p%40ss@db.example.test:6543/staging_copy?sslmode=verify-full",
    ),
    {
      PGHOST: "db.example.test",
      PGPORT: "6543",
      PGUSER: "runner",
      PGPASSWORD: "p@ss",
      PGDATABASE: "staging_copy",
      PGSSLMODE: "verify-full",
    },
  );
  assert.throws(() => parsePostgresEnv("https://example.test/db"), /postgres/u);
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
  for (const marker of [
    "workflow_dispatch:",
    "if: github.ref_name == 'main'",
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
    const secretBinding = workflow.indexOf(`secrets.${secretName}`);
    assert.ok(secretBinding > proofStep, `${secretName} must be step-scoped`);
  }
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
  assert.match(script, /FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL/u);
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
  const migrationRehearsal = script.indexOf(
    "runMigrationRehearsal(\n      restoreTarget",
  );
  const prefixValidation = script.lastIndexOf(
    "const migrationPrefix = assertCommittedMigrationPrefix(",
  );
  const postRehearsalHistoryProof = script.lastIndexOf(
    "const databaseProof = await verifyMigratedRestore(",
  );
  assert.ok(sourcePublication >= 0);
  assert.ok(sourcePublication < backupCreation);
  assert.ok(backupCreation < migrationRehearsal);
  assert.ok(diagnosticWrite >= 0);
  assert.ok(diagnosticWrite < migrationRehearsal);
  assert.ok(prefixValidation >= 0);
  assert.ok(prefixValidation < migrationRehearsal);
  assert.ok(postRehearsalHistoryProof > migrationRehearsal);
  assert.match(script, /providerIdentifiersRecorded: false/u);
  assert.match(script, /checkoutUrlsRecorded: false/u);
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
