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
const backofficePdfBridgeRoute = read("artifacts/backoffice/src/app/backoffice-api/invoices/[id]/pdf/route.ts");
const backofficeInvoicesView = read("artifacts/backoffice/src/components/invoices/InvoicesView.tsx");
const apiBackofficeProxy = read("artifacts/api-server/src/routes/platform-backoffice.ts");
const customerPdfRoute = read("artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts");
const backofficePdf = read("artifacts/backoffice/src/lib/invoice-pdf.ts");
const customerPdf = read("artifacts/klant-pwa/src/lib/invoice-pdf.ts");
const invoices = read("artifacts/backoffice/src/app/actions/invoices.ts");

test("current backoffice invoice PDF route is permissioned, tenant sensitive and generated after scoped lookup", () => {
  const body = functionBlock(backofficePdfRoute, "GET");

  assert.match(body, /hasPermissionFromRequest\(request,\s*"invoices",\s*"read"\)/u);
  assert.match(body, /requireCurrentTenantIdFromRequest\(request\)/u);
  assert.match(body, /requireSensitiveRuntimeAccessFromRequest\(request,\s*\{/u);
  assert.match(body, /scope:\s+"tenant_invoices"/u);
  assert.match(body, /accessLevel:\s+"export"/u);
  assert.match(body, /resourceId:\s+id/u);
  assert.match(body, /getInvoice\(id,\s*\{ request \}\)/u);
  assert.match(body, /paymentQrUrl/u);
  assert.match(body, /\/backoffice-api\/invoices\/\$\{invoice\.id\}\/pay/u);
  assert.match(body, /generateInvoicePdf\(invoice, \{ paymentQrUrl \}\)/u);
  assert.match(body, /sanitizePdfFilename\(invoice\.invoiceNumber/u);

  order(body, "const invoice = await getInvoice(id, { request });", "const pdfBuffer = await generateInvoicePdf(invoice, { paymentQrUrl });", "PDF should only generate after invoice lookup");
  assert.match(backofficePdfBridgeRoute, /@\/app\/api\/invoices\/\[id\]\/pdf\/route/u);
  assert.match(backofficeInvoicesView, /\/backoffice-api\/invoices\/\$\{row\.id\}\/pdf/u);
  assert.doesNotMatch(backofficeInvoicesView, /\/api\/invoices\/\$\{row\.id\}\/pdf/u);
  assert.match(apiBackofficeProxy, /\["\/invoices", "\/quotes", "\/reports", "\/google-maps"\]/u);
  assert.match(apiBackofficeProxy, /replace\(\s*\/\^\\\/api\(\?=\\\/\)\/u,\s*"\/backoffice-api"\s*\)/u);
  assert.match(apiBackofficeProxy, /"\/backoffice-api"/u);
  assert.match(apiBackofficeProxy, /res\.redirect\(307, target\)/u);
});

test("current customer invoice PDF route is customer scoped and prefers immutable snapshots", () => {
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
  assert.match(body, /invoiceLineItemSnapshotsTable/u);
  assert.match(body, /companySnapshotJson/u);
  assert.match(body, /paymentSettingsSnapshotJson/u);
  assert.match(body, /templateSnapshotJson/u);
  assert.match(body, /snapshotRows\.length > 0/u);
  assert.match(body, /paymentQrUrl/u);
  assert.match(body, /\/api\/factuur\/\$\{invoice\.id\}\/pay/u);
  assert.match(body, /generateCustomerInvoicePdf\(\{/u);
  assert.match(body, /db\.insert\(auditLogTable\)\.values/u);

  order(body, "if (!invoice) return new NextResponse", "const [snapshotRows, taskRows, extraRows, materialRows", "line data should load after scoped invoice lookup");
  order(body, "const pdfBuffer = await generateCustomerInvoicePdf({", "await db.insert(auditLogTable).values", "audit should log successful PDF generation");
});

test("current PDF renderers use tenant-branded snapshots and payment blocks", () => {
  for (const source of [backofficePdf, customerPdf]) {
    assert.match(source, /companyDisplayName/u);
    assert.match(source, /companySnapshot/u);
    assert.match(source, /templateSettings/u);
    assert.match(source, /safePdfColor/u);
    assert.match(source, /drawPdfHeader\(doc, \{/u);
    assert.match(source, /title:\s+"FACTUUR"/u);
    assert.match(source, /reference:\s+invoice\.invoiceNumber/u);
    assert.match(source, /drawCompanyPanel/u);
    assert.match(source, /drawPdfRecipientPanel/u);
    assert.match(source, /drawPdfTotalPanel/u);
    assert.match(source, /renderPaymentInstruction/u);
    assert.match(source, /footerText/u);
    assert.match(source, /lineItems\.filter\(\(item\) => item\.invoiceable\)/u);
    assert.doesNotMatch(source, /lineItemsSnapshot/u);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML|<script|DOMParser/u);
  }

  assert.match(backofficePdf, /createQrMatrix/u);
  assert.match(backofficePdf, /drawPaymentBlock/u);
  assert.match(backofficePdf, /showPaymentLinkOnInvoice/u);
  assert.match(backofficePdf, /showPaymentQrOnInvoice/u);
  assert.match(customerPdf, /createQrMatrix/u);
  assert.match(customerPdf, /drawPaymentBlock/u);
  assert.match(customerPdf, /showPaymentLinkOnInvoice/u);
  assert.match(customerPdf, /showPaymentQrOnInvoice/u);

  const getInvoice = functionBlock(invoices, "getInvoice");
  assert.match(getInvoice, /companySnapshotJson/u);
  assert.match(getInvoice, /templateSnapshotJson/u);
  assert.match(getInvoice, /paymentSettingsSnapshotJson/u);
  assert.match(getInvoice, /getInvoicePdfLineItems/u);
  assert.match(getInvoice, /getInvoiceCompanySettingsForTenant\(tenantId\)/u);
  assert.match(getInvoice, /getInvoiceTemplateSettingsForTenant\(tenantId\)/u);
  assert.match(getInvoice, /getInvoicePaymentSettingsForTenant\(tenantId\)/u);
  assert.match(getInvoice, /paymentUrl/u);
  assert.match(getInvoice, /getTenantBranding\(tenantId\)/u);
  assert.match(getInvoice, /companySnapshot,/u);
  assert.match(getInvoice, /templateSettings,/u);
  assert.match(getInvoice, /lineItems,/u);
});
