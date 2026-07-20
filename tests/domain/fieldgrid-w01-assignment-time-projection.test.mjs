import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const projectionSource = readFileSync("lib/db/src/assignment-time-projection.ts", "utf8");
const planningAction = readFileSync("artifacts/backoffice/src/app/actions/planning.ts", "utf8");
const personnelAction = readFileSync("artifacts/personeel-pwa/src/actions/assignments.ts", "utf8");
const backofficeAssignmentAction = readFileSync("artifacts/backoffice/src/app/actions/assignments.ts", "utf8");
const lifecycleMigration = readFileSync("lib/db/migrations/20260716120000_assignment_lifecycle_time_guards.sql", "utf8");
const participantExecutionMigration = readFileSync("lib/db/migrations/20260716143000_assignment_participant_execution.sql", "utf8");
const participantExecutionSource = readFileSync("lib/db/src/assignment-participant-execution.ts", "utf8");

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
  assert.match(personnelAction, /const currentStatus = current\.participantStatus \?\? current\.status/u);
  assert.match(personnelAction, /currentStatus === "completed"/u);
  assert.match(personnelAction, /executeAssignmentParticipantAction\(\{[\s\S]*assignmentId,[\s\S]*personnelId: personnel\.id,[\s\S]*action: "complete"/u);
  assert.match(personnelAction, /idempotencyKey: input\.clientMutationId\?\.trim\(\) \|\| randomUUID\(\)/u);
  assert.match(personnelAction, /expectedVersion: input\.expectedParticipantVersion \?\? current\.participantVersion \?\? 1/u);
  assert.match(personnelAction, /aggregateCompleted[\s\S]*db[\s\S]*\.update\(assignmentsTable\)[\s\S]*completionNotes/u);
  const completeAssignmentBody = personnelAction.slice(personnelAction.indexOf("export async function completeAssignment"), personnelAction.indexOf("export async function notCompleteAssignment"));
  assert.doesNotMatch(completeAssignmentBody, /\.set\(\{[\s\S]{0,240}status:\s*"completed"/u);
  assert.doesNotMatch(completeAssignmentBody, /actualCompletedAt:\s*current\.actualCompletedAt \?\? now/u);
});

test("W01 migration adds planned and actual time integrity guards", () => {
  assert.match(lifecycleMigration, /assignments_scheduled_window_order_chk/u);
  assert.match(lifecycleMigration, /actual_completed_at >= actual_started_at/u);
});

test("W01 migration preserves and clears invalid legacy schedule windows before enforcing the guard", () => {
  const lockOffset = lifecycleMigration.indexOf("lock table public.assignments");
  const auditOffset = lifecycleMigration.indexOf("insert into public.audit_log");
  const updateOffset = lifecycleMigration.indexOf("update public.assignments");
  const constraintOffset = lifecycleMigration.indexOf("alter table public.assignments");

  assert.ok(lockOffset >= 0);
  assert.ok(auditOffset > lockOffset);
  assert.ok(updateOffset > auditOffset);
  assert.ok(constraintOffset > updateOffset);
  assert.match(lifecycleMigration, /'scheduledStart', assignment\.scheduled_start/u);
  assert.match(lifecycleMigration, /'scheduledEnd', assignment\.scheduled_end/u);
  assert.match(lifecycleMigration, /'status', assignment\.status/u);
  assert.match(lifecycleMigration, /'requiresRescheduling', true/u);
  assert.match(lifecycleMigration, /scheduled_start = null,[\s\S]*scheduled_end = null/u);
  assert.match(lifecycleMigration, /scheduled_start >= scheduled_end/u);
  assert.doesNotMatch(lifecycleMigration, /scheduled_start\s*=\s*scheduled_end/u);
  assert.doesNotMatch(lifecycleMigration, /not valid/iu);
});


test("W01 participant execution preserves replay timestamps and drives aggregate completion", () => {
  assert.match(participantExecutionMigration, /IF p_idempotency_key IS NOT NULL AND exec_row\.idempotency_key = p_idempotency_key[\s\S]*RETURN QUERY SELECT exec_row\.id/u);
  assert.match(participantExecutionMigration, /actual_completed_at = CASE WHEN p_action IN \('complete','not_complete'\) THEN COALESCE\(actual_completed_at, now_value\) ELSE actual_completed_at END/u);
  assert.match(participantExecutionMigration, /PERFORM public\.recompute_assignment_execution_projection\(p_assignment_id\)/u);
  assert.match(participantExecutionSource, /actualCompletedAt = unfinishedRequiredCount === 0 && \(completedCount > 0 \|\| notCompletedCount > 0\)[\s\S]*maxDate\(required\.map\(\(participant\) => participant\.actualCompletedAt\)\)/u);
});
