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
