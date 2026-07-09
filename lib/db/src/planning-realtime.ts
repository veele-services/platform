import { and, eq, sql } from "drizzle-orm";
import {
  assignmentRouteContextsTable,
  assignmentsTable,
  db,
} from "./index";

export type PlanningRouteRefreshReason =
  | "status_en_route"
  | "status_in_progress"
  | "status_completed"
  | "status_not_completed"
  | "assignment_assigned"
  | "assignment_unassigned"
  | "assignment_rescheduled"
  | "assignment_reshifted"
  | "personnel_home_address_updated"
  | "route_time_suggestion_applied"
  | "planning_board_schedule";

export type PlanningRouteRefreshPayload = {
  reason: PlanningRouteRefreshReason;
  assignmentId?: string | null;
  status?: string | null;
  previousStatus?: string | null;
  scheduledDates?: string[];
  personnelIds?: string[];
  recalculated?: boolean;
  routeContextsDeleted?: number;
  source?: "backoffice" | "personnel-pwa" | "system";
};

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function compactUnique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function dateKeys(values: Array<string | null | undefined>): string[] {
  return compactUnique(values).filter((value) => DATE_KEY_RE.test(value));
}

export async function emitPlanningRouteRefreshEvent(input: {
  tenantId: string;
  assignmentId?: string | null;
  reason: PlanningRouteRefreshReason;
  status?: string | null;
  previousStatus?: string | null;
  scheduledDates?: Array<string | null | undefined>;
  personnelIds?: Array<string | null | undefined>;
  recalculated?: boolean;
  routeContextsDeleted?: number;
  source?: "backoffice" | "personnel-pwa" | "system";
}): Promise<void> {
  const tenantId = input.tenantId?.trim();
  if (!tenantId) return;

  const payload: PlanningRouteRefreshPayload = {
    reason: input.reason,
    assignmentId: input.assignmentId ?? null,
    status: input.status ?? null,
    previousStatus: input.previousStatus ?? null,
    scheduledDates: dateKeys(input.scheduledDates ?? []),
    personnelIds: compactUnique(input.personnelIds ?? []),
    recalculated: input.recalculated ?? false,
    routeContextsDeleted: input.routeContextsDeleted ?? 0,
    source: input.source ?? "system",
  };

  await db.execute(sql`
    SELECT public.portal_realtime_emit_management(
      ${tenantId}::uuid,
      'planning_refresh',
      'assignment_route_context',
      ${input.assignmentId ?? "planning"}::text,
      'changed',
      ${JSON.stringify(payload)}::jsonb
    )
  `);
}

export async function invalidateAssignmentRouteContexts(input: {
  tenantId: string;
  assignmentId: string;
  reason: PlanningRouteRefreshReason;
  status?: string | null;
  previousStatus?: string | null;
  scheduledDates?: Array<string | null | undefined>;
  personnelIds?: Array<string | null | undefined>;
  source?: "backoffice" | "personnel-pwa" | "system";
}): Promise<{ routeContextsDeleted: number; scheduledDates: string[] }> {
  const [assignment] = await db
    .select({
      scheduledDate: assignmentsTable.scheduledDate,
      status: assignmentsTable.status,
    })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.id, input.assignmentId),
        eq(assignmentsTable.tenantId, input.tenantId),
      ),
    )
    .limit(1);

  const scheduledDates = dateKeys([
    assignment?.scheduledDate,
    ...(input.scheduledDates ?? []),
  ]);

  const deleted = await db
    .delete(assignmentRouteContextsTable)
    .where(
      and(
        eq(assignmentRouteContextsTable.tenantId, input.tenantId),
        eq(assignmentRouteContextsTable.assignmentId, input.assignmentId),
      ),
    )
    .returning({ id: assignmentRouteContextsTable.id });

  await emitPlanningRouteRefreshEvent({
    tenantId: input.tenantId,
    assignmentId: input.assignmentId,
    reason: input.reason,
    status: input.status ?? assignment?.status ?? null,
    previousStatus: input.previousStatus,
    scheduledDates,
    personnelIds: input.personnelIds,
    routeContextsDeleted: deleted.length,
    source: input.source,
  });

  return {
    routeContextsDeleted: deleted.length,
    scheduledDates,
  };
}

export async function safelyInvalidateAssignmentRouteContexts(input: Parameters<typeof invalidateAssignmentRouteContexts>[0]): Promise<void> {
  try {
    await invalidateAssignmentRouteContexts(input);
  } catch (error) {
    console.error("planning route context invalidation failed", {
      assignmentId: input.assignmentId,
      reason: input.reason,
      error,
    });
  }
}
