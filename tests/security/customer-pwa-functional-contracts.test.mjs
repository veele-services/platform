import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const exportMarker = `export async function ${functionName}`;
  const localMarker = `async function ${functionName}`;
  let start = source.indexOf(exportMarker);
  if (start === -1) start = source.indexOf(localMarker);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const nextExport = source.indexOf("\nexport async function ", start + functionName.length);
  const nextLocal = source.indexOf("\nasync function ", start + functionName.length);
  const candidates = [nextExport, nextLocal].filter((index) => index !== -1);
  const next = candidates.length > 0 ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

function assertBefore(source, earlier, later, message) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);
  assert.notEqual(earlierIndex, -1, `${earlier} should exist`);
  assert.notEqual(laterIndex, -1, `${later} should exist`);
  assert.ok(earlierIndex < laterIndex, message);
}

const customerIdentity = read("artifacts/klant-pwa/src/actions/customer.ts");
const tenantHelper = read("artifacts/klant-pwa/src/lib/auth/tenant.ts");
const middleware = read("artifacts/klant-pwa/src/middleware.ts");
const loginForm = read("artifacts/klant-pwa/src/app/(auth)/login/LoginForm.tsx");
const passwordActions = read("artifacts/klant-pwa/src/actions/auth.ts");
const customerAssignments = read("artifacts/klant-pwa/src/actions/assignments.ts");
const customerObjects = read("artifacts/klant-pwa/src/actions/objects.ts");
const customerQuotes = read("artifacts/klant-pwa/src/actions/quotes.ts");
const customerReports = read("artifacts/klant-pwa/src/actions/reports.ts");
const customerInvoices = read("artifacts/klant-pwa/src/actions/invoices.ts");
const customerPayments = read("artifacts/klant-pwa/src/actions/payments.ts");
const customerTickets = read("artifacts/klant-pwa/src/actions/tickets.ts");
const customerNotifications = read("artifacts/klant-pwa/src/actions/notifications.ts");
const customerPreferences = read("artifacts/klant-pwa/src/actions/preferences.ts");
const customerDocuments = read("artifacts/klant-pwa/src/actions/documents.ts");
const quotePdfRoute = read("artifacts/klant-pwa/src/app/api/offerte/[id]/pdf/route.ts");
const invoicePdfRoute = read("artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts");
const invoicePayRoute = read("artifacts/klant-pwa/src/app/api/factuur/[id]/pay/route.ts");
const batchPdfRoute = read("artifacts/klant-pwa/src/app/api/verzamelfactuur/[id]/pdf/route.ts");
const webhookRoute = read("artifacts/api-server/src/routes/webhooks.ts");
const eventEmitter = read("lib/db/src/events.ts");
const gapRegister = JSON.parse(read("docs/readiness/customer-pwa-gap-register.json"));
const auditDoc = read("docs/readiness/customer-pwa-functional-audit.md");

test("audit artifacts declare their static evidence layer and required gaps", () => {
  assert.equal(gapRegister.audit.evidenceLayer, "static source inspection plus executable source-contract tests");
  assert.equal(gapRegister.audit.runtimeEvidenceUsed, false);
  assert.equal(gapRegister.audit.canonicalBaseSha, "f36e84dad5d1c595e4dd349ff5ce6bd439722576");

  const ids = new Set(gapRegister.gaps.map((gap) => gap.id));
  for (const id of [
    "CPWA-AUTH-001",
    "CPWA-AUTH-002",
    "CPWA-MODULE-001",
    "CPWA-ASSIGN-001",
    "CPWA-PAY-001",
    "CPWA-PAY-002",
    "CPWA-PAY-003",
    "CPWA-TICKET-001",
    "CPWA-NOTIFY-001",
  ]) {
    assert.ok(ids.has(id), `${id} should be tracked`);
  }

  assert.match(auditDoc, /This audit is based on repository source inspection/u);
  assert.match(auditDoc, /It is not runtime proof/u);
  assert.match(auditDoc, /No migration was created/u);
});

test("customer identity is host and customer scoped but still first-row based", () => {
  const identity = functionBlock(customerIdentity, "getMyCustomerIdentity");

  assert.match(tenantHelper, /inArray\(tenantsTable\.status, \[\.\.\.TENANT_RUNTIME_ACTIVE_STATUSES\]\)/u);
  assert.match(tenantHelper, /requireTenantModule\(tenantId, moduleKey\)/u);
  assert.match(identity, /requireCurrentCustomerPortalTenantId\(\)/u);
  assert.match(identity, /eq\(customerUsersTable\.tenantId, tenantId\)/u);
  assert.match(identity, /eq\(customersTable\.tenantId, customerUsersTable\.tenantId\)/u);
  assert.match(identity, /eq\(customerUsersTable\.userId, user\.id\)/u);
  assert.match(identity, /isNull\(customerUsersTable\.userId\)/u);
  assert.match(identity, /\.limit\(1\)/u);
  assert.doesNotMatch(identity, /\.orderBy\(/u, "current identity lookup has no deterministic customer selection");
});

test("login and password completion are session based, while reset request is host scoped", () => {
  assert.match(loginForm, /signInWithPassword/u);
  assert.doesNotMatch(loginForm, /getMyCustomerIdentity|requireCurrentCustomerPortalTenantId/u);
  assert.match(middleware, /supabase\.auth\.getUser\(\)/u);
  assert.doesNotMatch(middleware, /requireCurrentCustomerPortalTenantId|getMyCustomerIdentity/u);

  const requestReset = functionBlock(passwordActions, "requestPasswordResetCode");
  const findResetAccount = functionBlock(passwordActions, "findCustomerResetAccount");
  const completeReset = functionBlock(passwordActions, "completePasswordReset");
  assert.match(requestReset, /requireCurrentCustomerPortalTenantId\(\)/u);
  assert.match(requestReset, /findCustomerResetAccount\(tenantId, normalizedEmail\)/u);
  assert.match(findResetAccount, /eq\(customerUsersTable\.tenantId, tenantId\)/u);
  assert.match(completeReset, /supabase\.auth\.getUser\(\)/u);
  assert.match(completeReset, /supabase\.auth\.updateUser/u);
  assert.doesNotMatch(completeReset, /requireCurrentCustomerPortalTenantId|getMyCustomerIdentity|expiresAt/u);
});

test("customer assignment requests are tenant bound and reject object sector mismatch", () => {
  const requestAssignment = functionBlock(customerAssignments, "requestAssignment");

  assert.match(requestAssignment, /getMyCustomerIdentity\(\)/u);
  assert.match(requestAssignment, /eq\(objectsTable\.customerId, identity\.customerId\)/u);
  assert.match(requestAssignment, /eq\(objectsTable\.tenantId, identity\.tenantId\)/u);
  assert.match(requestAssignment, /if \(object\.sectorId !== sectorId\)/u);
  assert.match(requestAssignment, /\.values\(\{ \.\.\.validatedData, tenantId: identity\.tenantId \}\)/u);
  assert.match(requestAssignment, /eventKey: "customer_assignment_requested"/u);
});

test("customer direct UUID reads are scoped by customer and tenant through parent records", () => {
  for (const [source, functionName, parentTable] of [
    [customerObjects, "getMyObject", "objectsTable"],
    [customerAssignments, "getMyAssignmentDetail", "assignmentsTable"],
    [customerTickets, "getMyCustomerTicket", "customerMessageThreadsTable"],
  ]) {
    const body = functionBlock(source, functionName);
    assert.match(body, new RegExp(`eq\\(${parentTable}\\.customerId,\\s*identity\\.customerId\\)`, "u"));
    assert.match(body, new RegExp(`eq\\(${parentTable}\\.tenantId,\\s*identity\\.tenantId\\)`, "u"));
  }

  assert.match(customerReports, /eq\(assignmentsTable\.customerId, identity\.customerId\)/u);
  assert.match(customerReports, /eq\(assignmentsTable\.tenantId, identity\.tenantId\)/u);
  assert.match(customerReports, /eq\(reportsTable\.status, "approved"\)/u);
});

test("quote visibility and approval are scoped but approval currently makes assignments plannable", () => {
  const getQuotes = functionBlock(customerQuotes, "getMyQuotes");
  const approveQuote = functionBlock(customerAssignments, "approveQuote");

  assert.match(customerQuotes, /CUSTOMER_VISIBLE_QUOTE_STATUSES: QuoteStatus\[\] = \["sent", "approved", "rejected", "expired"\]/u);
  assert.match(getQuotes, /eq\(quotesTable\.customerId, identity\.customerId\)/u);
  assert.match(getQuotes, /eq\(assignmentsTable\.customerId, identity\.customerId\)/u);
  assert.match(getQuotes, /eq\(assignmentsTable\.tenantId, identity\.tenantId\)/u);
  assert.match(approveQuote, /eq\(assignmentsTable\.status,\s*"awaiting_approval"\)/u);
  assert.match(approveQuote, /eq\(quotesTable\.status,\s*"sent"\)/u);
  assert.match(approveQuote, /set\(\{ status: "plannable" \}\)/u);
  assert.doesNotMatch(approveQuote, /set\(\{ status: "scheduled" \}\)/u);
});

test("photos, quote PDFs and invoice PDFs are customer scoped before signing or rendering", () => {
  const assignmentDetail = functionBlock(customerAssignments, "getMyAssignmentDetail");
  const quotePdf = functionBlock(quotePdfRoute, "GET");
  const invoicePdf = functionBlock(invoicePdfRoute, "GET");
  const batchPdf = functionBlock(batchPdfRoute, "GET");

  assert.match(assignmentDetail, /eq\(assignmentPhotosTable\.isApproved,\s+true\)/u);
  assert.match(assignmentDetail, /getSafeCustomerAssignmentPhotoStoragePath\(/u);
  assertBefore(assignmentDetail, "eq(assignmentPhotosTable.isApproved", "createSignedUrl(storagePath, 3600)", "photo approval check should precede signed URL creation");

  for (const body of [quotePdf, invoicePdf, batchPdf]) {
    assert.match(body, /getMyCustomerIdentity\(\)/u);
    assert.match(body, /identity\.customerId/u);
    assert.match(body, /identity\.tenantId/u);
  }

  assert.match(quotePdf, /db\.insert\(auditLogTable\)\.values/u);
  assert.match(invoicePdf, /db\.insert\(auditLogTable\)\.values/u);
  assert.doesNotMatch(batchPdf, /auditLogTable/u, "batch PDF downloads are not currently audited");
});

test("finance actions and routes are scoped but not feature-module gated", () => {
  for (const [source, functionName] of [
    [customerInvoices, "getMyInvoices"],
    [customerPayments, "createCustomerInvoicePayment"],
    [customerPayments, "createCustomerBatchPayment"],
  ]) {
    const body = functionBlock(source, functionName);
    assert.match(body, /identity\.tenantId|auth\.tenantId/u);
    assert.match(body, /identity\.customerId|auth\.customerId/u);
    assert.doesNotMatch(body, /requireCurrentPortalModule\("finance"\)|requireTenantModule\(.*"finance"/u);
  }

  for (const route of [invoicePdfRoute, invoicePayRoute, batchPdfRoute, quotePdfRoute]) {
    assert.match(route, /getMyCustomerIdentity\(\)/u);
    assert.doesNotMatch(route, /requireCurrentPortalModule\("finance"\)|requireTenantModule\(.*"finance"/u);
  }
});

test("optional customer modules currently have direct action surfaces without module guards", () => {
  for (const [source, functionName, moduleName] of [
    [customerReports, "getMyReports", "reporting"],
    [customerDocuments, "getMyDocuments", "documents"],
    [customerQuotes, "getMyQuotes", "finance"],
    [customerNotifications, "getMyCustomerNotifications", "notifications"],
  ]) {
    const body = functionBlock(source, functionName);
    assert.match(body, /getMyCustomerIdentity\(\)/u);
    assert.doesNotMatch(body, new RegExp(`requireCurrentPortalModule\\("${moduleName}"\\)|requireTenantModule\\(.*"${moduleName}"`, "u"));
  }
});

test("payment creation checks ownership but lacks provider idempotency and tenant payment settings", () => {
  const createSingle = functionBlock(customerPayments, "createCustomerInvoicePayment");
  const createBatch = functionBlock(customerPayments, "createCustomerBatchPayment");
  const mollieRequest = functionBlock(customerPayments, "createMolliePaymentRequest");

  assert.match(createSingle, /eq\(invoicesTable\.customerId, auth\.customerId\)/u);
  assert.match(createSingle, /eq\(customersTable\.tenantId, auth\.tenantId\)/u);
  assert.match(createSingle, /const \[existing\] = await db/u);
  assertBefore(createSingle, "const [existing] = await db", "createMolliePaymentRequest({", "existing open payment lookup should occur before provider creation");

  assert.match(createBatch, /inArray\(invoicesTable\.id, uniqueInvoiceIds\)/u);
  assert.match(createBatch, /eq\(invoicesTable\.customerId, auth\.customerId\)/u);
  assert.match(createBatch, /eq\(customersTable\.tenantId, auth\.tenantId\)/u);

  assert.match(mollieRequest, /MOLLIE_API_KEY/u);
  assert.doesNotMatch(customerPayments, /invoicePaymentSettingsTable|Idempotency-Key|idempotency/i);
});

test("webhook reconciliation refetches provider status but accepts local orphan and unsigned fallback paths", () => {
  assert.match(webhookRoute, /MOLLIE_WEBHOOK_SECRET/u);
  assert.match(webhookRoute, /accepting Mollie webhook without validation/u);
  assert.match(webhookRoute, /fetch\(`https:\/\/api\.mollie\.com\/v2\/payments\/\$\{molliePaymentId\}`/u);
  assert.match(webhookRoute, /where\(eq\(paymentsTable\.molliePaymentId, molliePaymentId\)\)/u);
  assert.match(webhookRoute, /No local payment or payment batch found/u);
  assert.doesNotMatch(webhookRoute, /metadata\.tenantId|metadata\.customerId|metadata\.invoiceId/u);
});

test("ticket and preference aftercare is scoped but currently weak on delivery preferences and audit", () => {
  const createTicket = functionBlock(customerTickets, "createMyCustomerTicket");
  const replyTicket = functionBlock(customerTickets, "replyToMyCustomerTicket");
  const updatePreferences = functionBlock(customerPreferences, "updateMyPortalPreferences");

  assert.match(createTicket, /tenantId: identity\.tenantId/u);
  assert.match(createTicket, /customerId: identity\.customerId/u);
  assert.match(replyTicket, /eq\(customerMessageThreadsTable\.customerId, identity\.customerId\)/u);
  assert.match(replyTicket, /eq\(customerMessageThreadsTable\.tenantId, identity\.tenantId\)/u);

  assert.match(createTicket, /eventKey: "customer_ticket_created"/u);
  assert.match(replyTicket, /eventKey: "customer_ticket_replied"/u);
  assert.doesNotMatch(createTicket, /recipients:/u);
  assert.doesNotMatch(replyTicket, /recipients:/u);
  assert.match(createTicket, /audit: false/u);
  assert.match(replyTicket, /audit: false/u);

  assert.match(updatePreferences, /getMyCustomerIdentity\(\)/u);
  assert.match(updatePreferences, /\.onConflictDoUpdate/u);
  assert.doesNotMatch(updatePreferences, /auditLogTable/u);
  assert.doesNotMatch(eventEmitter, /customerPortalPreferencesTable|customer_portal_preferences/u);
});
