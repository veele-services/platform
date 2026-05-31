"use server";

import { db } from "@workspace/db";
import { reportsTable, assignmentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
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
 * Fetch all approved reports for the current user, grouped by month.
 * Uses submitted_by (Supabase Auth UUID) to scope to the logged-in field worker.
 * Uses Drizzle (service-role connection) to bypass RLS on reports.
 */
export async function getMyHours(): Promise<MonthSummary[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const rows = await db
    .select({
      reportId:        reportsTable.id,
      assignmentId:    reportsTable.assignmentId,
      assignmentTitle: assignmentsTable.title,
      scheduledDate:   assignmentsTable.scheduledDate,
      hoursWorked:     reportsTable.hoursWorked,
      submittedAt:     reportsTable.submittedAt,
    })
    .from(reportsTable)
    .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(reportsTable.submittedBy, user.id),
        eq(reportsTable.status, "approved"),
      ),
    )
    .orderBy(desc(reportsTable.submittedAt));

  // Group by YYYY-MM
  const byMonth: Record<string, HoursEntry[]> = {};

  for (const r of rows) {
    const month = r.submittedAt.toISOString().slice(0, 7);
    const hours = r.hoursWorked ? parseFloat(r.hoursWorked) : 0;
    const entry: HoursEntry = {
      reportId:        r.reportId,
      assignmentId:    r.assignmentId,
      assignmentTitle: r.assignmentTitle,
      scheduledDate:   r.scheduledDate ?? null,
      hoursWorked:     hours,
      submittedAt:     r.submittedAt.toISOString(),
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
