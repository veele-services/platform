import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

const customerPage = read(
  "artifacts/backoffice/src/app/(dashboard)/customers/[id]/page.tsx",
);
const customerActions = read(
  "artifacts/backoffice/src/app/actions/customers.ts",
);
const assignmentPage = read(
  "artifacts/backoffice/src/app/(dashboard)/assignments/[id]/page.tsx",
);
const assignmentActions = read(
  "artifacts/backoffice/src/app/actions/assignments.ts",
);
const personnelPage = read(
  "artifacts/backoffice/src/app/(dashboard)/personnel/[id]/page.tsx",
);
const platformTenantPage = read(
  "artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx",
);

test("customer detail gates cross-module loaders and navigation", () => {
  assert.match(customerPage, /hasPermission\("objects",\s+"read"\)/u);
  assert.match(customerPage, /const visibleTabs = VALID_TABS\.filter/u);
  assert.match(
    customerPage,
    /canReadObjects && \(showOverview \|\| activeTab === "objecten"\)[\s\S]*\? listObjectsForCustomer\(id\)[\s\S]*: Promise\.resolve\(\[\]\)/u,
  );
  assert.match(
    customerPage,
    /canManagePortalUsers && showOverview[\s\S]*\? listCustomerPortalUsers\(id\)[\s\S]*: Promise\.resolve\(\[\]\)/u,
  );
  for (const permission of ["objects", "assignments", "invoices"]) {
    assert.match(
      customerActions,
      new RegExp(`hasPermission\\("${permission}", "read"\\)`, "u"),
      permission,
    );
  }
});

test("assignment planning and workflow tabs fail closed", () => {
  assert.match(assignmentPage, /hasPermission\("planning", "read"\)/u);
  assert.match(assignmentPage, /hasPermission\("planning", "write"\)/u);
  assert.match(assignmentPage, /const visibleTabs: AssignmentDetailTab\[\]/u);
  assert.match(
    assignmentPage,
    /canManagePlanning=\{canWrite && canWritePlanning\}/u,
  );
  assert.match(
    assignmentActions,
    /await requirePermission\("planning", "read"\)/u,
  );
});

test("personnel detail does not load inaccessible related modules", () => {
  assert.match(
    personnelPage,
    /canReadAssignments \? listAssignmentsForPersonnel\(id\) : Promise\.resolve\(\[\]\)/u,
  );
  assert.match(
    personnelPage,
    /canReadDocuments\s+\? listDocuments/u,
  );
  assert.match(
    personnelPage,
    /canReadObjects \? getLinkedObjects\(id\) : Promise\.resolve\(\[\]\)/u,
  );
  assert.match(personnelPage, /canManagePortal=\{canManagePortal\}/u);
});

test("platform tenant detail authorizes before starting data loaders", () => {
  const functionStart = platformTenantPage.indexOf(
    "export default async function PlatformTenantDetailPage",
  );
  const authorization = platformTenantPage.indexOf(
    "await requirePlatformAdmin();",
    functionStart,
  );
  const firstLoader = platformTenantPage.indexOf(
    "getPlatformTenantDetail(tenantId)",
    functionStart,
  );
  assert.ok(functionStart >= 0);
  assert.ok(authorization > functionStart);
  assert.ok(firstLoader > authorization);
});
