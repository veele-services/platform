import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migration = read(
  "lib/db/migrations/20260725100000_staffing_capacity_invariants.sql",
);
const intelligence = read("lib/db/src/planning-intelligence.ts");
const eligibility = read("lib/db/src/planning-eligibility.ts");
const selection = read("lib/db/src/interest-selection-staffing.ts");
const actions = read("artifacts/backoffice/src/app/actions/assignments.ts");

test("W02 forward migration reconciles capacity and preserves monotonic statuses", () => {
  assert.match(migration, /count\(DISTINCT tc\.required_role_id\)/u);
  assert.match(
    migration,
    /required_slots := GREATEST\([\s\S]*required_personnel_count[\s\S]*required_role_count[\s\S]*1/u,
  );
  assert.match(migration, /DETAIL = 'assignment_capacity_full'/u);
  assert.match(
    migration,
    /scheduled_date IS NOT NULL[\s\S]*scheduled_start IS NOT NULL[\s\S]*scheduled_end IS NOT NULL/u,
  );
  assert.match(
    migration,
    /status NOT IN \([\s\S]*'scheduled','seen','en_route','in_progress'[\s\S]*'closed','cancelled'/u,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.transition_assignment_staffing[\s\S]*FROM PUBLIC, anon, authenticated/u,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.transition_assignment_staffing[\s\S]*TO service_role/u,
  );
});

test("W02 capacity and eligibility require an explicit tenant boundary", () => {
  assert.match(
    intelligence,
    /calculateAssignmentCapacity\(\s*tenantId: string,\s*assignmentId: string/u,
  );
  assert.match(
    intelligence,
    /eq\(assignmentsTable\.tenantId, tenantId\)/u,
  );
  assert.match(
    eligibility,
    /getCanonicalPlanningEligibility\(\s*tenantId: string,\s*assignmentId: string/u,
  );
  assert.match(
    selection,
    /getCanonicalPlanningEligibility\(tenantId, assignmentId\)/u,
  );
});

test("W02 repeated selection suppresses duplicate audits, routes and notifications", () => {
  assert.match(selection, /if \(!idempotent\) \{[\s\S]*INSERT INTO public\.audit_log/u);
  assert.match(actions, /if \(!selection\.idempotent\) \{[\s\S]*safeRefreshPlanningRoutesForAssignment/u);
  assert.match(
    actions,
    /!selection\.idempotent[\s\S]*status !== "cancelled"[\s\S]*emitDomainEvent/u,
  );
  assert.match(selection, /code: "assignment_capacity_full"/u);
});
