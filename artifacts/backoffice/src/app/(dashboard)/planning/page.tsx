import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { PlanningView } from "@/components/assignments/PlanningView";
import { PlanningDayView } from "@/components/assignments/PlanningDayView";
import { PlanningMonthView } from "@/components/assignments/PlanningMonthView";
import {
  getAssignmentsForWeek,
  getAssignmentsForMonth,
  getCustomerOptions,
  getDayTimelineData,
} from "@/app/actions/assignments";

export const metadata: Metadata = {
  title: "Planning",
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function getWeekMonday(dateStr?: string): Date {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isValidDate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str + "T00:00:00").getTime());
}

function isValidMonth(str: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(str)) return false;
  const [, m] = str.split("-").map(Number);
  return m! >= 1 && m! <= 12;
}

function currentMonthStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ week?: string; day?: string; month?: string }>;
}

export default async function PlanningPage({ searchParams }: Props) {
  const canRead = await hasPermission("planning", "read");
  if (!canRead) return <ForbiddenPage resource="planning" action="read" />;

  const { week, day, month } = await searchParams;

  const [canWrite, customers] = await Promise.all([
    hasPermission("planning", "write"),
    hasPermission("planning", "write").then((w) => w ? getCustomerOptions() : Promise.resolve([])),
  ]);

  // ── Day view ─────────────────────────────────────────────────────────────
  if (day && isValidDate(day)) {
    const { rows, unassigned } = await getDayTimelineData(day);

    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
            Planning
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Dagoverzicht van ingeplande opdrachten
          </p>
        </div>

        <PlanningDayView
          dateStr={day}
          rows={rows}
          unassigned={unassigned}
          canWrite={canWrite}
          customers={customers}
        />
      </div>
    );
  }

  // ── Month view ────────────────────────────────────────────────────────────
  if (month && isValidMonth(month)) {
    const assignments = await getAssignmentsForMonth(month);

    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
            Planning
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Maandoverzicht van ingeplande opdrachten
          </p>
        </div>

        <PlanningMonthView
          monthStr={month}
          assignments={assignments}
        />
      </div>
    );
  }

  // ── Week view (default) ───────────────────────────────────────────────────
  const weekStart    = getWeekMonday(week);
  const weekEnd      = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekStartStr = formatDateKey(weekStart);
  const weekEndStr   = formatDateKey(weekEnd);

  const assignments = await getAssignmentsForWeek(weekStartStr, weekEndStr);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>
          Planning
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Weekoverzicht van ingeplande opdrachten
        </p>
      </div>

      <PlanningView
        weekStartStr={weekStartStr}
        assignments={assignments}
        canWrite={canWrite}
        customers={customers}
        currentMonthStr={currentMonthStr()}
      />
    </div>
  );
}
