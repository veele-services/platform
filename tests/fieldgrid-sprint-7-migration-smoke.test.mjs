import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  MIGRATION_SMOKE_TARGETS,
  buildEnvForTarget,
  buildMigrationSmokePlan,
  classifyDatabaseUrlSafety,
  formatMigrationSmokeResult,
  parseArgs,
  parseEnvFileContent,
  parseMigrationOutput,
  validateMigrationSmokeContract,
} from "../scripts/fieldgrid-sprint7-migration-smoke.mjs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("sprint 7 migration smoke contract has empty and staging-copy targets", () => {
  const plan = buildMigrationSmokePlan({});
  const errors = validateMigrationSmokeContract(plan);

  assert.deepEqual(errors, []);
  assert.deepEqual(
    plan.targets.map((target) => target.id),
    ["empty-database", "staging-copy"],
  );
  assert.ok(plan.requiredReportFields.includes("appliedMigrations"));
  assert.ok(plan.requiredReportFields.includes("skippedMigrations"));
  assert.ok(
    plan.requiredReportFields.includes("compatibilitySkippedMigrations"),
  );
  assert.ok(plan.requiredReportFields.includes("unresolvedRows"));
  assert.ok(plan.requiredReportFields.includes("failedStatement"));
});

test("sprint 7 targets map to required migration test ids", () => {
  const byId = new Map(
    MIGRATION_SMOKE_TARGETS.map((target) => [target.id, target]),
  );

  assert.ok(byId.get("empty-database")?.testIds.includes("FG-MIG-001"));
  assert.ok(byId.get("staging-copy")?.testIds.includes("FG-MIG-002"));
  assert.ok(
    MIGRATION_SMOKE_TARGETS.every((target) =>
      target.testIds.includes("FG-MIG-003"),
    ),
  );
});

test("migration log parser reports applied, skipped, compatibility skipped and unresolved rows", () => {
  const parsed = parseMigrationOutput(
    [
      "[db:migrate] Applying Drizzle generated migrations.",
      "[db:migrate] SQL skipped: 001_rbac_rls.sql",
      "[db:migrate] SQL compatibility skipped: 055_tenant_scoped_rbac.sql (canonical tenant_role_id RBAC tables already exist)",
      "[db:migrate] SQL applying: 064_tenant_regions.sql",
      "unresolved rows: 2",
      "[db:migrate] Complete.",
    ].join("\n"),
    "",
  );

  assert.equal(parsed.drizzleStarted, true);
  assert.equal(parsed.complete, true);
  assert.deepEqual(parsed.skippedMigrations, ["001_rbac_rls.sql"]);
  assert.deepEqual(parsed.appliedMigrations, ["064_tenant_regions.sql"]);
  assert.equal(
    parsed.compatibilitySkippedMigrations[0].name,
    "055_tenant_scoped_rbac.sql",
  );
  assert.deepEqual(parsed.unresolvedRows, [2]);
});

test("migration smoke safety blocks unconfirmed production-looking urls", () => {
  const target = MIGRATION_SMOKE_TARGETS.find(
    (candidate) => candidate.id === "staging-copy",
  );
  const safety = classifyDatabaseUrlSafety(
    "postgres://user:pass@db.supabase.co:5432/postgres",
    target,
    {},
    false,
  );

  assert.equal(safety.safe, false);
  assert.equal(safety.readiness, "blocked");
});

test("migration smoke safety allows explicit target confirmation", () => {
  const target = MIGRATION_SMOKE_TARGETS.find(
    (candidate) => candidate.id === "staging-copy",
  );
  const safety = classifyDatabaseUrlSafety(
    "postgres://user:pass@db.supabase.co:5432/postgres",
    target,
    { FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_CONFIRM: "staging-copy" },
    false,
  );

  assert.equal(safety.safe, true);
  assert.equal(safety.readiness, "configured");
});

test("migration smoke env parser supports quoted values", () => {
  const env = parseEnvFileContent(
    [
      "# comment",
      "FIELDGRID_MIGRATION_SMOKE_EMPTY_CONFIRM=empty-database",
      'DATABASE_URL="postgres://user:pass@localhost:5432/fieldgrid_empty_smoke"',
    ].join("\n"),
  );

  assert.equal(env.FIELDGRID_MIGRATION_SMOKE_EMPTY_CONFIRM, "empty-database");
  assert.equal(
    env.DATABASE_URL,
    "postgres://user:pass@localhost:5432/fieldgrid_empty_smoke",
  );
});

test("live migration smoke routes the disposable target through the migration principal", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-migration-smoke-env-"));
  const envFile = join(fixture, "staging-copy.env");
  const target = MIGRATION_SMOKE_TARGETS.find(
    (candidate) => candidate.id === "staging-copy",
  );
  const runtimeUrl =
    "postgresql://runtime_role:runtime-secret@db.example.test:5432/postgres";
  const migrationUrl =
    "postgresql://migration_role:migration-secret@copy.example.test:5432/postgres";
  try {
    writeFileSync(
      envFile,
      [
        "APP_ENV=staging",
        `DATABASE_URL=${runtimeUrl}`,
        `${target.envVar}=${migrationUrl}`,
      ].join("\n"),
      "utf8",
    );
    const { env, databaseUrl } = await buildEnvForTarget(target, {
      envFiles: { "staging-copy": envFile },
    });

    assert.equal(databaseUrl, migrationUrl);
    assert.equal(env.DATABASE_URL, runtimeUrl);
    assert.equal(env.FIELDGRID_MIGRATION_DATABASE_URL, migrationUrl);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("migration smoke CLI accepts exact release binding refs", () => {
  const options = parseArgs([
    "--run",
    "--target",
    "all",
    "--expected-main",
    "a".repeat(40),
    "--expected-staging",
    "b".repeat(40),
  ]);

  assert.equal(options.expectedMain, "a".repeat(40));
  assert.equal(options.expectedStaging, "b".repeat(40));
});

test("migration smoke result formatter prints failed target reason", () => {
  const formatted = formatMigrationSmokeResult({
    target: "empty-database",
    readiness: "not-configured",
    safetyReason:
      "FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL or DATABASE_URL is required.",
    exitCode: null,
    timedOut: false,
    appliedMigrations: [],
    skippedMigrations: [],
    compatibilitySkippedMigrations: [],
  });

  assert.match(formatted, /empty-database: not-configured/u);
  assert.match(formatted, /FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL/u);
});

test("sprint 7 runner validates from the command line", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/fieldgrid-sprint7-migration-smoke.mjs", "--check"],
    { encoding: "utf8" },
  );

  assert.match(output, /migration smoke contract is valid/);
});

test("sprint 7 documentation and PR template require migration smoke evidence", () => {
  const doc = read("docs/fieldgrid-sprint-7-migration-smoke.md");
  const template = read(".github/pull_request_template.md");
  const workflow = read(".github/workflows/fieldgrid-migration-smoke.yml");
  const localHarness = read("scripts/fieldgrid-local-migration-smoke.mjs");
  const packageJson = read("package.json");

  for (const content of [doc, template, workflow, packageJson]) {
    assert.match(content, /fieldgrid:sprint7-migration-smoke/);
  }

  assert.match(workflow, /scripts\/fieldgrid-setup-postgresql17\.sh/u);
  assert.match(
    workflow,
    /node scripts\/fieldgrid-local-migration-smoke\.mjs --run --out artifacts\/migration-smoke/u,
  );
  assert.match(localHarness, /runSelfContainedLocalMigrationSmoke/u);
  assert.doesNotMatch(workflow, /environment:\s+staging/u);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./u);
  assert.doesNotMatch(
    workflow,
    /FIELDGRID_MIGRATION_SMOKE_(?:EMPTY|STAGING_COPY)_DATABASE_URL/u,
  );
  assert.match(doc, /lege database/i);
  assert.match(doc, /staging-copy/i);
  assert.match(template, /Lege database smoke/i);
  assert.match(template, /Staging-copy smoke/i);
});
