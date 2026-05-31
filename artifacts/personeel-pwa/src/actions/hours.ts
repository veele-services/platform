"use server";

import { createClient } from "@/lib/supabase/server";

export type HoursEntry = {
  reportId:        string;
  assignmentId:    string;
  assignmentTitle: string;
  scheduledDate:   string | null;
  hoursWorked:     number;
  submittedAt:     string;
};

export type MonthSummary = {
  month:      string;
  label:      string;
  totalHours: number;
  entries:    HoursEntry[];
};

/**
 * Fetch all approved reports submitted by the current user, grouped by month.
 * Uses submitted_by (auth UUID) to scope to the logged-in field worker.
 */
export async function getMyHours(): Promise<MonthSummary[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("reports")
    .select(`
      id, hours_worked, submitted_at,
      assignments!inner(title, scheduled_date)
    `)
    .eq("submitted_by", user.id)
    .eq("status", "approved")
    .order("submitted_at", { ascending: false });

  if (!data) return [];

  const byMonth: Record<string, HoursEntry[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of data as any[]) {
    const month = (r.submitted_at as string).slice(0, 7); // YYYY-MM
    const entry: HoursEntry = {
      reportId:        r.id,
      assignmentId:    r.assignments?.id ?? "",
      assignmentTitle: r.assignments?.title ?? "Onbekend",
      scheduledDate:   r.assignments?.scheduled_date ?? null,
      hoursWorked:     r.hours_worked ? parseFloat(r.hours_worked) : 0,
      submittedAt:     r.submitted_at,
    };
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(entry);
  }

  return Object.entries(byMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, entries]) => ({
      month,
      label: new Date(`${month}-01T00:00:00`).toLocaleDateString("nl-NL", {
        month: "long",
        year:  "numeric",
      }),
      totalHours: entries.reduce((sum, e) => sum + e.hoursWorked, 0),
      entries,
    }));
}
