"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type AvailabilityWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

const TIME_RE = /^\d{2}:\d{2}$/;

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

export async function getMyAvailabilityWindows(): Promise<AvailabilityWindow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

export async function saveAvailabilityWindows(
  windows: AvailabilityWindow[],
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  if (!personnelId) return { success: false, error: "Personeelsprofiel niet gevonden" };

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
