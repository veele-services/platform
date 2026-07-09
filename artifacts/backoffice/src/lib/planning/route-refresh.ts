import "server-only";

import {
  assignmentPersonnelTable,
  assignmentsTable,
  db,
} from "@workspace/db";
import {
  emitPlanningRouteRefreshEvent,
  type PlanningRouteRefreshReason,
} from "@workspace/db/planning-realtime";
import { and, eq } from "drizzle-orm";
import { recalculatePlanningRouteContexts } from "./eta-engine";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateKeys(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && DATE_KEY_RE.test(value),
      ),
    ),
  ];
}

export async function refreshPlanningRoutesForAssignment(input: {
  tenantId: string;
  assignmentId: string;
  reason: PlanningRouteRefreshReason;
  previousScheduledDate?: string | null;
  previousStatus?: string | null;
  status?: string | null;
  personnelIds?: string[];
  source?: "backoffice" | "personnel-pwa" | "system";
}): Promise<void> {
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
    input.previousScheduledDate,
    assignment?.scheduledDate,
  ]);

  const personnelIds =
    input.personnelIds && input.personnelIds.length > 0
      ? [...new Set(input.personnelIds)]
      : (
          await db
            .select({ personnelId: assignmentPersonnelTable.personnelId })
            .from(assignmentPersonnelTable)
            .where(
              and(
                eq(assignmentPersonnelTable.assignmentId, input.assignmentId),
                eq(assignmentPersonnelTable.status, "assigned"),
              ),
            )
        ).map((row) => row.personnelId);

  let recalculated = false;
  for (const scheduledDate of scheduledDates) {
    await recalculatePlanningRouteContexts({
      tenantId: input.tenantId,
      scheduledDate,
    });
    recalculated = true;
  }

  await emitPlanningRouteRefreshEvent({
    tenantId: input.tenantId,
    assignmentId: input.assignmentId,
    reason: input.reason,
    status: input.status ?? assignment?.status ?? null,
    previousStatus: input.previousStatus,
    scheduledDates,
    personnelIds,
    recalculated,
    source: input.source ?? "backoffice",
  });
}

export async function safeRefreshPlanningRoutesForAssignment(input: Parameters<typeof refreshPlanningRoutesForAssignment>[0]): Promise<void> {
  try {
    await refreshPlanningRoutesForAssignment(input);
  } catch (error) {
    console.error("planning route refresh failed", {
      assignmentId: input.assignmentId,
      reason: input.reason,
      error,
    });
  }
}
