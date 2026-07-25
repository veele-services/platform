import type { AssignmentStatus } from "./schema/assignments";

export const STAFFING_PROTECTED_STATUSES = [
  "scheduled",
  "seen",
  "en_route",
  "in_progress",
  "not_completed",
  "completed",
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
] as const satisfies readonly AssignmentStatus[];

export const STAFFING_FINAL_STATUSES = [
  "not_completed",
  "completed",
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
] as const satisfies readonly AssignmentStatus[];

export function resolveRequiredSlots(
  explicitRequiredCount: number | null | undefined,
  requiredRoleIds: Iterable<string | null | undefined>,
): number {
  const normalizedCount = Number.isFinite(explicitRequiredCount)
    ? Math.max(0, Math.trunc(explicitRequiredCount ?? 0))
    : 0;
  const distinctRoles = new Set(
    [...requiredRoleIds].filter((value): value is string => Boolean(value)),
  );
  return Math.max(normalizedCount, distinctRoles.size, 1);
}

export function hasCompletePlannedInterval(input: {
  scheduledDate: string | null | undefined;
  scheduledStart: string | null | undefined;
  scheduledEnd: string | null | undefined;
}): boolean {
  if (!input.scheduledDate || !input.scheduledStart || !input.scheduledEnd) {
    return false;
  }
  return input.scheduledStart < input.scheduledEnd;
}

export function resolveStaffingAssignmentStatus(input: {
  currentStatus: AssignmentStatus;
  assignedCount: number;
  requiredSlots: number;
  scheduledDate: string | null | undefined;
  scheduledStart: string | null | undefined;
  scheduledEnd: string | null | undefined;
}): AssignmentStatus {
  if (
    STAFFING_PROTECTED_STATUSES.includes(
      input.currentStatus as (typeof STAFFING_PROTECTED_STATUSES)[number],
    )
  ) {
    return input.currentStatus;
  }

  const fullyStaffed = input.assignedCount >= Math.max(1, input.requiredSlots);
  if (fullyStaffed && hasCompletePlannedInterval(input)) {
    return "scheduled";
  }
  if (input.currentStatus === "plannable") return "plannable";
  return input.currentStatus;
}

export function assertStaffingSelectionAllowed(status: AssignmentStatus): void {
  if (
    STAFFING_FINAL_STATUSES.includes(
      status as (typeof STAFFING_FINAL_STATUSES)[number],
    )
  ) {
    throw Object.assign(
      new Error(
        "Een afgeronde of geannuleerde werkbon kan niet opnieuw worden ingepland.",
      ),
      { code: "assignment_staffing_final" },
    );
  }
}
