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

function assertBefore(source, guard, sideEffect, label) {
  const guardIndex = source.indexOf(guard);
  const sideEffectIndex = source.indexOf(sideEffect);
  assert.notEqual(guardIndex, -1, `${label} should include ${guard}`);
  assert.notEqual(sideEffectIndex, -1, `${label} should include ${sideEffect}`);
  assert.ok(
    guardIndex < sideEffectIndex,
    `${label} should enforce the finance entitlement before ${sideEffect}`,
  );
}

test("customer finance actions enforce the tenant module before mutations and provider calls", () => {
  const payments = read("artifacts/klant-pwa/src/actions/payments.ts");
  const assignments = read("artifacts/klant-pwa/src/actions/assignments.ts");

  const invoicePayment = functionBlock(
    payments,
    "createCustomerInvoicePayment",
  );
  assertBefore(
    invoicePayment,
    'isCustomerPortalFeatureEnabled("finance", auth.tenantId)',
    "prepareDirectPaymentIntent",
    "direct invoice payment",
  );

  const batchPayment = functionBlock(payments, "createCustomerBatchPayment");
  assertBefore(
    batchPayment,
    'isCustomerPortalFeatureEnabled("finance", auth.tenantId)',
    "prepareCollectionPaymentIntent",
    "batch payment",
  );

  const approveQuote = functionBlock(assignments, "approveQuote");
  assertBefore(
    approveQuote,
    'isCustomerPortalFeatureEnabled("finance", identity.tenantId)',
    "acceptCustomerQuote",
    "quote approval",
  );

  const rejectQuote = functionBlock(assignments, "rejectQuote");
  assertBefore(
    rejectQuote,
    'isCustomerPortalFeatureEnabled("finance", identity.tenantId)',
    "db.transaction",
    "quote rejection",
  );
});

test("customer finance download and redirect routes deny disabled tenants before work", () => {
  const routes = [
    {
      path: "artifacts/klant-pwa/src/app/api/factuur/[id]/pay/route.ts",
      sideEffect: "db",
    },
    {
      path: "artifacts/klant-pwa/src/app/api/factuur/[id]/pdf/route.ts",
      sideEffect: "generateCustomerInvoicePdf",
    },
    {
      path: "artifacts/klant-pwa/src/app/api/offerte/[id]/pdf/route.ts",
      sideEffect: "generateCustomerQuotePdf",
    },
    {
      path: "artifacts/klant-pwa/src/app/api/verzamelfactuur/[id]/pdf/route.ts",
      sideEffect: "new PDFDocument",
    },
  ];

  for (const route of routes) {
    const source = read(route.path);
    const handler = functionBlock(source, "GET");
    assertBefore(
      handler,
      'isCustomerPortalFeatureEnabled("finance", identity.tenantId)',
      route.sideEffect,
      route.path,
    );
    assert.match(
      handler,
      /return new NextResponse\("Not found", \{ status: 404 \}\)/u,
    );
  }
});

test("customer module redirects and finance deep links remain basePath safe", () => {
  const features = read("artifacts/klant-pwa/src/lib/portal-features.ts");
  const routes = read("lib/db/src/portal-routes.ts");

  assert.match(features, /const CUSTOMER_PORTAL_BASE_PATH = "\/klant"/u);
  assert.match(features, /redirect\(withCustomerPortalBasePath\(fallback\)\)/u);
  assert.match(routes, /"\/financieel"/u);
  assert.match(routes, /"\/api\/offerte"/u);
});

test("customer assignments hide finance UI by module and show running actual time through now", () => {
  const list = read("artifacts/klant-pwa/src/app/(app)/opdrachten/page.tsx");
  const detail = read(
    "artifacts/klant-pwa/src/app/(app)/opdrachten/[id]/page.tsx",
  );

  assert.match(list, /getCustomerPortalFeatureFlags\(\)/u);
  assert.match(list, /assignmentColumns\(featureFlags\.finance\)/u);
  assert.match(list, /featureFlags\.finance && actionRequired\.length > 0/u);
  assert.match(
    list,
    /!financeEnabled && assignment\.status === "awaiting_approval"[\s\S]*"In behandeling"/u,
  );
  assert.match(list, /\$\{actualStart\} - \$\{actualEnd \?\? "nu"\}/u);
  assert.match(list, /Gepland\{" "\}/u);
  assert.match(detail, /featureFlags\.finance && \(quote \|\| invoice\)/u);
  assert.match(
    detail,
    /!featureFlags\.finance && assignment\.status === "awaiting_approval"[\s\S]*"In behandeling"/u,
  );
  assert.match(detail, /\$\{actualStart\} - \$\{actualEnd \?\? "nu"\}/u);
  assert.match(
    detail,
    /assignment\.actualStartedAt[\s\S]*\? "in_progress"[\s\S]*customerTimelinePhase/u,
  );
  assert.match(detail, /Gepland tijdvenster/u);
});
