"use server";

import { db } from "@workspace/db";
import {
  availabilityDayEntriesTable,
  availabilityWindowsTable,
  leavePeriodsTable,
  personnelTable,
  auditLogTable,
  LEAVE_TYPES,
  type LeaveType,
  type AvailabilityStatus,
} from "@workspace/db";
import { eq, and, lte, gte, inArray, isNull, or, asc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import { sendEmail, buildLeaveDecisionEmail } from "@/lib/email";
import type { ActionResult } from "./customers";

export type { ActionResult, LeaveType, AvailabilityStatus };

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvailabilityWindow = {
  id: string;
  personnelId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type LeaveStatus = "pending" | "approved" | "rejected";

export type LeavePeriod = {
  id: string;
  personnelId: string;
  startDate: string;
  endDate: string | null;
  leaveType: LeaveType;
  reason: string | null;
  status: LeaveStatus;
  createdAt: string;
};

// ─── Availability Windows ─────────────────────────────────────────────────────

export async function getAvailabilityWindows(
  personnelId: string,
): Promise<AvailabilityWindow[]> {
  await requirePermission("personnel", "read");

  const rows = await db
    .select()
    .from(availabilityWindowsTable)
    .where(eq(availabilityWindowsTable.personnelId, personnelId))
    .orderBy(availabilityWindowsTable.dayOfWeek);

  return rows.map((r) => ({
    id: r.id,
    personnelId: r.personnelId,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
  }));
}

/**
 * Bulk-replace all availability windows for a personnel member.
 * Deletes all existing and re-inserts the provided list.
 */
export async function setAvailabilityWindows(
  personnelId: string,
  windows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  for (const w of windows) {
    if (w.dayOfWeek < 0 || w.dayOfWeek > 6) {
      return { success: false, message: "Ongeldige dag van de week." };
    }
    if (
      !/^\d{2}:\d{2}$/.test(w.startTime) ||
      !/^\d{2}:\d{2}$/.test(w.endTime)
    ) {
      return {
        success: false,
        message: "Tijden moeten in HH:MM-formaat zijn.",
      };
    }
    if (w.startTime >= w.endTime) {
      return {
        success: false,
        message: "Begintijd moet vóór eindtijd liggen.",
      };
    }
  }

  await db
    .delete(availabilityWindowsTable)
    .where(eq(availabilityWindowsTable.personnelId, personnelId));

  if (windows.length > 0) {
    await db.insert(availabilityWindowsTable).values(
      windows.map((w) => ({
        personnelId,
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
      })),
    );
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "personnel",
    resourceId: personnelId,
    metadata: {
      action: "set_availability_windows",
      windowCount: windows.length,
    },
  });

  revalidatePath(`/personnel/${personnelId}`);
  return { success: true };
}

// ─── Leave Periods ────────────────────────────────────────────────────────────

export async function listLeavePeriods(
  personnelId: string,
): Promise<LeavePeriod[]> {
  await requirePermission("personnel", "read");

  const rows = await db
    .select()
    .from(leavePeriodsTable)
    .where(eq(leavePeriodsTable.personnelId, personnelId))
    .orderBy(leavePeriodsTable.startDate);

  return rows.map((r) => ({
    id: r.id,
    personnelId: r.personnelId,
    startDate: r.startDate,
    endDate: r.endDate,
    leaveType: r.leaveType as LeaveType,
    reason: r.reason,
    status: (r.status ?? "approved") as LeaveStatus,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addLeavePeriod(data: {
  personnelId: string;
  startDate: string;
  endDate?: string;
  leaveType: LeaveType;
  reason?: string;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (!data.startDate) {
    return { success: false, message: "Begindatum is verplicht." };
  }
  if (!data.leaveType || !LEAVE_TYPES.includes(data.leaveType)) {
    return { success: false, message: "Ongeldig verloftype." };
  }
  // endDate required for vakantie and overig; optional for ziekte
  if (data.leaveType !== "ziekte" && !data.endDate) {
    return {
      success: false,
      message: "Einddatum is verplicht voor dit verloftype.",
    };
  }
  if (data.endDate && data.startDate > data.endDate) {
    return {
      success: false,
      message: "Begindatum moet vóór einddatum liggen.",
    };
  }

  const [inserted] = await db
    .insert(leavePeriodsTable)
    .values({
      personnelId: data.personnelId,
      startDate: data.startDate,
      endDate: data.endDate || null,
      leaveType: data.leaveType,
      reason: data.reason?.trim() || null,
      createdBy: user.id,
    })
    .returning({ id: leavePeriodsTable.id });

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "create",
    resource: "personnel",
    resourceId: data.personnelId,
    metadata: {
      action: "add_leave_period",
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
    },
  });

  revalidatePath(`/personnel/${data.personnelId}`);
  return { success: true, data: { id: inserted!.id } };
}

export async function updateLeavePeriod(
  id: string,
  personnelId: string,
  data: {
    startDate: string;
    endDate?: string;
    leaveType: LeaveType;
    reason?: string;
  },
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (!data.startDate) {
    return { success: false, message: "Begindatum is verplicht." };
  }
  if (!data.leaveType || !LEAVE_TYPES.includes(data.leaveType)) {
    return { success: false, message: "Ongeldig verloftype." };
  }
  if (data.leaveType !== "ziekte" && !data.endDate) {
    return {
      success: false,
      message: "Einddatum is verplicht voor dit verloftype.",
    };
  }
  if (data.endDate && data.startDate > data.endDate) {
    return {
      success: false,
      message: "Begindatum moet vóór einddatum liggen.",
    };
  }

  await db
    .update(leavePeriodsTable)
    .set({
      startDate: data.startDate,
      endDate: data.endDate || null,
      leaveType: data.leaveType,
      reason: data.reason?.trim() || null,
    })
    .where(
      and(
        eq(leavePeriodsTable.id, id),
        eq(leavePeriodsTable.personnelId, personnelId),
      ),
    );

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "personnel",
    resourceId: personnelId,
    metadata: {
      action: "update_leave_period",
      leavePeriodId: id,
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
    },
  });

  revalidatePath(`/personnel/${personnelId}`);
  return { success: true };
}

export async function deleteLeavePeriod(
  id: string,
  personnelId: string,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  await db
    .delete(leavePeriodsTable)
    .where(
      and(
        eq(leavePeriodsTable.id, id),
        eq(leavePeriodsTable.personnelId, personnelId),
      ),
    );

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "delete",
    resource: "personnel",
    resourceId: personnelId,
    metadata: { action: "delete_leave_period", leavePeriodId: id },
  });

  revalidatePath(`/personnel/${personnelId}`);
  return { success: true };
}

// ─── Leave Approval Workflow ──────────────────────────────────────────────────

/**
 * Management-only: approve a pending leave request from personnel.
 */
export async function approveLeavePeriod(
  id: string,
  personnelId: string,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [period] = await db
    .select({ id: leavePeriodsTable.id, status: leavePeriodsTable.status })
    .from(leavePeriodsTable)
    .where(
      and(
        eq(leavePeriodsTable.id, id),
        eq(leavePeriodsTable.personnelId, personnelId),
      ),
    )
    .limit(1);

  if (!period)
    return { success: false, message: "Verlofperiode niet gevonden." };
  if (period.status !== "pending")
    return {
      success: false,
      message: "Alleen aanvragen in afwachting kunnen worden goedgekeurd.",
    };

  await db
    .update(leavePeriodsTable)
    .set({ status: "approved" })
    .where(eq(leavePeriodsTable.id, id));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "personnel",
    resourceId: personnelId,
    metadata: { action: "approve_leave_period", leavePeriodId: id },
  });

  // Notify personnel member — fire-and-forget
  void (async () => {
    const [person] = await db
      .select({
        firstName: personnelTable.firstName,
        email: personnelTable.email,
      })
      .from(personnelTable)
      .where(eq(personnelTable.id, personnelId))
      .limit(1);
    const [leavePeriod] = await db
      .select({
        startDate: leavePeriodsTable.startDate,
        endDate: leavePeriodsTable.endDate,
        leaveType: leavePeriodsTable.leaveType,
      })
      .from(leavePeriodsTable)
      .where(eq(leavePeriodsTable.id, id))
      .limit(1);
    if (person?.email && leavePeriod) {
      const { subject, html } = buildLeaveDecisionEmail({
        firstName: person.firstName,
        decision: "goedgekeurd",
        startDate: leavePeriod.startDate,
        endDate: leavePeriod.endDate ?? null,
        leaveType: leavePeriod.leaveType,
      });
      await sendEmail({ to: person.email, subject, html });
    }
  })();

  revalidatePath(`/personnel/${personnelId}`);
  revalidatePath("/personnel");
  revalidatePath("/personnel/verlof");
  return { success: true };
}

/**
 * Management-only: reject a pending leave request from personnel.
 */
export async function rejectLeavePeriod(
  id: string,
  personnelId: string,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [period] = await db
    .select({ id: leavePeriodsTable.id, status: leavePeriodsTable.status })
    .from(leavePeriodsTable)
    .where(
      and(
        eq(leavePeriodsTable.id, id),
        eq(leavePeriodsTable.personnelId, personnelId),
      ),
    )
    .limit(1);

  if (!period)
    return { success: false, message: "Verlofperiode niet gevonden." };
  if (period.status !== "pending")
    return {
      success: false,
      message: "Alleen aanvragen in afwachting kunnen worden afgewezen.",
    };

  await db
    .update(leavePeriodsTable)
    .set({ status: "rejected" })
    .where(eq(leavePeriodsTable.id, id));

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "update",
    resource: "personnel",
    resourceId: personnelId,
    metadata: { action: "reject_leave_period", leavePeriodId: id },
  });

  // Notify personnel member — fire-and-forget
  void (async () => {
    const [person] = await db
      .select({
        firstName: personnelTable.firstName,
        email: personnelTable.email,
      })
      .from(personnelTable)
      .where(eq(personnelTable.id, personnelId))
      .limit(1);
    const [leavePeriod] = await db
      .select({
        startDate: leavePeriodsTable.startDate,
        endDate: leavePeriodsTable.endDate,
        leaveType: leavePeriodsTable.leaveType,
      })
      .from(leavePeriodsTable)
      .where(eq(leavePeriodsTable.id, id))
      .limit(1);
    if (person?.email && leavePeriod) {
      const { subject, html } = buildLeaveDecisionEmail({
        firstName: person.firstName,
        decision: "afgewezen",
        startDate: leavePeriod.startDate,
        endDate: leavePeriod.endDate ?? null,
        leaveType: leavePeriod.leaveType,
      });
      await sendEmail({ to: person.email, subject, html });
    }
  })();

  revalidatePath(`/personnel/${personnelId}`);
  revalidatePath("/personnel");
  revalidatePath("/personnel/verlof");
  return { success: true };
}

// ─── Global pending leave requests ───────────────────────────────────────────

export type PendingLeaveRequest = {
  id: string;
  personnelId: string;
  firstName: string;
  lastName: string;
  startDate: string;
  endDate: string | null;
  leaveType: LeaveType;
  reason: string | null;
  createdAt: string;
};

/**
 * Count pending leave requests — for sidebar badge.
 */
export async function getPendingLeaveCount(): Promise<number> {
  try {
    await requirePermission("personnel", "read");
  } catch {
    return 0;
  }
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leavePeriodsTable)
    .where(eq(leavePeriodsTable.status, "pending"));
  return row?.count ?? 0;
}

/**
 * List all pending leave requests across all personnel — for management inbox.
 */
export async function listAllPendingLeaveRequests(): Promise<
  PendingLeaveRequest[]
> {
  await requirePermission("personnel", "read");

  const rows = await db
    .select({
      id: leavePeriodsTable.id,
      personnelId: leavePeriodsTable.personnelId,
      firstName: personnelTable.firstName,
      lastName: personnelTable.lastName,
      startDate: leavePeriodsTable.startDate,
      endDate: leavePeriodsTable.endDate,
      leaveType: leavePeriodsTable.leaveType,
      reason: leavePeriodsTable.reason,
      createdAt: leavePeriodsTable.createdAt,
    })
    .from(leavePeriodsTable)
    .innerJoin(
      personnelTable,
      eq(leavePeriodsTable.personnelId, personnelTable.id),
    )
    .where(eq(leavePeriodsTable.status, "pending"))
    .orderBy(asc(leavePeriodsTable.startDate));

  return rows.map((r) => ({
    id: r.id,
    personnelId: r.personnelId,
    firstName: r.firstName,
    lastName: r.lastName,
    startDate: r.startDate,
    endDate: r.endDate,
    leaveType: r.leaveType as LeaveType,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ─── Availability Status ──────────────────────────────────────────────────────

/**
 * Compute availability status for a personnel member on a specific date.
 * Internal helper — no permission check, for server-side use only.
 * Handles open-ended sick leave (endDate IS NULL).
 * Only counts APPROVED leave periods — pending/rejected are ignored.
 */
export async function computeAvailabilityStatus(
  personnelId: string,
  dateStr: string, // YYYY-MM-DD
): Promise<AvailabilityStatus> {
  // 1. Active APPROVED leave period covering this date
  const [leave] = await db
    .select({ leaveType: leavePeriodsTable.leaveType })
    .from(leavePeriodsTable)
    .where(
      and(
        eq(leavePeriodsTable.personnelId, personnelId),
        eq(leavePeriodsTable.status, "approved"),
        lte(leavePeriodsTable.startDate, dateStr),
        or(
          isNull(leavePeriodsTable.endDate),
          gte(leavePeriodsTable.endDate, dateStr),
        ),
      ),
    )
    .limit(1);

  if (leave) {
    return leave.leaveType === "ziekte" ? "ziek" : "op_verlof";
  }

  // 2. Date-specific availability from the personnel PWA takes precedence.
  const [todayEntry] = await db
    .select({ id: availabilityDayEntriesTable.id })
    .from(availabilityDayEntriesTable)
    .where(
      and(
        eq(availabilityDayEntriesTable.personnelId, personnelId),
        eq(availabilityDayEntriesTable.date, dateStr),
      ),
    )
    .limit(1);

  if (todayEntry) return "beschikbaar";

  // 3. Fallback: legacy weekly window for today's day-of-week.
  const dayOfWeek = new Date(dateStr + "T00:00:00").getDay();

  const [todayWindow] = await db
    .select({ id: availabilityWindowsTable.id })
    .from(availabilityWindowsTable)
    .where(
      and(
        eq(availabilityWindowsTable.personnelId, personnelId),
        eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
      ),
    )
    .limit(1);

  if (todayWindow) return "beschikbaar";

  // 4. Does this personnel have any availability configured at all?
  const [anyEntry, anyWindow] = await Promise.all([
    db
      .select({ id: availabilityDayEntriesTable.id })
      .from(availabilityDayEntriesTable)
      .where(eq(availabilityDayEntriesTable.personnelId, personnelId))
      .limit(1),
    db
      .select({ id: availabilityWindowsTable.id })
      .from(availabilityWindowsTable)
      .where(eq(availabilityWindowsTable.personnelId, personnelId))
      .limit(1),
  ]);

  return anyEntry || anyWindow ? "niet_beschikbaar" : "niet_ingesteld";
}

/**
 * Public action — compute availability status for a single personnel.
 */
export async function getAvailabilityStatus(
  personnelId: string,
  dateStr: string,
): Promise<AvailabilityStatus> {
  await requirePermission("personnel", "read");
  return computeAvailabilityStatus(personnelId, dateStr);
}

/**
 * Batch-compute availability status for multiple personnel on the same date.
 * Returns a map of personnelId → AvailabilityStatus.
 * 3 queries regardless of personnel count — suitable for list views.
 * Handles open-ended sick leave (endDate IS NULL).
 * Only counts APPROVED leave periods.
 */
export async function getBatchAvailabilityStatus(
  personnelIds: string[],
  dateStr: string,
): Promise<Record<string, AvailabilityStatus>> {
  if (personnelIds.length === 0) return {};

  const dayOfWeek = new Date(dateStr + "T00:00:00").getDay();

  const [
    leaveRows,
    todayEntryRows,
    todayWindowRows,
    anyEntryRows,
    anyWindowRows,
  ] = await Promise.all([
    db
      .select({
        personnelId: leavePeriodsTable.personnelId,
        leaveType: leavePeriodsTable.leaveType,
      })
      .from(leavePeriodsTable)
      .where(
        and(
          inArray(leavePeriodsTable.personnelId, personnelIds),
          eq(leavePeriodsTable.status, "approved"),
          lte(leavePeriodsTable.startDate, dateStr),
          or(
            isNull(leavePeriodsTable.endDate),
            gte(leavePeriodsTable.endDate, dateStr),
          ),
        ),
      ),

    db
      .select({ personnelId: availabilityDayEntriesTable.personnelId })
      .from(availabilityDayEntriesTable)
      .where(
        and(
          inArray(availabilityDayEntriesTable.personnelId, personnelIds),
          eq(availabilityDayEntriesTable.date, dateStr),
        ),
      ),

    db
      .select({ personnelId: availabilityWindowsTable.personnelId })
      .from(availabilityWindowsTable)
      .where(
        and(
          inArray(availabilityWindowsTable.personnelId, personnelIds),
          eq(availabilityWindowsTable.dayOfWeek, dayOfWeek),
        ),
      ),

    db
      .select({ personnelId: availabilityDayEntriesTable.personnelId })
      .from(availabilityDayEntriesTable)
      .where(inArray(availabilityDayEntriesTable.personnelId, personnelIds)),

    db
      .select({ personnelId: availabilityWindowsTable.personnelId })
      .from(availabilityWindowsTable)
      .where(inArray(availabilityWindowsTable.personnelId, personnelIds)),
  ]);

  const leaveByPerson = new Map<string, LeaveType>();
  for (const r of leaveRows) {
    if (!leaveByPerson.has(r.personnelId)) {
      leaveByPerson.set(r.personnelId, r.leaveType as LeaveType);
    }
  }
  const hasEntryToday = new Set(todayEntryRows.map((r) => r.personnelId));
  const hasWindowToday = new Set(todayWindowRows.map((r) => r.personnelId));
  const hasAnyEntry = new Set(anyEntryRows.map((r) => r.personnelId));
  const hasAnyWindow = new Set(anyWindowRows.map((r) => r.personnelId));

  const result: Record<string, AvailabilityStatus> = {};
  for (const id of personnelIds) {
    const leave = leaveByPerson.get(id);
    if (leave) {
      result[id] = leave === "ziekte" ? "ziek" : "op_verlof";
    } else if (hasEntryToday.has(id)) {
      result[id] = "beschikbaar";
    } else if (hasWindowToday.has(id)) {
      result[id] = "beschikbaar";
    } else if (hasAnyEntry.has(id) || hasAnyWindow.has(id)) {
      result[id] = "niet_beschikbaar";
    } else {
      result[id] = "niet_ingesteld";
    }
  }
  return result;
}
