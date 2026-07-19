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

const invoicesSchema = read("lib/db/src/schema/invoices.ts");
const paymentsSchema = read("lib/db/src/schema/payments.ts");
const batchesSchema = read("lib/db/src/schema/customer-payment-batches.ts");
const numbering = read("lib/db/src/invoice-numbering.ts");
const finalization = read("lib/db/src/invoice-finalization.ts");
const invoiceActions = read("artifacts/backoffice/src/app/actions/invoices.ts");
const paymentActions = read("artifacts/backoffice/src/app/actions/payments.ts");
const customerPayments = read("artifacts/klant-pwa/src/actions/payments.ts");
const webhook = read("artifacts/api-server/src/routes/webhooks.ts");
const paymentIntegrity = read("lib/db/src/payment-integrity.ts");
const migration = read(
  "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
);

test("canon document numbering supports invoices, credit notes and collections", () => {
  assert.match(
    invoicesSchema,
    /INVOICE_NUMBER_DOCUMENT_TYPES = \["invoice", "credit_note", "invoice_collection"\]/u,
  );
  assert.match(invoicesSchema, /documentType: varchar\("document_type"/u);
  assert.match(
    invoicesSchema,
    /uniqueIndex\("invoice_number_sequences_tenant_settings_period_idx"\)[\s\S]+table\.documentType[\s\S]+table\.periodKey/u,
  );

  assert.match(numbering, /credit_note: \{ prefix: "CRD"/u);
  assert.match(numbering, /invoice_collection: \{ prefix: "VZF"/u);
  assert.match(numbering, /claimOfficialInvoiceCollectionNumberInTransaction/u);
  assert.match(numbering, /document_type = \$3[\s\S]+period_key = \$4/u);
  assert.match(
    finalization,
    /documentType: invoice\.type === "credit_note" \? "credit_note" : "invoice"/u,
  );
});

test("credit notes are tenant-scoped drafts with immutable original invoice context", () => {
  const body = functionBlock(invoiceActions, "createCreditNoteForInvoice");
  assert.match(body, /requirePermission\("invoices", "write"\)/u);
  assert.match(body, /requireCurrentTenantId\(\)/u);
  assert.match(body, /eq\(invoicesTable\.tenantId, tenantId\)/u);
  assert.match(body, /type: "credit_note"/u);
  assert.match(body, /creditedInvoiceId: original\.id/u);
  assert.match(body, /originalInvoiceNumberSnapshot: original\.invoiceNumber/u);
  assert.match(body, /creditReason: reason/u);
  assert.match(body, /status: "draft"/u);
  assert.match(body, /action: "create_credit_note"/u);
});

test("payments support manual and provider flows through canonical allocations", () => {
  assert.match(
    paymentsSchema,
    /PAYMENT_SOURCE_TYPES = \[[\s\S]*"invoice"[\s\S]*"invoice_collection"[\s\S]*\] as const/u,
  );
  assert.match(
    paymentsSchema,
    /PAYMENT_METHODS = \[[\s\S]*"mollie"[\s\S]*"manual_bank"[\s\S]*"cash"[\s\S]*"correction"[\s\S]*"settlement"[\s\S]*"other"[\s\S]*\] as const/u,
  );
  assert.match(
    paymentsSchema,
    /paymentAllocationsTable = pgTable\(\s*"payment_allocations"/u,
  );
  assert.match(paymentsSchema, /invoiceId: uuid\("invoice_id"\)\.references/u);

  const manualBody = functionBlock(
    paymentActions,
    "registerManualInvoicePayment",
  );
  assert.match(manualBody, /requirePermission\("invoices", "write"\)/u);
  assert.match(manualBody, /requireCurrentTenantId\(\)/u);
  assert.match(manualBody, /paymentAllocationsTable/u);
  assert.match(manualBody, /paymentStatus: nextPaymentStatus/u);
  assert.match(manualBody, /action: "register_manual_invoice_payment"/u);

  assert.match(webhook, /applyProviderPaymentSnapshot/u);
  assert.match(paymentIntegrity, /INSERT INTO public\.payment_allocations/u);
  assert.match(paymentIntegrity, /intent\.sourceType === "invoice"/u);
  assert.match(paymentIntegrity, /collection_status = 'collection_paid'/u);
});

test("collection invoices carry VZF numbers, tenant metadata and line snapshots", () => {
  assert.match(
    batchesSchema,
    /collectionNumber: varchar\("collection_number"/u,
  );
  assert.match(batchesSchema, /paidAmountCents/u);
  assert.match(batchesSchema, /outstandingAmountCents/u);
  assert.match(batchesSchema, /invoiceNumberSnapshot/u);
  assert.match(batchesSchema, /includedAmountCents/u);

  const backofficeBody = functionBlock(
    invoiceActions,
    "createCollectiveInvoicePayment",
  );
  assert.match(
    backofficeBody,
    /claimOfficialInvoiceCollectionNumberInTransaction/u,
  );
  assert.match(backofficeBody, /prepareCollectionPaymentIntent/u);
  assert.match(backofficeBody, /batchId: intent\.sourceId/u);
  assert.match(paymentIntegrity, /sourceType: "invoice_collection"/u);
  assert.match(paymentIntegrity, /invoice_number_snapshot/u);

  assert.match(customerPayments, /tenantId:\s+auth\.tenantId/u);
  assert.match(customerPayments, /prepareCollectionPaymentIntent/u);
  assert.match(customerPayments, /actorType:\s+"customer_user"/u);
});

test("migration is ordered and backfills without renumbering existing invoices", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS document_type/u);
  assert.match(migration, /'credit_note', 'CRD'/u);
  assert.match(migration, /'invoice_collection', 'VZF'/u);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS credited_invoice_id/u);
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.payment_allocations/u,
  );
  assert.match(
    migration,
    /UPDATE public\.payments payment[\s\S]+source_id = COALESCE\(payment\.source_id, payment\.invoice_id\)/u,
  );
  assert.match(migration, /invoice_number_snapshot/u);
  assert.doesNotMatch(
    migration,
    /UPDATE public\.invoices\s+SET invoice_number/u,
  );
});
