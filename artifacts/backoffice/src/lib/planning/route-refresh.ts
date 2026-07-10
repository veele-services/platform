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
  userId?: string | null;
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
      userId: input.userId ?? null,
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

export async function refreshPlanningRoutesForPersonnel(input: {
  tenantId: string;
  userId?: string | null;
  personnelId: string;
  reason: PlanningRouteRefreshReason;
  source?: "backoffice" | "personnel-pwa" | "system";
  fromDate?: string;
}): Promise<void> {
  const fromDate = input.fromDate ?? new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ scheduledDate: assignmentsTable.scheduledDate })
    .from(assignmentPersonnelTable)
    .innerJoin(
      assignmentsTable,
      and(
        eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
        eq(assignmentsTable.tenantId, input.tenantId),
      ),
    )
    .where(
      and(
        eq(assignmentPersonnelTable.personnelId, input.personnelId),
        eq(assignmentPersonnelTable.status, "assigned"),
        eq(assignmentsTable.isActive, true),
      ),
    );

  const scheduledDates = dateKeys(
    rows
      .map((row) => row.scheduledDate)
      .filter((scheduledDate) => !scheduledDate || scheduledDate >= fromDate),
  );

  let recalculated = false;
  for (const scheduledDate of scheduledDates) {
    await recalculatePlanningRouteContexts({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      scheduledDate,
      personnelId: input.personnelId,
    });
    recalculated = true;
  }

  await emitPlanningRouteRefreshEvent({
    tenantId: input.tenantId,
    assignmentId: null,
    reason: input.reason,
    scheduledDates,
    personnelIds: [input.personnelId],
    recalculated,
    source: input.source ?? "system",
  });
}

export async function safeRefreshPlanningRoutesForPersonnel(input: Parameters<typeof refreshPlanningRoutesForPersonnel>[0]): Promise<void> {
  try {
    await refreshPlanningRoutesForPersonnel(input);
  } catch (error) {
    console.error("planning personnel route refresh failed", {
      personnelId: input.personnelId,
      reason: input.reason,
      error,
    });
  }
}

export async function refreshPlanningRoutesForObject(input: {
  tenantId: string;
  userId?: string | null;
  objectId: string;
  reason: PlanningRouteRefreshReason;
  source?: "backoffice" | "personnel-pwa" | "system";
  fromDate?: string;
}): Promise<void> {
  const fromDate = input.fromDate ?? new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      scheduledDate: assignmentsTable.scheduledDate,
      personnelId: assignmentPersonnelTable.personnelId,
    })
    .from(assignmentsTable)
    .innerJoin(
      assignmentPersonnelTable,
      and(
        eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
        eq(assignmentPersonnelTable.status, "assigned"),
      ),
    )
    .where(
      and(
        eq(assignmentsTable.tenantId, input.tenantId),
        eq(assignmentsTable.objectId, input.objectId),
        eq(assignmentsTable.isActive, true),
      ),
    );

  const combos = new Map<string, { scheduledDate: string; personnelId: string }>();
  for (const row of rows) {
    if (!row.scheduledDate || row.scheduledDate < fromDate || !DATE_KEY_RE.test(row.scheduledDate)) {
      continue;
    }
    combos.set(`${row.scheduledDate}:${row.personnelId}`, {
      scheduledDate: row.scheduledDate,
      personnelId: row.personnelId,
    });
  }

  let recalculated = false;
  for (const combo of combos.values()) {
    await recalculatePlanningRouteContexts({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      scheduledDate: combo.scheduledDate,
      personnelId: combo.personnelId,
    });
    recalculated = true;
  }

  await emitPlanningRouteRefreshEvent({
    tenantId: input.tenantId,
    assignmentId: null,
    reason: input.reason,
    scheduledDates: dateKeys([...combos.values()].map((combo) => combo.scheduledDate)),
    personnelIds: [...new Set([...combos.values()].map((combo) => combo.personnelId))],
    recalculated,
    source: input.source ?? "system",
  });
}

export async function safeRefreshPlanningRoutesForObject(input: Parameters<typeof refreshPlanningRoutesForObject>[0]): Promise<void> {
  try {
    await refreshPlanningRoutesForObject(input);
  } catch (error) {
    console.error("planning object route refresh failed", {
      objectId: input.objectId,
      reason: input.reason,
      error,
    });
  }
}
