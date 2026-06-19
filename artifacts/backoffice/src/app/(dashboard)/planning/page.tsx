import type { Metadata } from "next";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { PlanningBoardView } from "@/components/assignments/PlanningBoardView";
import { PlanningDayView } from "@/components/assignments/PlanningDayView";
import { PlanningMonthView } from "@/components/assignments/PlanningMonthView";
import {
  getAssignmentsForMonth,
  getCustomerOptions,
  getDayTimelineData,
} from "@/app/actions/assignments";
import { getPlanningBoardData, type PlanningBoardFilters } from "@/app/actions/planning";

export const metadata: Metadata = {
  title: "Planning",
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function isValidDate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str + "T00:00:00").getTime());
}

function isValidMonth(str: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(str)) return false;
  const [, m] = str.split("-").map(Number);
  return m! >= 1 && m! <= 12;
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{
    week?: string;
    day?: string;
    month?: string;
    date?: string;
    search?: string;
    customerId?: string;
    sectorId?: string;
    region?: string;
    priority?: string;
    status?: string;
  }>;
}

export default async function PlanningPage({ searchParams }: Props) {
  const canRead = await hasPermission("planning", "read");
  if (!canRead) return <ForbiddenPage resource="planning" action="read" />;

  const {
    week,
    day,
    month,
    date,
    search,
    customerId,
    sectorId,
    region,
    priority,
    status,
  } = await searchParams;

  const [canWrite, customers] = await Promise.all([
    hasPermission("planning", "write"),
    hasPermission("planning", "write").then((w) => w ? getCustomerOptions() : Promise.resolve([])),
  ]);

  // ── Day view ─────────────────────────────────────────────────────────────
  if (day && isValidDate(day)) {
    const { rows, unassigned } = await getDayTimelineData(day);

    return (
      <div className="mx-auto w-full max-w-[1600px] p-6">
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
      <div className="mx-auto w-full max-w-[1600px] p-6">
        <PlanningMonthView
          monthStr={month}
          assignments={assignments}
        />
      </div>
    );
  }

  // ── Planning board (default) ──────────────────────────────────────────────
  const boardDate = date && isValidDate(date)
    ? date
    : week && isValidDate(week)
      ? week
      : undefined;
  const boardData = await getPlanningBoardData({
    date: boardDate,
    search,
    customerId,
    sectorId,
    region,
    priority: priority as PlanningBoardFilters["priority"],
    statuses: status ? [status as NonNullable<PlanningBoardFilters["statuses"]>[number]] : undefined,
  });

  return (
    <div className="mx-auto w-full max-w-[1800px] p-6">
      <PlanningBoardView
        data={boardData}
        canWrite={canWrite}
      />
    </div>
  );
}
