import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const projectionSource = readFileSync("lib/db/src/assignment-time-projection.ts", "utf8");
const planningAction = readFileSync("artifacts/backoffice/src/app/actions/planning.ts", "utf8");
const personnelAction = readFileSync("artifacts/personeel-pwa/src/actions/assignments.ts", "utf8");
const backofficeAssignmentAction = readFileSync("artifacts/backoffice/src/app/actions/assignments.ts", "utf8");
const lifecycleMigration = readFileSync("lib/db/migrations/20260716120000_assignment_lifecycle_time_guards.sql", "utf8");
const participantExecutionSource = readFileSync("lib/db/src/assignment-participant-execution.ts", "utf8");
const participantExecutionMigration = readFileSync("lib/db/migrations/20260716143000_assignment_participant_execution.sql", "utf8");

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

test("W01 lifecycle guards route personnel completion through participant execution", () => {
  assert.match(backofficeAssignmentAction, /assertGenericAssignmentEditDoesNotTouchLifecycle/u);
  assert.doesNotMatch(backofficeAssignmentAction, /actualCompletedAt:\s*data/u);

  assert.match(personnelAction, /current\.status === "completed" && current\.actualCompletedAt/u);
  assert.match(personnelAction, /executeAssignmentParticipantAction\(\{[\s\S]*assignmentId,[\s\S]*personnelId:\s*personnel\.id,[\s\S]*actorUserId:\s*user\.id,[\s\S]*action:\s*"complete"/u);
  assert.match(personnelAction, /idempotencyKey:\s*`complete:\$\{assignmentId\}:\$\{personnel\.id\}`/u);
  assert.doesNotMatch(personnelAction, /current\.actualCompletedAt \?\? now/u);
});

test("W01 participant execution preserves completion timestamp idempotently", () => {
  assert.match(participantExecutionSource, /executeAssignmentParticipantAction/u);
  assert.match(participantExecutionSource, /public\.execute_assignment_participant_action\(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8::jsonb\)/u);
  assert.match(participantExecutionSource, /input\.personnelId/u);
  assert.match(participantExecutionSource, /input\.action/u);
  assert.match(participantExecutionSource, /input\.idempotencyKey \?\? null/u);

  assert.match(participantExecutionMigration, /IF p_idempotency_key IS NOT NULL AND exec_row\.idempotency_key = p_idempotency_key THEN[\s\S]*RETURN QUERY SELECT exec_row\.id/u);
  assert.match(participantExecutionMigration, /actual_completed_at = CASE WHEN p_action IN \('complete','not_complete'\) THEN COALESCE\(actual_completed_at, now_value\) ELSE actual_completed_at END/u);
});

test("W01 aggregate assignment completion is projected from participant executions", () => {
  assert.match(participantExecutionSource, /actualCompletedAt = unfinishedRequiredCount === 0 && \(completedCount > 0 \|\| notCompletedCount > 0\)/u);
  assert.match(participantExecutionSource, /maxDate\(required\.map\(\(participant\) => participant\.actualCompletedAt\)\)/u);

  assert.match(participantExecutionMigration, /PERFORM public\.recompute_assignment_execution_projection\(p_assignment_id\)/u);
  assert.match(participantExecutionMigration, /actual_completed_at = CASE WHEN unfinished_count = 0 AND \(completed_count > 0 OR not_completed_count > 0\) THEN projected_end ELSE NULL END/u);
});

test("W01 migration adds planned and actual time integrity guards", () => {
  assert.match(lifecycleMigration, /assignments_scheduled_window_order_chk/u);
  assert.match(lifecycleMigration, /actual_completed_at >= actual_started_at/u);
});
