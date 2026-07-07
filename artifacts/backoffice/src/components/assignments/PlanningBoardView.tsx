"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  Layers3,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TenantDetailDrawer, TenantFilterDrawer } from "@/components/tenant-ui";
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

const DAY_START_MIN = 0;
const DAY_END_MIN = 24 * 60;
const DAY_SPAN = DAY_END_MIN - DAY_START_MIN;
const PERSONNEL_COL_WIDTH = 216;
const HOUR_WIDTH = 80;
const TIMELINE_WIDTH = 24 * HOUR_WIDTH;
const BOARD_WIDTH = PERSONNEL_COL_WIDTH + TIMELINE_WIDTH;

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

const HOUR_LABELS = Array.from({ length: 25 }, (_, hour) => {
  return {
    label: `${String(hour).padStart(2, "0")}:00`,
    pct: ((hour * 60 - DAY_START_MIN) / DAY_SPAN) * 100,
  };
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

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "Geen datum";

  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;

  const day = d.getDate();
  const month = NL_MONTHS[d.getMonth()]?.slice(0, 3) ?? "";
  return `${day} ${month}`;
}

function parseTimeMin(value: string | null): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (typeof h !== "number" || typeof m !== "number") return null;
  return h * 60 + m;
}

function minutesToTime(value: number): string {
  const clamped = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - 1, value));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
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

function snapUpToQuarter(value: number): number {
  return Math.ceil(value / 15) * 15;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pastelForAppointment(assignment: Pick<PlanningBoardPersonnelAssignment, "id" | "priority" | "status">): Pastel {
  const status = String(assignment.status);
  if (status === "requested" || status === "review" || status === "quote_preparation" || status === "awaiting_approval") {
    return { bg: "#FFF7ED", border: "#FDBA74", text: "#7C2D12", rail: "#F97316" };
  }
  if (status === "approved" || status === "plannable") {
    return { bg: "#ECFDF5", border: "#86D9AE", text: "#14523C", rail: "#22C55E" };
  }
  if (status === "scheduled") return { bg: "#E8F4FF", border: "#93C5FD", text: "#0F3A5F", rail: "#3B82F6" };
  if (status === "seen") return { bg: "#E2FAF8", border: "#8CE7E2", text: "#075E5D", rail: "#00B7B3" };
  if (status === "en_route") return { bg: "#CCFBF1", border: "#5EEAD4", text: "#115E59", rail: "#14B8A6" };
  if (status === "in_progress") return { bg: "#F2EEFF", border: "#C4B5FD", text: "#3F2D75", rail: "#8B5CF6" };
  if (status === "completed" || status === "report_submitted" || status === "report_approved" || status === "invoice_ready" || status === "invoiced" || status === "paid" || status === "closed") {
    return { bg: "#EAF8F1", border: "#86D9AE", text: "#14523C", rail: "#22C55E" };
  }
  if (status === "not_completed" || status === "cancelled" || status === "failed" || status === "rejected") {
    return { bg: "#FFEAF0", border: "#FDA4AF", text: "#7F1D1D", rail: "#F43F5E" };
  }
  if (assignment.priority === "urgent") return APPOINTMENT_PASTELS[4]!;
  if (assignment.priority === "high") return APPOINTMENT_PASTELS[2]!;
  if (assignment.priority === "low") return APPOINTMENT_PASTELS[7]!;
  return APPOINTMENT_PASTELS[hashString(assignment.id) % APPOINTMENT_PASTELS.length]!;
}

function currentMinuteOfDay(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function minuteToTimelinePct(minutes: number): number {
  return ((Math.max(DAY_START_MIN, Math.min(DAY_END_MIN, minutes)) - DAY_START_MIN) / DAY_SPAN) * 100;
}

function suggestedStartForAssignment(assignment: PlanningBoardAssignment, boardDate: string): string {
  const scheduled = parseTimeMin(assignment.scheduledStart);
  if (scheduled !== null) {
    return minutesToTime(Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - durationForAssignment(assignment), scheduled)));
  }

  const duration = durationForAssignment(assignment);
  const fallback = boardDate === todayDateKey() ? snapUpToQuarter(currentMinuteOfDay()) : 8 * 60;
  const start = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - duration, fallback));
  return minutesToTime(start);
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
  const score = typeof match.matchScore === "number" ? ` ${match.matchScore}%` : "";
  if (match.level === "match") {
    return { label: `Match${score}`, bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" };
  }
  if (match.level === "warning") {
    return { label: `Waarschuwing${score}`, bg: "#FFFBEB", text: "#B45309", border: "#FCD34D" };
  }
  return { label: "Blokkeert", bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" };
}

function sectorBadgeStyle(sectorName: string | null | undefined): {
  background: string;
  color: string;
  borderColor: string;
} {
  const normalized = (sectorName ?? "").toLowerCase();
  if (normalized.includes("schoonmaak")) {
    return { background: "#E2FAF8", color: "#075E5D", borderColor: "#8CE7E2" };
  }
  if (normalized.includes("beveilig")) {
    return { background: "#F2EEFF", color: "#4C1D95", borderColor: "#C4B5FD" };
  }
  if (normalized.includes("facilit")) {
    return { background: "#E8F4FF", color: "#0F3A5F", borderColor: "#93C5FD" };
  }
  return { background: "#F8FAFC", color: "#475569", borderColor: "#E2E8F0" };
}

function sectorShortLabel(sectorName: string | null | undefined): string {
  const normalized = (sectorName ?? "").toLowerCase();
  if (normalized.includes("schoonmaak")) return "SCH";
  if (normalized.includes("beveilig")) return "BEV";
  if (normalized.includes("facilit")) return "FAC";
  return "ALG";
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

function workOrderTimeLabel(assignment: PlanningBoardAssignment): string {
  if (assignment.scheduledStart && assignment.scheduledEnd) {
    return `${assignment.scheduledStart}-${assignment.scheduledEnd}`;
  }
  if (assignment.scheduledStart) return `Vanaf ${assignment.scheduledStart}`;
  if (assignment.scheduledEnd) return `Tot ${assignment.scheduledEnd}`;
  return "Tijd kiezen";
}

function displayWorkOrderTitle(title: string): string {
  return title.replace(/^(open werkbon|ingepland team|conflict-test):\s*/i, "");
}

function slotLabel(filledSlots: number, requiredSlots: number): string {
  return `${filledSlots}/${requiredSlots}`;
}

function personnelSortName(person: PlanningBoardPersonnel): string {
  return `${person.lastName} ${person.firstName}`.toLowerCase();
}

function selectedAssignmentRank(
  assignment: PlanningBoardAssignment,
  person: PlanningBoardPersonnel,
  match: PlanningBoardMatch | undefined,
): number {
  if (assignment.assignedPersonnelIds.includes(person.id)) return 0;
  if (match?.level === "match") return 1;
  if (match?.level === "warning") return 2;
  if (match?.level === "blocked") return 3;
  return 4;
}

function capacityTone(stats: { match: number; warning: number; blocked: number }): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  if (stats.match > 0) {
    return { label: "Ruim planbaar", bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" };
  }
  if (stats.warning > 0) {
    return { label: "Controle nodig", bg: "#FFFBEB", text: "#B45309", border: "#FCD34D" };
  }
  return { label: "Geen match", bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" };
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 text-xs font-medium ${className ?? ""}`} style={{ color: "#64748B" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="veele-input h-9 w-full min-w-[150px] py-1 text-sm"
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
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [detailAssignmentId, setDetailAssignmentId] = useState<string | null>(null);
  const [openQueueOpen, setOpenQueueOpen] = useState(false);
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
  const detailAssignment = detailAssignmentId ? assignmentById.get(detailAssignmentId) : null;
  const visiblePersonnel = useMemo(() => {
    if (!activeAssignment) return data.personnel;

    const matches = new Map(
      (data.matchesByAssignmentId[activeAssignment.id] ?? []).map((match) => [
        match.personnelId,
        match,
      ]),
    );

    return data.personnel
      .map((person, index) => ({
        person,
        index,
        match: matches.get(person.id),
      }))
      .sort((a, b) => {
        const rankA = selectedAssignmentRank(activeAssignment, a.person, a.match);
        const rankB = selectedAssignmentRank(activeAssignment, b.person, b.match);
        if (rankA !== rankB) return rankA - rankB;

        if (rankA === 1 || rankA === 2) {
          const scoreDelta = (b.match?.matchScore ?? -1) - (a.match?.matchScore ?? -1);
          if (scoreDelta !== 0) return scoreDelta;

          const loadDelta = a.person.scheduledMinutes - b.person.scheduledMinutes;
          if (loadDelta !== 0) return loadDelta;
        }

        if (rankA === 0) return a.index - b.index;
        return personnelSortName(a.person).localeCompare(personnelSortName(b.person), "nl");
      })
      .map(({ person }) => person);
  }, [activeAssignment, data.matchesByAssignmentId, data.personnel]);
  const conflictCount = data.scheduledAssignments.filter((assignment) => assignment.hasConflict).length;
  const openSlotCount = data.openAssignments.reduce(
    (total, assignment) => total + Math.max(0, assignment.requiredSlots - assignment.filledSlots),
    0,
  );
  const today = todayDateKey();
  const isToday = data.date === today;
  const currentTimePct = isToday ? minuteToTimelinePct(currentMinuteOfDay()) : null;
  const availablePersonnelCount = data.personnel.filter(
    (person) => person.availabilityStatus === "beschikbaar",
  ).length;
  const allMatches = Object.values(data.matchesByAssignmentId).flat();
  const dailyMatchStats = matchStats(allMatches);
  const activeMatchStats = activeAssignment
    ? matchStats(data.matchesByAssignmentId[activeAssignment.id])
    : null;
  const activeCapacityTone = activeMatchStats ? capacityTone(activeMatchStats) : null;
  const activeTopMatches = activeAssignment
    ? [...(data.matchesByAssignmentId[activeAssignment.id] ?? [])]
        .filter((match) => match.level === "match")
        .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
        .slice(0, 3)
    : [];
  const topMatchScore = activeTopMatches[0]?.matchScore ?? null;
  const planningPulseCards = [
    {
      label: "Open plaatsen",
      value: openSlotCount,
      hint: `${data.openAssignments.length} werkbon${data.openAssignments.length === 1 ? "" : "nen"}`,
      tone: "#0EA5E9",
    },
    {
      label: "Ingepland",
      value: data.scheduledAssignments.length,
      hint: `${availablePersonnelCount}/${data.personnel.length} medewerkers beschikbaar`,
      tone: "#00B7B3",
    },
    {
      label: "Topmatches",
      value: activeAssignment ? activeMatchStats?.match ?? 0 : dailyMatchStats.match,
      hint: activeAssignment ? "voor geselecteerde werkbon" : "over open werkbonnen",
      tone: "#22C55E",
    },
    {
      label: "Conflicten",
      value: conflictCount,
      hint: conflictCount > 0 ? "actie nodig" : "geen blokkades",
      tone: conflictCount > 0 ? "#F97316" : "#64748B",
    },
  ];

  useEffect(() => {
    const scrollEl = boardScrollRef.current;
    if (!scrollEl) return;

    const centerMinute = isToday ? currentMinuteOfDay() : 8 * 60;
    const timelineX = PERSONNEL_COL_WIDTH + (centerMinute / DAY_SPAN) * TIMELINE_WIDTH;
    const frame = window.requestAnimationFrame(() => {
      const maxLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
      const nextLeft = Math.min(maxLeft, Math.max(0, timelineX - scrollEl.clientWidth / 2));
      scrollEl.scrollTo({ left: nextLeft, behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [data.date, isToday]);

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
    const start = suggestedStartForAssignment(activeAssignment, data.date);
    const startMin = parseTimeMin(start) ?? 8 * 60;
    const end = minutesToTime(Math.min(DAY_END_MIN, startMin + durationForAssignment(activeAssignment)));
    scheduleOnBoard(activeAssignment.id, person.id, start, end);
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
  const activeFilterCount = [
    searchParams.get("search"),
    selectedCustomer !== "all" ? selectedCustomer : null,
    selectedSector !== "all" ? selectedSector : null,
    selectedRegion !== "all" ? selectedRegion : null,
    selectedPriority !== "all" ? selectedPriority : null,
    selectedStatus !== "all" ? selectedStatus : null,
  ].filter(Boolean).length;
  const detailMatches = detailAssignment ? data.matchesByAssignmentId[detailAssignment.id] ?? [] : [];
  const detailStats = matchStats(detailMatches);

  return (
    <TooltipProvider delayDuration={180}>
      <div className="space-y-4">
        <section className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: "#DDE7F0" }}>
          <div className="relative border-b px-4 py-4" style={{ borderColor: "#E2E8F0", background: "linear-gradient(135deg, #F8FBFF 0%, #FFFFFF 58%, #EFFFFD 100%)" }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl shadow-sm"
                  style={isToday ? { background: "#00B7B3", color: "#fff" } : { background: "#081D3A", color: "#fff" }}
                >
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-xl font-semibold capitalize tracking-tight" style={{ color: "#081D3A" }}>
                      {formatBoardDate(data.date)}
                    </h2>
                    {activeCapacityTone && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
                        style={{ background: activeCapacityTone.bg, borderColor: activeCapacityTone.border, color: activeCapacityTone.text }}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {activeCapacityTone.label}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm" style={{ color: "#64748B" }}>
                    Sleep werkbonnen naar medewerkers, gebruik matchscores als voorstel en behoud zelf de planningcontrole.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => updateQuery({ date: addDaysLocal(data.date, -1) })}>
                  <ChevronLeft className="h-4 w-4" />
                  Vorige
                </Button>
                <Button variant={isToday ? "default" : "outline"} size="sm" onClick={() => updateQuery({ date: today })}>
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

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {planningPulseCards.map((card) => (
                <div key={card.label} className="rounded-lg border bg-white/85 px-3 py-2.5 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#64748B" }}>
                      {card.label}
                    </p>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: card.tone }} />
                  </div>
                  <p className="mt-1 text-2xl font-semibold leading-none" style={{ color: "#081D3A" }}>
                    {card.value}
                  </p>
                  <p className="mt-1 truncate text-xs" style={{ color: "#64748B" }}>
                    {card.hint}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <form onSubmit={submitSearch} className="flex min-w-[280px] flex-1 items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Werkbonnen zoeken</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#94A3B8" }} />
                <Input
                  type="search"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="h-10 rounded-lg pl-9"
                  placeholder="Zoek werkbon, klant, object of regio"
                />
              </label>
              <Button type="submit" size="sm" variant="outline" aria-label="Zoeken" className="h-10">
                <Search className="h-4 w-4" />
              </Button>
            </form>

            {activeAssignment && (
              <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-xs xl:flex" style={{ borderColor: "#BFDBFE", background: "#EFF6FF", color: "#1D4ED8" }}>
                <Sparkles className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">
                  Beste kandidaten staan bovenaan voor <strong>{activeAssignment.code}</strong>
                  {topMatchScore !== null ? ` - hoogste match ${topMatchScore}%` : ""}
                </span>
              </div>
            )}

            <TenantFilterDrawer
              title="Planningfilters"
              description="Verfijn het planbord op datum, klant, sector, regio, prioriteit en status."
              activeCount={activeFilterCount}
              footer={null}
            >
                <div className="grid gap-3">
                  <label className="grid gap-1 text-xs font-medium" style={{ color: "#64748B" }}>
                    Datum
                    <Input
                      type="date"
                      value={data.date}
                      onChange={(e) => updateQuery({ date: e.target.value })}
                      className="w-full"
                    />
                  </label>
                  <FilterSelect
                    className="w-full"
                    label="Klant"
                    value={selectedCustomer}
                    onChange={(value) => updateQuery({ customerId: value })}
                    options={[
                      { value: "all", label: "Alle klanten" },
                      ...data.filterOptions.customers.map((customer) => ({ value: customer.id, label: customer.name })),
                    ]}
                  />
                  <FilterSelect
                    className="w-full"
                    label="Sector"
                    value={selectedSector}
                    onChange={(value) => updateQuery({ sectorId: value })}
                    options={[
                      { value: "all", label: "Alle sectoren" },
                      ...data.filterOptions.sectors.map((sector) => ({ value: sector.id, label: sector.name })),
                    ]}
                  />
                  <FilterSelect
                    className="w-full"
                    label="Regio"
                    value={selectedRegion}
                    onChange={(value) => updateQuery({ region: value })}
                    options={[
                      { value: "all", label: "Alle regio's" },
                      ...data.filterOptions.regions.map((region) => ({ value: region, label: region })),
                    ]}
                  />
                  <FilterSelect
                    className="w-full"
                    label="Prioriteit"
                    value={selectedPriority}
                    onChange={(value) => updateQuery({ priority: value })}
                    options={[
                      { value: "all", label: "Alle prioriteiten" },
                      ...data.filterOptions.priorities.map((priority) => ({ value: priority, label: priorityLabel(priority) })),
                    ]}
                  />
                  <FilterSelect
                    className="w-full"
                    label="Status"
                    value={selectedStatus}
                    onChange={(value) => updateQuery({ status: value })}
                    options={[
                      { value: "all", label: "Alle statussen" },
                      ...data.filterOptions.statuses.map((status) => ({ value: status, label: statusLabel(status) })),
                    ]}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={resetFilters} className="justify-center">
                    <X className="h-4 w-4" />
                    Filters wissen
                  </Button>
                </div>
            </TenantFilterDrawer>
          </div>
        </section>

        <div className="grid min-w-0 gap-4">
          <section className="hidden" style={{ borderColor: "#DDE7F0" }}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E2E8F0", background: "#FBFDFF" }}>
              <div>
                <h3 className="flex items-center gap-2 font-heading text-sm font-semibold" style={{ color: "#081D3A" }}>
                  <Layers3 className="h-4 w-4" style={{ color: "#00B7B3" }} />
                  Werkbon-wachtrij
                </h3>
                <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
                  Selecteer of sleep naar een medewerker
                </p>
              </div>
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "#ECFDF5", color: "#047857" }}>
                {openSlotCount} open
              </span>
            </div>

            {data.openAssignments.length === 0 ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
                <CheckCircle2 className="mb-3 h-9 w-9" style={{ color: "#CBD5E1" }} />
                <p className="text-sm font-medium" style={{ color: "#64748B" }}>
                  Geen open werkbonnen
                </p>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-300px)] min-h-[520px] space-y-3 overflow-y-auto p-3">
                {data.openAssignments.map((assignment) => {
                  const selected = selectedAssignmentId === assignment.id;
                  const stats = matchStats(data.matchesByAssignmentId[assignment.id]);
                  const duration = durationForAssignment(assignment);
                  const scheduleDate = assignment.scheduledDate ?? data.date;
                  const scheduleLabel = formatShortDate(scheduleDate);
                  const timeLabel = workOrderTimeLabel(assignment);
                  const title = displayWorkOrderTitle(assignment.title);
                  const sectorStyle = sectorBadgeStyle(assignment.sectorName);
                  const sectorShort = sectorShortLabel(assignment.sectorName);

                  return (
                    <article
                      key={assignment.id}
                      draggable={canWrite}
                      onDragStart={(e) => handleDragStart(e, assignment)}
                      onDragEnd={handleDragEnd}
                      onClick={() => {
                        const nextId = selected ? null : assignment.id;
                        setSelectedAssignmentId(nextId);
                        setDetailAssignmentId(nextId);
                      }}
                      className="group relative overflow-hidden rounded-xl border bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{
                        borderColor: selected ? "#00B7B3" : "#E2E8F0",
                        boxShadow: selected ? "0 0 0 3px rgba(0,183,179,0.12)" : undefined,
                        cursor: canWrite ? "grab" : "default",
                      }}
                    >
                      <div
                        className="absolute bottom-0 left-0 top-0 w-1"
                        style={{ background: sectorStyle.borderColor }}
                      />
                      <div className="flex items-start gap-2 pl-1">
                        {canWrite && (
                          <GripVertical className="mt-1 h-3.5 w-3.5 flex-shrink-0" style={{ color: "#CBD5E1" }} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none" style={{ background: sectorStyle.background, borderColor: sectorStyle.borderColor, color: sectorStyle.color }}>
                                {sectorShort}
                              </span>
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] leading-none" style={{ color: "#475569" }}>
                                {assignment.code}
                              </span>
                            </div>
                            <div className="flex flex-wrap justify-end gap-1 [&>span]:px-1.5 [&>span]:text-[10px] [&>span]:leading-none">
                              <AssignmentPriorityBadge priority={assignment.priority} />
                              <AssignmentStatusBadge status={assignment.status} />
                            </div>
                          </div>
                          <Link
                            href={`/assignments/${assignment.id}`}
                            className="mt-2 block text-[13px] font-semibold leading-snug hover:underline"
                            style={{ color: "#081D3A" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {title}
                            </span>
                          </Link>
                        </div>
                      </div>

                      <div className="mt-2 rounded-lg border px-2 py-1.5" style={{ borderColor: "#E2E8F0", background: "#F8FAFC" }}>
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[11px] font-medium" style={{ color: "#334155" }}>
                          <span className="inline-flex min-w-0 items-center gap-1 truncate">
                            <CalendarDays className="h-3 w-3 flex-shrink-0" style={{ color: "#64748B" }} />
                            <span className="truncate">{scheduleLabel}</span>
                          </span>
                          <span className="inline-flex min-w-0 items-center gap-1 truncate">
                            <Clock className="h-3 w-3 flex-shrink-0" style={{ color: "#64748B" }} />
                            <span className="truncate">{timeLabel}</span>
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1 text-[11px]" style={{ color: "#64748B" }}>
                        <p className="truncate">
                          {assignment.customerName}
                          {assignment.objectName ? ` - ${assignment.objectName}` : ""}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {assignment.sectorName && (
                            <span
                              className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium"
                              style={sectorBadgeStyle(assignment.sectorName)}
                            >
                              {assignment.sectorName}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {duration} min
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {slotLabel(assignment.filledSlots, assignment.requiredSlots)}
                          </span>
                          {assignment.requiredRegion && (
                            <span className="inline-flex min-w-0 items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{assignment.requiredRegion}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {assignment.requirements.requiredRoleNames.slice(0, 2).map((role) => (
                          <span key={role} className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "#E2E8F0", color: "#64748B" }}>
                            {role}
                          </span>
                        ))}
                        {assignment.requiredSlots > 1 && (
                          <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium" style={{ borderColor: "#BFDBFE", background: "#EFF6FF", color: "#1D4ED8" }}>
                            <Users className="h-3 w-3" />
                            Team {slotLabel(assignment.filledSlots, assignment.requiredSlots)}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                        <span className="rounded px-1.5 py-0.5 leading-none" style={{ background: "#ECFDF5", color: "#047857" }}>
                          {stats.match} match
                        </span>
                        <span className="rounded px-1.5 py-0.5 leading-none" style={{ background: "#FFFBEB", color: "#B45309" }}>
                          {stats.warning} waarschuwing
                        </span>
                        <span className="rounded px-1.5 py-0.5 leading-none" style={{ background: "#FEF2F2", color: "#B91C1C" }}>
                          {stats.blocked} blok
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="min-w-0 overflow-visible rounded-xl border bg-white shadow-sm" style={{ borderColor: "#DDE7F0" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "#E2E8F0", background: "#FBFDFF" }}>
              <div className="min-w-0 text-xs" style={{ color: "#64748B" }}>
                {activeAssignment ? (
                  <span className="inline-flex max-w-[620px] items-center gap-2 truncate rounded-lg border px-2.5 py-1.5" style={{ borderColor: "#BFDBFE", background: "#EFF6FF", color: "#1D4ED8" }}>
                    <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="font-semibold">{activeAssignment.code}</span>
                    <span className="truncate">{displayWorkOrderTitle(activeAssignment.title)}</span>
                    {activeAssignment.sectorName && (
                      <span className="ml-1 rounded border px-1.5 py-0.5 text-[10px]" style={sectorBadgeStyle(activeAssignment.sectorName)}>
                        {sectorShortLabel(activeAssignment.sectorName)}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 font-medium" style={{ color: "#081D3A" }}>
                    <Activity className="h-4 w-4" style={{ color: "#00B7B3" }} />
                    Planbord met {data.personnel.length} medewerkers zichtbaar
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeAssignment && (
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setDetailAssignmentId(activeAssignment.id)}>
                    Details
                  </Button>
                )}
                <div className="relative">
                  <Button
                    type="button"
                    variant={openQueueOpen ? "default" : "outline"}
                    size="sm"
                    className="h-8"
                    onClick={() => setOpenQueueOpen((value) => !value)}
                  >
                    <Layers3 className="h-3.5 w-3.5" />
                    Openstaand ({data.openAssignments.length})
                  </Button>
                  {openQueueOpen && (
                    <div
                      className="absolute right-0 top-10 z-40 w-[390px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-white shadow-2xl"
                      style={{ borderColor: "#DDE7F0" }}
                    >
                      <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "#E2E8F0", background: "#FBFDFF" }}>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: "#081D3A" }}>Werkvoorraad</p>
                          <p className="text-[11px]" style={{ color: "#64748B" }}>{openSlotCount} open plaatsen te plannen</p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpenQueueOpen(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {data.openAssignments.length === 0 ? (
                        <div className="flex min-h-[160px] items-center justify-center px-6 text-center text-sm" style={{ color: "#64748B" }}>
                          Geen open werkbonnen.
                        </div>
                      ) : (
                        <div className="max-h-[520px] space-y-2 overflow-y-auto p-3">
                          {data.openAssignments.map((assignment) => {
                            const selected = selectedAssignmentId === assignment.id;
                            const stats = matchStats(data.matchesByAssignmentId[assignment.id]);
                            const sectorStyle = sectorBadgeStyle(assignment.sectorName);
                            const statusStyle = pastelForAppointment(assignment);
                            const title = displayWorkOrderTitle(assignment.title);

                            return (
                              <article
                                key={assignment.id}
                                draggable={canWrite}
                                onDragStart={(e) => handleDragStart(e, assignment)}
                                onDragEnd={handleDragEnd}
                                onClick={() => {
                                  const nextId = selected ? null : assignment.id;
                                  setSelectedAssignmentId(nextId);
                                  setDetailAssignmentId(nextId);
                                  setOpenQueueOpen(false);
                                }}
                                className="relative overflow-hidden rounded-lg border bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                                style={{
                                  borderColor: selected ? "#00B7B3" : statusStyle.border,
                                  boxShadow: selected ? "0 0 0 3px rgba(0,183,179,0.12)" : undefined,
                                  cursor: canWrite ? "grab" : "pointer",
                                }}
                              >
                                <div className="absolute bottom-0 left-0 top-0 w-1" style={{ background: statusStyle.rail }} />
                                <div className="flex items-start justify-between gap-3 pl-1">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none" style={{ background: sectorStyle.background, borderColor: sectorStyle.borderColor, color: sectorStyle.color }}>
                                        {sectorShortLabel(assignment.sectorName)}
                                      </span>
                                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] leading-none" style={{ color: "#475569" }}>
                                        {assignment.code}
                                      </span>
                                      <AssignmentStatusBadge status={assignment.status} />
                                      {assignment.priority !== "normal" && <AssignmentPriorityBadge priority={assignment.priority} />}
                                    </div>
                                    <p className="mt-1.5 truncate text-[13px] font-semibold" style={{ color: "#081D3A" }}>{title}</p>
                                    <p className="mt-0.5 truncate text-[11px]" style={{ color: "#64748B" }}>
                                      {assignment.customerName}{assignment.objectName ? ` - ${assignment.objectName}` : ""}
                                    </p>
                                  </div>
                                  <div className="flex flex-shrink-0 flex-col items-end gap-1 text-[10px]">
                                    <span className="rounded px-1.5 py-0.5" style={{ background: "#ECFDF5", color: "#047857" }}>{stats.match} match</span>
                                    <span className="rounded px-1.5 py-0.5" style={{ background: "#FEF2F2", color: "#B91C1C" }}>{stats.blocked} blok</span>
                                  </div>
                                </div>
                                <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-md border px-2 py-1.5 text-[11px]" style={{ borderColor: "#E2E8F0", background: "#F8FAFC", color: "#64748B" }}>
                                  <span className="inline-flex items-center gap-1 truncate"><CalendarDays className="h-3 w-3" />{formatShortDate(assignment.scheduledDate ?? data.date)}</span>
                                  <span className="inline-flex items-center gap-1 truncate"><Clock className="h-3 w-3" />{workOrderTimeLabel(assignment)}</span>
                                  <span className="inline-flex items-center gap-1 truncate"><Users className="h-3 w-3" />{slotLabel(assignment.filledSlots, assignment.requiredSlots)}</span>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <span className="hidden rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex" style={{ borderColor: "#DDE7F0", color: "#64748B" }}>
                  24-uurs bord - actuele tijd gecentreerd
                </span>
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
              <div
                ref={boardScrollRef}
                className="max-w-full overflow-x-auto overscroll-x-contain"
                style={{ opacity: isPending ? 0.82 : 1 }}
              >
                <div style={{ width: BOARD_WIDTH, minWidth: "100%" }}>
                  <div className="relative h-10 border-b" style={{ borderColor: "#E2E8F0" }}>
                    <div
                      className="sticky left-0 top-0 z-30 flex h-full items-center border-r bg-white px-3 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ width: PERSONNEL_COL_WIDTH, borderColor: "#E2E8F0", color: "#64748B" }}
                    >
                      Medewerker
                    </div>
                    <div className="absolute bottom-0 top-0" style={{ left: PERSONNEL_COL_WIDTH, width: TIMELINE_WIDTH }}>
                      {HOUR_LABELS.map((hour) => (
                        <div
                          key={hour.label}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px]"
                          style={{ left: `${hour.pct}%`, color: "#94A3B8" }}
                        >
                          {hour.label}
                        </div>
                      ))}
                      {currentTimePct !== null && (
                        <div
                          className="absolute bottom-0 top-0 z-10 -translate-x-1/2"
                          style={{ left: `${currentTimePct}%` }}
                        >
                          <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow" style={{ background: "#00B7B3" }} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0" style={{ left: PERSONNEL_COL_WIDTH, width: TIMELINE_WIDTH }}>
                      {HOUR_LABELS.map((hour) => (
                        <div
                          key={hour.label}
                          className="absolute inset-y-0"
                          style={{ left: `${hour.pct}%`, borderLeft: "1px solid #F1F5F9" }}
                        />
                      ))}
                      {currentTimePct !== null && (
                        <div
                          className="absolute inset-y-0 z-10"
                          style={{
                            left: `${currentTimePct}%`,
                            borderLeft: "2px solid #00B7B3",
                            boxShadow: "0 0 0 1px rgba(0,183,179,0.08)",
                          }}
                        />
                      )}
                    </div>

                    {visiblePersonnel.map((person, index) => {
                      const rowBg = index % 2 === 0 ? "#FFFFFF" : "#FCFDFF";
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
                            gridTemplateColumns: `${PERSONNEL_COL_WIDTH}px ${TIMELINE_WIDTH}px`,
                            borderColor: "#F1F5F9",
                            background: rowBg,
                          }}
                        >
                          <div
                            className="sticky left-0 z-20 flex min-w-0 items-center justify-between gap-2 border-r px-3 py-2.5"
                            style={{ background: rowBg, borderColor: "#E2E8F0" }}
                          >
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold leading-tight" style={{ color: "#081D3A" }}>
                                {person.lastName}, {person.firstName}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <span className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "#E2E8F0", color: "#64748B" }}>
                                  {person.roleName ?? "Geen rol"}
                                </span>
                                {person.sectorName && (
                                  <span className="rounded border px-1.5 py-0.5 text-[10px]" style={sectorBadgeStyle(person.sectorName)}>
                                    {person.sectorName}
                                  </span>
                                )}
                                <span className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: availability.border, background: availability.bg, color: availability.text }}>
                                  {availability.label}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: "#94A3B8" }}>
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
                                      className="rounded border px-1.5 py-0.5 text-[10px] font-medium"
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
                                  <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium" style={{ borderColor: "#BFDBFE", background: "#EFF6FF", color: "#1D4ED8" }}>
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
                                    className="relative z-10 mr-1 inline-flex max-w-[220px] items-center gap-1 truncate rounded border px-1.5 py-1 text-[11px] font-medium"
                                    style={{
                                      borderColor: pastel.border,
                                      background: pastel.bg,
                                      color: pastel.text,
                                      cursor: isMovable ? "grab" : undefined,
                                    }}
                                  >
                                    <Clock className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">
                                      {assignment.title}
                                      {assignment.sectorName ? ` - ${assignment.sectorName}` : ""}
                                    </span>
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
                                      className="absolute top-3 bottom-3 z-10 flex min-w-[96px] items-center overflow-hidden rounded-lg border text-[11px] font-medium shadow-sm transition hover:brightness-[0.98]"
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
                                        <span className="flex min-w-0 items-center gap-1">
                                          <span className="truncate font-mono text-[10px] opacity-80">{assignment.code}</span>
                                          <span className="rounded bg-white/60 px-1 py-0.5 text-[9px] leading-none">
                                            {statusLabel(assignment.status)}
                                          </span>
                                        </span>
                                        <span className="mt-0.5 block truncate font-semibold">{displayWorkOrderTitle(assignment.title)}</span>
                                        <span className="mt-0.5 block truncate text-[10px] opacity-75">
                                          {compactTimeRange(assignment.scheduledStart, assignment.scheduledEnd)}
                                          {assignment.sectorName ? ` - ${assignment.sectorName}` : ""}
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
                                      {assignment.sectorName && <p>Sector: {assignment.sectorName}</p>}
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

        <TenantDetailDrawer
          open={Boolean(detailAssignment)}
          onOpenChange={(open) => {
            if (!open) setDetailAssignmentId(null);
          }}
          title={detailAssignment ? detailAssignment.code : "Werkbon"}
          description={detailAssignment ? displayWorkOrderTitle(detailAssignment.title) : undefined}
        >
          {detailAssignment && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-1.5">
                <AssignmentPriorityBadge priority={detailAssignment.priority} />
                <AssignmentStatusBadge status={detailAssignment.status} />
                {detailAssignment.hasConflict && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Conflict
                  </span>
                )}
              </div>

              <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <DetailLine label="Klant" value={detailAssignment.customerName} />
                <DetailLine label="Object" value={detailAssignment.objectName ?? "Geen object gekoppeld"} />
                <DetailLine label="Sector" value={detailAssignment.sectorName ?? "Geen sector"} />
                <DetailLine label="Regio" value={detailAssignment.requiredRegion ?? "Geen regio-eis"} />
                <DetailLine label="Tijd" value={`${formatShortDate(detailAssignment.scheduledDate ?? data.date)} - ${workOrderTimeLabel(detailAssignment)}`} />
                <DetailLine label="Bezetting" value={slotLabel(detailAssignment.filledSlots, detailAssignment.requiredSlots)} />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Eisen</h3>
                <div className="flex flex-wrap gap-2 text-xs">
                  {detailAssignment.requirements.requiredRoleNames.length > 0 ? (
                    detailAssignment.requirements.requiredRoleNames.map((role) => (
                      <span key={role} className="rounded-full border border-border bg-background px-2.5 py-1 font-medium">
                        {role}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground">Geen specifieke rollen vereist.</span>
                  )}
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 font-medium">
                    {durationForAssignment(detailAssignment)} minuten
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-900">
                  <p className="font-semibold">{detailStats.match}</p>
                  <p className="opacity-75">match</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
                  <p className="font-semibold">{detailStats.warning}</p>
                  <p className="opacity-75">check</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-900">
                  <p className="font-semibold">{detailStats.blocked}</p>
                  <p className="opacity-75">blok</p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Beste matches</h3>
                {detailMatches.length > 0 ? (
                  <div className="space-y-2">
                    {detailMatches.slice(0, 5).map((match) => {
                      const person = data.personnel.find((item) => item.id === match.personnelId);
                      const config = matchConfig(match);
                      return (
                        <div key={match.personnelId} className="rounded-lg border border-border bg-background p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {person ? `${person.firstName} ${person.lastName}` : "Onbekende medewerker"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {person?.roleName ?? "Geen rol"}{person?.region ? ` - ${person.region}` : ""}
                              </p>
                            </div>
                            <span className="rounded-full border px-2 py-1 text-xs font-semibold" style={{ borderColor: config.border, background: config.bg, color: config.text }}>
                              {config.label}
                            </span>
                          </div>
                          {match.reasons.length > 0 && (
                            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {match.reasons.slice(0, 3).map((reason) => (
                                <li key={`${match.personnelId}-${reason.code}-${reason.label}`}>{reason.label}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    Geen matchdetails beschikbaar voor deze werkbon.
                  </p>
                )}
              </div>

              <Button asChild className="w-full">
                <Link href={`/assignments/${detailAssignment.id}`}>Open werkbon</Link>
              </Button>
            </div>
          )}
        </TenantDetailDrawer>
      </div>
    </TooltipProvider>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
