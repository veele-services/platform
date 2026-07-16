import { pool } from "./connection";

export type AssignmentParticipantAction =
  | "seen"
  | "en_route"
  | "start"
  | "pause"
  | "resume"
  | "complete"
  | "not_complete";

export type AssignmentExecutionParticipantStatus =
  | "assigned"
  | "seen"
  | "en_route"
  | "in_progress"
  | "paused"
  | "completed"
  | "not_completed"
  | "removed";

export type AssignmentExecutionProjectionParticipant = {
  status: AssignmentExecutionParticipantStatus;
  seenAt?: Date | string | null;
  actualStartedAt?: Date | string | null;
  actualCompletedAt?: Date | string | null;
  required?: boolean;
};

export type AssignmentExecutionProjection = {
  status: "assigned" | "seen" | "en_route" | "in_progress" | "completed" | "not_completed";
  seenAt: Date | string | null;
  actualStartedAt: Date | string | null;
  actualCompletedAt: Date | string | null;
  unfinishedRequiredCount: number;
};

const ACTIVE_STATUSES = new Set<AssignmentExecutionParticipantStatus>([
  "assigned",
  "seen",
  "en_route",
  "in_progress",
  "paused",
]);

function minDate(values: Array<Date | string | null | undefined>): Date | string | null {
  const present = values.filter(Boolean) as Array<Date | string>;
  if (present.length === 0) return null;
  return present.reduce((earliest, current) => (
    new Date(current).getTime() < new Date(earliest).getTime() ? current : earliest
  ));
}

function maxDate(values: Array<Date | string | null | undefined>): Date | string | null {
  const present = values.filter(Boolean) as Array<Date | string>;
  if (present.length === 0) return null;
  return present.reduce((latest, current) => (
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest
  ));
}

export function projectAssignmentExecutionFromParticipants(
  participants: AssignmentExecutionProjectionParticipant[],
): AssignmentExecutionProjection {
  const required = participants.filter((participant) => participant.required !== false && participant.status !== "removed");
  const unfinishedRequiredCount = required.filter((participant) => ACTIVE_STATUSES.has(participant.status)).length;
  const completedCount = required.filter((participant) => participant.status === "completed").length;
  const notCompletedCount = required.filter((participant) => participant.status === "not_completed").length;
  const actualStartedAt = minDate(required.map((participant) => participant.actualStartedAt));
  const seenAt = minDate(required.map((participant) => participant.seenAt));
  const actualCompletedAt = unfinishedRequiredCount === 0 && (completedCount > 0 || notCompletedCount > 0)
    ? maxDate(required.map((participant) => participant.actualCompletedAt))
    : null;

  return {
    status: unfinishedRequiredCount === 0 && notCompletedCount > 0 && completedCount === 0
      ? "not_completed"
      : unfinishedRequiredCount === 0 && completedCount > 0
        ? "completed"
        : actualStartedAt
          ? "in_progress"
          : seenAt
            ? "seen"
            : "assigned",
    seenAt,
    actualStartedAt,
    actualCompletedAt,
    unfinishedRequiredCount,
  };
}

export type ExecuteAssignmentParticipantInput = {
  assignmentId: string;
  personnelId: string;
  actorUserId: string;
  action: AssignmentParticipantAction;
  idempotencyKey?: string | null;
  completionReason?: string | null;
  completionNotes?: string | null;
  auditMetadata?: Record<string, unknown>;
};

export type ExecuteAssignmentParticipantResult = {
  executionId: string;
  assignmentPersonnelId: string;
  tenantId: string;
  participantStatus: AssignmentExecutionParticipantStatus;
  assignmentStatus: string;
  firstAssignmentStart: boolean;
  aggregateCompleted: boolean;
  version: number;
};

export async function executeAssignmentParticipantAction(
  input: ExecuteAssignmentParticipantInput,
): Promise<ExecuteAssignmentParticipantResult> {
  const result = await pool.query(
    `select * from public.execute_assignment_participant_action($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      input.assignmentId,
      input.personnelId,
      input.actorUserId,
      input.action,
      input.idempotencyKey ?? null,
      input.completionReason ?? null,
      input.completionNotes ?? null,
      JSON.stringify(input.auditMetadata ?? {}),
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Participant execution action returned no result");
  return {
    executionId: row.execution_id,
    assignmentPersonnelId: row.assignment_personnel_id,
    tenantId: row.tenant_id,
    participantStatus: row.participant_status,
    assignmentStatus: row.assignment_status,
    firstAssignmentStart: Boolean(row.first_assignment_start),
    aggregateCompleted: Boolean(row.aggregate_completed),
    version: Number(row.version),
  };
}
