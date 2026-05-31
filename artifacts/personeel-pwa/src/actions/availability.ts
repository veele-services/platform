"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import { availabilityWindowsTable, personnelTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type AvailabilityWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

async function getMyPersonnelId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  return row?.id ?? null;
}

export async function getMyAvailabilityWindows(): Promise<AvailabilityWindow[]> {
  const personnelId = await getMyPersonnelId();
  if (!personnelId) return [];

  const rows = await db
    .select({
      dayOfWeek: availabilityWindowsTable.dayOfWeek,
      startTime: availabilityWindowsTable.startTime,
      endTime: availabilityWindowsTable.endTime,
    })
    .from(availabilityWindowsTable)
    .where(eq(availabilityWindowsTable.personnelId, personnelId));

  return rows;
}

const TIME_RE = /^\d{2}:\d{2}$/;

export async function saveAvailabilityWindows(
  windows: AvailabilityWindow[],
): Promise<{ success: boolean; error?: string }> {
  const personnelId = await getMyPersonnelId();
  if (!personnelId) return { success: false, error: "Niet ingelogd" };

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

  revalidatePath("/beschikbaarheid");
  return { success: true };
}
