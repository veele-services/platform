#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const options = parseArgs(args);
const root = process.cwd();
const outputDir = options.outDir || join(root, "outputs", "invoice-sprint10-release-gate");

const routes = [
  { id: "invoices-list", path: "/invoices", label: "Facturenlijst", expectations: ["invoice-list", "payment"] },
  { id: "invoice-settings", path: "/instellingen/facturen", label: "Factuurinstellingen", expectations: ["settings", "preview"] },
];

const customerRoutes = [
  { id: "customer-invoices", path: "/facturen", label: "Klantportaal facturen", expectations: ["payment", "pdf"] },
];

const staticChecks = [
  checkPackageScripts(),
  checkRouteSurface(),
  checkDraftFinalizeSentPaidFlow(),
  checkTenantSafeNumbering(),
  checkSnapshotPdfAndDownloads(),
  checkPaymentMollieQrSurface(),
  checkSettingsAndPreviewSurface(),
  checkSecurityRbacAuditSurface(),
  checkInvoiceCanonRegressionTests(),
];

let liveResults = [];
let liveError = null;

if (!options.check) {
  try {
    liveResults = await runOptionalPlaywrightSmoke();
  } catch (error) {
    liveError = error instanceof Error ? error.message : String(error);
  }
}

const report = {
  version: "fieldgrid-invoice-sprint10-release-gate-v1",
  createdAt: new Date().toISOString(),
  mode: options.check ? "check" : "full",
  strictEvidence: options.strictEvidence,
  staticChecks,
  liveResults,
  liveError,
  finalAcceptance: {
    staticGate: staticChecks.every((check) => check.status === "passed") ? "passed" : "failed",
    liveSmoke: liveResults.length === 0 ? "not-configured" : liveResults.every((result) => result.status === "captured" || result.status === "skipped") ? "passed" : "failed",
    artifactDirectory: "outputs/invoice-sprint10-release-gate",
    strictCommand: "pnpm fieldgrid:invoice-sprint10-release-gate:strict",
  },
};

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "invoice-sprint10-release-gate.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const failures = staticChecks.flatMap((check) => check.failures.map((failure) => ({ check: check.id, ...failure })));
const liveFailures = liveResults.filter((result) => result.status === "failed");
const strictFailures = options.strictEvidence && liveResults.filter((result) => result.status === "captured").length < 3
  ? [{ message: "Strict evidence requires authenticated screenshots for invoice list, settings and customer invoice surfaces.", actual: liveResults.filter((result) => result.status === "captured").length }]
  : [];

if (failures.length > 0 || liveFailures.length > 0 || liveError || strictFailures.length > 0) {
  console.error(`Fieldgrid invoice sprint 10 release gate failed. Report: ${reportPath}`);
  if (failures.length > 0) console.error(JSON.stringify(failures, null, 2));
  if (liveFailures.length > 0) console.error(JSON.stringify(liveFailures, null, 2));
  if (strictFailures.length > 0) console.error(JSON.stringify(strictFailures, null, 2));
  if (liveError) console.error(liveError);
  process.exit(1);
}

console.log(`Fieldgrid invoice sprint 10 release gate passed. Report: ${reportPath}`);

function parseArgs(argv) {
  const parsed = { check: false, strictEvidence: false, outDir: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index];
    switch (flag) {
      case "--check":
        parsed.check = true;
        break;
      case "--strict-evidence":
        parsed.strictEvidence = true;
        break;
      case "--out":
      case "--out-dir":
        parsed.outDir = resolve(process.cwd(), nextValue());
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function printUsage() {
  console.log(`Fieldgrid invoice sprint 10 release gate

Usage:
  pnpm fieldgrid:invoice-sprint10-release-gate:check
  pnpm fieldgrid:invoice-sprint10-release-gate
  pnpm fieldgrid:invoice-sprint10-release-gate:strict

Optional live smoke:
  FIELDGRID_INVOICE_GATE_TENANT_BASE_URL
  FIELDGRID_INVOICE_GATE_TENANT_STORAGE_STATE or FIELDGRID_INVOICE_GATE_TENANT_COOKIE
  FIELDGRID_INVOICE_GATE_CUSTOMER_BASE_URL
  FIELDGRID_INVOICE_GATE_CUSTOMER_STORAGE_STATE or FIELDGRID_INVOICE_GATE_CUSTOMER_COOKIE
`);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function exists(path) {
  return existsSync(join(root, path));
}

function check(id, label, failures) {
  return { id, label, status: failures.length === 0 ? "passed" : "failed", failures };
}

function failure(message, evidence = null) {
  return { message, evidence };
}

function expectFile(path, expectations = []) {
  const failures = [];
  if (!exists(path)) return [failure(`Missing file: ${path}`)];
  const text = read(path);
  for (const expectation of expectations) {
    const found = typeof expectation.pattern === "string" ? text.includes(expectation.pattern) : expectation.pattern.test(text);
    if (!found) failures.push(failure(expectation.message, path));
  }
  return failures;
}

function checkPackageScripts() {
  return check("package-scripts", "Sprint 10 release gate is executable from package scripts", expectFile("package.json", [
    { pattern: "fieldgrid:invoice-sprint10-release-gate", message: "Missing invoice sprint 10 package script." },
    { pattern: "fieldgrid:invoice-sprint10-release-gate:check", message: "Missing invoice sprint 10 check package script." },
    { pattern: "fieldgrid:invoice-sprint10-release-gate:strict", message: "Missing invoice sprint 10 strict package script." },
  ]));
}

function checkRouteSurface() {
  const routeFiles = [
    "artifacts/backoffice/src/app/(dashboard)/invoices/page.tsx",
    "artifacts/backoffice/src/app/(dashboard)/invoices/[id]/page.tsx",
    "artifacts/backoffice/src/app/(dashboard)/instellingen/facturen/page.tsx",
    "artifacts/backoffice/src/app/api/invoices/[id]/pdf/route.ts",
    "artifacts/backoffice/src/app/api/invoices/[id]/pay/route.ts",
    "artifacts/backoffice/src/app/api/invoices/test-pdf/route.ts",
    "artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts",
    "artifacts/klant-pwa/src/app/api/factuur/[id]/pay/route.ts",
    "artifacts/klant-pwa/src/app/api/verzamelfactuur/[id]/pdf/route.ts",
  ];
  return check("route-surface", "Backoffice and customer invoice routes required by Sprint 10 exist", routeFiles.filter((path) => !exists(path)).map((path) => failure(`Missing route: ${path}`)));
}

function checkDraftFinalizeSentPaidFlow() {
  const failures = [
    ...expectFile("artifacts/backoffice/src/app/actions/invoices.ts", [
      { pattern: /export async function createInvoice/u, message: "createInvoice action missing." },
      { pattern: /status:\s+"draft"/u, message: "Invoice creation must keep new invoices in draft status." },
      { pattern: /export async function finalizeInvoiceDraft/u, message: "Finalize action missing." },
      { pattern: /finalizeOfficialInvoice\(\{ invoiceId, tenantId, actorUserId: user\.id \}\)/u, message: "Finalize action must call finalization service." },
      { pattern: /export async function markInvoiceSent/u, message: "Send action missing." },
      { pattern: /export async function markInvoicePaid/u, message: "Paid action missing." },
      { pattern: /export async function cancelInvoice/u, message: "Cancel action missing." },
      { pattern: /invoice\.status !== "draft"/u, message: "Send/finalize flow must preserve draft checks." },
      { pattern: /eventKey:\s+"invoice_sent"/u, message: "Sent notification event missing." },
    ]),
    ...expectFile("artifacts/backoffice/src/components/invoices/InvoiceActions.tsx", [
      { pattern: "Finaliseren", message: "Finalize button missing from invoice actions." },
      { pattern: "Verzenden", message: "Send button missing from invoice actions." },
      { pattern: "Betaald markeren", message: "Paid button missing from invoice actions." },
      { pattern: "Annuleren", message: "Cancel button missing from invoice actions." },
    ]),
  ];
  const createBody = functionBlock(read("artifacts/backoffice/src/app/actions/invoices.ts"), "createInvoice");
  const insertValues = sliceBetween(createBody, ".values({", ".returning({ id: invoicesTable.id })");
  if (/invoiceNumber|finalizedAt/u.test(insertValues)) {
    failures.push(failure("Draft createInvoice insert must not set invoiceNumber or finalizedAt.", "artifacts/backoffice/src/app/actions/invoices.ts"));
  }
  return check("draft-finalized-sent-paid-flow", "Draft/finalized/sent/paid actions are canon-compatible", failures);
}

function checkTenantSafeNumbering() {
  return check("tenant-safe-numbering", "Invoice numbering is tenant-safe and transaction-safe", [
    ...expectFile("lib/db/src/invoice-number-formatting.ts", [
      { pattern: /const PREFIX_PATTERN = \/\^\[A-Z\]\{3\}\$\/u/u, message: "Prefix must be exactly three uppercase letters." },
      { pattern: /INVOICE_NUMBER_ALLOWED_TOKENS = \["PREFIX", "YYYY", "YY", "MM", "NUMBER"\]/u, message: "Numbering token whitelist missing." },
      { pattern: /padding < 3 \|\| padding > 8/u, message: "Padding range guard missing." },
      { pattern: /case "monthly":/u, message: "Monthly reset period missing." },
      { pattern: /export function previewInvoiceNumber/u, message: "Preview helper missing." },
    ]),
    ...expectFile("lib/db/src/invoice-numbering.ts", [
      { pattern: /pg_advisory_xact_lock\(hashtext\(\$1\), 710201\)/u, message: "Advisory transaction lock missing." },
      { pattern: /WHERE id = \$1 AND tenant_id = \$2\s+FOR UPDATE/u, message: "Invoice row lock must be tenant scoped." },
      { pattern: /WHERE tenant_id = \$1 AND document_type = \$2 AND is_active = true[\s\S]*FOR UPDATE/u, message: "Numbering settings lock must be tenant and document scoped." },
      { pattern: /ON CONFLICT \(tenant_id, numbering_settings_id, document_type, period_key\) DO NOTHING/u, message: "Sequence conflict key must include tenant/document/period." },
      { pattern: /SET next_number = next_number \+ 1/u, message: "Sequence increment missing." },
    ]),
    ...expectFile("lib/db/migrations/20260710110000_invoice_canon_datamodel.sql", [
      { pattern: /ON public\.invoices\(tenant_id, invoice_number\)/u, message: "Invoice number unique index must be tenant scoped." },
      { pattern: /WHERE invoice_number IS NOT NULL AND invoice_number <> ''/u, message: "Tenant-scoped unique index must allow drafts without numbers." },
    ]),
  ]);
}

function checkSnapshotPdfAndDownloads() {
  return check("snapshot-pdf-downloads", "PDFs are snapshot-based, tenant-branded and downloadable from backoffice/customer portal", [
    ...expectFile("lib/db/src/invoice-finalization.ts", [
      { pattern: /company_snapshot_json = COALESCE\(company_snapshot_json, \$1::jsonb\)/u, message: "Company snapshot capture missing." },
      { pattern: /payment_settings_snapshot_json = COALESCE\(payment_settings_snapshot_json, \$3::jsonb\)/u, message: "Payment settings snapshot capture missing." },
      { pattern: /template_snapshot_json = COALESCE\(template_snapshot_json, \$4::jsonb\)/u, message: "Template snapshot capture missing." },
      { pattern: /INSERT INTO public\.invoice_line_item_snapshots/u, message: "Line item snapshot capture missing." },
    ]),
    ...expectFile("artifacts/backoffice/src/lib/invoice-pdf.ts", [
      { pattern: /companySnapshot/u, message: "Backoffice PDF must use company snapshot." },
      { pattern: /templateSettings/u, message: "Backoffice PDF must use template snapshot." },
      { pattern: /drawCompanyPanel/u, message: "Professional company block missing." },
      { pattern: /safePdfColor/u, message: "PDF color sanitizing missing." },
      { pattern: /drawPaymentBlock/u, message: "Payment block missing." },
    ]),
    ...expectFile("artifacts/klant-pwa/src/lib/invoice-pdf.ts", [
      { pattern: /companySnapshot/u, message: "Customer PDF must use company snapshot." },
      { pattern: /templateSettings/u, message: "Customer PDF must use template snapshot." },
      { pattern: /safePdfColor/u, message: "Customer PDF color sanitizing missing." },
    ]),
    ...expectFile("artifacts/backoffice/src/app/api/invoices/[id]/pdf/route.ts", [
      { pattern: /new NextResponse\(new Uint8Array\(pdfBuffer\)/u, message: "Backoffice PDF route must return a binary response." },
    ]),
    ...expectFile("artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts", [
      { pattern: /getMyCustomerIdentity\(\)/u, message: "Customer PDF route must derive customer identity server-side." },
      { pattern: /eq\(invoicesTable\.customerId, identity\.customerId\)/u, message: "Customer PDF route must scope by customer." },
      { pattern: /new NextResponse\(new Uint8Array\(pdfBuffer\)/u, message: "Customer PDF route must return a binary response." },
    ]),
  ]);
}

function checkPaymentMollieQrSurface() {
  return check("mollie-payment-qr", "Mollie payment link and QR UI are safe and configurable", [
    ...expectFile("artifacts/backoffice/src/app/actions/payments.ts", [
      { pattern: /requireMolliePaymentsEnabled\(tenantId\)/u, message: "Mollie payment creation must be gated by tenant settings." },
      { pattern: /process\.env\.MOLLIE_API_KEY/u, message: "Mollie API key must stay server-side." },
    ]),
    ...expectFile("artifacts/backoffice/src/lib/qr-code.ts", [
      { pattern: /export function createQrMatrix/u, message: "Server-side QR generator missing." },
    ]),
    ...expectFile("artifacts/backoffice/src/app/api/invoices/[id]/pay/route.ts", [
      { pattern: /eq\(paymentsTable\.status, "open"\)/u, message: "Payment redirect must only use open payments." },
      { pattern: /eq\(invoicesTable\.status, "sent"\)/u, message: "Payment redirect must require sent invoice status." },
      { pattern: /NextResponse\.redirect\(payment\.checkoutUrl, 302\)/u, message: "Payment redirect missing." },
    ]),
    ...expectFile("artifacts/klant-pwa/src/app/api/factuur/[id]/pay/route.ts", [
      { pattern: /getMyCustomerIdentity\(\)/u, message: "Customer pay route must derive identity server-side." },
      { pattern: /NextResponse\.redirect\(payment\.checkoutUrl, 302\)/u, message: "Customer payment redirect missing." },
    ]),
  ]);
}

function checkSettingsAndPreviewSurface() {
  return check("settings-preview", "Tenant admin invoice settings and test preview are wired", [
    ...expectFile("artifacts/backoffice/src/app/(dashboard)/instellingen/facturen/page.tsx", [
      { pattern: /InvoiceSettingsView/u, message: "Invoice settings page must render settings view." },
      { pattern: /hasPermission\("settings", "read"\)/u, message: "Settings page must require read permission." },
    ]),
    ...expectFile("artifacts/backoffice/src/components/settings/InvoiceSettingsView.tsx", [
      { pattern: "Bedrijfsgegevens", message: "Company settings tab/card missing." },
      { pattern: "Factuurnummering", message: "Numbering settings tab/card missing." },
      { pattern: "Opmaak", message: "Template settings tab/card missing." },
      { pattern: "Betaling", message: "Payment settings tab/card missing." },
      { pattern: "Mollie", message: "Mollie settings tab/card missing." },
      { pattern: "Preview", message: "Preview tab/card missing." },
      { pattern: "Test-PDF downloaden", message: "Test PDF download missing." },
      { pattern: "Geen sequence claim", message: "Preview must state it does not claim a sequence number." },
    ]),
    ...expectFile("artifacts/backoffice/src/app/actions/invoice-settings.ts", [
      { pattern: /updateInvoiceCompanySettings/u, message: "Company settings action missing." },
      { pattern: /updateInvoiceNumberingSettings/u, message: "Numbering settings action missing." },
      { pattern: /updateInvoiceTemplateSettings/u, message: "Template settings action missing." },
      { pattern: /updateInvoicePaymentSettings/u, message: "Payment settings action missing." },
      { pattern: /previewInvoiceNumber/u, message: "Settings preview number missing." },
      { pattern: /auditLogTable/u, message: "Invoice settings changes must write audit logs." },
    ]),
    ...expectFile("artifacts/backoffice/src/app/api/invoices/test-pdf/route.ts", [
      { pattern: /getInvoiceSettings\(\)/u, message: "Test PDF route must use settings preview." },
      { pattern: /TEST-\$\{settings\.preview\.invoiceNumber\}/u, message: "Test PDF must be visibly non-official." },
      { pattern: /generateInvoicePdf\(sampleInvoice\(settings\)\)/u, message: "Test PDF must render from sample data." },
    ]),
  ]);
}

function checkSecurityRbacAuditSurface() {
  return check("security-rbac-audit", "Tenant scope, RBAC and audit are closed for release", [
    ...expectFile("artifacts/backoffice/src/app/actions/invoices.ts", [
      { pattern: /requireCurrentTenantId\(\)/u, message: "Invoice actions must resolve tenant server-side." },
      { pattern: /requirePermission\("invoices", "write"\)/u, message: "Invoice write permission missing." },
      { pattern: /auditLogTable/u, message: "Invoice lifecycle actions must audit." },
    ]),
    ...expectFile("artifacts/backoffice/src/app/actions/invoice-settings.ts", [
      { pattern: /requireCurrentTenantId\(\)/u, message: "Invoice settings actions must resolve tenant server-side." },
      { pattern: /requirePermission\("settings", "write"\)/u, message: "Invoice settings write permission missing." },
      { pattern: /auditLogTable/u, message: "Invoice settings actions must audit." },
    ]),
    ...expectFile("lib/db/migrations/20260710190000_invoice_security_rbac_audit_hardening.sql", [
      { pattern: /ALTER TABLE public\.invoices ENABLE ROW LEVEL SECURITY/u, message: "Invoices RLS hardening missing." },
      { pattern: /REVOKE ALL ON TABLE public\.%I FROM %I/u, message: "Direct grants must be revoked." },
      { pattern: /fieldgrid_validate_invoice_number_sequence_tenant/u, message: "Sequence tenant consistency guard missing." },
      { pattern: /fieldgrid_validate_invoice_line_snapshot_tenant/u, message: "Line snapshot tenant consistency guard missing." },
    ]),
  ]);
}

function checkInvoiceCanonRegressionTests() {
  const tests = [
    "tests/fieldgrid-invoice-canon-current-flow.test.mjs",
    "tests/fieldgrid-invoice-canon-current-numbering.test.mjs",
    "tests/fieldgrid-invoice-canon-current-pdf.test.mjs",
    "tests/fieldgrid-invoice-canon-sprint1-datamodel.test.mjs",
    "tests/fieldgrid-invoice-canon-sprint2-numbering-engine.test.mjs",
    "tests/fieldgrid-invoice-canon-sprint3-finalization.test.mjs",
    "tests/fieldgrid-invoice-canon-sprint4-settings.test.mjs",
    "tests/fieldgrid-invoice-canon-sprint5-flow-integration.test.mjs",
    "tests/fieldgrid-invoice-canon-sprint6-payments-qr.test.mjs",
    "tests/fieldgrid-invoice-canon-sprint7-pdf-snapshots.test.mjs",
    "tests/fieldgrid-invoice-canon-sprint8-preview-test-pdf.test.mjs",
    "tests/fieldgrid-invoice-canon-sprint9-security-rbac-audit.test.mjs",
    "tests/fieldgrid-invoice-canon-completion-before-sprint10.test.mjs",
    "tests/fieldgrid-payment-tenant-scope.test.mjs",
    "tests/fieldgrid-customer-invoice-pdf-audit.test.mjs",
  ];
  return check("regression-tests", "Invoice canon regression tests are present for all previous sprints", tests.filter((path) => !exists(path)).map((path) => failure(`Missing regression test: ${path}`)));
}

function functionBlock(source, functionName) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  if (start === -1) return "";
  const next = source.indexOf("\nexport async function ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  return start === -1 || end === -1 ? "" : source.slice(start, end);
}

async function runOptionalPlaywrightSmoke() {
  const tenantBaseUrl = trimTrailingSlash(process.env.FIELDGRID_INVOICE_GATE_TENANT_BASE_URL || "");
  const tenantStorageState = process.env.FIELDGRID_INVOICE_GATE_TENANT_STORAGE_STATE || "";
  const tenantCookie = process.env.FIELDGRID_INVOICE_GATE_TENANT_COOKIE || "";
  const customerBaseUrl = trimTrailingSlash(process.env.FIELDGRID_INVOICE_GATE_CUSTOMER_BASE_URL || "");
  const customerStorageState = process.env.FIELDGRID_INVOICE_GATE_CUSTOMER_STORAGE_STATE || "";
  const customerCookie = process.env.FIELDGRID_INVOICE_GATE_CUSTOMER_COOKIE || "";
  const invoiceId = process.env.FIELDGRID_INVOICE_GATE_INVOICE_ID || "";

  if (!tenantBaseUrl && !customerBaseUrl) {
    return [{ status: "skipped", reason: "No FIELDGRID_INVOICE_GATE_* base URLs configured; static release gate still ran." }];
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const results = [];
  await mkdir(join(outputDir, "screenshots"), { recursive: true });

  try {
    if (tenantBaseUrl) {
      const context = await newContext(browser, tenantBaseUrl, tenantStorageState, tenantCookie);
      const page = await context.newPage();
      for (const route of routes) {
        results.push(await captureRoute(page, tenantBaseUrl, route));
      }
      if (invoiceId) {
        results.push(await captureRoute(page, tenantBaseUrl, { id: "invoice-detail", path: `/invoices/${invoiceId}`, label: "Factuurdetail", expectations: ["invoice-detail", "payment", "pdf"] }));
        results.push(await probeBinaryOrRedirect(context, `${tenantBaseUrl}/api/invoices/${invoiceId}/pdf`, "backoffice-invoice-pdf", [200]));
        results.push(await probeBinaryOrRedirect(context, `${tenantBaseUrl}/api/invoices/${invoiceId}/pay`, "backoffice-invoice-pay", [302, 404]));
      }
      await context.close();
    }

    if (customerBaseUrl) {
      const context = await newContext(browser, customerBaseUrl, customerStorageState, customerCookie);
      const page = await context.newPage();
      for (const route of customerRoutes) {
        results.push(await captureRoute(page, customerBaseUrl, route));
      }
      if (invoiceId) {
        results.push(await probeBinaryOrRedirect(context, `${customerBaseUrl}/api/factuur/${invoiceId}/pdf`, "customer-invoice-pdf", [200, 403, 404]));
        results.push(await probeBinaryOrRedirect(context, `${customerBaseUrl}/api/factuur/${invoiceId}/pay`, "customer-invoice-pay", [302, 403, 404]));
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function newContext(browser, baseUrl, storageState, cookieHeader) {
  const options = { viewport: { width: 1440, height: 1100 } };
  if (storageState && existsSync(resolve(root, storageState))) options.storageState = resolve(root, storageState);
  const context = await browser.newContext(options);
  const cookies = cookieFromHeader(cookieHeader, baseUrl);
  if (cookies.length > 0) await context.addCookies(cookies);
  return context;
}

async function captureRoute(page, baseUrl, route) {
  const url = `${baseUrl}${route.path}`;
  const screenshot = join(outputDir, "screenshots", `${route.id}.png`);
  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: screenshot, fullPage: true });
    const metrics = await page.evaluate((expectations) => {
      const text = document.body?.innerText || "";
      const links = Array.from(document.querySelectorAll("a[href]")).map((link) => link.getAttribute("href") || "");
      return {
        hasServerError: /Application error|server-side exception|Digest:|Pagina kon niet laden/iu.test(text),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        hasInvoiceText: /Factuur|Facturen|Concept|Verzonden|Betaald|Geannuleerd/iu.test(text),
        hasSettingsText: /Factuurnummering|Bedrijfsgegevens|Mollie|Preview|Test-PDF/iu.test(text),
        hasPaymentUi: /Betaallink|Betalen|Mollie|QR|iDEAL/iu.test(text) || links.some((href) => /\/pay|mollie|checkout/iu.test(href)),
        hasPdfUi: /PDF|downloaden/iu.test(text) || links.some((href) => /\/pdf/iu.test(href)),
        expectations,
      };
    }, route.expectations);
    const failures = [];
    const status = response?.status() ?? null;
    if (status !== null && status >= 500) failures.push({ id: "http-5xx", status });
    if (metrics.hasServerError) failures.push({ id: "server-error-text" });
    if (metrics.horizontalOverflow) failures.push({ id: "horizontal-overflow" });
    if (route.expectations.includes("invoice-list") && !metrics.hasInvoiceText) failures.push({ id: "missing-invoice-text" });
    if (route.expectations.includes("settings") && !metrics.hasSettingsText) failures.push({ id: "missing-settings-text" });
    if (route.expectations.includes("payment") && !metrics.hasPaymentUi) failures.push({ id: "missing-payment-ui" });
    if (route.expectations.includes("pdf") && !metrics.hasPdfUi) failures.push({ id: "missing-pdf-ui" });
    return { id: route.id, label: route.label, url, status: failures.length === 0 ? "captured" : "failed", httpStatus: status, screenshot, failures, metrics };
  } catch (error) {
    return { id: route.id, label: route.label, url, status: "failed", screenshot, error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeBinaryOrRedirect(context, url, id, allowedStatuses) {
  try {
    const response = await context.request.get(url, { maxRedirects: 0, timeout: 20000 });
    const status = response.status();
    return {
      id,
      url,
      status: allowedStatuses.includes(status) ? "captured" : "failed",
      httpStatus: status,
      contentType: response.headers()["content-type"] || "",
      failures: allowedStatuses.includes(status) ? [] : [{ id: "unexpected-http-status", status, allowedStatuses }],
    };
  } catch (error) {
    return { id, url, status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

function cookieFromHeader(header, baseUrl) {
  if (!header) return [];
  const origin = new URL(baseUrl).origin;
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...valueParts] = part.split("=");
      return { name, value: valueParts.join("="), url: origin, httpOnly: true, sameSite: "Lax" };
    })
    .filter((cookie) => cookie.name && cookie.value);
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/u, "");
}
