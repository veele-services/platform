import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  const normalized = content.toLowerCase();
  for (const phrase of phrases) {
    assert.ok(normalized.includes(phrase.toLowerCase()), `${label} should mention ${phrase}`);
  }
}

test("phase 3 migrations are staging-safe and additive-first", () => {
  const migration = `${read("lib/db/migrations/063_assignment_media_news_storage.sql")}\n${read("lib/db/migrations/064_assignment_storage_policy_guards.sql")}`;

  assertContains(
    migration,
    [
      "Staging-safe migration",
      "ADD COLUMN IF NOT EXISTS tenant_id",
      "assignment_photos_tenant_id_required_check",
      "assignment_report_note_attachments_tenant_id_required_check",
      "NOT VALID",
      "copy-first, verify-second, switch-third, cleanup-last",
    ],
    "phase 3 migrations",
  );

  assert.ok(!/ALTER\s+COLUMN\s+tenant_id\s+SET\s+NOT\s+NULL/iu.test(migration), "phase 3 must not SET NOT NULL before staging-copy proof");
  assert.ok(!/DROP\s+TABLE/iu.test(migration), "phase 3 must not drop tables");
  assert.ok(!/TRUNCATE\s+/iu.test(migration), "phase 3 must not truncate data");
});

test("phase 3 temporary helpers avoid cross-migration pg_temp collisions", () => {
  const migration = read("lib/db/migrations/063_assignment_media_news_storage.sql");

  assertContains(
    migration,
    [
      "DROP FUNCTION IF EXISTS pg_temp.fieldgrid_add_tenant_fk(text, text)",
      "DROP FUNCTION IF EXISTS pg_temp.fieldgrid_add_required_check(text, text)",
      "fieldgrid_add_tenant_fk(p_table_name text, p_constraint_name text)",
      "fieldgrid_add_required_check(p_table_name text, p_constraint_name text)",
      "FROM information_schema.columns columns_row",
      "columns_row.table_name = p_table_name",
    ],
    "phase 3 temporary helpers",
  );

  assert.ok(!migration.includes("fieldgrid_add_tenant_fk.table_name"), "phase 3 tenant FK helper must not qualify an ambiguous table_name parameter");
});

test("phase 3 media migration derives tenant context from assignments", () => {
  const migration = read("lib/db/migrations/063_assignment_media_news_storage.sql");

  assertContains(
    migration,
    [
      "fieldgrid_set_assignment_media_tenant_id",
      "NEW.tenant_id := assignment_tenant_id",
      "assignment media tenant_id must match assignment.tenant_id",
      "assignment report note attachment must use the same assignment as its note",
      "trg_assignment_photos_set_tenant_id",
      "trg_assignment_report_note_attachments_set_tenant_id",
    ],
    "phase 3 media migration",
  );
});

test("phase 3 news decision is platform-only", () => {
  const migration = read("lib/db/migrations/063_assignment_media_news_storage.sql");
  const schema = read("lib/db/src/schema/news.ts");

  assertContains(
    migration,
    [
      "news_posts_platform_only_scope_check",
      "scope = 'platform' AND tenant_id IS NULL",
      "news_post_targets_platform_only_check",
      "target_type IN ('all_personnel', 'all_customers') AND target_id IS NULL",
    ],
    "phase 3 news migration",
  );

  assertContains(
    schema,
    [
      "NEWS_POST_SCOPES",
      "scope:",
      "tenantId:",
      "PLATFORM_NEWS_TARGET_TYPES",
    ],
    "news schema",
  );
});

test("phase 3 storage policy helpers parse legacy and canonical paths safely", () => {
  const policyMigration = read("lib/db/migrations/064_assignment_storage_policy_guards.sql");

  assertContains(
    policyMigration,
    [
      "fieldgrid_storage_assignment_id_from_path",
      "fieldgrid_storage_tenant_id_from_path",
      "tenant",
      "assignments",
      "assignment_photos_assigned_personnel_update",
      "WITH CHECK",
    ],
    "phase 3 storage policies",
  );
});

test("phase 3 assignment schema exposes tenant-aware media", () => {
  const schema = read("lib/db/src/schema/assignments.ts");

  assertContains(
    schema,
    [
      "assignmentPhotosTable",
      "tenantId:",
      "uuid(\"tenant_id\")",
      "assignmentReportNoteAttachmentsTable",
      "references(() => tenantsTable.id",
    ],
    "assignment schema",
  );
});

test("phase 3 storage report and docs are wired", () => {
  const report = read("lib/db/scripts/storage-tenancy-report.mjs");
  const docs = read("docs/fieldgrid-phase-3-storage-media-news.md");
  const rootPackage = read("package.json");
  const dbPackage = read("lib/db/package.json");

  assertContains(
    report,
    [
      "assignment_photos",
      "assignment_report_note_attachments",
      "legacy_storage_paths",
      "invalid_platform_targets",
      "storage_policies",
      "--fail-on-legacy",
      "PHASE3_STORAGE_REPORT_ALLOW_PRODUCTION",
    ],
    "phase 3 report",
  );

  assertContains(
    docs,
    [
      "fase 3 assignment media",
      "platform_only",
      "tenant/{tenant_id}/assignments/{assignment_id}/...",
      "geen fysieke storage move/delete",
      "FG-STORAGE-003",
      "FG-STORAGE-007",
    ],
    "phase 3 docs",
  );

  assertContains(rootPackage, ["fieldgrid:phase3-storage-report"], "root package scripts");
  assertContains(dbPackage, ["storage-tenancy:report"], "db package scripts");
});
