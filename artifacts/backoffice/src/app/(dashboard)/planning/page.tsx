import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, LayoutGrid, ListChecks } from "lucide-react";

import {
  getAssignmentsForMonth,
  getCustomerOptions,
  getDayTimelineData,
} from "@/app/actions/assignments";
import { getPlanningBoardData, type PlanningBoardFilters } from "@/app/actions/planning";
import { PlanningBoardView } from "@/components/assignments/PlanningBoardView";
import { PlanningDayView } from "@/components/assignments/PlanningDayView";
import { PlanningMonthView } from "@/components/assignments/PlanningMonthView";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { ResolvedFeatureHelp } from "@/components/knowledgebase/ResolvedFeatureHelp";
import { Button } from "@/components/ui/button";
import {
  TenantConflictStrip,
  TenantPageHeader,
  TenantPageShell,
  TenantWorkbenchPanel,
} from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Planning",
};

function isValidDate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !Number.isNaN(new Date(`${str}T00:00:00`).getTime());
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

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}-01T00:00:00`));
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
    hasPermission("planning", "write").then((w) => (w ? getCustomerOptions() : Promise.resolve([]))),
  ]);

  if (day && isValidDate(day)) {
    const { rows, unassigned } = await getDayTimelineData(day);
    const plannedCount = rows.reduce((total, row) => total + row.assignments.length, 0);
    const conflictCount =
      rows.reduce((total, row) => total + row.assignments.filter((assignment) => assignment.hasConflict).length, 0) +
      unassigned.filter((assignment) => assignment.hasConflict).length;

    return (
      <TenantPageShell size="wide" className="max-w-[1800px]">
        <PlanningHeader
          mode="day"
          title="Dagplanning"
          description="Sleep werkbonnen naar een tijdslot, bewaak conflicten en stuur de dagplanning vanuit een rustige workbench."
          currentLabel={formatDate(day)}
          date={day}
          helpSlot={<ResolvedFeatureHelp featureKey="tenant.planning" moduleKey="planning" />}
        />
        <TenantConflictStrip
          items={[
            { label: "Ingepland", value: plannedCount, description: "werkbonnen op de tijdlijn", tone: "success" },
            { label: "Ongepland", value: unassigned.length, description: "werkbonnen zonder medewerker", tone: unassigned.length > 0 ? "warning" : "neutral" },
            { label: "Conflicten", value: conflictCount, description: conflictCount > 0 ? "actie nodig" : "geen blokkades", tone: conflictCount > 0 ? "danger" : "success" },
            { label: "Medewerkers", value: rows.length, description: "zichtbaar in deze dag", tone: "info" },
          ]}
        />
        <TenantWorkbenchPanel className="border-0 bg-transparent shadow-none">
          <PlanningDayView dateStr={day} rows={rows} unassigned={unassigned} canWrite={canWrite} customers={customers} />
        </TenantWorkbenchPanel>
      </TenantPageShell>
    );
  }

  if (month && isValidMonth(month)) {
    const assignments = await getAssignmentsForMonth(month);
    const conflictCount = assignments.filter((assignment) => assignment.hasConflict).length;
    const activeDays = new Set(assignments.map((assignment) => assignment.scheduledDate)).size;

    return (
      <TenantPageShell size="wide" className="max-w-[1800px]">
        <PlanningHeader
          mode="month"
          title="Maandplanning"
          description="Gebruik de maandweergave om bezetting, drukte en conflicten per dag snel te scannen."
          currentLabel={formatMonth(month)}
          date={`${month}-01`}
          helpSlot={<ResolvedFeatureHelp featureKey="tenant.planning" moduleKey="planning" />}
        />
        <TenantConflictStrip
          items={[
            { label: "Werkbonnen", value: assignments.length, description: "in deze maand", tone: "info" },
            { label: "Actieve dagen", value: activeDays, description: "dagen met planning", tone: "neutral" },
            { label: "Conflicten", value: conflictCount, description: conflictCount > 0 ? "controle nodig" : "geen blokkades", tone: conflictCount > 0 ? "danger" : "success" },
            { label: "Vandaag", value: new Date().getDate(), description: "snel terug naar actuele dag", tone: "success", href: `/planning?day=${todayKey()}` },
          ]}
        />
        <TenantWorkbenchPanel className="border-0 bg-transparent shadow-none">
          <PlanningMonthView monthStr={month} assignments={assignments} />
        </TenantWorkbenchPanel>
      </TenantPageShell>
    );
  }

  const boardDate = date && isValidDate(date) ? date : week && isValidDate(week) ? week : undefined;
  const boardData = await getPlanningBoardData({
    date: boardDate,
    search,
    customerId,
    sectorId,
    region,
    priority: priority as PlanningBoardFilters["priority"],
    statuses: status ? [status as NonNullable<PlanningBoardFilters["statuses"]>[number]] : undefined,
  });
  const conflictCount = boardData.scheduledAssignments.filter((assignment) => assignment.hasConflict).length;
  const openSlotCount = boardData.openAssignments.reduce(
    (total, assignment) => total + Math.max(0, assignment.requiredSlots - assignment.filledSlots),
    0,
  );
  const availablePersonnelCount = boardData.personnel.filter(
    (person) => person.availabilityStatus === "beschikbaar",
  ).length;

  return (
    <TenantPageShell size="wide" className="max-w-[1800px]">
      <PlanningHeader
        mode="board"
        title="Planning workbench"
        description="Plan open werkbonnen met drag-and-drop, matchscores, detaildrawer en conflictbewaking."
        currentLabel={formatDate(boardData.date)}
        date={boardData.date}
        helpSlot={<ResolvedFeatureHelp featureKey="tenant.planning" moduleKey="planning" />}
      />
      <TenantConflictStrip
        items={[
          { label: "Open plaatsen", value: openSlotCount, description: `${boardData.openAssignments.length} werkbonnen`, tone: openSlotCount > 0 ? "warning" : "success" },
          { label: "Ingepland", value: boardData.scheduledAssignments.length, description: "werkbonnen op het bord", tone: "info" },
          { label: "Beschikbaar", value: `${availablePersonnelCount}/${boardData.personnel.length}`, description: "medewerkers vandaag", tone: "success" },
          { label: "Conflicten", value: conflictCount, description: conflictCount > 0 ? "actie nodig" : "geen blokkades", tone: conflictCount > 0 ? "danger" : "success" },
        ]}
      />
      <TenantWorkbenchPanel className="border-0 bg-transparent shadow-none">
        <PlanningBoardView data={boardData} canWrite={canWrite} />
      </TenantWorkbenchPanel>
    </TenantPageShell>
  );
}

function PlanningHeader({
  mode,
  title,
  description,
  currentLabel,
  date,
  helpSlot,
}: {
  mode: "board" | "day" | "month";
  title: string;
  description: string;
  currentLabel: string;
  date: string;
  helpSlot?: ReactNode;
}) {
  return (
    <TenantPageHeader
      title={title}
      description={description}
      eyebrow="Tenant planning"
      badges={helpSlot}
      meta={
        <span className="inline-flex items-center gap-1.5 capitalize">
          <CalendarDays className="h-3.5 w-3.5" />
          {currentLabel}
        </span>
      }
      actions={
        <>
          <Button variant={mode === "board" ? "default" : "outline"} size="sm" asChild>
            <Link href={`/planning?date=${date}`}>
              <LayoutGrid className="h-4 w-4" />
              Bord
            </Link>
          </Button>
          <Button variant={mode === "day" ? "default" : "outline"} size="sm" asChild>
            <Link href={`/planning?day=${date}`}>
              <ListChecks className="h-4 w-4" />
              Dag
            </Link>
          </Button>
          <Button variant={mode === "month" ? "default" : "outline"} size="sm" asChild>
            <Link href={`/planning?month=${date.slice(0, 7)}`}>
              <CalendarDays className="h-4 w-4" />
              Maand
            </Link>
          </Button>
        </>
      }
    />
  );
}
