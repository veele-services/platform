import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const exportMarker = `export async function ${functionName}`;
  const localMarker = `async function ${functionName}`;
  let start = source.indexOf(exportMarker);
  if (start === -1) start = source.indexOf(localMarker);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const nextExport = source.indexOf(
    "\nexport async function ",
    start + functionName.length,
  );
  const nextLocal = source.indexOf(
    "\nasync function ",
    start + functionName.length,
  );
  const candidates = [nextExport, nextLocal].filter((index) => index !== -1);
  const next = candidates.length > 0 ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

const invoices = read("artifacts/backoffice/src/app/actions/invoices.ts");
const customerPayments = read("artifacts/klant-pwa/src/actions/payments.ts");
const paymentIntegrity = read("lib/db/src/payment-integrity.ts");

test("open payment checkout lookup is tenant-scoped through invoice assignment", () => {
  const helper = functionBlock(
    invoices,
    "getOpenPaymentCheckoutUrlForCurrentTenant",
  );

  assert.match(helper, /requireCurrentTenantId\(\)/u);
  assert.match(helper, /from\(paymentsTable\)/u);
  assert.match(
    helper,
    /innerJoin\(\s*invoicesTable,\s*eq\(paymentsTable\.invoiceId, invoicesTable\.id\),?\s*\)/u,
  );
  assert.match(
    helper,
    /innerJoin\(\s*assignmentsTable,\s*eq\(invoicesTable\.assignmentId, assignmentsTable\.id\),?\s*\)/u,
  );
  assert.match(helper, /eq\(paymentsTable\.invoiceId, invoiceId\)/u);
  assert.match(helper, /eq\(paymentsTable\.status, "open"\)/u);
  assert.match(helper, /eq\(assignmentsTable\.tenantId, tenantId\)/u);
});
test("email invoice reuses tenant-scoped payment lookup", () => {
  const body = functionBlock(invoices, "emailInvoice");

  assert.match(
    body,
    /getInvoice\(invoiceId\)/u,
    "emailInvoice should load the tenant-scoped invoice first",
  );
  assert.match(body, /getOpenPaymentCheckoutUrlForCurrentTenant\(invoiceId\)/u);
  assert.doesNotMatch(
    body,
    /\.from\(paymentsTable\)/u,
    "emailInvoice should not query payments directly",
  );
});

test("collective payment batches stay scoped by tenant-owned invoices and customers", () => {
  const body = functionBlock(invoices, "listCollectiveInvoiceCandidates");

  assert.match(body, /eq\(assignmentsTable\.tenantId, tenantId\)/u);
  assert.match(body, /eq\(customersTable\.tenantId, tenantId\)/u);
  assert.match(
    body,
    /innerJoin\(\s*invoicesTable,\s*eq\(customerPaymentBatchItemsTable\.invoiceId, invoicesTable\.id\),?\s*\)/u,
  );
  assert.match(
    body,
    /innerJoin\(\s*assignmentsTable,\s*eq\(invoicesTable\.assignmentId, assignmentsTable\.id\),?\s*\)/u,
  );
  assert.match(
    body,
    /inArray\(customerPaymentBatchesTable\.status, \["open", "paid"\]\)/u,
  );
});

test("collective payment creation rejects cross-tenant invoice ids before Mollie payment creation", () => {
  const body = functionBlock(invoices, "createCollectiveInvoicePayment");

  assert.match(body, /requireCurrentTenantId\(\)/u);
  assert.match(
    body,
    /where\(\s*and\(\s*inArray\(invoicesTable\.id, invoiceIds\),\s*eq\(assignmentsTable\.tenantId, tenantId\),?\s*\),?\s*\)/u,
  );
  assert.match(body, /if \(invoices\.length !== invoiceIds\.length\)/u);
  assert.match(body, /prepareCollectionPaymentIntent/u);
  assert.match(paymentIntegrity, /tenant_id = \$2 AND customer_id = \$3/u);
  assert.match(paymentIntegrity, /ORDER BY id FOR UPDATE/u);
});

test("customer single invoice payment rejects invoices locked in a batch before creating a payment", () => {
  const body = functionBlock(customerPayments, "createCustomerInvoicePayment");

  assert.match(body, /getAuthenticatedCustomer\(\)/u);
  assert.match(body, /eq\(invoicesTable\.id, invoiceId\)/u);
  assert.match(body, /eq\(invoicesTable\.customerId, auth\.customerId\)/u);
  assert.match(body, /eq\(customersTable\.tenantId, auth\.tenantId\)/u);
  assert.match(body, /prepareDirectPaymentIntent/u);
  assert.match(paymentIntegrity, /payment:invoice:/u);
  assert.match(
    paymentIntegrity,
    /Invoice is reserved by an active collection payment/u,
  );

  assert.ok(
    body.indexOf("prepareDirectPaymentIntent") <
      body.indexOf("createMolliePaymentRequest({"),
    "single invoice payment should commit its locked durable intent before creating a provider payment",
  );
});

test("customer batch payment creation rejects already locked invoices before Mollie payment creation", () => {
  const body = functionBlock(customerPayments, "createCustomerBatchPayment");

  assert.match(body, /getAuthenticatedCustomer\(\)/u);
  assert.match(body, /inArray\(invoicesTable\.id, uniqueInvoiceIds\)/u);
  assert.match(body, /eq\(invoicesTable\.customerId, auth\.customerId\)/u);
  assert.match(body, /eq\(customersTable\.tenantId, auth\.tenantId\)/u);
  assert.match(body, /prepareCollectionPaymentIntent/u);
  assert.match(paymentIntegrity, /payment:customer:/u);
  assert.match(
    paymentIntegrity,
    /One or more invoices are reserved by another active payment/u,
  );

  assert.ok(
    body.indexOf("prepareCollectionPaymentIntent") <
      body.indexOf("createMolliePaymentRequest({"),
    "customer collection should commit its locked durable intent before creating a provider payment",
  );
});
