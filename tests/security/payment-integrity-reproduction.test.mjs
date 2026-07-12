import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const exportMarker = `export async function ${functionName}`;
  const asyncMarker = `async function ${functionName}`;
  const marker = source.includes(exportMarker) ? exportMarker : asyncMarker;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextExport = source.indexOf("\nexport async function ", start + marker.length);
  const nextLocal = source.indexOf("\nasync function ", start + marker.length);
  const nextCandidates = [nextExport, nextLocal].filter((value) => value !== -1);
  const next = nextCandidates.length ? Math.min(...nextCandidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

function assertBefore(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `${first} should exist`);
  assert.notEqual(secondIndex, -1, `${second} should exist`);
  assert.ok(firstIndex < secondIndex, message);
}

const backofficePayments = read("artifacts/backoffice/src/app/actions/payments.ts");
const backofficeInvoices = read("artifacts/backoffice/src/app/actions/invoices.ts");
const customerPayments = read("artifacts/klant-pwa/src/actions/payments.ts");
const webhook = read("artifacts/api-server/src/routes/webhooks.ts");
const paymentsSchema = read("lib/db/src/schema/payments.ts");
const batchSchema = read("lib/db/src/schema/customer-payment-batches.ts");
const paymentTenantMigration = read("lib/db/migrations/063_payments_batches_audit_tenant_scope.sql");

test("REPRO P0-FIN-001: provider payment is created before the local payment row is durable", () => {
  const backofficeCreate = functionBlock(backofficePayments, "createMolliePayment");
  assertBefore(
    backofficeCreate,
    'fetch("https://api.mollie.com/v2/payments"',
    "await db.insert(paymentsTable).values",
    "backoffice createMolliePayment issues the provider request before local durability",
  );
  assert.match(backofficeCreate, /catch \{\s*return \{ success: false, message: "Betaling aanmaken in database mislukt\." \};\s*\}/u);
  assert.doesNotMatch(backofficeCreate, /\.transaction\(/u);
  assert.doesNotMatch(backofficeCreate, /idempotency/i);

  const customerRequest = functionBlock(customerPayments, "createMolliePaymentRequest");
  const customerCreate = functionBlock(customerPayments, "createCustomerInvoicePayment");
  assert.match(customerRequest, /fetch\("https:\/\/api\.mollie\.com\/v2\/payments"/u);
  assertBefore(
    customerCreate,
    "const payment = await createMolliePaymentRequest",
    "await db.insert(paymentsTable).values",
    "customer payment initiation also receives provider success before the local row is inserted",
  );
  assert.doesNotMatch(customerCreate, /\.transaction\(/u);
});

test("REPRO P0-FIN-002: concurrent payment clicks can pass the preflight open-payment check", () => {
  const customerCreate = functionBlock(customerPayments, "createCustomerInvoicePayment");
  assert.match(customerCreate, /where\(and\(eq\(paymentsTable\.invoiceId, invoice\.id\), eq\(paymentsTable\.status, "open"\)\)\)/u);
  assertBefore(
    customerCreate,
    "const [existing] = await db",
    "const payment = await createMolliePaymentRequest",
    "the duplicate-click guard is a read-before-provider-call preflight",
  );
  assert.doesNotMatch(customerCreate, /\.transaction\(/u);
  assert.doesNotMatch(customerCreate, /onConflict/u);

  assert.match(paymentsSchema, /molliePaymentId: varchar\("mollie_payment_id"[\s\S]+\.unique\(\)/u);
  assert.doesNotMatch(paymentsSchema, /uniqueIndex\([^)]*invoice[^)]*status/iu);
  assert.doesNotMatch(paymentsSchema, /unique\([^)]*invoice[^)]*status/iu);
});

test("REPRO P0-FIN-003: Mollie webhook accepts missing secret and suppresses retryable failures with 200", () => {
  assert.match(webhook, /if \(!webhookSecret\) \{[\s\S]+accepting Mollie webhook without validation/u);
  assert.match(webhook, /if \(!mollieKey\) \{[\s\S]+res\.status\(200\)\.send\("ok"\)/u);
  assert.match(webhook, /if \(!response\.ok\) \{[\s\S]+res\.status\(200\)\.send\("ok"\)/u);
  assert.match(webhook, /catch \(err\) \{[\s\S]+Unexpected error in Mollie webhook handler[\s\S]+\}/u);
  assert.match(webhook, /Always return 200/u);
});

test("REPRO P0-FIN-004: webhook trusts local amount and does not verify provider amount, currency or metadata", () => {
  assert.match(webhook, /type MolliePayment = \{ id: string; status: string; paidAt\?: string \}/u);
  assert.doesNotMatch(webhook, /data\.amount/u);
  assert.doesNotMatch(webhook, /data\.currency/u);
  assert.doesNotMatch(webhook, /data\.metadata/u);
  assert.match(webhook, /paidAmount: \(payment\.amountCents \/ 100\)\.toFixed\(2\)/u);
  assert.match(webhook, /paidAmountCents: mollieStatus === "paid" \? batch\.amountCents : undefined/u);
});

test("REPRO P0-FIN-005: out-of-order webhook can regress local payment status after paid", () => {
  const singlePaymentBranch = webhook.slice(webhook.indexOf("const previousStatus = payment.status"));
  assertBefore(
    singlePaymentBranch,
    "status: localPaymentStatus",
    'if (mollieStatus === "paid")',
    "the webhook updates local payment status before branching on paid side effects",
  );
  const statusUpdate = singlePaymentBranch.slice(
    singlePaymentBranch.indexOf(".update(paymentsTable)"),
    singlePaymentBranch.indexOf("if (payment.sourceType"),
  );
  assert.match(statusUpdate, /status: localPaymentStatus/u);
  assert.doesNotMatch(statusUpdate, /previousStatus[\s\S]+paid[\s\S]+return/u);
  assert.doesNotMatch(statusUpdate, /eq\(paymentsTable\.status/u);
});

test("REPRO P0-FIN-006: concurrent paid webhooks can duplicate allocations because the paid transition is not atomic", () => {
  assert.match(webhook, /\.select\(\{ id: invoicesTable\.id[\s\S]+status: invoicesTable\.status[\s\S]+\.where\(eq\(invoicesTable\.id, payment\.invoiceId\)\)/u);
  assert.match(webhook, /if \(invoice && invoice\.status === "sent"\) \{[\s\S]+db\.insert\(paymentAllocationsTable\)\.values/u);
  assert.doesNotMatch(webhook, /\.transaction\(/u);
  assert.doesNotMatch(webhook, /onConflict/u);
  assert.doesNotMatch(paymentsSchema, /uniqueIndex\([^)]*payment_allocations[^)]*payment[^)]*invoice/iu);
});

test("REPRO P0-FIN-007: manual partial and overpayment rows can diverge from invoice paid totals", () => {
  const manual = functionBlock(backofficePayments, "registerManualInvoicePayment");
  assert.match(manual, /const nextPaidCents = Math\.min\(totalCents, paidCents \+ amountCents\)/u);
  assert.match(manual, /\.insert\(paymentsTable\)[\s\S]+\.values\(\{[\s\S]+amountCents/u);
  assert.match(manual, /await db\.insert\(paymentAllocationsTable\)\.values\(\{[\s\S]+amountCents/u);
  assert.match(manual, /paymentStatus: nextPaymentStatus/u);
  assert.doesNotMatch(manual, /amountCents >|amountCents\s*<=\s*nextOutstandingCents/u);
});

test("REPRO P0-FIN-008: direct batch webhook branch changes invoices and assignments without allocation rows", () => {
  const directBatchBranch = webhook.slice(
    webhook.indexOf("if (!payment) {"),
    webhook.indexOf("const previousStatus = payment.status"),
  );
  assert.match(directBatchBranch, /update\(customerPaymentBatchesTable\)/u);
  assert.match(directBatchBranch, /update\(invoicesTable\)/u);
  assert.match(directBatchBranch, /update\(assignmentsTable\)[\s\S]+status: "paid"/u);
  assert.match(directBatchBranch, /update\(assignmentsTable\)[\s\S]+status: "closed"/u);
  assert.doesNotMatch(directBatchBranch, /paymentAllocationsTable/u);
});

test("REPRO P0-FIN-009: batch item uniqueness is per batch, not per active invoice collection", () => {
  assert.match(batchSchema, /unique\("customer_payment_batch_items_unique"\)\.on\(table\.batchId, table\.invoiceId\)/u);
  assert.doesNotMatch(batchSchema, /uniqueIndex\([^)]*invoiceId[^)]*status/iu);

  const batchCreate = functionBlock(customerPayments, "createCustomerBatchPayment");
  assert.match(batchCreate, /activeBatchItems = await db/u);
  assert.match(batchCreate, /inArray\(customerPaymentBatchesTable\.status, \["open", "active", "paid"\]\)/u);
  assertBefore(
    batchCreate,
    "const activeBatchItems = await db",
    "const payment = await createMolliePaymentRequest",
    "active-batch prevention is a non-transactional preflight before provider creation",
  );
  assert.doesNotMatch(batchCreate, /\.transaction\(/u);
});

test("REPRO P0-FIN-010: collection payment inserts nullable invoice_id while tenant trigger still requires invoice_id", () => {
  assert.match(paymentTenantMigration, /CREATE OR REPLACE FUNCTION fieldgrid_set_payment_tenant_id\(\)/u);
  assert.match(paymentTenantMigration, /WHERE invoice\.id = NEW\.invoice_id/u);
  assert.match(paymentTenantMigration, /RAISE EXCEPTION 'Payment invoice % does not resolve to a tenant', NEW\.invoice_id/u);

  const customerBatchCreate = functionBlock(customerPayments, "createCustomerBatchPayment");
  assert.match(customerBatchCreate, /invoiceId:\s+null/u);
  assert.match(customerBatchCreate, /sourceType:\s+"invoice_collection"/u);

  const backofficeBatchCreate = functionBlock(backofficeInvoices, "createCollectiveInvoicePayment");
  assert.match(backofficeBatchCreate, /invoiceId:\s+null/u);
  assert.match(backofficeBatchCreate, /sourceType:\s+"invoice_collection"/u);
});

test("REPRO P0-FIN-011: customer payment after manual partial payment charges original total, not outstanding amount", () => {
  const manual = functionBlock(backofficePayments, "registerManualInvoicePayment");
  assert.match(manual, /const nextPaymentStatus = nextOutstandingCents === 0 \? "paid" : "partially_paid"/u);
  assert.match(manual, /status: nextPaymentStatus === "paid" \? "paid" : invoice\.status/u);
  assert.match(manual, /outstandingAmount: centsToAmount\(nextOutstandingCents\)/u);

  const customerCreate = functionBlock(customerPayments, "createCustomerInvoicePayment");
  assert.match(customerCreate, /if \(invoice\.status !== "sent"\)/u);
  assert.match(customerCreate, /const amountCents = parseAmountCents\(invoice\.totalAmount\)/u);
  assert.doesNotMatch(customerCreate, /outstandingAmount/u);
});

test("REPRO P0-FIN-012: backoffice markInvoicePaid bypasses payment and allocation ledger state", () => {
  const markPaid = functionBlock(backofficeInvoices, "markInvoicePaid");
  assert.match(markPaid, /\.set\(\{ status: "paid", paidDate: today, updatedAt: new Date\(\) \}\)/u);
  assert.match(markPaid, /action:\s+"mark_invoice_paid"/u);
  assert.doesNotMatch(markPaid, /paymentsTable/u);
  assert.doesNotMatch(markPaid, /paymentAllocationsTable/u);
  assert.doesNotMatch(markPaid, /paymentStatus/u);
  assert.doesNotMatch(markPaid, /paidAmount/u);
  assert.doesNotMatch(markPaid, /outstandingAmount/u);
});
