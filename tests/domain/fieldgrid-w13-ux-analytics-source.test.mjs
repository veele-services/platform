import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "artifacts/backoffice/src/lib/ux-analytics.ts"),
  "utf8",
);
const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

test("UX analytics does not transmit or persist events by itself", () => {
  assert.match(source, /window\.dispatchEvent/);
  assert.doesNotMatch(source, /fetch\(|sendBeacon|localStorage|sessionStorage/);
});

test("UX analytics schema excludes content and identity fields", () => {
  assert.doesNotMatch(
    source,
    /\b(query|email|fullName|address|notes?|signature|token|secret|userId|tenantId|entityId)\s*:/,
  );
  assert.match(source, /schemaVersion: 1/);
});

test("core forms track lifecycle without recording field values", () => {
  const hook = read("artifacts/backoffice/src/lib/use-ux-form-analytics.ts");
  for (const action of ["started", "completed", "abandoned"]) {
    assert.match(hook, new RegExp(`action: "${action}"`));
  }
  assert.match(hook, /mutation_error/);
  assert.doesNotMatch(
    hook,
    /\b(query|email|fullName|address|notes?|signature|token|secret|userId|tenantId|entityId)\s*:/,
  );

  const forms = [
    "artifacts/backoffice/src/components/objects/ObjectForm.tsx",
    "artifacts/backoffice/src/components/customers/CustomerForm.tsx",
    "artifacts/backoffice/src/components/personnel/PersonnelForm.tsx",
    "artifacts/backoffice/src/components/assignments/AssignmentForm.tsx",
    "artifacts/backoffice/src/components/task-codes/TaskCodeForm.tsx",
    "artifacts/backoffice/src/components/platform/PlatformSupportAccessPanel.tsx",
  ];
  for (const form of forms) {
    const formSource = read(form);
    assert.match(formSource, /useUxFormAnalytics/);
    assert.match(formSource, /onFocusCapture=\{trackFormStart\}/);
    assert.match(formSource, /trackFormComplete\(\)/);
    assert.match(formSource, /trackMutationError\(/);
  }
});

test("planboard and platform filters emit bounded interaction dimensions", () => {
  const planboard = read(
    "artifacts/backoffice/src/components/assignments/PlanningBoardView.tsx",
  );
  const filters = read(
    "artifacts/backoffice/src/components/platform/PlatformTenantFilters.tsx",
  );

  assert.match(planboard, /name: "planboard_action"/);
  assert.match(planboard, /action: "move"/);
  assert.match(planboard, /action: "undo"/);
  assert.match(filters, /name: "search_submitted"/);
  assert.match(filters, /name: "filter_changed"/);
  assert.match(filters, /name: "saved_view_changed"/);
  assert.doesNotMatch(filters, /query:\s*state\.q|email:|tenantId:/);
});

test("canonical loading and recoverable error states preserve layout", () => {
  const skeletons = read(
    "artifacts/backoffice/src/components/ui/canonical-page-skeletons.tsx",
  );
  const forbidden = read(
    "artifacts/backoffice/src/components/layout/ForbiddenPage.tsx",
  );
  const dashboardError = read(
    "artifacts/backoffice/src/app/(dashboard)/error.tsx",
  );

  for (const name of [
    "DashboardPageSkeleton",
    "DataListPageSkeleton",
    "DetailPageSkeleton",
    "PlanningPageSkeleton",
  ]) {
    assert.match(skeletons, new RegExp(`function ${name}`));
  }
  assert.match(skeletons, /role="status"/);
  assert.match(forbidden, /<Empty/);
  assert.match(forbidden, /Geen toegang tot deze pagina/);
  assert.doesNotMatch(forbidden, /\{resource\}|\{action\}/);
  assert.match(dashboardError, /<Empty/);
  assert.match(dashboardError, /Opnieuw proberen/);
  assert.doesNotMatch(dashboardError, /error\.digest/);
});
