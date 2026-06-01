"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  assignmentPersonnelTable,
  assignmentTasksTable,
  customersTable,
  objectsTable,
  personnelTable,
  taskCodesTable,
  auditLogTable,
  leavePeriodsTable,
  availabilityWindowsTable,
  insertAssignmentSchema,
  updateAssignmentSchema,
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_PRIORITIES,
  ASSIGNMENT_STATUS_TRANSITIONS,
  type AssignmentStatus,
  type AssignmentPriority,
} from "@workspace/db";
import { eq, ilike, or, and, asc, desc, inArray, sql, gte, lte, isNull, ne } from "drizzle-orm";
import { getBatchAvailabilityStatus, type AvailabilityStatus } from "./availability";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type CustomerOption  = { id: string; name: string };
export type ObjectOption    = { id: string; name: string };
export type PersonnelOption = {
  id:                  string;
  firstName:           string;
  lastName:            string;
  availabilityStatus?: AvailabilityStatus;
};
export type TaskCodeOption  = { id: string; code: string; name: string };

export type AssignmentRow = {
  id:             string;
  code:           string;
  title:          string;
  status:         AssignmentStatus;
  priority:       AssignmentPriority;
  scheduledDate:  string | null;
  scheduledStart: string | null;
  scheduledEnd:   string | null;
  customerId:     string;
  customerName:   string;
  objectId:       string | null;
  objectName:     string | null;
  personnelCount: number;
  reportStatus:   string | null;
  createdAt:      string;
};

export type AssignmentDetail = {
  id:             string;
  code:           string;
  title:          string;
  description:    string | null;
  status:         AssignmentStatus;
  priority:       AssignmentPriority;
  scheduledDate:  string | null;
  scheduledStart: string | null;
  scheduledEnd:   string | null;
  notes:          string | null;
  requiredRegion: string | null;
  isActive:       boolean;
  customerId:     string;
  customerName:   string;
  objectId:       string | null;
  objectName:     string | null;
  createdAt:      string;
  updatedAt:      string;
  personnel: Array<{
    id:          string;
    personnelId: string;
    firstName:   string;
    lastName:    string;
    /** 'assigned' = confirmed by planner; 'suggested' = self-applied via PWA pending confirmation */
    linkStatus:  string;
  }>;
  tasks: Array<{
    id:           string;
    taskCodeId:   string | null;
    taskCodeCode: string | null;
    taskCodeName: string | null;
    notes:        string | null;
    sortOrder:    number;
  }>;
};

export type AssignmentFormInput = {
  title:           string;
  description?:    string;
  customerId:      string;
  objectId?:       string;
  status:          AssignmentStatus;
  priority:        AssignmentPriority;
  scheduledDate?:  string;
  scheduledStart?: string;
  scheduledEnd?:   string;
  notes?:          string;
  requiredRegion?: string;
};

export type WeekAssignment = {
  id:             string;
  title:          string;
  status:         AssignmentStatus;
  priority:       AssignmentPriority;
  scheduledDate:  string;
  scheduledStart: string | null;
  scheduledEnd:   string | null;
  customerName:   string;
  objectName:     string | null;
  personnelNames: string[];
  hasConflict:    boolean;
};

export type TimelineAssignment = {
  id:             string;
  title:          string;
  status:         AssignmentStatus;
  scheduledStart: string | null;
  scheduledEnd:   string | null;
  customerName:   string;
  hasConflict:    boolean;
};

export type TimelinePersonnelRow = {
  personnelId: string;
  firstName:   string;
  lastName:    string;
  assignments: TimelineAssignment[];
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listAssignments(params: {
  page?:         number;
  search?:       string;
  status?:       string;
  priority?:     string;
  reportStatus?: string;
  sort?:         string;
  dir?:          string;
}): Promise<{ rows: AssignmentRow[]; total: number }> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return { rows: [], total: 0 };

  const {
    page         = 1,
    search       = "",
    status       = "",
    priority     = "",
    reportStatus = "",
    sort         = "createdAt",
    dir          = "desc",
  } = params;

  const SORTABLE = ["title", "scheduledDate", "createdAt", "status", "priority"] as const;
  const safeSort = SORTABLE.includes(sort as typeof SORTABLE[number])
    ? sort as typeof SORTABLE[number]
    : "createdAt";

  // Build where conditions
  const conditions = [];
  if (search.trim()) {
    conditions.push(
      or(
        ilike(assignmentsTable.title, `%${search.trim()}%`),
        ilike(assignmentsTable.code,  `%${search.trim()}%`),
        ilike(customersTable.name,    `%${search.trim()}%`),
      ),
    );
  }
  if (status && ASSIGNMENT_STATUSES.includes(status as AssignmentStatus)) {
    conditions.push(eq(assignmentsTable.status, status));
  }
  if (priority && ASSIGNMENT_PRIORITIES.includes(priority as AssignmentPriority)) {
    conditions.push(eq(assignmentsTable.priority, priority));
  }
  if (reportStatus === "none") {
    conditions.push(
      isNull(
        sql<string>`(SELECT r.status FROM reports r WHERE r.assignment_id = ${assignmentsTable.id} ORDER BY r.submitted_at DESC LIMIT 1)`,
      ),
    );
  } else if (["draft", "submitted", "approved", "rejected"].includes(reportStatus)) {
    conditions.push(
      eq(
        sql<string>`(SELECT r.status FROM reports r WHERE r.assignment_id = ${assignmentsTable.id} ORDER BY r.submitted_at DESC LIMIT 1)`,
        reportStatus,
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const sortCol = {
    title:         assignmentsTable.title,
    scheduledDate: assignmentsTable.scheduledDate,
    createdAt:     assignmentsTable.createdAt,
    status:        assignmentsTable.status,
    priority:      assignmentsTable.priority,
  }[safeSort];

  const orderFn = dir === "asc" ? asc : desc;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id:             assignmentsTable.id,
        code:           assignmentsTable.code,
        title:          assignmentsTable.title,
        status:         assignmentsTable.status,
        priority:       assignmentsTable.priority,
        scheduledDate:  assignmentsTable.scheduledDate,
        scheduledStart: assignmentsTable.scheduledStart,
        scheduledEnd:   assignmentsTable.scheduledEnd,
        customerId:     assignmentsTable.customerId,
        customerName:   customersTable.name,
        objectId:       assignmentsTable.objectId,
        objectName:     objectsTable.name,
        createdAt:      assignmentsTable.createdAt,
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
      .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
      .leftJoin(objectsTable,   eq(assignmentsTable.objectId,   objectsTable.id))
      .where(where)
      .orderBy(orderFn(sortCol!))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(assignmentsTable)
      .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
      .leftJoin(objectsTable,   eq(assignmentsTable.objectId,   objectsTable.id))
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      status:       r.status       as AssignmentStatus,
      priority:     r.priority     as AssignmentPriority,
      objectId:     r.objectId     ?? null,
      objectName:   r.objectName   ?? null,
      scheduledDate:  r.scheduledDate  ?? null,
      scheduledStart: r.scheduledStart ?? null,
      scheduledEnd:   r.scheduledEnd   ?? null,
      customerName: r.customerName ?? "",
      reportStatus: r.reportStatus ?? null,
      createdAt:    r.createdAt.toISOString(),
    })),
    total: count,
  };
}

export async function getAssignment(id: string): Promise<AssignmentDetail | null> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return null;

  const [row] = await db
    .select({
      id:             assignmentsTable.id,
      code:           assignmentsTable.code,
      title:          assignmentsTable.title,
      description:    assignmentsTable.description,
      status:         assignmentsTable.status,
      priority:       assignmentsTable.priority,
      scheduledDate:  assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd:   assignmentsTable.scheduledEnd,
      notes:          assignmentsTable.notes,
      requiredRegion: assignmentsTable.requiredRegion,
      isActive:       assignmentsTable.isActive,
      customerId:     assignmentsTable.customerId,
      customerName:   customersTable.name,
      objectId:       assignmentsTable.objectId,
      objectName:     objectsTable.name,
      createdAt:      assignmentsTable.createdAt,
      updatedAt:      assignmentsTable.updatedAt,
    })
    .from(assignmentsTable)
    .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable,   eq(assignmentsTable.objectId,   objectsTable.id))
    .where(eq(assignmentsTable.id, id))
    .limit(1);

  if (!row) return null;

  const [personnel, tasks] = await Promise.all([
    db
      .select({
        id:          assignmentPersonnelTable.id,
        personnelId: assignmentPersonnelTable.personnelId,
        linkStatus:  assignmentPersonnelTable.status,
        firstName:   personnelTable.firstName,
        lastName:    personnelTable.lastName,
      })
      .from(assignmentPersonnelTable)
      .leftJoin(personnelTable, eq(assignmentPersonnelTable.personnelId, personnelTable.id))
      // Show ALL links (assigned + suggested) so planner can review and confirm candidates
      .where(eq(assignmentPersonnelTable.assignmentId, id))
      .orderBy(asc(personnelTable.lastName)),

    db
      .select({
        id:           assignmentTasksTable.id,
        taskCodeId:   assignmentTasksTable.taskCodeId,
        taskCodeCode: taskCodesTable.code,
        taskCodeName: taskCodesTable.name,
        notes:        assignmentTasksTable.notes,
        sortOrder:    assignmentTasksTable.sortOrder,
      })
      .from(assignmentTasksTable)
      .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
      .where(eq(assignmentTasksTable.assignmentId, id))
      .orderBy(asc(assignmentTasksTable.sortOrder)),
  ]);

  return {
    ...row,
    status:       row.status   as AssignmentStatus,
    priority:     row.priority as AssignmentPriority,
    customerName: row.customerName ?? "",
    objectId:     row.objectId   ?? null,
    objectName:   row.objectName ?? null,
    scheduledDate:  row.scheduledDate  ?? null,
    scheduledStart: row.scheduledStart ?? null,
    scheduledEnd:   row.scheduledEnd   ?? null,
    requiredRegion: row.requiredRegion ?? null,
    createdAt:    row.createdAt.toISOString(),
    updatedAt:    row.updatedAt.toISOString(),
    personnel: personnel.map((p) => ({
      id:          p.id,
      personnelId: p.personnelId,
      firstName:   p.firstName  ?? "",
      lastName:    p.lastName   ?? "",
      linkStatus:  p.linkStatus,
    })),
    tasks: tasks.map((t) => ({
      id:           t.id,
      taskCodeId:   t.taskCodeId   ?? null,
      taskCodeCode: t.taskCodeCode ?? null,
      taskCodeName: t.taskCodeName ?? null,
      notes:        t.notes        ?? null,
      sortOrder:    t.sortOrder,
    })),
  };
}

export async function getAssignmentsForWeek(
  weekStart: string,
  weekEnd: string,
): Promise<WeekAssignment[]> {
  const canRead = await hasPermission("planning", "read");
  if (!canRead) return [];

  const rows = await db
    .select({
      id:             assignmentsTable.id,
      title:          assignmentsTable.title,
      status:         assignmentsTable.status,
      priority:       assignmentsTable.priority,
      scheduledDate:  assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd:   assignmentsTable.scheduledEnd,
      customerName:   customersTable.name,
      objectName:     objectsTable.name,
    })
    .from(assignmentsTable)
    .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable,   eq(assignmentsTable.objectId,   objectsTable.id))
    .where(
      and(
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
      personnelId:  assignmentPersonnelTable.personnelId,
      firstName:    personnelTable.firstName,
      lastName:     personnelTable.lastName,
    })
    .from(assignmentPersonnelTable)
    .leftJoin(personnelTable, eq(assignmentPersonnelTable.personnelId, personnelTable.id))
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
  const availabilityByDate = new Map<string, Record<string, AvailabilityStatus>>();
  await Promise.all(
    Array.from(datePersonnelMap.entries()).map(async ([date, pidSet]) => {
      const statusMap = await getBatchAvailabilityStatus(Array.from(pidSet), date);
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
        if (!a.scheduledStart || !a.scheduledEnd || !b.scheduledStart || !b.scheduledEnd) {
          conflictAssignmentIds.add(a.id);
          conflictAssignmentIds.add(b.id);
        } else if (a.scheduledStart < b.scheduledEnd && a.scheduledEnd > b.scheduledStart) {
          conflictAssignmentIds.add(a.id);
          conflictAssignmentIds.add(b.id);
        }
      }
    }
  }

  return validRows.map((r) => ({
    id:             r.id,
    title:          r.title,
    status:         r.status   as AssignmentStatus,
    priority:       r.priority as AssignmentPriority,
    scheduledDate:  r.scheduledDate!,
    scheduledStart: r.scheduledStart ?? null,
    scheduledEnd:   r.scheduledEnd   ?? null,
    customerName:   r.customerName   ?? "",
    objectName:     r.objectName     ?? null,
    personnelNames: personnelByAssignment.get(r.id) ?? [],
    hasConflict:    conflictAssignmentIds.has(r.id),
  }));
}

// ─── Month view ───────────────────────────────────────────────────────────────

/**
 * Returns all assignments for the calendar grid of a given month.
 * The grid starts on Monday of the week containing the 1st, and ends on Sunday
 * of the week containing the last day — so typically 28–42 days.
 * Reuses WeekAssignment (including hasConflict) via getAssignmentsForWeek.
 */
export async function getAssignmentsForMonth(monthStr: string): Promise<WeekAssignment[]> {
  const match = /^(\d{4})-(\d{2})$/.exec(monthStr);
  if (!match) return [];

  const year  = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10) - 1; // 0-indexed

  // First and last day of the calendar month
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  // Grid start: Monday of the week that contains firstDay
  const gridStart = new Date(firstDay);
  const startDow  = firstDay.getDay(); // 0=Sun … 6=Sat
  gridStart.setDate(firstDay.getDate() - (startDow === 0 ? 6 : startDow - 1));

  // Grid end: Sunday of the week that contains lastDay
  const gridEnd = new Date(lastDay);
  const endDow  = lastDay.getDay();
  gridEnd.setDate(lastDay.getDate() + (endDow === 0 ? 0 : 7 - endDow));

  // Ensure at least 5 weeks (35 cells) — short Februaries starting on Monday are only 4 weeks
  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;
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
  requested:  number;
  plannable:  number;
  inProgress: number;
  completedToday: number;
}> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return { requested: 0, plannable: 0, inProgress: 0, completedToday: 0 };

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [counts] = await db
    .select({
      requested: sql<number>`count(*) FILTER (WHERE status = 'requested')::int`,
      plannable: sql<number>`count(*) FILTER (WHERE status = 'plannable')::int`,
      inProgress: sql<number>`count(*) FILTER (WHERE status = 'in_progress')::int`,
      completedToday: sql<number>`count(*) FILTER (WHERE status = 'completed' AND scheduled_date = ${today})::int`,
    })
    .from(assignmentsTable);

  return {
    requested:      counts?.requested      ?? 0,
    plannable:      counts?.plannable      ?? 0,
    inProgress:     counts?.inProgress     ?? 0,
    completedToday: counts?.completedToday ?? 0,
  };
}

// ─── Dropdown helpers ─────────────────────────────────────────────────────────

export async function getCustomerOptions(): Promise<CustomerOption[]> {
  const rows = await db
    .select({ id: customersTable.id, name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.isActive, true))
    .orderBy(asc(customersTable.name));
  return rows;
}

export async function getObjectsByCustomer(customerId: string): Promise<ObjectOption[]> {
  if (!customerId) return [];
  const rows = await db
    .select({ id: objectsTable.id, name: objectsTable.name })
    .from(objectsTable)
    .where(
      and(
        eq(objectsTable.customerId, customerId),
        eq(objectsTable.isActive, true),
      ),
    )
    .orderBy(asc(objectsTable.name));
  return rows;
}

export async function getPersonnelOptions(scheduledDate?: string | null): Promise<PersonnelOption[]> {
  const rows = await db
    .select({
      id:        personnelTable.id,
      firstName: personnelTable.firstName,
      lastName:  personnelTable.lastName,
    })
    .from(personnelTable)
    .where(
      and(
        eq(personnelTable.isActive, true),
        eq(personnelTable.isAvailable, true),
      ),
    )
    .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName));

  if (!scheduledDate || rows.length === 0) return rows;

  const ids       = rows.map((r) => r.id);
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
  rows:       TimelinePersonnelRow[];
  unassigned: TimelineAssignment[];
}> {
  const canRead = await hasPermission("planning", "read");
  if (!canRead) return { rows: [], unassigned: [] };

  // All assignments on this day
  const asgnRows = await db
    .select({
      id:             assignmentsTable.id,
      title:          assignmentsTable.title,
      status:         assignmentsTable.status,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd:   assignmentsTable.scheduledEnd,
      customerName:   customersTable.name,
    })
    .from(assignmentsTable)
    .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .where(eq(assignmentsTable.scheduledDate, dateStr))
    .orderBy(asc(assignmentsTable.scheduledStart));

  if (asgnRows.length === 0) return { rows: [], unassigned: [] };

  const assignmentIds = asgnRows.map((a) => a.id);

  // Personnel assignments for these assignments — only confirmed (assigned) links
  const pRows = await db
    .select({
      assignmentId: assignmentPersonnelTable.assignmentId,
      personnelId:  assignmentPersonnelTable.personnelId,
      firstName:    personnelTable.firstName,
      lastName:     personnelTable.lastName,
    })
    .from(assignmentPersonnelTable)
    .leftJoin(personnelTable, eq(assignmentPersonnelTable.personnelId, personnelTable.id))
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
        if (!a.scheduledStart || !a.scheduledEnd || !b.scheduledStart || !b.scheduledEnd) {
          conflictAssignmentIds.add(a.id);
          conflictAssignmentIds.add(b.id);
        } else if (a.scheduledStart < b.scheduledEnd && a.scheduledEnd > b.scheduledStart) {
          conflictAssignmentIds.add(a.id);
          conflictAssignmentIds.add(b.id);
        }
      }
    }
  }

  // ── Build result maps ────────────────────────────────────────────────────

  const asgnMap = new Map(
    asgnRows.map((a) => [a.id, {
      id:             a.id,
      title:          a.title,
      status:         a.status as AssignmentStatus,
      scheduledStart: a.scheduledStart ?? null,
      scheduledEnd:   a.scheduledEnd   ?? null,
      customerName:   a.customerName   ?? "",
      hasConflict:    conflictAssignmentIds.has(a.id),
    } satisfies TimelineAssignment])
  );

  const rowMap = new Map<string, TimelinePersonnelRow>();
  const assignedIds = new Set<string>();

  for (const p of pRows) {
    const asgn = asgnMap.get(p.assignmentId);
    if (!asgn) continue;

    const row = rowMap.get(p.personnelId) ?? {
      personnelId: p.personnelId,
      firstName:   p.firstName ?? "",
      lastName:    p.lastName  ?? "",
      assignments: [],
    };
    row.assignments.push(asgn);
    rowMap.set(p.personnelId, row);
    assignedIds.add(asgn.id);
  }

  const rows = Array.from(rowMap.values()).sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "nl"),
  );

  const unassigned = asgnRows
    .filter((a) => !assignedIds.has(a.id))
    .map((a) => asgnMap.get(a.id)!);

  return { rows, unassigned };
}

// ─── Personnel Eligibility ────────────────────────────────────────────────────

export type PersonnelEligibilityResult = {
  id:                    string;
  firstName:             string;
  lastName:              string;
  availabilityStatus:    AvailabilityStatus;
  hasConflict:           boolean;
  meetsRole:             boolean;
  meetsCertificates:     boolean;
  meetsDiploma:          boolean;
  meetsKnowledge:        boolean;
  /**
   * true when personnel region matches assignment region.
   * Always true when no required_region is set on the assignment
   * (schema migration required for constraint).
   */
  meetsRegion:           boolean;
  /** true when availability window covers the assignment time slot (or assignment has no time set) */
  meetsAvailabilityWindow: boolean;
  eligible:              boolean;
  eligibilityReasons:    string[];
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

  // ── 1. Fetch assignment meta (date + times + required_region for eligibility) ──
  const [asgn] = await db
    .select({
      scheduledDate:  assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd:   assignmentsTable.scheduledEnd,
      requiredRegion: assignmentsTable.requiredRegion,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  const dateStr   = asgn?.scheduledDate  ?? null;
  const asgnStart = asgn?.scheduledStart ?? null; // "HH:MM" or null
  const asgnEnd   = asgn?.scheduledEnd   ?? null; // "HH:MM" or null
  const asgnHasTimes = Boolean(asgnStart && asgnEnd);
  // required_region for eligibility check (lowercased, trimmed; null = no restriction)
  const requiredRegion = asgn?.requiredRegion?.trim().toLowerCase() || null;

  // Day-of-week for availability window lookup (0=Sun … 6=Sat)
  const dayOfWeek = dateStr
    ? new Date(dateStr + "T00:00:00").getDay()
    : null;

  // ── 2. Fetch required task-code attributes ─────────────────────────────────
  let requiredCertificates: string[] = [];
  let requiredDiplomas:     string[] = [];
  let requiredKnowledge:    string[] = [];
  let requiredRoleIds:      string[] = [];

  const taskRows = await db
    .select({ taskCodeId: assignmentTasksTable.taskCodeId })
    .from(assignmentTasksTable)
    .where(eq(assignmentTasksTable.assignmentId, assignmentId));

  const taskCodeIds = taskRows.map((t) => t.taskCodeId).filter(Boolean) as string[];
  if (taskCodeIds.length > 0) {
    const tcRows = await db
      .select({
        requiredCertificates: taskCodesTable.requiredCertificates,
        requiredDiploma:      taskCodesTable.requiredDiploma,
        requiredKnowledge:    taskCodesTable.requiredKnowledge,
        requiredRoleId:       taskCodesTable.requiredRoleId,
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
    requiredDiplomas     = [...new Set(requiredDiplomas)];
    requiredKnowledge    = [...new Set(requiredKnowledge)];
    requiredRoleIds      = [...new Set(requiredRoleIds)];
  }

  // ── 3. Fetch all active personnel (with region) ────────────────────────────
  const personnelRows = await db
    .select({
      id:           personnelTable.id,
      firstName:    personnelTable.firstName,
      lastName:     personnelTable.lastName,
      roleId:       personnelTable.roleId,
      certificates: personnelTable.certificates,
      diplomas:     personnelTable.diplomas,
      knowledge:    personnelTable.knowledge,
      region:       personnelTable.region,
    })
    .from(personnelTable)
    .where(and(eq(personnelTable.isActive, true), eq(personnelTable.isAvailable, true)))
    .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName));

  if (personnelRows.length === 0) return [];

  const personnelIds = personnelRows.map((p) => p.id);

  // ── 4. Parallel: batch availability + conflicts + availability windows ─────
  const conflictWhereExtra = asgnHasTimes
    ? // Time-overlap: (other.start IS NULL OR other.end IS NULL OR other.start < asgnEnd AND other.end > asgnStart)
      or(
        isNull(assignmentsTable.scheduledStart),
        isNull(assignmentsTable.scheduledEnd),
        sql<boolean>`${assignmentsTable.scheduledStart} < ${asgnEnd} AND ${assignmentsTable.scheduledEnd} > ${asgnStart}`,
      )
    : undefined;

  const [statusMap, conflictRows, windowRows] = await Promise.all([
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
              inArray(assignmentPersonnelTable.personnelId, personnelIds),
              ne(assignmentPersonnelTable.assignmentId, assignmentId),
              // Only confirmed links count as conflicts — suggestions are not yet scheduled
              eq(assignmentPersonnelTable.status, "assigned"),
              conflictWhereExtra,
            ),
          )
      : Promise.resolve([] as Array<{ personnelId: string }>),

    // Fetch availability windows only when assignment has a time and a date
    (asgnHasTimes && dayOfWeek !== null)
      ? db
          .select({
            personnelId: availabilityWindowsTable.personnelId,
            startTime:   availabilityWindowsTable.startTime,
            endTime:     availabilityWindowsTable.endTime,
          })
          .from(availabilityWindowsTable)
          .where(
            and(
              inArray(availabilityWindowsTable.personnelId, personnelIds),
              eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
            ),
          )
      : Promise.resolve([] as Array<{ personnelId: string; startTime: string; endTime: string }>),
  ]);

  const conflictSet = new Set(conflictRows.map((r) => r.personnelId));

  // Build a map: personnelId → does any window cover the assignment time?
  // Key: if assignment has no times, everyone passes (meetsAvailabilityWindow = true).
  const windowCoverageMap = new Map<string, boolean>();
  if (asgnHasTimes && asgnStart && asgnEnd) {
    const asgnStartMin = timeToMin(asgnStart);
    const asgnEndMin   = timeToMin(asgnEnd);
    for (const w of windowRows) {
      if (!windowCoverageMap.get(w.personnelId)) {
        const wStart = timeToMin(w.startTime);
        const wEnd   = timeToMin(w.endTime);
        // Window must contain the full assignment time slot
        windowCoverageMap.set(w.personnelId, wStart <= asgnStartMin && wEnd >= asgnEndMin);
      }
    }
  }

  // ── 5. Compute eligibility per person ─────────────────────────────────────
  return personnelRows.map((p) => {
    const availStatus = (statusMap[p.id] ?? "niet_ingesteld") as AvailabilityStatus;
    const hasConflict = conflictSet.has(p.id);

    // Window coverage: only relevant when assignment has a time AND status is "beschikbaar"
    // (if status is "niet_ingesteld" we have no windows to check — pass through)
    const meetsAvailabilityWindow = (() => {
      if (!asgnHasTimes) return true;
      if (availStatus !== "beschikbaar") return true; // blocked for other reasons already
      // If a window was found, check coverage; if none found at all → not covered
      return windowCoverageMap.get(p.id) ?? false;
    })();

    const personCerts    = (p.certificates ?? []) as string[];
    const personDiplomas = (p.diplomas     ?? []) as string[];
    const personKnow     = (p.knowledge    ?? []) as string[];

    const meetsCertificates = requiredCertificates.every((c) => personCerts.includes(c));
    const meetsDiploma      = requiredDiplomas.every((d) => personDiplomas.includes(d));
    const meetsKnowledge    = requiredKnowledge.every((k) => personKnow.includes(k));
    const meetsRole         = requiredRoleIds.length === 0 ||
                              requiredRoleIds.every((r) => p.roleId === r);
    // Region: compare personnel.region against assignment.required_region (case-insensitive, trimmed).
    // Always passes when required_region is not set on the assignment, or when personnel has no region.
    const meetsRegion = !requiredRegion || !p.region
      ? true
      : p.region.trim().toLowerCase() === requiredRegion;

    const reasons: string[] = [];
    if (availStatus === "ziek")               reasons.push("Ziek gemeld");
    if (availStatus === "op_verlof")          reasons.push("Op verlof");
    if (availStatus === "niet_beschikbaar")   reasons.push("Niet beschikbaar op deze dag");
    if (!meetsAvailabilityWindow)             reasons.push("Beschikbaarheidsvenster dekt opdrachttijd niet");
    if (hasConflict)                          reasons.push("Al ingepland op dit tijdstip");
    if (!meetsRole)                           reasons.push("Benodigde rol ontbreekt");
    if (!meetsCertificates)                   reasons.push("Benodigde certificaten ontbreken");
    if (!meetsDiploma)                        reasons.push("Benodigd diploma ontbreekt");
    if (!meetsKnowledge)                      reasons.push("Benodigde kennis ontbreekt");
    if (!meetsRegion)                         reasons.push("Regio komt niet overeen");

    const eligible =
      (availStatus === "beschikbaar" || availStatus === "niet_ingesteld") &&
      meetsAvailabilityWindow &&
      !hasConflict &&
      meetsRole &&
      meetsCertificates &&
      meetsDiploma &&
      meetsKnowledge &&
      meetsRegion;

    return {
      id:                      p.id,
      firstName:               p.firstName,
      lastName:                p.lastName,
      availabilityStatus:      availStatus,
      hasConflict,
      meetsRole,
      meetsCertificates,
      meetsDiploma,
      meetsKnowledge,
      meetsRegion,
      meetsAvailabilityWindow,
      eligible,
      eligibilityReasons:      reasons,
    };
  });
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
  | { success: true;  warning?: string }
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
  id:      string,
  newDate: string,
): Promise<RescheduleResult> {
  await requirePermission("planning", "write");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { success: false, message: "Ongeldige datum." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  // ── 1. Fetch assignment ────────────────────────────────────────────────────
  const [existing] = await db
    .select({
      id:             assignmentsTable.id,
      status:         assignmentsTable.status,
      scheduledDate:  assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd:   assignmentsTable.scheduledEnd,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, id))
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
        .select({ id: personnelTable.id, firstName: personnelTable.firstName, lastName: personnelTable.lastName })
        .from(personnelTable)
        .where(inArray(personnelTable.id, unavailable));
      const nameList = nameRows.map((n) => `${n.firstName} ${n.lastName}`.trim()).join(", ");
      warningParts.push(
        `${nameList} ${unavailable.length === 1 ? "is" : "zijn"} niet beschikbaar op ${newDate}.`,
      );
    }

    // 3b. Time-slot checks (only when assignment has start + end times)
    if (existing.scheduledStart && existing.scheduledEnd) {
      const asgnStartMin = timeToMin(existing.scheduledStart);
      const asgnEndMin   = timeToMin(existing.scheduledEnd);
      const dayOfWeek    = new Date(newDate + "T00:00:00").getDay();

      // 3b-i. Double-booking conflict
      const conflictRows = await db
        .select({ personnelId: assignmentPersonnelTable.personnelId })
        .from(assignmentPersonnelTable)
        .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
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
        const conflictIds = [...new Set(conflictRows.map((r) => r.personnelId))];
        const nameRows = await db
          .select({ id: personnelTable.id, firstName: personnelTable.firstName, lastName: personnelTable.lastName })
          .from(personnelTable)
          .where(inArray(personnelTable.id, conflictIds));
        const nameList = nameRows.map((n) => `${n.firstName} ${n.lastName}`.trim()).join(", ");
        warningParts.push(
          `${nameList} ${conflictIds.length === 1 ? "heeft" : "hebben"} een conflicterende inplanning op ${newDate}.`,
        );
      }

      // 3b-ii. Availability window does not cover the full time slot
      const windowRows = await db
        .select({
          personnelId: availabilityWindowsTable.personnelId,
          startTime:   availabilityWindowsTable.startTime,
          endTime:     availabilityWindowsTable.endTime,
        })
        .from(availabilityWindowsTable)
        .where(
          and(
            inArray(availabilityWindowsTable.personnelId, personnelIds),
            eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
          ),
        );

      const coverageMap = new Map<string, boolean>();
      for (const w of windowRows) {
        if (!coverageMap.has(w.personnelId)) {
          const wStart = timeToMin(w.startTime);
          const wEnd   = timeToMin(w.endTime);
          coverageMap.set(w.personnelId, wStart <= asgnStartMin && wEnd >= asgnEndMin);
        }
      }

      const outsideWindow = personnelIds.filter((pid) => {
        const s = statusMap[pid] as AvailabilityStatus | undefined;
        if (s !== "beschikbaar") return false;
        return !(coverageMap.get(pid) ?? false);
      });

      if (outsideWindow.length > 0) {
        const nameRows = await db
          .select({ id: personnelTable.id, firstName: personnelTable.firstName, lastName: personnelTable.lastName })
          .from(personnelTable)
          .where(inArray(personnelTable.id, outsideWindow));
        const nameList = nameRows.map((n) => `${n.firstName} ${n.lastName}`.trim()).join(", ");
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
    userId:     user.id,
    action:     "update",
    resource:   "assignments",
    resourceId: id,
    metadata:   {
      action:   "reschedule",
      from:     existing.scheduledDate,
      to:       newDate,
      warnings: warningParts.length > 0 ? warningParts : undefined,
    },
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
  id:       string,
  newStart: string,
  newEnd:   string | null,
): Promise<RescheduleResult> {
  await requirePermission("planning", "write");

  const TIME_RE = /^\d{2}:\d{2}$/;
  if (!TIME_RE.test(newStart)) {
    return { success: false, message: "Ongeldig tijdstip." };
  }
  if (newEnd !== null && !TIME_RE.test(newEnd)) {
    return { success: false, message: "Ongeldig eindtijdstip." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [existing] = await db
    .select({
      id:             assignmentsTable.id,
      status:         assignmentsTable.status,
      scheduledDate:  assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd:   assignmentsTable.scheduledEnd,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, id))
    .limit(1);

  if (!existing) return { success: false, message: "Opdracht niet gevonden." };
  if (!existing.scheduledDate) {
    return { success: false, message: "Opdracht heeft geen ingeplande datum." };
  }

  if (existing.scheduledStart === newStart && existing.scheduledEnd === newEnd) {
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
    const dayOfWeek   = new Date(scheduledDate + "T00:00:00").getDay();
    const newStartMin = timeToMin(newStart);
    const newEndMin   = newEnd ? timeToMin(newEnd) : newStartMin + 60;

    // 1. Availability status
    const statusMap = await getBatchAvailabilityStatus(personnelIds, scheduledDate);
    const unavailable = personnelIds.filter((pid) => {
      const s = statusMap[pid] as AvailabilityStatus | undefined;
      return s === "ziek" || s === "op_verlof" || s === "niet_beschikbaar";
    });
    if (unavailable.length > 0) {
      const nameRows = await db
        .select({ id: personnelTable.id, firstName: personnelTable.firstName, lastName: personnelTable.lastName })
        .from(personnelTable)
        .where(inArray(personnelTable.id, unavailable));
      const nameList = nameRows.map((n) => `${n.firstName} ${n.lastName}`.trim()).join(", ");
      warningParts.push(
        `${nameList} ${unavailable.length === 1 ? "is" : "zijn"} niet beschikbaar op ${scheduledDate}.`,
      );
    }

    // 2. Double-booking conflict (exclude this assignment)
    const conflictRows = await db
      .select({ personnelId: assignmentPersonnelTable.personnelId })
      .from(assignmentPersonnelTable)
      .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
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
        .select({ id: personnelTable.id, firstName: personnelTable.firstName, lastName: personnelTable.lastName })
        .from(personnelTable)
        .where(inArray(personnelTable.id, conflictIds));
      const nameList = nameRows.map((n) => `${n.firstName} ${n.lastName}`.trim()).join(", ");
      warningParts.push(
        `${nameList} ${conflictIds.length === 1 ? "heeft" : "hebben"} een conflicterende inplanning op ${scheduledDate}.`,
      );
    }

    // 3. Availability window coverage
    const windowRows = await db
      .select({
        personnelId: availabilityWindowsTable.personnelId,
        startTime:   availabilityWindowsTable.startTime,
        endTime:     availabilityWindowsTable.endTime,
      })
      .from(availabilityWindowsTable)
      .where(
        and(
          inArray(availabilityWindowsTable.personnelId, personnelIds),
          eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
        ),
      );

    const coverageMap = new Map<string, boolean>();
    for (const w of windowRows) {
      if (!coverageMap.has(w.personnelId)) {
        const wStart = timeToMin(w.startTime);
        const wEnd   = timeToMin(w.endTime);
        coverageMap.set(w.personnelId, wStart <= newStartMin && wEnd >= newEndMin);
      }
    }

    const outsideWindow = personnelIds.filter((pid) => {
      const s = statusMap[pid] as AvailabilityStatus | undefined;
      if (s !== "beschikbaar") return false;
      return !(coverageMap.get(pid) ?? false);
    });

    if (outsideWindow.length > 0) {
      const nameRows = await db
        .select({ id: personnelTable.id, firstName: personnelTable.firstName, lastName: personnelTable.lastName })
        .from(personnelTable)
        .where(inArray(personnelTable.id, outsideWindow));
      const nameList = nameRows.map((n) => `${n.firstName} ${n.lastName}`.trim()).join(", ");
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
    userId:     user.id,
    action:     "update",
    resource:   "assignments",
    resourceId: id,
    metadata:   {
      action:   "reshift",
      from:     { start: existing.scheduledStart, end: existing.scheduledEnd },
      to:       { start: newStart, end: newEnd },
      warnings: warningParts.length > 0 ? warningParts : undefined,
    },
  });

  revalidatePath("/planning");

  return warningParts.length > 0
    ? { success: true, warning: `Let op: ${warningParts.join(" ")}` }
    : { success: true };
}

export async function getTaskCodeOptions(): Promise<TaskCodeOption[]> {
  const rows = await db
    .select({
      id:   taskCodesTable.id,
      code: taskCodesTable.code,
      name: taskCodesTable.name,
    })
    .from(taskCodesTable)
    .where(eq(taskCodesTable.isActive, true))
    .orderBy(asc(taskCodesTable.code));
  return rows;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createAssignment(
  data: AssignmentFormInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    title:          data.title.trim(),
    description:    data.description?.trim()    || null,
    customerId:     data.customerId,
    objectId:       data.objectId               || null,
    status:         data.status,
    priority:       data.priority,
    scheduledDate:  data.scheduledDate          || null,
    scheduledStart: data.scheduledStart         || null,
    scheduledEnd:   data.scheduledEnd           || null,
    notes:          data.notes?.trim()          || null,
    requiredRegion: data.requiredRegion?.trim() || null,
    createdBy:      user.id,
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
      .values(parsed.data)
      .returning({ id: assignmentsTable.id });

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "create",
      resource:   "assignments",
      resourceId: created!.id,
      metadata:   { title: payload.title, status: payload.status },
    });

    revalidatePath("/assignments");
    return { success: true, data: { id: created!.id } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "Er bestaat al een opdracht met deze gegevens." };
    }
    return { success: false, message: "Opdracht aanmaken mislukt." };
  }
}

export async function updateAssignment(
  id: string,
  data: AssignmentFormInput,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const payload = {
    title:          data.title.trim(),
    description:    data.description?.trim()    || null,
    customerId:     data.customerId,
    objectId:       data.objectId               || null,
    status:         data.status,
    priority:       data.priority,
    scheduledDate:  data.scheduledDate          || null,
    scheduledStart: data.scheduledStart         || null,
    scheduledEnd:   data.scheduledEnd           || null,
    notes:          data.notes?.trim()          || null,
    requiredRegion: data.requiredRegion?.trim() || null,
  };

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
    await db
      .update(assignmentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(assignmentsTable.id, id));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "update",
      resource:   "assignments",
      resourceId: id,
      metadata:   { title: payload.title },
    });

    revalidatePath("/assignments");
    revalidatePath(`/assignments/${id}`);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "Er bestaat al een opdracht met deze gegevens." };
    }
    return { success: false, message: "Opdracht bijwerken mislukt." };
  }
}

export async function setAssignmentStatus(
  id: string,
  newStatus: AssignmentStatus,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  // Fetch current status to validate transition
  const [current] = await db
    .select({ status: assignmentsTable.status, title: assignmentsTable.title })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, id))
    .limit(1);

  if (!current) return { success: false, message: "Opdracht niet gevonden." };

  const allowed = ASSIGNMENT_STATUS_TRANSITIONS[current.status as AssignmentStatus];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      message: `Statuswijziging van "${current.status}" naar "${newStatus}" is niet toegestaan.`,
    };
  }

  await db
    .update(assignmentsTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(assignmentsTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "status_change",
    resource:   "assignments",
    resourceId: id,
    metadata:   { from: current.status, to: newStatus, title: current.title },
  });

  revalidatePath("/assignments");
  revalidatePath(`/assignments/${id}`);
  return { success: true };
}

export async function assignPersonnel(
  assignmentId: string,
  personnelId: string,
): Promise<ActionResult & { warning?: string }> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  // Fetch the scheduled date to evaluate availability
  const [assignment] = await db
    .select({ scheduledDate: assignmentsTable.scheduledDate })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  try {
    await db.insert(assignmentPersonnelTable).values({
      assignmentId,
      personnelId,
      assignedBy: user.id,
    });

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "assign_personnel",
      resource:   "assignments",
      resourceId: assignmentId,
      metadata:   { personnelId },
    });

    revalidatePath(`/assignments/${assignmentId}`);

    // ── Availability warning (non-blocking) ───────────────────────────────
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
                eq(availabilityWindowsTable.dayOfWeek,   dayOfWeek),
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
          warning = "Let op: medewerker is normaal gesproken niet beschikbaar op deze dag.";
        }
      }
    }

    return { success: true, warning };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, message: "Deze medewerker is al gekoppeld aan deze opdracht." };
    }
    return { success: false, message: "Medewerker koppelen mislukt." };
  }
}

export async function removePersonnel(
  assignmentId: string,
  linkId: string,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .delete(assignmentPersonnelTable)
    .where(
      and(
        eq(assignmentPersonnelTable.id, linkId),
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
      ),
    );

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "remove_personnel",
    resource:   "assignments",
    resourceId: assignmentId,
    metadata:   { linkId },
  });

  revalidatePath(`/assignments/${assignmentId}`);
  return { success: true };
}

export async function addAssignmentTask(
  assignmentId: string,
  taskCodeId: string,
  notes?: string,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(sort_order), -1)::int` })
    .from(assignmentTasksTable)
    .where(eq(assignmentTasksTable.assignmentId, assignmentId));

  const [created] = await db
    .insert(assignmentTasksTable)
    .values({
      assignmentId,
      taskCodeId: taskCodeId || null,
      notes:      notes ?? null,
      sortOrder:  (maxOrder ?? -1) + 1,
    })
    .returning({ id: assignmentTasksTable.id });

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "add_task",
    resource:   "assignments",
    resourceId: assignmentId,
    metadata:   { taskCodeId, taskId: created!.id },
  });

  revalidatePath(`/assignments/${assignmentId}`);
  return { success: true };
}

export async function removeAssignmentTask(
  assignmentId: string,
  taskId: string,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .delete(assignmentTasksTable)
    .where(
      and(
        eq(assignmentTasksTable.id, taskId),
        eq(assignmentTasksTable.assignmentId, assignmentId),
      ),
    );

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "remove_task",
    resource:   "assignments",
    resourceId: assignmentId,
    metadata:   { taskId },
  });

  revalidatePath(`/assignments/${assignmentId}`);
  return { success: true };
}

export async function approveDirectly(id: string): Promise<ActionResult> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [current] = await db
    .select({ status: assignmentsTable.status, title: assignmentsTable.title })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, id))
    .limit(1);

  if (!current) return { success: false, message: "Opdracht niet gevonden." };
  if (current.status !== "review") {
    return { success: false, message: "Directe goedkeuring is alleen mogelijk voor opdrachten met status 'review'." };
  }

  // review → approved → plannable (skip quote)
  await db
    .update(assignmentsTable)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(assignmentsTable.id, id));

  await db
    .update(assignmentsTable)
    .set({ status: "plannable", updatedAt: new Date() })
    .where(eq(assignmentsTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "direct_approve",
    resource:   "assignments",
    resourceId: id,
    metadata:   { title: current.title, from: "review", to: "plannable" },
  });

  revalidatePath("/assignments");
  revalidatePath(`/assignments/${id}`);
  return { success: true };
}

export async function deleteAssignment(id: string): Promise<ActionResult> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [assignment] = await db
    .select({ title: assignmentsTable.title })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, id))
    .limit(1);

  if (!assignment) return { success: false, message: "Opdracht niet gevonden." };

  // Cascade deletes assignment_personnel and assignment_tasks via FK
  await db.delete(assignmentsTable).where(eq(assignmentsTable.id, id));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "delete",
    resource:   "assignments",
    resourceId: id,
    metadata:   { title: assignment.title },
  });

  revalidatePath("/assignments");
  return { success: true };
}

// ─── Assignment History ────────────────────────────────────────────────────────

export type AssignmentHistoryRow = {
  id:            string;
  code:          string;
  title:         string;
  status:        AssignmentStatus;
  scheduledDate: string | null;
  objectName:    string | null;
};

export async function listAssignmentsForCustomer(
  customerId: string,
  limit = 10,
): Promise<AssignmentHistoryRow[]> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return [];

  const rows = await db
    .select({
      id:            assignmentsTable.id,
      code:          assignmentsTable.code,
      title:         assignmentsTable.title,
      status:        assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      objectName:    objectsTable.name,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(eq(assignmentsTable.customerId, customerId))
    .orderBy(desc(assignmentsTable.scheduledDate))
    .limit(limit);

  return rows.map((r) => ({
    id:            r.id,
    code:          r.code,
    title:         r.title,
    status:        r.status        as AssignmentStatus,
    scheduledDate: r.scheduledDate ?? null,
    objectName:    r.objectName    ?? null,
  }));
}

export async function listAssignmentsForPersonnel(
  personnelId: string,
  limit = 10,
): Promise<AssignmentHistoryRow[]> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return [];

  const rows = await db
    .select({
      id:            assignmentsTable.id,
      code:          assignmentsTable.code,
      title:         assignmentsTable.title,
      status:        assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      objectName:    objectsTable.name,
    })
    .from(assignmentsTable)
    .innerJoin(assignmentPersonnelTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(eq(assignmentPersonnelTable.personnelId, personnelId))
    .orderBy(desc(assignmentsTable.scheduledDate))
    .limit(limit);

  return rows.map((r) => ({
    id:            r.id,
    code:          r.code,
    title:         r.title,
    status:        r.status        as AssignmentStatus,
    scheduledDate: r.scheduledDate ?? null,
    objectName:    r.objectName    ?? null,
  }));
}
