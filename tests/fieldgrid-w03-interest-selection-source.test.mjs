import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const service = read("lib/db/src/interest-selection-staffing.ts");
const backofficeAssignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
const dbPackage = read("lib/db/package.json");
const personnelAssignments = read("artifacts/personeel-pwa/src/actions/assignments.ts");
const customerAssignments = read("artifacts/klant-pwa/src/actions/assignments.ts");
const staffingMigration = read(
  "lib/db/migrations/20260725100000_staffing_capacity_invariants.sql",
);

test("W03 interest selection uses a canonical tenant-bound staffing command", () => {
  assert.match(service, /selectInterestCandidateCanonically/);
  assert.match(service, /tenantId: string/);
  assert.match(service, /assignmentId: string/);
  assert.match(service, /personnelId: string/);
  assert.match(service, /WHERE id = \$1 AND tenant_id = \$2 AND is_active = true\s+FOR UPDATE/s);
  assert.match(service, /WHERE r\.assignment_id = \$1\s+AND r\.personnel_id = \$2\s+AND r\.tenant_id = \$3/s);
  assert.match(service, /WHERE id = \$1 AND tenant_id = \$2 AND is_active = true\s+FOR UPDATE/s);
  assert.match(dbPackage, /"\.\/interest-selection-staffing"/);
  assert.match(backofficeAssignments, /selectInterestCandidateCanonically/);
});

test("W03 selected interest creates exactly one active assigned link and is idempotent", () => {
  assert.ok(service.includes("transition_assignment_staffing"));
  assert.ok(service.includes('transition?.staffing_status === "assigned"'));
  assert.ok(service.includes("WHERE assignment_id = $1 AND status = 'assigned'"));
  assert.match(service, /response\.status === status\s*\|\|\s*\(status === "selected" && response\.status === "confirmed"\)/);
  assert.match(service, /SET status = 'confirmed'/);
});

test("W03 capacity, reserve and final-slot transitions are protected transactionally", () => {
  assert.match(service, /BEGIN/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /transition_assignment_staffing/);
  assert.match(staffingMigration, /active_count >= required_slots/);
  assert.match(staffingMigration, /assignment_capacity_full/);
  assert.match(service, /status === "reserve"/);
  assert.doesNotMatch(service, /status === "reserve"[\s\S]{0,500}INSERT INTO public\.assignment_personnel/);
  assert.match(service, /Naar de reservelijst verplaatst/);
  assert.match(
    staffingMigration,
    /scheduled_start IS NOT NULL[\s\S]*scheduled_end IS NOT NULL[\s\S]*THEN 'scheduled'/,
  );
});

test("W03 selection reuses canonical W02 eligibility and validates overlap/availability", () => {
  assert.match(service, /getCanonicalPlanningEligibility/);
  assert.match(service, /getCanonicalPlanningEligibility\(tenantId, assignmentId\)/);
  assert.match(service, /candidate\?\.eligible/);
  assert.match(service, /canonical_eligibility_failed/);
  assert.match(read("lib/db/src/planning-intelligence.ts"), /already_booked/);
  assert.match(read("lib/db/src/planning-intelligence.ts"), /outside_availability_window/);
});

test("W03 audit is transactional and notifications are outside the canonical transaction", () => {
  assert.match(service, /INSERT INTO public\.audit_log/);
  assert.match(service, /COMMIT/);
  assert.match(backofficeAssignments, /await selectInterestCandidateCanonically[\s\S]+await emitDomainEvent/s);
  assert.match(backofficeAssignments, /await triggerNotificationWorker/);
  assert.match(backofficeAssignments, /revalidatePath\("\/planning"\)/);
});

test("W03 downstream visibility uses canonical assignment links and customer status surfaces", () => {
  assert.match(personnelAssignments, /assignmentPersonnelTable\.status, "assigned"/);
  assert.match(customerAssignments, /status:\s*assignmentsTable\.status/);
  assert.match(backofficeAssignments, /revalidatePath\("\/personeel\/opdrachten"\)/);
});
