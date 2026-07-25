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

const invoices = read("artifacts/backoffice/src/app/actions/invoices.ts");
const payments = read("artifacts/backoffice/src/app/actions/payments.ts");
const providerAdapter = read("lib/db/src/mollie-payment-provider.ts");
const invoiceActions = read(
  "artifacts/backoffice/src/components/invoices/InvoiceActions.tsx",
);
const createInvoiceForm = read(
  "artifacts/backoffice/src/components/invoices/CreateInvoiceForm.tsx",
);

test("current createInvoice baseline creates a tenant-scoped draft and advances the assignment", () => {
  const body = functionBlock(invoices, "createInvoice");

  assert.match(body, /requirePermission\("invoices", "write"\)/u);
  assert.match(body, /requireCurrentTenantId\(\)/u);
  assert.match(body, /parseFloat\(data\.amount/u);
  assert.match(body, /parseFloat\(data\.vatPercentage/u);
  assert.match(body, /getDefaultInvoiceDueDate\(tenantId\)/u);
  assert.match(
    body,
    /defaultPaymentTermDays: defaultDueDate\?\.paymentTermDays/u,
  );
  assert.match(
    body,
    /eq\(assignmentsTable\.id, assignmentId\),\s*eq\(assignmentsTable\.tenantId, tenantId\)/u,
  );
  assert.match(
    body,
    /inArray\(invoicesTable\.status, \["draft", "sent", "paid"\]\)/u,
  );
  assert.match(body, /allowedNext\.includes\("invoice_ready"\)/u);
  assert.match(body, /status:\s+"draft"/u);
  assert.match(body, /vatAmount:\s+vatAmount\.toFixed\(2\)/u);
  assert.match(body, /totalAmount:\s+totalAmount\.toFixed\(2\)/u);
  assert.match(
    body,
    /\.set\(\{ status: "invoice_ready", updatedAt: new Date\(\) \}\)/u,
  );
  assert.match(body, /action:\s+"create_invoice"/u);

  const valuesStart = body.indexOf(".values({");
  const returningStart = body.indexOf(
    ".returning({ id: invoicesTable.id })",
    valuesStart,
  );
  const insertValues = body.slice(valuesStart, returningStart);
  assert.doesNotMatch(
    insertValues,
    /invoiceNumber/u,
    "current create flow leaves invoice number to schema/database behavior",
  );
  assert.doesNotMatch(
    insertValues,
    /tenantId/u,
    "current create flow relies on tenant trigger/server-side tenant derivation",
  );
});
test("current status actions preserve the existing draft to sent to paid/cancelled workflow", () => {
  const sent = functionBlock(invoices, "markInvoiceSent");
  assert.match(sent, /getInvoiceAssignmentForCurrentTenant\(invoiceId\)/u);
  assert.match(sent, /invoice\.status !== "draft"/u);
  assert.match(sent, /\.set\(\{ status: "sent", updatedAt: new Date\(\) \}\)/u);
  assert.match(
    sent,
    /\.set\(\{ status: "invoiced", updatedAt: new Date\(\) \}\)/u,
  );
  assert.match(sent, /action:\s+"mark_invoice_sent"/u);
  assert.match(sent, /eventKey:\s+"invoice_sent"/u);

  const paid = functionBlock(invoices, "markInvoicePaid");
  assert.match(paid, /getInvoiceAssignmentForCurrentTenant\(invoiceId\)/u);
  assert.match(paid, /invoice\.status !== "sent"/u);
  assert.match(paid, /db\.transaction/u);
  assert.match(paid, /FOR UPDATE/u);
  assert.match(paid, /tx\s*\.insert\(paymentsTable\)/u);
  assert.match(paid, /tx\s*\.insert\(paymentAllocationsTable\)/u);
  assert.match(paid, /status:\s*"paid",\s*paymentStatus:\s*"paid"/u);
  assert.match(
    paid,
    /tx\s*\.update\(assignmentsTable\)\s*\.set\(\{ status: "closed", updatedAt: new Date\(\) \}\)/u,
  );
  assert.match(paid, /action:\s+"mark_invoice_paid"/u);
  assert.match(paid, /eventKey:\s+"invoice_paid"/u);

  const cancelled = functionBlock(invoices, "cancelInvoice");
  assert.match(cancelled, /requireCurrentTenantId\(\)/u);
  assert.match(cancelled, /cancelInvoiceAndReopenAssignment\(\{/u);
  assert.match(
    cancelled,
    /tenantId,\s*invoiceId,\s*actorUserId: user\.id,\s*reason: normalizedReason/u,
  );
  assert.match(cancelled, /cancellation\.invoiceStatus !== "cancelled"/u);
  assert.match(
    cancelled,
    /cancellation\.assignmentStatus !== "report_approved"/u,
  );
  assert.doesNotMatch(
    cancelled,
    /\.update\(invoicesTable\)|\.update\(assignmentsTable\)/u,
  );
});

test("current invoice email and Mollie flows stay behind sent invoices", () => {
  const email = functionBlock(invoices, "emailInvoice");
  assert.match(email, /getInvoice\(invoiceId\)/u);
  assert.match(email, /invoice\.status !== "sent"/u);
  assert.match(
    email,
    /getOpenPaymentCheckoutUrlForCurrentTenant\(invoiceId\)/u,
  );
  assert.match(email, /generateInvoicePdf\(invoice\)/u);
  assert.match(email, /buildInvoiceEmail\(/u);
  assert.match(email, /sendEmailWithResult\(/u);
  assert.match(
    email,
    /attachments:\s*\[\s*\{ filename: `\$\{invoice\.invoiceNumber\}\.pdf`, content: pdfBuffer \},?\s*\]/u,
  );
  assert.match(email, /purpose:\s+"invoice_available"/u);
  assert.match(email, /action:\s+"email_invoice"/u);

  const mollie = functionBlock(payments, "createMolliePayment");
  assert.match(mollie, /requirePermission\("invoices", "write"\)/u);
  assert.match(
    mollie,
    /eq\(invoicesTable\.id, invoiceId\),\s*eq\(invoicesTable\.tenantId, tenantId\)/u,
  );
  assert.match(mollie, /invoice\.status !== "sent"/u);
  assert.match(mollie, /prepareDirectPaymentIntent/u);
  assert.match(mollie, /createProviderPayment/u);
  assert.match(mollie, /requestKey: intent\.providerRequestKey/u);
  assert.match(providerAdapter, /process\.env\.MOLLIE_API_KEY/u);
  assert.match(providerAdapter, /"Idempotency-Key": input\.requestKey/u);
  assert.match(
    mollie,
    /description: `Factuur \$\{displayInvoiceNumber\(invoice\.invoiceNumber, invoice\.id\.slice\(0, 8\)\)\}`/u,
  );
  assert.ok(
    mollie.indexOf("prepareDirectPaymentIntent") <
      mollie.indexOf("createProviderPayment"),
    "durable payment intent must exist before the provider call",
  );
  assert.match(mollie, /bindProviderPayment/u);
});

test("current invoice UI exposes the expected action entry points", () => {
  assert.match(
    createInvoiceForm,
    /function defaultDueDate\(paymentTermDays = 30\)/u,
  );
  assert.match(createInvoiceForm, /defaultPaymentTermDays = 30/u);
  assert.match(createInvoiceForm, /d\.setDate\(d\.getDate\(\) \+ days\)/u);
  assert.match(
    createInvoiceForm,
    /createInvoice\(assignmentId,\s*\{\s*amount,\s*vatPercentage,\s*dueDate,\s*notes,\s*\}\)/u,
  );
  assert.match(
    createInvoiceForm,
    /router\.push\(`\/invoices\/\$\{invoiceId\}`\)/u,
  );

  assert.match(invoiceActions, /status === "draft"/u);
  assert.match(invoiceActions, /finalizeInvoiceDraft\(invoiceId\)/u);
  assert.match(invoiceActions, /Finaliseren/u);
  assert.match(invoiceActions, /Verzenden/u);
  assert.match(invoiceActions, /markInvoiceSent\(invoiceId\)/u);
  assert.match(invoiceActions, /status === "sent"/u);
  assert.match(invoiceActions, /createMolliePayment\(invoiceId\)/u);
  assert.match(invoiceActions, /markInvoicePaid\(invoiceId\)/u);
  assert.match(invoiceActions, /emailInvoice\(invoiceId\)/u);
  assert.match(invoiceActions, /cancelInvoice\(invoiceId, reason\)/u);

  const cancelHandlerStart = invoiceActions.indexOf(
    "async function handleCancelInvoice()",
  );
  const cancelHandlerEnd = invoiceActions.indexOf(
    "async function handleCreatePaymentLink()",
    cancelHandlerStart,
  );
  assert.notEqual(cancelHandlerStart, -1);
  assert.ok(cancelHandlerEnd > cancelHandlerStart);
  const cancelHandler = invoiceActions.slice(
    cancelHandlerStart,
    cancelHandlerEnd,
  );
  assert.match(cancelHandler, /if \(!result\.success\)/u);
  assert.match(cancelHandler, /window\.location\.reload\(\)/u);
  assert.doesNotMatch(cancelHandler, /router\.refresh\(\)/u);
});
