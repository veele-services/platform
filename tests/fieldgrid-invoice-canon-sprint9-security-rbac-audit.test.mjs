import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const next = source.indexOf(
    "\nexport async function ",
    start + marker.length,
  );
  return source.slice(start, next === -1 ? source.length : next);
}

const invoiceActions = read("artifacts/backoffice/src/app/actions/invoices.ts");
const invoiceSettingsActions = read(
  "artifacts/backoffice/src/app/actions/invoice-settings.ts",
);
const invoicePayRoute = read(
  "artifacts/backoffice/src/app/api/invoices/[id]/pay/route.ts",
);
const finalization = read("lib/db/src/invoice-finalization.ts");
const migration = read(
  "lib/db/migrations/20260710190000_invoice_security_rbac_audit_hardening.sql",
);
const reconciliationMigration = read(
  "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
);
const paymentIntegrity = read("lib/db/src/payment-integrity.ts");

test("Sprint 9 invoice settings actions derive tenant scope server-side only", () => {
  for (const functionName of [
    "getInvoiceSettings",
    "updateInvoiceCompanySettings",
    "updateInvoiceNumberingSettings",
    "updateInvoiceTemplateSettings",
    "updateInvoicePaymentSettings",
  ]) {
    const body = functionBlock(invoiceSettingsActions, functionName);
    assert.match(
      body,
      /requireCurrentTenantId\(\)/u,
      `${functionName} should resolve tenant from auth/session`,
    );
    assert.doesNotMatch(
      body,
      /data\.tenantId|input\.tenantId/u,
      `${functionName} must not trust tenantId from client input`,
    );
  }

  for (const action of [
    "update_invoice_company_settings",
    "update_invoice_numbering_settings",
    "update_invoice_template_settings",
    "update_invoice_payment_settings",
  ]) {
    assert.match(
      invoiceSettingsActions,
      new RegExp(`action:\\s+"${action}"`, "u"),
    );
  }
});
test("Sprint 9 invoice write actions require finance permission and keep writes tenant-scoped", () => {
  for (const functionName of [
    "createInvoice",
    "finalizeInvoiceDraft",
    "markInvoiceSent",
    "markInvoicePaid",
    "cancelInvoice",
    "emailInvoice",
  ]) {
    const body = functionBlock(invoiceActions, functionName);
    assert.match(
      body,
      /requirePermission\("invoices", "write"\)/u,
      `${functionName} should require invoice write permission`,
    );
    assert.doesNotMatch(
      body,
      /data\.tenantId|input\.tenantId/u,
      `${functionName} must not trust tenantId from client input`,
    );
  }

  for (const functionName of ["markInvoiceSent", "markInvoicePaid"]) {
    const body = functionBlock(invoiceActions, functionName);
    assert.match(
      body,
      /getInvoiceAssignmentForCurrentTenant\(invoiceId\)/u,
      `${functionName} should hide cross-tenant invoice ids`,
    );
    assert.match(
      body,
      /eq\(invoicesTable\.tenantId, tenantId\)/u,
      `${functionName} should scope invoice update by tenant`,
    );
    assert.match(
      body,
      /eq\(assignmentsTable\.tenantId, tenantId\)/u,
      `${functionName} should scope assignment update by tenant`,
    );
  }

  const cancel = functionBlock(invoiceActions, "cancelInvoice");
  assert.match(cancel, /requireCurrentTenantId\(\)/u);
  assert.match(
    cancel,
    /cancelInvoiceAndReopenAssignment\(\{\s*tenantId,\s*invoiceId,\s*actorUserId: user\.id,\s*reason: normalizedReason,?\s*\}\)/u,
  );
  assert.doesNotMatch(
    cancel,
    /\.update\(invoicesTable\)|\.update\(assignmentsTable\)/u,
  );
  assert.match(
    reconciliationMigration,
    /WHERE id = p_invoice_id AND tenant_id = p_tenant_id\s+FOR UPDATE/u,
  );
  assert.match(
    reconciliationMigration,
    /WHERE id = invoice_row\.assignment_id AND tenant_id = p_tenant_id\s+FOR UPDATE/u,
  );

  assert.match(
    functionBlock(invoiceActions, "createInvoice"),
    /eq\(invoicesTable\.tenantId, tenantId\)/u,
  );
  assert.match(
    finalization,
    /WHERE id = \$1 AND tenant_id = \$2\s+FOR UPDATE/u,
  );
  assert.match(
    finalization,
    /UPDATE public\.invoices[\s\S]+WHERE id = \$6 AND tenant_id = \$7/u,
  );
});

test("Sprint 9 invoice lifecycle and payment actions are audit logged with tenant context", () => {
  for (const action of [
    "create_invoice",
    "finalize_invoice",
    "mark_invoice_sent",
    "mark_invoice_paid",
    "email_invoice",
    "send_payment_reminder",
  ]) {
    assert.match(
      `${invoiceActions}\n${finalization}`,
      new RegExp(`action:\\s+"${action}"|'${action}'`, "u"),
    );
  }
  assert.match(paymentIntegrity, /'create_durable_collection_payment_intent'/u);
  assert.match(
    paymentIntegrity,
    /INSERT INTO public\.audit_log\(tenant_id, user_id, action/u,
  );

  assert.match(
    reconciliationMigration,
    /'cancel_invoice_and_reopen_assignment'/u,
  );

  for (const functionName of [
    "createInvoice",
    "markInvoiceSent",
    "markInvoicePaid",
    "emailInvoice",
  ]) {
    const body = functionBlock(invoiceActions, functionName);
    assert.match(
      body,
      /auditLogTable/u,
      `${functionName} should write audit log`,
    );
    assert.match(
      body,
      /tenantId,/u,
      `${functionName} audit row should include tenantId`,
    );
  }
  assert.match(reconciliationMigration, /INSERT INTO public\.audit_log/u);
  assert.match(
    reconciliationMigration,
    /INSERT INTO public\.audit_log\(tenant_id[\s\S]*VALUES \(\s*p_tenant_id,/u,
  );
});

test("Sprint 9 direct database exposure is closed and tenant consistency is guarded", () => {
  for (const table of [
    "invoices",
    "tenant_company_settings",
    "invoice_numbering_settings",
    "invoice_number_sequences",
    "invoice_payment_settings",
    "invoice_template_settings",
    "invoice_line_item_snapshots",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`,
        "u",
      ),
    );
    assert.match(migration, new RegExp(`'${table}'`, "u"));
  }

  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM %I/u);
  assert.match(migration, /ARRAY\['anon', 'authenticated'\]/u);
  assert.match(migration, /fieldgrid_validate_invoice_number_sequence_tenant/u);
  assert.match(migration, /settings\.tenant_id = NEW\.tenant_id/u);
  assert.match(migration, /fieldgrid_validate_invoice_line_snapshot_tenant/u);
  assert.match(migration, /invoice\.tenant_id = NEW\.tenant_id/u);
});

test("Sprint 9 public payment redirect cannot cross tenant/payment rows", () => {
  const body = functionBlock(invoicePayRoute, "GET");

  assert.match(
    body,
    /innerJoin\(invoicesTable, eq\(paymentsTable\.invoiceId, invoicesTable\.id\)\)/u,
  );
  assert.match(body, /eq\(paymentsTable\.tenantId, invoicesTable\.tenantId\)/u);
  assert.match(body, /eq\(paymentsTable\.status, "open"\)/u);
  assert.match(body, /eq\(invoicesTable\.status, "sent"\)/u);
});
