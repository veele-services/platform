import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { PlanningView } from "@/components/assignments/PlanningView";
import { getAssignmentsForWeek } from "@/app/actions/assignments";

export const metadata: Metadata = {
  title: "Planning",
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function getWeekMonday(dateStr?: string): Date {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const day = d.getDay(); // 0 = Sun, 1 = Mon, …
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

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function PlanningPage({ searchParams }: Props) {
  const canRead = await hasPermission("planning", "read");
  if (!canRead) return <ForbiddenPage resource="planning" action="read" />;

  const { week } = await searchParams;

  const weekStart    = getWeekMonday(week);
  const weekEnd      = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weekStartStr = formatDateKey(weekStart);
  const weekEndStr   = formatDateKey(weekEnd);

  const [assignments, canWrite] = await Promise.all([
    getAssignmentsForWeek(weekStartStr, weekEndStr),
    hasPermission("planning", "write"),
  ]);

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
      />
    </div>
  );
}
