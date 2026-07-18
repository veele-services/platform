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

function assertIncludesAll(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should include ${phrase}`);
  }
}

test("dashboard and legacy assignment planning helpers are tenant scoped", () => {
  const assignments = read("artifacts/backoffice/src/app/actions/assignments.ts");

  assertIncludesAll(functionBody(assignments, "getDashboardCounts"), [
    "const tenantId = await requireCurrentTenantId();",
    ".where(eq(assignmentsTable.tenantId, tenantId))",
  ], "assignment dashboard counters");

  assertIncludesAll(functionBody(assignments, "getAssignmentsForWeek"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(assignmentsTable.tenantId, tenantId)",
    "eq(customersTable.tenantId, tenantId)",
    "eq(objectsTable.tenantId, tenantId)",
    "eq(personnelTable.tenantId, tenantId)",
    ".innerJoin(",
  ], "legacy week planning");

  assertIncludesAll(functionBody(assignments, "getCustomerOptions"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(customersTable.tenantId, tenantId)",
  ], "assignment customer options");

  assertIncludesAll(functionBody(assignments, "getObjectsByCustomer"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(objectsTable.tenantId, tenantId)",
  ], "assignment object options");

  assertIncludesAll(functionBody(assignments, "getPersonnelOptions"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(personnelTable.tenantId, tenantId)",
  ], "assignment personnel options");

  assertIncludesAll(functionBody(assignments, "getDayTimelineData"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(assignmentsTable.tenantId, tenantId)",
    "eq(customersTable.tenantId, tenantId)",
    "eq(personnelTable.tenantId, tenantId)",
    ".innerJoin(",
  ], "legacy day planning");
});

test("planning workbench reads and writes cannot cross tenant boundaries", () => {
  const planning = read("artifacts/backoffice/src/app/actions/planning.ts");

  assertIncludesAll(functionBody(planning, "getPlanningBoardData"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(assignmentsTable.tenantId, tenantId)",
    "eq(personnelTable.tenantId, tenantId)",
    "eq(customersTable.tenantId, tenantId)",
    "eq(objectsTable.tenantId, tenantId)",
    "eq(taskCodesTable.tenantId, tenantId)",
  ], "planning board data");

  assertIncludesAll(functionBody(planning, "getPersonnelForAssignment"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(assignmentsTable.tenantId, tenantId)",
    "eq(personnelTable.tenantId, tenantId)",
    "if (!assignmentRow) return null;",
  ], "planning personnel drawer");

  assertIncludesAll(functionBody(planning, "unassignPersonnel"), [
    "const tenantId = await requireCurrentTenantId();",
    "transitionAssignmentStaffing({",
    "tenantId,",
    "assignmentId,",
    "personnelId,",
    "reason: normalizedReason,"
  ], "planning unassign action");

  assertIncludesAll(functionBody(planning, "scheduleAssignmentOnBoard"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(assignmentsTable.tenantId, tenantId)",
    "eq(personnelTable.tenantId, tenantId)",
    "eq(customersTable.tenantId, tenantId)",
    "eq(objectsTable.tenantId, tenantId)",
    "eq(taskCodesTable.tenantId, tenantId)",
  ], "planning schedule action");
});

test("ticket inbox, detail, reply and status actions are tenant scoped", () => {
  const tickets = read("artifacts/backoffice/src/app/actions/tickets.ts");

  assertIncludesAll(functionBody(tickets, "listTickets"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(customerMessageThreadsTable.tenantId, tenantId)",
    "eq(personnelMessageThreadsTable.tenantId, tenantId)",
    "eq(customersTable.tenantId, tenantId)",
    "eq(personnelTable.tenantId, tenantId)",
  ], "ticket list");

  assertIncludesAll(functionBody(tickets, "getTicket"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(customerMessageThreadsTable.tenantId, tenantId)",
    "eq(personnelMessageThreadsTable.tenantId, tenantId)",
    "eq(customersTable.tenantId, tenantId)",
    "eq(personnelTable.tenantId, tenantId)",
    "eq(assignmentsTable.tenantId, tenantId)",
  ], "ticket detail");

  assertIncludesAll(functionBody(tickets, "replyToTicket"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(customerMessageThreadsTable.tenantId, tenantId)",
    "eq(personnelMessageThreadsTable.tenantId, tenantId)",
    "eq(customersTable.tenantId, tenantId)",
    "eq(personnelTable.tenantId, tenantId)",
  ], "ticket reply");

  assertIncludesAll(functionBody(tickets, "updateTicketStatus"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(customerMessageThreadsTable.tenantId, tenantId)",
    "eq(personnelMessageThreadsTable.tenantId, tenantId)",
  ], "ticket status");
});

test("object document counters and history are tenant scoped", () => {
  const objects = read("artifacts/backoffice/src/app/actions/objects.ts");

  assertIncludesAll(functionBody(objects, "getObjectStats"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(documentsTable.tenantId, tenantId)",
    "eq(documentsTable.entityType, \"object\")",
  ], "object stats");

  assertIncludesAll(functionBody(objects, "getObjectPerformance"), [
    "eq(documentsTable.tenantId, scope.tenantId)",
    "eq(documentsTable.entityType, \"object\")",
    "eq(documentsTable.entityId, objectId)",
  ], "object performance");

  assertIncludesAll(functionBody(objects, "listObjectHistory"), [
    "eq(documentsTable.tenantId, scope.tenantId)",
    "eq(documentsTable.entityType, \"object\")",
    "eq(documentsTable.entityId, objectId)",
  ], "object history");
});

test("availability and leave actions validate personnel tenant scope", () => {
  const availability = read("artifacts/backoffice/src/app/actions/availability.ts");

  assertIncludesAll(availability, [
    "async function hasTenantPersonnel",
    "const tenantId = await requireCurrentTenantId();",
    "eq(personnelTable.tenantId, tenantId)",
  ], "availability tenant helper");

  for (const name of [
    "getAvailabilityWindows",
    "setAvailabilityWindows",
    "listLeavePeriods",
    "addLeavePeriod",
    "updateLeavePeriod",
    "deleteLeavePeriod",
    "approveLeavePeriod",
    "rejectLeavePeriod",
    "getAvailabilityStatus",
  ]) {
    assert.match(
      functionBody(availability, name),
      /hasTenantPersonnel\(/u,
      `${name} should validate personnel tenant scope`,
    );
  }

  assertIncludesAll(functionBody(availability, "getPendingLeaveCount"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(personnelTable.tenantId, tenantId)",
    "eq(leavePeriodsTable.status, \"pending\")",
  ], "pending leave count");

  assertIncludesAll(functionBody(availability, "listAllPendingLeaveRequests"), [
    "const tenantId = await requireCurrentTenantId();",
    "eq(personnelTable.tenantId, tenantId)",
    "eq(leavePeriodsTable.status, \"pending\")",
  ], "pending leave list");
});
