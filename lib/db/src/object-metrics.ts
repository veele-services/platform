import type { AssignmentStatus } from "./schema";

export const OBJECT_ACTIVE_ASSIGNMENT_STATUSES = [
  "approved",
  "plannable",
  "scheduled",
  "seen",
  "en_route",
  "in_progress",
] as const satisfies readonly AssignmentStatus[];

export const OBJECT_COMPLETED_ASSIGNMENT_STATUSES = [
  "completed",
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
] as const satisfies readonly AssignmentStatus[];

export const OBJECT_OPEN_ACTION_ASSIGNMENT_STATUSES = [
  "requested",
  "review",
  "quote_preparation",
  "awaiting_approval",
  "not_completed",
  "report_submitted",
] as const satisfies readonly AssignmentStatus[];

export function isObjectActiveAssignmentStatus(
  status: AssignmentStatus,
): boolean {
  return OBJECT_ACTIVE_ASSIGNMENT_STATUSES.includes(
    status as (typeof OBJECT_ACTIVE_ASSIGNMENT_STATUSES)[number],
  );
}
