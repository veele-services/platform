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
import { eq, ilike, or, and, asc, desc, inArray, sql, gte, lte, isNull } from "drizzle-orm";
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
  title:          string;
  description?:   string;
  customerId:     string;
  objectId?:      string;
  status:         AssignmentStatus;
  priority:       AssignmentPriority;
  scheduledDate?: string;
  scheduledStart?: string;
  scheduledEnd?:  string;
  notes?:         string;
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
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listAssignments(params: {
  page?:     number;
  search?:   string;
  status?:   string;
  priority?: string;
  sort?:     string;
  dir?:      string;
}): Promise<{ rows: AssignmentRow[]; total: number }> {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return { rows: [], total: 0 };

  const {
    page     = 1,
    search   = "",
    status   = "",
    priority = "",
    sort     = "createdAt",
    dir      = "desc",
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
        firstName:   personnelTable.firstName,
        lastName:    personnelTable.lastName,
      })
      .from(assignmentPersonnelTable)
      .leftJoin(personnelTable, eq(assignmentPersonnelTable.personnelId, personnelTable.id))
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
    createdAt:    row.createdAt.toISOString(),
    updatedAt:    row.updatedAt.toISOString(),
    personnel: personnel.map((p) => ({
      id:          p.id,
      personnelId: p.personnelId,
      firstName:   p.firstName ?? "",
      lastName:    p.lastName  ?? "",
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
      firstName:    personnelTable.firstName,
      lastName:     personnelTable.lastName,
    })
    .from(assignmentPersonnelTable)
    .leftJoin(personnelTable, eq(assignmentPersonnelTable.personnelId, personnelTable.id))
    .where(inArray(assignmentPersonnelTable.assignmentId, assignmentIds));

  const personnelByAssignment = new Map<string, string[]>();
  for (const p of personnelRows) {
    const names = personnelByAssignment.get(p.assignmentId) ?? [];
    names.push(`${p.firstName ?? ""} ${p.lastName ?? ""}`.trim());
    personnelByAssignment.set(p.assignmentId, names);
  }

  return rows
    .filter((r) => r.scheduledDate !== null)
    .map((r) => ({
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
    }));
}

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
