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
  const next = source.indexOf("\nexport async function ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const route = read("artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts");

test("customer invoice PDF route is customer and tenant scoped", () => {
  const body = functionBlock(route, "GET");

  assert.match(route, /auditLogTable/u);
  assert.match(body, /getMyCustomerIdentity\(\)/u);
  assert.match(body, /eq\(invoicesTable\.id, id\)/u);
  assert.match(body, /eq\(invoicesTable\.customerId, identity\.customerId\)/u);
  assert.match(body, /eq\(customersTable\.tenantId, identity\.tenantId\)/u);
  assert.match(body, /eq\(assignmentsTable\.customerId, identity\.customerId\)/u);
  assert.match(body, /eq\(assignmentsTable\.tenantId, identity\.tenantId\)/u);
  assert.match(body, /inArray\(invoicesTable\.status, \["sent", "paid", "cancelled"\]\)/u);
});

test("customer invoice PDF downloads are audited before response", () => {
  const body = functionBlock(route, "GET");

  assert.match(body, /generateCustomerInvoicePdf\(/u);
  assert.match(body, /db\.insert\(auditLogTable\)\.values/u);
  assert.match(body, /userId:\s+identity\.userId/u);
  assert.match(body, /action:\s+"customer_download_invoice_pdf"/u);
  assert.match(body, /resource:\s+"invoices"/u);
  assert.match(body, /resourceId:\s+invoice\.id/u);
  assert.match(
    body,
    /const invoiceNumber = displayInvoiceNumber\(\s*invoice\.invoiceNumber,\s*invoice\.id\.slice\(0, 8\),?\s*\)/u,
  );
  assert.match(body, /invoiceNumber,/u);
  assert.match(body, /assignmentId:\s+invoice\.assignmentId/u);
  assert.match(body, /customerId:\s+identity\.customerId/u);
  assert.match(body, /tenantId:\s+identity\.tenantId/u);

  const generatePdfIndex = body.search(
    /generateCustomerInvoicePdf\(\s*\{/u,
  );
  assert.ok(
    body.indexOf("if (!invoice) return new NextResponse") < generatePdfIndex,
    "PDF generation should only happen after the scoped invoice lookup succeeds",
  );
  assert.ok(
    generatePdfIndex < body.indexOf("db.insert(auditLogTable).values"),
    "audit should only log successful PDF generation",
  );
  assert.ok(
    body.indexOf("db.insert(auditLogTable).values") < body.lastIndexOf("return new NextResponse"),
    "audit should be written before the PDF response is returned",
  );
});
