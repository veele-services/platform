import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBody(content, name) {
  const marker = `export async function ${name}`;
  const start = content.indexOf(marker);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = content.indexOf("\nexport async function ", start + marker.length);
  return content.slice(start, next === -1 ? content.length : next);
}

test("smart planning capacity only considers active personnel from the assignment tenant", () => {
  const planning = read("lib/db/src/planning-intelligence.ts");
  const body = functionBody(planning, "calculateAssignmentCapacity");

  assert.match(body, /eq\(personnelTable\.tenantId,\s*assignment\.tenantId\)/u);
  assert.match(body, /eq\(personnelTable\.isActive,\s*true\)/u);
});

test("assignment detail eligibility excludes already assigned and non-tenant personnel", () => {
  const assignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const body = functionBody(assignments, "getPersonnelEligibilityForAssignment");

  assert.match(body, /const tenantId = await requireCurrentTenantId\(\)/u);
  assert.match(body, /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u);
  assert.match(body, /eq\(personnelTable\.tenantId,\s*tenantId\)/u);
  assert.match(body, /eq\(personnelTable\.isActive,\s*true\)/u);
  assert.match(body, /eq\(personnelTable\.isAvailable,\s*true\)/u);
  assert.match(body, /const currentPersonnelIds = new Set/u);
  assert.match(body, /candidatePersonnelRows = personnelRows\.filter\(\(p\) => !currentPersonnelIds\.has\(p\.id\)\)/u);
});

test("assignment personnel linking is tenant-scoped, active-only and idempotent", () => {
  const assignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const body = functionBody(assignments, "assignPersonnel");

  assert.match(body, /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u);
  assert.match(body, /eq\(personnelTable\.tenantId,\s*tenantId\)/u);
  assert.match(body, /if \(!personnel\.isActive\)/u);
  assert.match(body, /existingLink\?\.status === "assigned"/u);
  assert.match(body, /\.update\(assignmentPersonnelTable\)/u);
  assert.match(body, /previousStatus:\s*existingLink\?\.status/u);
});

test("assignment detail UI refreshes and removes already-linked personnel from candidate picker", () => {
  const component = read("artifacts/backoffice/src/components/assignments/AssignmentDetailActions.tsx");

  assert.match(component, /useEffect/u);
  assert.match(component, /optimisticAssignedPersonnelIds/u);
  assert.match(component, /setOptimisticAssignedPersonnelIds/u);
  assert.match(component, /router\.refresh\(\)/u);
  assert.match(component, /\.filter\(\(p\) => !optimisticAssignedPersonnelIds\.has\(p\.id\)\)/u);
});

test("assignment detail prioritizes work-order information after personnel is linked", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/assignments/[id]/page.tsx");

  assert.match(page, /WorkOrderOverviewSection/u);
  assert.match(page, /AssignmentTaskManager/u);
  assert.match(page, /Werkboninformatie/u);
  assert.match(page, /Klantdata/u);
  assert.match(page, /Adresgegevens|Object & adres/u);
  assert.match(page, /Checklist & taken/u);
  assert.match(page, /taskCodes=\{taskCodes\}/u);
  assert.match(page, /tasks=\{assignment\.tasks\}/u);
  assert.match(page, /showPlanningFirst/u);
  assert.match(page, /activeTab === "werkbon"/u);
  assert.match(page, /activeTab === "planning"/u);
  assert.match(page, /tabHref\("planning"\)/u);
});

test("assignment tasks are managed from the work-order tab with a 2/3 overview and 1/3 create panel", () => {
  const component = read("artifacts/backoffice/src/components/assignments/AssignmentDetailActions.tsx");

  assert.match(component, /export function AssignmentTaskManager/u);
  assert.match(component, /Takenoverzicht/u);
  assert.match(component, /Taak toevoegen/u);
  assert.match(component, /xl:grid-cols-\[minmax\(0,2fr\)_minmax\(280px,1fr\)\]/u);
  assert.match(component, /Kies een actieve taakcode voor deze organisatie/u);
  assert.match(component, /Toevoegen aan werkbon/u);
});

test("assignment task options and mutations are scoped to the current tenant", () => {
  const assignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const optionsBody = functionBody(assignments, "getTaskCodeOptions");
  const addBody = functionBody(assignments, "addAssignmentTask");
  const removeBody = functionBody(assignments, "removeAssignmentTask");

  assert.match(optionsBody, /const tenantId = await requireCurrentTenantId\(\)/u);
  assert.match(optionsBody, /eq\(taskCodesTable\.tenantId,\s*tenantId\)/u);
  assert.match(addBody, /const tenantId = await requireCurrentTenantId\(\)/u);
  assert.match(addBody, /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u);
  assert.match(addBody, /eq\(taskCodesTable\.tenantId,\s*tenantId\)/u);
  assert.match(addBody, /taskCodeCode:\s*taskCode\.code/u);
  assert.match(addBody, /taskCodeName:\s*taskCode\.name/u);
  assert.match(removeBody, /const tenantId = await requireCurrentTenantId\(\)/u);
  assert.match(removeBody, /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u);
});

test("assignment detail status ellipsis opens an all-status dropdown with confirmation", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/assignments/[id]/page.tsx");
  const component = read("artifacts/backoffice/src/components/assignments/AssignmentStatusStepper.tsx");
  const assignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const statusBody = functionBody(assignments, "setAssignmentStatus");

  assert.match(page, /AssignmentStatusStepper/u);
  assert.match(page, /assignmentId=\{assignment\.id\}/u);
  assert.match(page, /canWrite=\{canWrite\}/u);
  assert.match(component, /DropdownMenuTrigger/u);
  assert.match(component, /DropdownMenuContent/u);
  assert.match(component, /max-h-72/u);
  assert.match(component, /overflow-y-auto/u);
  assert.match(component, /const allStatuses = useMemo/u);
  assert.match(component, /statuses=\{allStatuses\}/u);
  assert.match(component, /AlertDialogTitle>Status wijzigen\?/u);
  assert.match(component, /allowAny:\s*true/u);
  assert.match(statusBody, /options\?: \{ allowAny\?: boolean \}/u);
  assert.match(statusBody, /ASSIGNMENT_STATUSES\.includes\(newStatus\)/u);
  assert.match(statusBody, /!options\?\.allowAny && !allowed\.includes\(newStatus\)/u);
  assert.match(statusBody, /status_override/u);
});
