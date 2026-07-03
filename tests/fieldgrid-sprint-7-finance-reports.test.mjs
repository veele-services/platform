import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should mention ${phrase}`);
  }
}

const reportsSchema = "lib/db/src/schema/reports.ts";
const quotesSchema = "lib/db/src/schema/quotes.ts";
const invoicesSchema = "lib/db/src/schema/invoices.ts";
const migration = "lib/db/migrations/062_finance_reports_tenant_scope.sql";
const sprintContract = "docs/fieldgrid-sprint-7-finance-reports.md";
const testMatrix = "docs/fieldgrid-cross-tenant-testmatrix.md";

const SPRINT_7_TEST_IDS = [
  "FG-DATA-005",
  "FG-DATA-006",
  "FG-DATA-007",
  "FG-AUDIT-001",
  "FG-MIG-001",
  "FG-MIG-002",
];

test("Sprint 7 report, quote and invoice schemas expose tenant scope", () => {
  const reports = read(reportsSchema);
  const quotes = read(quotesSchema);
  const invoices = read(invoicesSchema);

  assertContains(
    reports,
    [
      "tenantId:",
      "uuid(\"tenant_id\")",
      "references(() => tenantsTable.id",
      "reports_tenant_idx",
      "reports_tenant_assignment_idx",
      "tenantId: true",
    ],
    reportsSchema,
  );

  assertContains(
    quotes,
    [
      "tenantId:",
      "uuid(\"tenant_id\")",
      "references(() => tenantsTable.id",
      "quotes_tenant_idx",
      "quotes_tenant_assignment_idx",
      "quotes_tenant_customer_idx",
      "tenantId: true",
    ],
    quotesSchema,
  );

  assertContains(
    invoices,
    [
      "tenantId:",
      "uuid(\"tenant_id\")",
      "references(() => tenantsTable.id",
      "invoices_tenant_idx",
      "invoices_tenant_assignment_idx",
      "invoices_tenant_customer_idx",
      "invoices_tenant_status_idx",
      "tenantId: true",
    ],
    invoicesSchema,
  );
});

test("Sprint 7 migration backfills and guards finance/report tenant ids safely", () => {
  const sql = read(migration);

  assertContains(
    sql,
    [
      "ALTER TABLE reports",
      "ALTER TABLE quotes",
      "ALTER TABLE invoices",
      "ADD COLUMN IF NOT EXISTS tenant_id uuid",
      "reports_tenant_id_fkey",
      "quotes_tenant_id_fkey",
      "invoices_tenant_id_fkey",
      "FROM assignments assignment",
      "FROM customers customer",
      "fieldgrid_set_report_tenant_id",
      "fieldgrid_set_quote_tenant_id",
      "fieldgrid_set_invoice_tenant_id",
      "trg_reports_set_tenant_id",
      "trg_quotes_set_tenant_id",
      "trg_invoices_set_tenant_id",
      "reports_tenant_assignment_idx",
      "quotes_tenant_customer_idx",
      "invoices_tenant_status_idx",
      "NOT VALID",
      "ALTER COLUMN tenant_id SET NOT NULL",
      "RAISE NOTICE",
    ],
    migration,
  );
});

test("Sprint 7 contract maps finance/report work to canonical test IDs", () => {
  const contract = read(sprintContract);
  const matrix = read(testMatrix);

  assertContains(
    contract,
    [
      "Finance en reports wave 2",
      "reports.tenant_id",
      "quotes.tenant_id",
      "invoices.tenant_id",
      "PDF/download audit contract",
      "write-time tenant consistency triggers",
      "payments",
      "customer_payment_batches",
    ],
    sprintContract,
  );

  for (const testId of SPRINT_7_TEST_IDS) {
    assertContains(contract, [testId], sprintContract);
    assertContains(matrix, [testId], testMatrix);
  }
});
