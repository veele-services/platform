import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const invoiceSchema = read("lib/db/src/schema/invoices.ts");
const generatedMigration = read("lib/db/migrations/generated/0001_wandering_matthew_murdock.sql");
const tenantScopeMigration = read("lib/db/migrations/062_finance_reports_tenant_scope.sql");
const tenantHardeningMigration = read("lib/db/migrations/062_post_migration_tenant_hardening.sql");
const sprint1Migration = read("lib/db/migrations/20260710110000_invoice_canon_datamodel.sql");
const allMigrationHints = [
  generatedMigration,
  tenantScopeMigration,
  tenantHardeningMigration,
  sprint1Migration,
].join("\n");

test("invoice schema keeps statuses and exposes Sprint 1 canon numbering datamodel", () => {
  assert.match(invoiceSchema, /export const INVOICE_STATUSES = \["draft", "sent", "paid", "cancelled"\] as const/u);
  assert.match(invoiceSchema, /invoiceNumber:\s+varchar\("invoice_number", \{ length: 30 \}\)/u);
  assert.doesNotMatch(invoiceSchema, /invoiceNumber:[\s\S]*?\.notNull\(\)\.unique\(\)\.\$defaultFn/u);
  assert.match(invoiceSchema, /invoiceNumberingSettingsId:\s+uuid\("invoice_numbering_settings_id"\)/u);
  assert.match(invoiceSchema, /invoiceNumberPeriodKey:\s+varchar\("invoice_number_period_key"/u);
  assert.match(invoiceSchema, /invoiceNumberSequenceValue:\s+integer\("invoice_number_sequence_value"\)/u);
  assert.match(invoiceSchema, /companySnapshotJson:\s+jsonb\("company_snapshot_json"\)/u);
  assert.match(invoiceSchema, /invoiceSettingsSnapshotJson:\s+jsonb\("invoice_settings_snapshot_json"\)/u);
  assert.match(invoiceSchema, /paymentSettingsSnapshotJson:\s+jsonb\("payment_settings_snapshot_json"\)/u);
  assert.match(invoiceSchema, /templateSnapshotJson:\s+jsonb\("template_snapshot_json"\)/u);
  assert.match(invoiceSchema, /invoiceLineItemSnapshotsTable = pgTable/u);
  assert.match(invoiceSchema, /insertInvoiceSchema = createInsertSchema\(invoicesTable\)\.omit\(\{/u);
  assert.match(invoiceSchema, /invoiceNumber: true/u);
  assert.match(invoiceSchema, /tenantId: true/u);
});

test("Sprint 1 migration replaces global invoice uniqueness with tenant-scoped nullable numbering", () => {
  assert.match(generatedMigration, /"invoice_number" varchar\(30\) NOT NULL/u);
  assert.match(generatedMigration, /CONSTRAINT "invoices_invoice_number_unique" UNIQUE\("invoice_number"\)/u);
  assert.match(tenantScopeMigration, /CREATE OR REPLACE FUNCTION fieldgrid_set_invoice_tenant_id\(\)/u);
  assert.match(tenantScopeMigration, /DROP TRIGGER IF EXISTS trg_invoices_set_tenant_id ON invoices/u);
  assert.match(tenantScopeMigration, /CREATE TRIGGER trg_invoices_set_tenant_id/u);
  assert.match(tenantHardeningMigration, /SELECT pg_temp\.fieldgrid_add_tenant_required_check\('invoices', 'invoices_tenant_id_required_check'\)/u);
  assert.match(sprint1Migration, /DROP CONSTRAINT IF EXISTS invoices_invoice_number_unique/u);
  assert.match(sprint1Migration, /ALTER COLUMN invoice_number DROP NOT NULL/u);
  assert.match(sprint1Migration, /ALTER COLUMN invoice_number DROP DEFAULT/u);
  assert.match(sprint1Migration, /DROP TRIGGER IF EXISTS trg_invoices_set_number/u);
  assert.match(sprint1Migration, /CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_invoice_number_unique_idx/u);
  assert.match(sprint1Migration, /WHERE invoice_number IS NOT NULL AND invoice_number <> ''/u);
});

test("Sprint 1 migration creates canonical settings, sequence and snapshot foundations", () => {
  assert.match(allMigrationHints, /invoice_numbering_settings/u);
  assert.match(allMigrationHints, /invoice_number_sequences/u);
  assert.match(allMigrationHints, /tenant_company_settings/u);
  assert.match(allMigrationHints, /invoice_payment_settings/u);
  assert.match(allMigrationHints, /invoice_template_settings/u);
  assert.match(allMigrationHints, /invoice_line_item_snapshots/u);
  assert.match(sprint1Migration, /invoice_numbering_settings_prefix_check/u);
  assert.match(sprint1Migration, /CHECK \(prefix ~ '\^\[A-Z\]\{3\}\$'\)/u);
  assert.match(sprint1Migration, /invoice_numbering_settings_format_check/u);
  assert.match(sprint1Migration, /invoice_number_sequences_tenant_settings_period_idx/u);
  assert.match(sprint1Migration, /INSERT INTO public\.tenant_company_settings/u);
  assert.match(sprint1Migration, /INSERT INTO public\.invoice_number_sequences/u);
  assert.match(sprint1Migration, /invoice_number_sequence_value/u);
  assert.doesNotMatch(allMigrationHints, /claim_invoice_number/u);
});
