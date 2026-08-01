import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

const invoices = read("artifacts/backoffice/src/app/actions/invoices.ts");
const backofficePdf = read("artifacts/backoffice/src/lib/invoice-pdf.ts");
const customerPdf = read("artifacts/klant-pwa/src/lib/invoice-pdf.ts");
const customerPdfRoute = read(
  "artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts",
);
const backofficePdfRoute = read(
  "artifacts/backoffice/src/app/api/invoices/[id]/pdf/route.ts",
);
const customerPayRoutePath =
  "artifacts/klant-pwa/src/app/api/factuur/[id]/pay/route.ts";
const customerPayRoute = read(customerPayRoutePath);

test("backoffice invoice detail uses invoice snapshots before live tenant settings", () => {
  const getInvoice = functionBlock(invoices, "getInvoice");

  assert.match(invoices, /invoiceLineItemSnapshotsTable/u);
  assert.match(invoices, /getInvoicePdfLineItems/u);
  assert.match(
    getInvoice,
    /companySnapshotJson:\s+invoicesTable\.companySnapshotJson/u,
  );
  assert.match(
    getInvoice,
    /paymentSettingsSnapshotJson:\s+invoicesTable\.paymentSettingsSnapshotJson/u,
  );
  assert.match(
    getInvoice,
    /templateSnapshotJson:\s+invoicesTable\.templateSnapshotJson/u,
  );
  assert.match(
    getInvoice,
    /row\.companySnapshotJson\s+\?\s+normalizeInvoicePdfCompany\(row\.companySnapshotJson\)/u,
  );
  assert.match(
    getInvoice,
    /row\.templateSnapshotJson\s+\?\s+normalizeInvoicePdfTemplate\(row\.templateSnapshotJson\)/u,
  );
  assert.match(
    getInvoice,
    /row\.paymentSettingsSnapshotJson\s+\?\s+normalizeInvoicePdfPaymentSettings\(row\.paymentSettingsSnapshotJson\)/u,
  );
  assert.match(getInvoice, /companySnapshot,/u);
  assert.match(getInvoice, /templateSettings,/u);
  assert.match(getInvoice, /lineItems,/u);
});

test("PDF renderers are tenant branded, snapshot driven and do not render arbitrary HTML", () => {
  for (const source of [backofficePdf, customerPdf]) {
    assert.match(source, /companyDisplayName/u);
    assert.match(source, /companySnapshot/u);
    assert.match(source, /templateSettings/u);
    assert.match(source, /drawCompanyPanel/u);
    assert.match(source, /fetchPdfLogoBuffer/u);
    assert.match(source, /content-type/u);
    assert.match(source, /1_500_000/u);
    assert.match(source, /renderPaymentInstruction/u);
    assert.match(source, /footerText/u);
    assert.match(source, /safePdfColor/u);
    assert.match(source, /drawPdfHeader\(doc, \{/u);
    assert.match(source, /primaryColor:\s+primary/u);
    assert.match(source, /accentColor:\s+accent/u);
    assert.doesNotMatch(
      source,
      /dangerouslySetInnerHTML|innerHTML|DOMParser|sanitize-html|<script/iu,
    );
  }
});

test("customer PDF route uses immutable snapshots, audited download and customer scoped payment QR", () => {
  const body = functionBlock(customerPdfRoute, "GET");

  assert.match(body, /invoiceLineItemSnapshotsTable/u);
  assert.match(body, /tenantCompanySettingsTable/u);
  assert.match(body, /invoiceTemplateSettingsTable/u);
  assert.match(body, /invoicePaymentSettingsTable/u);
  assert.match(body, /paymentsTable/u);
  assert.match(body, /companySnapshotJson/u);
  assert.match(body, /paymentSettingsSnapshotJson/u);
  assert.match(body, /templateSnapshotJson/u);
  assert.match(body, /snapshotRows\.length > 0/u);
  assert.match(body, /paymentQrUrl/u);
  assert.match(body, /\/api\/factuur\/\$\{invoice\.id\}\/pay/u);
  assert.match(body, /generateCustomerInvoicePdf\(\s*\{/u);
  assert.match(body, /\},\s*\{\s*paymentQrUrl\s*\},?\s*\)/u);
  assert.match(body, /new NextResponse\(new Uint8Array\(pdfBuffer\)/u);
  assertOrder(
    body,
    "if (!invoice) return new NextResponse",
    "snapshotRows,",
    "snapshot/live data should load only after scoped invoice lookup",
  );
  assertOrder(
    body,
    "const pdfBuffer = await generateCustomerInvoicePdf(",
    "await db.insert(auditLogTable).values",
    "audit should log only successful PDF renders",
  );
});

test("PDF download and payment redirect routes return binary/redirect responses", () => {
  assert.match(
    backofficePdfRoute,
    /new NextResponse\(new Uint8Array\(pdfBuffer\)/u,
  );
  assert.match(
    customerPdfRoute,
    /new NextResponse\(new Uint8Array\(pdfBuffer\)/u,
  );
  assert.ok(existsSync(new URL(`../${customerPayRoutePath}`, import.meta.url)));
  assert.match(customerPayRoute, /getMyCustomerIdentity\(\)/u);
  assert.match(
    customerPayRoute,
    /eq\(invoicesTable\.customerId, identity\.customerId\)/u,
  );
  assert.match(
    customerPayRoute,
    /eq\(invoicesTable\.tenantId, identity\.tenantId\)/u,
  );
  assert.match(
    customerPayRoute,
    /NextResponse\.redirect\(payment\.checkoutUrl, 302\)/u,
  );
});

function assertOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `${first} should be present`);
  assert.notEqual(secondIndex, -1, `${second} should be present`);
  assert.ok(firstIndex < secondIndex, message);
}
