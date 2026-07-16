import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const projectionSource = readFileSync("lib/db/src/assignment-time-projection.ts", "utf8");
const planningAction = readFileSync("artifacts/backoffice/src/app/actions/planning.ts", "utf8");
const personnelAction = readFileSync("artifacts/personeel-pwa/src/actions/assignments.ts", "utf8");
const backofficeAssignmentAction = readFileSync("artifacts/backoffice/src/app/actions/assignments.ts", "utf8");
const lifecycleMigration = readFileSync("lib/db/migrations/20260716120000_assignment_lifecycle_time_guards.sql", "utf8");

test("W01 projection preserves planned values while preferring actual display values", () => {
  assert.match(projectionSource, /plannedStart:\s*input\.scheduledStart/u);
  assert.match(projectionSource, /plannedEnd:\s*input\.scheduledEnd/u);
  assert.match(projectionSource, /effectiveStart:\s*actualStart \?\? input\.scheduledStart/u);
  assert.match(projectionSource, /effectiveEnd:\s*actualEnd \?\? input\.scheduledEnd/u);
});

test("W01 planboard and personnel consume the same canonical time projection", () => {
  assert.match(planningAction, /buildAssignmentTimeProjection/u);
  assert.match(planningAction, /actualStartedAt:\s*assignmentsTable\.actualStartedAt/u);
  assert.match(planningAction, /effectiveStart:\s*timeProjection\.effectiveStart/u);
  assert.match(personnelAction, /buildAssignmentTimeProjection/u);
  assert.match(personnelAction, /effectiveStart:\s*timeProjection\.effectiveStart/u);
});

test("W01 lifecycle guards prevent generic edit bypass and preserve first completion", () => {
  assert.match(backofficeAssignmentAction, /assertGenericAssignmentEditDoesNotTouchLifecycle/u);
  assert.match(backofficeAssignmentAction, /updatedRows\.length === 0/u);
  assert.match(personnelAction, /current\.status === "completed" && current\.actualCompletedAt/u);
  assert.match(personnelAction, /current\.actualCompletedAt \?\? now/u);
  assert.match(personnelAction, /completedRows\.length === 0/u);
});

test("W01 migration adds planned and actual time integrity guards", () => {
  assert.match(lifecycleMigration, /assignments_scheduled_window_order_chk/u);
  assert.match(lifecycleMigration, /actual_completed_at >= actual_started_at/u);
});
