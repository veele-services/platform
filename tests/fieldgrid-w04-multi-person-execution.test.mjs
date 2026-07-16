import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const migration = readFileSync("lib/db/migrations/20260716143000_assignment_participant_execution.sql", "utf8");
const schema = readFileSync("lib/db/src/schema/assignments.ts", "utf8");
const reportsSchema = readFileSync("lib/db/src/schema/reports.ts", "utf8");

function projectAssignmentExecutionFromParticipants(participants) {
  const active = new Set(["assigned", "seen", "en_route", "in_progress", "paused"]);
  const required = participants.filter((participant) => participant.required !== false && participant.status !== "removed");
  const unfinishedRequiredCount = required.filter((participant) => active.has(participant.status)).length;
  const completedCount = required.filter((participant) => participant.status === "completed").length;
  const notCompletedCount = required.filter((participant) => participant.status === "not_completed").length;
  const min = (values) => values.filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] ?? null;
  const max = (values) => values.filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] ?? null;
  const actualStartedAt = min(required.map((participant) => participant.actualStartedAt));
  const actualCompletedAt = unfinishedRequiredCount === 0 && (completedCount > 0 || notCompletedCount > 0)
    ? max(required.map((participant) => participant.actualCompletedAt))
    : null;
  return {
    status: unfinishedRequiredCount === 0 && notCompletedCount > 0 && completedCount === 0
      ? "not_completed"
      : unfinishedRequiredCount === 0 && completedCount > 0 ? "completed" : actualStartedAt ? "in_progress" : "assigned",
    actualStartedAt,
    actualCompletedAt,
    unfinishedRequiredCount,
  };
}

const participantService = readFileSync("lib/db/src/assignment-participant-execution.ts", "utf8");
const personnelActions = readFileSync("artifacts/personeel-pwa/src/actions/assignments.ts", "utf8");
const personnelReports = readFileSync("artifacts/personeel-pwa/src/actions/reports.ts", "utf8");

test("W04 migration creates canonical tenant-bound participant execution records", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.assignment_participant_executions/u);
  assert.match(migration, /tenant_id uuid NOT NULL REFERENCES public\.tenants/u);
  assert.match(migration, /assignment_id uuid NOT NULL REFERENCES public\.assignments/u);
  assert.match(migration, /personnel_id uuid NOT NULL REFERENCES public\.personnel/u);
  assert.match(migration, /assignment_personnel_id uuid NOT NULL REFERENCES public\.assignment_personnel/u);
  assert.match(migration, /participant_status varchar\(32\) NOT NULL DEFAULT 'assigned'/u);
  assert.match(migration, /seen_at timestamptz/u);
  assert.match(migration, /actual_started_at timestamptz/u);
  assert.match(migration, /paused_at timestamptz/u);
  assert.match(migration, /actual_completed_at timestamptz/u);
  assert.match(migration, /idempotency_key text/u);
  assert.match(migration, /version bigint NOT NULL DEFAULT 1/u);
  assert.match(migration, /last_actor_user_id uuid/u);
  assert.match(migration, /audit_metadata jsonb NOT NULL/u);
});

test("W04 migration seeds/backfills and keeps participant history auditable", () => {
  assert.match(migration, /INSERT INTO public\.assignment_participant_executions/u);
  assert.match(migration, /ON CONFLICT \(assignment_personnel_id\) DO NOTHING/u);
  assert.match(migration, /trg_assignment_personnel_execution_seed/u);
  assert.match(migration, /CASE WHEN NEW\.status = 'assigned' THEN 'assigned' ELSE 'removed' END/u);
  assert.match(migration, /ON DELETE restrict/u);
});

test("W04 RLS and execution RPC enforce participant-bound writes", () => {
  assert.match(migration, /ALTER TABLE public\.assignment_participant_executions ENABLE ROW LEVEL SECURITY/u);
  assert.match(migration, /REVOKE ALL ON public\.assignment_participant_executions FROM PUBLIC, anon, authenticated/u);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.assignment_participant_executions TO service_role/u);
  assert.match(migration, /JOIN public\.assignment_personnel ap ON ap\.id = ape\.assignment_personnel_id AND ap\.status = 'assigned'/u);
  assert.match(migration, /JOIN public\.personnel p ON p\.id = ape\.personnel_id AND p\.is_active = true AND p\.user_id = p_actor_user_id/u);
  assert.match(migration, /RAISE EXCEPTION 'participant execution not found for actor'/u);
});

test("W04 aggregate rules use earliest start and all-required completion", () => {
  assert.match(participantService, /projectAssignmentExecutionFromParticipants/u);
  assert.match(participantService, /unfinishedRequiredCount/u);
  assert.match(participantService, /actualCompletedAt = unfinishedRequiredCount === 0/u);

  const projection = projectAssignmentExecutionFromParticipants([
    { status: "completed", actualStartedAt: "2026-07-16T08:05:00Z", actualCompletedAt: "2026-07-16T09:00:00Z" },
    { status: "in_progress", actualStartedAt: "2026-07-16T08:01:00Z", actualCompletedAt: null },
  ]);
  assert.equal(projection.status, "in_progress");
  assert.equal(projection.actualStartedAt, "2026-07-16T08:01:00Z");
  assert.equal(projection.actualCompletedAt, null);
  assert.equal(projection.unfinishedRequiredCount, 1);

  const completed = projectAssignmentExecutionFromParticipants([
    { status: "completed", actualStartedAt: "2026-07-16T08:05:00Z", actualCompletedAt: "2026-07-16T09:00:00Z" },
    { status: "completed", actualStartedAt: "2026-07-16T08:01:00Z", actualCompletedAt: "2026-07-16T09:30:00Z" },
  ]);
  assert.equal(completed.status, "completed");
  assert.equal(completed.actualStartedAt, "2026-07-16T08:01:00Z");
  assert.equal(completed.actualCompletedAt, "2026-07-16T09:30:00Z");
});

test("W04 reporting and media ownership are explicit", () => {
  assert.match(migration, /ALTER TABLE IF EXISTS public\.reports ADD COLUMN IF NOT EXISTS assignment_participant_execution_id uuid/u);
  assert.match(migration, /ALTER TABLE IF EXISTS public\.reports ADD COLUMN IF NOT EXISTS assignment_personnel_id uuid/u);
  assert.match(migration, /ALTER TABLE IF EXISTS public\.reports ADD COLUMN IF NOT EXISTS personnel_id uuid/u);
  assert.match(migration, /visibility_scope varchar\(32\) NOT NULL DEFAULT 'internal_until_approved'/u);
  assert.match(migration, /ALTER TABLE IF EXISTS public\.assignment_photos ADD COLUMN IF NOT EXISTS assignment_participant_execution_id uuid/u);
  assert.match(schema, /assignmentParticipantExecutionId: uuid\("assignment_participant_execution_id"\)/u);
  assert.match(reportsSchema, /personnelId: uuid\("personnel_id"\)/u);
  assert.match(personnelReports, /getLinkedAssignmentExecution/u);
  assert.match(personnelReports, /assignmentParticipantExecutionId: linked\.executionId/u);
  assert.match(personnelReports, /assignmentPersonnelId: linked\.assignmentPersonnelId/u);
  assert.match(personnelReports, /personnelId: identity\.personnelId/u);
});

test("W04 Personnel PWA execution actions use canonical participant execution service", () => {
  assert.match(personnelActions, /executeAssignmentParticipantAction/u);
  assert.match(personnelActions, /action,\n\s+idempotencyKey: `\$\{action\}:\$\{assignmentId\}:\$\{personnel\.id\}`/u);
  assert.match(personnelActions, /action: "complete"/u);
  assert.match(personnelActions, /action: "not_complete"/u);
  assert.doesNotMatch(personnelActions, /\.set\(\{\n\s+status:\s+newStatus/u);
});
