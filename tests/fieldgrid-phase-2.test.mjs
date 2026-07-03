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

test("phase 2 migration is staging-safe and additive-first", () => {
  const migration = read("lib/db/migrations/062_post_migration_tenant_hardening.sql");

  assertContains(
    migration,
    [
      "Staging-safe migration",
      "ADD COLUMN IF NOT EXISTS tenant_id",
      "ALTER COLUMN tenant_id DROP DEFAULT",
      "CHECK (tenant_id IS NOT NULL) NOT VALID",
      "audit_log.tenant_id",
      "NULL remains valid only for platform/global audit rows",
    ],
    "phase 2 migration",
  );

  assert.ok(!/ALTER\s+COLUMN\s+tenant_id\s+SET\s+NOT\s+NULL/iu.test(migration), "phase 2 must not SET NOT NULL before staging-copy proof");
  assert.ok(!/DROP\s+TABLE/iu.test(migration), "phase 2 must not drop tables");
  assert.ok(!/TRUNCATE\s+/iu.test(migration), "phase 2 must not truncate data");
});

test("phase 2 migration covers sensitive tenant tables", () => {
  const migration = read("lib/db/migrations/062_post_migration_tenant_hardening.sql");

  assertContains(
    migration,
    [
      "documents_tenant_id_required_check",
      "reports_tenant_id_required_check",
      "quotes_tenant_id_required_check",
      "invoices_tenant_id_required_check",
      "payments_tenant_id_required_check",
      "customer_payment_batches_tenant_id_required_check",
      "customer_payment_batch_items_tenant_id_required_check",
      "customer_payment_batch_items",
      "audit_log_nullable_by_design",
    ],
    "phase 2 migration",
  );
});

test("assignments schema no longer declares DEFAULT_TENANT_ID fallback", () => {
  const schema = read("lib/db/src/schema/assignments.ts");

  assert.ok(!schema.includes("DEFAULT_TENANT_ID"), "assignments schema must not import DEFAULT_TENANT_ID");
  assert.ok(!schema.includes(".default(sql`"), "assignments.tenantId must not have a db default in schema");
  assertContains(schema, ["tenantId", ".notNull()", "references(() => tenantsTable.id"], "assignments schema");
});

test("phase 2 hardening report is read-only and checks unresolved rows", () => {
  const script = read("lib/db/scripts/tenant-hardening-report.mjs");

  assertContains(
    script,
    [
      "sensitiveTables",
      "unresolved_tenant_id",
      "tenant_id_default",
      "required_check_validated",
      "ready_for_not_null",
      "--fail-on-unresolved",
      "PHASE2_REPORT_ALLOW_PRODUCTION",
    ],
    "phase 2 hardening report",
  );

  assert.ok(!/\binsert\b/iu.test(script), "report script must not insert data");
  assert.ok(!/\bupdate\b/iu.test(script), "report script must not update data");
  assert.ok(!/\bdelete\b/iu.test(script), "report script must not delete data");
});

test("phase 2 documentation and package scripts are wired", () => {
  const docs = read("docs/fieldgrid-phase-2-tenant-hardening.md");
  const rootPackage = read("package.json");
  const dbPackage = read("lib/db/package.json");

  assertContains(
    docs,
    [
      "fase 2 post-migration hardening",
      "geen `ALTER COLUMN tenant_id SET NOT NULL`",
      "staging-copy",
      "FG-MIG-001",
      "FG-MIG-002",
      "audit_log",
    ],
    "phase 2 docs",
  );

  assertContains(rootPackage, ["fieldgrid:phase2-hardening-report"], "root package scripts");
  assertContains(dbPackage, ["tenant-hardening:report"], "db package scripts");
});
