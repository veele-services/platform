"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { statusAccentColor } from "./AssignmentStatusBadge";
import type { WeekAssignment } from "@/app/actions/assignments";

// ── Constants ─────────────────────────────────────────────────────────────────

const NL_DAYS_SHORT = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

const NL_MONTHS_LONG = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Builds all Date cells for the calendar grid of a given month.
 * Grid start = Monday of week containing the 1st.
 * Grid end = Sunday of week containing the last day.
 * Minimum 5 weeks (35 cells) — pads to 42 if a short month's grid is only 4 weeks.
 */
function buildCalendarDays(monthStr: string): Date[] {
  const [y, m] = monthStr.split("-").map(Number);
  const year   = y!;
  const month  = m! - 1; // 0-indexed

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  // Grid start: Monday of the week containing firstDay
  const gridStart = new Date(firstDay);
  const startDow  = firstDay.getDay(); // 0=Sun…6=Sat
  gridStart.setDate(firstDay.getDate() - (startDow === 0 ? 6 : startDow - 1));

  // Grid end: Sunday of the week containing lastDay
  const gridEnd = new Date(lastDay);
  const endDow  = lastDay.getDay();
  gridEnd.setDate(lastDay.getDate() + (endDow === 0 ? 0 : 7 - endDow));

  // Ensure at least 5 weeks (35 cells) — February starting on Monday can be only 4 weeks
  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;
  if (totalDays < 35) {
    gridEnd.setDate(gridEnd.getDate() + 7);
  }

  const days: Date[] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function addMonths(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const date = new Date(y!, m! - 1, 1);
  date.setMonth(date.getMonth() + delta);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function todayMonthStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}`;
}

function todayDateStr(): string {
  return formatDateKey(new Date());
}

/**
 * Returns the YYYY-MM-DD string of the Monday of the week
 * that contains the 1st of the given month. Used so the
 * Month→Week toggle preserves the period being viewed.
 */
function firstWeekMondayOfMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const firstDay = new Date(y!, m! - 1, 1);
  const dow = firstDay.getDay(); // 0=Sun…6=Sat
  firstDay.setDate(firstDay.getDate() - (dow === 0 ? 6 : dow - 1));
  return formatDateKey(firstDay);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PlanningMonthViewProps {
  monthStr:    string;         // "YYYY-MM"
  assignments: WeekAssignment[];
}

const MAX_CHIPS = 3;

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanningMonthView({ monthStr, assignments }: PlanningMonthViewProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const [year, mon] = monthStr.split("-").map(Number);
  const currentMonth = mon! - 1; // 0-indexed

  const days     = buildCalendarDays(monthStr);
  const todayStr = todayDateStr();
  const thisMonth = todayMonthStr();

  const prevMonth      = addMonths(monthStr, -1);
  const nextMonth      = addMonths(monthStr, +1);
  const weekAnchorStr  = firstWeekMondayOfMonth(monthStr);

  // Build date → assignments map
  const byDate = new Map<string, WeekAssignment[]>();
  for (const a of assignments) {
    const list = byDate.get(a.scheduledDate) ?? [];
    list.push(a);
    byDate.set(a.scheduledDate, list);
  }

  const totalForMonth = assignments.filter((a) => {
    const [ay, am] = a.scheduledDate.split("-").map(Number);
    return ay === year && am! - 1 === currentMonth;
  }).length;

  const monthLabel = `${NL_MONTHS_LONG[currentMonth]} ${year}`;

  return (
    <TooltipProvider>
      <div>
        {/* Navigation bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold" style={{ color: "#081D3A" }}>
              {monthLabel}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "#64748B" }}>
              {totalForMonth === 0
                ? "Geen ingeplande opdrachten deze maand"
                : `${totalForMonth} opdracht${totalForMonth > 1 ? "en" : ""} ingepland`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Month navigation */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.replace(`${pathname}?month=${prevMonth}`)}
            >
              <ChevronLeft className="h-4 w-4" />
              Vorige maand
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.replace(`${pathname}?month=${thisMonth}`)}
            >
              Deze maand
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.replace(`${pathname}?month=${nextMonth}`)}
            >
              Volgende maand
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Separator */}
            <div
              className="hidden sm:block w-px h-6 mx-1"
              style={{ background: "#E2E8F0" }}
            />

            {/* Week / Maand toggle — Week navigates to first week of displayed month */}
            <div
              className="flex rounded-md overflow-hidden"
              style={{ border: "1px solid #E2E8F0" }}
            >
              <button
                type="button"
                onClick={() => router.replace(`${pathname}?week=${weekAnchorStr}`)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{ color: "#64748B", background: "#fff" }}
              >
                Week
              </button>
              <button
                type="button"
                disabled
                className="px-3 py-1.5 text-xs font-medium"
                style={{
                  color:      "#00B7B3",
                  background: "#F0FDFC",
                  borderLeft: "1px solid #E2E8F0",
                  outline:    "none",
                }}
              >
                Maand
              </button>
            </div>
          </div>
        </div>

        {/* Day-of-week header row */}
        <div
          className="grid grid-cols-7 mb-1"
          style={{ borderBottom: "2px solid #E2E8F0", paddingBottom: "6px" }}
        >
          {NL_DAYS_SHORT.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-semibold uppercase tracking-wider"
              style={{ color: "#94A3B8" }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div
          className="grid grid-cols-7"
          style={{ border: "1px solid #E2E8F0", borderRadius: "8px", overflow: "hidden" }}
        >
          {days.map((day, idx) => {
            const dateStr  = formatDateKey(day);
            const isToday  = dateStr === todayStr;
            const inMonth  = day.getMonth() === currentMonth;
            const items    = byDate.get(dateStr) ?? [];
            const overflow = Math.max(0, items.length - MAX_CHIPS);
            const visible  = items.slice(0, MAX_CHIPS);

            const isLastCol = (idx + 1) % 7 === 0;
            const isLastRow = idx >= days.length - 7;

            return (
              <div
                key={dateStr}
                className="relative flex flex-col"
                style={{
                  minHeight:    "96px",
                  padding:      "6px",
                  background:   inMonth ? "#fff" : "#FAFBFC",
                  borderRight:  isLastCol ? "none" : "1px solid #E2E8F0",
                  borderBottom: isLastRow ? "none" : "1px solid #E2E8F0",
                }}
              >
                {/* Day number — click to day view */}
                <Link
                  href={`${pathname}?day=${dateStr}`}
                  className="flex-shrink-0 self-start mb-1.5 group"
                  tabIndex={0}
                >
                  <span
                    className="flex items-center justify-center rounded-full w-6 h-6 text-xs font-semibold transition-colors group-hover:ring-2 group-hover:ring-offset-1 group-hover:ring-slate-300"
                    style={
                      isToday
                        ? { background: "#00B7B3", color: "#fff" }
                        : inMonth
                          ? { color: "#081D3A" }
                          : { color: "#CBD5E1" }
                    }
                  >
                    {day.getDate()}
                  </span>
                </Link>

                {/* Assignment chips — colored left-border using shared statusAccentColor */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  {visible.map((a) => {
                    const accentColor = statusAccentColor(a.status);
                    return (
                      <Tooltip key={a.id}>
                        <TooltipTrigger asChild>
                          <Link
                            href={`/assignments/${a.id}`}
                            className="flex items-center gap-1 rounded px-1 py-0.5 min-w-0 transition-colors hover:bg-slate-100"
                            style={{
                              background:  "#F8FAFC",
                              borderLeft:  `3px solid ${accentColor}`,
                            }}
                          >
                            <span
                              className="text-xs truncate flex-1 min-w-0 leading-snug"
                              style={{ color: inMonth ? "#1E293B" : "#94A3B8" }}
                            >
                              {a.title}
                            </span>
                            {a.hasConflict && (
                              <AlertTriangle
                                className="h-2.5 w-2.5 flex-shrink-0"
                                style={{ color: "#F59E0B" }}
                                aria-label="Conflict"
                              />
                            )}
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[220px]">
                          <p className="font-medium text-xs">{a.title}</p>
                          {a.customerName && (
                            <p className="text-xs opacity-75">{a.customerName}</p>
                          )}
                          {a.hasConflict && (
                            <p className="text-xs text-amber-600 mt-0.5">
                              ⚠ Conflict gedetecteerd
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}

                  {/* "+N meer" overflow → day view */}
                  {overflow > 0 && (
                    <Link
                      href={`${pathname}?day=${dateStr}`}
                      className="text-xs px-1 py-0.5 rounded hover:underline"
                      style={{ color: "#64748B" }}
                    >
                      +{overflow} meer
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
