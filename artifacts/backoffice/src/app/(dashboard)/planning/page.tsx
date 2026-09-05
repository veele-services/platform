import type { Metadata } from "next";

import {
  getAssignmentsForMonth,
  getCustomerOptions,
  getDayTimelineData,
} from "@/app/actions/assignments";
import {
  getPlanningBoardData,
  getPlanningDayMapData,
  type PlanningBoardFilters,
} from "@/app/actions/planning";
import { PlanningBoardView } from "@/components/assignments/PlanningBoardView";
import { PlanningDayView } from "@/components/assignments/PlanningDayView";
import { PlanningMapView } from "@/components/assignments/PlanningMapView";
import { PlanningMonthView } from "@/components/assignments/PlanningMonthView";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { TenantPageShell, TenantWorkbenchPanel } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";
import { getGoogleMapsClientBootstrapConfig } from "@/lib/google-maps/config";
import { isPlanningDayMapEnabled } from "@/lib/planning/day-map-feature";

export const metadata: Metadata = {
  title: "Planning",
};

function isValidDate(str: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(str) &&
    !Number.isNaN(new Date(`${str}T00:00:00`).getTime())
  );
}

function isValidMonth(str: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(str)) return false;
  const [, month] = str.split("-").map(Number);
  return month! >= 1 && month! <= 12;
}

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function todayKey(): string {
  return dateKey(new Date());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

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
    view?: string;
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
    view,
  } = await searchParams;
  const mapEnabled = isPlanningDayMapEnabled();

  const [canWrite, canCreateAssignment] = await Promise.all([
    hasPermission("planning", "write"),
    hasPermission("assignments", "write"),
  ]);
  const customers = canCreateAssignment ? await getCustomerOptions() : [];

  if (day && isValidDate(day)) {
    const { rows, unassigned } = await getDayTimelineData(day);

    return (
      <TenantPageShell size="wide" className="max-w-[1800px]">
        <TenantWorkbenchPanel className="border-0 bg-transparent shadow-none">
          <PlanningDayView
            dateStr={day}
            rows={rows}
            unassigned={unassigned}
            canWrite={canWrite}
            canCreateAssignment={canCreateAssignment}
            customers={customers}
          />
        </TenantWorkbenchPanel>
      </TenantPageShell>
    );
  }

  if (month && isValidMonth(month)) {
    const assignments = await getAssignmentsForMonth(month);

    return (
      <TenantPageShell size="wide" className="max-w-[1800px]">
        <TenantWorkbenchPanel className="border-0 bg-transparent shadow-none">
          <PlanningMonthView monthStr={month} assignments={assignments} />
        </TenantWorkbenchPanel>
      </TenantPageShell>
    );
  }

  const boardDate =
    date && isValidDate(date)
      ? date
      : week && isValidDate(week)
        ? week
        : undefined;
  if (mapEnabled && view === "map") {
    const mapDate = boardDate ?? todayKey();
    const googleMapsConfig = getGoogleMapsClientBootstrapConfig();
    const mapData = await getPlanningDayMapData({
      date: mapDate,
      region: region === "all" ? null : region,
      status: status as NonNullable<PlanningBoardFilters["statuses"]>[number],
    });

    return (
      <TenantPageShell size="wide" className="max-w-[1800px]">
        <TenantWorkbenchPanel className="border-0 bg-transparent shadow-none">
          <PlanningMapView
            data={mapData}
            googleMapsConfig={googleMapsConfig}
            canApplySuggestions={canWrite}
            dateLabel={formatDate(mapData.date)}
          />
        </TenantWorkbenchPanel>
      </TenantPageShell>
    );
  }

  const boardData = await getPlanningBoardData({
    date: boardDate,
    search,
    customerId,
    sectorId,
    region,
    priority: priority as PlanningBoardFilters["priority"],
    statuses: status
      ? [status as NonNullable<PlanningBoardFilters["statuses"]>[number]]
      : undefined,
  });

  return (
    <TenantPageShell size="wide" className="max-w-[1800px]">
      <TenantWorkbenchPanel className="border-0 bg-transparent shadow-none">
        <PlanningBoardView
          data={boardData}
          canWrite={canWrite}
          mapEnabled={mapEnabled}
        />
      </TenantWorkbenchPanel>
    </TenantPageShell>
  );
}
