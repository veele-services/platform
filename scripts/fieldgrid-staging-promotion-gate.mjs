#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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
  SPRINT7_MIGRATION_SMOKE_VERSION,
  buildMigrationSmokePlan,
  validateMigrationSmokeContract,
} from "./fieldgrid-sprint7-migration-smoke.mjs";
import {
  SPRINT15_STAGING_SMOKE_VERSION,
  buildSprint15StagingSmokePlan,
  validateSprint15StagingSmokePlan,
} from "./fieldgrid-sprint15-staging-smoke.mjs";
import {
  PHASE2E_PREFLIGHT_VERSION,
  DEPLOY_HEALTH_EVIDENCE_VERSION,
  KNOWN_LEGACY_ROLLBACK_RECOVERY,
  LEGACY_DEPLOY_HEALTH_EVIDENCE_VERSION,
  ROLLBACK_RECOVERY_MAX_AGE_MS,
  ROLLBACK_RECOVERY_PROOF_VERSION,
  assertMigrationRehearsalReport,
  assertTenantUserRoleConstraintProof,
  assertTenantUserRoleConstraintReadiness,
} from "./fieldgrid-phase2e-staging-preflight.mjs";
import { SUPABASE_ROOT_2021_CA_SHA256 } from "./fieldgrid-database-root-cert.mjs";
import {
  W00_RUNTIME_POLICY_COUNT,
  W00_RUNTIME_POLICY_PROFILE,
} from "./fieldgrid-w00-db-acl-closure.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const FIELDGRID_STAGING_PROMOTION_GATE_VERSION =
  "fieldgrid-staging-promotion-gate-v2";
export const STAGING_PROMOTION_GATE_REPORT_DIR =
  "artifacts/staging-promotion-gate";
export const STAGING_SMOKE_MAX_AGE_MS = 60 * 60 * 1000;
export const MIGRATION_SMOKE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const PHASE2E_PREFLIGHT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const W00_STAGING_PRINCIPAL_MAX_AGE_MS = 15 * 60 * 1000;
export const KNOWN_STAGING_SMOKE_CHECK_IDS = Object.freeze([
  "FG-SMOKE-HOST",
  "FG-SMOKE-LOGIN",
  "FG-SMOKE-MODULES",
  "FG-SMOKE-SECTORS",
  "FG-SMOKE-STORAGE",
  "FG-SMOKE-PDF-DOWNLOADS",
  "FG-SMOKE-MIGRATIONS",
  "FG-SMOKE-SUPPORT",
  "FG-SMOKE-AUDIT",
]);
export const REQUIRED_STAGING_SMOKE_MINIMUM_GREEN_IDS = Object.freeze([
  "FG-SMOKE-HOST",
  "FG-SMOKE-LOGIN",
  "FG-SMOKE-MODULES",
  "FG-SMOKE-SECTORS",
  "FG-SMOKE-STORAGE",
  "FG-SMOKE-MIGRATIONS",
]);
export const W00_STAGING_PRINCIPAL_REPORT_DIRECTORY =
  "artifacts/runtime-safety-harness/reports";
export const W00_STAGING_PRINCIPAL_REPORT_NAME =
  "w00-staging-principal-gate.json";
export const W00_STAGING_PRINCIPAL_RELEASE_BINDING_VERSION =
  "w00-staging-principal-release-binding-v1";

export const promotionEvidenceDirectories = [
  "artifacts/staging-smoke",
  "artifacts/migration-smoke",
  "artifacts/phase2e-staging-preflight",
  W00_STAGING_PRINCIPAL_REPORT_DIRECTORY,
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
      "Validate Fieldgrid release contracts (static)",
      "Runtime evidence is",
      "enforced by the controlled promotion and pre-activation paths",
      'STAGING_RECOVERY_FREEZE: "false"',
    ],
  },
  {
    path: ".github/workflows/fieldgrid-migration-smoke.yml",
    phrases: [
      "scripts/fieldgrid-setup-postgresql17.sh",
      "scripts/fieldgrid-local-migration-smoke.mjs --run",
      "pnpm fieldgrid:migration-order-check:check",
      "pnpm fieldgrid:sprint7-migration-smoke:check",
    ],
  },
  {
    path: ".github/workflows/deploy.yml",
    phrases: [
      "Validate Fieldgrid release contracts (static)",
      "pnpm fieldgrid:staging-promotion-gate:check",
      "Runtime evidence is",
      "enforced by the controlled promotion and pre-activation paths",
      "fieldgrid-w00-staging-principal-gate.mts",
      "--strict-w00-principal",
      "--expected-deployed-sha",
      "FIELDGRID_W00_STAGING_DATABASE_URL",
      "fieldgrid-w00-runtime-principal.mjs --apply",
      "fieldgrid-w00-runtime-principal-gate.mjs --strict",
      "FIELDGRID_RUNTIME_DATABASE_PASSWORD",
      "FIELDGRID_RUNTIME_EXPECTED_SHA",
      "fieldgrid-w00-runtime-principal-staging-v1",
      "FIELDGRID_MIGRATION_DATABASE_URL",
      "--require-migration-database",
      "--prepared-env",
      'DB_SSL_REJECT_UNAUTHORIZED: "true"',
      "PGSSLMODE: verify-full",
    ],
  },
  {
    path: ".github/workflows/phase2e-staging-preflight.yml",
    phrases: [
      "Capture authenticated exact-SHA live staging smoke",
      "FIELDGRID_STAGING_SMOKE_BEARER",
      "--expected-staging",
      "Prove backup, isolated restore, migrations, secrets, routes and rollback target",
      "FIELDGRID_MIGRATION_DATABASE_URL",
      "artifacts/phase2e-staging-preflight/",
      "artifacts/staging-smoke/",
      "artifacts/migration-smoke/",
    ],
  },
  {
    path: ".github/workflows/website-staging-stack-deploy.yml",
    phrases: [
      "FIELDGRID_RUNTIME_DATABASE_URL",
      "FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64",
      "fieldgrid-database-root-cert.mjs",
      "/var/www/veele/website-stack-staging",
      "supabase-root-2021-ca.crt",
      'DB_SSL_REJECT_UNAUTHORIZED: "true"',
      "PGSSLMODE: verify-full",
    ],
  },
  {
    path: "scripts/fieldgrid-website-staging-stack-deploy.sh",
    phrases: [
      "FIELDGRID_DATABASE_SSL_ROOT_CERT",
      "printf 'DB_SSL=%s\\n'",
      "printf 'DB_SSL_REJECT_UNAUTHORIZED=%s\\n'",
      "printf 'PGSSLMODE=%s\\n'",
      "supabase-root-2021-ca.crt",
      "fieldgrid_env_transaction_begin",
      "fieldgrid_env_transaction_restore",
      "fieldgrid_env_transaction_finalize",
    ],
  },
  {
    path: "scripts/fieldgrid-website-env-transaction.sh",
    phrases: [
      "FIELDGRID_ENV_WEBSITE_TARGET",
      "FIELDGRID_ENV_MARKETING_TARGET",
      'chmod 600 "$backup"',
      'chmod 640 "$path"',
    ],
  },
  {
    path: "scripts/fieldgrid-phase2e-staging-promote.mjs",
    phrases: [
      "runStrictPromotionEvidenceGate",
      "before any staging push",
      "after forward migrations and before activation",
    ],
  },
  {
    path: "artifacts/backoffice/src/app/actions/platform-smoke.ts",
    phrases: [
      "buildStagingPromotionGate",
      "stagingPromotionGate",
      "runHistory",
      "artifacts/phase2e-staging-preflight",
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
    strictW00Principal: false,
    expectedMain:
      process.env.FIELDGRID_PROMOTION_EXPECTED_MAIN_SHA?.trim() ?? "",
    expectedStaging:
      process.env.FIELDGRID_PROMOTION_EXPECTED_STAGING_SHA?.trim() ?? "",
    expectedDeployed:
      process.env.FIELDGRID_PROMOTION_EXPECTED_DEPLOYED_SHA?.trim() ?? "",
    evidenceRoot: "",
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
      case "--strict-w00-principal":
        options.strictW00Principal = true;
        break;
      case "--write":
        options.write = true;
        break;
      case "--expected-main":
        options.expectedMain = nextValue();
        break;
      case "--expected-staging":
        options.expectedStaging = nextValue();
        break;
      case "--expected-deployed-sha":
        options.expectedDeployed = nextValue();
        break;
      case "--evidence-root":
        options.evidenceRoot = resolve(nextValue());
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

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isFullSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}

function validateFreshTimestamp(value, options) {
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs;
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs <= 0 ||
    !isTimestamp(value)
  ) {
    return false;
  }
  const timestampMs = Date.parse(value);
  const futureClockSkewMs = 5 * 60 * 1000;
  return (
    timestampMs <= nowMs + futureClockSkewMs && nowMs - timestampMs <= maxAgeMs
  );
}

function sameMembers(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((value) => actual.includes(value))
  );
}

function validateMigrationResult(result, expectedTarget) {
  const errors = [];
  if (!isRecord(result)) return ["Migration result has an invalid shape."];
  if (result.target !== expectedTarget)
    errors.push(`Migration result target must be ${expectedTarget}.`);
  if (result.readiness !== "pass")
    errors.push(`${expectedTarget} readiness is not pass.`);
  if (result.exitCode !== 0)
    errors.push(`${expectedTarget} exitCode is not zero.`);
  if (result.timedOut !== false)
    errors.push(`${expectedTarget} timedOut is not false.`);
  if (result.complete !== true)
    errors.push(`${expectedTarget} migration did not complete.`);
  if (result.drizzleStarted !== true)
    errors.push(`${expectedTarget} migration runner did not start.`);
  if (result.failedStatement !== null)
    errors.push(`${expectedTarget} contains a failed statement.`);
  if (
    !isTimestamp(result.startedAt) ||
    !isTimestamp(result.finishedAt) ||
    Date.parse(result.finishedAt) < Date.parse(result.startedAt)
  ) {
    errors.push(`${expectedTarget} timestamps are invalid.`);
  }
  if (!isCount(result.durationMs))
    errors.push(`${expectedTarget} duration is invalid.`);
  for (const field of [
    "appliedMigrations",
    "skippedMigrations",
    "compatibilitySkippedMigrations",
    "unresolvedRows",
  ]) {
    if (!Array.isArray(result[field]))
      errors.push(`${expectedTarget} ${field} is not an array.`);
  }
  if (
    Array.isArray(result.unresolvedRows) &&
    result.unresolvedRows.some((value) => !isCount(value) || value !== 0)
  ) {
    errors.push(`${expectedTarget} contains unresolved rows.`);
  }
  return errors;
}

export function validateMigrationSmokeEvidence(
  report,
  options = { requiredTargets: ["empty-database", "staging-copy"] },
) {
  const requiredTargets = options.requiredTargets ?? [
    "empty-database",
    "staging-copy",
  ];
  const errors = [];
  if (!isRecord(report)) return ["Migration-smoke artifact is not an object."];
  if (report.version !== SPRINT7_MIGRATION_SMOKE_VERSION)
    errors.push("Migration-smoke artifact has an unknown version.");
  if (!isTimestamp(report.createdAt))
    errors.push("Migration-smoke createdAt is invalid.");
  if (
    Number.isFinite(options.maxAgeMs) &&
    !validateFreshTimestamp(report.createdAt, {
      nowMs: options.nowMs,
      maxAgeMs: options.maxAgeMs,
    })
  ) {
    errors.push("Migration-smoke evidence is stale or future-dated.");
  }
  if (options.expectedMain || options.expectedStaging) {
    if (
      !isFullSha(options.expectedMain) ||
      !isFullSha(options.expectedStaging) ||
      report.refs?.main !== options.expectedMain ||
      report.refs?.checkout !== options.expectedMain ||
      report.refs?.staging !== options.expectedStaging
    ) {
      errors.push("Migration-smoke is not bound to the exact release SHAs.");
    }
  }
  if (!Array.isArray(report.results)) {
    errors.push("Migration-smoke results is not an array.");
  } else {
    const targets = report.results.map((result) => result?.target);
    if (!sameMembers(targets, requiredTargets)) {
      errors.push(
        `Migration-smoke must contain exactly: ${requiredTargets.join(", ")}.`,
      );
    }
    for (const target of requiredTargets) {
      const matching = report.results.filter(
        (result) => result?.target === target,
      );
      if (matching.length === 1) {
        errors.push(...validateMigrationResult(matching[0], target));
      }
    }
  }

  const summary = report.summary;
  if (!isRecord(summary)) {
    errors.push("Migration-smoke summary has an invalid shape.");
  } else {
    if (summary.status !== "pass")
      errors.push("Migration-smoke summary is not pass.");
    if (!sameMembers(summary.passedTargets, requiredTargets))
      errors.push("Migration-smoke passedTargets is incomplete.");
    if (!Array.isArray(summary.failedTargets) || summary.failedTargets.length)
      errors.push("Migration-smoke contains failed targets.");
    if (summary.unresolvedRows !== 0)
      errors.push("Migration-smoke summary contains unresolved rows.");
    for (const field of [
      "appliedMigrations",
      "skippedMigrations",
      "compatibilitySkippedMigrations",
    ]) {
      if (!isCount(summary[field]))
        errors.push(`Migration-smoke summary ${field} is invalid.`);
    }
  }
  return errors;
}

export function validateStagingSmokeEvidence(report, options = {}) {
  const errors = [];
  const expectedStaging = options.expectedStaging ?? "";
  if (!isRecord(report)) return ["Staging-smoke artifact is not an object."];
  if (report.version !== SPRINT15_STAGING_SMOKE_VERSION)
    errors.push("Staging-smoke artifact has an unknown version.");
  if (report.status !== "pass" || report.summary?.status !== "pass")
    errors.push("Staging-smoke status is not pass.");
  if (report.httpStatus !== 200)
    errors.push("Staging-smoke HTTP status is not 200.");
  if (!isFullSha(expectedStaging)) {
    errors.push("Staging-smoke validation requires an exact staging SHA.");
  } else if (
    report.expectedStagingSha !== expectedStaging ||
    report.deployedStagingSha !== expectedStaging
  ) {
    errors.push(
      "Staging-smoke artifact is not bound to the exact staging SHA.",
    );
  }
  if (
    !isTimestamp(report.createdAt) ||
    !isTimestamp(report.startedAt) ||
    !isTimestamp(report.finishedAt) ||
    Date.parse(report.finishedAt) < Date.parse(report.startedAt) ||
    !isCount(report.durationMs)
  ) {
    errors.push("Staging-smoke timestamps or duration are invalid.");
  }
  if (
    !validateFreshTimestamp(report.finishedAt, {
      nowMs: options.nowMs,
      maxAgeMs: options.maxAgeMs ?? STAGING_SMOKE_MAX_AGE_MS,
    })
  ) {
    errors.push("Staging-smoke evidence is stale or future-dated.");
  }
  try {
    const apiUrl = new URL(report.apiUrl);
    if (
      apiUrl.protocol !== "https:" ||
      apiUrl.hostname !== "staging.fieldgrid.nl" ||
      apiUrl.pathname !== "/api/platform/staging-smoke" ||
      apiUrl.username ||
      apiUrl.password ||
      apiUrl.port ||
      apiUrl.search ||
      apiUrl.hash
    ) {
      errors.push("Staging-smoke URL is not the canonical staging API URL.");
    }
  } catch {
    errors.push("Staging-smoke API URL is invalid.");
  }

  const dashboard = report.dashboard;
  const releaseIdentity = report.releaseIdentity;
  const releaseIdentitySource = releaseIdentity?.source;
  const releaseIdentityValid =
    isRecord(releaseIdentity) &&
    releaseIdentity.expectedStagingSha === expectedStaging &&
    releaseIdentity.deployedStagingSha === expectedStaging &&
    ["api", "api-and-canonical-marker", "canonical-marker-bootstrap"].includes(
      releaseIdentitySource,
    ) &&
    (releaseIdentity.apiReleaseSha === null ||
      releaseIdentity.apiReleaseSha === expectedStaging) &&
    (releaseIdentity.canonicalMarkerSha === null ||
      releaseIdentity.canonicalMarkerSha === expectedStaging) &&
    (releaseIdentitySource !== "api" ||
      (releaseIdentity.apiReleaseSha === expectedStaging &&
        releaseIdentity.canonicalMarkerSha === null)) &&
    (releaseIdentitySource !== "api-and-canonical-marker" ||
      (releaseIdentity.apiReleaseSha === expectedStaging &&
        releaseIdentity.canonicalMarkerSha === expectedStaging)) &&
    (releaseIdentitySource !== "canonical-marker-bootstrap" ||
      (releaseIdentity.apiReleaseSha === null &&
        releaseIdentity.canonicalMarkerSha === expectedStaging));
  if (!releaseIdentityValid) {
    errors.push("Staging-smoke release identity proof is invalid.");
  }
  if (
    !isRecord(dashboard) ||
    !isTimestamp(dashboard.generatedAt) ||
    !isRecord(dashboard.environment) ||
    (dashboard.environment.releaseSha != null &&
      dashboard.environment.releaseSha !== expectedStaging) ||
    dashboard.environment.stagingHost !== "staging.fieldgrid.nl" ||
    dashboard.environment.pilotTenantSlug !== "field-demo" ||
    !isRecord(dashboard.totals) ||
    Object.keys(dashboard.totals).length === 0 ||
    Object.values(dashboard.totals).some((value) => !isCount(value)) ||
    !Array.isArray(dashboard.checks) ||
    !Array.isArray(dashboard.runHistory) ||
    !Array.isArray(dashboard.liveSmokes) ||
    !isRecord(dashboard.migrationSmoke) ||
    !Array.isArray(dashboard.mutatingChecks) ||
    !isRecord(dashboard.stagingPromotionGate)
  ) {
    errors.push("Staging-smoke dashboard has an invalid shape.");
  }
  const dashboardChecks = Array.isArray(dashboard?.checks)
    ? dashboard.checks
    : [];
  const dashboardCheckIds = dashboardChecks
    .map((check) => check?.id)
    .filter((id) => typeof id === "string");
  if (
    !Array.isArray(report.checks) ||
    !sameMembers(report.checks, dashboardCheckIds)
  ) {
    errors.push("Staging-smoke check IDs do not match the dashboard.");
  }
  if (!sameMembers(dashboardCheckIds, KNOWN_STAGING_SMOKE_CHECK_IDS)) {
    errors.push(
      "Staging-smoke checks must contain every known check exactly once and no unknown checks.",
    );
  }
  if (
    !sameMembers(
      dashboard?.minimumGreen,
      REQUIRED_STAGING_SMOKE_MINIMUM_GREEN_IDS,
    )
  ) {
    errors.push("Staging-smoke minimumGreen contract is missing or unknown.");
  }
  for (const requiredId of REQUIRED_STAGING_SMOKE_MINIMUM_GREEN_IDS) {
    const matching = dashboardChecks.filter(
      (check) => check?.id === requiredId,
    );
    if (matching.length !== 1 || matching[0]?.status !== "ok") {
      errors.push(`Staging-smoke required check ${requiredId} is not ok.`);
    }
  }
  if (dashboardChecks.some((check) => check?.status === "blocked")) {
    errors.push("Staging-smoke contains a blocked dashboard check.");
  }
  return errors;
}

export function validateW00StagingPrincipalEvidence(report, options = {}) {
  const errors = [];
  if (!isRecord(report)) {
    return ["W00 staging-principal artifact is not an object."];
  }
  if (
    report.name !== "fieldgrid-w00-staging-principal-gate" ||
    report.status !== "passed" ||
    report.mode !== "strict" ||
    report.destructive !== false ||
    report.transactionMode !== "read only"
  ) {
    errors.push(
      "W00 staging-principal artifact is not a strict read-only pass.",
    );
  }
  if (
    !validateFreshTimestamp(report.completedAt, {
      nowMs: options.nowMs,
      maxAgeMs: options.maxAgeMs ?? W00_STAGING_PRINCIPAL_MAX_AGE_MS,
    })
  ) {
    errors.push("W00 staging-principal evidence is stale or future-dated.");
  }

  const evidence = report.evidence;
  const tables = Array.isArray(evidence?.tables) ? evidence.tables : [];
  const tableNames = tables.map((table) => table?.table_name);
  const owners = new Set(tables.map((table) => table?.owner));
  if (
    !isRecord(evidence) ||
    !isSha256(evidence.projectFingerprint) ||
    typeof evidence.currentUser !== "string" ||
    !evidence.currentUser ||
    evidence.sessionUser !== evidence.currentUser ||
    evidence.currentUserIsSuperuser !== false ||
    evidence.currentUserBypassesRls !== false ||
    evidence.sessionIdentityMatches !== true ||
    evidence.sessionUserCanControlPrivilegedRole !== false ||
    evidence.transactionReadOnly !== true ||
    evidence.tenantPathsDistinct !== true ||
    !sameMembers(tableNames, ["organization_settings", "tenant_domains"]) ||
    owners.size !== 1 ||
    owners.has(undefined) ||
    tables.some(
      (table) =>
        table?.current_user_is_owner !== true ||
        table?.owner_privileges_effective !== true ||
        table?.rls_enabled !== true ||
        table?.rls_forced !== false,
    )
  ) {
    errors.push(
      "W00 staging-principal identity or ownership proof is invalid.",
    );
  }

  const closure = evidence?.catalogClosure;
  if (
    !isRecord(closure) ||
    closure.rolesVerified !== 3 ||
    closure.tablesVerified !== 2 ||
    closure.ownersUnified !== true ||
    closure.currentUserOwnsAll !== true ||
    closure.rlsEnabled !== true ||
    closure.rlsForced !== false ||
    closure.policies !== W00_RUNTIME_POLICY_COUNT ||
    closure.policyProfile !== W00_RUNTIME_POLICY_PROFILE ||
    closure.runtimeRolesVerified !== 2 ||
    closure.runtimeMembershipsVerified !== 3 ||
    closure.runtimeTablePrivilegesVerified !== 32 ||
    closure.directAclViolations !== 0 ||
    closure.effectivePrivilegeViolations !== 0 ||
    closure.controllableRoleViolations !== 0
  ) {
    errors.push("W00 staging-principal ACL closure proof is invalid.");
  }

  const paths = Array.isArray(evidence?.paths) ? evidence.paths : [];
  if (
    !sameMembers(
      paths.map((path) => path?.label),
      ["tenant-a", "tenant-b"],
    ) ||
    paths.some(
      (path) =>
        !isSha256(path?.inputFingerprint) ||
        path?.resolvedExactlyOnce !== true ||
        path?.hostTenantMatched !== true ||
        path?.settingsTenantMatched !== true,
    )
  ) {
    errors.push("W00 staging-principal tenant A/B path proof is invalid.");
  }
  if (options.requireReleaseBinding !== false) {
    const release = report.release;
    if (
      !isRecord(release) ||
      release.version !== W00_STAGING_PRINCIPAL_RELEASE_BINDING_VERSION ||
      !isFullSha(release.expectedDeployedSha) ||
      release.markerSha !== release.expectedDeployedSha ||
      release.exactMatch !== true ||
      release.source !== ".fieldgrid-release-sha" ||
      (isFullSha(options.expectedDeployedSha) &&
        release.expectedDeployedSha !== options.expectedDeployedSha) ||
      !validateFreshTimestamp(release.boundAt, {
        nowMs: options.nowMs,
        maxAgeMs: options.maxAgeMs ?? W00_STAGING_PRINCIPAL_MAX_AGE_MS,
      })
    ) {
      errors.push(
        "W00 staging-principal artifact is not bound to the exact deployed release SHA.",
      );
    }
  }
  return errors;
}

function validateStaticGateEvidence(report, kind) {
  const errors = [];
  const expected =
    kind === "platform-admin-final-gate"
      ? {
          version: "platform-admin-final-gate-v1",
          marker: "fieldgrid-platform-admin-final-gate-v1",
          list: "gateItems",
        }
      : {
          version: "sprint-16-final-gate-v1",
          marker: "fieldgrid-sprint-16-final-external-tenant-gate",
          list: "requirements",
        };
  if (
    !isRecord(report) ||
    report.version !== expected.version ||
    report.marker !== expected.marker ||
    report.destructive !== false ||
    report.noMigration !== true ||
    !Array.isArray(report[expected.list]) ||
    report[expected.list].length === 0
  ) {
    errors.push(`${kind} is not a complete known static contract artifact.`);
  }
  return errors;
}

function validatePromotionGateReport(report) {
  if (
    !isRecord(report) ||
    report.version !== FIELDGRID_STAGING_PROMOTION_GATE_VERSION ||
    report.marker !== "fieldgrid-phase-4-staging-promotion-gate" ||
    report.destructive !== false ||
    report.noTenantMutation !== true ||
    report.promotionPath !== "main -> staging" ||
    !Array.isArray(report.signals)
  ) {
    return ["Promotion-gate report is not a complete known artifact."];
  }
  return [];
}

function validatePhase2eStructure(
  report,
  expectedMain,
  expectedStaging,
  nowMs,
) {
  const errors = [];
  if (!isRecord(report)) return ["Phase2E artifact is not an object."];
  if (report.version !== PHASE2E_PREFLIGHT_VERSION)
    errors.push("Phase2E artifact has an unknown version.");
  if (
    report.status !== "pass" ||
    report.environment !== "staging" ||
    report.promotionPerformed !== false ||
    report.deploymentPerformed !== false
  ) {
    errors.push("Phase2E artifact is not a non-promoting staging pass.");
  }
  if (
    report.classification?.candidateDatabaseRehearsal !== true ||
    report.classification?.liveStagingEvidence !== false ||
    report.classification?.w12Evidence !== false
  ) {
    errors.push("Phase2E artifact classification is invalid.");
  }
  if (!isFullSha(expectedMain) || !isFullSha(expectedStaging)) {
    errors.push("Expected main and staging SHAs are required for Phase2E.");
  } else if (
    report.refs?.main !== expectedMain ||
    report.refs?.checkout !== expectedMain ||
    report.refs?.staging !== expectedStaging
  ) {
    errors.push("Phase2E artifact does not match the exact release SHAs.");
  }
  if (
    !isTimestamp(report.startedAt) ||
    !isTimestamp(report.finishedAt) ||
    Date.parse(report.finishedAt) < Date.parse(report.startedAt)
  ) {
    errors.push("Phase2E timestamps are invalid.");
  }
  if (
    !validateFreshTimestamp(report.finishedAt, {
      nowMs,
      maxAgeMs: PHASE2E_PREFLIGHT_MAX_AGE_MS,
    })
  ) {
    errors.push("Phase2E evidence is stale or future-dated.");
  }
  if (
    !isRecord(report.database) ||
    ![15, 16, 17].includes(report.database.sourcePostgresMajor) ||
    report.database.backup?.sizeBytes <= 0 ||
    !isSha256(report.database.backup?.sha256) ||
    report.database.restore?.isolated !== true ||
    report.database.restore?.disposedAfterProof !== true ||
    report.database.migration?.status !== "pass" ||
    report.database.migrationDataIntegrity?.durableCountsMatched !== true ||
    report.database.migrationDataIntegrity?.rawIdentifiersRecorded !== false
  ) {
    errors.push("Phase2E database rehearsal proof is incomplete.");
  }
  errors.push(
    ...validatePhase2eRollbackEvidence(report.rollback, expectedStaging, nowMs),
  );
  if (
    report.database?.tls?.mode !== "verify-full" ||
    report.database?.tls?.rootCertificateSha256 !==
      SUPABASE_ROOT_2021_CA_SHA256 ||
    report.database?.tls?.certificatePathRecorded !== false
  ) {
    errors.push("Phase2E trusted database TLS proof is incomplete.");
  }
  try {
    assertTenantUserRoleConstraintReadiness(
      report.database?.constraintReadiness,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  try {
    assertTenantUserRoleConstraintProof(
      report.database?.proof?.tenantUserRoleConstraints,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

function validatePhase2eRollbackEvidence(rollback, expectedStaging, nowMs) {
  const errors = [];
  if (!isRecord(rollback)) {
    return ["Phase2E rollback target proof is missing."];
  }
  const activeSha = rollback.expectedActiveStagingReleaseSha;
  const aligned = activeSha === expectedStaging;
  if (
    rollback.expectedGitStagingSha !== expectedStaging ||
    !isFullSha(activeSha) ||
    rollback.marker !== activeSha ||
    rollback.gitAndActiveAligned !== aligned ||
    typeof rollback.currentRelease !== "string" ||
    !rollback.currentRelease.endsWith(activeSha.slice(0, 7)) ||
    !Array.isArray(rollback.servicesActive) ||
    rollback.servicesActive.length < 4 ||
    rollback.servicesActive.some(
      (service) => typeof service !== "string" || !service,
    )
  ) {
    errors.push("Phase2E active rollback target identity is invalid.");
  }
  if (aligned) {
    if (
      rollback.recoveryMode !== "aligned" ||
      rollback.recoveryProof !== null
    ) {
      errors.push(
        "Phase2E aligned rollback target has unexpected recovery proof.",
      );
    }
    return errors;
  }

  const proof = rollback.recoveryProof;
  const run = proof?.deployRun;
  const diagnostics = proof?.diagnostics;
  if (
    rollback.recoveryMode !== "verified-deploy-rollback" ||
    !isRecord(proof) ||
    proof.version !== ROLLBACK_RECOVERY_PROOF_VERSION ||
    proof.mode !== "verified-deploy-rollback" ||
    proof.expectedGitStagingSha !== expectedStaging ||
    proof.expectedActiveStagingReleaseSha !== activeSha ||
    !isRecord(run) ||
    !/^[1-9][0-9]{0,19}$/u.test(run.id ?? "") ||
    run.headSha !== expectedStaging ||
    run.branch !== "staging" ||
    !Number.isSafeInteger(run.attempt) ||
    run.attempt < 1 ||
    run.status !== "completed" ||
    run.conclusion !== "failure" ||
    run.apiVerified !== true ||
    !validateFreshTimestamp(run.updatedAt, {
      nowMs,
      maxAgeMs: ROLLBACK_RECOVERY_MAX_AGE_MS,
    }) ||
    !isRecord(diagnostics) ||
    !Number.isSafeInteger(diagnostics.artifactId) ||
    diagnostics.artifactId < 1 ||
    diagnostics.artifactName !==
      `fieldgrid-staging-deploy-diagnostics-${run?.id}` ||
    !validateFreshTimestamp(diagnostics.updatedAt, {
      nowMs,
      maxAgeMs: ROLLBACK_RECOVERY_MAX_AGE_MS,
    }) ||
    !isSha256(diagnostics.sha256) ||
    ![
      DEPLOY_HEALTH_EVIDENCE_VERSION,
      LEGACY_DEPLOY_HEALTH_EVIDENCE_VERSION,
    ].includes(diagnostics.schemaVersion) ||
    diagnostics.exactSchemaVerified !== true ||
    !Number.isSafeInteger(diagnostics.checkCount) ||
    diagnostics.checkCount < 1 ||
    !Number.isSafeInteger(diagnostics.failedCheckCount) ||
    diagnostics.failedCheckCount < 1
  ) {
    errors.push("Phase2E deploy rollback recovery proof is invalid.");
    return errors;
  }
  if (
    diagnostics.schemaVersion === LEGACY_DEPLOY_HEALTH_EVIDENCE_VERSION &&
    (run.id !== KNOWN_LEGACY_ROLLBACK_RECOVERY.runId ||
      run.headSha !== KNOWN_LEGACY_ROLLBACK_RECOVERY.failedReleaseSha ||
      activeSha !== KNOWN_LEGACY_ROLLBACK_RECOVERY.restoredReleaseSha ||
      diagnostics.artifactId !== KNOWN_LEGACY_ROLLBACK_RECOVERY.artifactId ||
      diagnostics.sha256 !== KNOWN_LEGACY_ROLLBACK_RECOVERY.diagnosticsSha256)
  ) {
    errors.push("Phase2E legacy rollback recovery proof is not pinned.");
  }
  return errors;
}

function isPathWithin(directory, candidatePath) {
  const child = relative(resolve(directory), resolve(candidatePath));
  return (
    Boolean(child) && !isAbsolute(child) && !/^\.\.(?:[\\/]|$)/u.test(child)
  );
}

async function validatePhase2eChildArtifact(
  report,
  repositoryRoot,
  expectedMain,
  expectedStaging,
) {
  const errors = [];
  const artifact = report.database?.migration?.artifact;
  if (
    !isRecord(artifact) ||
    typeof artifact.path !== "string" ||
    isAbsolute(artifact.path) ||
    !isCount(artifact.sizeBytes) ||
    artifact.sizeBytes === 0 ||
    !isSha256(artifact.sha256) ||
    artifact.version !== SPRINT7_MIGRATION_SMOKE_VERSION ||
    !sameMembers(artifact.targets, ["empty-database", "staging-copy"]) ||
    !artifact.path.startsWith("artifacts/migration-smoke/")
  ) {
    return ["Phase2E child migration artifact metadata is invalid."];
  }

  const childPath = resolve(repositoryRoot, artifact.path);
  if (!isPathWithin(repositoryRoot, childPath)) {
    return ["Phase2E child migration artifact path escapes its repository."];
  }
  try {
    const fileInfo = await lstat(childPath);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
      return ["Phase2E child migration artifact is not a regular file."];
    }
    const canonicalRoot = await realpath(repositoryRoot);
    const canonicalChild = await realpath(childPath);
    if (!isPathWithin(canonicalRoot, canonicalChild)) {
      return [
        "Phase2E child migration artifact resolves outside its evidence root.",
      ];
    }
    const bytes = await readFile(canonicalChild);
    if (bytes.byteLength !== artifact.sizeBytes)
      errors.push("Phase2E child migration artifact size does not match.");
    if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
      errors.push("Phase2E child migration artifact hash does not match.");
    let childReport;
    try {
      childReport = JSON.parse(bytes.toString("utf8"));
    } catch {
      errors.push("Phase2E child migration artifact is not valid JSON.");
      return errors;
    }
    try {
      assertMigrationRehearsalReport(childReport, {
        requireExactRefs: true,
        expectedMain,
        expectedStaging,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  } catch (error) {
    errors.push(
      `Phase2E child migration artifact could not be verified: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return errors;
}

async function listJsonFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(path);
    }
  }
  return files;
}

async function classifyArtifact(
  relativeDirectory,
  artifactPath,
  evidenceRoot,
  bytes,
  options,
) {
  let parsed;
  let parseError = null;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    parseError = "Artifact is not valid JSON.";
  }

  let kind = "unknown";
  let validationErrors = parseError ? [parseError] : [];
  let classification = {
    candidateDatabaseRehearsal: false,
    liveStagingEvidence: false,
    w12Evidence: false,
  };
  let semanticStatus = "invalid";

  if (!parseError && relativeDirectory === "artifacts/staging-smoke") {
    kind = "staging-smoke";
    validationErrors = validateStagingSmokeEvidence(parsed, {
      expectedStaging:
        options.expectedActiveStagingRelease ?? options.expectedStaging,
      nowMs: options.nowMs,
    });
    classification = {
      candidateDatabaseRehearsal: false,
      liveStagingEvidence: validationErrors.length === 0,
      w12Evidence: false,
    };
  } else if (!parseError && relativeDirectory === "artifacts/migration-smoke") {
    kind = "migration-smoke";
    validationErrors = validateMigrationSmokeEvidence(parsed, {
      expectedMain: options.expectedMain,
      expectedStaging: options.expectedStaging,
      nowMs: options.nowMs,
      maxAgeMs: MIGRATION_SMOKE_MAX_AGE_MS,
    });
    classification.candidateDatabaseRehearsal = true;
  } else if (
    !parseError &&
    relativeDirectory === "artifacts/phase2e-staging-preflight"
  ) {
    classification.candidateDatabaseRehearsal = true;
    if (parsed?.version === PHASE2E_PREFLIGHT_VERSION) {
      kind = "phase2e-staging-preflight";
      validationErrors = [
        ...validatePhase2eStructure(
          parsed,
          options.expectedMain,
          options.expectedStaging,
          options.nowMs,
        ),
        ...(await validatePhase2eChildArtifact(
          parsed,
          options.repoRoot,
          options.expectedMain,
          options.expectedStaging,
        )),
      ];
    } else if (parsed?.version === SPRINT7_MIGRATION_SMOKE_VERSION) {
      kind = "phase2e-migration-child";
      validationErrors = validateMigrationSmokeEvidence(parsed, {
        requiredTargets: ["empty-database", "staging-copy"],
      });
      semanticStatus = validationErrors.length === 0 ? "child-only" : "invalid";
    } else {
      kind = "unknown-phase2e-artifact";
      validationErrors = [
        "Phase2E evidence directory contains an unknown artifact.",
      ];
    }
  } else if (
    !parseError &&
    relativeDirectory === W00_STAGING_PRINCIPAL_REPORT_DIRECTORY &&
    artifactPath.endsWith(`/${W00_STAGING_PRINCIPAL_REPORT_NAME}`)
  ) {
    kind = "w00-staging-principal";
    validationErrors = validateW00StagingPrincipalEvidence(parsed, {
      nowMs: options.nowMs,
      expectedDeployedSha: options.expectedDeployedSha,
    });
    classification = {
      candidateDatabaseRehearsal: false,
      liveStagingEvidence: validationErrors.length === 0,
      stagingPrincipalEvidence: validationErrors.length === 0,
      w12Evidence: false,
    };
  } else if (
    !parseError &&
    relativeDirectory === "artifacts/platform-admin-final-gate"
  ) {
    kind = "platform-admin-final-gate";
    validationErrors = validateStaticGateEvidence(parsed, kind);
    semanticStatus =
      validationErrors.length === 0 ? "contract-only" : "invalid";
  } else if (!parseError && relativeDirectory === "artifacts/final-gate") {
    kind = "sprint16-final-gate";
    validationErrors = validateStaticGateEvidence(parsed, kind);
    semanticStatus =
      validationErrors.length === 0 ? "contract-only" : "invalid";
  } else if (
    !parseError &&
    relativeDirectory === "artifacts/staging-promotion-gate"
  ) {
    kind = "staging-promotion-gate-report";
    validationErrors = validatePromotionGateReport(parsed);
    semanticStatus = validationErrors.length === 0 ? "report-only" : "invalid";
  }

  if (
    validationErrors.length === 0 &&
    !["contract-only", "report-only", "child-only"].includes(semanticStatus)
  ) {
    semanticStatus = "valid";
  }
  let evidenceTimestampMs = null;
  const timestamp =
    kind === "staging-smoke"
      ? parsed?.finishedAt
      : kind === "migration-smoke"
        ? parsed?.createdAt
        : kind === "phase2e-staging-preflight"
          ? parsed?.finishedAt
          : kind === "w00-staging-principal"
            ? (parsed?.release?.boundAt ?? parsed?.completedAt)
            : null;
  if (isTimestamp(timestamp)) evidenceTimestampMs = Date.parse(timestamp);
  return {
    path: relative(options.repoRoot, artifactPath).replace(/\\/gu, "/"),
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    kind,
    activeStagingReleaseSha:
      kind === "phase2e-staging-preflight" && semanticStatus === "valid"
        ? (parsed?.rollback?.expectedActiveStagingReleaseSha ?? null)
        : null,
    evidenceTimestampMs,
    semanticStatus,
    validationErrors,
    classification,
    summary:
      semanticStatus === "valid"
        ? `${kind} semantisch groen`
        : validationErrors.join(" | ") || `${kind} ${semanticStatus}`,
  };
}

function latestEvidenceArtifact(artifacts, kind) {
  return artifacts
    .filter((artifact) => artifact.kind === kind)
    .sort((left, right) => {
      const byTime =
        (right.evidenceTimestampMs ?? Number.NEGATIVE_INFINITY) -
        (left.evidenceTimestampMs ?? Number.NEGATIVE_INFINITY);
      return byTime || right.path.localeCompare(left.path);
    })[0];
}

function latestValidEvidence(artifacts, kind) {
  const latest = latestEvidenceArtifact(artifacts, kind);
  return latest?.semanticStatus === "valid" ? [latest] : [];
}

async function listJsonArtifacts(relativeDirectory, options) {
  const evidenceRoot = join(options.repoRoot, relativeDirectory);
  const artifacts = [];
  for (const artifactPath of (await listJsonFiles(evidenceRoot)).sort()) {
    const fileInfo = await lstat(artifactPath);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) continue;
    const canonicalPath = await realpath(artifactPath);
    if (!isPathWithin(evidenceRoot, canonicalPath)) continue;
    const bytes = await readFile(canonicalPath);
    artifacts.push(
      await classifyArtifact(
        relativeDirectory,
        artifactPath,
        evidenceRoot,
        bytes,
        options,
      ),
    );
  }
  return artifacts.sort((left, right) => right.path.localeCompare(left.path));
}

export async function collectPromotionEvidence(options = {}) {
  const context = {
    repoRoot: options.repoRoot ?? repoRoot,
    expectedMain: options.expectedMain ?? "",
    expectedStaging: options.expectedStaging ?? "",
    expectedDeployedSha: options.expectedDeployedSha ?? "",
    nowMs: options.nowMs,
  };
  const phase2eDirectory = "artifacts/phase2e-staging-preflight";
  const phase2eArtifacts = await listJsonArtifacts(phase2eDirectory, context);
  const latestPhase2e = latestValidEvidence(
    phase2eArtifacts,
    "phase2e-staging-preflight",
  )[0];
  const evidenceContext = {
    ...context,
    expectedActiveStagingRelease:
      latestPhase2e?.activeStagingReleaseSha ?? context.expectedStaging,
  };
  const entries = await Promise.all(
    promotionEvidenceDirectories
      .filter((directory) => directory !== phase2eDirectory)
      .map(async (directory) => [
        directory,
        await listJsonArtifacts(directory, evidenceContext),
      ]),
  );
  return Object.fromEntries([[phase2eDirectory, phase2eArtifacts], ...entries]);
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
    collectPromotionEvidence({
      repoRoot: options.evidenceRoot ?? options.repoRoot,
      expectedMain: options.expectedMain,
      expectedStaging: options.expectedStaging,
      nowMs: options.nowMs,
    }),
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

  const stagingEvidence = latestValidEvidence(
    evidence["artifacts/staging-smoke"] ?? [],
    "staging-smoke",
  );
  const migrationEvidence = latestValidEvidence(
    evidence["artifacts/migration-smoke"] ?? [],
    "migration-smoke",
  );
  const phase2eEvidence = latestValidEvidence(
    evidence["artifacts/phase2e-staging-preflight"] ?? [],
    "phase2e-staging-preflight",
  );
  const w00StagingPrincipalEvidence = latestValidEvidence(
    evidence[W00_STAGING_PRINCIPAL_REPORT_DIRECTORY] ?? [],
    "w00-staging-principal",
  );
  const platformAdminEvidence = (
    evidence["artifacts/platform-admin-final-gate"] ?? []
  ).filter((artifact) => artifact.semanticStatus === "contract-only");
  const finalGateEvidence = (evidence["artifacts/final-gate"] ?? []).filter(
    (artifact) => artifact.semanticStatus === "contract-only",
  );

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
        stagingEvidence.length > 0 &&
        migrationEvidence.length > 0 &&
        phase2eEvidence.length > 0
          ? "ok"
          : strictEvidence
            ? "blocked"
            : "warning",
      owner: "Platform operations",
      command:
        "pnpm fieldgrid:sprint15-staging-smoke:run-read-only && pnpm fieldgrid:sprint7-migration-smoke --run --target all && pnpm fieldgrid:phase2e-staging-preflight --run --expected-main SHA --expected-staging SHA",
      evidence: `${stagingEvidence.length} exact-SHA staging-smoke artifact(s), ${migrationEvidence.length} semantisch geldige migration-smoke artifact(s), ${phase2eEvidence.length} exact-SHA Phase2E artifact(s), ${w00StagingPrincipalEvidence.length} strikte migration-admin ownership artifact(s).`,
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
    expectedRefs: {
      main: options.expectedMain ?? "",
      staging: options.expectedStaging ?? "",
    },
    evidenceClassification: {
      phase2e: {
        candidateDatabaseRehearsal: true,
        liveStagingEvidence: false,
        w12Evidence: false,
      },
      w00StagingPrincipal: {
        candidateDatabaseRehearsal: false,
        liveStagingEvidence: true,
        stagingPrincipalEvidence: true,
        w12Evidence: false,
      },
      staticFinalGatePlansAreRuntimeEvidence: false,
    },
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
  if (
    plan.evidenceClassification?.phase2e?.candidateDatabaseRehearsal !== true ||
    plan.evidenceClassification?.phase2e?.liveStagingEvidence !== false ||
    plan.evidenceClassification?.phase2e?.w12Evidence !== false ||
    plan.evidenceClassification?.w00StagingPrincipal
      ?.candidateDatabaseRehearsal !== false ||
    plan.evidenceClassification?.w00StagingPrincipal?.liveStagingEvidence !==
      true ||
    plan.evidenceClassification?.w00StagingPrincipal
      ?.stagingPrincipalEvidence !== true ||
    plan.evidenceClassification?.w00StagingPrincipal?.w12Evidence !== false ||
    plan.evidenceClassification?.staticFinalGatePlansAreRuntimeEvidence !==
      false
  ) {
    errors.push("Promotion-evidence classificatie is niet fail-closed.");
  }

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
    const semanticArtifacts = (directory, semanticStatus = "valid") =>
      (plan.evidence[directory] ?? []).filter(
        (artifact) => artifact.semanticStatus === semanticStatus,
      );
    if (!isFullSha(plan.expectedRefs?.main))
      errors.push("Strict evidence vereist een exacte main SHA.");
    if (!isFullSha(plan.expectedRefs?.staging))
      errors.push("Strict evidence vereist een exacte vorige staging SHA.");
    if (semanticArtifacts("artifacts/staging-smoke").length === 0) {
      errors.push(
        "Strict evidence mist semantisch geldige artifacts/staging-smoke JSON.",
      );
    }
    if (semanticArtifacts("artifacts/migration-smoke").length === 0) {
      errors.push(
        "Strict evidence mist semantisch geldige artifacts/migration-smoke JSON.",
      );
    }
    if (semanticArtifacts("artifacts/phase2e-staging-preflight").length === 0) {
      errors.push(
        "Strict evidence mist exact-SHA artifacts/phase2e-staging-preflight JSON.",
      );
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

export async function bindW00StagingPrincipalArtifactToRelease(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const expectedDeployedSha = options.expectedDeployedSha ?? "";
  if (!isFullSha(expectedDeployedSha)) {
    throw new Error(
      "W00 pre-activation binding requires an exact deployed release SHA.",
    );
  }
  const markerPath = join(root, ".fieldgrid-release-sha");
  const reportPath = join(
    root,
    W00_STAGING_PRINCIPAL_REPORT_DIRECTORY,
    W00_STAGING_PRINCIPAL_REPORT_NAME,
  );
  let markerInfo;
  let reportInfo;
  try {
    [markerInfo, reportInfo] = await Promise.all([
      lstat(markerPath),
      lstat(reportPath),
    ]);
  } catch {
    throw new Error(
      "W00 pre-activation release marker and principal evidence must exist.",
    );
  }
  if (
    markerInfo.isSymbolicLink() ||
    !markerInfo.isFile() ||
    reportInfo.isSymbolicLink() ||
    !reportInfo.isFile()
  ) {
    throw new Error(
      "W00 pre-activation release marker and principal evidence must be regular files.",
    );
  }
  const markerSha = (await readFile(markerPath, "utf8")).trim();
  if (markerSha !== expectedDeployedSha) {
    throw new Error(
      "W00 pre-activation release marker differs from the expected deployed SHA.",
    );
  }
  let report;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
  } catch {
    throw new Error("W00 staging-principal evidence is not readable JSON.");
  }
  const nowMs = options.nowMs ?? Date.now();
  const coreErrors = validateW00StagingPrincipalEvidence(report, {
    nowMs,
    requireReleaseBinding: false,
  });
  if (coreErrors.length > 0) {
    throw new Error(coreErrors.join(" | "));
  }
  const boundReport = {
    ...report,
    release: {
      version: W00_STAGING_PRINCIPAL_RELEASE_BINDING_VERSION,
      expectedDeployedSha,
      markerSha,
      exactMatch: true,
      source: ".fieldgrid-release-sha",
      boundAt: new Date(nowMs).toISOString(),
    },
  };
  await writeFile(
    reportPath,
    `${JSON.stringify(boundReport, null, 2)}\n`,
    "utf8",
  );
  return boundReport;
}

export async function validateStrictW00StagingPrincipalArtifact(options = {}) {
  const expectedDeployedSha = options.expectedDeployedSha ?? "";
  if (!isFullSha(expectedDeployedSha)) {
    return ["Pre-activation requires an exact expected deployed release SHA."];
  }
  const evidence = await collectPromotionEvidence({
    repoRoot: options.repoRoot,
    nowMs: options.nowMs,
    expectedDeployedSha,
  });
  const reports = (
    evidence[W00_STAGING_PRINCIPAL_REPORT_DIRECTORY] ?? []
  ).filter((artifact) => artifact.kind === "w00-staging-principal");
  if (
    reports.length !== 1 ||
    reports[0]?.semanticStatus !== "valid" ||
    reports[0]?.classification?.stagingPrincipalEvidence !== true
  ) {
    return [
      "Pre-activation requires exactly one fresh, strict and semantically valid W00 staging-principal artifact.",
    ];
  }
  return [];
}

function usage() {
  return `Fieldgrid staging promotion gate

Usage:
  pnpm fieldgrid:staging-promotion-gate:check
  pnpm fieldgrid:staging-promotion-gate --json
  pnpm fieldgrid:staging-promotion-gate:strict

Modes:
  --check validates static CI contracts.
  --strict-evidence requires semantically green staging-smoke, migration-smoke
  and Phase2E v2 artifacts bound to --expected-main and --expected-staging.
  --evidence-root selects an isolated evidence directory for strict validation.
  --strict-w00-principal validates the fresh strict W00 migration-admin ownership artifact
  after forward migrations, binds it to --expected-deployed-sha and the fixed
  .fieldgrid-release-sha marker, then validates it before release activation.
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

  if (options.strictW00Principal) {
    await bindW00StagingPrincipalArtifactToRelease({
      expectedDeployedSha: options.expectedDeployed,
    });
    const errors = await validateStrictW00StagingPrincipalArtifact({
      expectedDeployedSha: options.expectedDeployed,
    });
    if (errors.length > 0) {
      console.error("Fieldgrid W00 staging-principal activation gate failed:");
      for (const error of errors) console.error(`- ${error}`);
      return 1;
    }
    console.log(
      "Fieldgrid W00 staging-principal activation evidence is valid.",
    );
    return 0;
  }

  const plan = await buildStagingPromotionGatePlan({
    strictEvidence: options.strictEvidence,
    expectedMain: options.expectedMain,
    expectedStaging: options.expectedStaging,
    evidenceRoot: options.evidenceRoot || undefined,
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
