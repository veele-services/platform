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

const taskCodesSchema = "lib/db/src/schema/task-codes.ts";
const assignmentsSchema = "lib/db/src/schema/assignments.ts";
const invoiceProposals = "artifacts/backoffice/src/lib/invoice-proposals.ts";
const quotesActions = "artifacts/backoffice/src/app/actions/quotes.ts";
const migration = "lib/db/migrations/064_tenant_task_codes_prices.sql";
const sprintContract = "docs/fieldgrid-sprint-9-task-code-pricing.md";
const testMatrix = "docs/fieldgrid-cross-tenant-testmatrix.md";

const SPRINT_9_TEST_IDS = [
  "FG-SECTOR-001",
  "FG-SECTOR-002",
  "FG-SECTOR-003",
  "FG-SECTOR-006",
  "FG-DATA-006",
  "FG-DATA-007",
  "FG-MIG-001",
  "FG-MIG-002",
];

test("Sprint 9 schemas expose tenant task codes and price history", () => {
  const taskCodes = read(taskCodesSchema);

  assertContains(
    taskCodes,
    [
      "tenantTaskCodesTable",
      "tenant_task_codes",
      "templateTaskCodeId",
      "tenant_task_codes_tenant_code_unique_idx",
      "tenantTaskCodePricesTable",
      "tenant_task_code_prices",
      "validFrom",
      "validUntil",
      "tenant_task_code_prices_task_valid_from_unique_idx",
      "task_codes_tenant_code_unique_idx",
    ],
    taskCodesSchema,
  );

  assert.ok(
    !taskCodes.includes('code: varchar("code", { length: 50 }).notNull().unique()'),
    "task_codes.code should no longer be globally unique in schema export",
  );
});

test("Sprint 9 assignment tasks store task-code snapshots", () => {
  const assignments = read(assignmentsSchema);

  assertContains(
    assignments,
    [
      "tenantTaskCodeId",
      "tenantTaskCodePriceId",
      "taskCodeCode",
      "taskCodeName",
      "taskCodePrice",
      "taskCodeInvoiceable",
      "tenantTaskCodesTable",
      "tenantTaskCodePricesTable",
    ],
    assignmentsSchema,
  );
});

test("Sprint 9 migration backfills and guards tenant task-code pricing safely", () => {
  const sql = read(migration);

  assertContains(
    sql,
    [
      "CREATE TABLE IF NOT EXISTS tenant_task_codes",
      "CREATE TABLE IF NOT EXISTS tenant_task_code_prices",
      "ADD COLUMN IF NOT EXISTS tenant_task_code_id",
      "ADD COLUMN IF NOT EXISTS task_code_price",
      "task_codes_tenant_code_unique_idx",
      "tenant_task_codes_tenant_code_unique_idx",
      "tenant_task_code_prices_task_valid_from_unique_idx",
      "ON CONFLICT (tenant_id, code)",
      "fieldgrid_assert_tenant_task_code_sector",
      "tenant_sectors",
      "is_enabled = true",
      "fieldgrid_set_tenant_task_code_price_tenant",
      "fieldgrid_sync_task_code_to_tenant_task_code",
      "fieldgrid_snapshot_assignment_task_code",
      "trg_task_codes_sync_tenant_task_code",
      "trg_assignment_tasks_snapshot_task_code",
      "NOT VALID",
      "RAISE NOTICE",
    ],
    migration,
  );
});

test("Sprint 9 invoice and quote flows prefer assignment task snapshots", () => {
  const invoices = read(invoiceProposals);
  const quotes = read(quotesActions);

  assertContains(
    invoices,
    [
      "snapshotCode",
      "snapshotName",
      "snapshotPrice",
      "snapshotInvoiceable",
      "row.snapshotPrice ?? row.price",
      "row.snapshotInvoiceable ?? row.invoiceable ?? false",
    ],
    invoiceProposals,
  );

  assertContains(
    quotes,
    [
      "SnapshotTaskLineItemRow",
      "resolveSnapshotTaskLineItem",
      "snapshotPrice",
      "snapshotInvoiceable",
      "row.snapshotPrice ?? row.price ?? null",
      "lineItems = tasks.map(resolveSnapshotTaskLineItem)",
    ],
    quotesActions,
  );
});

test("Sprint 9 contract maps task-code pricing work to canonical test IDs", () => {
  const contract = read(sprintContract);
  const matrix = read(testMatrix);

  assertContains(
    contract,
    [
      "Tenant task codes, prijzen en sector-economie",
      "task_codes.code",
      "tenant_task_codes",
      "tenant_task_code_prices",
      "assignment_tasks",
      "Factuur- en offertevoorstellen lezen eerst snapshotvelden",
      "Tenant A en Tenant B mogen dezelfde task-code",
      "Veele gedraagt zich als gewone tenant",
      "Sprint 10",
    ],
    sprintContract,
  );

  for (const testId of SPRINT_9_TEST_IDS) {
    assertContains(contract, [testId], sprintContract);
    assertContains(matrix, [testId], testMatrix);
  }
});
