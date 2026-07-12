"use server";

import { randomUUID } from "node:crypto";
import {
  auditLogTable,
  availabilityDayEntriesTable,
  availabilityWindowsTable,
  db,
  organizationSettingsTable,
  personnelTable,
} from "@workspace/db";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { and, eq, gte, lte, notInArray, sql } from "drizzle-orm";

export type AvailabilityWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type AvailabilityRepeat = "none" | "daily" | "weekly" | "monthly";

export type AvailabilityDayEntry = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isEmergencyAvailable: boolean;
  repeatType: AvailabilityRepeat;
  repeatGroupId: string | null;
  updatedAt: string;
};

export type AvailabilityCalendarData = {
  today: string;
  maxDate: string;
  advanceDays: number;
  entries: AvailabilityDayEntry[];
};

type ActionResult = { success: boolean; error?: string; conflict?: boolean };

type PersonnelAvailabilityActor = {
  id: string;
  tenantId: string;
  userId: string;
  updatedAt: Date;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_REPEAT_TYPES: AvailabilityRepeat[] = [
  "none",
  "daily",
  "weekly",
  "monthly",
];

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function todayDateKey(): string {
  return dateKey(new Date());
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function isValidDateKey(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  return dateKey(parseDateKey(value)) === value;
}

function addDays(value: string, days: number): string {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function addMonths(
  value: string,
  months: number,
  preferredDay: number,
): string {
  const source = parseDateKey(value);
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(preferredDay, lastDay));
  return dateKey(target);
}

function buildRepeatDates(
  startDate: string,
  repeatType: AvailabilityRepeat,
  maxDate: string,
): string[] {
  const dates: string[] = [];
  const preferredDay = parseDateKey(startDate).getDate();
  let current = startDate;
  let step = 0;

  while (current <= maxDate && dates.length < 380) {
    dates.push(current);
    if (repeatType === "none") break;
    if (repeatType === "daily") current = addDays(current, 1);
    if (repeatType === "weekly") current = addDays(current, 7);
    if (repeatType === "monthly") {
      step += 1;
      current = addMonths(startDate, step, preferredDay);
    }
  }

  return dates;
}

function validateTimeRange(startTime: string, endTime: string): string | null {
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return "Ongeldig tijdformaat (verwacht HH:MM)";
  }
  if (startTime >= endTime) {
    return "Begintijd moet voor eindtijd liggen";
  }
  return null;
}

function normalizeAvailabilityWindow(
  window: AvailabilityWindow,
): AvailabilityWindow | { error: string } {
  const dayOfWeek = Number(window.dayOfWeek);
  const startTime = String(window.startTime ?? "").trim();
  const endTime = String(window.endTime ?? "").trim();

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { error: "Ongeldige dag van de week" };
  }

  const timeError = validateTimeRange(startTime, endTime);
  if (timeError) return { error: timeError };

  return { dayOfWeek, startTime, endTime };
}

function normalizeAvailabilityWindows(
  windows: AvailabilityWindow[],
):
  | { success: true; windows: AvailabilityWindow[] }
  | { success: false; error: string } {
  if (windows.length > 7) {
    return { success: false, error: "Maximaal 7 dagen per week" };
  }

  const byDay = new Map<number, AvailabilityWindow>();
  for (const window of windows) {
    const normalized = normalizeAvailabilityWindow(window);
    if ("error" in normalized)
      return { success: false, error: normalized.error };
    if (byDay.has(normalized.dayOfWeek)) {
      return {
        success: false,
        error: "Overlappende beschikbaarheid op dezelfde dag",
      };
    }
    byDay.set(normalized.dayOfWeek, normalized);
  }

  return {
    success: true,
    windows: [...byDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek),
  };
}

function updatedAtMatches(actual: Date, expected?: string | null): boolean {
  if (!expected) return true;
  const parsed = new Date(expected);
  return (
    Number.isFinite(parsed.getTime()) && actual.getTime() === parsed.getTime()
  );
}

async function getAvailabilityAdvanceDays(tenantId: string): Promise<number> {
  const [settings] = await db
    .select({
      availabilityAdvanceDays:
        organizationSettingsTable.availabilityAdvanceDays,
    })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  return settings?.availabilityAdvanceDays ?? 60;
}

async function getAuthenticatedAvailabilityActor(
  userId: string,
): Promise<PersonnelAvailabilityActor | null> {
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  if (!tenantId) return null;

  const [personnel] = await db
    .select({
      id: personnelTable.id,
      tenantId: personnelTable.tenantId,
      updatedAt: personnelTable.updatedAt,
    })
    .from(personnelTable)
    .where(
      and(
        eq(personnelTable.userId, userId),
        eq(personnelTable.tenantId, tenantId),
        eq(personnelTable.isActive, true),
      ),
    )
    .limit(1);

  return personnel ? { ...personnel, userId } : null;
}

function revalidateAvailabilityConsumers() {
  revalidatePath("/");
  revalidatePath("/beschikbaarheid");
  revalidatePath("/opdrachten");
  revalidatePath("/openstaand");
  revalidatePath("/planning");
  revalidatePath("/personnel");
}

export async function getMyAvailabilityWindows(): Promise<
  AvailabilityWindow[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const actor = await getAuthenticatedAvailabilityActor(user.id);
  if (!actor) return [];

  return db
    .select({
      dayOfWeek: availabilityWindowsTable.dayOfWeek,
      startTime: availabilityWindowsTable.startTime,
      endTime: availabilityWindowsTable.endTime,
    })
    .from(availabilityWindowsTable)
    .where(eq(availabilityWindowsTable.personnelId, actor.id));
}

export async function getMyAvailabilityCalendar(): Promise<AvailabilityCalendarData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const today = todayDateKey();

  if (!user) {
    const advanceDays = 60;
    const maxDate = addDays(today, advanceDays);
    return { today, maxDate, advanceDays, entries: [] };
  }

  const actor = await getAuthenticatedAvailabilityActor(user.id);
  const advanceDays = actor
    ? await getAvailabilityAdvanceDays(actor.tenantId)
    : 60;
  const maxDate = addDays(today, advanceDays);

  if (!actor) {
    return { today, maxDate, advanceDays, entries: [] };
  }

  const rows = await db
    .select()
    .from(availabilityDayEntriesTable)
    .where(
      and(
        eq(availabilityDayEntriesTable.personnelId, actor.id),
        gte(availabilityDayEntriesTable.date, today),
        lte(availabilityDayEntriesTable.date, maxDate),
      ),
    )
    .orderBy(availabilityDayEntriesTable.date);

  return {
    today,
    maxDate,
    advanceDays,
    entries: rows.map((row) => ({
      id: row.id,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      isEmergencyAvailable: row.isEmergencyAvailable,
      repeatType: row.repeatType as AvailabilityRepeat,
      repeatGroupId: row.repeatGroupId,
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

export async function saveAvailabilityWindows(
  windows: AvailabilityWindow[],
  options?: { expectedPersonnelUpdatedAt?: string | null },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const normalized = normalizeAvailabilityWindows(windows);
  if (!normalized.success) return { success: false, error: normalized.error };

  const actor = await getAuthenticatedAvailabilityActor(user.id);
  if (!actor)
    return { success: false, error: "Personeelsprofiel niet gevonden" };

  if (!updatedAtMatches(actor.updatedAt, options?.expectedPersonnelUpdatedAt)) {
    return {
      success: false,
      conflict: true,
      error:
        "Beschikbaarheid is ondertussen gewijzigd. Vernieuw en probeer opnieuw.",
    };
  }

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: availabilityWindowsTable.id,
        dayOfWeek: availabilityWindowsTable.dayOfWeek,
        startTime: availabilityWindowsTable.startTime,
        endTime: availabilityWindowsTable.endTime,
      })
      .from(availabilityWindowsTable)
      .where(eq(availabilityWindowsTable.personnelId, actor.id));

    const existingByDay = new Map(existing.map((row) => [row.dayOfWeek, row]));
    const requestedDays = normalized.windows.map((window) => window.dayOfWeek);
    let inserted = 0;
    let updated = 0;

    for (const window of normalized.windows) {
      const current = existingByDay.get(window.dayOfWeek);
      if (!current) {
        await tx.insert(availabilityWindowsTable).values({
          personnelId: actor.id,
          dayOfWeek: window.dayOfWeek,
          startTime: window.startTime,
          endTime: window.endTime,
        });
        inserted += 1;
      } else if (
        current.startTime !== window.startTime ||
        current.endTime !== window.endTime
      ) {
        await tx
          .update(availabilityWindowsTable)
          .set({ startTime: window.startTime, endTime: window.endTime })
          .where(eq(availabilityWindowsTable.id, current.id));
        updated += 1;
      }
    }

    const removed = existing.filter(
      (row) => !requestedDays.includes(row.dayOfWeek),
    ).length;
    if (removed > 0) {
      await tx
        .delete(availabilityWindowsTable)
        .where(
          requestedDays.length > 0
            ? and(
                eq(availabilityWindowsTable.personnelId, actor.id),
                notInArray(availabilityWindowsTable.dayOfWeek, requestedDays),
              )
            : eq(availabilityWindowsTable.personnelId, actor.id),
        );
    }

    const now = new Date();
    await tx
      .update(personnelTable)
      .set({ updatedAt: now })
      .where(
        and(
          eq(personnelTable.id, actor.id),
          eq(personnelTable.tenantId, actor.tenantId),
          eq(personnelTable.userId, actor.userId),
          eq(personnelTable.isActive, true),
        ),
      );

    await tx.insert(auditLogTable).values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "availability_windows_saved",
      resource: "availability_windows",
      resourceId: actor.id,
      metadata: {
        source: "personnel-pwa",
        inserted,
        updated,
        removed,
        total: normalized.windows.length,
      },
    });
  });

  revalidateAvailabilityConsumers();
  return { success: true };
}

export async function saveAvailabilityDay(input: {
  date: string;
  startTime: string;
  endTime: string;
  repeatType: AvailabilityRepeat;
  isEmergencyAvailable: boolean;
  expectedUpdatedAt?: string | null;
}): Promise<ActionResult & { savedDates?: number; updatedAt?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  if (!isValidDateKey(input.date)) {
    return { success: false, error: "Ongeldige datum" };
  }
  if (!VALID_REPEAT_TYPES.includes(input.repeatType)) {
    return { success: false, error: "Ongeldige herhaling" };
  }

  const startTime = input.startTime.trim();
  const endTime = input.endTime.trim();
  const timeError = validateTimeRange(startTime, endTime);
  if (timeError) return { success: false, error: timeError };

  const actor = await getAuthenticatedAvailabilityActor(user.id);
  if (!actor)
    return { success: false, error: "Personeelsprofiel niet gevonden" };

  const today = todayDateKey();
  const advanceDays = await getAvailabilityAdvanceDays(actor.tenantId);
  const maxDate = addDays(today, advanceDays);
  if (input.date < today) {
    return {
      success: false,
      error: "Beschikbaarheid kan niet in het verleden worden aangepast",
    };
  }
  if (input.date > maxDate) {
    return {
      success: false,
      error: `Je kunt maximaal ${advanceDays} dagen vooruit invullen`,
    };
  }

  const dates = buildRepeatDates(input.date, input.repeatType, maxDate);
  const repeatGroupId = input.repeatType === "none" ? null : randomUUID();
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [existingSelected] = await tx
      .select({ updatedAt: availabilityDayEntriesTable.updatedAt })
      .from(availabilityDayEntriesTable)
      .where(
        and(
          eq(availabilityDayEntriesTable.personnelId, actor.id),
          eq(availabilityDayEntriesTable.date, input.date),
        ),
      )
      .limit(1);

    if (
      existingSelected &&
      !updatedAtMatches(existingSelected.updatedAt, input.expectedUpdatedAt)
    ) {
      return {
        success: false,
        conflict: true,
        error:
          "Beschikbaarheid is ondertussen gewijzigd. Vernieuw en probeer opnieuw.",
      } as const;
    }

    await tx
      .insert(availabilityDayEntriesTable)
      .values(
        dates.map((date) => ({
          personnelId: actor.id,
          date,
          startTime,
          endTime,
          isEmergencyAvailable: input.isEmergencyAvailable,
          repeatType: input.repeatType,
          repeatGroupId,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [
          availabilityDayEntriesTable.personnelId,
          availabilityDayEntriesTable.date,
        ],
        set: {
          startTime: sql`excluded.start_time`,
          endTime: sql`excluded.end_time`,
          isEmergencyAvailable: sql`excluded.is_emergency_available`,
          repeatType: sql`excluded.repeat_type`,
          repeatGroupId: sql`excluded.repeat_group_id`,
          updatedAt: now,
        },
      });

    await tx
      .update(personnelTable)
      .set({ updatedAt: now })
      .where(
        and(
          eq(personnelTable.id, actor.id),
          eq(personnelTable.tenantId, actor.tenantId),
          eq(personnelTable.userId, actor.userId),
          eq(personnelTable.isActive, true),
        ),
      );

    await tx.insert(auditLogTable).values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "availability_day_saved",
      resource: "availability_day_entries",
      resourceId: actor.id,
      metadata: {
        source: "personnel-pwa",
        startDate: input.date,
        repeatType: input.repeatType,
        savedDates: dates.length,
      },
    });

    return { success: true as const, updatedAt: now.toISOString() };
  });

  if (!result.success) return result;

  revalidateAvailabilityConsumers();
  return {
    success: true,
    savedDates: dates.length,
    updatedAt: result.updatedAt,
  };
}

export async function deleteAvailabilityDay(
  date: string,
  options?: { expectedUpdatedAt?: string | null },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };
  if (!isValidDateKey(date))
    return { success: false, error: "Ongeldige datum" };

  const actor = await getAuthenticatedAvailabilityActor(user.id);
  if (!actor)
    return { success: false, error: "Personeelsprofiel niet gevonden" };

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: availabilityDayEntriesTable.id,
        updatedAt: availabilityDayEntriesTable.updatedAt,
      })
      .from(availabilityDayEntriesTable)
      .where(
        and(
          eq(availabilityDayEntriesTable.personnelId, actor.id),
          eq(availabilityDayEntriesTable.date, date),
        ),
      )
      .limit(1);

    if (!existing) return { success: true as const };
    if (!updatedAtMatches(existing.updatedAt, options?.expectedUpdatedAt)) {
      return {
        success: false,
        conflict: true,
        error:
          "Beschikbaarheid is ondertussen gewijzigd. Vernieuw en probeer opnieuw.",
      } as const;
    }

    await tx
      .delete(availabilityDayEntriesTable)
      .where(eq(availabilityDayEntriesTable.id, existing.id));

    const now = new Date();
    await tx
      .update(personnelTable)
      .set({ updatedAt: now })
      .where(
        and(
          eq(personnelTable.id, actor.id),
          eq(personnelTable.tenantId, actor.tenantId),
          eq(personnelTable.userId, actor.userId),
          eq(personnelTable.isActive, true),
        ),
      );

    await tx.insert(auditLogTable).values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "availability_day_deleted",
      resource: "availability_day_entries",
      resourceId: existing.id,
      metadata: {
        source: "personnel-pwa",
        personnelId: actor.id,
        date,
      },
    });

    return { success: true as const };
  });

  if (!result.success) return result;

  revalidateAvailabilityConsumers();
  return { success: true };
}
