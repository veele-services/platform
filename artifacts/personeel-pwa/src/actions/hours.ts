"use server";

import {
  db,
  reportsTable,
  assignmentsTable,
  assignmentPersonnelTable,
  objectsTable,
  personnelTable,
  resolveAssignmentEffectiveInterval,
} from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

async function getPersonnelIdentity(): Promise<{ userId: string; personnelId: string; tenantId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id, tenantId: personnelTable.tenantId })
    .from(personnelTable)
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .limit(1);

  return row ? { userId: user.id, personnelId: row.id, tenantId: row.tenantId } : null;
}

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

export type WeeklyHoursEntry = HoursEntry & {
  assignmentCode:  string;
  workDate:        string;
  scheduledStart:  string | null;
  scheduledEnd:    string | null;
  effectiveStart:  string | null;
  effectiveEnd:    string | null;
  timeSource:      "planned" | "partly_actual" | "actual";
  objectName:      string | null;
  objectCity:      string | null;
};

export type WeeklyHoursDay = {
  date:       string;
  totalHours: number;
  entries:    WeeklyHoursEntry[];
};

export type WeeklyHoursSummary = {
  weekStart:    string;
  weekEnd:      string;
  previousWeek: string;
  nextWeek:     string;
  totalHours:   number;
  reportCount:  number;
  days:         WeeklyHoursDay[];
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateKeyInAmsterdam(date: Date): string {
  const parts = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
  }).formatToParts(date);

  const year  = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day   = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isValidDateKey(value: string | null | undefined): value is string {
  if (!value || !DATE_KEY_PATTERN.test(value)) return false;
  return !Number.isNaN(parseDateKey(value).getTime());
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return toDateKey(date);
}

function startOfWeek(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return toDateKey(date);
}

function normalizeWeekStart(weekStart?: string | null): string {
  const baseDate = isValidDateKey(weekStart)
    ? weekStart
    : dateKeyInAmsterdam(new Date());

  return startOfWeek(baseDate);
}

/**
 * Fetch approved reports for the current field worker and group them into a
 * Monday-Sunday week. Actual execution timestamps are leading; planned values
 * remain available as context and are never overwritten.
 */
export async function getMyWeeklyHours(weekStart?: string | null): Promise<WeeklyHoursSummary> {
  const identity = await getPersonnelIdentity();

  const normalizedWeekStart = normalizeWeekStart(weekStart);
  const normalizedWeekEnd = addDays(normalizedWeekStart, 6);
  const days: WeeklyHoursDay[] = Array.from({ length: 7 }, (_, index) => ({
    date:       addDays(normalizedWeekStart, index),
    totalHours: 0,
    entries:    [],
  }));

  const emptySummary: WeeklyHoursSummary = {
    weekStart:    normalizedWeekStart,
    weekEnd:      normalizedWeekEnd,
    previousWeek: addDays(normalizedWeekStart, -7),
    nextWeek:     addDays(normalizedWeekStart, 7),
    totalHours:   0,
    reportCount:  0,
    days,
  };

  if (!identity) return emptySummary;

  const rows = await db
    .select({
      reportId:        reportsTable.id,
      assignmentId:    reportsTable.assignmentId,
      assignmentCode:  assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      scheduledDate:   assignmentsTable.scheduledDate,
      scheduledStart:  assignmentsTable.scheduledStart,
      scheduledEnd:    assignmentsTable.scheduledEnd,
      actualStartedAt:  assignmentsTable.actualStartedAt,
      actualCompletedAt: assignmentsTable.actualCompletedAt,
      status:           assignmentsTable.status,
      objectName:      objectsTable.name,
      objectCity:      objectsTable.city,
      hoursWorked:     reportsTable.hoursWorked,
      submittedAt:     reportsTable.submittedAt,
    })
    .from(reportsTable)
    .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .where(
      and(
        eq(reportsTable.submittedBy, identity.userId),
        eq(assignmentsTable.tenantId, identity.tenantId),
        eq(reportsTable.status, "approved"),
      ),
    )
    .orderBy(asc(assignmentsTable.scheduledDate), asc(assignmentsTable.scheduledStart), desc(reportsTable.submittedAt));

  const dayMap = new Map(days.map((day) => [day.date, day]));

  for (const row of rows) {
    const interval = resolveAssignmentEffectiveInterval({
      scheduledDate: row.scheduledDate ?? null,
      scheduledStart: row.scheduledStart ?? null,
      scheduledEnd: row.scheduledEnd ?? null,
      actualStartedAt: row.actualStartedAt,
      actualCompletedAt: row.actualCompletedAt,
      status: row.status,
    });
    const workDate = isValidDateKey(interval.effectiveDate)
      ? interval.effectiveDate
      : dateKeyInAmsterdam(row.submittedAt);
    if (workDate < normalizedWeekStart || workDate > normalizedWeekEnd) continue;

    const day = dayMap.get(workDate);
    if (!day) continue;

    const hours = row.hoursWorked ? parseFloat(row.hoursWorked) : 0;
    const entry: WeeklyHoursEntry = {
      reportId:        row.reportId,
      assignmentId:    row.assignmentId,
      assignmentCode:  row.assignmentCode,
      assignmentTitle: row.assignmentTitle,
      scheduledDate:   row.scheduledDate ?? null,
      workDate,
      scheduledStart:  row.scheduledStart ?? null,
      scheduledEnd:    row.scheduledEnd ?? null,
      effectiveStart:  interval.effectiveStart,
      effectiveEnd:    interval.effectiveEnd,
      timeSource:      interval.source,
      objectName:      row.objectName ?? null,
      objectCity:      row.objectCity ?? null,
      hoursWorked:     hours,
      submittedAt:     row.submittedAt.toISOString(),
    };

    day.entries.push(entry);
    day.totalHours += hours;
  }

  for (const day of days) {
    day.entries.sort((a, b) => {
      const startCompare = (a.effectiveStart ?? "99:99").localeCompare(
        b.effectiveStart ?? "99:99",
      );
      if (startCompare !== 0) return startCompare;
      return a.assignmentTitle.localeCompare(b.assignmentTitle, "nl-NL");
    });
  }

  return {
    ...emptySummary,
    totalHours:  days.reduce((sum, day) => sum + day.totalHours, 0),
    reportCount: days.reduce((sum, day) => sum + day.entries.length, 0),
    days,
  };
}

/**
 * Fetch all approved reports for the current user, grouped by month.
 * Uses submitted_by (Supabase Auth UUID) to scope to the logged-in field worker.
 * Uses Drizzle (service-role connection) to bypass RLS on reports.
 */
export async function getMyHours(): Promise<MonthSummary[]> {
  const identity = await getPersonnelIdentity();
  if (!identity) return [];

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
        eq(reportsTable.submittedBy, identity.userId),
        eq(assignmentsTable.tenantId, identity.tenantId),
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
