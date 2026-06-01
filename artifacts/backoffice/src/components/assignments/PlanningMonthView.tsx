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
import type { WeekAssignment } from "@/app/actions/assignments";

// ── Constants ─────────────────────────────────────────────────────────────────

const NL_DAYS_SHORT = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

const NL_MONTHS_LONG = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];

// Status color dots (left-border accent on chips)
const STATUS_COLOR: Record<string, string> = {
  requested:         "#3B82F6",
  review:            "#6366F1",
  quote_preparation: "#8B5CF6",
  awaiting_approval: "#B45309",
  approved:          "#10B981",
  plannable:         "#EA580C",
  scheduled:         "#00B7B3",
  seen:              "#0891B2",
  in_progress:       "#7C3AED",
  not_completed:     "#DC2626",
  completed:         "#16A34A",
  report_submitted:  "#0D9488",
  report_approved:   "#15803D",
  invoice_ready:     "#D97706",
  invoiced:          "#64748B",
  paid:              "#166534",
  closed:            "#94A3B8",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildCalendarDays(monthStr: string): Date[] {
  const [y, m] = monthStr.split("-").map(Number);
  const year  = y!;
  const month = m! - 1; // 0-indexed

  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month + 1, 0);

  // Grid start: Monday of week containing firstDay
  const gridStart  = new Date(firstDay);
  const startDow   = firstDay.getDay();
  gridStart.setDate(firstDay.getDate() - (startDow === 0 ? 6 : startDow - 1));

  // Grid end: Sunday of week containing lastDay
  const gridEnd  = new Date(lastDay);
  const endDow   = lastDay.getDay();
  gridEnd.setDate(lastDay.getDate() + (endDow === 0 ? 0 : 7 - endDow));

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
  const n = new Date();
  return formatDateKey(n);
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

  const days      = buildCalendarDays(monthStr);
  const todayStr  = todayDateStr();
  const thisMonth = todayMonthStr();

  const prevMonth = addMonths(monthStr, -1);
  const nextMonth = addMonths(monthStr, +1);

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

  // Week of today → used for "Week" toggle destination
  function todayWeekMonday(): string {
    const d   = new Date();
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return formatDateKey(d);
  }

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

            {/* Week / Maand toggle */}
            <div
              className="flex rounded-md overflow-hidden"
              style={{ border: "1px solid #E2E8F0" }}
            >
              <button
                type="button"
                onClick={() => router.replace(`${pathname}?week=${todayWeekMonday()}`)}
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
            const dateStr    = formatDateKey(day);
            const isToday    = dateStr === todayStr;
            const inMonth    = day.getMonth() === currentMonth;
            const items      = byDate.get(dateStr) ?? [];
            const overflow   = Math.max(0, items.length - MAX_CHIPS);
            const visible    = items.slice(0, MAX_CHIPS);

            // Border logic: right border on all except last column; bottom on all except last row
            const isLastCol  = (idx + 1) % 7 === 0;
            const isLastRow  = idx >= days.length - 7;

            return (
              <div
                key={dateStr}
                className="relative flex flex-col"
                style={{
                  minHeight:   "100px",
                  padding:     "6px",
                  background:  inMonth ? "#fff" : "#FAFBFC",
                  borderRight: isLastCol ? "none" : "1px solid #E2E8F0",
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
                    className="flex items-center justify-center rounded-full w-6 h-6 text-xs font-semibold transition-colors group-hover:ring-2 group-hover:ring-offset-1"
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

                {/* Assignment chips */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  {visible.map((a) => {
                    const dotColor = STATUS_COLOR[a.status] ?? "#94A3B8";
                    return (
                      <Tooltip key={a.id}>
                        <TooltipTrigger asChild>
                          <Link
                            href={`/assignments/${a.id}`}
                            className="flex items-center gap-1 rounded px-1 py-0.5 min-w-0 group"
                            style={{
                              background:  "#F8FAFC",
                              borderLeft:  `3px solid ${dotColor}`,
                              transition:  "background 0.1s",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background = "#F1F5F9";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = "#F8FAFC";
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

                  {/* "+N meer" overflow */}
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
