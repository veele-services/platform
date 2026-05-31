"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@workspace/db";
import { availabilityWindowsTable, personnelTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
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

export async function saveAvailabilityWindows(
  windows: AvailabilityWindow[],
): Promise<{ success: boolean; error?: string }> {
  const personnelId = await getMyPersonnelId();
  if (!personnelId) return { success: false, error: "Niet ingelogd" };

  const daysToSave = windows.map((w) => w.dayOfWeek);

  if (daysToSave.length > 0) {
    await db
      .delete(availabilityWindowsTable)
      .where(
        and(
          eq(availabilityWindowsTable.personnelId, personnelId),
          inArray(availabilityWindowsTable.dayOfWeek, daysToSave),
        ),
      );
  } else {
    await db
      .delete(availabilityWindowsTable)
      .where(eq(availabilityWindowsTable.personnelId, personnelId));
  }

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
