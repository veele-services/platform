#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const PHASE2E_PREFLIGHT_VERSION = "phase2e-staging-preflight-v1";
export const CONFIRMATION = "phase2e-staging-only";
export const EXPECTED_STAGING_PROJECT_REF = "olyfmekyqozxrbrwwszu";
export const LATEST_PHASE2_MIGRATION =
  "20260719130000_payment_webhook_integrity.sql";
export const BACKUP_SCHEMAS = [
  "public",
  "auth",
  "storage",
  "drizzle",
  "app_private",
];

export const REQUIRED_SECRET_NAMES = [
  "DATABASE_URL",
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
  return `Fieldgrid Phase 2E staging preflight\n\nUsage:\n  pnpm fieldgrid:phase2e-staging-preflight:check\n  pnpm fieldgrid:phase2e-staging-preflight --run --expected-main SHA --expected-staging SHA\n\nThe run mode is restricted to the GitHub staging environment and never moves a Git ref.\n`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    run: false,
    help: false,
    expectedMain: "",
    expectedStaging: "",
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

export function parsePostgresEnv(databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(
      "DATABASE_URL must use the postgres or postgresql protocol.",
    );
  }
  if (!parsed.hostname || !parsed.username || !parsed.pathname.slice(1)) {
    throw new Error("DATABASE_URL must include host, user and database name.");
  }

  const values = {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    PGSSLMODE: parsed.searchParams.get("sslmode") || "require",
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
  if (options.expectedMain === options.expectedStaging)
    errors.push("main and previous staging must differ before promotion.");
  if (env.APP_ENV !== "staging" || env.TARGET_ENVIRONMENT !== "staging") {
    errors.push("The preflight is restricted to the staging environment.");
  }
  if (env.PHASE2E_CONFIRM !== CONFIRMATION)
    errors.push(`PHASE2E_CONFIRM must equal ${CONFIRMATION}.`);
  if (env.GITHUB_REF_NAME !== "main")
    errors.push("The preflight must be dispatched from main.");
  if (!String(env.GITHUB_REPOSITORY ?? "").includes("/"))
    errors.push("GITHUB_REPOSITORY is required.");
  if (!String(env.GITHUB_TOKEN ?? "").trim())
    errors.push("GITHUB_TOKEN is required for immutable ref verification.");

  const missingSecrets = missingNames(REQUIRED_SECRET_NAMES, env);
  if (missingSecrets.length > 0)
    errors.push(`Missing staging secrets: ${missingSecrets.join(", ")}.`);
  const missingVariables = missingNames(REQUIRED_VARIABLE_NAMES, env);
  if (missingVariables.length > 0)
    errors.push(`Missing staging variables: ${missingVariables.join(", ")}.`);

  if (
    env.DATABASE_URL &&
    !env.DATABASE_URL.includes(EXPECTED_STAGING_PROJECT_REF)
  ) {
    errors.push("DATABASE_URL does not target the expected staging project.");
  }
  if (
    env.NEXT_PUBLIC_SUPABASE_URL &&
    !env.NEXT_PUBLIC_SUPABASE_URL.includes(EXPECTED_STAGING_PROJECT_REF)
  ) {
    errors.push(
      "NEXT_PUBLIC_SUPABASE_URL does not target the expected staging project.",
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
    new URL(env.PILOT_TENANT_LOGIN_URL).hostname !== "field-demo.fieldgrid.nl"
  ) {
    errors.push(
      "PILOT_TENANT_LOGIN_URL must use the current pilot tenant host.",
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

async function verifyRollbackTarget(expectedStaging, env = process.env) {
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
  if (!basename(currentRelease).endsWith(expectedStaging.slice(0, 7))) {
    throw new Error(
      "Current staging release directory does not match the previous staging SHA.",
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
      expectedStaging,
    ]);
    markerValue = (await readFile(marker, "utf8")).trim();
  }
  if (markerValue !== expectedStaging)
    throw new Error("Previous staging release SHA marker does not match.");

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

  return {
    baseDir,
    currentRelease,
    marker: expectedStaging,
    servicesActive: services,
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

async function ensurePostgresRuntime(env = process.env) {
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

async function startRestoreTarget(tempDir) {
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

async function stopRestoreTarget(target) {
  if (!target?.dataDir) return;
  await runCommand(
    "pg_ctl",
    ["--pgdata", target.dataDir, "--mode", "fast", "--wait", "stop"],
    { allowFailure: true },
  );
}

async function runMigrationRehearsal(target, outDir) {
  const databaseUrl = `postgresql://postgres:${encodeURIComponent(target.pgEnv.PGPASSWORD)}@127.0.0.1:${target.port}/${target.database}`;
  const smokeOut = join(outDir, "migration-smoke");
  const result = await runCommand(
    "pnpm",
    [
      "fieldgrid:sprint7-migration-smoke",
      "--run",
      "--target",
      "staging-copy",
      "--out",
      smokeOut,
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DB_SSL: "false",
        PGSSLMODE: "disable",
        FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL: databaseUrl,
        FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_CONFIRM: "staging-copy",
      },
    },
  );
  const reportMatch = result.stdout.match(/Report written:\s*(.+\.json)\s*$/mu);
  if (!reportMatch)
    throw new Error("Migration rehearsal did not report an evidence path.");
  const report = JSON.parse(await readFile(reportMatch[1], "utf8"));
  if (report.summary?.status !== "pass")
    throw new Error("Migration rehearsal report is not green.");
  return {
    status: "pass",
    summary: report.summary,
    reportPath: relative(repoRoot, reportMatch[1]),
  };
}

async function verifyMigratedRestore(pgEnv) {
  const latest = await psql(
    pgEnv,
    "select name from drizzle.veele_sql_migrations order by name desc limit 1;",
  );
  if (latest !== LATEST_PHASE2_MIGRATION)
    throw new Error(`Latest restored migration is ${latest || "missing"}.`);
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
  return {
    latestMigration: latest,
    rlsRelations: PHASE2_RLS_RELATIONS.length,
    unsafeAnonymousAclRelations: 0,
    realtimePublication: true,
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
    const rollback = await verifyRollbackTarget(options.expectedStaging, env);
    const postgresRuntime = await ensurePostgresRuntime(env);
    const sourcePgEnv = parsePostgresEnv(env.DATABASE_URL);
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
    const backup = await createBackup(
      sourcePgEnv,
      options.expectedStaging,
      schemas,
      realtimePublicationMetadata,
      env,
    );
    const sourceCounts = await collectCriticalCounts(sourcePgEnv);
    restoreTarget = await startRestoreTarget(tempDir);
    const restoreMetadata = await restoreBackup(restoreTarget, backup);
    const restoredCounts = await collectCriticalCounts(restoreTarget.pgEnv);
    assertMatchingCounts(sourceCounts, restoredCounts);
    const liveRealtimeEventsBeforeMigration = await collectLiveRealtimeEvents(
      restoreTarget.pgEnv,
    );
    const paymentIntentDiagnostic = await writePaymentIntentDiagnostic(
      restoreTarget.pgEnv,
      options.outDir,
    );
    const migration = await runMigrationRehearsal(
      restoreTarget,
      options.outDir,
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
    const databaseProof = await verifyMigratedRestore(restoreTarget.pgEnv);

    const evidence = {
      version: PHASE2E_PREFLIGHT_VERSION,
      status: "pass",
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
        sourcePostgresMajor,
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
