import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function section(source, functionName) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const next = source.indexOf(
    "\nexport async function ",
    start + marker.length,
  );
  return source.slice(start, next === -1 ? source.length : next);
}

const invoices = read("artifacts/backoffice/src/app/actions/invoices.ts");
const paymentIntegrity = read("lib/db/src/payment-integrity.ts");

test("backoffice invoice actions expose a tenant-scoped invoice helper", () => {
  assert.match(invoices, /requireCurrentTenantId/u);
  assert.match(invoices, /getInvoiceAssignmentForCurrentTenant/u);
  assert.match(
    invoices,
    /innerJoin\(\s*assignmentsTable,\s*eq\(invoicesTable\.assignmentId, assignmentsTable\.id\),?\s*\)/u,
  );
  assert.match(
    invoices,
    /where\(\s*and\(\s*eq\(invoicesTable\.id, invoiceId\),\s*eq\(assignmentsTable\.tenantId, tenantId\),?\s*\),?\s*\)/u,
  );

  const tenantChecks =
    invoices.match(/eq\(assignmentsTable\.tenantId, tenantId\)/gu) ?? [];
  assert.ok(
    tenantChecks.length >= 14,
    "invoice reads and writes should filter through assignments.tenantId",
  );
});
test("invoice read paths include tenant filters", () => {
  for (const functionName of [
    "listInvoices",
    "getInvoice",
    "getAssignmentInvoiceData",
    "getOutstandingInvoicesCount",
    "getOverdueInvoicesCount",
    "sendPaymentReminders",
    "getInvoiceSummary",
    "listCollectiveInvoiceCandidates",
    "getInvoiceForAssignment",
    "listInvoicesForCustomer",
  ]) {
    const body = section(invoices, functionName);
    assert.match(
      body,
      /requireCurrentTenantId\(\)/u,
      `${functionName} should resolve the current tenant`,
    );
    assert.match(
      body,
      /eq\(assignmentsTable\.tenantId, tenantId\)/u,
      `${functionName} should filter by assignment tenant`,
    );
  }
});

test("direct invoice-id actions verify tenant scope before writes", () => {
  for (const functionName of [
    "getInvoiceStatusHistory",
    "markInvoiceSent",
    "markInvoicePaid",
  ]) {
    const body = section(invoices, functionName);
    assert.match(
      body,
      /getInvoiceAssignmentForCurrentTenant\(invoiceId\)/u,
      `${functionName} should verify invoice tenant scope`,
    );
    assert.match(
      body,
      /if \(!invoice\) return/u,
      `${functionName} should hide cross-tenant invoice ids`,
    );
  }

  const cancelBody = section(invoices, "cancelInvoice");
  assert.match(cancelBody, /requireCurrentTenantId\(\)/u);
  assert.match(cancelBody, /cancelInvoiceAndReopenAssignment\(\{/u);
  assert.match(
    cancelBody,
    /tenantId,\s*invoiceId,\s*actorUserId: user\.id,\s*reason: normalizedReason/u,
  );

  const emailBody = section(invoices, "emailInvoice");
  assert.match(
    emailBody,
    /getInvoice\(invoiceId\)/u,
    "emailInvoice should reuse tenant-scoped invoice lookup",
  );
});

test("collective invoice payments stay tenant-scoped", () => {
  const body = section(invoices, "createCollectiveInvoicePayment");

  assert.match(body, /requireCurrentTenantId\(\)/u);
  assert.match(
    body,
    /where\(\s*and\(\s*inArray\(invoicesTable\.id, invoiceIds\),\s*eq\(assignmentsTable\.tenantId, tenantId\),?\s*\),?\s*\)/u,
  );
  assert.match(
    body,
    /innerJoin\(\s*assignmentsTable,\s*eq\(invoicesTable\.assignmentId, assignmentsTable\.id\),?\s*\)/u,
  );
  assert.match(body, /prepareCollectionPaymentIntent\(\{/u);
  assert.match(
    paymentIntegrity,
    /WHERE id = ANY\(\$1::uuid\[\]\) AND tenant_id = \$2 AND customer_id = \$3/u,
  );
  assert.match(paymentIntegrity, /ORDER BY id FOR UPDATE/u);
});
