"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  GripVertical,
  Loader2,
  MapPin,
  Search,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AssignmentPriorityBadge,
  AssignmentStatusBadge,
  priorityLabel,
  statusLabel,
} from "./AssignmentStatusBadge";
import {
  scheduleAssignmentOnBoard,
  type PlanningBoardAssignment,
  type PlanningBoardData,
  type PlanningBoardMatch,
  type PlanningBoardPersonnel,
  type PlanningBoardPersonnelAssignment,
} from "@/app/actions/planning";

const DAY_START_MIN = 7 * 60;
const DAY_END_MIN = 20 * 60;
const DAY_SPAN = DAY_END_MIN - DAY_START_MIN;
const PERSONNEL_COL_WIDTH = 230;

const NL_MONTHS = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

const NL_WEEKDAYS = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
];

const HOUR_LABELS = Array.from({ length: 14 }, (_, i) => {
  const hour = 7 + i;
  return {
    label: `${hour}:00`,
    pct: ((hour * 60 - DAY_START_MIN) / DAY_SPAN) * 100,
  };
});

const START_OPTIONS = Array.from({ length: 25 }, (_, i) => {
  const minutes = DAY_START_MIN + i * 30;
  return minutesToTime(minutes);
});

type Pastel = {
  bg: string;
  border: string;
  text: string;
  rail: string;
};

const APPOINTMENT_PASTELS: Pastel[] = [
  { bg: "#E8F4FF", border: "#93C5FD", text: "#0F3A5F", rail: "#3B82F6" },
  { bg: "#EAF8F1", border: "#86D9AE", text: "#14523C", rail: "#22C55E" },
  { bg: "#FFF1E7", border: "#FDBA8C", text: "#7A3517", rail: "#F97316" },
  { bg: "#F2EEFF", border: "#C4B5FD", text: "#3F2D75", rail: "#8B5CF6" },
  { bg: "#FFEAF0", border: "#FDA4AF", text: "#7F1D1D", rail: "#F43F5E" },
  { bg: "#FFF7D6", border: "#FCD34D", text: "#6B4E00", rail: "#EAB308" },
  { bg: "#E2FAF8", border: "#8CE7E2", text: "#075E5D", rail: "#00B7B3" },
  { bg: "#EFF6F1", border: "#B7D3C3", text: "#264D3C", rail: "#16A34A" },
];

type DragState = {
  assignmentId: string;
  duration: number;
  sourcePersonnelId?: string | null;
};

type GhostInfo = {
  rowId: string;
  leftPct: number;
  widthPct: number;
  label: string;
};

type PlanningBoardViewProps = {
  data: PlanningBoardData;
  canWrite: boolean;
};

function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function dateKey(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function todayDateKey(): string {
  return dateKey(new Date());
}

function formatBoardDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${NL_WEEKDAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function parseTimeMin(value: string | null): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (typeof h !== "number" || typeof m !== "number") return null;
  return h * 60 + m;
}

function minutesToTime(value: number): string {
  const h = Math.floor(value / 60);
  const m = value % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeBlock(
  start: string | null,
  end: string | null,
): { left: number; width: number } | null {
  const s = parseTimeMin(start);
  const e = parseTimeMin(end);
  if (s === null) return null;

  const clampedStart = Math.max(s, DAY_START_MIN);
  const clampedEnd = Math.min(e ?? s + 60, DAY_END_MIN);
  if (clampedStart >= clampedEnd) return null;

  return {
    left: ((clampedStart - DAY_START_MIN) / DAY_SPAN) * 100,
    width: ((clampedEnd - clampedStart) / DAY_SPAN) * 100,
  };
}

function calcDropSlot(
  e: React.DragEvent<HTMLDivElement>,
  durationMin: number,
): { start: string; end: string; leftPct: number; widthPct: number; label: string } {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const rawStart = DAY_START_MIN + (x / rect.width) * DAY_SPAN;
  const snapped = Math.round(rawStart / 15) * 15;
  const duration = Math.max(15, Math.min(8 * 60, durationMin));
  const startMin = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - duration, snapped));
  const endMin = startMin + duration;
  const start = minutesToTime(startMin);
  const end = minutesToTime(endMin);

  return {
    start,
    end,
    leftPct: ((startMin - DAY_START_MIN) / DAY_SPAN) * 100,
    widthPct: ((endMin - startMin) / DAY_SPAN) * 100,
    label: `${start}-${end}`,
  };
}

function durationForAssignment(assignment: PlanningBoardAssignment): number {
  return Math.max(30, assignment.requirements.estimatedDurationMinutes || 60);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pastelForAppointment(assignment: Pick<PlanningBoardPersonnelAssignment, "id" | "priority">): Pastel {
  if (assignment.priority === "urgent") return APPOINTMENT_PASTELS[4]!;
  if (assignment.priority === "high") return APPOINTMENT_PASTELS[2]!;
  if (assignment.priority === "low") return APPOINTMENT_PASTELS[7]!;
  return APPOINTMENT_PASTELS[hashString(assignment.id) % APPOINTMENT_PASTELS.length]!;
}

function isPlanboardMovableStatus(status: string): boolean {
  return status === "plannable" || status === "scheduled";
}

function matchStats(matches: PlanningBoardMatch[] | undefined): {
  match: number;
  warning: number;
  blocked: number;
} {
  const stats = { match: 0, warning: 0, blocked: 0 };
  for (const match of matches ?? []) {
    stats[match.level] += 1;
  }
  return stats;
}

function matchConfig(match: PlanningBoardMatch | undefined): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  if (!match) {
    return { label: "Geen matchdata", bg: "#F8FAFC", text: "#64748B", border: "#E2E8F0" };
  }
  if (match.level === "match") {
    return { label: "Match", bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" };
  }
  if (match.level === "warning") {
    return { label: "Waarschuwing", bg: "#FFFBEB", text: "#B45309", border: "#FCD34D" };
  }
  return { label: "Blokkeert", bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" };
}

function availabilityConfig(status: string): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  if (status === "beschikbaar") {
    return { label: "Beschikbaar", bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" };
  }
  if (status === "niet_ingesteld") {
    return { label: "Onbekend", bg: "#FFFBEB", text: "#B45309", border: "#FCD34D" };
  }
  if (status === "op_verlof") {
    return { label: "Verlof", bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" };
  }
  if (status === "ziek") {
    return { label: "Ziek", bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" };
  }
  return { label: "Niet beschikbaar", bg: "#F8FAFC", text: "#64748B", border: "#E2E8F0" };
}

function compactTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Geen tijd";
  if (start && end) return `${start}-${end}`;
  return start ?? end ?? "";
}

function slotLabel(filledSlots: number, requiredSlots: number): string {
  return `${filledSlots}/${requiredSlots}`;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium" style={{ color: "#64748B" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="veele-input h-9 min-w-[150px] py-1 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PlanningBoardView({ data, canWrite }: PlanningBoardViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dragRef = useRef<DragState | null>(null);

  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const [manualStart, setManualStart] = useState("08:00");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [ghostInfo, setGhostInfo] = useState<GhostInfo | null>(null);
  const [isPending, startTransition] = useTransition();

  const assignmentById = useMemo(() => {
    return new Map(
      [...data.openAssignments, ...data.scheduledAssignments].map((assignment) => [
        assignment.id,
        assignment,
      ]),
    );
  }, [data.openAssignments, data.scheduledAssignments]);

  const activeAssignmentId = dragging?.assignmentId ?? selectedAssignmentId;
  const activeAssignment = activeAssignmentId ? assignmentById.get(activeAssignmentId) : null;
  const conflictCount = data.scheduledAssignments.filter((assignment) => assignment.hasConflict).length;
  const openSlotCount = data.openAssignments.reduce(
    (total, assignment) => total + Math.max(0, assignment.requiredSlots - assignment.filledSlots),
    0,
  );
  const today = todayDateKey();
  const isToday = data.date === today;

  function updateQuery(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("week");
    params.delete("day");
    params.delete("month");

    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function resetFilters() {
    setSearchValue("");
    router.replace(`${pathname}?date=${data.date}`);
  }

  function getMatch(assignmentId: string | null | undefined, personnelId: string): PlanningBoardMatch | undefined {
    if (!assignmentId) return undefined;
    return data.matchesByAssignmentId[assignmentId]?.find((match) => match.personnelId === personnelId);
  }

  function isAlreadyAssigned(assignmentId: string | null | undefined, personnelId: string): boolean {
    if (!assignmentId) return false;
    return assignmentById.get(assignmentId)?.assignedPersonnelIds.includes(personnelId) ?? false;
  }

  function handleDragStart(e: React.DragEvent, assignment: PlanningBoardAssignment) {
    if (!canWrite) return;
    const next = {
      assignmentId: assignment.id,
      duration: durationForAssignment(assignment),
      sourcePersonnelId: null,
    };
    dragRef.current = next;
    setDragging(next);
    setSelectedAssignmentId(assignment.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", assignment.id);
  }

  function handleScheduledDragStart(
    e: React.DragEvent,
    assignment: PlanningBoardPersonnelAssignment,
    sourcePersonnelId: string,
  ) {
    if (!canWrite) return;
    const next = {
      assignmentId: assignment.id,
      duration: Math.max(30, assignment.estimatedDurationMinutes || 60),
      sourcePersonnelId,
    };
    dragRef.current = next;
    setDragging(next);
    setSelectedAssignmentId(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", assignment.id);
  }

  function handleDragEnd() {
    dragRef.current = null;
    setDragging(null);
    setGhostInfo(null);
  }

  function handleTimelineDragOver(e: React.DragEvent<HTMLDivElement>, person: PlanningBoardPersonnel) {
    const current = dragging ?? dragRef.current;
    if (!current) return;
    const match = getMatch(current.assignmentId, person.id);
    const alreadyAssigned = isAlreadyAssigned(current.assignmentId, person.id);
    if (
      match?.level === "blocked" ||
      (alreadyAssigned && current.sourcePersonnelId !== person.id)
    ) {
      e.dataTransfer.dropEffect = "none";
      setGhostInfo(null);
      return;
    }

    e.preventDefault();
    e.dataTransfer.dropEffect = match?.level === "warning" ? "copy" : "move";
    const slot = calcDropSlot(e, current.duration);
    setGhostInfo({
      rowId: person.id,
      leftPct: slot.leftPct,
      widthPct: slot.widthPct,
      label: slot.label,
    });
  }

  function handleTimelineDrop(e: React.DragEvent<HTMLDivElement>, person: PlanningBoardPersonnel) {
    e.preventDefault();
    const current = dragging ?? dragRef.current;
    const assignmentId = e.dataTransfer.getData("text/plain") || current?.assignmentId;
    setGhostInfo(null);
    setDragging(null);
    dragRef.current = null;

    if (!current || !assignmentId) return;
    const match = getMatch(assignmentId, person.id);
    const alreadyAssigned = isAlreadyAssigned(assignmentId, person.id);
    if (alreadyAssigned && current.sourcePersonnelId !== person.id) {
      toast.error("Deze medewerker is al gekoppeld aan deze werkbon.");
      return;
    }
    if (match?.level === "blocked") {
      toast.error(`Niet inplanbaar: ${match.reasons.filter((reason) => reason.severity === "block").map((reason) => reason.label).join("; ")}`);
      return;
    }

    const slot = calcDropSlot(e, current.duration);
    scheduleOnBoard(assignmentId, person.id, slot.start, slot.end, current.sourcePersonnelId);
  }

  function scheduleSelected(person: PlanningBoardPersonnel) {
    if (!activeAssignment) return;
    const match = getMatch(activeAssignment.id, person.id);
    if (isAlreadyAssigned(activeAssignment.id, person.id)) {
      toast.error("Deze medewerker is al gekoppeld aan deze werkbon.");
      return;
    }
    if (match?.level === "blocked") {
      toast.error(`Niet inplanbaar: ${match.reasons.filter((reason) => reason.severity === "block").map((reason) => reason.label).join("; ")}`);
      return;
    }
    const startMin = parseTimeMin(manualStart) ?? 8 * 60;
    const end = minutesToTime(Math.min(DAY_END_MIN, startMin + durationForAssignment(activeAssignment)));
    scheduleOnBoard(activeAssignment.id, person.id, manualStart, end);
  }

  function scheduleOnBoard(
    assignmentId: string,
    personnelId: string,
    start: string,
    end: string,
    sourcePersonnelId?: string | null,
  ) {
    startTransition(async () => {
      const result = await scheduleAssignmentOnBoard({
        assignmentId,
        personnelId,
        sourcePersonnelId,
        date: data.date,
        start,
        end,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      const warnings = result.data?.warnings ?? [];
      if (warnings.length > 0) {
        toast.warning(`Ingepland met waarschuwing: ${warnings.map((warning) => warning.label).join("; ")}`);
      } else {
        toast.success(sourcePersonnelId ? "Afspraak verplaatst." : "Werkbon ingepland.");
      }

      setSelectedAssignmentId(null);
      router.refresh();
    });
  }

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    updateQuery({ search: searchValue.trim() || null });
  }

  const selectedCustomer = searchParams.get("customerId") ?? "all";
  const selectedSector = searchParams.get("sectorId") ?? "all";
  const selectedRegion = searchParams.get("region") ?? "all";
  const selectedPriority = searchParams.get("priority") ?? "all";
  const selectedStatus = searchParams.get("status") ?? "all";

  return (
    <TooltipProvider delayDuration={180}>
      <div className="space-y-4">
        <section className="rounded-lg border bg-white shadow-sm" style={{ borderColor: "#E2E8F0" }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg"
                style={isToday ? { background: "#00B7B3", color: "#fff" } : { background: "#F1F5F9", color: "#081D3A" }}
              >
                <CalendarDays className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-semibold capitalize" style={{ color: "#081D3A" }}>
                  {formatBoardDate(data.date)}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "#64748B" }}>
                  <span>{openSlotCount} open plaats{openSlotCount === 1 ? "" : "en"}</span>
                  <span>{data.scheduledAssignments.length} ingepland</span>
                  <span>{data.personnel.length} medewerkers</span>
                  {conflictCount > 0 && (
                    <span className="inline-flex items-center gap-1" style={{ color: "#B45309" }}>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {conflictCount} conflict{conflictCount > 1 ? "en" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => updateQuery({ date: addDaysLocal(data.date, -1) })}>
                <ChevronLeft className="h-4 w-4" />
                Vorige
              </Button>
              <Button variant="outline" size="sm" onClick={() => updateQuery({ date: today })}>
                Vandaag
              </Button>
              <Button variant="outline" size="sm" onClick={() => updateQuery({ date: addDaysLocal(data.date, 1) })}>
                Volgende
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/planning?day=${data.date}`}>Dag</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/planning?month=${data.date.slice(0, 7)}`}>Maand</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(260px,1fr),auto]">
            <form onSubmit={submitSearch} className="flex min-w-0 items-end gap-2">
              <label className="grid min-w-[220px] flex-1 gap-1 text-xs font-medium" style={{ color: "#64748B" }}>
                Zoeken
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#94A3B8" }} />
                  <Input
                    type="search"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    className="pl-9"
                    placeholder="Werkbon, klant of object"
                  />
                </div>
              </label>
              <Button type="submit" size="sm" variant="outline" aria-label="Zoeken">
                <Search className="h-4 w-4" />
              </Button>
            </form>

            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs font-medium" style={{ color: "#64748B" }}>
                Datum
                <Input
                  type="date"
                  value={data.date}
                  onChange={(e) => updateQuery({ date: e.target.value })}
                  className="w-[150px]"
                />
              </label>
              <FilterSelect
                label="Klant"
                value={selectedCustomer}
                onChange={(value) => updateQuery({ customerId: value })}
                options={[
                  { value: "all", label: "Alle klanten" },
                  ...data.filterOptions.customers.map((customer) => ({ value: customer.id, label: customer.name })),
                ]}
              />
              <FilterSelect
                label="Sector"
                value={selectedSector}
                onChange={(value) => updateQuery({ sectorId: value })}
                options={[
                  { value: "all", label: "Alle sectoren" },
                  ...data.filterOptions.sectors.map((sector) => ({ value: sector.id, label: sector.name })),
                ]}
              />
              <FilterSelect
                label="Regio"
                value={selectedRegion}
                onChange={(value) => updateQuery({ region: value })}
                options={[
                  { value: "all", label: "Alle regio's" },
                  ...data.filterOptions.regions.map((region) => ({ value: region, label: region })),
                ]}
              />
              <FilterSelect
                label="Prioriteit"
                value={selectedPriority}
                onChange={(value) => updateQuery({ priority: value })}
                options={[
                  { value: "all", label: "Alle prioriteiten" },
                  ...data.filterOptions.priorities.map((priority) => ({ value: priority, label: priorityLabel(priority) })),
                ]}
              />
              <FilterSelect
                label="Status"
                value={selectedStatus}
                onChange={(value) => updateQuery({ status: value })}
                options={[
                  { value: "all", label: "Alle statussen" },
                  ...data.filterOptions.statuses.map((status) => ({ value: status, label: statusLabel(status) })),
                ]}
              />
              <Button variant="outline" size="sm" onClick={resetFilters}>
                <X className="h-4 w-4" />
                Wis
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[360px,minmax(760px,1fr)]">
          <section className="rounded-lg border bg-white shadow-sm" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
              <div>
                <h3 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
                  Open werkbonnen
                </h3>
                <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
                  {openSlotCount} plaats{openSlotCount === 1 ? "" : "en"} te plaatsen
                </p>
              </div>
              <Filter className="h-4 w-4" style={{ color: "#94A3B8" }} />
            </div>

            {data.openAssignments.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
                <CheckCircle2 className="mb-3 h-9 w-9" style={{ color: "#CBD5E1" }} />
                <p className="text-sm font-medium" style={{ color: "#64748B" }}>
                  Geen open werkbonnen
                </p>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-320px)] min-h-[420px] space-y-3 overflow-y-auto p-3">
                {data.openAssignments.map((assignment) => {
                  const selected = selectedAssignmentId === assignment.id;
                  const stats = matchStats(data.matchesByAssignmentId[assignment.id]);
                  const duration = durationForAssignment(assignment);

                  return (
                    <article
                      key={assignment.id}
                      draggable={canWrite}
                      onDragStart={(e) => handleDragStart(e, assignment)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedAssignmentId(selected ? null : assignment.id)}
                      className="group rounded-lg border bg-white p-3 shadow-sm transition"
                      style={{
                        borderColor: selected ? "#00B7B3" : "#E2E8F0",
                        boxShadow: selected ? "0 0 0 3px rgba(0,183,179,0.12)" : undefined,
                        cursor: canWrite ? "grab" : "default",
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {canWrite && (
                          <GripVertical className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: "#CBD5E1" }} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]" style={{ color: "#475569" }}>
                              {assignment.code}
                            </span>
                            <AssignmentPriorityBadge priority={assignment.priority} />
                            <AssignmentStatusBadge status={assignment.status} />
                          </div>
                          <Link
                            href={`/assignments/${assignment.id}`}
                            className="block truncate text-sm font-semibold hover:underline"
                            style={{ color: "#081D3A" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {assignment.title}
                          </Link>
                          <p className="mt-1 truncate text-xs" style={{ color: "#64748B" }}>
                            {assignment.customerName}
                            {assignment.objectName ? ` - ${assignment.objectName}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <span className="inline-flex items-center gap-1" style={{ color: "#64748B" }}>
                          <Clock className="h-3.5 w-3.5" />
                          {duration} min
                        </span>
                        <span className="inline-flex items-center gap-1" style={{ color: "#64748B" }}>
                          <Users className="h-3.5 w-3.5" />
                          {slotLabel(assignment.filledSlots, assignment.requiredSlots)}
                        </span>
                        {assignment.requiredRegion && (
                          <span className="col-span-2 inline-flex items-center gap-1 truncate" style={{ color: "#64748B" }}>
                            <MapPin className="h-3.5 w-3.5" />
                            {assignment.requiredRegion}
                          </span>
                        )}
                      </div>

                      {assignment.requirements.requiredRoleNames.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {assignment.requirements.requiredRoleNames.slice(0, 3).map((role) => (
                            <span key={role} className="rounded border px-1.5 py-0.5 text-[11px]" style={{ borderColor: "#E2E8F0", color: "#64748B" }}>
                              {role}
                            </span>
                          ))}
                        </div>
                      )}

                      {assignment.requiredSlots > 1 && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium" style={{ borderColor: "#BFDBFE", background: "#EFF6FF", color: "#1D4ED8" }}>
                          <Users className="h-3 w-3" />
                          Team {slotLabel(assignment.filledSlots, assignment.requiredSlots)}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded px-2 py-0.5" style={{ background: "#ECFDF5", color: "#047857" }}>
                          {stats.match} match
                        </span>
                        <span className="rounded px-2 py-0.5" style={{ background: "#FFFBEB", color: "#B45309" }}>
                          {stats.warning} waarschuwing
                        </span>
                        <span className="rounded px-2 py-0.5" style={{ background: "#FEF2F2", color: "#B91C1C" }}>
                          {stats.blocked} blok
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-lg border bg-white shadow-sm" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E2E8F0" }}>
              <div>
                <h3 className="font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
                  Digitaal planbord
                </h3>
                <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
                  {activeAssignment ? activeAssignment.title : "Selecteer of sleep een werkbon"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="grid gap-1 text-xs font-medium" style={{ color: "#64748B" }}>
                  Start
                  <select
                    value={manualStart}
                    onChange={(e) => setManualStart(e.target.value)}
                    className="veele-input h-8 w-[112px] py-1 text-sm"
                  >
                    {START_OPTIONS.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </label>
                {isPending && (
                  <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#64748B" }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Opslaan
                  </span>
                )}
              </div>
            </div>

            {data.personnel.length === 0 ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
                <Users className="mb-3 h-9 w-9" style={{ color: "#CBD5E1" }} />
                <p className="text-sm font-medium" style={{ color: "#64748B" }}>
                  Geen beschikbare medewerkers
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto" style={{ opacity: isPending ? 0.82 : 1 }}>
                <div className="min-w-[980px]">
                  <div className="relative h-10 border-b" style={{ borderColor: "#E2E8F0" }}>
                    <div
                      className="absolute left-0 top-0 flex h-full items-center px-4 text-xs font-semibold uppercase tracking-wide"
                      style={{ width: PERSONNEL_COL_WIDTH, color: "#64748B" }}
                    >
                      Medewerker
                    </div>
                    <div className="absolute bottom-0 top-0" style={{ left: PERSONNEL_COL_WIDTH, right: 0 }}>
                      {HOUR_LABELS.map((hour) => (
                        <div
                          key={hour.label}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs"
                          style={{ left: `${hour.pct}%`, color: "#94A3B8" }}
                        >
                          {hour.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0" style={{ left: PERSONNEL_COL_WIDTH, right: 0 }}>
                      {HOUR_LABELS.map((hour) => (
                        <div
                          key={hour.label}
                          className="absolute inset-y-0"
                          style={{ left: `${hour.pct}%`, borderLeft: "1px solid #F1F5F9" }}
                        />
                      ))}
                    </div>

                    {data.personnel.map((person, index) => {
                      const availability = availabilityConfig(person.availabilityStatus);
                      const match = getMatch(activeAssignmentId, person.id);
                      const matchStyles = matchConfig(match);
                      const isGhostRow = ghostInfo?.rowId === person.id;
                      const alreadyAssigned = isAlreadyAssigned(activeAssignmentId, person.id);
                      const canPlaceSelected = Boolean(activeAssignment && canWrite && match?.level !== "blocked" && !alreadyAssigned);
                      const availabilityBlock = person.availabilityWindow
                        ? timeBlock(person.availabilityWindow.startTime, person.availabilityWindow.endTime)
                        : null;

                      return (
                        <div
                          key={person.id}
                          className="relative grid min-h-[78px] border-b"
                          style={{
                            gridTemplateColumns: `${PERSONNEL_COL_WIDTH}px minmax(740px,1fr)`,
                            borderColor: "#F1F5F9",
                            background: index % 2 === 0 ? "#FFFFFF" : "#FCFDFF",
                          }}
                        >
                          <div className="relative z-10 flex min-w-0 items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold" style={{ color: "#081D3A" }}>
                                {person.lastName}, {person.firstName}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className="rounded border px-1.5 py-0.5 text-[11px]" style={{ borderColor: "#E2E8F0", color: "#64748B" }}>
                                  {person.roleName ?? "Geen rol"}
                                </span>
                                <span className="rounded border px-1.5 py-0.5 text-[11px]" style={{ borderColor: availability.border, background: availability.bg, color: availability.text }}>
                                  {availability.label}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "#94A3B8" }}>
                                {person.region && (
                                  <span className="inline-flex min-w-0 items-center gap-1 truncate">
                                    <MapPin className="h-3 w-3" />
                                    {person.region}
                                  </span>
                                )}
                                <span>{Math.round(person.scheduledMinutes / 60 * 10) / 10}u</span>
                              </div>
                            </div>

                            {activeAssignment && (
                              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="rounded border px-2 py-0.5 text-[11px] font-medium"
                                      style={{ borderColor: matchStyles.border, background: matchStyles.bg, color: matchStyles.text }}
                                    >
                                      {matchStyles.label}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-[260px]">
                                    {match?.reasons.length ? (
                                      <div className="space-y-1">
                                        {match.reasons.slice(0, 6).map((reason) => (
                                          <p key={`${reason.code}-${reason.label}`}>{reason.label}</p>
                                        ))}
                                      </div>
                                    ) : (
                                      <p>Geen matchdetails beschikbaar.</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                                {canPlaceSelected && (
                                  <Button size="sm" variant="outline" onClick={() => scheduleSelected(person)} disabled={isPending}>
                                    <CalendarDays className="h-3.5 w-3.5" />
                                    Plan
                                  </Button>
                                )}
                                {activeAssignment && alreadyAssigned && (
                                  <span className="rounded border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: "#BFDBFE", background: "#EFF6FF", color: "#1D4ED8" }}>
                                    Gekoppeld
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div
                            className="relative z-10 min-h-[78px] px-2 py-3"
                            style={{
                              cursor: canWrite && dragging ? "copy" : undefined,
                              outline: isGhostRow ? `1px dashed ${matchStyles.border}` : undefined,
                              outlineOffset: isGhostRow ? "-3px" : undefined,
                              background: isGhostRow ? matchStyles.bg : undefined,
                              transition: "background 0.12s ease, outline 0.12s ease",
                            }}
                            onDragOver={canWrite ? (e) => handleTimelineDragOver(e, person) : undefined}
                            onDragLeave={canWrite ? () => setGhostInfo(null) : undefined}
                            onDrop={canWrite ? (e) => handleTimelineDrop(e, person) : undefined}
                          >
                            {availabilityBlock && (
                              <div
                                className="absolute top-3 bottom-3 rounded"
                                style={{
                                  left: `${availabilityBlock.left}%`,
                                  width: `${availabilityBlock.width}%`,
                                  background: "rgba(0,183,179,0.07)",
                                  border: "1px dashed rgba(0,183,179,0.22)",
                                }}
                              />
                            )}

                            {isGhostRow && ghostInfo && (
                              <div
                                className="absolute top-3 bottom-3 z-20 flex items-center justify-center rounded-md px-2"
                                style={{
                                  left: `${ghostInfo.leftPct}%`,
                                  width: `${ghostInfo.widthPct}%`,
                                  minWidth: "76px",
                                  background: matchStyles.bg,
                                  border: `2px dashed ${matchStyles.border}`,
                                  color: matchStyles.text,
                                }}
                              >
                                <span className="truncate text-xs font-semibold">{ghostInfo.label}</span>
                              </div>
                            )}

                            {person.scheduledAssignments.length === 0 && (
                              <div className="absolute inset-y-0 left-2 right-2 flex items-center">
                                <span className="rounded border px-2 py-1 text-xs" style={{ borderColor: "#E2E8F0", color: "#CBD5E1" }}>
                                  Vrij
                                </span>
                              </div>
                            )}

                            {person.scheduledAssignments.map((assignment) => {
                              const block = timeBlock(assignment.scheduledStart, assignment.scheduledEnd);
                              const pastel = pastelForAppointment(assignment);
                              const isMovable = canWrite && isPlanboardMovableStatus(assignment.status);
                              if (!block) {
                                return (
                                  <Link
                                    key={assignment.id}
                                    href={`/assignments/${assignment.id}`}
                                    draggable={isMovable}
                                    onDragStart={isMovable ? (e) => handleScheduledDragStart(e, assignment, person.id) : undefined}
                                    onDragEnd={isMovable ? handleDragEnd : undefined}
                                    className="relative z-10 mr-1 inline-flex max-w-[220px] items-center gap-1 truncate rounded border px-2 py-1 text-xs font-medium"
                                    style={{
                                      borderColor: pastel.border,
                                      background: pastel.bg,
                                      color: pastel.text,
                                      cursor: isMovable ? "grab" : undefined,
                                    }}
                                  >
                                    <Clock className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{assignment.title}</span>
                                  </Link>
                                );
                              }

                              return (
                                <Tooltip key={assignment.id}>
                                  <TooltipTrigger asChild>
                                    <Link
                                      href={`/assignments/${assignment.id}`}
                                      draggable={isMovable}
                                      onDragStart={isMovable ? (e) => handleScheduledDragStart(e, assignment, person.id) : undefined}
                                      onDragEnd={isMovable ? handleDragEnd : undefined}
                                      className="absolute top-3 bottom-3 z-10 flex min-w-[74px] items-center overflow-hidden rounded-md border text-xs font-medium shadow-sm transition hover:brightness-[0.98]"
                                      style={{
                                        left: `${block.left}%`,
                                        width: `${block.width}%`,
                                        borderColor: assignment.hasConflict ? "#F59E0B" : pastel.border,
                                        background: pastel.bg,
                                        color: pastel.text,
                                        cursor: isMovable ? "grab" : undefined,
                                      }}
                                    >
                                      <span className="h-full w-1.5 flex-shrink-0" style={{ background: assignment.hasConflict ? "#F59E0B" : pastel.rail }} />
                                      <span className="min-w-0 flex-1 px-2">
                                        <span className="block truncate font-semibold">{assignment.title}</span>
                                        <span className="block truncate text-[11px] opacity-75">
                                          {compactTimeRange(assignment.scheduledStart, assignment.scheduledEnd)}
                                        </span>
                                      </span>
                                      {assignment.requiredSlots > 1 && (
                                        <span className="mr-1 inline-flex flex-shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px]" style={{ background: "rgba(255,255,255,0.58)" }}>
                                          <Users className="h-2.5 w-2.5" />
                                          {slotLabel(assignment.filledSlots, assignment.requiredSlots)}
                                        </span>
                                      )}
                                      {assignment.hasConflict && (
                                        <AlertTriangle className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: "#B45309" }} />
                                      )}
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[260px]">
                                    <div className="space-y-1">
                                      <p className="font-medium">{assignment.title}</p>
                                      <p>{assignment.customerName}</p>
                                      {assignment.objectName && <p>{assignment.objectName}</p>}
                                      <p>{compactTimeRange(assignment.scheduledStart, assignment.scheduledEnd)}</p>
                                      {assignment.requiredSlots > 1 && (
                                        <p>Team {slotLabel(assignment.filledSlots, assignment.requiredSlots)}</p>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}
