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
  const next = source.indexOf("\nexport async function ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const invoices = read("artifacts/backoffice/src/app/actions/invoices.ts");

test("backoffice invoice actions expose a tenant-scoped invoice helper", () => {
  assert.match(invoices, /requireCurrentTenantId/u);
  assert.match(invoices, /getInvoiceAssignmentForCurrentTenant/u);
  assert.match(invoices, /innerJoin\(assignmentsTable, eq\(invoicesTable\.assignmentId, assignmentsTable\.id\)\)/u);
  assert.match(invoices, /where\(and\(eq\(invoicesTable\.id, invoiceId\), eq\(assignmentsTable\.tenantId, tenantId\)\)\)/u);

  const tenantChecks = invoices.match(/eq\(assignmentsTable\.tenantId, tenantId\)/gu) ?? [];
  assert.ok(tenantChecks.length >= 14, "invoice reads and writes should filter through assignments.tenantId");
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
    assert.match(body, /requireCurrentTenantId\(\)/u, `${functionName} should resolve the current tenant`);
    assert.match(body, /eq\(assignmentsTable\.tenantId, tenantId\)/u, `${functionName} should filter by assignment tenant`);
  }
});

test("direct invoice-id actions verify tenant scope before writes", () => {
  for (const functionName of ["getInvoiceStatusHistory", "markInvoiceSent", "markInvoicePaid", "cancelInvoice"]) {
    const body = section(invoices, functionName);
    assert.match(body, /getInvoiceAssignmentForCurrentTenant\(invoiceId\)/u, `${functionName} should verify invoice tenant scope`);
    assert.match(body, /if \(!invoice\) return/u, `${functionName} should hide cross-tenant invoice ids`);
  }

  const emailBody = section(invoices, "emailInvoice");
  assert.match(emailBody, /getInvoice\(invoiceId\)/u, "emailInvoice should reuse tenant-scoped invoice lookup");
});

test("collective invoice payments stay tenant-scoped", () => {
  const body = section(invoices, "createCollectiveInvoicePayment");

  assert.match(body, /requireCurrentTenantId\(\)/u);
  assert.match(body, /where\(and\(inArray\(invoicesTable\.id, invoiceIds\), eq\(assignmentsTable\.tenantId, tenantId\)\)\)/u);
  assert.match(body, /innerJoin\(assignmentsTable, eq\(invoicesTable\.assignmentId, assignmentsTable\.id\)\)/u);
  assert.match(body, /inArray\(customerPaymentBatchItemsTable\.invoiceId, invoiceIds\)/u);
});
