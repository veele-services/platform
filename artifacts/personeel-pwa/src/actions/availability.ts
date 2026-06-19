"use server";

import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  availabilityDayEntriesTable,
  availabilityWindowsTable,
  organizationSettingsTable,
} from "@workspace/db";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { and, eq, gte, lte, sql } from "drizzle-orm";

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
};

export type AvailabilityCalendarData = {
  today: string;
  maxDate: string;
  advanceDays: number;
  entries: AvailabilityDayEntry[];
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

async function getAvailabilityAdvanceDays(): Promise<number> {
  const [settings] = await db
    .select({
      availabilityAdvanceDays:
        organizationSettingsTable.availabilityAdvanceDays,
    })
    .from(organizationSettingsTable)
    .limit(1);

  return settings?.availabilityAdvanceDays ?? 60;
}

async function getPersonnelId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("personnel")
    .select("id")
    .eq("user_id", userId)
    .single();
  return data?.id ?? null;
}

export async function getMyAvailabilityWindows(): Promise<
  AvailabilityWindow[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const personnelId = await getPersonnelId(supabase, user.id);
  if (!personnelId) return [];

  const { data } = await supabase
    .from("availability_windows")
    .select("day_of_week, start_time, end_time")
    .eq("personnel_id", personnelId);

  if (!data) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    endTime: r.end_time,
  }));
}

export async function getMyAvailabilityCalendar(): Promise<AvailabilityCalendarData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const today = todayDateKey();
  const advanceDays = await getAvailabilityAdvanceDays();
  const maxDate = addDays(today, advanceDays);

  if (!user) {
    return { today, maxDate, advanceDays, entries: [] };
  }

  const personnelId = await getPersonnelId(supabase, user.id);
  if (!personnelId) {
    return { today, maxDate, advanceDays, entries: [] };
  }

  const rows = await db
    .select()
    .from(availabilityDayEntriesTable)
    .where(
      and(
        eq(availabilityDayEntriesTable.personnelId, personnelId),
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
    })),
  };
}

export async function saveAvailabilityWindows(
  windows: AvailabilityWindow[],
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  if (windows.length > 7) {
    return { success: false, error: "Maximaal 7 dagen per week" };
  }

  for (const w of windows) {
    if (w.dayOfWeek < 0 || w.dayOfWeek > 6) {
      return { success: false, error: "Ongeldige dag van de week" };
    }
    if (!TIME_RE.test(w.startTime) || !TIME_RE.test(w.endTime)) {
      return { success: false, error: "Ongeldig tijdformaat (verwacht HH:MM)" };
    }
    if (w.startTime >= w.endTime) {
      return { success: false, error: "Begintijd moet vóór eindtijd liggen" };
    }
  }

  const personnelId = await getPersonnelId(supabase, user.id);
  if (!personnelId)
    return { success: false, error: "Personeelsprofiel niet gevonden" };

  const { error: deleteError } = await supabase
    .from("availability_windows")
    .delete()
    .eq("personnel_id", personnelId);

  if (deleteError) return { success: false, error: "Opslaan mislukt" };

  if (windows.length > 0) {
    const { error: insertError } = await supabase
      .from("availability_windows")
      .insert(
        windows.map((w) => ({
          personnel_id: personnelId,
          day_of_week: w.dayOfWeek,
          start_time: w.startTime,
          end_time: w.endTime,
        })),
      );
    if (insertError) return { success: false, error: "Opslaan mislukt" };
  }

  revalidatePath("/beschikbaarheid");
  return { success: true };
}

export async function saveAvailabilityDay(input: {
  date: string;
  startTime: string;
  endTime: string;
  repeatType: AvailabilityRepeat;
  isEmergencyAvailable: boolean;
}): Promise<{ success: boolean; error?: string; savedDates?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  if (!DATE_RE.test(input.date)) {
    return { success: false, error: "Ongeldige datum" };
  }
  if (!["none", "daily", "weekly", "monthly"].includes(input.repeatType)) {
    return { success: false, error: "Ongeldige herhaling" };
  }

  const timeError = validateTimeRange(input.startTime, input.endTime);
  if (timeError) return { success: false, error: timeError };

  const personnelId = await getPersonnelId(supabase, user.id);
  if (!personnelId)
    return { success: false, error: "Personeelsprofiel niet gevonden" };

  const today = todayDateKey();
  const advanceDays = await getAvailabilityAdvanceDays();
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

  await db
    .insert(availabilityDayEntriesTable)
    .values(
      dates.map((date) => ({
        personnelId,
        date,
        startTime: input.startTime,
        endTime: input.endTime,
        isEmergencyAvailable: input.isEmergencyAvailable,
        repeatType: input.repeatType,
        repeatGroupId,
        updatedAt: new Date(),
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
        updatedAt: new Date(),
      },
    });

  revalidatePath("/beschikbaarheid");
  return { success: true, savedDates: dates.length };
}

export async function deleteAvailabilityDay(
  date: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };
  if (!DATE_RE.test(date)) return { success: false, error: "Ongeldige datum" };

  const personnelId = await getPersonnelId(supabase, user.id);
  if (!personnelId)
    return { success: false, error: "Personeelsprofiel niet gevonden" };

  await db
    .delete(availabilityDayEntriesTable)
    .where(
      and(
        eq(availabilityDayEntriesTable.personnelId, personnelId),
        eq(availabilityDayEntriesTable.date, date),
      ),
    );

  revalidatePath("/beschikbaarheid");
  return { success: true };
}
