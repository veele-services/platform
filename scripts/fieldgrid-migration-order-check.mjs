#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

export const FIELDGRID_MIGRATION_ORDER_CHECK_VERSION =
  "fieldgrid-migration-order-check-v2";
export const MIGRATION_ORDER_POLICY = "frozen-legacy-then-timestamp";
export const MIGRATION_DIR = "lib/db/migrations";
export const LEGACY_NUMERIC_CEILING = 101;
export const LEGACY_TIMESTAMP_FLOOR = "20260618201212";
export const FROZEN_LEGACY_MIGRATION_MANIFEST_SHA256 =
  "b8b3863d70515f69b68dbdc38c8e703bce6eddab77e4b32cb77aa8fabae8ea97";

export const allowedLegacyDuplicateNumericPrefixes = {
  "055": [
    "055_tenant_domains.sql",
    "055_tenant_rbac_backfill.sql",
    "055_tenant_roles.sql",
    "055_tenant_scoped_rbac.sql",
  ],
  "061": [
    "061_documents_tenant_storage.sql",
    "061_plan_entitlements.sql",
    "061_tenant_sector_policy.sql",
  ],
  "062": [
    "062_finance_reports_tenant_scope.sql",
    "062_post_migration_tenant_hardening.sql",
  ],
  "063": [
    "063_assignment_media_news_storage.sql",
    "063_payments_batches_audit_tenant_scope.sql",
  ],
  "064": [
    "064_assignment_storage_policy_guards.sql",
    "064_material_inventory_document_notifications.sql",
    "064_tenant_regions.sql",
    "064_tenant_task_codes_prices.sql",
  ],
  "065": [
    "065_enable_all_tenant_modules_by_default.sql",
    "065_portal_branding_defaults.sql",
  ],
  "066": [
    "066_material_inventory_foundation.sql",
    "066_tenant_provisioning_onboarding.sql",
  ],
};

export const allowedLegacyTimestampMigrations = [
  "20260618201212_assignment_monthly_codes.sql",
];

const numericPattern = /^(\d{3})_[a-z0-9][a-z0-9_]*\.sql$/u;
const timestampPattern = /^(\d{14})_[a-z0-9][a-z0-9_]*\.sql$/u;

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    json: false,
    help: false,
    migrationsDir: join(repoRoot, MIGRATION_DIR),
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
      case "--dir":
      case "--migrations-dir":
        options.migrationsDir = resolve(repoRoot, nextValue());
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

export function classifyMigrationFilename(filename) {
  const numericMatch = filename.match(numericPattern);
  if (numericMatch) {
    return {
      filename,
      kind: "numeric",
      prefix: numericMatch[1],
      prefixNumber: Number.parseInt(numericMatch[1], 10),
    };
  }

  const timestampMatch = filename.match(timestampPattern);
  if (timestampMatch) {
    return {
      filename,
      kind: "timestamp",
      prefix: timestampMatch[1],
      prefixNumber: Number.parseInt(timestampMatch[1], 10),
    };
  }

  return {
    filename,
    kind: "invalid",
    prefix: null,
    prefixNumber: null,
  };
}

async function readMigrationDirectory(migrationsDir) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const sqlFiles = [];
  const ignored = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      ignored.push({ name: entry.name, reason: "directory" });
      continue;
    }

    if (entry.name === "baseline.json") {
      ignored.push({ name: entry.name, reason: "drizzle-baseline" });
      continue;
    }

    if (!entry.name.endsWith(".sql")) {
      ignored.push({ name: entry.name, reason: "not-sql" });
      continue;
    }

    sqlFiles.push(entry.name);
  }

  return {
    sqlFiles: sqlFiles.sort(),
    ignored: ignored.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function groupByPrefix(entries, kind) {
  const groups = new Map();

  for (const entry of entries.filter((candidate) => candidate.kind === kind)) {
    const key = entry.prefix;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry.filename);
  }

  return groups;
}

function findNumericGaps(numericEntries) {
  const uniquePrefixes = [
    ...new Set(numericEntries.map((entry) => entry.prefixNumber)),
  ].sort((a, b) => a - b);
  const gaps = [];

  for (let index = 1; index < uniquePrefixes.length; index += 1) {
    const previous = uniquePrefixes[index - 1];
    const current = uniquePrefixes[index];
    if (current - previous > 1) {
      gaps.push(
        `${String(previous + 1).padStart(3, "0")}..${String(current - 1).padStart(3, "0")}`,
      );
    }
  }

  return gaps;
}

async function legacyMigrationManifest(entries, migrationsDir) {
  const filenames = entries
    .filter(
      (entry) =>
        entry.kind === "numeric" ||
        allowedLegacyTimestampMigrations.includes(entry.filename),
    )
    .map((entry) => entry.filename)
    .sort();
  const hashedFiles = await Promise.all(
    filenames.map(async (filename) => {
      const sql = (
        await readFile(join(migrationsDir, filename), "utf8")
      ).replace(/\r\n/gu, "\n");
      return [filename, createHash("sha256").update(sql).digest("hex")];
    }),
  );
  return {
    filenames,
    sha256: createHash("sha256")
      .update(JSON.stringify(hashedFiles))
      .digest("hex"),
  };
}

export async function buildMigrationOrderReport(options = {}) {
  const migrationsDir = options.migrationsDir ?? join(repoRoot, MIGRATION_DIR);
  const { sqlFiles, ignored } = await readMigrationDirectory(migrationsDir);
  const entries = sqlFiles.map(classifyMigrationFilename);
  const numericEntries = entries.filter((entry) => entry.kind === "numeric");
  const timestampEntries = entries.filter(
    (entry) => entry.kind === "timestamp",
  );
  const legacyManifest = await legacyMigrationManifest(entries, migrationsDir);
  const latestNumericPrefix = numericEntries.reduce(
    (latest, entry) => Math.max(latest, entry.prefixNumber),
    0,
  );
  const latestTimestampPrefix = timestampEntries.reduce(
    (latest, entry) => (entry.prefix > latest ? entry.prefix : latest),
    "",
  );

  return {
    version: FIELDGRID_MIGRATION_ORDER_CHECK_VERSION,
    policy: MIGRATION_ORDER_POLICY,
    migrationsDir: migrationsDir.replace(/\\/gu, "/"),
    runnerOrder: sqlFiles,
    ignored,
    entries,
    totals: {
      sqlMigrations: entries.length,
      numericMigrations: numericEntries.length,
      timestampMigrations: timestampEntries.length,
      invalidMigrations: entries.filter((entry) => entry.kind === "invalid")
        .length,
    },
    legacy: {
      numericCeiling: LEGACY_NUMERIC_CEILING,
      timestampFloor: LEGACY_TIMESTAMP_FLOOR,
      allowedDuplicateNumericPrefixes: allowedLegacyDuplicateNumericPrefixes,
      allowedTimestampMigrations: allowedLegacyTimestampMigrations,
      frozenManifestSha256: FROZEN_LEGACY_MIGRATION_MANIFEST_SHA256,
      manifestFilenames: legacyManifest.filenames,
      manifestSha256: legacyManifest.sha256,
    },
    latestNumericPrefix,
    latestTimestampPrefix,
    nextNumericPrefixWouldBe: String(latestNumericPrefix + 1).padStart(3, "0"),
    nextAllowedTimestampMustBeAfter:
      latestTimestampPrefix || LEGACY_TIMESTAMP_FLOOR,
    numericGaps: findNumericGaps(numericEntries),
  };
}

export function validateMigrationOrderReport(report) {
  const errors = [];
  const warnings = [];
  const invalidEntries = report.entries.filter(
    (entry) => entry.kind === "invalid",
  );
  const numericEntries = report.entries.filter(
    (entry) => entry.kind === "numeric",
  );
  const timestampEntries = report.entries.filter(
    (entry) => entry.kind === "timestamp",
  );

  if (report.totals.sqlMigrations === 0)
    errors.push("Geen SQL-migraties gevonden.");

  if (
    report.legacy?.manifestSha256 !== FROZEN_LEGACY_MIGRATION_MANIFEST_SHA256
  ) {
    errors.push(
      "De bevroren legacy-migratiemanifest wijkt af; voeg geen numerieke legacy-migraties toe en wijzig of hernoem bestaande legacy-migraties niet.",
    );
  }

  for (const entry of invalidEntries) {
    errors.push(`${entry.filename} gebruikt geen toegestaan migratiepatroon.`);
  }

  const numericGroups = groupByPrefix(report.entries, "numeric");
  for (const [prefix, filenames] of numericGroups.entries()) {
    if (filenames.length <= 1) continue;

    const allowed = allowedLegacyDuplicateNumericPrefixes[prefix];
    if (!allowed) {
      errors.push(
        `Nieuwe dubbele numerieke migratieprefix ${prefix}: ${filenames.join(", ")}.`,
      );
      continue;
    }

    for (const filename of filenames) {
      if (!allowed.includes(filename)) {
        errors.push(
          `Migratie ${filename} is geen bekende legacy-uitzondering voor dubbele prefix ${prefix}.`,
        );
      }
    }
  }

  const numericAfterTimestampCutover = numericEntries.filter(
    (entry) => entry.prefixNumber > LEGACY_NUMERIC_CEILING,
  );
  for (const entry of numericAfterTimestampCutover) {
    errors.push(
      `${entry.filename} gebruikt numerieke prefix ${entry.prefix} na de timestamp-cutover; gebruik een timestamp > ${LEGACY_TIMESTAMP_FLOOR}.`,
    );
  }

  const timestampGroups = groupByPrefix(report.entries, "timestamp");
  for (const [prefix, filenames] of timestampGroups.entries()) {
    if (filenames.length > 1)
      errors.push(
        `Timestamp-prefix ${prefix} wordt door meerdere migraties gebruikt: ${filenames.join(", ")}.`,
      );
  }

  for (const entry of timestampEntries) {
    if (entry.prefix < LEGACY_TIMESTAMP_FLOOR) {
      errors.push(
        `${entry.filename} sorteert voor de legacy timestamp-cutover ${LEGACY_TIMESTAMP_FLOOR}.`,
      );
    }

    if (
      entry.prefix === LEGACY_TIMESTAMP_FLOOR &&
      !allowedLegacyTimestampMigrations.includes(entry.filename)
    ) {
      errors.push(
        `${entry.filename} gebruikt de legacy timestamp-cutover zonder allowlist.`,
      );
    }
  }

  if (report.numericGaps.length > 0) {
    warnings.push(
      `Historische numerieke gaten blijven bestaan: ${report.numericGaps.join(", ")}.`,
    );
  }

  return { errors, warnings };
}

function usage() {
  return `Fieldgrid migration order check

Usage:
  pnpm fieldgrid:migration-order-check:check
  pnpm fieldgrid:migration-order-check --json

Policy:
  The complete legacy filename and SQL-hash manifest is frozen. Because a timestamp
  migration already exists, future migrations must use timestamp prefixes after
  ${LEGACY_TIMESTAMP_FLOOR} to avoid fresh-database versus already-applied staging order drift.
`;
}

function printReport(report, validation) {
  console.log("Fieldgrid migration order check");
  console.log("");
  console.log(`Version: ${report.version}`);
  console.log(`Policy: ${report.policy}`);
  console.log(`SQL migrations: ${report.totals.sqlMigrations}`);
  console.log(
    `Latest numeric prefix: ${String(report.latestNumericPrefix).padStart(3, "0")}`,
  );
  console.log(
    `Latest timestamp prefix: ${report.latestTimestampPrefix || "<none>"}`,
  );
  console.log(`Warnings: ${validation.warnings.length}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(usage());
    return 0;
  }

  const report = await buildMigrationOrderReport({
    migrationsDir: options.migrationsDir,
  });
  const validation = validateMigrationOrderReport(report);

  if (options.json) {
    console.log(JSON.stringify({ ...report, validation }, null, 2));
  }

  if (validation.errors.length > 0) {
    console.error("Fieldgrid migration order check failed:");
    for (const error of validation.errors) console.error(`- ${error}`);
    for (const warning of validation.warnings)
      console.error(`warning: ${warning}`);
    return 1;
  }

  if (options.check) {
    console.log("Fieldgrid migration order check is valid.");
    for (const warning of validation.warnings)
      console.log(`warning: ${warning}`);
    return 0;
  }

  if (!options.json) printReport(report, validation);
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
