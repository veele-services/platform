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

function order(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `${first} should be present`);
  assert.notEqual(secondIndex, -1, `${second} should be present`);
  assert.ok(firstIndex < secondIndex, message);
}

const backofficePdfRoute = read("artifacts/backoffice/src/app/api/invoices/[id]/pdf/route.ts");
const customerPdfRoute = read("artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts");
const backofficePdf = read("artifacts/backoffice/src/lib/invoice-pdf.ts");
const customerPdf = read("artifacts/klant-pwa/src/lib/invoice-pdf.ts");
const invoices = read("artifacts/backoffice/src/app/actions/invoices.ts");

test("current backoffice invoice PDF route is permissioned, tenant sensitive and generated after scoped lookup", () => {
  const body = functionBlock(backofficePdfRoute, "GET");

  assert.match(body, /hasPermission\("invoices", "read"\)/u);
  assert.match(body, /requireCurrentTenantId\(\)/u);
  assert.match(body, /requireSensitiveRuntimeAccess\(\{/u);
  assert.match(body, /scope:\s+"tenant_invoices"/u);
  assert.match(body, /accessLevel:\s+"export"/u);
  assert.match(body, /resourceId:\s+id/u);
  assert.match(body, /getInvoice\(id\)/u);
  assert.match(body, /generateInvoicePdf\(invoice\)/u);
  assert.match(body, /sanitizePdfFilename\(invoice\.invoiceNumber/u);

  order(body, "const invoice = await getInvoice(id);", "const pdfBuffer = await generateInvoicePdf(invoice);", "PDF should only generate after invoice lookup");
});

test("current customer invoice PDF route is customer scoped and uses live line data", () => {
  const body = functionBlock(customerPdfRoute, "GET");

  assert.match(body, /getMyCustomerIdentity\(\)/u);
  assert.match(body, /eq\(invoicesTable\.id, id\)/u);
  assert.match(body, /eq\(invoicesTable\.customerId, identity\.customerId\)/u);
  assert.match(body, /eq\(customersTable\.tenantId, identity\.tenantId\)/u);
  assert.match(body, /eq\(assignmentsTable\.tenantId, identity\.tenantId\)/u);
  assert.match(body, /inArray\(invoicesTable\.status, \["sent", "paid", "cancelled"\]\)/u);
  assert.match(body, /from\(assignmentTasksTable\)/u);
  assert.match(body, /from\(assignmentExtraWorkTable\)/u);
  assert.match(body, /from\(assignmentMaterialUsageTable\)/u);
  assert.match(body, /generateCustomerInvoicePdf\(\{/u);
  assert.match(body, /db\.insert\(auditLogTable\)\.values/u);

  order(body, "if (!invoice) return new NextResponse", "const [taskRows, extraRows, materialRows] = await Promise.all", "line data should load after scoped invoice lookup");
  order(body, "const pdfBuffer = await generateCustomerInvoicePdf({", "await db.insert(auditLogTable).values", "audit should log successful PDF generation");
});

test("current PDF renderers use tenant brand name but not canonical invoice snapshots yet", () => {
  for (const source of [backofficePdf, customerPdf]) {
    assert.match(source, /const brandName = invoice\.brandName\?\.trim\(\) \|\| "Fieldgrid"/u);
    assert.match(source, /drawPdfHeader\(doc, \{/u);
    assert.match(source, /title:\s+"FACTUUR"/u);
    assert.match(source, /reference:\s+invoice\.invoiceNumber/u);
    assert.match(source, /drawPdfRecipientPanel/u);
    assert.match(source, /drawPdfTotalPanel/u);
    assert.match(source, /lineItems\.filter\(\(item\) => item\.invoiceable\)/u);
    assert.doesNotMatch(source, /companySnapshot/u);
    assert.doesNotMatch(source, /paymentSettingsSnapshot/u);
    assert.doesNotMatch(source, /lineItemsSnapshot/u);
    assert.doesNotMatch(source, /qr/i);
  }

  const getInvoice = functionBlock(invoices, "getInvoice");
  assert.match(getInvoice, /calculateInvoiceProposalForAssignment\(row\.assignmentId/u);
  assert.match(getInvoice, /getTenantBranding\(tenantId\)/u);
  assert.match(getInvoice, /lineItems:\s+proposal\.lineItems/u);
});
