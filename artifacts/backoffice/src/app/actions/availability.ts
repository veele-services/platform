"use server";

import { db } from "@workspace/db";
import {
  availabilityWindowsTable,
  leavePeriodsTable,
  auditLogTable,
  LEAVE_TYPES,
  type LeaveType,
  type AvailabilityStatus,
} from "@workspace/db";
import { eq, and, lte, gte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/permissions";
import type { ActionResult } from "./customers";

export type { ActionResult, LeaveType, AvailabilityStatus };
export { LEAVE_TYPES };

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvailabilityWindow = {
  id:          string;
  personnelId: string;
  dayOfWeek:   number;
  startTime:   string;
  endTime:     string;
};

export type LeavePeriod = {
  id:          string;
  personnelId: string;
  startDate:   string;
  endDate:     string;
  leaveType:   LeaveType;
  reason:      string | null;
  createdAt:   string;
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
    id:          r.id,
    personnelId: r.personnelId,
    dayOfWeek:   r.dayOfWeek,
    startTime:   r.startTime,
    endTime:     r.endTime,
  }));
}

/**
 * Bulk-replace all availability windows for a personnel member.
 * Deletes all existing and re-inserts the provided list atomically.
 */
export async function setAvailabilityWindows(
  personnelId: string,
  windows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  for (const w of windows) {
    if (w.dayOfWeek < 0 || w.dayOfWeek > 6) {
      return { success: false, message: "Ongeldige dag van de week." };
    }
    if (!/^\d{2}:\d{2}$/.test(w.startTime) || !/^\d{2}:\d{2}$/.test(w.endTime)) {
      return { success: false, message: "Tijden moeten in HH:MM-formaat zijn." };
    }
    if (w.startTime >= w.endTime) {
      return { success: false, message: "Begintijd moet vóór eindtijd liggen." };
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
        endTime:   w.endTime,
      })),
    );
  }

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "update",
    resource:   "personnel",
    resourceId: personnelId,
    metadata:   { action: "set_availability_windows", windowCount: windows.length },
  });

  revalidatePath(`/personnel/${personnelId}`);
  return { success: true };
}

// ─── Leave Periods ────────────────────────────────────────────────────────────

export async function listLeavePeriods(personnelId: string): Promise<LeavePeriod[]> {
  await requirePermission("personnel", "read");

  const rows = await db
    .select()
    .from(leavePeriodsTable)
    .where(eq(leavePeriodsTable.personnelId, personnelId))
    .orderBy(leavePeriodsTable.startDate);

  return rows.map((r) => ({
    id:          r.id,
    personnelId: r.personnelId,
    startDate:   r.startDate,
    endDate:     r.endDate,
    leaveType:   r.leaveType as LeaveType,
    reason:      r.reason,
    createdAt:   r.createdAt.toISOString(),
  }));
}

export async function addLeavePeriod(data: {
  personnelId: string;
  startDate:   string;
  endDate:     string;
  leaveType:   LeaveType;
  reason?:     string;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  if (!data.startDate || !data.endDate) {
    return { success: false, message: "Begin- en einddatum zijn verplicht." };
  }
  if (data.startDate > data.endDate) {
    return { success: false, message: "Begindatum moet vóór einddatum liggen." };
  }
  if (!LEAVE_TYPES.includes(data.leaveType)) {
    return { success: false, message: "Ongeldig verloftype." };
  }

  const [inserted] = await db
    .insert(leavePeriodsTable)
    .values({
      personnelId: data.personnelId,
      startDate:   data.startDate,
      endDate:     data.endDate,
      leaveType:   data.leaveType,
      reason:      data.reason?.trim() || null,
      createdBy:   user.id,
    })
    .returning({ id: leavePeriodsTable.id });

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "create",
    resource:   "personnel",
    resourceId: data.personnelId,
    metadata:   {
      action:    "add_leave_period",
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate:   data.endDate,
    },
  });

  revalidatePath(`/personnel/${data.personnelId}`);
  return { success: true, data: { id: inserted!.id } };
}

export async function deleteLeavePeriod(
  id:          string,
  personnelId: string,
): Promise<ActionResult> {
  await requirePermission("personnel", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
    userId:     user.id,
    action:     "delete",
    resource:   "personnel",
    resourceId: personnelId,
    metadata:   { action: "delete_leave_period", leavePeriodId: id },
  });

  revalidatePath(`/personnel/${personnelId}`);
  return { success: true };
}

// ─── Availability Status ──────────────────────────────────────────────────────

/**
 * Compute availability status for a personnel member on a specific date.
 * Internal helper — no permission check, for use within server actions only.
 */
export async function computeAvailabilityStatus(
  personnelId: string,
  dateStr:     string, // YYYY-MM-DD
): Promise<AvailabilityStatus> {
  // 1. Active leave period covering this date?
  const [leave] = await db
    .select({ leaveType: leavePeriodsTable.leaveType })
    .from(leavePeriodsTable)
    .where(
      and(
        eq(leavePeriodsTable.personnelId, personnelId),
        lte(leavePeriodsTable.startDate, dateStr),
        gte(leavePeriodsTable.endDate,   dateStr),
      ),
    )
    .limit(1);

  if (leave) {
    return leave.leaveType === "ziekte" ? "ziek" : "op_verlof";
  }

  // 2. Is there a window for today's day-of-week?
  const dayOfWeek = new Date(dateStr + "T00:00:00").getDay();

  const [todayWindow] = await db
    .select({ id: availabilityWindowsTable.id })
    .from(availabilityWindowsTable)
    .where(
      and(
        eq(availabilityWindowsTable.personnelId, personnelId),
        eq(availabilityWindowsTable.dayOfWeek,   dayOfWeek),
      ),
    )
    .limit(1);

  if (todayWindow) return "beschikbaar";

  // 3. Does this personnel have any windows at all?
  const [anyWindow] = await db
    .select({ id: availabilityWindowsTable.id })
    .from(availabilityWindowsTable)
    .where(eq(availabilityWindowsTable.personnelId, personnelId))
    .limit(1);

  return anyWindow ? "niet_beschikbaar" : "niet_ingesteld";
}

/**
 * Public action — compute availability status for a single personnel.
 */
export async function getAvailabilityStatus(
  personnelId: string,
  dateStr:     string,
): Promise<AvailabilityStatus> {
  await requirePermission("personnel", "read");
  return computeAvailabilityStatus(personnelId, dateStr);
}

/**
 * Batch-compute availability status for multiple personnel on the same date.
 * Returns a map of personnelId → AvailabilityStatus.
 * 3 queries regardless of personnel count — suitable for list views.
 */
export async function getBatchAvailabilityStatus(
  personnelIds: string[],
  dateStr:      string,
): Promise<Record<string, AvailabilityStatus>> {
  if (personnelIds.length === 0) return {};

  const dayOfWeek = new Date(dateStr + "T00:00:00").getDay();

  const [leaveRows, todayWindowRows, anyWindowRows] = await Promise.all([
    db
      .select({
        personnelId: leavePeriodsTable.personnelId,
        leaveType:   leavePeriodsTable.leaveType,
      })
      .from(leavePeriodsTable)
      .where(
        and(
          inArray(leavePeriodsTable.personnelId, personnelIds),
          lte(leavePeriodsTable.startDate, dateStr),
          gte(leavePeriodsTable.endDate,   dateStr),
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
  const hasWindowToday = new Set(todayWindowRows.map((r) => r.personnelId));
  const hasAnyWindow   = new Set(anyWindowRows.map((r)  => r.personnelId));

  const result: Record<string, AvailabilityStatus> = {};
  for (const id of personnelIds) {
    const leave = leaveByPerson.get(id);
    if (leave) {
      result[id] = leave === "ziekte" ? "ziek" : "op_verlof";
    } else if (hasWindowToday.has(id)) {
      result[id] = "beschikbaar";
    } else if (hasAnyWindow.has(id)) {
      result[id] = "niet_beschikbaar";
    } else {
      result[id] = "niet_ingesteld";
    }
  }
  return result;
}
