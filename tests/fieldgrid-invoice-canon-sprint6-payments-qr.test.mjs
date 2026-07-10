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

const paymentsAction = read("artifacts/backoffice/src/app/actions/payments.ts");
const invoicesAction = read("artifacts/backoffice/src/app/actions/invoices.ts");
const invoicePdf = read("artifacts/backoffice/src/lib/invoice-pdf.ts");
const qrCode = read("artifacts/backoffice/src/lib/qr-code.ts");
const invoicePdfRoute = read("artifacts/backoffice/src/app/api/invoices/[id]/pdf/route.ts");
const invoicePayRoute = read("artifacts/backoffice/src/app/api/invoices/[id]/pay/route.ts");
const invoiceActionsComponent = read("artifacts/backoffice/src/components/invoices/InvoiceActions.tsx");
const invoicesView = read("artifacts/backoffice/src/components/invoices/InvoicesView.tsx");
const invoiceSettingsView = read("artifacts/backoffice/src/components/settings/InvoiceSettingsView.tsx");

test("Sprint 6 gates Mollie payment creation behind tenant invoice payment settings", () => {
  assert.match(paymentsAction, /invoicePaymentSettingsTable/u);
  assert.match(invoicesAction, /invoicePaymentSettingsTable/u);

  const singlePayment = functionBlock(paymentsAction, "createMolliePayment");
  assert.match(singlePayment, /requireMolliePaymentsEnabled\(tenantId\)/u);
  assert.match(paymentsAction, /Mollie is niet actief in factuurinstellingen/u);
  assert.match(singlePayment, /process\.env\.MOLLIE_API_KEY/u);
  assert.ok(
    singlePayment.indexOf("requireMolliePaymentsEnabled(tenantId)") < singlePayment.indexOf("process.env.MOLLIE_API_KEY"),
    "tenant settings should be checked before reading the Mollie secret",
  );

  const collectivePayment = functionBlock(invoicesAction, "createCollectiveInvoicePayment");
  assert.match(collectivePayment, /requireMolliePaymentsEnabled\(tenantId\)/u);
  assert.match(collectivePayment, /process\.env\.MOLLIE_API_KEY/u);
  assert.ok(
    collectivePayment.indexOf("requireMolliePaymentsEnabled(tenantId)") < collectivePayment.indexOf("process.env.MOLLIE_API_KEY"),
    "collective payments should also be coupled to invoice payment settings",
  );
});

test("Sprint 6 renders configured payment link and server-side QR in backoffice PDFs", () => {
  assert.match(qrCode, /export function createQrMatrix/u);
  assert.doesNotMatch(qrCode, /https:\/\/api\.qr/u);
  assert.doesNotMatch(qrCode, /chart\.googleapis/u);

  assert.match(invoicePdf, /import \{ createQrMatrix \} from "@\/lib\/qr-code"/u);
  assert.match(invoicePdf, /showPaymentLinkOnInvoice/u);
  assert.match(invoicePdf, /showPaymentQrOnInvoice/u);
  assert.match(invoicePdf, /drawPaymentBlock\(doc, invoice, y, options\.paymentQrUrl\)/u);
  assert.match(invoicePdf, /link: paymentUrl/u);
  assert.match(invoicePdf, /createQrMatrix\(value\)/u);

  const pdfRoute = functionBlock(invoicePdfRoute, "GET");
  assert.match(pdfRoute, /\/api\/invoices\/\$\{invoice\.id\}\/pay/u);
  assert.match(pdfRoute, /generateInvoicePdf\(invoice, \{ paymentQrUrl \}\)/u);

  const payRoute = functionBlock(invoicePayRoute, "GET");
  assert.match(payRoute, /eq\(paymentsTable\.status, "open"\)/u);
  assert.match(payRoute, /eq\(invoicesTable\.status, "sent"\)/u);
  assert.match(payRoute, /NextResponse\.redirect\(payment\.checkoutUrl, 302\)/u);
});

test("Sprint 6 keeps Mollie secrets out of client-facing invoice files", () => {
  for (const source of [invoicePdf, invoicePdfRoute, invoicePayRoute, invoiceActionsComponent, invoicesView, invoiceSettingsView]) {
    assert.doesNotMatch(source, /MOLLIE_API_KEY/u);
    assert.doesNotMatch(source, /mollieKey/u);
  }

  const getInvoice = functionBlock(invoicesAction, "getInvoice");
  assert.match(getInvoice, /paymentSettingsSnapshotJson/u);
  assert.match(getInvoice, /paymentSettings,/u);
  assert.match(getInvoice, /paymentUrl,/u);
});
