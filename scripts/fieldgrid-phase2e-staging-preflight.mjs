#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  allowedHistoricalRecordedMigrations,
  allowedLegacyTimestampMigrations,
  buildMigrationOrderReport,
  classifyMigrationFilename,
  validateMigrationOrderReport,
} from "./fieldgrid-migration-order-check.mjs";
import { validateEnvironmentIsolation } from "./fieldgrid-environment-isolation-preflight.mjs";
import {
  SUPABASE_ROOT_2021_CA_SHA256,
  validateDatabaseRootCertificateFile,
} from "./fieldgrid-database-root-cert.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const PHASE2E_PREFLIGHT_VERSION = "phase2e-staging-preflight-v2";
export const CONFIRMATION = "phase2e-staging-only";
export const EXPECTED_STAGING_PROJECT_REF = "olyfmekyqozxrbrwwszu";
export const ROLLBACK_RECOVERY_PROOF_VERSION =
  "phase2e-staging-rollback-recovery-v1";
export const DEPLOY_HEALTH_EVIDENCE_VERSION = "fieldgrid-deploy-health-gate-v2";
export const LEGACY_DEPLOY_HEALTH_EVIDENCE_VERSION =
  "fieldgrid-deploy-health-gate-legacy-v1";
export const ROLLBACK_RECOVERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const KNOWN_LEGACY_ROLLBACK_RECOVERY = Object.freeze({
  runId: "34193169329",
  artifactId: 10043061382,
  failedReleaseSha: "024c6160872dd85b19f011db1957005b625e8362",
  restoredReleaseSha: "535b3c6026694092ebbd4e8493346f986506fbf2",
  diagnosticsSha256:
    "dbec3d22e50a24eab96af18bacbc9c75216b30a36a834ded03ce6d427118cd58",
});
export const BACKUP_SCHEMAS = [
  "public",
  "auth",
  "storage",
  "drizzle",
  "app_private",
];

export const REQUIRED_SECRET_NAMES = [
  "DATABASE_URL",
  "FIELDGRID_MIGRATION_DATABASE_URL",
  "SESSION_SECRET",
  "JWT_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MOLLIE_API_KEY",
  "MOLLIE_WEBHOOK_SECRET",
  "ADMIN_API_SECRET",
  "FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY",
  "FIELDGRID_CREDENTIAL_RECOVERY_SECRET",
  "WEBSITE_FORM_HASH_SECRET",
];

export const REQUIRED_VARIABLE_NAMES = [
  "APP_URL",
  "BACKOFFICE_SERVICE_NAME",
  "PERSONEEL_SERVICE_NAME",
  "KLANT_SERVICE_NAME",
  "API_SERVICE_NAME",
  "BACKOFFICE_PORT",
  "PERSONEEL_PORT",
  "KLANT_PORT",
  "API_PORT",
  "BACKOFFICE_PUBLIC_LOGIN_URL",
  "PERSONEEL_PUBLIC_HEALTH_URL",
  "KLANT_PUBLIC_HEALTH_URL",
  "API_PUBLIC_HEALTH_URL",
  "API_PUBLIC_ROOT_URL",
  "PILOT_TENANT_LOGIN_URL",
  "FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON",
  "NEXT_PUBLIC_MARKETING_SITE_URL",
  "FIELDGRID_CUSTOM_ROUTE_KEY",
  "FIELDGRID_CUSTOM_EXPECTED_HOST",
];

export const CRITICAL_RELATIONS = [
  "auth.users",
  "storage.objects",
  "public.tenants",
  "public.tenant_users",
  "public.personnel",
  "public.customers",
  "public.assignments",
  "public.assignment_personnel",
  "public.payments",
  "public.customer_payment_batches",
  "public.portal_realtime_events",
  "public.website_sites",
  "public.website_domain_bindings",
  "public.website_custom_deployments",
  "public.website_publications",
  "public.website_delivery_activations",
];

export const TRANSIENT_MIGRATION_RELATIONS = ["public.portal_realtime_events"];
export const DURABLE_MIGRATION_RELATIONS = CRITICAL_RELATIONS.filter(
  (relation) => !TRANSIENT_MIGRATION_RELATIONS.includes(relation),
);

export const PAYMENT_INTENT_DIAGNOSTIC_VERSION =
  "phase2e-payment-intent-diagnostic-v1";
export const REALTIME_PUBLICATION_METADATA_VERSION =
  "phase2e-realtime-publication-v1";
export const REALTIME_PUBLICATION = Object.freeze({
  publication: "supabase_realtime",
  schema: "public",
  table: "portal_realtime_events",
});
export const TENANT_USER_ROLE_CONSTRAINT_READINESS_VERSION =
  "tenant-user-role-constraint-readiness-v1";
export const TENANT_USER_ROLE_CONSTRAINT_PROOF_VERSION =
  "tenant-user-role-constraint-proof-v1";
export const TENANT_USER_ROLE_CONSTRAINTS = Object.freeze([
  Object.freeze({
    name: "tenant_user_roles_tenant_membership_fk",
    tableSchema: "public",
    table: "tenant_user_roles",
    columns: Object.freeze(["tenant_id", "user_id"]),
    referencedSchema: "public",
    referencedTable: "tenant_users",
    referencedColumns: Object.freeze(["tenant_id", "user_id"]),
  }),
  Object.freeze({
    name: "tenant_user_roles_tenant_role_scope_fk",
    tableSchema: "public",
    table: "tenant_user_roles",
    columns: Object.freeze(["tenant_id", "tenant_role_id"]),
    referencedSchema: "public",
    referencedTable: "tenant_roles",
    referencedColumns: Object.freeze(["tenant_id", "id"]),
  }),
]);
export const TENANT_USER_ROLE_CONSTRAINT_READINESS_QUERY = `
select jsonb_build_object(
  'version', '${TENANT_USER_ROLE_CONSTRAINT_READINESS_VERSION}',
  'roleScopeMismatches', (
    select count(*)
    from public.tenant_user_roles assignment
    where assignment.tenant_id is not null
      and assignment.tenant_role_id is not null
      and not exists (
        select 1
        from public.tenant_roles role
        where role.tenant_id = assignment.tenant_id
          and role.id = assignment.tenant_role_id
      )
  ),
  'membershipMismatches', (
    select count(*)
    from public.tenant_user_roles assignment
    where assignment.tenant_id is not null
      and assignment.user_id is not null
      and not exists (
        select 1
        from public.tenant_users membership
        where membership.tenant_id = assignment.tenant_id
          and membership.user_id = assignment.user_id
      )
  )
)::text;
`;
export const TENANT_USER_ROLE_CONSTRAINT_PROOF_QUERY = `
select jsonb_build_object(
  'version', '${TENANT_USER_ROLE_CONSTRAINT_PROOF_VERSION}',
  'constraints', coalesce(jsonb_agg(
    jsonb_build_object(
      'name', constraint_record.conname,
      'type', constraint_record.contype,
      'validated', constraint_record.convalidated,
      'tableSchema', source_namespace.nspname,
      'table', source_relation.relname,
      'columns', (
        select jsonb_agg(source_attribute.attname order by source_key.ordinality)
        from unnest(constraint_record.conkey) with ordinality as source_key(attnum, ordinality)
        join pg_attribute source_attribute
          on source_attribute.attrelid = constraint_record.conrelid
         and source_attribute.attnum = source_key.attnum
      ),
      'referencedSchema', target_namespace.nspname,
      'referencedTable', target_relation.relname,
      'referencedColumns', (
        select jsonb_agg(target_attribute.attname order by target_key.ordinality)
        from unnest(constraint_record.confkey) with ordinality as target_key(attnum, ordinality)
        join pg_attribute target_attribute
          on target_attribute.attrelid = constraint_record.confrelid
         and target_attribute.attnum = target_key.attnum
      )
    ) order by constraint_record.conname
  ), '[]'::jsonb)
from pg_constraint constraint_record
join pg_class source_relation on source_relation.oid = constraint_record.conrelid
join pg_namespace source_namespace on source_namespace.oid = source_relation.relnamespace
left join pg_class target_relation on target_relation.oid = constraint_record.confrelid
left join pg_namespace target_namespace on target_namespace.oid = target_relation.relnamespace
where constraint_record.conrelid = 'public.tenant_user_roles'::regclass
  and constraint_record.conname in (
    'tenant_user_roles_tenant_role_scope_fk',
    'tenant_user_roles_tenant_membership_fk'
  );
`;
export const PAYMENT_INTENT_DIAGNOSTIC_QUERY = `
select jsonb_build_object(
  'version', '${PAYMENT_INTENT_DIAGNOSTIC_VERSION}',
  'recordedPhase2c1Migrations', coalesce((
    select jsonb_agg(history.name order by history.name)
    from drizzle.veele_sql_migrations history
    where history.name like '20260719%'
  ), '[]'::jsonb),
  'duplicateSources', coalesce((
    select jsonb_agg(duplicate.summary order by duplicate.tenant_id, duplicate.source_type, duplicate.source_id)
    from (
      select
        payment.tenant_id,
        payment.source_type,
        payment.source_id,
        jsonb_build_object(
          'tenantId', payment.tenant_id,
          'sourceType', payment.source_type,
          'sourceId', payment.source_id,
          'intentCount', count(*),
          'intents', jsonb_agg(
            jsonb_build_object(
              'status', payment.status::text,
              'createdAt', payment.created_at,
              'updatedAt', payment.updated_at,
              'hasMolliePaymentId', payment.mollie_payment_id is not null,
              'stagingDemoMollieId', payment.mollie_payment_id like 'tr_staging_demo_%',
              'hasCheckoutUrl', payment.checkout_url is not null,
              'stagingDemoCheckoutUrl', payment.checkout_url like 'https://www.mollie.com/checkout/staging-demo/%',
              'hasPaidAt', payment.paid_at is not null,
              'allocationCount', (
                select count(*)
                from public.payment_allocations allocation
                where allocation.payment_id = payment.id
              )
            )
            order by payment.created_at, payment.id
          )
        ) as summary
      from public.payments payment
      where payment.payment_method = 'mollie'
        and payment.tenant_id is not null
        and payment.source_id is not null
      group by payment.tenant_id, payment.source_type, payment.source_id
      having count(*) > 1
    ) duplicate
  ), '[]'::jsonb)
)::text;
`;

const PHASE2_RLS_RELATIONS = [
  "assignment_personnel_lifecycle_history",
  "assignment_participant_executions",
  "credential_recovery_challenges",
  "credential_recovery_events",
  "offline_operation_receipts",
];

const RESTORE_ROLES = [
  ["anon", "NOLOGIN"],
  ["authenticated", "NOLOGIN"],
  ["service_role", "NOLOGIN BYPASSRLS"],
  ["authenticator", "NOLOGIN"],
  ["dashboard_user", "NOLOGIN"],
  ["supabase_admin", "NOLOGIN SUPERUSER"],
  ["supabase_auth_admin", "NOLOGIN"],
  ["supabase_storage_admin", "NOLOGIN"],
];

function usage() {
  return `Fieldgrid Phase 2E staging preflight\n\nUsage:\n  pnpm fieldgrid:phase2e-staging-preflight:check\n  pnpm fieldgrid:phase2e-staging-preflight --run --expected-main SHA --expected-staging SHA --expected-active-staging-release SHA [--rollback-deploy-run-id ID]\n\n--expected-staging always identifies the immutable staging Git ref. When the\nactive release differs after a successful automatic rollback, pass that exact\nmarker through --expected-active-staging-release and bind it to the failed\ndeploy run with --rollback-deploy-run-id. The run never moves a Git ref.\n`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    run: false,
    help: false,
    expectedMain: "",
    expectedStaging: "",
    expectedActiveStagingRelease: "",
    rollbackDeployRunId: "",
    outDir: join(repoRoot, "artifacts", "phase2e-staging-preflight"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index];

    switch (flag) {
      case "--check":
        options.check = true;
        break;
      case "--run":
        options.run = true;
        break;
      case "--expected-main":
        options.expectedMain = nextValue();
        break;
      case "--expected-staging":
        options.expectedStaging = nextValue();
        break;
      case "--expected-active-staging-release":
        options.expectedActiveStagingRelease = nextValue();
        break;
      case "--rollback-deploy-run-id":
        options.rollbackDeployRunId = nextValue();
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

export function isFullSha(value) {
  return /^[0-9a-f]{40}$/u.test(value ?? "");
}

export function missingNames(names, env = process.env) {
  return names.filter((name) => !String(env[name] ?? "").trim());
}

export function parsePostgresEnv(
  databaseUrl,
  name = "FIELDGRID_MIGRATION_DATABASE_URL",
  env = process.env,
) {
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(`${name} must use the postgres or postgresql protocol.`);
  }
  if (!parsed.hostname || !parsed.username || !parsed.pathname.slice(1)) {
    throw new Error(`${name} must include host, user and database name.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${name} must not contain connection overrides.`);
  }

  const rootCertificate = validateDatabaseRootCertificateFile(
    env.FIELDGRID_DATABASE_SSL_ROOT_CERT,
  );
  const values = {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: rootCertificate.path,
  };

  for (const [name, value] of Object.entries(values)) {
    if (/[\r\n]/u.test(value))
      throw new Error(`${name} contains an unsupported newline.`);
  }
  return values;
}

export function sanitizePublicUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:")
    throw new Error("Staging routing URLs must use HTTPS.");
  return `${parsed.origin}${parsed.pathname}`;
}

export function isAllowedRouteStatus(mode, status) {
  if (mode === "exact-200") return status === 200;
  if (mode === "login")
    return status === 200 || [301, 302, 303, 307, 308].includes(status);
  if (mode === "api-root")
    return status >= 200 && status < 500 && status !== 404;
  return false;
}

export function assertMatchingCounts(sourceCounts, restoredCounts) {
  const differences = [];
  for (const relation of CRITICAL_RELATIONS) {
    if (!(relation in sourceCounts))
      differences.push(`${relation}: missing from source`);
    else if (!(relation in restoredCounts))
      differences.push(`${relation}: missing from restore`);
    else if (sourceCounts[relation] !== restoredCounts[relation]) {
      differences.push(
        `${relation}: source=${sourceCounts[relation]} restore=${restoredCounts[relation]}`,
      );
    }
  }
  if (differences.length > 0) {
    throw new Error(
      `Restored critical row counts differ: ${differences.join("; ")}`,
    );
  }
  return true;
}

export function assertMigratedDataIntegrity(
  restoredCounts,
  migratedCounts,
  liveRealtimeEventsBeforeMigration,
  migratedRealtimeEventIds,
  rehearsalCompletedAt,
) {
  const differences = [];
  for (const relation of DURABLE_MIGRATION_RELATIONS) {
    if (!(relation in restoredCounts))
      differences.push(`${relation}: missing before migration`);
    else if (!(relation in migratedCounts))
      differences.push(`${relation}: missing after migration`);
    else if (restoredCounts[relation] !== migratedCounts[relation]) {
      differences.push(
        `${relation}: before=${restoredCounts[relation]} after=${migratedCounts[relation]}`,
      );
    }
  }
  if (differences.length > 0) {
    throw new Error(
      `Migrated durable row counts differ: ${differences.join("; ")}`,
    );
  }

  const completedAt = Date.parse(rehearsalCompletedAt);
  if (!Number.isFinite(completedAt)) {
    throw new Error("Invalid migration rehearsal completion time.");
  }
  const protectedRealtimeEvents = liveRealtimeEventsBeforeMigration.filter(
    (event) => Date.parse(event.expiresAt) > completedAt,
  );
  const migratedIds = new Set(migratedRealtimeEventIds);
  const missingProtected = protectedRealtimeEvents.filter(
    (event) => !migratedIds.has(event.id),
  );
  if (missingProtected.length > 0) {
    throw new Error(
      `Migration removed ${missingProtected.length} realtime event(s) whose retention window extends beyond the rehearsal.`,
    );
  }

  return {
    durableRelationsCount: DURABLE_MIGRATION_RELATIONS.length,
    durableCountsMatched: true,
    transientRelations: TRANSIENT_MIGRATION_RELATIONS,
    realtimeEvents: {
      totalBeforeMigration: restoredCounts["public.portal_realtime_events"],
      totalAfterMigration: migratedCounts["public.portal_realtime_events"],
      liveBeforeMigration: liveRealtimeEventsBeforeMigration.length,
      protectedAtRehearsalCompletion: protectedRealtimeEvents.length,
      protectedPreserved: protectedRealtimeEvents.length,
      expiredRowsMayBePruned: true,
    },
    rawIdentifiersRecorded: false,
  };
}

export function validateRuntimeConfig(options, env = process.env) {
  const errors = [];
  if (!isFullSha(options.expectedMain))
    errors.push("--expected-main must be a full lowercase SHA.");
  if (!isFullSha(options.expectedStaging))
    errors.push("--expected-staging must be a full lowercase SHA.");
  if (!isFullSha(options.expectedActiveStagingRelease)) {
    errors.push(
      "--expected-active-staging-release must be a full lowercase SHA.",
    );
  }
  if (options.expectedMain === options.expectedStaging)
    errors.push("main and previous staging must differ before promotion.");
  const activeDiffersFromGit =
    isFullSha(options.expectedStaging) &&
    isFullSha(options.expectedActiveStagingRelease) &&
    options.expectedActiveStagingRelease !== options.expectedStaging;
  if (
    activeDiffersFromGit &&
    !/^[1-9][0-9]{0,19}$/u.test(options.rollbackDeployRunId ?? "")
  ) {
    errors.push(
      "--rollback-deploy-run-id is required when active staging differs from the staging Git ref.",
    );
  }
  if (!activeDiffersFromGit && String(options.rollbackDeployRunId ?? "")) {
    errors.push(
      "--rollback-deploy-run-id is allowed only for an active rollback divergence.",
    );
  }
  if (env.APP_ENV !== "staging" || env.TARGET_ENVIRONMENT !== "staging") {
    errors.push("The preflight is restricted to the staging environment.");
  }
  if (env.PHASE2E_CONFIRM !== CONFIRMATION)
    errors.push(`PHASE2E_CONFIRM must equal ${CONFIRMATION}.`);
  if (env.GITHUB_REF_NAME !== "main")
    errors.push("The preflight must be dispatched from main.");
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(
      String(env.GITHUB_REPOSITORY ?? ""),
    )
  )
    errors.push("GITHUB_REPOSITORY is required.");
  if (!String(env.GITHUB_TOKEN ?? "").trim())
    errors.push("GITHUB_TOKEN is required for immutable ref verification.");

  const missingSecrets = missingNames(REQUIRED_SECRET_NAMES, env);
  if (missingSecrets.length > 0)
    errors.push(`Missing staging secrets: ${missingSecrets.join(", ")}.`);
  const missingVariables = missingNames(REQUIRED_VARIABLE_NAMES, env);
  if (missingVariables.length > 0)
    errors.push(`Missing staging variables: ${missingVariables.join(", ")}.`);
  errors.push(...validateCustomCandidateConfig(options.expectedMain, env));

  const portNames = [
    "BACKOFFICE_PORT",
    "PERSONEEL_PORT",
    "KLANT_PORT",
    "API_PORT",
  ];
  const configuredPorts = portNames
    .map((name) => [name, String(env[name] ?? "")])
    .filter(([, value]) => value.length > 0);
  for (const [name, value] of configuredPorts) {
    const port = Number(value);
    if (!/^\d+$/u.test(value) || port < 1 || port > 65_535)
      errors.push(`${name} must be a valid TCP port.`);
  }
  if (
    new Set(configuredPorts.map(([, value]) => value)).size !==
    configuredPorts.length
  ) {
    errors.push("Staging service ports must be unique.");
  }

  try {
    validateEnvironmentIsolation(env, { requireMigrationDatabase: true });
  } catch {
    errors.push(
      "Runtime and migration database credentials must be distinct, queryless, and target the expected staging project.",
    );
  }
  if (
    env.APP_URL &&
    sanitizePublicUrl(env.APP_URL) !== "https://staging.fieldgrid.nl/"
  ) {
    errors.push("APP_URL must resolve to the canonical staging host.");
  }
  if (
    env.PILOT_TENANT_LOGIN_URL &&
    new URL(env.PILOT_TENANT_LOGIN_URL).hostname !==
      "field-demo.staging.fieldgrid.nl"
  ) {
    errors.push(
      "PILOT_TENANT_LOGIN_URL must use the current pilot tenant host.",
    );
  }

  return errors;
}

export function validateCustomCandidateConfig(expectedMain, env = process.env) {
  const required = [
    env.NEXT_PUBLIC_MARKETING_SITE_URL,
    env.FIELDGRID_CUSTOM_ROUTE_KEY,
    env.FIELDGRID_CUSTOM_EXPECTED_HOST,
    env.FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON,
  ];
  if (required.some((value) => !String(value ?? "").trim())) return [];

  const errors = [];
  const expectedHost = String(env.FIELDGRID_CUSTOM_EXPECTED_HOST).toLowerCase();
  let marketingUrl;
  try {
    marketingUrl = new URL(env.NEXT_PUBLIC_MARKETING_SITE_URL);
  } catch {
    errors.push("NEXT_PUBLIC_MARKETING_SITE_URL is not a valid URL.");
  }
  if (
    marketingUrl &&
    (marketingUrl.protocol !== "https:" ||
      marketingUrl.hostname !== expectedHost ||
      !expectedHost.endsWith(".staging.fieldgrid.nl") ||
      marketingUrl.username ||
      marketingUrl.password ||
      marketingUrl.port ||
      marketingUrl.pathname !== "/" ||
      marketingUrl.search ||
      marketingUrl.hash)
  ) {
    errors.push(
      "The marketing canonical URL and expected custom host must be the same staging HTTPS origin.",
    );
  }

  let routes;
  try {
    routes = JSON.parse(env.FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON);
  } catch {
    errors.push("FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON is not valid JSON.");
    return errors;
  }
  if (!Array.isArray(routes)) {
    errors.push("FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON must be an array.");
    return errors;
  }

  const candidate = routes.find(
    (route) =>
      route &&
      typeof route === "object" &&
      route.providerKey === "fieldgrid_vps" &&
      route.routeKey === env.FIELDGRID_CUSTOM_ROUTE_KEY &&
      Array.isArray(route.expectedHosts) &&
      route.expectedHosts.includes(expectedHost),
  );
  if (!candidate) {
    errors.push(
      "The reviewed custom route identity is missing from the route registry.",
    );
    return errors;
  }
  if (
    candidate.status !== "routable" ||
    candidate.releaseId !== `git-commit:${expectedMain}` ||
    candidate.healthPath !== "/api/health"
  ) {
    errors.push(
      "The reviewed custom route must be routable and bound to exact main with /api/health.",
    );
  }
  try {
    const upstream = new URL(candidate.upstreamOrigin);
    if (
      upstream.protocol !== "https:" ||
      !upstream.hostname.endsWith(".staging.fieldgrid.nl") ||
      upstream.username ||
      upstream.password ||
      upstream.port ||
      upstream.pathname !== "/" ||
      upstream.search ||
      upstream.hash
    ) {
      errors.push(
        "The reviewed custom upstream must be an origin-only staging HTTPS URL.",
      );
    }
  } catch {
    errors.push(
      "The reviewed custom upstream must be an origin-only staging HTTPS URL.",
    );
  }
  return errors;
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, "<redacted database url>")
    .replace(/(password|token|secret)=([^\s]+)/giu, "$1=<redacted>");
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) {
        resolvePromise({ code, stdout, stderr });
      } else {
        rejectPromise(
          new Error(
            `${command} exited with ${code}: ${safeMessage(stderr.trim() || stdout.trim())}`,
          ),
        );
      }
    });
    if (options.input !== undefined) child.stdin.end(options.input);
  });
}

const PYTHON_ZIP_COMMAND = String.raw`import os
import sys
import zipfile

mode = sys.argv[1]
archive_path = os.environ["FIELDGRID_ZIP_ARCHIVE_PATH"]
entry = os.environ.get("FIELDGRID_ZIP_ENTRY", "")
with zipfile.ZipFile(archive_path) as archive:
    if mode == "list":
        sys.stdout.write("\n".join(archive.namelist()))
    elif mode == "read" and entry:
        sys.stdout.buffer.write(archive.read(entry))
    else:
        raise SystemExit("invalid zip operation")
`;

async function runZipCommand(archivePath, operation, entry, options = {}) {
  if (operation !== "list" && operation !== "read") {
    throw new Error("Unsupported ZIP operation.");
  }
  return await runCommand("python3", ["-c", PYTHON_ZIP_COMMAND, operation], {
    ...options,
    env: {
      ...(options.env ?? process.env),
      FIELDGRID_ZIP_ARCHIVE_PATH: archivePath,
      FIELDGRID_ZIP_ENTRY: entry ?? "",
    },
  });
}

async function githubRefSha(branch, env = process.env) {
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/git/ref/heads/${branch}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok)
    throw new Error(
      `GitHub ref lookup for ${branch} failed with HTTP ${response.status}.`,
    );
  const payload = await response.json();
  return payload.object?.sha ?? "";
}

async function verifyImmutableRefs(options, env = process.env) {
  const [main, staging, checkout] = await Promise.all([
    githubRefSha("main", env),
    githubRefSha("staging", env),
    runCommand("git", ["rev-parse", "HEAD"]),
  ]);
  const actualCheckout = checkout.stdout.trim();
  if (main !== options.expectedMain)
    throw new Error(
      `origin/main moved: expected ${options.expectedMain}, found ${main}.`,
    );
  if (staging !== options.expectedStaging)
    throw new Error(
      `origin/staging moved: expected ${options.expectedStaging}, found ${staging}.`,
    );
  if (actualCheckout !== options.expectedMain)
    throw new Error(
      `Checkout is ${actualCheckout}, expected exact main ${options.expectedMain}.`,
    );
  return { main, staging, checkout: actualCheckout };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFreshTimestamp(value, nowMs, maxAgeMs) {
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) &&
    timestamp <= nowMs + 5 * 60 * 1000 &&
    nowMs - timestamp <= maxAgeMs
  );
}

function assertReleasePathForSha(path, baseDir, sha, label) {
  if (typeof path !== "string" || /[\r\n]/u.test(path)) {
    throw new Error(`${label} is not a valid release path.`);
  }
  const releasesRoot = resolve(baseDir, "releases");
  const resolvedPath = resolve(path);
  assertPathWithinDirectory(releasesRoot, resolvedPath);
  if (!basename(resolvedPath).endsWith(sha.slice(0, 7))) {
    throw new Error(`${label} is not bound to the expected release SHA.`);
  }
  return resolvedPath;
}

function exactPassedCheck(checks, name) {
  return (
    checks.filter(
      (check) =>
        isRecord(check) && check.name === name && check.status === "pass",
    ).length === 1
  );
}

export function validateRollbackDeployDiagnostics(
  report,
  {
    expectedGitStagingSha,
    expectedActiveStagingReleaseSha,
    baseDir,
    deployRunId,
    diagnosticsSha256,
  },
) {
  if (!isRecord(report)) {
    throw new Error("Rollback deploy diagnostics is not a JSON object.");
  }
  const schemaVersion =
    report.version === undefined
      ? LEGACY_DEPLOY_HEALTH_EVIDENCE_VERSION
      : report.version;
  if (
    ![
      DEPLOY_HEALTH_EVIDENCE_VERSION,
      LEGACY_DEPLOY_HEALTH_EVIDENCE_VERSION,
    ].includes(schemaVersion)
  ) {
    throw new Error("Rollback deploy diagnostics has an unknown schema.");
  }
  if (
    report.tool !== "fieldgrid-deploy-health-gate" ||
    report.environment !== "staging" ||
    report.status !== "fail" ||
    report.rollbackStatus !== "pass" ||
    report.detail !==
      "new release failed health gate; rollback health passed" ||
    report.baseDir !== baseDir ||
    report.expectedSha !== expectedGitStagingSha
  ) {
    throw new Error("Rollback deploy diagnostics identity is invalid.");
  }
  const failedReleasePath = assertReleasePathForSha(
    report.releasePath,
    baseDir,
    expectedGitStagingSha,
    "Failed release path",
  );
  const previousReleasePath = assertReleasePathForSha(
    report.previousRelease,
    baseDir,
    expectedActiveStagingReleaseSha,
    "Previous release path",
  );
  const currentTarget = assertReleasePathForSha(
    report.currentTarget,
    baseDir,
    expectedActiveStagingReleaseSha,
    "Recovered current target",
  );
  if (
    previousReleasePath !== currentTarget ||
    failedReleasePath === currentTarget
  ) {
    throw new Error("Rollback deploy diagnostics paths are inconsistent.");
  }

  const checks = Array.isArray(report.checks) ? report.checks : [];
  if (
    !exactPassedCheck(checks, "activation:restart") ||
    !exactPassedCheck(checks, "rollback:symlink") ||
    !exactPassedCheck(checks, "rollback:restart") ||
    !exactPassedCheck(checks, "rollback:health") ||
    checks.some(
      (check) =>
        isRecord(check) &&
        String(check.name ?? "").startsWith("rollback:") &&
        check.status !== "pass",
    ) ||
    !checks.some(
      (check) =>
        isRecord(check) &&
        check.status === "fail" &&
        !String(check.name ?? "").startsWith("rollback:"),
    )
  ) {
    throw new Error("Rollback deploy diagnostics checks are incomplete.");
  }
  if (
    schemaVersion === DEPLOY_HEALTH_EVIDENCE_VERSION &&
    !exactPassedCheck(checks, "rollback:environment")
  ) {
    throw new Error(
      "Rollback deploy diagnostics does not prove runtime environment restoration.",
    );
  }
  if (schemaVersion === LEGACY_DEPLOY_HEALTH_EVIDENCE_VERSION) {
    if (
      String(deployRunId) !== KNOWN_LEGACY_ROLLBACK_RECOVERY.runId ||
      expectedGitStagingSha !==
        KNOWN_LEGACY_ROLLBACK_RECOVERY.failedReleaseSha ||
      expectedActiveStagingReleaseSha !==
        KNOWN_LEGACY_ROLLBACK_RECOVERY.restoredReleaseSha ||
      diagnosticsSha256 !== KNOWN_LEGACY_ROLLBACK_RECOVERY.diagnosticsSha256
    ) {
      throw new Error(
        "Unversioned rollback diagnostics is not the pinned bootstrap recovery artifact.",
      );
    }
  }

  return {
    schemaVersion,
    failedReleasePath,
    restoredReleasePath: currentTarget,
    checkCount: checks.length,
    failedCheckCount: checks.filter(
      (check) => isRecord(check) && check.status === "fail",
    ).length,
  };
}

async function githubApiJson(path, env = process.env) {
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}${path}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub recovery readback failed with HTTP ${response.status}.`,
    );
  }
  return await response.json();
}

async function downloadRollbackDiagnostics(
  artifact,
  tempDir,
  env = process.env,
) {
  const expectedUrl = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/artifacts/${artifact.id}/zip`;
  if (artifact.archive_download_url !== expectedUrl) {
    throw new Error("Rollback diagnostics artifact URL is not canonical.");
  }
  const response = await fetch(expectedUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `Rollback diagnostics download failed with HTTP ${response.status}.`,
    );
  }
  const archiveBytes = Buffer.from(await response.arrayBuffer());
  if (archiveBytes.length === 0 || archiveBytes.length > 5 * 1024 * 1024) {
    throw new Error("Rollback diagnostics archive has an invalid size.");
  }
  const archivePath = join(tempDir, `rollback-diagnostics-${artifact.id}.zip`);
  await writeFile(archivePath, archiveBytes, { mode: 0o600 });
  const listing = await runZipCommand(archivePath, "list");
  const entries = listing.stdout.split(/\r?\n/u).filter(Boolean);
  if (
    entries.filter((entry) => entry === "deploy-health.json").length !== 1 ||
    entries.some(
      (entry) =>
        entry.startsWith("/") ||
        entry.split(/[\\/]/u).some((segment) => segment === ".."),
    )
  ) {
    throw new Error("Rollback diagnostics archive entries are invalid.");
  }
  const extracted = await runZipCommand(
    archivePath,
    "read",
    "deploy-health.json",
  );
  const bytes = Buffer.from(extracted.stdout, "utf8");
  if (bytes.length === 0 || bytes.length > 1024 * 1024) {
    throw new Error("Rollback deploy diagnostics has an invalid size.");
  }
  return bytes;
}

export async function verifyRollbackDeployRecovery(
  {
    deployRunId,
    expectedGitStagingSha,
    expectedActiveStagingReleaseSha,
    baseDir,
    tempDir,
    nowMs = Date.now(),
  },
  env = process.env,
  dependencies = {},
) {
  const readApi = dependencies.githubApiJson ?? githubApiJson;
  const readDiagnostics =
    dependencies.downloadRollbackDiagnostics ?? downloadRollbackDiagnostics;
  const run = await readApi(`/actions/runs/${deployRunId}`, env);
  const isPinnedLegacyRecovery =
    String(deployRunId) === KNOWN_LEGACY_ROLLBACK_RECOVERY.runId &&
    expectedGitStagingSha === KNOWN_LEGACY_ROLLBACK_RECOVERY.failedReleaseSha &&
    expectedActiveStagingReleaseSha ===
      KNOWN_LEGACY_ROLLBACK_RECOVERY.restoredReleaseSha;
  if (
    String(run?.id) !== String(deployRunId) ||
    run?.name !== "Deploy VEELE" ||
    run?.path !== ".github/workflows/deploy.yml" ||
    run?.event !== (isPinnedLegacyRecovery ? "push" : "workflow_dispatch") ||
    run?.head_branch !== "staging" ||
    run?.head_sha !== expectedGitStagingSha ||
    run?.status !== "completed" ||
    run?.conclusion !== "failure" ||
    !Number.isSafeInteger(run?.run_attempt) ||
    run.run_attempt < 1 ||
    !isFreshTimestamp(run?.updated_at, nowMs, ROLLBACK_RECOVERY_MAX_AGE_MS)
  ) {
    throw new Error(
      "GitHub deploy run does not prove the exact failed staging release.",
    );
  }

  const jobsPayload = await readApi(
    `/actions/runs/${deployRunId}/jobs?per_page=100`,
    env,
  );
  const deployJobs = Array.isArray(jobsPayload?.jobs)
    ? jobsPayload.jobs.filter((job) => job?.name === "deploy")
    : [];
  const deployJob = deployJobs[0];
  const requiredSteps = [
    ["Activate staging release", "success"],
    ["Run staging deploy health gate", "failure"],
    ["Collect staging deploy diagnostics", "success"],
    ["Upload staging deploy diagnostics", "success"],
  ];
  if (
    deployJobs.length !== 1 ||
    deployJob?.status !== "completed" ||
    deployJob?.conclusion !== "failure" ||
    !Array.isArray(deployJob.steps) ||
    requiredSteps.some(
      ([name, conclusion]) =>
        deployJob.steps.filter(
          (step) =>
            step?.name === name &&
            step?.status === "completed" &&
            step?.conclusion === conclusion,
        ).length !== 1,
    )
  ) {
    throw new Error(
      "GitHub deploy job does not prove activation, failure and diagnostics upload.",
    );
  }

  const artifactsPayload = await readApi(
    `/actions/runs/${deployRunId}/artifacts?per_page=100`,
    env,
  );
  const artifactName = `fieldgrid-staging-deploy-diagnostics-${deployRunId}`;
  const artifacts = Array.isArray(artifactsPayload?.artifacts)
    ? artifactsPayload.artifacts.filter(
        (artifact) => artifact?.name === artifactName,
      )
    : [];
  const artifact = artifacts[0];
  if (
    artifacts.length !== 1 ||
    !Number.isSafeInteger(artifact?.id) ||
    artifact.id < 1 ||
    (String(deployRunId) === KNOWN_LEGACY_ROLLBACK_RECOVERY.runId &&
      artifact.id !== KNOWN_LEGACY_ROLLBACK_RECOVERY.artifactId) ||
    artifact.expired !== false ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes < 1 ||
    artifact.size_in_bytes > 5 * 1024 * 1024 ||
    String(artifact.workflow_run?.id) !== String(deployRunId) ||
    artifact.workflow_run?.head_branch !== "staging" ||
    artifact.workflow_run?.head_sha !== expectedGitStagingSha ||
    !isFreshTimestamp(artifact.updated_at, nowMs, ROLLBACK_RECOVERY_MAX_AGE_MS)
  ) {
    throw new Error(
      "GitHub deploy diagnostics artifact is missing, expired or stale.",
    );
  }

  const diagnosticsBytes = Buffer.from(
    await readDiagnostics(artifact, tempDir, env),
  );
  const diagnosticsSha256 = createHash("sha256")
    .update(diagnosticsBytes)
    .digest("hex");
  let diagnostics;
  try {
    diagnostics = JSON.parse(diagnosticsBytes.toString("utf8"));
  } catch {
    throw new Error("Rollback deploy diagnostics is not valid JSON.");
  }
  const validated = validateRollbackDeployDiagnostics(diagnostics, {
    expectedGitStagingSha,
    expectedActiveStagingReleaseSha,
    baseDir,
    deployRunId,
    diagnosticsSha256,
  });

  return {
    version: ROLLBACK_RECOVERY_PROOF_VERSION,
    mode: "verified-deploy-rollback",
    expectedGitStagingSha,
    expectedActiveStagingReleaseSha,
    deployRun: {
      id: String(deployRunId),
      headSha: run.head_sha,
      branch: run.head_branch,
      attempt: run.run_attempt,
      status: run.status,
      conclusion: run.conclusion,
      updatedAt: run.updated_at,
      apiVerified: true,
    },
    diagnostics: {
      artifactId: artifact.id,
      artifactName,
      updatedAt: artifact.updated_at,
      sha256: diagnosticsSha256,
      schemaVersion: validated.schemaVersion,
      exactSchemaVerified: true,
      checkCount: validated.checkCount,
      failedCheckCount: validated.failedCheckCount,
    },
  };
}

async function verifyRoutes(env = process.env) {
  const routes = [
    ["backoffice-login", env.BACKOFFICE_PUBLIC_LOGIN_URL, "login"],
    ["personnel-health", env.PERSONEEL_PUBLIC_HEALTH_URL, "exact-200"],
    ["customer-health", env.KLANT_PUBLIC_HEALTH_URL, "exact-200"],
    ["api-health", env.API_PUBLIC_HEALTH_URL, "exact-200"],
    ["api-root", env.API_PUBLIC_ROOT_URL, "api-root"],
    ["pilot-tenant-login", env.PILOT_TENANT_LOGIN_URL, "login"],
  ];
  const results = [];
  for (const [name, url, mode] of routes) {
    const safeUrl = sanitizePublicUrl(url);
    const response = await fetch(safeUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const status = response.status;
    if (!isAllowedRouteStatus(mode, status))
      throw new Error(`${name} routing failed with HTTP ${status}.`);
    results.push({ name, url: safeUrl, mode, status });
  }
  return results;
}

async function verifyRollbackTarget(options, tempDir, env = process.env) {
  const expectedStaging = options.expectedStaging;
  const expectedActiveStagingRelease = options.expectedActiveStagingRelease;
  const baseDir = env.STAGING_BASE_DIR || "/var/www/veele/staging";
  const currentLink = join(baseDir, "current");
  const releasesRoot = await realpath(join(baseDir, "releases"));
  const currentRelease = await realpath(currentLink);
  const rel = relative(releasesRoot, currentRelease);
  if (
    !rel ||
    rel.startsWith("..") ||
    resolve(releasesRoot, rel) !== currentRelease
  ) {
    throw new Error(
      "Current staging release is outside the staging releases directory.",
    );
  }
  if (
    !basename(currentRelease).endsWith(expectedActiveStagingRelease.slice(0, 7))
  ) {
    throw new Error(
      "Current staging release directory does not match the expected active release SHA.",
    );
  }

  const marker = join(currentRelease, ".fieldgrid-release-sha");
  let markerValue = "";
  try {
    markerValue = (await readFile(marker, "utf8")).trim();
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await runCommand("bash", [
      join(repoRoot, "scripts", "fieldgrid-backfill-release-sha-marker.sh"),
      "--environment",
      "staging",
      "--base-dir",
      baseDir,
      "--release-path",
      currentRelease,
      "--expected-sha",
      expectedActiveStagingRelease,
    ]);
    markerValue = (await readFile(marker, "utf8")).trim();
  }
  if (markerValue !== expectedActiveStagingRelease) {
    throw new Error("Active staging release SHA marker does not match.");
  }

  const services = [
    env.BACKOFFICE_SERVICE_NAME,
    env.PERSONEEL_SERVICE_NAME,
    env.KLANT_SERVICE_NAME,
    env.API_SERVICE_NAME,
  ];
  for (const service of services) {
    const statusResult = await runCommand("systemctl", ["is-active", service], {
      allowFailure: true,
    });
    if (statusResult.code !== 0 || statusResult.stdout.trim() !== "active") {
      throw new Error(`Rollback service ${service} is not active.`);
    }
  }

  let recoveryProof = null;
  let recoveryMode = "aligned";
  if (expectedActiveStagingRelease !== expectedStaging) {
    recoveryProof = await verifyRollbackDeployRecovery(
      {
        deployRunId: options.rollbackDeployRunId,
        expectedGitStagingSha: expectedStaging,
        expectedActiveStagingReleaseSha: expectedActiveStagingRelease,
        baseDir,
        tempDir,
      },
      env,
    );
    if (recoveryProof.diagnostics.exactSchemaVerified !== true) {
      throw new Error("Rollback recovery diagnostics was not schema verified.");
    }
    recoveryMode = "verified-deploy-rollback";
  }

  return {
    baseDir,
    currentRelease,
    marker: expectedActiveStagingRelease,
    servicesActive: services,
    expectedGitStagingSha: expectedStaging,
    expectedActiveStagingReleaseSha: expectedActiveStagingRelease,
    gitAndActiveAligned: expectedActiveStagingRelease === expectedStaging,
    recoveryMode,
    recoveryProof,
  };
}

function postgresCommandEnv(pgEnv) {
  return { ...process.env, ...pgEnv };
}

async function psql(pgEnv, sql) {
  const result = await runCommand(
    "psql",
    [
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      sql,
    ],
    { env: postgresCommandEnv(pgEnv) },
  );
  return result.stdout.trim();
}

export function parsePaymentIntentDiagnostic(raw) {
  const diagnostic = JSON.parse(raw);
  if (
    diagnostic?.version !== PAYMENT_INTENT_DIAGNOSTIC_VERSION ||
    !Array.isArray(diagnostic.recordedPhase2c1Migrations) ||
    !Array.isArray(diagnostic.duplicateSources)
  ) {
    throw new Error("Payment-intent diagnostic has an invalid shape.");
  }
  return diagnostic;
}

export function parseRealtimePublicationMetadata(raw) {
  const metadata = JSON.parse(raw);
  if (
    metadata?.version !== REALTIME_PUBLICATION_METADATA_VERSION ||
    metadata?.publication !== REALTIME_PUBLICATION.publication ||
    metadata?.schema !== REALTIME_PUBLICATION.schema ||
    metadata?.table !== REALTIME_PUBLICATION.table ||
    typeof metadata?.member !== "boolean"
  ) {
    throw new Error("Realtime publication metadata has an invalid shape.");
  }
  return metadata;
}

function parseJsonObject(raw, label) {
  let value;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} has an invalid shape.`);
  }
  return value;
}

function assertSafeCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

export function parseTenantUserRoleConstraintReadiness(raw) {
  const readiness = parseJsonObject(
    raw,
    "Tenant-user-role constraint readiness",
  );
  if (readiness.version !== TENANT_USER_ROLE_CONSTRAINT_READINESS_VERSION) {
    throw new Error(
      "Tenant-user-role constraint readiness has an invalid version.",
    );
  }
  return {
    version: readiness.version,
    roleScopeMismatches: assertSafeCount(
      readiness.roleScopeMismatches,
      "roleScopeMismatches",
    ),
    membershipMismatches: assertSafeCount(
      readiness.membershipMismatches,
      "membershipMismatches",
    ),
  };
}

export function assertTenantUserRoleConstraintReadiness(raw) {
  const readiness = parseTenantUserRoleConstraintReadiness(raw);
  if (
    readiness.roleScopeMismatches !== 0 ||
    readiness.membershipMismatches !== 0
  ) {
    throw new Error(
      `Tenant-user-role constraint readiness failed: roleScopeMismatches=${readiness.roleScopeMismatches}, membershipMismatches=${readiness.membershipMismatches}.`,
    );
  }
  return readiness;
}

export function parseTenantUserRoleConstraintProof(raw) {
  const proof = parseJsonObject(raw, "Tenant-user-role constraint proof");
  if (
    proof.version !== TENANT_USER_ROLE_CONSTRAINT_PROOF_VERSION ||
    !Array.isArray(proof.constraints)
  ) {
    throw new Error("Tenant-user-role constraint proof has an invalid shape.");
  }
  return proof;
}

export function assertTenantUserRoleConstraintProof(raw) {
  const proof = parseTenantUserRoleConstraintProof(raw);
  if (proof.constraints.length !== TENANT_USER_ROLE_CONSTRAINTS.length) {
    throw new Error(
      "Tenant-user-role constraint proof must contain both constraints exactly once.",
    );
  }

  const actualByName = new Map();
  for (const constraint of proof.constraints) {
    if (
      !constraint ||
      typeof constraint !== "object" ||
      typeof constraint.name !== "string" ||
      actualByName.has(constraint.name)
    ) {
      throw new Error(
        "Tenant-user-role constraint proof contains a malformed or duplicate constraint.",
      );
    }
    actualByName.set(constraint.name, constraint);
  }

  for (const expected of TENANT_USER_ROLE_CONSTRAINTS) {
    const actual = actualByName.get(expected.name);
    if (
      !actual ||
      actual.type !== "f" ||
      actual.validated !== true ||
      actual.tableSchema !== expected.tableSchema ||
      actual.table !== expected.table ||
      actual.referencedSchema !== expected.referencedSchema ||
      actual.referencedTable !== expected.referencedTable ||
      !Array.isArray(actual.columns) ||
      !Array.isArray(actual.referencedColumns) ||
      actual.columns.length !== expected.columns.length ||
      actual.referencedColumns.length !== expected.referencedColumns.length ||
      actual.columns.some(
        (column, index) => column !== expected.columns[index],
      ) ||
      actual.referencedColumns.some(
        (column, index) => column !== expected.referencedColumns[index],
      )
    ) {
      throw new Error(
        `Tenant-user-role constraint ${expected.name} is missing, invalid, or not validated.`,
      );
    }
  }

  return proof;
}

async function writePaymentIntentDiagnostic(pgEnv, outDir) {
  const diagnostic = parsePaymentIntentDiagnostic(
    await psql(pgEnv, PAYMENT_INTENT_DIAGNOSTIC_QUERY),
  );
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, "payment-intent-duplicate-diagnostic.json");
  await writeFile(path, `${JSON.stringify(diagnostic, null, 2)}\n`, {
    mode: 0o640,
  });
  return { diagnostic, path };
}

export async function ensurePostgresRuntime(env = process.env) {
  if (!env.FIELDGRID_POSTGRESQL_BINDIR?.trim()) {
    throw new Error("FIELDGRID_POSTGRESQL_BINDIR is required.");
  }
  const commands = [
    "createdb",
    "initdb",
    "pg_ctl",
    "pg_dump",
    "pg_restore",
    "postgres",
    "psql",
  ];
  const versions = {};
  for (const command of commands) {
    const result = await runCommand(command, ["--version"]);
    const version = result.stdout.trim();
    if (!/PostgreSQL\) 17\./u.test(version)) {
      throw new Error(`${command} must use pinned PostgreSQL 17 binaries.`);
    }
    versions[command] = version;
  }
  return versions;
}

async function listBackupSchemas(pgEnv) {
  const requested = BACKUP_SCHEMAS.map((name) => `'${name}'`).join(",");
  const result = await psql(
    pgEnv,
    `select nspname from pg_namespace where nspname in (${requested}) order by nspname;`,
  );
  const schemas = result.split(/\r?\n/u).filter(Boolean);
  for (const required of ["public", "auth", "storage", "drizzle"]) {
    if (!schemas.includes(required))
      throw new Error(`Required staging schema ${required} is missing.`);
  }
  return schemas;
}

async function collectCriticalCounts(pgEnv) {
  const counts = {};
  for (const relation of CRITICAL_RELATIONS) {
    const exists = await psql(
      pgEnv,
      `select to_regclass('${relation}') is not null;`,
    );
    if (exists !== "t")
      throw new Error(`Required staging relation ${relation} is missing.`);
    const count = Number(
      await psql(pgEnv, `select count(*) from ${relation};`),
    );
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error(`Invalid count for ${relation}.`);
    counts[relation] = count;
  }
  return counts;
}

async function collectTenantUserRoleConstraintReadiness(pgEnv) {
  return assertTenantUserRoleConstraintReadiness(
    await psql(pgEnv, TENANT_USER_ROLE_CONSTRAINT_READINESS_QUERY),
  );
}

async function collectLiveRealtimeEvents(pgEnv) {
  const raw = await psql(
    pgEnv,
    `select coalesce(jsonb_agg(jsonb_build_object('id', id::text, 'expiresAt', expires_at) order by id), '[]'::jsonb)::text from public.portal_realtime_events where expires_at > clock_timestamp();`,
  );
  const events = JSON.parse(raw);
  if (
    !Array.isArray(events) ||
    events.some(
      (event) =>
        typeof event?.id !== "string" ||
        typeof event?.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(event.expiresAt)),
    )
  ) {
    throw new Error("Invalid realtime retention snapshot.");
  }
  return events;
}

async function collectRealtimePublicationMetadata(pgEnv) {
  const metadata = parseRealtimePublicationMetadata(
    await psql(
      pgEnv,
      `select jsonb_build_object(
        'version', '${REALTIME_PUBLICATION_METADATA_VERSION}',
        'publication', '${REALTIME_PUBLICATION.publication}',
        'schema', '${REALTIME_PUBLICATION.schema}',
        'table', '${REALTIME_PUBLICATION.table}',
        'member', exists (
          select 1
          from pg_publication_tables
          where pubname = '${REALTIME_PUBLICATION.publication}'
            and schemaname = '${REALTIME_PUBLICATION.schema}'
            and tablename = '${REALTIME_PUBLICATION.table}'
        )
      )::text;`,
    ),
  );
  if (!metadata.member) {
    throw new Error(
      "The staging realtime projection table is not in supabase_realtime.",
    );
  }
  return metadata;
}

async function collectRealtimeEventIds(pgEnv) {
  const raw = await psql(
    pgEnv,
    "select coalesce(jsonb_agg(id::text order by id), '[]'::jsonb)::text from public.portal_realtime_events;",
  );
  const ids = JSON.parse(raw);
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new Error("Invalid migrated realtime event snapshot.");
  }
  return ids;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function createBackup(
  sourcePgEnv,
  expectedStaging,
  schemas,
  realtimePublicationMetadata,
  env = process.env,
) {
  const backupDir =
    env.STAGING_BACKUP_DIR || "/var/www/veele/staging/shared/phase2e-backups";
  await mkdir(backupDir, { recursive: true, mode: 0o750 });
  await chmod(backupDir, 0o750);
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const backupName = `phase2e-staging-${expectedStaging.slice(0, 12)}-${stamp}.dump`;
  const backupPath = join(backupDir, backupName);
  const schemaArgs = schemas.flatMap((schema) => ["--schema", schema]);

  await runCommand(
    "pg_dump",
    [
      "--format=custom",
      "--compress=6",
      "--large-objects",
      "--no-owner",
      "--serializable-deferrable",
      "--strict-names",
      "--lock-wait-timeout=30s",
      ...schemaArgs,
      "--file",
      backupPath,
    ],
    { env: postgresCommandEnv(sourcePgEnv) },
  );
  await chmod(backupPath, 0o600);
  const info = await stat(backupPath);
  if (!info.isFile() || info.size === 0)
    throw new Error("Staging backup is empty.");
  const listing = await runCommand("pg_restore", ["--list", backupPath]);
  if (!listing.stdout.includes("TABLE DATA"))
    throw new Error("Staging backup contains no table data entries.");
  const publicationMetadataPath = `${backupPath}.publication.json`;
  await writeFile(
    publicationMetadataPath,
    `${JSON.stringify(realtimePublicationMetadata, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(publicationMetadataPath, 0o600);
  return {
    backupDir,
    backupName,
    backupPath,
    sizeBytes: info.size,
    sha256: await sha256File(backupPath),
    schemas,
    publicationMetadata: {
      path: publicationMetadataPath,
      sha256: await sha256File(publicationMetadataPath),
    },
  };
}

async function reserveEphemeralPort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPromise(new Error("Could not reserve a local PostgreSQL port."));
        return;
      }
      server.close((error) => {
        if (error) rejectPromise(error);
        else resolvePromise(address.port);
      });
    });
  });
}

async function waitForRestoreDatabase(pgEnv) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = await runCommand(
      "psql",
      ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--command", "select 1;"],
      { allowFailure: true, env: postgresCommandEnv(pgEnv) },
    );
    if (ready.code === 0) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  throw new Error(
    "Disposable PostgreSQL 17 restore target did not become ready.",
  );
}

function restoreRoleSql() {
  const statements = RESTORE_ROLES.map(
    ([name, attributes]) =>
      `if not exists (select 1 from pg_roles where rolname = '${name}') then create role ${name} ${attributes}; end if;`,
  ).join(" ");
  return `do $$ begin ${statements} end $$; create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists \"uuid-ossp\" with schema extensions; create publication supabase_realtime;`;
}

function localSupabaseCompatibilitySql() {
  const statements = RESTORE_ROLES.map(
    ([name, attributes]) =>
      `if not exists (select 1 from pg_roles where rolname = '${name}') then create role ${name} ${attributes}; end if;`,
  ).join(" ");
  return `
    do $$ begin ${statements} end $$;
    create schema if not exists public;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create schema if not exists auth;
    create schema if not exists storage;
    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      encrypted_password text,
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb not null default '{}'::jsonb,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(
        coalesce(
          nullif(current_setting('request.jwt.claim.sub', true), ''),
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
        ),
        ''
      )::uuid
    $$;
    create or replace function auth.jwt()
    returns jsonb
    language sql
    stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb,
        '{}'::jsonb
      )
    $$;
    create or replace function storage.foldername(name text)
    returns text[]
    language sql
    immutable
    as $$
      select string_to_array(coalesce(name, ''), '/')
    $$;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      owner uuid,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id) on delete cascade,
      name text not null,
      owner uuid,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_accessed_at timestamptz,
      version text
    );
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage to anon, authenticated, service_role;
    grant select, insert, update, delete on auth.users to service_role;
    grant select, insert, update, delete on storage.buckets, storage.objects
      to authenticated, service_role;
    do $$
    begin
      if not exists (
        select 1 from pg_publication where pubname = 'supabase_realtime'
      ) then
        create publication supabase_realtime;
      end if;
    end
    $$;
  `;
}

export async function startRestoreTarget(tempDir) {
  const database = "fieldgrid_phase2e_staging_copy";
  const password = randomBytes(32).toString("hex");
  const passwordFile = join(tempDir, "restore-superuser-password");
  const dataDir = join(tempDir, "restore-data");
  const socketDir = join(tempDir, "restore-socket");
  const logPath = join(tempDir, "restore-postgresql.log");
  const port = await reserveEphemeralPort();
  await mkdir(socketDir, { mode: 0o700 });
  await writeFile(passwordFile, `${password}\n`, { mode: 0o600 });
  const initdbArgs = [
    "--pgdata",
    dataDir,
    "--username",
    "postgres",
    "--auth-local",
    "trust",
    "--auth-host",
    "scram-sha-256",
    "--encoding",
    "UTF8",
    "--no-locale",
    "--pwfile",
    passwordFile,
  ];
  if (process.env.FIELDGRID_POSTGRESQL_SHAREDIR) {
    initdbArgs.push("-L", process.env.FIELDGRID_POSTGRESQL_SHAREDIR);
  }
  await runCommand("initdb", initdbArgs);
  await rm(passwordFile, { force: true });
  await runCommand("pg_ctl", [
    "--pgdata",
    dataDir,
    "--log",
    logPath,
    "--wait",
    "start",
    "--options",
    `-h 127.0.0.1 -p ${port} -k ${socketDir} -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
  ]);
  const maintenanceEnv = {
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGUSER: "postgres",
    PGPASSWORD: password,
    PGDATABASE: "postgres",
    PGSSLMODE: "disable",
  };
  await waitForRestoreDatabase(maintenanceEnv);
  await runCommand("createdb", ["--maintenance-db", "postgres", database], {
    env: postgresCommandEnv(maintenanceEnv),
  });
  const pgEnv = { ...maintenanceEnv, PGDATABASE: database };
  await psql(pgEnv, "drop schema public;");
  await psql(pgEnv, restoreRoleSql());
  return { dataDir, database, logPath, pgEnv, port };
}

async function createApplicationEmptyTarget(cluster) {
  const database = "fieldgrid_phase2e_application_empty";
  await runCommand("createdb", ["--maintenance-db", "postgres", database], {
    env: postgresCommandEnv({ ...cluster.pgEnv, PGDATABASE: "postgres" }),
  });
  const pgEnv = { ...cluster.pgEnv, PGDATABASE: database };
  await psql(pgEnv, "drop schema public cascade;");
  await psql(pgEnv, localSupabaseCompatibilitySql());
  return { database, pgEnv, port: cluster.port };
}

async function installLocalStagingCompatibility(target) {
  await psql(target.pgEnv, localSupabaseCompatibilitySql());
  return target;
}

async function restoreBackup(target, backup) {
  await runCommand(
    "pg_restore",
    [
      "--exit-on-error",
      "--no-owner",
      "--dbname",
      target.database,
      backup.backupPath,
    ],
    { env: postgresCommandEnv(target.pgEnv) },
  );
  const publicationMetadataRaw = await readFile(
    backup.publicationMetadata.path,
    "utf8",
  );
  const publicationMetadataHash = createHash("sha256")
    .update(publicationMetadataRaw)
    .digest("hex");
  if (publicationMetadataHash !== backup.publicationMetadata.sha256) {
    throw new Error("Realtime publication metadata hash does not match.");
  }
  const publicationMetadata = parseRealtimePublicationMetadata(
    publicationMetadataRaw,
  );
  if (!publicationMetadata.member) {
    throw new Error(
      "Realtime publication backup metadata does not record membership.",
    );
  }
  const restoredMembership = await psql(
    target.pgEnv,
    `select count(*) from pg_publication_tables where pubname='${REALTIME_PUBLICATION.publication}' and schemaname='${REALTIME_PUBLICATION.schema}' and tablename='${REALTIME_PUBLICATION.table}';`,
  );
  if (restoredMembership === "0") {
    await psql(
      target.pgEnv,
      `alter publication ${REALTIME_PUBLICATION.publication} add table ${REALTIME_PUBLICATION.schema}.${REALTIME_PUBLICATION.table};`,
    );
  } else if (restoredMembership !== "1") {
    throw new Error("Unexpected realtime publication membership count.");
  }
  const verifiedMembership = await psql(
    target.pgEnv,
    `select count(*) from pg_publication_tables where pubname='${REALTIME_PUBLICATION.publication}' and schemaname='${REALTIME_PUBLICATION.schema}' and tablename='${REALTIME_PUBLICATION.table}';`,
  );
  if (verifiedMembership !== "1") {
    throw new Error(
      "Realtime publication metadata was not restored on the isolated copy.",
    );
  }
  return { publicationMetadataRestored: true };
}

export async function stopRestoreTarget(target) {
  if (!target?.dataDir) return;
  await runCommand(
    "pg_ctl",
    ["--pgdata", target.dataDir, "--mode", "fast", "--wait", "stop"],
    { allowFailure: true },
  );
}

export function assertPathWithinDirectory(directory, candidatePath) {
  const root = resolve(directory);
  const candidate = resolve(candidatePath);
  const candidateRelativePath = relative(root, candidate);
  if (
    !candidateRelativePath ||
    candidateRelativePath === ".." ||
    candidateRelativePath.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    ) ||
    resolve(root, candidateRelativePath) !== candidate
  ) {
    throw new Error("Evidence path escapes the selected output directory.");
  }
  return candidateRelativePath.replace(/\\/gu, "/");
}

function isValidTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function assertMigrationRehearsalReport(report, options = {}) {
  const expectedTargets = ["empty-database", "staging-copy"];
  if (
    !report ||
    typeof report !== "object" ||
    report.version !== "sprint-7-migration-smoke-v1" ||
    !Array.isArray(report.results) ||
    report.results.length !== expectedTargets.length ||
    report.results
      .map((result) => result?.target)
      .sort()
      .join("\0") !== expectedTargets.slice().sort().join("\0")
  ) {
    throw new Error(
      "Migration rehearsal must contain exactly one empty-database and one staging-copy result.",
    );
  }

  for (const result of report.results) {
    const unresolvedRows = Array.isArray(result?.unresolvedRows)
      ? result.unresolvedRows
      : null;
    const resultArrays = [
      result?.appliedMigrations,
      result?.skippedMigrations,
      result?.compatibilitySkippedMigrations,
    ];
    if (
      result?.readiness !== "pass" ||
      result?.exitCode !== 0 ||
      result?.timedOut !== false ||
      result?.complete !== true ||
      result?.drizzleStarted !== true ||
      result?.failedStatement !== null ||
      !isValidTimestamp(result?.startedAt) ||
      !isValidTimestamp(result?.finishedAt) ||
      Date.parse(result.finishedAt) < Date.parse(result.startedAt) ||
      !isNonNegativeSafeInteger(result?.durationMs) ||
      resultArrays.some((value) => !Array.isArray(value)) ||
      !unresolvedRows ||
      unresolvedRows.some(
        (value) => !isNonNegativeSafeInteger(value) || value !== 0,
      )
    ) {
      throw new Error(
        `Migration rehearsal ${result?.target ?? "unknown"} result is incomplete or not green.`,
      );
    }
  }

  const summary = report.summary;
  if (
    summary?.status !== "pass" ||
    !Array.isArray(summary?.passedTargets) ||
    summary.passedTargets.slice().sort().join("\0") !==
      expectedTargets.slice().sort().join("\0") ||
    !Array.isArray(summary?.failedTargets) ||
    summary.failedTargets.length !== 0 ||
    summary?.unresolvedRows !== 0 ||
    !isNonNegativeSafeInteger(summary?.appliedMigrations) ||
    !isNonNegativeSafeInteger(summary?.skippedMigrations) ||
    !isNonNegativeSafeInteger(summary?.compatibilitySkippedMigrations)
  ) {
    throw new Error(
      "Migration rehearsal summary contains failed targets or unresolved rows.",
    );
  }

  const requireExactRefs = options.requireExactRefs === true;
  if (requireExactRefs) {
    if (
      !isFullSha(options.expectedMain) ||
      !isFullSha(options.expectedStaging) ||
      report.refs?.main !== options.expectedMain ||
      report.refs?.staging !== options.expectedStaging ||
      report.refs?.checkout !== options.expectedMain
    ) {
      throw new Error(
        "Migration rehearsal is not bound to the exact main and staging SHAs.",
      );
    }
  }

  return report;
}

function localDatabaseUrl(target) {
  return `postgresql://postgres:${encodeURIComponent(target.pgEnv.PGPASSWORD)}@127.0.0.1:${target.port}/${target.database}`;
}

function localMigrationSmokeEnvironment(
  emptyDatabaseUrl,
  stagingCopyDatabaseUrl,
) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (
      name === "DATABASE_URL" ||
      name === "DIRECT_URL" ||
      name === "SUPABASE_URL" ||
      name === "NEXT_PUBLIC_SUPABASE_URL" ||
      name === "POSTGRES_URL" ||
      name === "POSTGRES_PRISMA_URL" ||
      name === "POSTGRES_URL_NON_POOLING" ||
      name.endsWith("_DATABASE_URL") ||
      /^PG(?:HOST|HOSTADDR|PORT|DATABASE|USER|PASSWORD|PASSFILE|SERVICE|SERVICEFILE|SSLMODE|SSLROOTCERT|OPTIONS|CONNECT_TIMEOUT)$/u.test(
        name,
      ) ||
      /^DB_SSL(?:_REJECT_UNAUTHORIZED)?$/u.test(name)
    ) {
      delete env[name];
    }
  }
  return {
    ...env,
    APP_ENV: "local",
    TARGET_ENVIRONMENT: "local",
    EXPECTED_SUPABASE_PROJECT_REF: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    DATABASE_URL: emptyDatabaseUrl,
    FIELDGRID_MIGRATION_DATABASE_URL: "",
    DB_SSL: "false",
    PGSSLMODE: "disable",
    FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL: emptyDatabaseUrl,
    FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL: stagingCopyDatabaseUrl,
    FIELDGRID_MIGRATION_SMOKE_EMPTY_CONFIRM: "empty-database",
    FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_CONFIRM: "staging-copy",
  };
}

async function runMigrationRehearsal(
  { applicationEmptyTarget, stagingCopyTarget },
  outDir,
  options = {},
) {
  const emptyDatabaseUrl = localDatabaseUrl(applicationEmptyTarget);
  const stagingCopyDatabaseUrl = localDatabaseUrl(stagingCopyTarget);
  const smokeOut = join(dirname(outDir), "migration-smoke");
  assertPathWithinDirectory(repoRoot, smokeOut);
  await rm(smokeOut, { recursive: true, force: true });
  const args = [
    "fieldgrid:sprint7-migration-smoke",
    "--run",
    "--target",
    "all",
    "--out",
    smokeOut,
  ];
  if (options.requireExactRefs) {
    args.push(
      "--expected-main",
      options.expectedMain,
      "--expected-staging",
      options.expectedStaging,
    );
  }
  const result = await runCommand("pnpm", args, {
    env: localMigrationSmokeEnvironment(
      emptyDatabaseUrl,
      stagingCopyDatabaseUrl,
    ),
  });
  const reportMatch = result.stdout.match(/Report written:\s*(.+\.json)\s*$/mu);
  if (!reportMatch)
    throw new Error("Migration rehearsal did not report an evidence path.");
  const reportedPath = resolve(reportMatch[1].trim());
  const relativeReportPath = assertPathWithinDirectory(repoRoot, reportedPath);
  const reportFileInfo = await lstat(reportedPath);
  if (reportFileInfo.isSymbolicLink() || !reportFileInfo.isFile()) {
    throw new Error("Migration rehearsal evidence must be a regular file.");
  }
  const canonicalPath = await realpath(reportedPath);
  assertPathWithinDirectory(repoRoot, canonicalPath);
  const reportBytes = await readFile(canonicalPath);
  let parsed;
  try {
    parsed = JSON.parse(reportBytes.toString("utf8"));
  } catch {
    throw new Error("Migration rehearsal evidence is not valid JSON.");
  }
  const report = assertMigrationRehearsalReport(parsed, options);
  return {
    status: "pass",
    summary: report.summary,
    artifact: {
      path: relativeReportPath,
      sizeBytes: reportBytes.byteLength,
      sha256: createHash("sha256").update(reportBytes).digest("hex"),
      version: report.version,
      targets: ["empty-database", "staging-copy"],
    },
  };
}

export async function runSelfContainedLocalMigrationSmoke(options = {}) {
  const outDir = resolve(
    options.outDir ?? join(repoRoot, "artifacts", "migration-smoke"),
  );
  assertPathWithinDirectory(repoRoot, outDir);
  const tempDir = await mkdtemp(
    join(tmpdir(), "fieldgrid-local-migration-smoke-"),
  );
  await chmod(tempDir, 0o700);
  let stagingCopyTarget = null;
  try {
    const postgresRuntime = await ensurePostgresRuntime(
      options.env ?? process.env,
    );
    stagingCopyTarget = await startRestoreTarget(tempDir);
    await installLocalStagingCompatibility(stagingCopyTarget);
    const applicationEmptyTarget =
      await createApplicationEmptyTarget(stagingCopyTarget);
    const migration = await runMigrationRehearsal(
      { applicationEmptyTarget, stagingCopyTarget },
      outDir,
      { requireExactRefs: false },
    );
    return {
      ...migration,
      postgresRuntime,
      classification: {
        applicationEmpty: "local-supabase-compatibility-shims",
        stagingCopy: "local-staging-compatibility-fixture",
        liveStagingAccessed: false,
      },
    };
  } finally {
    await stopRestoreTarget(stagingCopyTarget);
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function committedMigrationManifest(
  migrationsDir = join(repoRoot, "lib", "db", "migrations"),
) {
  const report = await buildMigrationOrderReport({ migrationsDir });
  const validation = validateMigrationOrderReport(report);
  if (validation.errors.length > 0) {
    throw new Error(
      `Committed SQL migration manifest is invalid: ${validation.errors.join(" ")}`,
    );
  }
  return report.runnerOrder;
}

function partitionCommittedMigrationHistory(committed) {
  const legacy = [];
  const ordered = [];
  for (const name of committed) {
    const classification = classifyMigrationFilename(name);
    if (
      classification.kind === "numeric" ||
      allowedLegacyTimestampMigrations.includes(name)
    ) {
      legacy.push(name);
    } else {
      ordered.push(name);
    }
  }
  return { legacy, ordered };
}

function duplicateMigrationNames(names) {
  const seen = new Set();
  const duplicates = new Set();
  for (const name of names) {
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }
  return [...duplicates];
}

export function assertRecordedHistoricalMigrationHashes(records) {
  if (
    !Array.isArray(records) ||
    records.some(
      (record) =>
        typeof record?.name !== "string" ||
        !/^[0-9a-f]{64}$/u.test(record?.hash ?? "") ||
        typeof record?.appliedAt !== "string" ||
        !Number.isFinite(Date.parse(record.appliedAt)) ||
        typeof record?.baselined !== "boolean",
    )
  ) {
    throw new Error("Restored SQL migration history is invalid.");
  }

  const verified = [];
  for (const record of records) {
    const policy = allowedHistoricalRecordedMigrations[record.name];
    if (!policy) continue;
    if (record.hash !== policy.sqlSha256) {
      throw new Error(
        `Historical SQL migration ${record.name} is recorded with an unexpected hash.`,
      );
    }
    if (policy.kind === "renamed" && record.baselined) {
      throw new Error(
        `Historical SQL migration ${record.name} was baselined without execution and cannot prove canonical migration order.`,
      );
    }
    verified.push({
      name: record.name,
      kind: policy.kind,
      canonicalName: policy.canonicalName ?? null,
      hashVerified: true,
      appliedAt: record.appliedAt,
      baselined: record.baselined,
      introducedCommit: policy.introducedCommit,
      retiredCommit: policy.retiredCommit,
    });
  }
  return verified;
}

export function normalizeRecordedMigrationHistory(records) {
  const historicalMigrationRecords =
    assertRecordedHistoricalMigrationHashes(records);
  const semanticNames = [];
  const activeNames = [];
  const canonicalEquivalents = new Set();
  const renamedCanonicalNames = new Set(
    Object.values(allowedHistoricalRecordedMigrations)
      .map((policy) => policy.canonicalName)
      .filter(Boolean),
  );

  for (const record of records) {
    const historicalPolicy = allowedHistoricalRecordedMigrations[record.name];
    if (historicalPolicy) {
      if (historicalPolicy.kind === "tombstone") continue;
      if (!canonicalEquivalents.has(historicalPolicy.canonicalName)) {
        // The exact frozen hash proves that this canonical SQL already ran at
        // the alias position. A later canonical row is required for the active
        // manifest, but is a duplicate for application-order validation only.
        semanticNames.push(historicalPolicy.canonicalName);
        canonicalEquivalents.add(historicalPolicy.canonicalName);
      }
      continue;
    }

    activeNames.push(record.name);
    if (renamedCanonicalNames.has(record.name)) {
      if (canonicalEquivalents.has(record.name)) continue;
      canonicalEquivalents.add(record.name);
    }
    semanticNames.push(record.name);
  }

  return {
    activeNames,
    semanticNames,
    historicalMigrationRecords,
  };
}

function assertOrderedMigrationPrefix(recorded, committed, label) {
  const { legacy, ordered } = partitionCommittedMigrationHistory(committed);
  const legacyNames = new Set(legacy);
  const recordedOrdered = recorded.filter((name) => !legacyNames.has(name));
  const isPrefix =
    recordedOrdered.length <= ordered.length &&
    recordedOrdered.every((name, index) => name === ordered[index]);
  if (isPrefix) return;

  const mismatchIndex = recordedOrdered.findIndex(
    (name, index) => name !== ordered[index],
  );
  const position =
    mismatchIndex === -1 ? ordered.length + 1 : mismatchIndex + 1;
  const expected = ordered[position - 1] ?? "<end-of-manifest>";
  const actual = recordedOrdered[position - 1] ?? "<missing>";
  throw new Error(
    `${label} has an invalid modern migration order at position ${position}: expected ${expected}, recorded ${actual}.`,
  );
}

export function assertMatchingMigrationHistory(recorded, committed) {
  const names = recorded.map((record) => record.name);
  const duplicates = duplicateMigrationNames(names);
  const { activeNames, semanticNames } =
    normalizeRecordedMigrationHistory(recorded);
  const recordedNames = new Set(activeNames);
  const committedNames = new Set(committed);
  const missing = committed.filter((name) => !recordedNames.has(name));
  const unexpected = activeNames.filter((name) => !committedNames.has(name));
  const details = [
    missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
    unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : "",
    duplicates.length > 0 ? `duplicate: ${duplicates.join(", ")}` : "",
  ].filter(Boolean);
  if (details.length > 0) {
    throw new Error(
      `Restored SQL migration history diverges from the committed manifest (${details.join("; ")}).`,
    );
  }
  assertOrderedMigrationPrefix(
    semanticNames,
    committed,
    "Restored SQL migration history",
  );
}

export function assertCommittedMigrationPrefix(recorded, committed) {
  const names = recorded.map((record) => record.name);
  const duplicates = duplicateMigrationNames(names);
  const { activeNames, semanticNames, historicalMigrationRecords } =
    normalizeRecordedMigrationHistory(recorded);
  const recordedNames = new Set(activeNames);
  const committedNames = new Set(committed);
  const unexpected = activeNames.filter((name) => !committedNames.has(name));
  if (unexpected.length > 0 || duplicates.length > 0) {
    throw new Error(
      `Restored pre-rehearsal SQL migration history contains invalid entries${unexpected.length > 0 ? ` (unexpected: ${unexpected.join(", ")})` : ""}${duplicates.length > 0 ? ` (duplicate: ${duplicates.join(", ")})` : ""}.`,
    );
  }

  const { legacy, ordered } = partitionCommittedMigrationHistory(committed);
  const missingLegacy = legacy.filter((name) => !recordedNames.has(name));
  if (missingLegacy.length > 0) {
    throw new Error(
      `Restored pre-rehearsal SQL migration history is missing required legacy migrations: ${missingLegacy.join(", ")}.`,
    );
  }
  assertOrderedMigrationPrefix(
    semanticNames,
    committed,
    "Restored pre-rehearsal SQL migration history",
  );
  const legacyNames = new Set(legacy);
  const recordedModern = activeNames.filter((name) => !legacyNames.has(name));

  return {
    recordedMigrationCount: recorded.length,
    recognizedHistoricalMigrationCount: historicalMigrationRecords.length,
    activeRecordedMigrationCount: activeNames.length,
    semanticRecordedMigrationCount: semanticNames.length,
    pendingMigrationCount: committed.length - activeNames.length,
    requiredLegacyMigrationCount: legacy.length,
    recordedModernMigrationCount: recordedModern.length,
    pendingModernMigrationCount: ordered.length - recordedModern.length,
    latestRecordedModernMigration: recordedModern.at(-1) ?? null,
  };
}

export function migrationHistoryEvidence(committed) {
  if (!Array.isArray(committed) || committed.length === 0) {
    throw new Error("Committed SQL migration manifest is empty.");
  }
  return {
    latestMigration: committed.at(-1),
    migrationCount: committed.length,
  };
}

async function readRecordedMigrationHistory(pgEnv) {
  const records = JSON.parse(
    await psql(
      pgEnv,
      "select coalesce(jsonb_agg(jsonb_build_object('name', name, 'hash', hash, 'appliedAt', applied_at, 'baselined', baselined) order by applied_at, name), '[]'::jsonb)::text from drizzle.veele_sql_migrations;",
    ),
  );
  assertRecordedHistoricalMigrationHashes(records);
  return records;
}

async function verifyMigratedRestore(pgEnv, committedMigrations) {
  const recordedMigrations = await readRecordedMigrationHistory(pgEnv);
  assertMatchingMigrationHistory(recordedMigrations, committedMigrations);
  const rlsNames = PHASE2_RLS_RELATIONS.map((name) => `'${name}'`).join(",");
  const rlsCount = Number(
    await psql(
      pgEnv,
      `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${rlsNames}) and c.relrowsecurity;`,
    ),
  );
  if (rlsCount !== PHASE2_RLS_RELATIONS.length)
    throw new Error(
      "Not every Phase 2 security relation has RLS enabled on the restored copy.",
    );
  const unsafeAclCount = Number(
    await psql(
      pgEnv,
      `select count(*) from (values ${PHASE2_RLS_RELATIONS.map((name) => `('public.${name}')`).join(",")}) as r(rel) where has_table_privilege('anon', rel, 'SELECT') or has_table_privilege('anon', rel, 'INSERT') or has_table_privilege('anon', rel, 'UPDATE') or has_table_privilege('anon', rel, 'DELETE');`,
    ),
  );
  if (unsafeAclCount !== 0)
    throw new Error(
      "Anonymous privileges exist on a protected Phase 2 relation.",
    );
  const realtime = await psql(
    pgEnv,
    "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='portal_realtime_events';",
  );
  if (realtime !== "1")
    throw new Error(
      "The restored realtime projection table is not in supabase_realtime.",
    );
  const tenantUserRoleConstraints = assertTenantUserRoleConstraintProof(
    await psql(pgEnv, TENANT_USER_ROLE_CONSTRAINT_PROOF_QUERY),
  );
  return {
    ...migrationHistoryEvidence(committedMigrations),
    rlsRelations: PHASE2_RLS_RELATIONS.length,
    unsafeAnonymousAclRelations: 0,
    realtimePublication: true,
    tenantUserRoleConstraints,
  };
}

async function writeEvidence(outDir, evidence) {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, "phase2e-staging-preflight.json");
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o640,
  });
  return path;
}

export async function runPreflight(options, env = process.env) {
  const errors = validateRuntimeConfig(options, env);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const startedAt = new Date().toISOString();
  const tempDir = await mkdtemp(join(tmpdir(), "fieldgrid-phase2e-"));
  await chmod(tempDir, 0o700);
  let restoreTarget = null;
  try {
    const refs = await verifyImmutableRefs(options, env);
    const routes = await verifyRoutes(env);
    const rollback = await verifyRollbackTarget(options, tempDir, env);
    const postgresRuntime = await ensurePostgresRuntime(env);
    const sourcePgEnv = parsePostgresEnv(env.FIELDGRID_MIGRATION_DATABASE_URL);
    const versionNumber = Number(
      await psql(sourcePgEnv, "show server_version_num;"),
    );
    const sourcePostgresMajor = Math.floor(versionNumber / 10_000);
    if (
      !Number.isSafeInteger(versionNumber) ||
      sourcePostgresMajor < 15 ||
      sourcePostgresMajor > 17
    ) {
      throw new Error(
        "Staging source database must run a supported PostgreSQL major version (15 through 17).",
      );
    }
    const schemas = await listBackupSchemas(sourcePgEnv);
    const realtimePublicationMetadata =
      await collectRealtimePublicationMetadata(sourcePgEnv);
    const sourceCounts = await collectCriticalCounts(sourcePgEnv);
    const tenantUserRoleConstraintReadiness =
      await collectTenantUserRoleConstraintReadiness(sourcePgEnv);
    const backup = await createBackup(
      sourcePgEnv,
      options.expectedStaging,
      schemas,
      realtimePublicationMetadata,
      env,
    );
    restoreTarget = await startRestoreTarget(tempDir);
    const applicationEmptyTarget =
      await createApplicationEmptyTarget(restoreTarget);
    const restoreMetadata = await restoreBackup(restoreTarget, backup);
    const restoredCounts = await collectCriticalCounts(restoreTarget.pgEnv);
    assertMatchingCounts(sourceCounts, restoredCounts);
    const committedMigrations = await committedMigrationManifest();
    const restoredMigrationHistory = await readRecordedMigrationHistory(
      restoreTarget.pgEnv,
    );
    const verifiedHistoricalMigrations =
      assertRecordedHistoricalMigrationHashes(restoredMigrationHistory);
    const migrationPrefix = assertCommittedMigrationPrefix(
      restoredMigrationHistory,
      committedMigrations,
    );
    const liveRealtimeEventsBeforeMigration = await collectLiveRealtimeEvents(
      restoreTarget.pgEnv,
    );
    const paymentIntentDiagnostic = await writePaymentIntentDiagnostic(
      restoreTarget.pgEnv,
      options.outDir,
    );
    const migration = await runMigrationRehearsal(
      {
        applicationEmptyTarget,
        stagingCopyTarget: restoreTarget,
      },
      options.outDir,
      {
        requireExactRefs: true,
        expectedMain: options.expectedMain,
        expectedStaging: options.expectedStaging,
      },
    );
    const migratedCounts = await collectCriticalCounts(restoreTarget.pgEnv);
    const migratedRealtimeEventIds = await collectRealtimeEventIds(
      restoreTarget.pgEnv,
    );
    const rehearsalCompletedAt = await psql(
      restoreTarget.pgEnv,
      "select clock_timestamp();",
    );
    const migrationDataIntegrity = assertMigratedDataIntegrity(
      restoredCounts,
      migratedCounts,
      liveRealtimeEventsBeforeMigration,
      migratedRealtimeEventIds,
      rehearsalCompletedAt,
    );
    const databaseProof = await verifyMigratedRestore(
      restoreTarget.pgEnv,
      committedMigrations,
    );

    const evidence = {
      version: PHASE2E_PREFLIGHT_VERSION,
      status: "pass",
      classification: {
        candidateDatabaseRehearsal: true,
        liveStagingEvidence: false,
        w12Evidence: false,
      },
      startedAt,
      finishedAt: new Date().toISOString(),
      environment: "staging",
      refs,
      secrets: {
        requiredNames: REQUIRED_SECRET_NAMES,
        present: true,
        valuesRecorded: false,
      },
      variables: { requiredNames: REQUIRED_VARIABLE_NAMES, present: true },
      routes,
      rollback,
      database: {
        tls: {
          mode: "verify-full",
          rootCertificateSha256: SUPABASE_ROOT_2021_CA_SHA256,
          certificatePathRecorded: false,
        },
        sourcePostgresMajor,
        constraintReadiness: tenantUserRoleConstraintReadiness,
        backup: {
          name: backup.backupName,
          path: backup.backupPath,
          sizeBytes: backup.sizeBytes,
          sha256: backup.sha256,
          schemas: backup.schemas,
          uploadedToGitHub: false,
          publicationMetadata: {
            name: basename(backup.publicationMetadata.path),
            sha256: backup.publicationMetadata.sha256,
            sourceVerified: true,
            appliedToRestore: restoreMetadata.publicationMetadataRestored,
            uploadedToGitHub: false,
          },
        },
        restore: {
          engine: "postgresql:17.10-unprivileged-local",
          runtime: postgresRuntime,
          isolated: true,
          disposedAfterProof: true,
          criticalRowCounts: restoredCounts,
          migrationHistory: migrationPrefix,
          historicalMigrationRecords: verifiedHistoricalMigrations,
        },
        paymentIntentDiagnostic: {
          version: paymentIntentDiagnostic.diagnostic.version,
          duplicateSourceCount:
            paymentIntentDiagnostic.diagnostic.duplicateSources.length,
          evidencePath: relative(repoRoot, paymentIntentDiagnostic.path),
          secretValuesRecorded: false,
          providerIdentifiersRecorded: false,
          checkoutUrlsRecorded: false,
        },
        migration,
        migrationDataIntegrity: {
          ...migrationDataIntegrity,
          criticalRowCountsAfterMigration: migratedCounts,
        },
        proof: databaseProof,
      },
      promotionPerformed: false,
      deploymentPerformed: false,
    };
    const evidencePath = await writeEvidence(options.outDir, evidence);
    return { evidence, evidencePath };
  } finally {
    await stopRestoreTarget(restoreTarget);
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (options.check) {
    console.log("Fieldgrid Phase 2E staging preflight contract is valid.");
    return 0;
  }
  if (!options.run) {
    console.log(usage());
    return 0;
  }
  const { evidencePath } = await runPreflight(options);
  console.log(
    `[fieldgrid:phase2e-preflight] PASS; evidence written to ${evidencePath}`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(
        `[fieldgrid:phase2e-preflight] FAIL: ${safeMessage(error)}`,
      );
      process.exitCode = 1;
    });
}
