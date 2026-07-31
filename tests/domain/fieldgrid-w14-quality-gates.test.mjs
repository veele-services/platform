import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildVisualRegressionPlan,
  visualRegressionViewports,
} from "../../scripts/fieldgrid-visual-regression-snapshots.mjs";
import { scanReleasedSources } from "../../scripts/fieldgrid-uiux-master-gate.mjs";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("W14 visual plan covers the required widths and 200 percent zoom", () => {
  const dimensions = new Set(
    visualRegressionViewports.map(
      (viewport) => `${viewport.width}x${viewport.height}`,
    ),
  );
  for (const required of [
    "320x568",
    "390x844",
    "430x932",
    "768x1024",
    "1024x768",
    "1280x800",
    "1440x1100",
    "1920x1080",
  ]) {
    assert.ok(dimensions.has(required), `missing viewport ${required}`);
  }
  assert.ok(
    visualRegressionViewports.some((viewport) => viewport.cssZoom === 2),
    "missing 200% zoom scenario",
  );
});

test("W14 visual plan separates every required authorization persona", () => {
  const plan = buildVisualRegressionPlan({}, { target: "all" });
  assert.deepEqual(plan.errors, []);
  const personas = plan.groups.flatMap((group) =>
    group.personas.map((persona) => persona.id),
  );
  assert.deepEqual(personas, [
    "platform-owner",
    "platform-admin",
    "platform-support",
    "tenant-management",
    "tenant-planner",
    "tenant-administration",
    "customer",
    "personnel",
  ]);
});

test("W14 portal snapshots use real basePath-relative routes", () => {
  const plan = buildVisualRegressionPlan({}, { target: "all" });
  const customer = plan.groups.find((group) => group.id === "customer-portal");
  const personnel = plan.groups.find((group) => group.id === "personnel-portal");

  assert.deepEqual(customer?.routes, [
    "/",
    "/opdrachten",
    "/objecten",
    "/financieel",
    "/documenten",
    "/meldingen/tickets",
    "/help",
  ]);
  assert.deepEqual(personnel?.routes, [
    "/",
    "/opdrachten",
    "/openstaand",
    "/uren",
    "/berichten",
    "/beschikbaarheid",
    "/documenten",
    "/help",
  ]);
  assert.ok(!customer?.routes.includes("/dashboard"));
  assert.ok(!personnel?.routes.includes("/planning"));
});

test("W14 visual runtime fails auth, accessibility, touch and screenshot regressions", () => {
  const source = read("scripts/fieldgrid-visual-regression-snapshots.mjs");

  for (const contract of [
    /response\.status\(\) >= 400/u,
    /authRedirected/u,
    /samePathname\(finalUrl, url\)/u,
    /viewport\.width <= 430 && metrics\.undersizedControlCount > 0/u,
    /rect\.width < 44 \|\| rect\.height < 44/u,
    /verifyKeyboardFocus/u,
    /page\.keyboard\.press\("Tab"\)/u,
    /AxeBuilder/u,
    /seriousOrCriticalViolations/u,
    /baseline\.status === "changed"/u,
    /requireBaselines && baseline\.status === "missing"/u,
    /createHash\("sha256"\)/u,
    /getComparator\("image\/png"\)/u,
    /maxDiffPixelRatio/u,
    /\.diff\.png/u,
    /if \(runtimeReady && plan\.errors\.length === 0\)/u,
    /runVisualRegressionSnapshots\(\{[\s\S]*strict: true/u,
    /"not-run-authenticated-base-url-or-state-missing"/u,
  ]) {
    assert.match(source, contract);
  }
});

test("released sources do not add forbidden interaction or brand literals", () => {
  const findings = scanReleasedSources();
  assert.deepEqual(
    findings.filter((finding) =>
      [
        "DIRECT_RADIX_IMPORT",
        "BROWSER_DIALOG",
        "HARDCODED_BRAND_COLOR",
      ].includes(finding.rule),
    ),
    [],
  );
});

test("canonical data views expose sorting, loading and responsive alternatives", () => {
  const dataView = read(
    "artifacts/backoffice/src/components/ui/fieldgrid-data-view.tsx",
  );
  for (const contract of [
    /aria-sort=\{ariaSort\}/,
    /aria-busy=\{loading\}/,
    /filteredEmptyTitle/,
    /mobile-skeleton-/,
    /hidden md:block/,
    /md:hidden/,
  ]) {
    assert.match(dataView, contract);
  }
  assert.match(dataView, /containerClassName="max-h-\[70dvh\]"/);
});

test("high-risk layouts remain bounded at narrow and tablet widths", () => {
  const inventoryQr = read(
    "artifacts/backoffice/src/app/(dashboard)/inventory/[id]/qr/page.tsx",
  );
  const knowledgebaseCategories = read(
    "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/categories/page.tsx",
  );
  const releaseCategories = read(
    "artifacts/backoffice/src/app/(platform)/platform/releases/categories/page.tsx",
  );
  const websiteRenderer = read("lib/shared-ui/src/website-renderer.tsx");

  assert.match(inventoryQr, /w-full max-w-\[360px\]/);
  assert.match(inventoryQr, /lg:grid-cols-/);
  assert.doesNotMatch(knowledgebaseCategories, /md:grid-cols-\[1fr_1fr/);
  assert.match(knowledgebaseCategories, /xl:grid-cols-\[1fr_1fr/);
  assert.doesNotMatch(releaseCategories, /md:grid-cols-\[1fr_1fr/);
  assert.match(releaseCategories, /xl:grid-cols-\[1fr_1fr/);
  assert.match(websiteRenderer, /overflow-wrap:anywhere/);
});

test("canonical overlays use semantic layers and reduced-motion fallbacks", () => {
  for (const relativePath of [
    "artifacts/backoffice/src/components/ui/dialog.tsx",
    "artifacts/backoffice/src/components/ui/alert-dialog.tsx",
    "artifacts/backoffice/src/components/ui/sheet.tsx",
    "artifacts/backoffice/src/components/ui/popover.tsx",
    "artifacts/backoffice/src/components/ui/select.tsx",
    "artifacts/backoffice/src/components/ui/dropdown-menu.tsx",
  ]) {
    const source = read(relativePath);
    assert.match(source, /--z-(?:dropdown|overlay|modal)/, relativePath);
    assert.match(source, /motion-reduce:/, relativePath);
  }
});

test("critical planning paths retain pointer-free operation and live feedback", () => {
  const planboard = read(
    "artifacts/backoffice/src/components/assignments/PlanningBoardView.tsx",
  );
  for (const contract of [
    /aria-label="Mobiele dagagenda"/,
    /event\.key === "ArrowLeft"/,
    /event\.key === "ArrowRight"/,
    /event\.key === "Enter"/,
    /event\.key === "Escape"/,
    /aria-live="polite"/,
    /Ongedaan maken/,
  ]) {
    assert.match(planboard, contract);
  }
});

test("loading, error and forbidden states do not expose private diagnostics", () => {
  const dashboardError = read(
    "artifacts/backoffice/src/app/(dashboard)/error.tsx",
  );
  const platformError = read(
    "artifacts/backoffice/src/app/(platform)/platform/error.tsx",
  );
  const forbidden = read(
    "artifacts/backoffice/src/components/layout/ForbiddenPage.tsx",
  );
  for (const source of [dashboardError, platformError]) {
    assert.match(source, /Opnieuw proberen/);
    assert.match(source, /role="alert"/);
    assert.match(source, /aria-live="assertive"/);
    assert.match(source, /errorRef\.current\?\.focus\(\)/);
    assert.doesNotMatch(source, /error\.digest|error\.message/);
  }
  assert.doesNotMatch(forbidden, /\{resource\}|\{action\}/);
});

test("compact buttons retain 44 pixel targets and form errors are associated", () => {
  const button = read("artifacts/backoffice/src/components/ui/button.tsx");
  const assignmentForm = read(
    "artifacts/backoffice/src/components/assignments/AssignmentForm.tsx",
  );
  const customerForm = read(
    "artifacts/backoffice/src/components/customers/CustomerForm.tsx",
  );

  assert.match(button, /sm: "min-h-11/);
  assert.match(button, /"icon-sm": "size-11"/);
  for (const source of [assignmentForm, customerForm]) {
    assert.match(source, /aria-describedby=/);
    assert.match(source, /role="alert"/);
  }
});

test("privacy-safe analytics cannot accept product content or identities", () => {
  const analytics = read("artifacts/backoffice/src/lib/ux-analytics.ts");
  assert.doesNotMatch(
    analytics,
    /\b(query|email|fullName|address|notes?|signature|token|secret|userId|tenantId|entityId)\s*:/,
  );
  assert.doesNotMatch(
    analytics,
    /fetch\(|sendBeacon|localStorage|sessionStorage/,
  );
});
