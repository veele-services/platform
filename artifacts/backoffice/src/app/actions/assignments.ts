"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  assignmentPersonnelTable,
  assignmentTasksTable,
  customersTable,
  objectsTable,
  personnelTable,
  assignmentRouteContextsTable,
  assignmentCandidatesTable,
  assignmentInterestResponsesTable,
  assignmentInterestRoundsTable,
  sectorsTable,
  taskCodesTable,
  auditLogTable,
  leavePeriodsTable,
  availabilityDayEntriesTable,
  availabilityWindowsTable,
  insertAssignmentSchema,
  updateAssignmentSchema,
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_PRIORITIES,
  ASSIGNMENT_STATUS_TRANSITIONS,
  assertGenericAssignmentEditDoesNotTouchLifecycle,
  transitionAssignmentStaffing,
  transitionAssignmentStatus,
  cancelAssignmentStaffing,
  finalizeAssignmentChecklists,
  reconcileAssignmentChecklistsRecoverably,
  effectiveAssignmentIntervalsOverlap,
  resolveAssignmentEffectiveInterval,
  type EffectiveAssignmentInterval,
  type AssignmentStatus,
  type AssignmentPriority,
  type SmartPlanningInterestResponseStatus,
} from "@workspace/db";
import {
  calculateAssignmentCapacity,
  getSmartPlanningRoundDefaults,
} from "@workspace/db/planning-intelligence";
import { selectInterestCandidateCanonically } from "@workspace/db/interest-selection-staffing";
import {
  eq,
  ilike,
  or,
  and,
  asc,
  desc,
  inArray,
  sql,
  gte,
  lte,
  isNull,
  ne,
} from "drizzle-orm";
import {
  getBatchAvailabilityStatus,
  type AvailabilityStatus,
} from "./availability";
import { emitDomainEvent } from "@workspace/db/events";
import { emitAssignmentWorkflowEvent } from "@workspace/db/workflow-events";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { triggerNotificationWorker } from "@/lib/notification-worker";
import { safeRefreshPlanningRoutesForAssignment } from "@/lib/planning/route-refresh";
import type { ActionResult } from "./customers";

export type { ActionResult, AssignmentStatus, AssignmentPriority };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

const PAGE_SIZE = 25;

async function notifyAssignmentWorkflow(input: Parameters<typeof emitAssignmentWorkflowEvent>[0]) {
  try {
    await emitAssignmentWorkflowEvent(input);
  } catch (error) {
    console.error("assignment workflow notification failed", {
      eventKey: input.eventKey,
      assignmentId: input.assignmentId,
      error,
    });
  }
}

const ROUTE_REFRESH_STATUS_REASONS: Partial<
  Record<
    AssignmentStatus,
    Parameters<typeof safeRefreshPlanningRoutesForAssignment>[0]["reason"]
  >
> = {
  en_route: "status_en_route",
  in_progress: "status_in_progress",
  completed: "status_completed",
  not_completed: "status_not_completed",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type CustomerOption = { id: string; name: string };
export type ObjectOption = { id: string; name: string };
export type PersonnelOption = {
  id: string;
  firstName: string;
  lastName: string;
  availabilityStatus?: AvailabilityStatus;
};
export type TaskCodeOption = { id: string; code: string; name: string };

export type AssignmentRow = {
  id: string;
  code: string;
  title: string;
  status: AssignmentStatus;
  priority: AssignmentPriority;
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  customerId: string;
  customerName: string;
  objectId: string | null;
  objectName: string | null;
  personnelCount: number;
  reportStatus: string | null;
  createdAt: string;
};

export type AssignmentDetail = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: AssignmentStatus;
  priority: AssignmentPriority;
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStartedAt: string | null;
  actualCompletedAt: string | null;
  notes: string | null;
  requiredRegion: string | null;
  requiredPersonnelCount: number;
  customerSignatureRequired: boolean;
  isActive: boolean;
  customerId: string;
  customerName: string;
  customerCode: string | null;
  customerContactName: string | null;
  customerContactEmail: string | null;
  customerContactPhone: string | null;
  customerAddress: string | null;
  customerPostalCode: string | null;
  customerCity: string | null;
  customerNotes: string | null;
  objectId: string | null;
  objectName: string | null;
  objectAddress: string | null;
  objectPostalCode: string | null;
  objectCity: string | null;
  objectContactName: string | null;
  objectContactPhone: string | null;
  objectContactEmail: string | null;
  objectAccessInfo: string | null;
  objectKeyInfo: string | null;
  objectAlarmInfo: string | null;
  objectFixedInstructions: string | null;
  objectSpecialNotes: string | null;
  createdAt: string;
  updatedAt: string;
  personnel: Array<{
    id: string;
    personnelId: string;
    firstName: string;
    lastName: string;
    /** Confirmed planner assignment. Suggested/self-applied candidates stay out of the work-order detail. */
    linkStatus: string;
    lifecycleVersion: number;
  }>;
  tasks: Array<{
    id: string;
    taskCodeId: string | null;
    taskCodeCode: string | null;
    taskCodeName: string | null;
    notes: string | null;
    sortOrder: number;
  }>;
};

export type AssignmentFormInput = {
  title: string;
  description?: string;
  customerId: string;
  objectId?: string;
  status: AssignmentStatus;
  priority: AssignmentPriority;
  scheduledDate?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  notes?: string;
  requiredRegion?: string;
  requiredPersonnelCount?: number;
  customerSignatureRequired?: boolean;
};

export type WeekAssignment = {
  id: string;
  title: string;
  status: AssignmentStatus;
  priority: AssignmentPriority;
  scheduledDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  customerName: string;
  objectName: string | null;
  personnelNames: string[];
  hasConflict: boolean;
};

export type TimelineAssignment = {
  id: string;
  title: string;
  status: AssignmentStatus;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  endMode: EffectiveAssignmentInterval["endMode"];
  isRunning: boolean;
  hasTimeDeviation: boolean;
  timeDataQualityWarning: string | null;
  customerName: string;
  hasConflict: boolean;
};

export type TimelinePersonnelRow = {
  personnelId: string;
  firstName: string;
  lastName: string;
  assignments: TimelineAssignment[];
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listAssignments(params: {
  page?: number;
  search?: string;
  status?: string;
  priority?: string;
  reportStatus?: string;
  sort?: string;
  dir?: string;
}): Promise<{ rows: AssignmentRow[]; total: number }> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return { rows: [], total: 0 };
  const tenantId = await requireCurrentTenantId();

  const {
    page = 1,
    search = "",
    status = "",
    priority = "",
    reportStatus = "",
    sort = "createdAt",
    dir = "desc",
  } = params;

  const SORTABLE = [
    "title",
    "scheduledDate",
    "createdAt",
    "status",
    "priority",
  ] as const;
  const safeSort = SORTABLE.includes(sort as (typeof SORTABLE)[number])
    ? (sort as (typeof SORTABLE)[number])
    : "createdAt";

  // Build where conditions
  const conditions = [eq(assignmentsTable.tenantId, tenantId)];
  if (search.trim()) {
    const searchClause = or(
      ilike(assignmentsTable.title, `%${search.trim()}%`),
      ilike(assignmentsTable.code, `%${search.trim()}%`),
      ilike(customersTable.name, `%${search.trim()}%`),
    );
    if (searchClause) conditions.push(searchClause);
  }
  if (status && ASSIGNMENT_STATUSES.includes(status as AssignmentStatus)) {
    conditions.push(eq(assignmentsTable.status, status));
  }
  if (
    priority &&
    ASSIGNMENT_PRIORITIES.includes(priority as AssignmentPriority)
  ) {
    conditions.push(eq(assignmentsTable.priority, priority));
  }
  // Report-eligible statuses — assignments that can have a report
  const REPORT_ELIGIBLE_STATUSES: AssignmentStatus[] = [
    "completed",
    "not_completed",
    "report_submitted",
    "report_approved",
    "invoice_ready",
    "invoiced",
    "paid",
    "closed",
  ];
  if (reportStatus === "none") {
    // Only show report-eligible assignments that have no report yet
    conditions.push(
      and(
        inArray(assignmentsTable.status, REPORT_ELIGIBLE_STATUSES),
        isNull(
          sql<string>`(SELECT r.status FROM reports r WHERE r.assignment_id = ${assignmentsTable.id} ORDER BY r.submitted_at DESC LIMIT 1)`,
        ),
      )!,
    );
  } else if (["submitted", "approved", "rejected"].includes(reportStatus)) {
    conditions.push(
      eq(
        sql<string>`(SELECT r.status FROM reports r WHERE r.assignment_id = ${assignmentsTable.id} ORDER BY r.submitted_at DESC LIMIT 1)`,
        reportStatus,
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortCol = {
    title: assignmentsTable.title,
    scheduledDate: assignmentsTable.scheduledDate,
    createdAt: assignmentsTable.createdAt,
    status: assignmentsTable.status,
    priority: assignmentsTable.priority,
  }[safeSort];

  const orderFn = dir === "asc" ? asc : desc;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: assignmentsTable.id,
        code: assignmentsTable.code,
        title: assignmentsTable.title,
        status: assignmentsTable.status,
        priority: assignmentsTable.priority,
        scheduledDate: assignmentsTable.scheduledDate,
        scheduledStart: assignmentsTable.scheduledStart,
        scheduledEnd: assignmentsTable.scheduledEnd,
        customerId: assignmentsTable.customerId,
        customerName: customersTable.name,
        objectId: assignmentsTable.objectId,
        objectName: objectsTable.name,
        createdAt: assignmentsTable.createdAt,
        personnelCount: sql<number>`(
          SELECT count(*)::int FROM assignment_personnel ap
          WHERE ap.assignment_id = ${assignmentsTable.id}
            AND ap.status = 'assigned'
        )`,
        reportStatus: sql<string | null>`(
          SELECT status FROM reports r
          WHERE r.assignment_id = ${assignmentsTable.id}
          ORDER BY r.submitted_at DESC
          LIMIT 1
        )`,
      })
      .from(assignmentsTable)
      .leftJoin(
        customersTable,
        eq(assignmentsTable.customerId, customersTable.id),
      )
      .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
      .where(where)
      .orderBy(orderFn(sortCol!))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(assignmentsTable)
      .leftJoin(
        customersTable,
        eq(assignmentsTable.customerId, customersTable.id),
      )
      .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      status: r.status as AssignmentStatus,
      priority: r.priority as AssignmentPriority,
      objectId: r.objectId ?? null,
      objectName: r.objectName ?? null,
      scheduledDate: r.scheduledDate ?? null,
      scheduledStart: r.scheduledStart ?? null,
      scheduledEnd: r.scheduledEnd ?? null,
      customerName: r.customerName ?? "",
      reportStatus: r.reportStatus ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: count,
  };
}

export async function getAssignment(
  id: string,
): Promise<AssignmentDetail | null> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return null;
  const tenantId = await requireCurrentTenantId();

  const [row] = await db
    .select({
      id: assignmentsTable.id,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      description: assignmentsTable.description,
      status: assignmentsTable.status,
      priority: assignmentsTable.priority,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      actualStartedAt: assignmentsTable.actualStartedAt,
      actualCompletedAt: assignmentsTable.actualCompletedAt,
      notes: assignmentsTable.notes,
      requiredRegion: assignmentsTable.requiredRegion,
      requiredPersonnelCount: assignmentsTable.requiredPersonnelCount,
      customerSignatureRequired: assignmentsTable.customerSignatureRequired,
      isActive: assignmentsTable.isActive,
      customerId: assignmentsTable.customerId,
      customerName: customersTable.name,
      customerCode: customersTable.code,
      customerContactName: customersTable.contactName,
      customerContactEmail: customersTable.contactEmail,
      customerContactPhone: customersTable.contactPhone,
      customerAddress: customersTable.address,
      customerPostalCode: customersTable.postalCode,
      customerCity: customersTable.city,
      customerNotes: customersTable.notes,
      objectId: assignmentsTable.objectId,
      objectName: objectsTable.name,
      objectAddress: objectsTable.address,
      objectPostalCode: objectsTable.postalCode,
      objectCity: objectsTable.city,
      objectContactName: objectsTable.contactName,
      objectContactPhone: objectsTable.contactPhone,
      objectContactEmail: objectsTable.contactEmail,
      objectAccessInfo: objectsTable.accessInfo,
      objectKeyInfo: objectsTable.keyInfo,
      objectAlarmInfo: objectsTable.alarmInfo,
      objectFixedInstructions: objectsTable.fixedInstructions,
      objectSpecialNotes: objectsTable.specialNotes,
      createdAt: assignmentsTable.createdAt,
      updatedAt: assignmentsTable.updatedAt,
    })
    .from(assignmentsTable)
    .leftJoin(
      customersTable,
      eq(assignmentsTable.customerId, customersTable.id),
    )
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!row) return null;

  const [personnel, tasks] = await Promise.all([
    db
      .select({
        id: assignmentPersonnelTable.id,
        personnelId: assignmentPersonnelTable.personnelId,
        linkStatus: assignmentPersonnelTable.status,
        lifecycleVersion: assignmentPersonnelTable.lifecycleVersion,
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
      })
      .from(assignmentPersonnelTable)
      .innerJoin(
        personnelTable,
        and(
          eq(assignmentPersonnelTable.personnelId, personnelTable.id),
          eq(personnelTable.tenantId, tenantId),
          eq(personnelTable.isActive, true),
        ),
      )
      // Keep candidate suggestions out of the work-order detail; the planning flow handles triage.
      .where(
        and(
          eq(assignmentPersonnelTable.assignmentId, id),
          eq(assignmentPersonnelTable.status, "assigned"),
        ),
      )
      .orderBy(asc(personnelTable.lastName)),

    db
      .select({
        id: assignmentTasksTable.id,
        taskCodeId: assignmentTasksTable.taskCodeId,
        taskCodeCode: sql<string | null>`coalesce(${assignmentTasksTable.taskCodeCode}, ${taskCodesTable.code})`,
        taskCodeName: sql<string | null>`coalesce(${assignmentTasksTable.taskCodeName}, ${taskCodesTable.name})`,
        notes: assignmentTasksTable.notes,
        sortOrder: assignmentTasksTable.sortOrder,
      })
      .from(assignmentTasksTable)
      .leftJoin(
        taskCodesTable,
        and(
          eq(assignmentTasksTable.taskCodeId, taskCodesTable.id),
          eq(taskCodesTable.tenantId, tenantId),
        ),
      )
      .where(eq(assignmentTasksTable.assignmentId, id))
      .orderBy(asc(assignmentTasksTable.sortOrder)),
  ]);

  return {
    ...row,
    status: row.status as AssignmentStatus,
    priority: row.priority as AssignmentPriority,
    customerName: row.customerName ?? "",
    customerCode: row.customerCode ?? null,
    customerContactName: row.customerContactName ?? null,
    customerContactEmail: row.customerContactEmail ?? null,
    customerContactPhone: row.customerContactPhone ?? null,
    customerAddress: row.customerAddress ?? null,
    customerPostalCode: row.customerPostalCode ?? null,
    customerCity: row.customerCity ?? null,
    customerNotes: row.customerNotes ?? null,
    objectId: row.objectId ?? null,
    objectName: row.objectName ?? null,
    objectAddress: row.objectAddress ?? null,
    objectPostalCode: row.objectPostalCode ?? null,
    objectCity: row.objectCity ?? null,
    objectContactName: row.objectContactName ?? null,
    objectContactPhone: row.objectContactPhone ?? null,
    objectContactEmail: row.objectContactEmail ?? null,
    objectAccessInfo: row.objectAccessInfo ?? null,
    objectKeyInfo: row.objectKeyInfo ?? null,
    objectAlarmInfo: row.objectAlarmInfo ?? null,
    objectFixedInstructions: row.objectFixedInstructions ?? null,
    objectSpecialNotes: row.objectSpecialNotes ?? null,
    scheduledDate: row.scheduledDate ?? null,
    scheduledStart: row.scheduledStart ?? null,
    scheduledEnd: row.scheduledEnd ?? null,
    actualStartedAt: row.actualStartedAt?.toISOString() ?? null,
    actualCompletedAt: row.actualCompletedAt?.toISOString() ?? null,
    requiredRegion: row.requiredRegion ?? null,
    requiredPersonnelCount: row.requiredPersonnelCount ?? 1,
    customerSignatureRequired: row.customerSignatureRequired,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    personnel: personnel.map((p) => ({
      id: p.id,
      personnelId: p.personnelId,
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
      linkStatus: p.linkStatus,
      lifecycleVersion: p.lifecycleVersion,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      taskCodeId: t.taskCodeId ?? null,
      taskCodeCode: t.taskCodeCode ?? null,
      taskCodeName: t.taskCodeName ?? null,
      notes: t.notes ?? null,
      sortOrder: t.sortOrder,
    })),
  };
}

export async function getAssignmentsForWeek(
  weekStart: string,
  weekEnd: string,
): Promise<WeekAssignment[]> {
  const canRead = await hasPermission("planning", "read");
  if (!canRead) return [];
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      priority: assignmentsTable.priority,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      customerName: customersTable.name,
      objectName: objectsTable.name,
    })
    .from(assignmentsTable)
    .leftJoin(
      customersTable,
      and(
        eq(assignmentsTable.customerId, customersTable.id),
        eq(customersTable.tenantId, tenantId),
      ),
    )
    .leftJoin(
      objectsTable,
      and(
        eq(assignmentsTable.objectId, objectsTable.id),
        eq(objectsTable.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(assignmentsTable.tenantId, tenantId),
        gte(assignmentsTable.scheduledDate, weekStart),
        lte(assignmentsTable.scheduledDate, weekEnd),
      ),
    )
    .orderBy(asc(assignmentsTable.scheduledStart));

  if (rows.length === 0) return [];

  const assignmentIds = rows.map((r) => r.id);

  const personnelRows = await db
    .select({
      assignmentId: assignmentPersonnelTable.assignmentId,
      personnelId: assignmentPersonnelTable.personnelId,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(
      personnelTable,
      and(
        eq(assignmentPersonnelTable.personnelId, personnelTable.id),
        eq(personnelTable.tenantId, tenantId),
      ),
    )
    .where(
      and(
        inArray(assignmentPersonnelTable.assignmentId, assignmentIds),
        // Only confirmed personnel in the week-view summary names list
        eq(assignmentPersonnelTable.status, "assigned"),
      ),
    );

  const personnelByAssignment = new Map<string, string[]>();
  // Also track personnel IDs per assignment for conflict checking
  const personnelIdsByAssignment = new Map<string, string[]>();
  for (const p of personnelRows) {
    const names = personnelByAssignment.get(p.assignmentId) ?? [];
    names.push(`${p.firstName ?? ""} ${p.lastName ?? ""}`.trim());
    personnelByAssignment.set(p.assignmentId, names);

    const ids = personnelIdsByAssignment.get(p.assignmentId) ?? [];
    ids.push(p.personnelId);
    personnelIdsByAssignment.set(p.assignmentId, ids);
  }

  // ── Conflict detection ────────────────────────────────────────────────────
  // Build date → unique personnelId[] map for batch availability lookup
  const validRows = rows.filter((r) => r.scheduledDate !== null);

  const datePersonnelMap = new Map<string, Set<string>>();
  for (const r of validRows) {
    const pIds = personnelIdsByAssignment.get(r.id);
    if (!pIds || pIds.length === 0) continue;
    const set = datePersonnelMap.get(r.scheduledDate!) ?? new Set<string>();
    for (const pid of pIds) set.add(pid);
    datePersonnelMap.set(r.scheduledDate!, set);
  }

  // Fetch availability per date (parallel, at most 7 queries × 3 = 21 DB round-trips)
  const availabilityByDate = new Map<
    string,
    Record<string, AvailabilityStatus>
  >();
  await Promise.all(
    Array.from(datePersonnelMap.entries()).map(async ([date, pidSet]) => {
      const statusMap = await getBatchAvailabilityStatus(
        Array.from(pidSet),
        date,
      );
      availabilityByDate.set(date, statusMap);
    }),
  );

  // Determine which assignments have conflicts
  const conflictAssignmentIds = new Set<string>();

  // 1. Availability conflict: personnel is ziek / op_verlof / niet_beschikbaar
  for (const r of validRows) {
    const pIds = personnelIdsByAssignment.get(r.id);
    if (!pIds || pIds.length === 0) continue;
    const statusMap = availabilityByDate.get(r.scheduledDate!);
    if (!statusMap) continue;
    for (const pid of pIds) {
      const s = statusMap[pid] as AvailabilityStatus | undefined;
      if (s === "ziek" || s === "op_verlof" || s === "niet_beschikbaar") {
        conflictAssignmentIds.add(r.id);
        break;
      }
    }
  }

  // 2. Double-booking conflict: same personnel, same date, overlapping times
  //    Group per-personnel their assignments on each date, then check each pair.
  const personnelDayAssignments = new Map<string, typeof validRows>();
  for (const p of personnelRows) {
    const r = validRows.find((x) => x.id === p.assignmentId);
    if (!r) continue;
    const key = `${p.personnelId}:${r.scheduledDate!}`;
    const list = personnelDayAssignments.get(key) ?? [];
    list.push(r);
    personnelDayAssignments.set(key, list);
  }

  for (const dayList of personnelDayAssignments.values()) {
    if (dayList.length < 2) continue;
    for (let i = 0; i < dayList.length; i++) {
      for (let j = i + 1; j < dayList.length; j++) {
        const a = dayList[i]!;
        const b = dayList[j]!;
        // No times → whole-day booking, always a conflict if double-booked
        if (
          !a.scheduledStart ||
          !a.scheduledEnd ||
          !b.scheduledStart ||
          !b.scheduledEnd
        ) {
          conflictAssignmentIds.add(a.id);
          conflictAssignmentIds.add(b.id);
        } else if (
          a.scheduledStart < b.scheduledEnd &&
          a.scheduledEnd > b.scheduledStart
        ) {
          conflictAssignmentIds.add(a.id);
          conflictAssignmentIds.add(b.id);
        }
      }
    }
  }

  return validRows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as AssignmentStatus,
    priority: r.priority as AssignmentPriority,
    scheduledDate: r.scheduledDate!,
    scheduledStart: r.scheduledStart ?? null,
    scheduledEnd: r.scheduledEnd ?? null,
    customerName: r.customerName ?? "",
    objectName: r.objectName ?? null,
    personnelNames: personnelByAssignment.get(r.id) ?? [],
    hasConflict: conflictAssignmentIds.has(r.id),
  }));
}

// ─── Month view ───────────────────────────────────────────────────────────────

/**
 * Returns all assignments for the calendar grid of a given month.
 * The grid starts on Monday of the week containing the 1st, and ends on Sunday
 * of the week containing the last day — so typically 28–42 days.
 * Reuses WeekAssignment (including hasConflict) via getAssignmentsForWeek.
 */
export async function getAssignmentsForMonth(
  monthStr: string,
): Promise<WeekAssignment[]> {
  const match = /^(\d{4})-(\d{2})$/.exec(monthStr);
  if (!match) return [];

  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10) - 1; // 0-indexed

  // First and last day of the calendar month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Grid start: Monday of the week that contains firstDay
  const gridStart = new Date(firstDay);
  const startDow = firstDay.getDay(); // 0=Sun … 6=Sat
  gridStart.setDate(firstDay.getDate() - (startDow === 0 ? 6 : startDow - 1));

  // Grid end: Sunday of the week that contains lastDay
  const gridEnd = new Date(lastDay);
  const endDow = lastDay.getDay();
  gridEnd.setDate(lastDay.getDate() + (endDow === 0 ? 0 : 7 - endDow));

  // Ensure at least 5 weeks (35 cells) — short Februaries starting on Monday are only 4 weeks
  const totalDays =
    Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;
  if (totalDays < 35) {
    gridEnd.setDate(gridEnd.getDate() + 7);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  return getAssignmentsForWeek(fmt(gridStart), fmt(gridEnd));
}

// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboardCounts(): Promise<{
  requested: number;
  plannable: number;
  inProgress: number;
  completedToday: number;
  open: number;
}> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead)
    return {
      requested: 0,
      plannable: 0,
      inProgress: 0,
      completedToday: 0,
      open: 0,
    };

  const tenantId = await requireCurrentTenantId();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [counts] = await db
    .select({
      requested: sql<number>`count(*) FILTER (WHERE status = 'requested')::int`,
      plannable: sql<number>`count(*) FILTER (WHERE status = 'plannable')::int`,
      inProgress: sql<number>`count(*) FILTER (WHERE status = 'in_progress')::int`,
      completedToday: sql<number>`count(*) FILTER (WHERE status = 'completed' AND scheduled_date = ${today})::int`,
      open: sql<number>`count(*) FILTER (WHERE status NOT IN ('closed', 'paid', 'cancelled'))::int`,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.tenantId, tenantId));

  return {
    requested: counts?.requested ?? 0,
    plannable: counts?.plannable ?? 0,
    inProgress: counts?.inProgress ?? 0,
    completedToday: counts?.completedToday ?? 0,
    open: counts?.open ?? 0,
  };
}

// ─── Dropdown helpers ─────────────────────────────────────────────────────────

export async function getCustomerOptions(): Promise<CustomerOption[]> {
  const tenantId = await requireCurrentTenantId();
  const rows = await db
    .select({ id: customersTable.id, name: customersTable.name })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.tenantId, tenantId),
        eq(customersTable.isActive, true),
      ),
    )
    .orderBy(asc(customersTable.name));
  return rows;
}

export async function getObjectsByCustomer(
  customerId: string,
): Promise<ObjectOption[]> {
  if (!customerId) return [];
  const tenantId = await requireCurrentTenantId();
  const rows = await db
    .select({ id: objectsTable.id, name: objectsTable.name })
    .from(objectsTable)
    .where(
      and(
        eq(objectsTable.tenantId, tenantId),
        eq(objectsTable.customerId, customerId),
        eq(objectsTable.isActive, true),
      ),
    )
    .orderBy(asc(objectsTable.name));
  return rows;
}

export async function getPersonnelOptions(
  scheduledDate?: string | null,
): Promise<PersonnelOption[]> {
  const tenantId = await requireCurrentTenantId();
  const rows = await db
    .select({
      id: personnelTable.id,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
    })
    .from(personnelTable)
    .where(
      and(
        eq(personnelTable.tenantId, tenantId),
        eq(personnelTable.isActive, true),
        eq(personnelTable.isAvailable, true),
      ),
    )
    .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName));

  if (!scheduledDate || rows.length === 0) return rows;

  const ids = rows.map((r) => r.id);
  const statusMap = await getBatchAvailabilityStatus(ids, scheduledDate);

  return rows.map((r) => ({
    ...r,
    availabilityStatus: statusMap[r.id],
  }));
}

// ─── Day Timeline ─────────────────────────────────────────────────────────────

/**
 * Returns per-personnel timeline data for a single day.
 * Used by the day-view planning component.
 */
export async function getDayTimelineData(dateStr: string): Promise<{
  rows: TimelinePersonnelRow[];
  unassigned: TimelineAssignment[];
}> {
  const canRead = await hasPermission("planning", "read");
  if (!canRead) return { rows: [], unassigned: [] };
  const tenantId = await requireCurrentTenantId();

  // All assignments on this day
  const asgnRows = await db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      actualStartedAt: assignmentsTable.actualStartedAt,
      actualCompletedAt: assignmentsTable.actualCompletedAt,
      customerName: customersTable.name,
    })
    .from(assignmentsTable)
    .leftJoin(
      customersTable,
      and(
        eq(assignmentsTable.customerId, customersTable.id),
        eq(customersTable.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(assignmentsTable.tenantId, tenantId),
        or(
          and(
            isNull(assignmentsTable.actualStartedAt),
            eq(assignmentsTable.scheduledDate, dateStr),
          ),
          sql<boolean>`(${assignmentsTable.actualStartedAt} at time zone 'Europe/Amsterdam')::date = ${dateStr}::date`,
        ),
      ),
    )
    .orderBy(asc(assignmentsTable.scheduledStart));

  if (asgnRows.length === 0) return { rows: [], unassigned: [] };

  const assignmentIds = asgnRows.map((a) => a.id);
  const projectionNow = new Date();
  const effectiveIntervalsByAssignment = new Map(
    asgnRows.map((assignment) => [
      assignment.id,
      resolveAssignmentEffectiveInterval({
        scheduledDate: assignment.scheduledDate ?? null,
        scheduledStart: assignment.scheduledStart ?? null,
        scheduledEnd: assignment.scheduledEnd ?? null,
        actualStartedAt: assignment.actualStartedAt ?? null,
        actualCompletedAt: assignment.actualCompletedAt ?? null,
        status: assignment.status,
        now: projectionNow,
      }),
    ]),
  );

  // Personnel assignments for these assignments — only confirmed (assigned) links
  const pRows = await db
    .select({
      assignmentId: assignmentPersonnelTable.assignmentId,
      personnelId: assignmentPersonnelTable.personnelId,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(
      personnelTable,
      and(
        eq(assignmentPersonnelTable.personnelId, personnelTable.id),
        eq(personnelTable.tenantId, tenantId),
      ),
    )
    .where(
      and(
        inArray(assignmentPersonnelTable.assignmentId, assignmentIds),
        eq(assignmentPersonnelTable.status, "assigned"),
      ),
    )
    .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName));

  // ── Conflict detection (mirrors week-view logic) ─────────────────────────

  // Build personnelId → assignmentIds map for overlap detection
  const personnelIdsByAssignment = new Map<string, string[]>();
  for (const p of pRows) {
    const ids = personnelIdsByAssignment.get(p.assignmentId) ?? [];
    ids.push(p.personnelId);
    personnelIdsByAssignment.set(p.assignmentId, ids);
  }

  // Collect all unique personnel IDs that have assignments on this day
  const allPersonnelIds = new Set<string>();
  for (const p of pRows) allPersonnelIds.add(p.personnelId);

  // 1. Availability conflicts: fetch batch status for all personnel on this date
  const availabilityStatusMap =
    allPersonnelIds.size > 0
      ? await getBatchAvailabilityStatus(Array.from(allPersonnelIds), dateStr)
      : ({} as Record<string, AvailabilityStatus>);

  const conflictAssignmentIds = new Set<string>();

  for (const r of asgnRows) {
    const pIds = personnelIdsByAssignment.get(r.id);
    if (!pIds || pIds.length === 0) continue;
    for (const pid of pIds) {
      const s = availabilityStatusMap[pid] as AvailabilityStatus | undefined;
      if (s === "ziek" || s === "op_verlof" || s === "niet_beschikbaar") {
        conflictAssignmentIds.add(r.id);
        break;
      }
    }
  }

  // 2. Double-booking conflicts: same personnel, overlapping times on this day
  const personnelDayAssignments = new Map<string, typeof asgnRows>();
  for (const p of pRows) {
    const r = asgnRows.find((x) => x.id === p.assignmentId);
    if (!r) continue;
    const list = personnelDayAssignments.get(p.personnelId) ?? [];
    list.push(r);
    personnelDayAssignments.set(p.personnelId, list);
  }

  for (const dayList of personnelDayAssignments.values()) {
    if (dayList.length < 2) continue;
    for (let i = 0; i < dayList.length; i++) {
      for (let j = i + 1; j < dayList.length; j++) {
        const a = dayList[i]!;
        const b = dayList[j]!;
        const aInterval = effectiveIntervalsByAssignment.get(a.id);
        const bInterval = effectiveIntervalsByAssignment.get(b.id);
        if (
          aInterval &&
          bInterval &&
          effectiveAssignmentIntervalsOverlap(aInterval, bInterval)
        ) {
          conflictAssignmentIds.add(a.id);
          conflictAssignmentIds.add(b.id);
        }
      }
    }
  }

  // ── Build result maps ────────────────────────────────────────────────────

  const asgnMap = new Map(
    asgnRows.map((a) => {
      const interval = effectiveIntervalsByAssignment.get(a.id)!;
      return [
        a.id,
        {
          id: a.id,
          title: a.title,
          status: a.status as AssignmentStatus,
          scheduledStart: a.scheduledStart ?? null,
          scheduledEnd: a.scheduledEnd ?? null,
          effectiveStart: interval.effectiveStart,
          effectiveEnd: interval.effectiveEnd,
          endMode: interval.endMode,
          isRunning: interval.isRunning,
          hasTimeDeviation: interval.hasDeviation,
          timeDataQualityWarning: interval.dataQualityWarning,
          customerName: a.customerName ?? "",
          hasConflict: conflictAssignmentIds.has(a.id),
        } satisfies TimelineAssignment,
      ] as const;
    }),
  );

  const rowMap = new Map<string, TimelinePersonnelRow>();
  const assignedIds = new Set<string>();

  for (const p of pRows) {
    const asgn = asgnMap.get(p.assignmentId);
    if (!asgn) continue;

    const row = rowMap.get(p.personnelId) ?? {
      personnelId: p.personnelId,
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
      assignments: [],
    };
    row.assignments.push(asgn);
    rowMap.set(p.personnelId, row);
    assignedIds.add(asgn.id);
  }

  const rows = Array.from(rowMap.values()).sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(
      `${b.lastName} ${b.firstName}`,
      "nl",
    ),
  );

  const unassigned = asgnRows
    .filter((a) => !assignedIds.has(a.id))
    .map((a) => asgnMap.get(a.id)!);

  return { rows, unassigned };
}

// ─── Personnel Eligibility ────────────────────────────────────────────────────

export type PersonnelEligibilityResult = {
  id: string;
  firstName: string;
  lastName: string;
  availabilityStatus: AvailabilityStatus;
  hasConflict: boolean;
  meetsRole: boolean;
  meetsCertificates: boolean;
  meetsDiploma: boolean;
  meetsKnowledge: boolean;
  sectorId: string | null;
  sectorName: string | null;
  meetsSector: boolean;
  /**
   * true when personnel region matches assignment region.
   * Always true when no required_region is set on the assignment
   * (schema migration required for constraint).
   */
  meetsRegion: boolean;
  /** true when availability window covers the assignment time slot (or assignment has no time set) */
  meetsAvailabilityWindow: boolean;
  eligible: boolean;
  eligibilityReasons: string[];
};

/**
 * Time helper: convert "HH:MM" to minutes-since-midnight.
 */
function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Returns all active personnel with full eligibility data for an assignment.
 *
 * Checks (in order):
 *   1. Availability status (ziek / op_verlof / niet_beschikbaar / beschikbaar / niet_ingesteld)
 *   2. Availability window time coverage — window must contain the assignment time slot
 *   3. Same-day/same-time conflicts with other assignments (time-overlap when times are set)
 *   4. Role match
 *   5. Certificates match
 *   6. Diploma match
 *   7. Knowledge match
 *   8. Region match (always passes — no required_region on assignments yet; field is ready)
 */
export async function getPersonnelEligibilityForAssignment(
  assignmentId: string,
): Promise<PersonnelEligibilityResult[]> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return [];
  const tenantId = await requireCurrentTenantId();

  // ── 1. Fetch assignment meta (date + times + required_region for eligibility) ──
  const [asgn] = await db
    .select({
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      requiredRegion: assignmentsTable.requiredRegion,
      objectSectorId: objectsTable.sectorId,
      customerSectorId: customersTable.sectorId,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!asgn) return [];

  const dateStr = asgn?.scheduledDate ?? null;
  const asgnStart = asgn?.scheduledStart ?? null; // "HH:MM" or null
  const asgnEnd = asgn?.scheduledEnd ?? null; // "HH:MM" or null
  const asgnHasTimes = Boolean(asgnStart && asgnEnd);
  // required_region for eligibility check (lowercased, trimmed; null = no restriction)
  const requiredRegion = asgn?.requiredRegion?.trim().toLowerCase() || null;
  const requiredSectorId = asgn?.objectSectorId ?? asgn?.customerSectorId ?? null;

  // Day-of-week for availability window lookup (0=Sun … 6=Sat)
  const dayOfWeek = dateStr ? new Date(dateStr + "T00:00:00").getDay() : null;

  // ── 2. Fetch required task-code attributes ─────────────────────────────────
  let requiredCertificates: string[] = [];
  let requiredDiplomas: string[] = [];
  let requiredKnowledge: string[] = [];
  let requiredRoleIds: string[] = [];

  const taskRows = await db
    .select({ taskCodeId: assignmentTasksTable.taskCodeId })
    .from(assignmentTasksTable)
    .where(eq(assignmentTasksTable.assignmentId, assignmentId));

  const taskCodeIds = taskRows
    .map((t) => t.taskCodeId)
    .filter(Boolean) as string[];
  if (taskCodeIds.length > 0) {
    const tcRows = await db
      .select({
        requiredCertificates: taskCodesTable.requiredCertificates,
        requiredDiploma: taskCodesTable.requiredDiploma,
        requiredKnowledge: taskCodesTable.requiredKnowledge,
        requiredRoleId: taskCodesTable.requiredRoleId,
      })
      .from(taskCodesTable)
      .where(inArray(taskCodesTable.id, taskCodeIds));

    for (const tc of tcRows) {
      requiredCertificates.push(...(tc.requiredCertificates ?? []));
      if (tc.requiredDiploma) requiredDiplomas.push(tc.requiredDiploma);
      requiredKnowledge.push(...(tc.requiredKnowledge ?? []));
      if (tc.requiredRoleId) requiredRoleIds.push(tc.requiredRoleId);
    }
    requiredCertificates = [...new Set(requiredCertificates)];
    requiredDiplomas = [...new Set(requiredDiplomas)];
    requiredKnowledge = [...new Set(requiredKnowledge)];
    requiredRoleIds = [...new Set(requiredRoleIds)];
  }

  // ── 3. Fetch all active personnel (with region) ────────────────────────────
  const personnelRows = await db
    .select({
      id: personnelTable.id,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
      roleId: personnelTable.roleId,
      certificates: personnelTable.certificates,
      diplomas: personnelTable.diplomas,
      knowledge: personnelTable.knowledge,
      region: personnelTable.region,
      sectorId: personnelTable.sectorId,
      sectorName: sectorsTable.name,
    })
    .from(personnelTable)
    .leftJoin(sectorsTable, eq(personnelTable.sectorId, sectorsTable.id))
    .where(
      and(
        eq(personnelTable.tenantId, tenantId),
        eq(personnelTable.isActive, true),
        eq(personnelTable.isAvailable, true),
      ),
    )
    .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName));

  if (personnelRows.length === 0) return [];

  const currentLinks = await db
    .select({ personnelId: assignmentPersonnelTable.personnelId })
    .from(assignmentPersonnelTable)
    .where(
      and(
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
        eq(assignmentPersonnelTable.status, "assigned"),
      ),
    );
  const currentPersonnelIds = new Set(currentLinks.map((link) => link.personnelId));
  const candidatePersonnelRows = personnelRows.filter((p) => !currentPersonnelIds.has(p.id));

  if (candidatePersonnelRows.length === 0) return [];

  const personnelIds = candidatePersonnelRows.map((p) => p.id);

  // ── 4. Parallel: batch availability + conflicts + availability windows ─────
  const conflictWhereExtra = asgnHasTimes
    ? // Time-overlap: (other.start IS NULL OR other.end IS NULL OR other.start < asgnEnd AND other.end > asgnStart)
      or(
        isNull(assignmentsTable.scheduledStart),
        isNull(assignmentsTable.scheduledEnd),
        sql<boolean>`${assignmentsTable.scheduledStart} < ${asgnEnd} AND ${assignmentsTable.scheduledEnd} > ${asgnStart}`,
      )
    : undefined;

  const [statusMap, conflictRows, dayEntryRows, windowRows] = await Promise.all(
    [
      dateStr
        ? getBatchAvailabilityStatus(personnelIds, dateStr)
        : Promise.resolve({} as Record<string, AvailabilityStatus>),

      dateStr
        ? db
            .select({ personnelId: assignmentPersonnelTable.personnelId })
            .from(assignmentPersonnelTable)
            .innerJoin(
              assignmentsTable,
              eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
            )
            .where(
              and(
                eq(assignmentsTable.scheduledDate, dateStr),
                eq(assignmentsTable.tenantId, tenantId),
                inArray(assignmentPersonnelTable.personnelId, personnelIds),
                ne(assignmentPersonnelTable.assignmentId, assignmentId),
                // Only confirmed links count as conflicts — suggestions are not yet scheduled
                eq(assignmentPersonnelTable.status, "assigned"),
                conflictWhereExtra,
              ),
            )
        : Promise.resolve([] as Array<{ personnelId: string }>),

      // Fetch availability windows only when assignment has a time and a date
      asgnHasTimes && dayOfWeek !== null
        ? db
            .select({
              personnelId: availabilityDayEntriesTable.personnelId,
              startTime: availabilityDayEntriesTable.startTime,
              endTime: availabilityDayEntriesTable.endTime,
            })
            .from(availabilityDayEntriesTable)
            .where(
              and(
                inArray(availabilityDayEntriesTable.personnelId, personnelIds),
                eq(availabilityDayEntriesTable.date, dateStr!),
              ),
            )
        : Promise.resolve(
            [] as Array<{
              personnelId: string;
              startTime: string;
              endTime: string;
            }>,
          ),

      // Fetch legacy weekly availability windows only when assignment has a time and a date
      asgnHasTimes && dayOfWeek !== null
        ? db
            .select({
              personnelId: availabilityWindowsTable.personnelId,
              startTime: availabilityWindowsTable.startTime,
              endTime: availabilityWindowsTable.endTime,
            })
            .from(availabilityWindowsTable)
            .where(
              and(
                inArray(availabilityWindowsTable.personnelId, personnelIds),
                eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
              ),
            )
        : Promise.resolve(
            [] as Array<{
              personnelId: string;
              startTime: string;
              endTime: string;
            }>,
          ),
    ],
  );

  const conflictSet = new Set(conflictRows.map((r) => r.personnelId));

  // Build a map: personnelId → does any window cover the assignment time?
  // Key: if assignment has no times, everyone passes (meetsAvailabilityWindow = true).
  const windowCoverageMap = new Map<string, boolean>();
  if (asgnHasTimes && asgnStart && asgnEnd) {
    const asgnStartMin = timeToMin(asgnStart);
    const asgnEndMin = timeToMin(asgnEnd);
    for (const w of windowRows) {
      if (!windowCoverageMap.get(w.personnelId)) {
        const wStart = timeToMin(w.startTime);
        const wEnd = timeToMin(w.endTime);
        // Window must contain the full assignment time slot
        windowCoverageMap.set(
          w.personnelId,
          wStart <= asgnStartMin && wEnd >= asgnEndMin,
        );
      }
    }
    for (const w of dayEntryRows) {
      const wStart = timeToMin(w.startTime);
      const wEnd = timeToMin(w.endTime);
      windowCoverageMap.set(
        w.personnelId,
        wStart <= asgnStartMin && wEnd >= asgnEndMin,
      );
    }
  }

  // ── 5. Compute eligibility per person ─────────────────────────────────────
  return candidatePersonnelRows.map((p) => {
    const availStatus = (statusMap[p.id] ??
      "niet_ingesteld") as AvailabilityStatus;
    const hasConflict = conflictSet.has(p.id);

    // Window coverage: only relevant when assignment has a time AND status is "beschikbaar"
    // (if status is "niet_ingesteld" we have no windows to check — pass through)
    const meetsAvailabilityWindow = (() => {
      if (!asgnHasTimes) return true;
      if (availStatus !== "beschikbaar") return true; // blocked for other reasons already
      // If a window was found, check coverage; if none found at all → not covered
      return windowCoverageMap.get(p.id) ?? false;
    })();

    const personCerts = (
      (p.certificates ?? []) as
        | { name: string; expires_at?: string }[]
        | string[]
    ).map((c) => (typeof c === "string" ? c : c.name));
    const personDiplomas = (p.diplomas ?? []) as string[];
    const personKnow = (p.knowledge ?? []) as string[];

    const meetsCertificates = requiredCertificates.every((c) =>
      personCerts.includes(c),
    );
    const meetsDiploma = requiredDiplomas.every((d) =>
      personDiplomas.includes(d),
    );
    const meetsKnowledge = requiredKnowledge.every((k) =>
      personKnow.includes(k),
    );
    const meetsRole =
      requiredRoleIds.length === 0 ||
      requiredRoleIds.every((r) => p.roleId === r);
    const meetsSector = !requiredSectorId || p.sectorId === requiredSectorId;
    // Region: compare personnel.region against assignment.required_region (case-insensitive, trimmed).
    // Always passes when required_region is not set on the assignment, or when personnel has no region.
    const meetsRegion =
      !requiredRegion || !p.region
        ? true
        : p.region.trim().toLowerCase() === requiredRegion;

    const reasons: string[] = [];
    if (availStatus === "ziek") reasons.push("Ziek gemeld");
    if (availStatus === "op_verlof") reasons.push("Op verlof");
    if (availStatus === "niet_beschikbaar")
      reasons.push("Niet beschikbaar op deze dag");
    if (!meetsAvailabilityWindow)
      reasons.push("Beschikbaarheidsvenster dekt opdrachttijd niet");
    if (hasConflict) reasons.push("Al ingepland op dit tijdstip");
    if (!meetsRole) reasons.push("Benodigde rol ontbreekt");
    if (!meetsCertificates) reasons.push("Benodigde certificaten ontbreken");
    if (!meetsDiploma) reasons.push("Benodigd diploma ontbreekt");
    if (!meetsKnowledge) reasons.push("Benodigde kennis ontbreekt");
    if (!meetsSector) reasons.push("Sector komt niet overeen");
    if (!meetsRegion) reasons.push("Regio komt niet overeen");

    const eligible =
      (availStatus === "beschikbaar" || availStatus === "niet_ingesteld") &&
      meetsAvailabilityWindow &&
      !hasConflict &&
      meetsRole &&
      meetsCertificates &&
      meetsDiploma &&
      meetsKnowledge &&
      meetsSector &&
      meetsRegion;

    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      availabilityStatus: availStatus,
      hasConflict,
      meetsRole,
      meetsCertificates,
      meetsDiploma,
      meetsKnowledge,
      sectorId: p.sectorId ?? null,
      sectorName: p.sectorName ?? null,
      meetsSector,
      meetsRegion,
      meetsAvailabilityWindow,
      eligible,
      eligibilityReasons: reasons,
    };
  });
}

export type AssignmentPlanningReadiness = {
  hasMoment: boolean;
  hasPlannedDate: boolean;
  requiredSlots: number;
  eligibleCount: number;
  fullyAvailableCount: number;
  suitableCount: number;
  topMatchCount: number;
  warningCount: number;
  blockedCount: number;
  assignedCount: number;
  suggestedCount: number;
  interestedCount: number;
  highestMatchScore: number;
  capacityStatus: "green" | "orange" | "red";
  advice: string;
  generatedAt: string | null;
  canPoll: boolean;
  topMatches: Array<{
    id: string;
    name: string;
    sectorName: string | null;
    availabilityStatus: AvailabilityStatus;
    assignmentLinkStatus: string | null;
    interestStatus: SmartPlanningInterestResponseStatus | null;
    reasons: string[];
    matchScore: number;
    positives: string[];
    negatives: string[];
  }>;
  candidates: Array<{
    id: string;
    name: string;
    sectorName: string | null;
    hardStatus: "eligible" | "warning" | "blocked";
    assignmentLinkStatus: string | null;
    interestStatus: SmartPlanningInterestResponseStatus | null;
    matchScore: number;
    reasons: string[];
    positives: string[];
    negatives: string[];
  }>;
};

function formatAssignmentMoment(input: {
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
}) {
  const date = input.scheduledDate
    ? new Date(`${input.scheduledDate}T00:00:00`).toLocaleDateString("nl-NL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "datum onbekend";
  const time =
    input.scheduledStart && input.scheduledEnd
      ? `${input.scheduledStart} - ${input.scheduledEnd}`
      : "tijd onbekend";
  return `${date}, ${time}`;
}

const ACTIVE_INTEREST_RESPONSE_STATUSES = [
  "invited",
  "viewed",
  "interested",
  "question",
  "selected",
  "reserve",
  "confirmed",
] as const satisfies readonly SmartPlanningInterestResponseStatus[];

export type AssignmentInterestRoundHistory = {
  id: string;
  roundNumber: number;
  audienceType: string;
  candidateLimit: number;
  status: string;
  sentAt: string | null;
  expiresAt: string | null;
  reminderAfterMinutes: number;
  reminderDueAt: string | null;
  reminderSentAt: string | null;
  skippedCount: number;
  blockedCount: number;
  invitePolicy: Record<string, unknown>;
  counts: Record<SmartPlanningInterestResponseStatus, number>;
  responses: Array<{
    id: string;
    personnelId: string;
    personnelName: string;
    status: SmartPlanningInterestResponseStatus;
    responseNote: string | null;
    viewedAt: string | null;
    respondedAt: string | null;
    selectedAt: string | null;
    expiresAt: string | null;
    matchScore: number | null;
  }>;
};

export async function getAssignmentPlanningReadiness(
  assignmentId: string,
): Promise<AssignmentPlanningReadiness> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) {
    return {
      hasMoment: false,
      hasPlannedDate: false,
      requiredSlots: 1,
      eligibleCount: 0,
      fullyAvailableCount: 0,
      suitableCount: 0,
      topMatchCount: 0,
      warningCount: 0,
      blockedCount: 0,
      assignedCount: 0,
      suggestedCount: 0,
      interestedCount: 0,
      highestMatchScore: 0,
      capacityStatus: "red",
      advice: "Geen toegang tot planninggegevens.",
      generatedAt: null,
      canPoll: false,
      topMatches: [],
      candidates: [],
    };
  }
  const tenantId = await requireCurrentTenantId();
  const [scopedAssignment] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);
  if (!scopedAssignment) {
    return {
      hasMoment: false, hasPlannedDate: false, requiredSlots: 1, eligibleCount: 0,
      fullyAvailableCount: 0, suitableCount: 0, topMatchCount: 0, warningCount: 0,
      blockedCount: 0, assignedCount: 0, suggestedCount: 0, interestedCount: 0,
      highestMatchScore: 0, capacityStatus: "red", advice: "Opdracht niet gevonden.",
      generatedAt: null, canPoll: false, topMatches: [], candidates: [],
    };
  }

  const [[assignment], capacity, links, interestResponses] = await Promise.all([
    db
      .select({
        status: assignmentsTable.status,
        scheduledDate: assignmentsTable.scheduledDate,
        scheduledStart: assignmentsTable.scheduledStart,
        scheduledEnd: assignmentsTable.scheduledEnd,
      })
      .from(assignmentsTable)
      .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
      .limit(1),
    calculateAssignmentCapacity(assignmentId, { persist: true }),
    db
      .select({
        personnelId: assignmentPersonnelTable.personnelId,
        status: assignmentPersonnelTable.status,
      })
      .from(assignmentPersonnelTable)
      .where(eq(assignmentPersonnelTable.assignmentId, assignmentId)),
    db
      .select({
        personnelId: assignmentInterestResponsesTable.personnelId,
        status: assignmentInterestResponsesTable.status,
        createdAt: assignmentInterestResponsesTable.createdAt,
      })
      .from(assignmentInterestResponsesTable)
      .where(eq(assignmentInterestResponsesTable.assignmentId, assignmentId))
      .orderBy(desc(assignmentInterestResponsesTable.createdAt)),
  ]);

  if (!capacity) {
    return {
      hasMoment: false,
      hasPlannedDate: false,
      requiredSlots: 1,
      eligibleCount: 0,
      fullyAvailableCount: 0,
      suitableCount: 0,
      topMatchCount: 0,
      warningCount: 0,
      blockedCount: 0,
      assignedCount: 0,
      suggestedCount: 0,
      interestedCount: 0,
      highestMatchScore: 0,
      capacityStatus: "red",
      advice: "Opdracht niet gevonden.",
      generatedAt: null,
      canPoll: false,
      topMatches: [],
      candidates: [],
    };
  }

  const hasMoment = Boolean(
    assignment?.scheduledDate &&
    assignment.scheduledStart &&
    assignment.scheduledEnd,
  );
  const hasPlannedDate = Boolean(assignment?.scheduledDate);
  const eligible = capacity.candidates.filter((person) => person.eligible);
  const fullyAvailable = capacity.candidates.filter((person) => person.available);
  const warningCount = capacity.candidates.filter(
    (person) => person.hardStatus === "warning",
  ).length;
  const blockedCount = capacity.candidates.filter(
    (person) => person.hardStatus === "blocked",
  ).length;
  const assignedCount = links.filter((link) => link.status === "assigned").length;
  const suggestedCount = links.filter((link) => link.status === "suggested").length;
  const linkStatusByPersonnelId = new Map(
    links.map((link) => [link.personnelId, link.status]),
  );
  const interestStatusByPersonnelId = new Map<string, SmartPlanningInterestResponseStatus>();
  for (const response of interestResponses) {
    if (!interestStatusByPersonnelId.has(response.personnelId)) {
      interestStatusByPersonnelId.set(
        response.personnelId,
        response.status as SmartPlanningInterestResponseStatus,
      );
    }
  }
  const pollableStatuses: AssignmentStatus[] = [
    "requested",
    "review",
    "approved",
    "plannable",
  ];

  return {
    hasMoment,
    hasPlannedDate,
    requiredSlots: capacity.requiredSlots,
    eligibleCount: eligible.length,
    fullyAvailableCount: fullyAvailable.length,
    suitableCount: capacity.suitableTotal,
    topMatchCount: capacity.topMatchTotal,
    warningCount,
    blockedCount,
    assignedCount,
    suggestedCount,
    interestedCount: capacity.interestedTotal,
    highestMatchScore: capacity.highestMatchScore,
    capacityStatus: capacity.capacityStatus,
    advice: capacity.advice,
    generatedAt: capacity.generatedAt.toISOString(),
    canPoll:
      hasMoment &&
      fullyAvailable.length > 0 &&
      Boolean(assignment?.status && pollableStatuses.includes(assignment.status as AssignmentStatus)),
    topMatches: fullyAvailable.slice(0, 5).map((person) => ({
      id: person.personnelId,
      name: `${person.firstName} ${person.lastName}`.trim(),
      sectorName: person.sectorName,
      availabilityStatus: "beschikbaar" as AvailabilityStatus,
      assignmentLinkStatus: linkStatusByPersonnelId.get(person.personnelId) ?? null,
      interestStatus: interestStatusByPersonnelId.get(person.personnelId) ?? null,
      reasons: person.reasons.map((reason) => reason.label),
      matchScore: person.matchScore,
      positives: person.positives,
      negatives: person.negatives,
    })),
    candidates: capacity.candidates.slice(0, 20).map((person) => ({
      id: person.personnelId,
      name: `${person.firstName} ${person.lastName}`.trim(),
      sectorName: person.sectorName,
      hardStatus: person.hardStatus,
      assignmentLinkStatus: linkStatusByPersonnelId.get(person.personnelId) ?? null,
      interestStatus: interestStatusByPersonnelId.get(person.personnelId) ?? null,
      matchScore: person.matchScore,
      reasons: person.reasons.map((reason) => reason.label),
      positives: person.positives,
      negatives: person.negatives,
    })),
  };
}

export async function recalculateAssignmentCapacity(
  assignmentId: string,
): Promise<ActionResult<{ status: "green" | "orange" | "red"; available: number }>> {
  await requirePermission("planning", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };
  const [scopedAssignment] = await db.select({ id: assignmentsTable.id }).from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId))).limit(1);
  if (!scopedAssignment) return { success: false, message: "Opdracht niet gevonden." };

  const result = await calculateAssignmentCapacity(assignmentId, {
    persist: true,
    actorUserId: user.id,
  });

  if (!result) {
    return { success: false, message: "Opdracht niet gevonden." };
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "assignment_capacity_recalculate",
    resource: "assignments",
    resourceId: assignmentId,
    metadata: {
      capacityStatus: result.capacityStatus,
      availableTotal: result.availableTotal,
      topMatchTotal: result.topMatchTotal,
      requiredSlots: result.requiredSlots,
    },
  });

  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath("/planning");
  return {
    success: true,
    data: { status: result.capacityStatus, available: result.availableTotal },
  };
}

export async function sendAssignmentInterestPoll(
  assignmentId: string,
  input?: {
    audienceType?: "top_matches" | "next_matches" | "flexpool" | "spoedpool" | "manual";
    limit?: number;
  },
): Promise<ActionResult<{ notified: number; roundNumber: number; skipped: number; blocked: number }>> {
  await requirePermission("planning", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [assignment] = await db
    .select({
      id: assignmentsTable.id,
      tenantId: assignmentsTable.tenantId,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      priority: assignmentsTable.priority,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      status: assignmentsTable.status,
    })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!assignment) return { success: false, message: "Opdracht niet gevonden." };
  if (!assignment.scheduledDate || !assignment.scheduledStart || !assignment.scheduledEnd) {
    return {
      success: false,
      message: "Vul eerst een datum en tijdvak in voordat je een interessepeiling verstuurt.",
    };
  }

  const capacity = await calculateAssignmentCapacity(assignmentId, {
    persist: true,
    actorUserId: user.id,
  });
  if (!capacity) return { success: false, message: "Opdracht niet gevonden." };

  const defaults = await getSmartPlanningRoundDefaults(assignmentId);
  const audienceType = input?.audienceType ?? "top_matches";
  const limit = Math.max(1, Math.min(input?.limit ?? defaults.roundSize, 50));
  const candidates = capacity.candidates
    .filter((person) => person.available && person.hardStatus === "eligible")
    .sort((a, b) => b.matchScore - a.matchScore);
  if (candidates.length === 0) {
    return {
      success: false,
      message: "Geen volledig passende en beschikbare medewerkers gevonden.",
    };
  }

  const candidateIds = candidates.map((person) => person.personnelId);
  const title = `Interessepeiling ${assignment.code}`;
  const href = "/openstaand";
  const now = new Date();
  const isSpoed = audienceType === "spoedpool" || assignment.priority === "urgent";
  const mayOverrideAntiSpam = isSpoed && defaults.allowEmergencyOverride;
  const skipCounts: Record<string, number> = {
    alreadyPlanned: 0,
    alreadyInvited: 0,
    dailyLimit: 0,
    cooldown: 0,
    overlappingInvite: 0,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cooldownSince = new Date(
    Date.now() - Math.max(0, defaults.inviteCooldownMinutes) * 60_000,
  );
  const [
    existingLinks,
    existingResponses,
    dailyInviteRows,
    cooldownRows,
    overlappingInviteRows,
    latestRoundRows,
  ] = await Promise.all([
    db
      .select({ personnelId: assignmentPersonnelTable.personnelId })
      .from(assignmentPersonnelTable)
      .where(
        and(
          eq(assignmentPersonnelTable.assignmentId, assignmentId),
          inArray(assignmentPersonnelTable.personnelId, candidateIds),
        ),
      ),
    db
      .select({ personnelId: assignmentInterestResponsesTable.personnelId })
      .from(assignmentInterestResponsesTable)
      .where(
        and(
          eq(assignmentInterestResponsesTable.assignmentId, assignmentId),
          inArray(assignmentInterestResponsesTable.personnelId, candidateIds),
        ),
      ),
    db
      .select({
        personnelId: assignmentInterestResponsesTable.personnelId,
        count: sql<number>`count(*)::int`,
      })
      .from(assignmentInterestResponsesTable)
      .where(
        and(
          inArray(assignmentInterestResponsesTable.personnelId, candidateIds),
          gte(assignmentInterestResponsesTable.createdAt, today),
        ),
      )
      .groupBy(assignmentInterestResponsesTable.personnelId),
    db
      .select({ personnelId: assignmentInterestResponsesTable.personnelId })
      .from(assignmentInterestResponsesTable)
      .where(
        and(
          inArray(assignmentInterestResponsesTable.personnelId, candidateIds),
          gte(assignmentInterestResponsesTable.createdAt, cooldownSince),
        ),
      ),
    db
      .select({ personnelId: assignmentInterestResponsesTable.personnelId })
      .from(assignmentInterestResponsesTable)
      .innerJoin(
        assignmentsTable,
        eq(assignmentInterestResponsesTable.assignmentId, assignmentsTable.id),
      )
      .where(
        and(
          inArray(assignmentInterestResponsesTable.personnelId, candidateIds),
          ne(assignmentInterestResponsesTable.assignmentId, assignmentId),
          inArray(assignmentInterestResponsesTable.status, [...ACTIVE_INTEREST_RESPONSE_STATUSES]),
          eq(assignmentsTable.scheduledDate, assignment.scheduledDate),
          or(
            isNull(assignmentInterestResponsesTable.expiresAt),
            gte(assignmentInterestResponsesTable.expiresAt, now),
          ),
          sql<boolean>`${assignmentsTable.scheduledStart} < ${assignment.scheduledEnd} AND ${assignmentsTable.scheduledEnd} > ${assignment.scheduledStart}`,
        ),
      ),
    db
      .select({ roundNumber: assignmentInterestRoundsTable.roundNumber })
      .from(assignmentInterestRoundsTable)
      .where(eq(assignmentInterestRoundsTable.assignmentId, assignmentId))
      .orderBy(desc(assignmentInterestRoundsTable.roundNumber))
      .limit(1),
  ]);

  const linkedIds = new Set(existingLinks.map((link) => link.personnelId));
  const alreadyInvitedIds = new Set(
    existingResponses.map((response) => response.personnelId),
  );
  const dailyInviteCounts = new Map(
    dailyInviteRows.map((row) => [row.personnelId, row.count ?? 0]),
  );
  const cooldownIds = new Set(cooldownRows.map((row) => row.personnelId));
  const overlappingInviteIds = new Set(
    overlappingInviteRows.map((row) => row.personnelId),
  );
  const recipients: typeof candidates = [];

  for (const person of candidates) {
    if (linkedIds.has(person.personnelId)) {
      skipCounts.alreadyPlanned += 1;
      continue;
    }
    if (alreadyInvitedIds.has(person.personnelId)) {
      skipCounts.alreadyInvited += 1;
      continue;
    }
    if (overlappingInviteIds.has(person.personnelId)) {
      skipCounts.overlappingInvite += 1;
      continue;
    }
    if (!mayOverrideAntiSpam) {
      if ((dailyInviteCounts.get(person.personnelId) ?? 0) >= defaults.maxDailyInvites) {
        skipCounts.dailyLimit += 1;
        continue;
      }
      if (defaults.inviteCooldownMinutes > 0 && cooldownIds.has(person.personnelId)) {
        skipCounts.cooldown += 1;
        continue;
      }
    }
    recipients.push(person);
    if (recipients.length >= limit) break;
  }

  if (recipients.length === 0) {
    const readableReasons = [
      skipCounts.alreadyPlanned ? `${skipCounts.alreadyPlanned} al gepland` : "",
      skipCounts.alreadyInvited ? `${skipCounts.alreadyInvited} al eerder uitgenodigd` : "",
      skipCounts.overlappingInvite ? `${skipCounts.overlappingInvite} overlappende uitnodiging` : "",
      skipCounts.dailyLimit ? `${skipCounts.dailyLimit} daglimiet bereikt` : "",
      skipCounts.cooldown ? `${skipCounts.cooldown} binnen cooldown` : "",
    ].filter(Boolean);
    return {
      success: false,
      message:
        readableReasons.length > 0
          ? `Geen medewerkers uitgenodigd door anti-spamregels: ${readableReasons.join(", ")}.`
          : "Alle passende medewerkers zijn al gekoppeld of eerder genotificeerd.",
    };
  }

  const momentLabel = formatAssignmentMoment(assignment);
  const notificationPriority: "high" | "normal" =
    assignment.priority === "urgent" || assignment.priority === "high" || isSpoed
      ? "high"
      : "normal";
  const nextRoundNumber = (latestRoundRows[0]?.roundNumber ?? 0) + 1;
  const skipped = candidates.length - recipients.length;
  const blocked = skipCounts.dailyLimit + skipCounts.cooldown + skipCounts.overlappingInvite;
  const invitePolicy = {
    maxDailyInvites: defaults.maxDailyInvites,
    inviteCooldownMinutes: defaults.inviteCooldownMinutes,
    allowEmergencyOverride: defaults.allowEmergencyOverride,
    emergencyOverrideApplied: mayOverrideAntiSpam,
    skipCounts,
  };
  let roundId = "";

  await db.transaction(async (tx) => {
    const [round] = await tx
      .insert(assignmentInterestRoundsTable)
      .values({
        tenantId: assignment.tenantId,
        assignmentId,
        roundNumber: nextRoundNumber,
        audienceType,
        candidateLimit: limit,
        status: "sent",
        sentAt: now,
        expiresAt: defaults.expiresAt,
        reminderAfterMinutes: defaults.reminderAfterMinutes,
        reminderDueAt: defaults.reminderDueAt,
        invitePolicy,
        skippedCount: skipped,
        blockedCount: blocked,
        createdBy: user.id,
      })
      .returning({ id: assignmentInterestRoundsTable.id });
    roundId = round!.id;

    await tx.insert(assignmentInterestResponsesTable).values(
      recipients.map((person) => ({
        tenantId: assignment.tenantId,
        assignmentId,
        roundId,
        personnelId: person.personnelId,
        status: "invited" as const,
        expiresAt: defaults.expiresAt,
      })),
    );

    await tx.insert(auditLogTable).values({
      userId: user.id,
      action: "assignment_interest_poll",
      resource: "assignments",
      resourceId: assignmentId,
      metadata: {
        roundId,
        roundNumber: nextRoundNumber,
        audienceType,
        notified: recipients.length,
        candidateCount: candidates.length,
        skipped,
        blocked,
        invitePolicy,
        scheduledDate: assignment.scheduledDate,
        scheduledStart: assignment.scheduledStart,
        scheduledEnd: assignment.scheduledEnd,
      },
    });
  });

  await Promise.all(
    recipients.map((person) =>
      emitDomainEvent({
        eventKey: "assignment_interest_invited",
        tenantId: assignment.tenantId,
        actorUserId: user.id,
        audience: "personnel",
        aggregate: { type: "assignment", id: assignmentId },
        recipients: { personnelIds: [person.personnelId] },
        payload: {
          assignment: {
            id: assignment.id,
            code: assignment.code,
            title: assignment.title,
            date: assignment.scheduledDate,
            date_label: momentLabel.split(", ")[0] ?? assignment.scheduledDate,
            time_range: `${assignment.scheduledStart} - ${assignment.scheduledEnd}`,
          },
          object: {
            name: capacity.inputSnapshot.object && typeof capacity.inputSnapshot.object === "object"
              ? (capacity.inputSnapshot.object as { name?: string | null }).name ?? ""
              : "",
            city: capacity.inputSnapshot.object && typeof capacity.inputSnapshot.object === "object"
              ? (capacity.inputSnapshot.object as { city?: string | null }).city ?? ""
              : "",
          },
          recipient: {
            name: `${person.firstName} ${person.lastName}`.trim(),
          },
          href,
          priority: notificationPriority,
          round: {
            id: roundId,
            number: nextRoundNumber,
          },
        },
        fallback: {
          title: "Je bent uitgenodigd",
          body: `Je bent uitgenodigd voor ${assignment.code}: ${assignment.title}. Moment: ${momentLabel}. Reageer via Open diensten.`,
          pushTitle: "Je bent uitgenodigd",
          pushBody: `${assignment.code} - ${assignment.title} - ${momentLabel}`,
          category: "planning",
          priority: notificationPriority,
          href,
          sourceLabel: "Planning",
        },
        audit: false,
      }),
    ),
  );
  await triggerNotificationWorker({ channels: ["push"], limit: Math.max(25, recipients.length) });

  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath("/planning");
  return {
    success: true,
    data: { notified: recipients.length, roundNumber: nextRoundNumber, skipped, blocked },
  };
}

export async function listAssignmentInterestRounds(
  assignmentId: string,
): Promise<AssignmentInterestRoundHistory[]> {
  await requirePermission("assignments", "read");

  const [rounds, responses] = await Promise.all([
    db
      .select()
      .from(assignmentInterestRoundsTable)
      .where(eq(assignmentInterestRoundsTable.assignmentId, assignmentId))
      .orderBy(desc(assignmentInterestRoundsTable.roundNumber)),
    db
      .select({
        id: assignmentInterestResponsesTable.id,
        roundId: assignmentInterestResponsesTable.roundId,
        personnelId: assignmentInterestResponsesTable.personnelId,
        status: assignmentInterestResponsesTable.status,
        responseNote: assignmentInterestResponsesTable.responseNote,
        viewedAt: assignmentInterestResponsesTable.viewedAt,
        respondedAt: assignmentInterestResponsesTable.respondedAt,
        selectedAt: assignmentInterestResponsesTable.selectedAt,
        expiresAt: assignmentInterestResponsesTable.expiresAt,
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
        matchScore: assignmentCandidatesTable.matchScore,
      })
      .from(assignmentInterestResponsesTable)
      .innerJoin(personnelTable, eq(assignmentInterestResponsesTable.personnelId, personnelTable.id))
      .leftJoin(
        assignmentCandidatesTable,
        and(
          eq(assignmentCandidatesTable.assignmentId, assignmentInterestResponsesTable.assignmentId),
          eq(assignmentCandidatesTable.personnelId, assignmentInterestResponsesTable.personnelId),
        ),
      )
      .where(eq(assignmentInterestResponsesTable.assignmentId, assignmentId))
      .orderBy(
        desc(assignmentInterestResponsesTable.createdAt),
        asc(personnelTable.lastName),
      ),
  ]);

  const responsesByRoundId = new Map<string, typeof responses>();
  for (const response of responses) {
    const current = responsesByRoundId.get(response.roundId) ?? [];
    current.push(response);
    responsesByRoundId.set(response.roundId, current);
  }

  const emptyCounts = (): Record<SmartPlanningInterestResponseStatus, number> => ({
    invited: 0,
    viewed: 0,
    interested: 0,
    unavailable: 0,
    question: 0,
    selected: 0,
    reserve: 0,
    confirmed: 0,
    cancelled: 0,
    expired: 0,
  });

  return rounds.map((round) => {
    const roundResponses = responsesByRoundId.get(round.id) ?? [];
    const counts = emptyCounts();
    for (const response of roundResponses) counts[response.status] += 1;

    return {
      id: round.id,
      roundNumber: round.roundNumber,
      audienceType: round.audienceType,
      candidateLimit: round.candidateLimit,
      status: round.status,
      sentAt: round.sentAt?.toISOString() ?? null,
      expiresAt: round.expiresAt?.toISOString() ?? null,
      reminderAfterMinutes: round.reminderAfterMinutes,
      reminderDueAt: round.reminderDueAt?.toISOString() ?? null,
      reminderSentAt: round.reminderSentAt?.toISOString() ?? null,
      skippedCount: round.skippedCount,
      blockedCount: round.blockedCount,
      invitePolicy:
        round.invitePolicy && typeof round.invitePolicy === "object"
          ? round.invitePolicy
          : {},
      counts,
      responses: roundResponses.map((response) => ({
        id: response.id,
        personnelId: response.personnelId,
        personnelName: `${response.firstName} ${response.lastName}`.trim(),
        status: response.status,
        responseNote: response.responseNote,
        viewedAt: response.viewedAt?.toISOString() ?? null,
        respondedAt: response.respondedAt?.toISOString() ?? null,
        selectedAt: response.selectedAt?.toISOString() ?? null,
        expiresAt: response.expiresAt?.toISOString() ?? null,
        matchScore: response.matchScore ?? null,
      })),
    };
  });
}

export async function sendAssignmentInterestReminder(
  assignmentId: string,
  roundId: string,
): Promise<ActionResult<{ reminded: number }>> {
  await requirePermission("planning", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };
  const [scopedAssignment] = await db.select({ id: assignmentsTable.id }).from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId))).limit(1);
  if (!scopedAssignment) return { success: false, message: "Opdracht niet gevonden." };

  const [round] = await db
    .select()
    .from(assignmentInterestRoundsTable)
    .where(
      and(
        eq(assignmentInterestRoundsTable.id, roundId),
        eq(assignmentInterestRoundsTable.assignmentId, assignmentId),
      ),
    )
    .limit(1);

  if (!round) return { success: false, message: "Ronde niet gevonden." };
  if (round.status !== "sent") {
    return { success: false, message: "Alleen verzonden rondes kunnen een reminder krijgen." };
  }
  if (round.reminderSentAt) {
    return { success: false, message: "Voor deze ronde is al een reminder verstuurd." };
  }

  const [[assignment], responses] = await Promise.all([
    db
      .select({
        id: assignmentsTable.id,
        tenantId: assignmentsTable.tenantId,
        code: assignmentsTable.code,
        title: assignmentsTable.title,
        scheduledDate: assignmentsTable.scheduledDate,
        scheduledStart: assignmentsTable.scheduledStart,
        scheduledEnd: assignmentsTable.scheduledEnd,
        objectName: objectsTable.name,
        objectCity: objectsTable.city,
      })
      .from(assignmentsTable)
      .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
      .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
      .limit(1),
    db
      .select({
        personnelId: assignmentInterestResponsesTable.personnelId,
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
      })
      .from(assignmentInterestResponsesTable)
      .innerJoin(personnelTable, eq(assignmentInterestResponsesTable.personnelId, personnelTable.id))
      .where(
        and(
          eq(assignmentInterestResponsesTable.roundId, roundId),
          inArray(assignmentInterestResponsesTable.status, ["invited", "viewed"]),
          or(
            isNull(assignmentInterestResponsesTable.expiresAt),
            gte(assignmentInterestResponsesTable.expiresAt, new Date()),
          ),
        ),
      ),
  ]);

  if (!assignment) return { success: false, message: "Opdracht niet gevonden." };
  if (responses.length === 0) {
    return { success: false, message: "Geen openstaande reacties om te herinneren." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(assignmentInterestRoundsTable)
      .set({ reminderSentAt: new Date() })
      .where(eq(assignmentInterestRoundsTable.id, roundId));

    await tx.insert(auditLogTable).values({
      userId: user.id,
      action: "assignment_interest_reminder",
      resource: "assignments",
      resourceId: assignmentId,
      metadata: {
        roundId,
        roundNumber: round.roundNumber,
        reminded: responses.length,
      },
    });
  });

  await Promise.all(
    responses.map((person) =>
      emitDomainEvent({
        eventKey: "assignment_interest_reminder",
        tenantId: assignment.tenantId,
        actorUserId: user.id,
        audience: "personnel",
        aggregate: { type: "assignment", id: assignmentId },
        recipients: { personnelIds: [person.personnelId] },
        payload: {
          assignment: {
            id: assignment.id,
            code: assignment.code,
            title: assignment.title,
            date: assignment.scheduledDate,
            time_range: `${assignment.scheduledStart} - ${assignment.scheduledEnd}`,
          },
          object: {
            name: assignment.objectName ?? "",
            city: assignment.objectCity ?? "",
          },
          recipient: {
            name: `${person.firstName} ${person.lastName}`.trim(),
          },
          href: "/openstaand",
          round: {
            id: roundId,
            number: round.roundNumber,
          },
        },
        fallback: {
          title: `Herinnering ${assignment.code}`,
          body: `Je hebt nog niet gereageerd op ${assignment.title}.`,
          category: "planning",
          priority: "normal",
          href: "/openstaand",
          sourceLabel: "Planning",
        },
        audit: false,
      }),
    ),
  );
  await triggerNotificationWorker({ channels: ["push"], limit: Math.max(25, responses.length) });

  revalidatePath(`/assignments/${assignmentId}`);
  return { success: true, data: { reminded: responses.length } };
}

export async function markInterestCandidate(
  assignmentId: string,
  personnelId: string,
  status: "selected" | "reserve" | "cancelled",
): Promise<ActionResult> {
  await requirePermission("planning", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const tenantId = await requireCurrentTenantId();

  let selection;
  try {
    selection = await selectInterestCandidateCanonically({
      tenantId,
      assignmentId: assignmentId.trim(),
      personnelId: personnelId.trim(),
      status,
      actorUserId: user.id,
    });
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Selectie kon niet worden verwerkt.",
    };
  }

  const [[assignment], [personnel]] = await Promise.all([
    db
      .select({
        tenantId: assignmentsTable.tenantId,
        code: assignmentsTable.code,
        title: assignmentsTable.title,
      })
      .from(assignmentsTable)
      .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
      .limit(1),
    db
      .select({
        firstName: personnelTable.firstName,
        lastName: personnelTable.lastName,
      })
      .from(personnelTable)
      .where(and(eq(personnelTable.id, personnelId), eq(personnelTable.tenantId, tenantId)))
      .limit(1),
  ]);

  await safeRefreshPlanningRoutesForAssignment({
    tenantId,
    userId: user.id,
    assignmentId,
    reason: "assignment_assigned",
    status: selection.assignmentStatus,
    personnelIds: [personnelId],
    source: "backoffice",
  });

  if (status !== "cancelled" && assignment && personnel) {
    await emitDomainEvent({
      eventKey:
        status === "reserve"
          ? "assignment_interest_reserve"
          : "assignment_interest_selected",
      tenantId: assignment.tenantId,
      actorUserId: user.id,
      audience: "personnel",
      aggregate: { type: "assignment", id: assignmentId },
      recipients: { personnelIds: [personnelId] },
      payload: {
        assignment: {
          id: assignmentId,
          code: assignment.code,
          title: assignment.title,
          status: selection.assignmentStatus,
          assignedCount: selection.assignedCount,
          requiredPersonnelCount: selection.requiredPersonnelCount,
        },
        recipient: {
          name: `${personnel.firstName} ${personnel.lastName}`.trim(),
        },
        href: selection.canonicalAssignmentLinked ? "/opdrachten" : "/openstaand",
      },
      fallback: {
        title:
          status === "reserve"
            ? `Reserve voor ${assignment.code}`
            : `Geselecteerd voor ${assignment.code}`,
        body:
          status === "reserve"
            ? "Je staat als reserve voor deze opdracht."
            : "Planning heeft je geselecteerd voor deze opdracht.",
        category: "planning",
        priority: "normal",
        href: selection.canonicalAssignmentLinked ? "/opdrachten" : "/openstaand",
      },
      audit: false,
    });
    await triggerNotificationWorker({ channels: ["push"], limit: 25 });
  }

  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath("/planning");
  revalidatePath("/personeel/opdrachten");
  revalidatePath("/personeel/openstaand");
  return { success: true };
}

/**
 * Result type for rescheduleAssignment.
 *
 * `success: true`  — move was applied. Optional `warning` contains a human-readable
 *                    description of personnel conflicts/availability issues that the
 *                    planner should be aware of but that did NOT block the move.
 * `success: false` — hard block: invalid date, missing assignment, status guard.
 */
export type RescheduleResult =
  | { success: true; warning?: string }
  | { success: false; message: string };

export type ApplyRouteTimeSuggestionResult =
  | {
      success: true;
      warning?: string;
      applied: {
        routeContextId: string;
        assignmentId: string;
        personnelId: string;
        from: { start: string | null; end: string | null };
        to: { start: string; end: string | null };
      };
    }
  | { success: false; message: string };

/**
 * Move an assignment to a different date (drag-to-reschedule in week planning).
 *
 * Hard blocks (return success: false):
 *   1. Invalid date format.
 *   2. Assignment not found.
 *   3. Assignment status is not 'plannable' or 'scheduled'.
 *
 * Soft warnings (move proceeds, warning returned in result):
 *   - Personnel is ziek / op_verlof / niet_beschikbaar on newDate.
 *   - Time-slot conflict with another confirmed assignment on newDate.
 *   - Availability window does not cover the assignment's time slot.
 *
 * Planners retain full control — only the status guard hard-blocks a move.
 */
export async function rescheduleAssignment(
  id: string,
  newDate: string,
): Promise<RescheduleResult> {
  await requirePermission("planning", "write");
  const tenantId = await requireCurrentTenantId();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { success: false, message: "Ongeldige datum." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  // ── 1. Fetch assignment ────────────────────────────────────────────────────
  const [existing] = await db
    .select({
      id: assignmentsTable.id,
      tenantId: assignmentsTable.tenantId,
      status: assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
    })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!existing) return { success: false, message: "Opdracht niet gevonden." };
  if (existing.scheduledDate === newDate) return { success: true };

  // ── 2. Status guard (hard block) ───────────────────────────────────────────
  const RESCHEDULABLE: AssignmentStatus[] = ["plannable", "scheduled"];
  if (!RESCHEDULABLE.includes(existing.status as AssignmentStatus)) {
    return {
      success: false,
      message: `Alleen opdrachten met status 'plannable' of 'scheduled' kunnen worden verplaatst (huidige status: ${existing.status}).`,
    };
  }

  // ── 3. Personnel checks → collect as warnings (do not block) ──────────────
  const warningParts: string[] = [];

  const assignedLinks = await db
    .select({ personnelId: assignmentPersonnelTable.personnelId })
    .from(assignmentPersonnelTable)
    .where(
      and(
        eq(assignmentPersonnelTable.assignmentId, id),
        eq(assignmentPersonnelTable.status, "assigned"),
      ),
    );

  if (assignedLinks.length > 0) {
    const personnelIds = assignedLinks.map((p) => p.personnelId);

    // 3a. Availability status (ziek / op_verlof / niet_beschikbaar)
    const statusMap = await getBatchAvailabilityStatus(personnelIds, newDate);
    const unavailable = personnelIds.filter((pid) => {
      const s = statusMap[pid] as AvailabilityStatus | undefined;
      return s === "ziek" || s === "op_verlof" || s === "niet_beschikbaar";
    });

    if (unavailable.length > 0) {
      const nameRows = await db
        .select({
          id: personnelTable.id,
          firstName: personnelTable.firstName,
          lastName: personnelTable.lastName,
        })
        .from(personnelTable)
        .where(inArray(personnelTable.id, unavailable));
      const nameList = nameRows
        .map((n) => `${n.firstName} ${n.lastName}`.trim())
        .join(", ");
      warningParts.push(
        `${nameList} ${unavailable.length === 1 ? "is" : "zijn"} niet beschikbaar op ${newDate}.`,
      );
    }

    // 3b. Time-slot checks (only when assignment has start + end times)
    if (existing.scheduledStart && existing.scheduledEnd) {
      const asgnStartMin = timeToMin(existing.scheduledStart);
      const asgnEndMin = timeToMin(existing.scheduledEnd);
      const dayOfWeek = new Date(newDate + "T00:00:00").getDay();

      // 3b-i. Double-booking conflict
      const conflictRows = await db
        .select({ personnelId: assignmentPersonnelTable.personnelId })
        .from(assignmentPersonnelTable)
        .innerJoin(
          assignmentsTable,
          eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
        )
        .where(
          and(
            eq(assignmentsTable.scheduledDate, newDate),
            inArray(assignmentPersonnelTable.personnelId, personnelIds),
            ne(assignmentPersonnelTable.assignmentId, id),
            eq(assignmentPersonnelTable.status, "assigned"),
            or(
              isNull(assignmentsTable.scheduledStart),
              isNull(assignmentsTable.scheduledEnd),
              sql<boolean>`${assignmentsTable.scheduledStart} < ${existing.scheduledEnd} AND ${assignmentsTable.scheduledEnd} > ${existing.scheduledStart}`,
            ),
          ),
        );

      if (conflictRows.length > 0) {
        const conflictIds = [
          ...new Set(conflictRows.map((r) => r.personnelId)),
        ];
        const nameRows = await db
          .select({
            id: personnelTable.id,
            firstName: personnelTable.firstName,
            lastName: personnelTable.lastName,
          })
          .from(personnelTable)
          .where(inArray(personnelTable.id, conflictIds));
        const nameList = nameRows
          .map((n) => `${n.firstName} ${n.lastName}`.trim())
          .join(", ");
        warningParts.push(
          `${nameList} ${conflictIds.length === 1 ? "heeft" : "hebben"} een conflicterende inplanning op ${newDate}.`,
        );
      }

      // 3b-ii. Availability window does not cover the full time slot
      const [dayEntryRows, windowRows] = await Promise.all([
        db
          .select({
            personnelId: availabilityDayEntriesTable.personnelId,
            startTime: availabilityDayEntriesTable.startTime,
            endTime: availabilityDayEntriesTable.endTime,
          })
          .from(availabilityDayEntriesTable)
          .where(
            and(
              inArray(availabilityDayEntriesTable.personnelId, personnelIds),
              eq(availabilityDayEntriesTable.date, newDate),
            ),
          ),
        db
          .select({
            personnelId: availabilityWindowsTable.personnelId,
            startTime: availabilityWindowsTable.startTime,
            endTime: availabilityWindowsTable.endTime,
          })
          .from(availabilityWindowsTable)
          .where(
            and(
              inArray(availabilityWindowsTable.personnelId, personnelIds),
              eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
            ),
          ),
      ]);

      const coverageMap = new Map<string, boolean>();
      for (const w of windowRows) {
        if (!coverageMap.has(w.personnelId)) {
          const wStart = timeToMin(w.startTime);
          const wEnd = timeToMin(w.endTime);
          coverageMap.set(
            w.personnelId,
            wStart <= asgnStartMin && wEnd >= asgnEndMin,
          );
        }
      }
      for (const w of dayEntryRows) {
        const wStart = timeToMin(w.startTime);
        const wEnd = timeToMin(w.endTime);
        coverageMap.set(
          w.personnelId,
          wStart <= asgnStartMin && wEnd >= asgnEndMin,
        );
      }

      const outsideWindow = personnelIds.filter((pid) => {
        const s = statusMap[pid] as AvailabilityStatus | undefined;
        if (s !== "beschikbaar") return false;
        return !(coverageMap.get(pid) ?? false);
      });

      if (outsideWindow.length > 0) {
        const nameRows = await db
          .select({
            id: personnelTable.id,
            firstName: personnelTable.firstName,
            lastName: personnelTable.lastName,
          })
          .from(personnelTable)
          .where(inArray(personnelTable.id, outsideWindow));
        const nameList = nameRows
          .map((n) => `${n.firstName} ${n.lastName}`.trim())
          .join(", ");
        warningParts.push(
          `Het beschikbaarheidsvenster van ${nameList} dekt het tijdslot (${existing.scheduledStart}–${existing.scheduledEnd}) niet op ${newDate}.`,
        );
      }
    }
  }

  // ── 4. Persist (always, if status guard passed) ────────────────────────────
  await db
    .update(assignmentsTable)
    .set({ scheduledDate: newDate })
    .where(eq(assignmentsTable.id, id));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "assignments",
    resourceId: id,
    metadata: {
      action: "reschedule",
      from: existing.scheduledDate,
      to: newDate,
      warnings: warningParts.length > 0 ? warningParts : undefined,
    },
  });
  await reconcileAssignmentChecklistsRecoverably({
    tenantId,
    assignmentId: id,
    trigger: "assignment_scheduled",
    idempotencyKey: `assignment-rescheduled:${id}:${existing.scheduledDate ?? "unset"}:${newDate}`,
    actorUserId: user.id,
  });

  if (assignedLinks.length > 0) {
    await notifyAssignmentWorkflow({
      eventKey: "assignment_rescheduled",
      assignmentId: id,
      actorUserId: user.id,
      audience: "personnel",
      recipients: { personnelIds: assignedLinks.map((link) => link.personnelId) },
    });
  }

  await safeRefreshPlanningRoutesForAssignment({
    tenantId: existing.tenantId,
    assignmentId: id,
    reason: "assignment_rescheduled",
    previousScheduledDate: existing.scheduledDate,
    status: existing.status,
    personnelIds: assignedLinks.map((link) => link.personnelId),
    source: "backoffice",
  });

  revalidatePath("/planning");

  return warningParts.length > 0
    ? { success: true, warning: `Let op: ${warningParts.join(" ")}` }
    : { success: true };
}

/**
 * Shift an assignment to a different time slot on the same day
 * (drag-to-reshift in day-view planning).
 *
 * Hard blocks (return success: false):
 *   1. Invalid time format.
 *   2. Assignment not found or has no scheduled date.
 *   3. Assignment status is not 'plannable' or 'scheduled'.
 *
 * Soft warnings (shift proceeds, warning returned in result):
 *   - Personnel is ziek / op_verlof / niet_beschikbaar.
 *   - Time-slot conflict with another confirmed assignment on the same day.
 *   - Availability window does not cover the new time slot.
 */
export async function reshiftAssignment(
  id: string,
  newStart: string,
  newEnd: string | null,
): Promise<RescheduleResult> {
  await requirePermission("planning", "write");
  const tenantId = await requireCurrentTenantId();

  const TIME_RE = /^\d{2}:\d{2}$/;
  if (!TIME_RE.test(newStart)) {
    return { success: false, message: "Ongeldig tijdstip." };
  }
  if (newEnd !== null && !TIME_RE.test(newEnd)) {
    return { success: false, message: "Ongeldig eindtijdstip." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [existing] = await db
    .select({
      id: assignmentsTable.id,
      tenantId: assignmentsTable.tenantId,
      status: assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
    })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!existing) return { success: false, message: "Opdracht niet gevonden." };
  if (!existing.scheduledDate) {
    return { success: false, message: "Opdracht heeft geen ingeplande datum." };
  }

  if (
    existing.scheduledStart === newStart &&
    existing.scheduledEnd === newEnd
  ) {
    return { success: true };
  }

  const RESHIFTABLE: AssignmentStatus[] = ["plannable", "scheduled"];
  if (!RESHIFTABLE.includes(existing.status as AssignmentStatus)) {
    return {
      success: false,
      message: `Alleen opdrachten met status 'plannable' of 'scheduled' kunnen worden verplaatst (huidige status: ${existing.status}).`,
    };
  }

  const warningParts: string[] = [];
  const scheduledDate = existing.scheduledDate;

  const assignedLinks = await db
    .select({ personnelId: assignmentPersonnelTable.personnelId })
    .from(assignmentPersonnelTable)
    .where(
      and(
        eq(assignmentPersonnelTable.assignmentId, id),
        eq(assignmentPersonnelTable.status, "assigned"),
      ),
    );

  if (assignedLinks.length > 0) {
    const personnelIds = assignedLinks.map((p) => p.personnelId);
    const dayOfWeek = new Date(scheduledDate + "T00:00:00").getDay();
    const newStartMin = timeToMin(newStart);
    const newEndMin = newEnd ? timeToMin(newEnd) : newStartMin + 60;

    // 1. Availability status
    const statusMap = await getBatchAvailabilityStatus(
      personnelIds,
      scheduledDate,
    );
    const unavailable = personnelIds.filter((pid) => {
      const s = statusMap[pid] as AvailabilityStatus | undefined;
      return s === "ziek" || s === "op_verlof" || s === "niet_beschikbaar";
    });
    if (unavailable.length > 0) {
      const nameRows = await db
        .select({
          id: personnelTable.id,
          firstName: personnelTable.firstName,
          lastName: personnelTable.lastName,
        })
        .from(personnelTable)
        .where(inArray(personnelTable.id, unavailable));
      const nameList = nameRows
        .map((n) => `${n.firstName} ${n.lastName}`.trim())
        .join(", ");
      warningParts.push(
        `${nameList} ${unavailable.length === 1 ? "is" : "zijn"} niet beschikbaar op ${scheduledDate}.`,
      );
    }

    // 2. Double-booking conflict (exclude this assignment)
    const conflictRows = await db
      .select({ personnelId: assignmentPersonnelTable.personnelId })
      .from(assignmentPersonnelTable)
      .innerJoin(
        assignmentsTable,
        eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
      )
      .where(
        and(
          eq(assignmentsTable.scheduledDate, scheduledDate),
          inArray(assignmentPersonnelTable.personnelId, personnelIds),
          ne(assignmentPersonnelTable.assignmentId, id),
          eq(assignmentPersonnelTable.status, "assigned"),
          or(
            isNull(assignmentsTable.scheduledStart),
            isNull(assignmentsTable.scheduledEnd),
            sql<boolean>`${assignmentsTable.scheduledStart} < ${newEnd ?? newStart} AND ${assignmentsTable.scheduledEnd} > ${newStart}`,
          ),
        ),
      );

    if (conflictRows.length > 0) {
      const conflictIds = [...new Set(conflictRows.map((r) => r.personnelId))];
      const nameRows = await db
        .select({
          id: personnelTable.id,
          firstName: personnelTable.firstName,
          lastName: personnelTable.lastName,
        })
        .from(personnelTable)
        .where(inArray(personnelTable.id, conflictIds));
      const nameList = nameRows
        .map((n) => `${n.firstName} ${n.lastName}`.trim())
        .join(", ");
      warningParts.push(
        `${nameList} ${conflictIds.length === 1 ? "heeft" : "hebben"} een conflicterende inplanning op ${scheduledDate}.`,
      );
    }

    // 3. Availability window coverage
    const [dayEntryRows, windowRows] = await Promise.all([
      db
        .select({
          personnelId: availabilityDayEntriesTable.personnelId,
          startTime: availabilityDayEntriesTable.startTime,
          endTime: availabilityDayEntriesTable.endTime,
        })
        .from(availabilityDayEntriesTable)
        .where(
          and(
            inArray(availabilityDayEntriesTable.personnelId, personnelIds),
            eq(availabilityDayEntriesTable.date, scheduledDate),
          ),
        ),
      db
        .select({
          personnelId: availabilityWindowsTable.personnelId,
          startTime: availabilityWindowsTable.startTime,
          endTime: availabilityWindowsTable.endTime,
        })
        .from(availabilityWindowsTable)
        .where(
          and(
            inArray(availabilityWindowsTable.personnelId, personnelIds),
            eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
          ),
        ),
    ]);

    const coverageMap = new Map<string, boolean>();
    for (const w of windowRows) {
      if (!coverageMap.has(w.personnelId)) {
        const wStart = timeToMin(w.startTime);
        const wEnd = timeToMin(w.endTime);
        coverageMap.set(
          w.personnelId,
          wStart <= newStartMin && wEnd >= newEndMin,
        );
      }
    }
    for (const w of dayEntryRows) {
      const wStart = timeToMin(w.startTime);
      const wEnd = timeToMin(w.endTime);
      coverageMap.set(
        w.personnelId,
        wStart <= newStartMin && wEnd >= newEndMin,
      );
    }

    const outsideWindow = personnelIds.filter((pid) => {
      const s = statusMap[pid] as AvailabilityStatus | undefined;
      if (s !== "beschikbaar") return false;
      return !(coverageMap.get(pid) ?? false);
    });

    if (outsideWindow.length > 0) {
      const nameRows = await db
        .select({
          id: personnelTable.id,
          firstName: personnelTable.firstName,
          lastName: personnelTable.lastName,
        })
        .from(personnelTable)
        .where(inArray(personnelTable.id, outsideWindow));
      const nameList = nameRows
        .map((n) => `${n.firstName} ${n.lastName}`.trim())
        .join(", ");
      warningParts.push(
        `Het beschikbaarheidsvenster van ${nameList} dekt het tijdslot (${newStart}–${newEnd ?? ""}) niet.`,
      );
    }
  }

  await db
    .update(assignmentsTable)
    .set({ scheduledStart: newStart, scheduledEnd: newEnd })
    .where(eq(assignmentsTable.id, id));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "assignments",
    resourceId: id,
    metadata: {
      action: "reshift",
      from: { start: existing.scheduledStart, end: existing.scheduledEnd },
      to: { start: newStart, end: newEnd },
      warnings: warningParts.length > 0 ? warningParts : undefined,
    },
  });

  if (assignedLinks.length > 0) {
    await notifyAssignmentWorkflow({
      eventKey: "assignment_rescheduled",
      assignmentId: id,
      actorUserId: user.id,
      audience: "personnel",
      recipients: { personnelIds: assignedLinks.map((link) => link.personnelId) },
    });
  }

  await safeRefreshPlanningRoutesForAssignment({
    tenantId: existing.tenantId,
    assignmentId: id,
    reason: "assignment_reshifted",
    status: existing.status,
    personnelIds: assignedLinks.map((link) => link.personnelId),
    source: "backoffice",
  });

  revalidatePath("/planning");

  return warningParts.length > 0
    ? { success: true, warning: `Let op: ${warningParts.join(" ")}` }
    : { success: true };
}

export async function applyRouteTimeSuggestion(input: {
  routeContextId: string;
  assignmentId: string;
}): Promise<ApplyRouteTimeSuggestionResult> {
  await requirePermission("planning", "write");

  const routeContextId = input.routeContextId.trim();
  const assignmentId = input.assignmentId.trim();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(routeContextId) || !UUID_RE.test(assignmentId)) {
    return { success: false, message: "Ongeldig routevoorstel." };
  }

  const tenantId = await requireCurrentTenantId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [context] = await db
    .select({
      routeContextId: assignmentRouteContextsTable.id,
      assignmentId: assignmentRouteContextsTable.assignmentId,
      personnelId: assignmentRouteContextsTable.personnelId,
      scheduledDate: assignmentRouteContextsTable.scheduledDate,
      snapStatus: assignmentRouteContextsTable.snapStatus,
      snapSuggestedStart: assignmentRouteContextsTable.snapSuggestedStart,
      snapSuggestedEnd: assignmentRouteContextsTable.snapSuggestedEnd,
      warningCode: assignmentRouteContextsTable.warningCode,
      warningMessage: assignmentRouteContextsTable.warningMessage,
      currentStart: assignmentsTable.scheduledStart,
      currentEnd: assignmentsTable.scheduledEnd,
      currentStatus: assignmentsTable.status,
    })
    .from(assignmentRouteContextsTable)
    .innerJoin(
      assignmentsTable,
      and(
        eq(assignmentsTable.id, assignmentRouteContextsTable.assignmentId),
        eq(assignmentsTable.tenantId, tenantId),
        eq(assignmentsTable.isActive, true),
      ),
    )
    .where(
      and(
        eq(assignmentRouteContextsTable.id, routeContextId),
        eq(assignmentRouteContextsTable.tenantId, tenantId),
        eq(assignmentRouteContextsTable.assignmentId, assignmentId),
      ),
    )
    .limit(1);

  if (!context) {
    return { success: false, message: "Routevoorstel niet gevonden." };
  }
  if (!context.snapSuggestedStart) {
    return { success: false, message: "Deze routecontext heeft geen toepasbaar tijdvoorstel." };
  }
  if (context.warningCode === "missing_location" || context.warningCode === "provider_error") {
    return {
      success: false,
      message: context.warningMessage ?? "Dit routevoorstel kan nog niet worden toegepast.",
    };
  }

  const to = {
    start: context.snapSuggestedStart,
    end: context.snapSuggestedEnd,
  };
  const from = {
    start: context.currentStart,
    end: context.currentEnd,
  };

  if (from.start === to.start && from.end === to.end) {
    return {
      success: true,
      applied: {
        routeContextId,
        assignmentId,
        personnelId: context.personnelId,
        from,
        to,
      },
    };
  }

  const result = await reshiftAssignment(assignmentId, to.start, to.end);
  if (!result.success) return result;

  await db.insert(auditLogTable).values({
    tenantId,
    userId: user.id,
    action: "apply_route_time_suggestion",
    resource: "assignments",
    resourceId: assignmentId,
    metadata: {
      action: "apply_route_time_suggestion",
      routeContextId,
      personnelId: context.personnelId,
      scheduledDate: context.scheduledDate,
      snapStatus: context.snapStatus,
      assignmentStatus: context.currentStatus,
      from,
      to,
      warning: result.warning,
    },
  });

  await safeRefreshPlanningRoutesForAssignment({
    tenantId,
    assignmentId,
    reason: "route_time_suggestion_applied",
    status: context.currentStatus as AssignmentStatus,
    personnelIds: [context.personnelId],
    source: "backoffice",
  });

  revalidatePath("/planning");
  revalidatePath(`/assignments/${assignmentId}`);

  return {
    success: true,
    warning: result.warning,
    applied: {
      routeContextId,
      assignmentId,
      personnelId: context.personnelId,
      from,
      to,
    },
  };
}

export async function getTaskCodeOptions(): Promise<TaskCodeOption[]> {
  const tenantId = await requireCurrentTenantId();
  const rows = await db
    .select({
      id: taskCodesTable.id,
      code: taskCodesTable.code,
      name: taskCodesTable.name,
    })
    .from(taskCodesTable)
    .where(and(eq(taskCodesTable.tenantId, tenantId), eq(taskCodesTable.isActive, true)))
    .orderBy(asc(taskCodesTable.code));
  return rows;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createAssignment(
  data: AssignmentFormInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [customer] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(and(eq(customersTable.id, data.customerId), eq(customersTable.tenantId, tenantId)))
    .limit(1);
  if (!customer) return { success: false, message: "Klant niet gevonden binnen deze tenant." };

  const payload = {
    title: data.title.trim(),
    description: data.description?.trim() || null,
    customerId: data.customerId,
    objectId: data.objectId || null,
    status: data.status,
    priority: data.priority,
    scheduledDate: data.scheduledDate || null,
    scheduledStart: data.scheduledStart || null,
    scheduledEnd: data.scheduledEnd || null,
    notes: data.notes?.trim() || null,
    requiredRegion: data.requiredRegion?.trim() || null,
    requiredPersonnelCount: Math.max(1, Math.min(Number(data.requiredPersonnelCount ?? 1), 50)),
    customerSignatureRequired: Boolean(data.customerSignatureRequired),
    createdBy: user.id,
  };

  const parsed = insertAssignmentSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validatie mislukt.", fieldErrors };
  }

  try {
    const [created] = await db
      .insert(assignmentsTable)
      .values({ ...parsed.data, tenantId })
      .returning({ id: assignmentsTable.id });

    await db.insert(auditLogTable).values({
      userId: user.id,
      action: "create",
      resource: "assignments",
      resourceId: created!.id,
      metadata: { title: payload.title, status: payload.status },
    });

    await calculateAssignmentCapacity(created!.id, {
      persist: true,
      actorUserId: user.id,
    });
    await reconcileAssignmentChecklistsRecoverably({
      tenantId,
      assignmentId: created!.id,
      trigger: "assignment_created",
      idempotencyKey: `assignment-created:${created!.id}`,
      actorUserId: user.id,
    });

    revalidatePath("/assignments");
    return { success: true, data: { id: created!.id } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een opdracht met deze gegevens.",
      };
    }
    return { success: false, message: "Opdracht aanmaken mislukt." };
  }
}

export async function updateAssignment(
  id: string,
  data: AssignmentFormInput,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [currentAssignment] = await db
    .select({ status: assignmentsTable.status })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);
  if (!currentAssignment) return { success: false, message: "Opdracht niet gevonden binnen deze organisatie." };

  const payload = {
    title: data.title.trim(),
    description: data.description?.trim() || null,
    customerId: data.customerId,
    objectId: data.objectId || null,
    status: currentAssignment.status,
    priority: data.priority,
    scheduledDate: data.scheduledDate || null,
    scheduledStart: data.scheduledStart || null,
    scheduledEnd: data.scheduledEnd || null,
    notes: data.notes?.trim() || null,
    requiredRegion: data.requiredRegion?.trim() || null,
    requiredPersonnelCount: Math.max(1, Math.min(Number(data.requiredPersonnelCount ?? 1), 50)),
    customerSignatureRequired: Boolean(data.customerSignatureRequired),
  };

  try {
    assertGenericAssignmentEditDoesNotTouchLifecycle(data as unknown as Record<string, unknown>);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Lifecycle velden vereisen expliciete acties." };
  }

  const parsed = updateAssignmentSchema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return { success: false, message: "Validatie mislukt.", fieldErrors };
  }

  try {
    const updatedRows = await db
      .update(assignmentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.tenantId, tenantId)))
      .returning({ id: assignmentsTable.id, updatedAt: assignmentsTable.updatedAt });

    if (updatedRows.length === 0) {
      return { success: false, message: "Opdracht niet gevonden binnen deze organisatie." };
    }

    await db.insert(auditLogTable).values({
      userId: user.id,
      action: "update",
      resource: "assignments",
      resourceId: id,
      metadata: { title: payload.title },
    });

    await calculateAssignmentCapacity(id, {
      persist: true,
      actorUserId: user.id,
    });
    await reconcileAssignmentChecklistsRecoverably({
      tenantId,
      assignmentId: id,
      trigger: "assignment_context_changed",
      idempotencyKey: `assignment-context:${id}:${updatedRows[0]!.updatedAt.toISOString()}`,
      actorUserId: user.id,
    });

    revalidatePath("/assignments");
    revalidatePath(`/assignments/${id}`);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Er bestaat al een opdracht met deze gegevens.",
      };
    }
    return { success: false, message: "Opdracht bijwerken mislukt." };
  }
}

export async function setAssignmentStatus(
  id: string,
  newStatus: AssignmentStatus,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  // Fetch current status to validate transition
  const [current] = await db
    .select({ status: assignmentsTable.status, title: assignmentsTable.title, lifecycleVersion: assignmentsTable.lifecycleVersion })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!current) return { success: false, message: "Opdracht niet gevonden." };
  if (["seen", "en_route", "in_progress", "completed", "not_completed"].includes(newStatus)) {
    return { success: false, message: "Uitvoeringsstatussen worden uitsluitend door medewerkeracties en werkelijke tijden bepaald." };
  }
  if (newStatus === "cancelled") {
    return { success: false, message: "Annuleer de opdracht via de aparte annuleringsactie met verplichte reden." };
  }

  if (!ASSIGNMENT_STATUSES.includes(newStatus)) {
    return { success: false, message: "Onbekende opdrachtstatus." };
  }

  const allowed = ASSIGNMENT_STATUS_TRANSITIONS[current.status as AssignmentStatus];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      message: `Statuswijziging van "${current.status}" naar "${newStatus}" is niet toegestaan.`,
    };
  }

  try {
    const transition = await transitionAssignmentStatus({
      tenantId,
      assignmentId: id,
      actorUserId: user.id,
      newStatus,
      expectedVersion: current.lifecycleVersion,
    });
    await reconcileAssignmentChecklistsRecoverably({
      tenantId,
      assignmentId: id,
      trigger: newStatus === "scheduled" ? "assignment_scheduled" : "assignment_context_changed",
      idempotencyKey: `assignment-status:${id}:${transition.lifecycleVersion}`,
      actorUserId: user.id,
    });
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Statuswijziging mislukt." };
  }

  const routeRefreshReason = ROUTE_REFRESH_STATUS_REASONS[newStatus];
  if (routeRefreshReason) {
    await safeRefreshPlanningRoutesForAssignment({
      tenantId,
      assignmentId: id,
      reason: routeRefreshReason,
      previousStatus: current.status,
      status: newStatus,
      source: "backoffice",
    });
  }

  revalidatePath("/assignments");
  revalidatePath(`/assignments/${id}`);
  return { success: true };
}

export async function assignPersonnel(
  assignmentId: string,
  personnelId: string,
): Promise<ActionResult & { warning?: string }> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  // Fetch the scheduling context to decide whether this is a planned shift or only a personnel link.
  const [assignment] = await db
    .select({
      code: assignmentsTable.code,
      status: assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
    })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  const [personnel] = await db
    .select({ id: personnelTable.id, isActive: personnelTable.isActive })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, personnelId), eq(personnelTable.tenantId, tenantId)))
    .limit(1);

  if (!assignment) {
    return { success: false, message: "Opdracht niet gevonden binnen deze organisatie." };
  }
  if (!personnel) {
    return { success: false, message: "Medewerker niet gevonden binnen deze organisatie." };
  }
  if (!personnel.isActive) {
    return { success: false, message: "Deze medewerker is niet actief en kan niet worden gekoppeld." };
  }

  try {
    const staffing = await transitionAssignmentStaffing({
      tenantId,
      assignmentId,
      personnelId,
      actorUserId: user.id,
      action: "assign",
    });
    const routeRefreshStatus = staffing.assignmentStatus;
    await reconcileAssignmentChecklistsRecoverably({
      tenantId,
      assignmentId,
      trigger: "assignment_staffing_changed",
      idempotencyKey: `assignment-staffing:${staffing.assignmentPersonnelId}:${staffing.lifecycleVersion}`,
      actorUserId: user.id,
    });


    // ── Availability warning (non-blocking) ───────────────────────────────
    const isScheduled = Boolean(assignment.scheduledDate);

    await notifyAssignmentWorkflow({
      eventKey: isScheduled ? "assignment_assigned" : "assignment_personnel_linked",
      assignmentId,
      actorUserId: user.id,
      audience: "personnel",
      recipients: { personnelIds: [personnelId] },
      fallback: isScheduled
        ? {
            title: `Werkbon ${assignment.code} ingepland`,
            body: `Je bent ingepland op ${assignment.scheduledDate} van ${assignment.scheduledStart ?? "tijd onbekend"} tot ${assignment.scheduledEnd ?? "tijd onbekend"}.`,
            pushTitle: `Werkbon ${assignment.code} ingepland`,
            pushBody: `${assignment.scheduledDate} ${assignment.scheduledStart ?? ""}-${assignment.scheduledEnd ?? ""}. Bekijk je planning.`,
            priority: assignment.scheduledDate === new Date().toISOString().slice(0, 10) ? "high" : "normal",
          }
        : {
            title: `Werkbon ${assignment.code} gekoppeld`,
            body: "Je bent gekoppeld aan deze werkbon. Zodra planning datum en tijd vastzet, verschijnt hij in Mijn planning.",
            pushTitle: `Werkbon ${assignment.code} gekoppeld`,
            pushBody: "Planning heeft je gekoppeld aan een werkbon. Datum en tijd volgen nog.",
            priority: "normal",
          },
    });

    await triggerNotificationWorker({ channels: ["push"], limit: 25 });

    await safeRefreshPlanningRoutesForAssignment({
      tenantId,
      assignmentId,
      reason: "assignment_assigned",
      status: routeRefreshStatus,
      personnelIds: [personnelId],
      source: "backoffice",
    });

    revalidatePath(`/assignments/${assignmentId}`);
    revalidatePath("/planning");

    let warning: string | undefined;
    const dateStr = assignment?.scheduledDate;

    if (dateStr) {
      const [leave] = await db
        .select({ leaveType: leavePeriodsTable.leaveType })
        .from(leavePeriodsTable)
        .where(
          and(
            eq(leavePeriodsTable.personnelId, personnelId),
            lte(leavePeriodsTable.startDate, dateStr),
            or(
              isNull(leavePeriodsTable.endDate),
              gte(leavePeriodsTable.endDate, dateStr),
            ),
          ),
        )
        .limit(1);

      if (leave?.leaveType === "ziekte") {
        warning = "Let op: medewerker is ziek op de geplande datum.";
      } else if (leave) {
        warning = "Let op: medewerker is op verlof op de geplande datum.";
      } else {
        const dayOfWeek = new Date(dateStr + "T00:00:00").getDay();
        const [[todayWindow], [anyWindow]] = await Promise.all([
          db
            .select({ id: availabilityWindowsTable.id })
            .from(availabilityWindowsTable)
            .where(
              and(
                eq(availabilityWindowsTable.personnelId, personnelId),
                eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
              ),
            )
            .limit(1),
          db
            .select({ id: availabilityWindowsTable.id })
            .from(availabilityWindowsTable)
            .where(eq(availabilityWindowsTable.personnelId, personnelId))
            .limit(1),
        ]);
        if (!todayWindow && anyWindow) {
          warning =
            "Let op: medewerker is normaal gesproken niet beschikbaar op deze dag.";
        }
      }
    }

    if (!dateStr) {
      warning =
        warning ??
        "Medewerker gekoppeld, maar deze werkbon heeft nog geen plandatum. Plan de werkbon via het planbord voordat hij op een dag in de personeelsapp verschijnt.";
    }

    return { success: true, warning };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Medewerker koppelen mislukt.",
    };
  }
}

export async function removePersonnel(
  assignmentId: string,
  linkId: string,
  reason: string,
  expectedVersion?: number,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    return { success: false, message: "Een reden voor ontkoppelen is verplicht." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [link] = await db
    .select({
      id: assignmentPersonnelTable.id,
      personnelId: assignmentPersonnelTable.personnelId,
      status: assignmentPersonnelTable.status,
      lifecycleVersion: assignmentPersonnelTable.lifecycleVersion,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(assignmentPersonnelTable.id, linkId),
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
        eq(assignmentPersonnelTable.status, "assigned"),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!link) {
    return { success: false, message: "Actieve koppeling niet gevonden binnen deze organisatie." };
  }

  let staffing;
  try {
    staffing = await transitionAssignmentStaffing({
      tenantId,
      assignmentId,
      personnelId: link.personnelId,
      actorUserId: user.id,
      action: "unassign",
      reason: normalizedReason,
      expectedVersion: expectedVersion ?? link.lifecycleVersion,
    });
    await reconcileAssignmentChecklistsRecoverably({
      tenantId,
      assignmentId,
      trigger: "assignment_staffing_changed",
      idempotencyKey: `assignment-staffing:${staffing.assignmentPersonnelId}:${staffing.lifecycleVersion}`,
      actorUserId: user.id,
    });
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Ontkoppelen mislukt.",
    };
  }

  await safeRefreshPlanningRoutesForAssignment({
    tenantId,
    assignmentId,
    reason: "assignment_unassigned",
    status: staffing.assignmentStatus,
    personnelIds: [link.personnelId],
    source: "backoffice",
  });

  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath("/planning");
  return { success: true };
}

export async function addAssignmentTask(
  assignmentId: string,
  taskCodeId: string,
  notes?: string,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [assignment] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);
  if (!assignment) return { success: false, message: "Werkbon niet gevonden binnen deze organisatie." };

  const [taskCode] = await db
    .select({
      id: taskCodesTable.id,
      code: taskCodesTable.code,
      name: taskCodesTable.name,
      price: taskCodesTable.price,
      invoiceable: taskCodesTable.invoiceable,
    })
    .from(taskCodesTable)
    .where(and(eq(taskCodesTable.id, taskCodeId), eq(taskCodesTable.tenantId, tenantId), eq(taskCodesTable.isActive, true)))
    .limit(1);
  if (!taskCode) return { success: false, message: "Taakcode niet gevonden binnen deze organisatie." };

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(sort_order), -1)::int` })
    .from(assignmentTasksTable)
    .where(eq(assignmentTasksTable.assignmentId, assignmentId));

  const [created] = await db
    .insert(assignmentTasksTable)
    .values({
      assignmentId,
      taskCodeId: taskCode.id,
      taskCodeCode: taskCode.code,
      taskCodeName: taskCode.name,
      taskCodePrice: taskCode.price,
      taskCodeInvoiceable: taskCode.invoiceable,
      notes: notes ?? null,
      sortOrder: (maxOrder ?? -1) + 1,
    })
    .returning({ id: assignmentTasksTable.id });

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "add_task",
    resource: "assignments",
    resourceId: assignmentId,
    metadata: { taskCodeId, taskId: created!.id },
  });

  await calculateAssignmentCapacity(assignmentId, {
    persist: true,
    actorUserId: user.id,
  });
  await reconcileAssignmentChecklistsRecoverably({
    tenantId,
    assignmentId,
    trigger: "assignment_task_changed",
    idempotencyKey: `assignment-task-added:${created!.id}`,
    actorUserId: user.id,
  });

  revalidatePath(`/assignments/${assignmentId}`);
  return { success: true };
}

export async function removeAssignmentTask(
  assignmentId: string,
  taskId: string,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [assignment] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);
  if (!assignment) return { success: false, message: "Werkbon niet gevonden binnen deze organisatie." };

  await db
    .delete(assignmentTasksTable)
    .where(
      and(
        eq(assignmentTasksTable.id, taskId),
        eq(assignmentTasksTable.assignmentId, assignmentId),
      ),
    );

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "remove_task",
    resource: "assignments",
    resourceId: assignmentId,
    metadata: { taskId },
  });

  await calculateAssignmentCapacity(assignmentId, {
    persist: true,
    actorUserId: user.id,
  });
  await reconcileAssignmentChecklistsRecoverably({
    tenantId,
    assignmentId,
    trigger: "assignment_task_changed",
    idempotencyKey: `assignment-task-removed:${taskId}`,
    actorUserId: user.id,
  });

  revalidatePath(`/assignments/${assignmentId}`);
  return { success: true };
}

export async function approveDirectly(id: string): Promise<ActionResult> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [current] = await db
    .select({ status: assignmentsTable.status, title: assignmentsTable.title })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!current) return { success: false, message: "Opdracht niet gevonden." };
  if (current.status !== "review") {
    return {
      success: false,
      message:
        "Directe goedkeuring is alleen mogelijk voor opdrachten met status 'review'.",
    };
  }

  // review → approved → plannable (skip quote)
  await db
    .update(assignmentsTable)
    .set({ status: "approved", updatedAt: new Date() })
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.tenantId, tenantId)));

  await db
    .update(assignmentsTable)
    .set({ status: "plannable", updatedAt: new Date() })
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.tenantId, tenantId)));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "direct_approve",
    resource: "assignments",
    resourceId: id,
    metadata: { title: current.title, from: "review", to: "plannable" },
  });
  await reconcileAssignmentChecklistsRecoverably({
    tenantId,
    assignmentId: id,
    trigger: "assignment_context_changed",
    idempotencyKey: `assignment-direct-approved:${id}`,
    actorUserId: user.id,
  });

  revalidatePath("/assignments");
  revalidatePath(`/assignments/${id}`);
  return { success: true };
}

export async function deleteAssignment(id: string, reason: string): Promise<ActionResult> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    return { success: false, message: "Een reden voor annuleren is verplicht." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const assignedLinks = await db
    .select({ personnelId: assignmentPersonnelTable.personnelId })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, and(
      eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
      eq(assignmentsTable.tenantId, tenantId),
    ))
    .where(and(
      eq(assignmentPersonnelTable.assignmentId, id),
      eq(assignmentPersonnelTable.status, "assigned"),
    ));

  try {
    await cancelAssignmentStaffing({
      tenantId,
      assignmentId: id,
      actorUserId: user.id,
      reason: normalizedReason,
    });
    await finalizeAssignmentChecklists({
      tenantId,
      assignmentId: id,
      actorUserId: user.id,
      outcome: "cancelled",
    });
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Opdracht annuleren mislukt.",
    };
  }

  if (assignedLinks.length > 0) {
    await notifyAssignmentWorkflow({
      eventKey: "assignment_cancelled_personnel",
      assignmentId: id,
      actorUserId: user.id,
      audience: "personnel",
      recipients: { personnelIds: assignedLinks.map((link) => link.personnelId) },
    });
    await triggerNotificationWorker({ channels: ["push"], limit: Math.max(25, assignedLinks.length) });
  }

  await safeRefreshPlanningRoutesForAssignment({
    tenantId,
    assignmentId: id,
    reason: "assignment_unassigned",
    status: "cancelled",
    source: "backoffice",
  });
  revalidatePath("/assignments");
  revalidatePath("/planning");
  revalidatePath(`/assignments/${id}`);
  return { success: true };
}

// ─── Assignment History ────────────────────────────────────────────────────────

export type AssignmentHistoryRow = {
  id: string;
  code: string;
  title: string;
  status: AssignmentStatus;
  scheduledDate: string | null;
  objectName: string | null;
};

export async function listAssignmentsForCustomer(
  customerId: string,
  limit = 10,
): Promise<AssignmentHistoryRow[]> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return [];
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({
      id: assignmentsTable.id,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      objectName: objectsTable.name,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(and(eq(assignmentsTable.customerId, customerId), eq(assignmentsTable.tenantId, tenantId)))
    .orderBy(desc(assignmentsTable.scheduledDate))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    status: r.status as AssignmentStatus,
    scheduledDate: r.scheduledDate ?? null,
    objectName: r.objectName ?? null,
  }));
}

export async function listAssignmentsForObject(
  objectId: string,
  limit = 50,
): Promise<AssignmentHistoryRow[]> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return [];
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({
      id: assignmentsTable.id,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      objectName: objectsTable.name,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(and(eq(assignmentsTable.objectId, objectId), eq(assignmentsTable.tenantId, tenantId)))
    .orderBy(desc(assignmentsTable.scheduledDate))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    status: r.status as AssignmentStatus,
    scheduledDate: r.scheduledDate ?? null,
    objectName: r.objectName ?? null,
  }));
}

export async function listAssignmentsForPersonnel(
  personnelId: string,
  limit = 10,
): Promise<AssignmentHistoryRow[]> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return [];
  const tenantId = await requireCurrentTenantId();

  const rows = await db
    .select({
      id: assignmentsTable.id,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      objectName: objectsTable.name,
    })
    .from(assignmentsTable)
    .innerJoin(
      assignmentPersonnelTable,
      eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
    )
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(and(
      eq(assignmentPersonnelTable.personnelId, personnelId),
      eq(assignmentsTable.tenantId, tenantId),
    ))
    .orderBy(desc(assignmentsTable.scheduledDate))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    status: r.status as AssignmentStatus,
    scheduledDate: r.scheduledDate ?? null,
    objectName: r.objectName ?? null,
  }));
}
