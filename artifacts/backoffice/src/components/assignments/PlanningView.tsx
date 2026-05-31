"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssignmentStatusBadge } from "./AssignmentStatusBadge";
import type { WeekAssignment } from "@/app/actions/assignments";

const NL_DAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const NL_MONTHS = [
  "jan", "feb", "mrt", "apr", "mei", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
];

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

interface PlanningViewProps {
  weekStartStr: string;  // YYYY-MM-DD of the Monday
  assignments:  WeekAssignment[];
  canWrite:     boolean;
}

export function PlanningView({ weekStartStr, assignments, canWrite }: PlanningViewProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const weekStart = new Date(weekStartStr + "T00:00:00");
  const weekEnd   = addDays(weekStart, 6);
  const weekNum   = getWeekNumber(weekStart);

  const startYear  = weekStart.getFullYear();
  const startMonth = NL_MONTHS[weekStart.getMonth()];
  const startDay   = weekStart.getDate();
  const endMonth   = NL_MONTHS[weekEnd.getMonth()];
  const endDay     = weekEnd.getDate();
  const endYear    = weekEnd.getFullYear();

  const weekLabel =
    startMonth === endMonth && startYear === endYear
      ? `Week ${weekNum} — ${startDay}–${endDay} ${startMonth} ${startYear}`
      : startYear === endYear
        ? `Week ${weekNum} — ${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`
        : `Week ${weekNum} — ${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;

  const prevWeek = formatDateKey(addDays(weekStart, -7));
  const nextWeek = formatDateKey(addDays(weekStart,  7));
  const todayStr = formatDateKey(new Date());

  // Group assignments by date
  const byDate = new Map<string, WeekAssignment[]>();
  for (const a of assignments) {
    const list = byDate.get(a.scheduledDate) ?? [];
    list.push(a);
    byDate.set(a.scheduledDate, list);
  }

  // Build 7-day columns
  const days = Array.from({ length: 7 }, (_, i) => {
    const date    = addDays(weekStart, i);
    const dateStr = formatDateKey(date);
    return {
      label:    NL_DAYS[i],
      dateStr,
      date,
      isToday:  dateStr === todayStr,
      items:    byDate.get(dateStr) ?? [],
    };
  });

  const totalForWeek = assignments.length;

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold" style={{ color: "#081D3A" }}>
            {weekLabel}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#64748B" }}>
            {totalForWeek === 0
              ? "Geen ingeplande opdrachten"
              : `${totalForWeek} opdracht${totalForWeek > 1 ? "en" : ""} ingepland`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.replace(`${pathname}?week=${prevWeek}`)}
          >
            <ChevronLeft className="h-4 w-4" />
            Vorige week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.replace(`${pathname}?week=${todayStr}`)}
          >
            Vandaag
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.replace(`${pathname}?week=${nextWeek}`)}
          >
            Volgende week
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => (
          <div key={day.dateStr} className="min-w-0">
            {/* Day header */}
            <div
              className="flex flex-col items-center justify-center pb-2 mb-2"
              style={{ borderBottom: "1px solid #E2E8F0" }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: day.isToday ? "#00B7B3" : "#64748B" }}
              >
                {day.label}
              </span>
              <span
                className="font-heading text-xl font-bold mt-0.5 w-8 h-8 flex items-center justify-center rounded-full"
                style={
                  day.isToday
                    ? { background: "#00B7B3", color: "#fff" }
                    : { color: "#081D3A" }
                }
              >
                {day.date.getDate()}
              </span>
            </div>

            {/* Assignment cards */}
            <div className="flex flex-col gap-2">
              {day.items.length === 0 ? (
                <div
                  className="text-xs text-center py-4 rounded"
                  style={{ color: "#CBD5E1" }}
                >
                  —
                </div>
              ) : (
                day.items.map((a) => (
                  <Link
                    key={a.id}
                    href={`/assignments/${a.id}`}
                    className="block rounded p-2 transition-shadow hover:shadow-md"
                    style={{
                      background: "#fff",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <p
                      className="text-xs font-semibold leading-snug mb-1 line-clamp-2"
                      style={{ color: "#081D3A" }}
                    >
                      {a.title}
                    </p>
                    <p
                      className="text-xs mb-1.5 truncate"
                      style={{ color: "#64748B" }}
                    >
                      {a.customerName}
                    </p>
                    <div className="mb-1.5">
                      <AssignmentStatusBadge status={a.status} />
                    </div>
                    {(a.scheduledStart || a.scheduledEnd) && (
                      <p className="text-xs flex items-center gap-1" style={{ color: "#94A3B8" }}>
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        {a.scheduledStart ?? ""}
                        {a.scheduledStart && a.scheduledEnd ? " – " : ""}
                        {a.scheduledEnd ?? ""}
                      </p>
                    )}
                    {a.personnelNames.length > 0 && (
                      <p className="text-xs flex items-center gap-1 mt-1" style={{ color: "#94A3B8" }}>
                        <Users className="h-3 w-3 flex-shrink-0" />
                        {a.personnelNames.slice(0, 2).join(", ")}
                        {a.personnelNames.length > 2 && ` +${a.personnelNames.length - 2}`}
                      </p>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
