import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBody(content, name) {
  const marker = new RegExp(`(?:export\\s+)?async function ${name}\\b`, "u");
  const match = marker.exec(content);
  assert.ok(match, `${name} should exist`);
  const start = match.index;
  const next = content.slice(start + 1).search(/\n(?:export\s+)?async function \w+/u);
  return content.slice(start, next === -1 ? content.length : start + 1 + next);
}

test("interest candidate selection creates the canonical assigned link before confirmation", () => {
  const service = read("lib/db/src/assignment-interest-scheduling.ts");
  const body = functionBody(service, "selectInterestCandidateForScheduling");

  assert.match(body, /return db\.transaction\(async \(tx\) =>/u);
  assert.match(body, /lockTenantAssignment\(tx, input\.assignmentId, input\.tenantId\)/u);
  assert.match(body, /eq\(personnelTable\.tenantId,\s*input\.tenantId\)/u);
  assert.match(body, /eq\(assignmentInterestResponsesTable\.tenantId,\s*input\.tenantId\)/u);
  assert.match(body, /\.insert\(assignmentPersonnelTable\)/u);
  assert.match(body, /status:\s*"assigned"/u);
  assert.match(body, /assignedAt:\s*now/u);
  assert.match(body, /assignedBy:\s*input\.actorUserId/u);
  assert.match(body, /\.onConflictDoUpdate/u);
  assert.match(body, /set:\s*\{[\s\S]*status:\s*"assigned"/u);
  assert.match(body, /\.update\(assignmentInterestResponsesTable\)[\s\S]*status:\s*"confirmed"/u);
});

test("reserve and cancel decisions do not silently create or delete assigned links", () => {
  const service = read("lib/db/src/assignment-interest-scheduling.ts");
  const body = functionBody(service, "selectInterestCandidateForScheduling");

  assert.match(body, /input\.decision === "reserve"[\s\S]*status:\s*"reserve"/u);
  assert.match(body, /assignmentPersonnelId:\s*null/u);
  assert.match(body, /input\.decision === "cancelled"[\s\S]*existingLink\?\.status === "assigned"/u);
  assert.match(body, /via de ontkoppel-flow/u);
  assert.doesNotMatch(body, /delete\(assignmentPersonnelTable\)/u);
});

test("candidate eligibility is re-run server-side before assignment", () => {
  const service = read("lib/db/src/assignment-interest-scheduling.ts");
  const body = functionBody(service, "validateCandidateEligibility");

  assert.match(body, /!personnel\.isActive/u);
  assert.match(body, /!personnel\.isAvailable/u);
  assert.match(body, /leavePeriodsTable/u);
  assert.match(body, /availabilityDayEntriesTable/u);
  assert.match(body, /availabilityWindowsTable/u);
  assert.match(body, /assignmentPersonnelTable\.status,\s*"assigned"/u);
  assert.match(body, /Deze medewerker heeft al een overlappende opdracht/u);
  assert.match(body, /requiredRoleIds/u);
  assert.match(body, /requiredCertificates/u);
  assert.match(body, /requiredDiplomas/u);
  assert.match(body, /requiredKnowledge/u);
  assert.match(body, /sectorId && personnel\.sectorId !== sectorId/u);
  assert.match(body, /requiredRegion && !candidateRegions\.includes\(requiredRegion\)/u);
});

test("final slot scheduling uses plannable to scheduled and assigned-count readiness", () => {
  const service = read("lib/db/src/assignment-interest-scheduling.ts");
  const body = functionBody(service, "selectInterestCandidateForScheduling");

  assert.match(body, /countAssigned\(tx, input\.assignmentId,\s*input\.tenantId\)/u);
  assert.match(body, /assignedBefore >= assignment\.requiredPersonnelCount/u);
  assert.match(body, /assignedAfter >= assignment\.requiredPersonnelCount/u);
  assert.match(body, /assignment\.status === "plannable"/u);
  assert.match(body, /eq\(assignmentsTable\.status,\s*"plannable"\)/u);
  assert.match(body, /status:\s*"scheduled"/u);
  assert.match(body, /trigger:\s*"interest_slots_filled"/u);
  assert.doesNotMatch(body, /status:\s*"completed"/u);
  assert.doesNotMatch(body, /status:\s*"invoiced"/u);
});

test("interest poll and readiness are tenant scoped and use the canonical command", () => {
  const assignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const readiness = functionBody(assignments, "getAssignmentPlanningReadiness");
  const poll = functionBody(assignments, "sendAssignmentInterestPoll");
  const mark = functionBody(assignments, "markInterestCandidate");

  assert.match(readiness, /const tenantId = await requireCurrentTenantId\(\)/u);
  assert.match(readiness, /calculateAssignmentCapacity\(assignmentId,\s*\{ persist: true, tenantId \}\)/u);
  assert.match(readiness, /eq\(assignmentInterestResponsesTable\.tenantId,\s*tenantId\)/u);
  assert.match(poll, /prepareAssignmentForInterestRound/u);
  assert.match(poll, /calculateAssignmentCapacity\(assignmentId,\s*\{[\s\S]*tenantId/u);
  assert.match(poll, /getSmartPlanningRoundDefaults\(assignmentId,\s*\{ tenantId \}\)/u);
  assert.match(poll, /safeEmitDomainEvent/u);
  assert.match(mark, /selectInterestCandidateForScheduling/u);
  assert.match(mark, /safeRefreshPlanningRoutesForAssignment\(\{\s*tenantId/u);
  assert.match(mark, /personnelIds:\s*result\.assignedPersonnelIds/u);
});

test("cross-surface work-order visibility still depends on assigned links and customer status", () => {
  const planning = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const personnel = read("artifacts/personeel-pwa/src/actions/assignments.ts");
  const customer = read("artifacts/klant-pwa/src/actions/assignments.ts");

  assert.match(planning, /eq\(assignmentPersonnelTable\.status,\s*"assigned"\)/u);
  assert.match(personnel, /eq\(assignmentPersonnelTable\.status,\s*"assigned"\)/u);
  assert.match(personnel, /eq\(assignmentsTable\.tenantId,\s*personnel\.tenantId\)/u);
  assert.match(customer, /status:\s*assignmentsTable\.status/u);
  assert.match(customer, /eq\(assignmentsTable\.tenantId,\s*identity\.tenantId\)/u);
});

test("notification failures are isolated from canonical staffing", () => {
  const assignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const mark = functionBody(assignments, "markInterestCandidate");

  assert.match(assignments, /async function safeEmitDomainEvent/u);
  assert.match(assignments, /async function safeTriggerNotificationWorker/u);
  assert.match(mark, /selectInterestCandidateForScheduling/u);
  assert.match(mark, /notifyAssignmentWorkflow/u);
  assert.match(mark, /safeEmitDomainEvent/u);
  assert.match(mark, /safeTriggerNotificationWorker/u);
});

test("UI copy treats selected interest candidates as confirmed planning actions", () => {
  const component = read("artifacts/backoffice/src/components/assignments/SmartCandidateActions.tsx");

  assert.match(component, /Plan in/u);
  assert.match(component, /Medewerker bevestigd en ingepland/u);
  assert.doesNotMatch(component, /Medewerker geselecteerd/u);
});
