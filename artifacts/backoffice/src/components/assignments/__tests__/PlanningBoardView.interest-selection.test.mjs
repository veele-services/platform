import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../PlanningBoardView.tsx", import.meta.url), "utf8");
const planningAction = readFileSync(new URL("../../../app/actions/planning.ts", import.meta.url), "utf8");
const staffing = readFileSync(new URL("../../../../../../lib/db/src/interest-selection-staffing.ts", import.meta.url), "utf8");

test("planboard ranks selected/interested personnel before other matches", () => {
  assert.match(source, /selectedAssignmentRank/u);
  assert.match(source, /assignment\.assignedPersonnelIds\.includes\(person\.id\)\) return 0/u);
  assert.match(source, /match\?\.level === "match"\) return 1/u);
});

test("interest selection uses canonical locked staffing and capacity checks", () => {
  assert.match(staffing, /FOR UPDATE/u);
  assert.match(staffing, /getCanonicalPlanningEligibility\(tenantId, assignmentId\)/u);
  assert.match(staffing, /assignment_capacity_full/u);
  assert.match(staffing, /transition_assignment_staffing/u);
  assert.match(staffing, /status = 'confirmed'/u);
});

test("planboard data includes canonical assigned personnel ids from the planning action", () => {
  assert.match(planningAction, /const assignedPersonnelIds = personnelIdsByAssignment\.get\(row\.id\) \?\? \[\]/u);
  assert.match(planningAction, /resolveAssignmentEffectiveInterval/u);
  assert.match(planningAction, /actualStartedAt:\s*assignmentsTable\.actualStartedAt/u);
});
