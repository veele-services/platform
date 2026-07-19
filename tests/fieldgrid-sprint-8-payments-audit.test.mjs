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

const paymentsSchema = "lib/db/src/schema/payments.ts";
const batchesSchema = "lib/db/src/schema/customer-payment-batches.ts";
const auditSchema = "lib/db/src/schema/audit-log.ts";
const paymentsActions = "artifacts/backoffice/src/app/actions/payments.ts";
const paymentIntegrity = "lib/db/src/payment-integrity.ts";
const migration =
  "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql";
const sprintContract = "docs/fieldgrid-sprint-8-payments-audit.md";
const testMatrix = "docs/fieldgrid-cross-tenant-testmatrix.md";

const SPRINT_8_TEST_IDS = [
  "FG-DATA-008",
  "FG-DATA-009",
  "FG-AUDIT-002",
  "FG-AUDIT-003",
  "FG-AUDIT-004",
  "FG-AUDIT-005",
  "FG-MIG-001",
  "FG-MIG-002",
];

test("Sprint 8 payment and batch schemas expose tenant scope", () => {
  const payments = read(paymentsSchema);
  const batches = read(batchesSchema);

  assertContains(
    payments,
    [
      "tenantId:",
      'uuid("tenant_id")',
      "references(() => tenantsTable.id",
      "payments_tenant_idx",
      "payments_tenant_invoice_idx",
      "payments_tenant_status_idx",
    ],
    paymentsSchema,
  );

  assertContains(
    batches,
    [
      "customer_payment_batches",
      "customer_payment_batch_items",
      "tenantId:",
      'uuid("tenant_id")',
      "customer_payment_batches_tenant_idx",
      "customer_payment_batches_tenant_customer_idx",
      "customer_payment_batch_items_tenant_batch_idx",
      "customer_payment_batch_items_tenant_invoice_idx",
    ],
    batchesSchema,
  );
});

test("Sprint 8 audit schema separates tenant audit from platform audit", () => {
  const audit = read(auditSchema);

  assertContains(
    audit,
    [
      "tenantId:",
      'uuid("tenant_id")',
      "references(() => tenantsTable.id",
      "Null remains valid for platform-only/global audit",
      "audit_log_tenant_idx",
      "audit_log_tenant_resource_idx",
      "audit_log_tenant_created_idx",
      "tenantId: true",
    ],
    auditSchema,
  );
});

test("Sprint 8 migration backfills and guards payments, batches and audit safely", () => {
  const sql = read(migration);

  assertContains(
    sql,
    [
      "ALTER TABLE payments",
      "ALTER TABLE customer_payment_batches",
      "ALTER TABLE customer_payment_batch_items",
      "ALTER TABLE audit_log",
      "ADD COLUMN IF NOT EXISTS tenant_id uuid",
      "payments_tenant_id_fkey",
      "customer_payment_batches_tenant_id_fkey",
      "customer_payment_batch_items_tenant_id_fkey",
      "audit_log_tenant_id_fkey",
      "FROM invoices invoice",
      "FROM customers customer",
      "FROM customer_payment_batches batch",
      "metadata ->> 'tenantId'",
      "fieldgrid_set_payment_tenant_id",
      "fieldgrid_set_customer_payment_batch_tenant_id",
      "fieldgrid_set_customer_payment_batch_item_tenant_id",
      "fieldgrid_set_audit_log_tenant_id",
      "trg_payments_set_tenant_id",
      "trg_customer_payment_batches_set_tenant_id",
      "trg_customer_payment_batch_items_set_tenant_id",
      "trg_audit_log_set_tenant_id",
      "NOT VALID",
      "ALTER COLUMN tenant_id SET NOT NULL",
      "audit_log.tenant_id backfill left",
      "RAISE NOTICE",
    ],
    migration,
  );
});

test("Sprint 8 payment actions use direct tenant scope", () => {
  const actions = read(paymentsActions);
  const integrity = read(paymentIntegrity);

  assertContains(
    actions,
    [
      "requireCurrentTenantId",
      "eq(paymentsTable.tenantId, tenantId)",
      "eq(invoicesTable.tenantId, tenantId)",
      "tenantId,",
      "metadata: {",
      "prepareDirectPaymentIntent",
    ],
    paymentsActions,
  );
  assertContains(
    integrity,
    [
      "WHERE id = $1 AND tenant_id = $2 AND customer_id = $3",
      "source_type = 'invoice' AND source_id = $2",
      "SELECT pg_advisory_xact_lock",
      "FOR UPDATE",
    ],
    paymentIntegrity,
  );
});

test("Sprint 8 contract maps payments/audit work to canonical test IDs", () => {
  const contract = read(sprintContract);
  const matrix = read(testMatrix);

  assertContains(
    contract,
    [
      "Payments, batches en audit wave 3/4",
      "payments.tenant_id",
      "customer_payment_batches.tenant_id",
      "customer_payment_batch_items.tenant_id",
      "audit_log.tenant_id",
      "Auditcontract",
      "support_access_audit_log",
      "Sprint 9",
    ],
    sprintContract,
  );

  for (const testId of SPRINT_8_TEST_IDS) {
    assertContains(contract, [testId], sprintContract);
    assertContains(matrix, [testId], testMatrix);
  }
});
