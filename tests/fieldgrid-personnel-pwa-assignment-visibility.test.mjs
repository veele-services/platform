import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("personnel work orders are resolved inside the current portal tenant", () => {
  const assignments = read("artifacts/personeel-pwa/src/actions/assignments.ts");

  assert.ok(assignments.includes("requireCurrentPersonnelPortalTenantId"));
  assert.ok(assignments.includes("const tenantId = await requireCurrentPersonnelPortalTenantId()"));
  assert.ok(assignments.includes(".eq(\"tenant_id\", tenantId)"));
  assert.ok(assignments.includes("eq(assignmentsTable.tenantId, personnel.tenantId)"));
});

test("personnel work order list uses the canonical assignment link query", () => {
  const assignments = read("artifacts/personeel-pwa/src/actions/assignments.ts");

  assert.ok(assignments.includes(".from(assignmentPersonnelTable)"));
  assert.ok(assignments.includes(".innerJoin(assignmentsTable"));
  assert.ok(assignments.includes(".leftJoin(customersTable"));
  assert.ok(assignments.includes(".leftJoin(objectsTable"));
  assert.ok(assignments.includes("eq(assignmentPersonnelTable.status, \"assigned\")"));
  assert.ok(assignments.includes("eq(assignmentsTable.isActive, true)"));
  assert.ok(!assignments.includes(".from(\"assignment_personnel\")"));
});

test("personnel home shows legacy assigned plannable rows as upcoming services", () => {
  const home = read("artifacts/personeel-pwa/src/app/(app)/page.tsx");

  assert.ok(home.includes("ACTIVE_ASSIGNMENT_STATUSES"));
  assert.ok(home.includes("\"plannable\""));
  assert.ok(home.includes("\"scheduled\""));
  assert.ok(home.includes("\"seen\""));
  assert.ok(home.includes("\"in_progress\""));
});

test("open personnel assignments also use the host-bound tenant context", () => {
  const openAssignments = read("artifacts/personeel-pwa/src/actions/open-assignments.ts");

  assert.ok(openAssignments.includes("requireCurrentPersonnelPortalTenantId"));
  assert.ok(openAssignments.includes("const tenantId = await requireCurrentPersonnelPortalTenantId()"));
  assert.ok(openAssignments.includes("eq(personnelTable.tenantId, tenantId)"));
});
