import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function block(source, startMarker, endMarkers = ["export async function ", "async function ", "export function "]) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  let end = source.length;
  for (const marker of endMarkers) {
    const next = source.indexOf(marker, start + startMarker.length);
    if (next !== -1) end = Math.min(end, next);
  }
  return source.slice(start, end);
}

function assertIncludes(source, needle, label = needle) {
  assert.ok(source.includes(needle), `Expected ${label}`);
}

function assertNotIncludes(source, needle, label = needle) {
  assert.ok(!source.includes(needle), `Expected absence of ${label}`);
}

const gapRegister = JSON.parse(read("docs/readiness/backoffice-functional-gap-register.json"));
const auditDoc = read("docs/readiness/backoffice-functional-audit.md");

test("gap register and audit document cover the required backoffice audit contracts", () => {
  const ids = new Set(gapRegister.map((gap) => gap.id));
  const expectedIds = [
    "BFA-P0-001",
    "BFA-P0-002",
    "BFA-P0-003",
    "BFA-P0-004",
    "BFA-P0-005",
    "BFA-P1-006",
    "BFA-P1-007",
    "BFA-P1-008",
    "BFA-P1-009",
    "BFA-P1-010",
    "BFA-P1-011",
    "BFA-P1-012",
    "BFA-P1-013",
    "BFA-P1-014",
    "BFA-P1-015",
    "BFA-P1-016",
    "BFA-P1-017",
    "BFA-P1-018",
    "BFA-P1-019",
    "BFA-P1-020",
    "BFA-P1-021",
    "BFA-P1-022",
    "BFA-P1-023",
    "BFA-P1-024",
    "BFA-P2-025",
    "BFA-P2-026",
    "BFA-P2-027",
  ];

  assert.equal(gapRegister.length, expectedIds.length, "unexpected gap count");
  for (const id of expectedIds) {
    assert.ok(ids.has(id), `missing gap ${id}`);
    assertIncludes(auditDoc, id, `audit doc reference to ${id}`);
  }

  for (const gap of gapRegister) {
    assert.equal(gap.status, "open-source-reproduced", `${gap.id} status`);
    assert.ok(Array.isArray(gap.sourceEvidence) && gap.sourceEvidence.length > 0, `${gap.id} source evidence`);
    assert.ok(gap.currentBehavior, `${gap.id} current behavior`);
    assert.ok(gap.recommendedChange, `${gap.id} recommended change`);
    assert.ok(gap.runtimeEvidenceNeeded.length > 0, `${gap.id} runtime evidence needed`);
    assert.equal(gap.testLayer, "static source guard", `${gap.id} test layer`);
  }
});

test("legacy role UI remains disconnected from tenant RBAC runtime tables", () => {
  const rolesPage = read("artifacts/backoffice/src/app/(dashboard)/instellingen/rollen/page.tsx");
  const settingsActions = read("artifacts/backoffice/src/app/actions/settings.ts");
  const permissions = read("artifacts/backoffice/src/lib/auth/permissions.ts");

  assertIncludes(rolesPage, "listRoles");
  assertIncludes(rolesPage, "@/app/actions/settings");
  assertIncludes(settingsActions, "rolesTable");
  assertIncludes(settingsActions, "rolePermissionsTable");
  assertIncludes(block(settingsActions, "export async function updateRole("), ".update(rolesTable)");
  assertIncludes(block(settingsActions, "export async function updateRolePermissions("), ".delete(rolePermissionsTable)");
  assertIncludes(permissions, "tenantUserRolesTable");
  assertIncludes(permissions, "tenantRolesTable");
  assertIncludes(permissions, "tenantRolePermissionsTable");
});

test("settings, audit log, notification audience, and SMTP gaps remain source-reproducible", () => {
  const settingsActions = read("artifacts/backoffice/src/app/actions/settings.ts");
  const emailService = read("lib/db/src/email-service.ts");
  const orgSettingsSchema = read("lib/db/src/schema/organization-settings.ts");

  const updateOrg = block(settingsActions, "export async function updateOrganizationSettings(");
  assertIncludes(updateOrg, ".where(eq(organizationSettingsTable.tenantId, tenantId))");
  assertNotIncludes(updateOrg, ".returning(", "organization settings returning check");

  const updateMail = block(settingsActions, "export async function updateMailSettings(");
  assertIncludes(updateMail, "updateData.smtpPassword = data.smtpPassword.trim()");
  assertNotIncludes(updateMail, ".returning(", "mail settings returning check");
  assertIncludes(orgSettingsSchema, "smtpPassword");

  const auditLog = block(settingsActions, "export async function listAuditLog(");
  assertNotIncludes(auditLog, "requireCurrentTenantId", "tenant guard in listAuditLog");
  assertNotIncludes(auditLog, "auditLogTable.tenantId", "tenant filter in listAuditLog");

  const audience = block(settingsActions, "export async function getNotificationAudienceOptions(");
  assertNotIncludes(audience, "requireCurrentTenantId", "tenant guard in notification audience options");
  assertIncludes(audience, "personnelTable.isActive");
  assertIncludes(audience, "customersTable.isActive");

  assertIncludes(emailService, ".where(eq(organizationSettingsTable.smtpEnabled, true))");
  assertIncludes(emailService, "password: settings.smtpPassword");
});

test("assignment lifecycle, staffing, selection, and tenant gaps remain source-reproducible", () => {
  const assignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const statusStepper = read("artifacts/backoffice/src/components/assignments/AssignmentStatusStepper.tsx");
  const planning = read("artifacts/backoffice/src/app/actions/planning.ts");
  const personnelAssignments = read("artifacts/personeel-pwa/src/actions/assignments.ts");

  const updateAssignment = block(assignments, "export async function updateAssignment(");
  assertIncludes(updateAssignment, "status: data.status");
  assertNotIncludes(updateAssignment, "ASSIGNMENT_STATUS_TRANSITIONS", "transition guard in generic update");

  const setStatus = block(assignments, "export async function setAssignmentStatus(");
  assertIncludes(setStatus, "options?: { allowAny?: boolean }");
  assertIncludes(setStatus, "if (!options?.allowAny && !allowed.includes(newStatus))");
  assertIncludes(setStatus, "status_override");
  assertIncludes(statusStepper, "allowAny: true");

  const recalculate = block(assignments, "export async function recalculateAssignmentCapacity(");
  assertIncludes(recalculate, "requirePermission(\"planning\", \"write\")");
  assertNotIncludes(recalculate, "requireCurrentTenantId", "current tenant guard in recalculateAssignmentCapacity");

  assertIncludes(assignments, "greatest(count(DISTINCT tc.required_role_id)");
  assertIncludes(planning, "requiredPersonnelCount");
  assertIncludes(planning, "requiredSlots");

  const markCandidate = block(assignments, "export async function markInterestCandidate(");
  assertIncludes(markCandidate, "assignmentInterestResponsesTable");
  assertIncludes(markCandidate, "status");
  assertNotIncludes(markCandidate, "assignmentPersonnelTable", "actual assignment write in markInterestCandidate");

  assertIncludes(personnelAssignments, "status: \"completed\"");
  assertIncludes(personnelAssignments, "status: \"not_completed\"");
  assertIncludes(personnelAssignments, "assignmentsTable.status");
});

test("document portal contracts distinguish row tenant filtering from storage path tenant binding", () => {
  const customerDocs = read("artifacts/klant-pwa/src/actions/documents.ts");
  const backofficeDocs = read("artifacts/backoffice/src/app/actions/documents.ts");
  const mobileMore = read("artifacts/klant-pwa/src/app/(app)/meer/page.tsx");

  const download = block(customerDocs, "export async function getDocumentDownloadUrl(");
  assertIncludes(download, "eq(documentsTable.tenantId, identity.tenantId)");
  assertIncludes(download, ".createSignedUrl(doc.storagePath, 3600)");
  assertNotIncludes(download, "getTenantBoundStoragePath", "tenant-bound storage path helper in customer portal");
  assertNotIncludes(download, "requireModule", "documents module guard in customer portal download");

  const myDocs = block(customerDocs, "export async function getMyDocuments(");
  assertNotIncludes(myDocs, "eq(documentsTable.tenantId, identity.tenantId)", "document row tenant filter in all list branches");
  assertNotIncludes(myDocs, "requireModule", "documents module guard in customer portal list");

  assertIncludes(backofficeDocs, "getSafeDocumentStoragePath");
  assertIncludes(mobileMore, "/documenten");
});

test("personnel portal availability, leave, and qualification gaps remain source-reproducible", () => {
  const pwaAvailability = read("artifacts/personeel-pwa/src/actions/availability.ts");
  const pwaLeave = read("artifacts/personeel-pwa/src/actions/leave.ts");
  const qualifications = read("artifacts/backoffice/src/app/actions/qualifications.ts");

  assertIncludes(pwaAvailability, ".from(organizationSettingsTable)");
  assertIncludes(pwaAvailability, ".limit(1)");
  assertNotIncludes(pwaAvailability, "requireCurrentPersonnelPortalTenantId", "tenant guard in PWA availability action");

  assertIncludes(pwaLeave, ".from(organizationSettingsTable)");
  assertIncludes(pwaLeave, ".limit(1)");
  assertNotIncludes(pwaLeave, "requireCurrentPersonnelPortalTenantId", "tenant guard in PWA leave action");

  const upsertQualification = block(qualifications, "export async function upsertPersonnelQualification(");
  assertIncludes(upsertQualification, "qualificationId");
  assertIncludes(upsertQualification, "personnelQualificationsTable");
  assertNotIncludes(upsertQualification, "qualificationsTable.tenantId", "same-tenant qualification proof");
});

test("report approval and invoice proposal contracts remain non-atomic in source", () => {
  const reports = read("artifacts/backoffice/src/app/actions/reports.ts");
  const proposals = read("artifacts/backoffice/src/lib/invoice-proposals.ts");
  const invoicesSchema = read("lib/db/src/schema/invoices.ts");

  const approveReport = block(reports, "export async function approveReport(");
  assertIncludes(approveReport, "await createInvoiceProposalForAssignment");
  assertIncludes(approveReport, "catch (error)");
  assertIncludes(approveReport, "console.error(\"invoice proposal creation after report approval failed\"");
  assertNotIncludes(approveReport, "db.transaction", "transaction around report approval");

  const createProposal = block(proposals, "export async function createInvoiceProposalForAssignment(");
  assertIncludes(createProposal, ".where(eq(assignmentsTable.id, input.assignmentId))");
  assertNotIncludes(createProposal, "assignmentsTable.tenantId", "tenant parameter on invoice proposal assignment lookup");
  assertIncludes(createProposal, ".insert(invoicesTable)");
  assertNotIncludes(createProposal, "db.transaction", "transaction around invoice proposal create");
  assertNotIncludes(invoicesSchema, "uniqueIndex(\"invoices_active_assignment", "active invoice uniqueness constraint");
});

test("tickets, notifications, events, and route side effects remain source-reproducible", () => {
  const modulePermissions = read("lib/db/src/module-permissions.ts");
  const backofficeTickets = read("artifacts/backoffice/src/app/actions/tickets.ts");
  const personnelMessages = read("artifacts/personeel-pwa/src/actions/messages.ts");
  const customerNotifications = read("artifacts/klant-pwa/src/actions/notifications.ts");
  const personnelNotifications = read("artifacts/personeel-pwa/src/actions/notifications.ts");
  const events = read("lib/db/src/events.ts");
  const routeRefresh = read("artifacts/backoffice/src/lib/planning/route-refresh.ts");
  const planningRealtime = read("lib/db/src/planning-realtime.ts");

  assertIncludes(modulePermissions, "notifications: \"notifications\"");
  assertNotIncludes(modulePermissions, "tickets:", "tickets module entitlement mapping");
  assertIncludes(backofficeTickets, "requirePermission(\"tickets\"");

  const createMyTicket = block(personnelMessages, "export async function createMyTicket(");
  assertNotIncludes(createMyTicket, "emitDomainEvent", "general personnel ticket event emission");
  const createAssignmentQuestion = block(personnelMessages, "export async function askQuestionAboutAssignment(");
  assertIncludes(createAssignmentQuestion, "emitDomainEvent");

  assertIncludes(customerNotifications, ".update(customerNotificationsTable)");
  assertNotIncludes(customerNotifications, ".returning(", "customer notification affected-row proof");
  assertIncludes(personnelNotifications, ".update(personnelNotificationsTable)");
  assertNotIncludes(personnelNotifications, ".returning(", "personnel notification affected-row proof");

  assertIncludes(events, ".insert(domainEventsTable)");
  assertIncludes(events, ".insert(auditLogTable)");
  assertIncludes(events, ".insert(notificationDeliveryQueueTable)");
  assertIncludes(routeRefresh, "safeRefreshPlanningRoutesForAssignment");
  assertIncludes(routeRefresh, "console.error(\"planning route refresh failed\"");
  assertIncludes(planningRealtime, "safelyInvalidateAssignmentRouteContexts");
  assertIncludes(planningRealtime, "console.error(\"planning route context invalidation failed\"");
});
