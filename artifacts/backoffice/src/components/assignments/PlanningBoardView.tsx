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
  Info,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TenantDetailDrawer, TenantFilterDrawer } from "@/components/tenant-ui";
import { formatPersonnelRoleName } from "@/lib/personnel-role-labels";
import { trackUxAnalytics } from "@/lib/ux-analytics";
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
import {
  compactPlanboardDisplayWindow,
  planboardDisplayWindow,
  planboardDateKey,
  formatPlanboardTimeRange,
  planboardInterestAsAssignedIndicator,
  planboardMinuteOfDay,
  planboardRelativeTimestampMinute,
  planboardStaffingLabel,
  planboardStaffingState,
  planboardStaffingStateLabel,
} from "./planboard-assignment-states";

const DAY_START_MIN = 0;
const DAY_END_MIN = 24 * 60;
const DAY_SPAN = DAY_END_MIN - DAY_START_MIN;
const PERSONNEL_COL_WIDTH = 216;
const HOUR_WIDTH_DEFAULT = 80;
const ZOOM_LEVELS = [
  { id: "compact", label: "Compact", hourWidth: 56 },
  { id: "comfort", label: "Normaal", hourWidth: HOUR_WIDTH_DEFAULT },
  { id: "detail", label: "Ruim", hourWidth: 120 },
] as const;
const DENSITY_LEVELS = [
  { id: "compact", label: "Compact", rowHeight: 64, inset: 8 },
  { id: "comfort", label: "Normaal", rowHeight: 78, inset: 12 },
  { id: "roomy", label: "Ruim", rowHeight: 96, inset: 16 },
] as const;
const PERSONNEL_SORT_OPTIONS = [
  { value: "match", label: "Beste match" },
  { value: "fixed", label: "Vaste volgorde" },
  { value: "name", label: "Naam" },
  { value: "region", label: "Regio" },
  { value: "availability", label: "Beschikbaarheid" },
  { value: "load", label: "Belasting" },
] as const;
const PLANNING_PREFERENCES_KEY = "fieldgrid:planning-board:preferences";

type TimelineWindow = {
  start: number;
  end: number;
  span: number;
};

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

const PLANNING_SNAP_MINUTES = 5;

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
  { bg: "#E2FAF8", border: "#8CE7E2", text: "#075E5D", rail: "var(--color-primary)" },
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
  return planboardDateKey(new Date()) ?? dateKey(new Date());
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
  timeline: TimelineWindow = {
    start: DAY_START_MIN,
    end: DAY_END_MIN,
    span: DAY_SPAN,
  },
): { left: number; width: number } | null {
  const s = parseTimeMin(start);
  const e = parseTimeMin(end);
  if (s === null) return null;

  const clampedStart = Math.max(s, timeline.start);
  const clampedEnd = Math.min(e ?? s + 60, timeline.end);
  if (clampedStart >= clampedEnd) return null;

  return {
    left: ((clampedStart - timeline.start) / timeline.span) * 100,
    width: ((clampedEnd - clampedStart) / timeline.span) * 100,
  };
}

function alignToPlanningGrid(
  value: number,
  slotMinutes: number,
  workdayStart: string,
  mode: "nearest" | "up",
): number {
  const interval = Math.max(1, Math.min(240, slotMinutes));
  const base = parseTimeMin(workdayStart) ?? DAY_START_MIN;
  const raw = (value - base) / interval;
  return base + (mode === "up" ? Math.ceil(raw) : Math.round(raw)) * interval;
}

function overlapsMinutes(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && endA > startB;
}

function nextNonOverlappingStart(
  preferredStart: number,
  duration: number,
  slotMinutes: number,
  workdayStart: string,
  existingAssignments: PlanningBoardPersonnelAssignment[] = [],
  movingAssignmentId?: string | null,
): number {
  let start = preferredStart;
  let changed = true;
  while (changed) {
    changed = false;
    const end = start + duration;
    for (const assignment of existingAssignments) {
      if (assignment.id === movingAssignmentId) continue;
      const otherStart = parseTimeMin(assignment.scheduledStart);
      const otherEnd = parseTimeMin(assignment.scheduledEnd);
      if (otherStart === null || otherEnd === null) continue;
      if (overlapsMinutes(start, end, otherStart, otherEnd)) {
        start = alignToPlanningGrid(otherEnd, slotMinutes, workdayStart, "up");
        changed = true;
        break;
      }
    }
  }
  return start;
}

function calcDropSlot(
  e: React.DragEvent<HTMLDivElement>,
  durationMin: number,
  slotMinutes = 15,
  workdayStart = "00:00",
  existingAssignments: PlanningBoardPersonnelAssignment[] = [],
  movingAssignmentId?: string | null,
  timeline: TimelineWindow = {
    start: DAY_START_MIN,
    end: DAY_END_MIN,
    span: DAY_SPAN,
  },
): {
  start: string;
  end: string;
  leftPct: number;
  widthPct: number;
  label: string;
} {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const rawStart = timeline.start + (x / rect.width) * timeline.span;
  const snapped = alignToPlanningGrid(
    rawStart,
    PLANNING_SNAP_MINUTES,
    workdayStart,
    "nearest",
  );
  const duration = Math.max(15, Math.min(8 * 60, durationMin));
  const resolvedStart = nextNonOverlappingStart(
    snapped,
    duration,
    PLANNING_SNAP_MINUTES,
    workdayStart,
    existingAssignments,
    movingAssignmentId,
  );
  const startMin = Math.max(
    timeline.start,
    Math.min(timeline.end - duration, resolvedStart),
  );
  const endMin = startMin + duration;
  const start = minutesToTime(startMin);
  const end = minutesToTime(endMin);

  return {
    start,
    end,
    leftPct: ((startMin - timeline.start) / timeline.span) * 100,
    widthPct: ((endMin - startMin) / timeline.span) * 100,
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

function pastelForAppointment(
  assignment: Pick<
    PlanningBoardPersonnelAssignment,
    "id" | "priority" | "status"
  >,
): Pastel {
  const status = String(assignment.status);
  if (
    status === "requested" ||
    status === "review" ||
    status === "quote_preparation" ||
    status === "awaiting_approval"
  ) {
    return {
      bg: "#FFF7ED",
      border: "#FDBA74",
      text: "#7C2D12",
      rail: "#F97316",
    };
  }
  if (
    status === "approved" ||
    status === "plannable" ||
    status === "scheduled" ||
    status === "seen"
  ) {
    return {
      bg: "#F1F5F9",
      border: "#CBD5E1",
      text: "#334155",
      rail: "#94A3B8",
    };
  }
  if (status === "en_route")
    return {
      bg: "#FEF9C3",
      border: "#FACC15",
      text: "#713F12",
      rail: "#EAB308",
    };
  if (status === "in_progress")
    return {
      bg: "#DBEAFE",
      border: "#60A5FA",
      text: "#1E3A8A",
      rail: "#3B82F6",
    };
  if (
    status === "completed" ||
    status === "report_submitted" ||
    status === "report_approved" ||
    status === "invoice_ready" ||
    status === "invoiced" ||
    status === "paid" ||
    status === "closed"
  ) {
    return {
      bg: "#EAF8F1",
      border: "#86D9AE",
      text: "#14523C",
      rail: "#22C55E",
    };
  }
  if (
    status === "not_completed" ||
    status === "cancelled" ||
    status === "failed" ||
    status === "rejected"
  ) {
    return {
      bg: "#FFEAF0",
      border: "#FDA4AF",
      text: "#7F1D1D",
      rail: "#F43F5E",
    };
  }
  if (assignment.priority === "urgent") return APPOINTMENT_PASTELS[4]!;
  if (assignment.priority === "high") return APPOINTMENT_PASTELS[2]!;
  if (assignment.priority === "low") return APPOINTMENT_PASTELS[7]!;
  return APPOINTMENT_PASTELS[
    hashString(assignment.id) % APPOINTMENT_PASTELS.length
  ]!;
}

function currentMinuteOfDay(now = new Date()): number {
  return planboardMinuteOfDay(now) ?? now.getHours() * 60 + now.getMinutes();
}

function minuteToTimelinePct(
  minutes: number,
  timeline: TimelineWindow = {
    start: DAY_START_MIN,
    end: DAY_END_MIN,
    span: DAY_SPAN,
  },
): number {
  return (
    ((Math.max(timeline.start, Math.min(timeline.end, minutes)) -
      timeline.start) /
      timeline.span) *
    100
  );
}

function minuteBlock(
  startMin: number | null,
  endMin: number | null,
  timeline: TimelineWindow = {
    start: DAY_START_MIN,
    end: DAY_END_MIN,
    span: DAY_SPAN,
  },
): { left: number; width: number } | null {
  if (startMin === null) return null;
  const safeEnd = endMin ?? Math.min(timeline.end, startMin + 60);
  const clampedStart = Math.max(
    timeline.start,
    Math.min(timeline.end, startMin),
  );
  const clampedEnd = Math.max(timeline.start, Math.min(timeline.end, safeEnd));
  if (clampedStart >= clampedEnd) return null;
  return {
    left: minuteToTimelinePct(clampedStart, timeline),
    width: ((clampedEnd - clampedStart) / timeline.span) * 100,
  };
}

function actualTimeBlock(
  assignment: PlanningBoardPersonnelAssignment,
  boardDate: string,
  liveRelativeMinute: number,
  timeline?: TimelineWindow,
): { left: number; width: number } | null {
  const actualStart = planboardRelativeTimestampMinute(
    assignment.actualStartedAt,
    boardDate,
  );
  const actualEnd = planboardRelativeTimestampMinute(
    assignment.actualCompletedAt,
    boardDate,
  );
  if (actualStart !== null) {
    const effectiveEnd = parseTimeMin(assignment.effectiveEnd);
    return minuteBlock(
      actualStart,
      actualEnd ?? (assignment.isRunning ? liveRelativeMinute : effectiveEnd),
      timeline,
    );
  }

  const effectiveStart = parseTimeMin(assignment.effectiveStart);
  const effectiveEnd = parseTimeMin(assignment.effectiveEnd);
  if (
    effectiveStart === null ||
    (effectiveStart === parseTimeMin(assignment.scheduledStart) &&
      effectiveEnd === parseTimeMin(assignment.scheduledEnd))
  ) {
    return null;
  }
  return minuteBlock(effectiveStart, effectiveEnd, timeline);
}

function relativeTimeBlock(
  child: { left: number; width: number } | null,
  parent: { left: number; width: number },
): { left: number; width: number } | null {
  if (!child || parent.width <= 0) return null;
  return {
    left: ((child.left - parent.left) / parent.width) * 100,
    width: (child.width / parent.width) * 100,
  };
}

function suggestedStartForAssignment(
  assignment: PlanningBoardAssignment,
  boardDate: string,
): string {
  const scheduled = parseTimeMin(assignment.scheduledStart);
  if (scheduled !== null) {
    return minutesToTime(
      Math.max(
        DAY_START_MIN,
        Math.min(DAY_END_MIN - durationForAssignment(assignment), scheduled),
      ),
    );
  }

  const duration = durationForAssignment(assignment);
  const fallback =
    boardDate === todayDateKey()
      ? snapUpToQuarter(currentMinuteOfDay())
      : 8 * 60;
  const start = Math.max(
    DAY_START_MIN,
    Math.min(DAY_END_MIN - duration, fallback),
  );
  return minutesToTime(start);
}

function isPlanboardMovableStatus(status: string): boolean {
  return ["plannable", "scheduled"].includes(status);
}

function isLateAppointment(
  assignment: Pick<
    PlanningBoardPersonnelAssignment,
    "scheduledStart" | "scheduledEnd" | "status"
  >,
  boardDate: string,
): boolean {
  if (
    !["scheduled", "seen", "en_route"].includes(String(assignment.status)) ||
    !assignment.scheduledEnd
  )
    return false;
  if (todayDateKey() !== boardDate) return false;
  const endMin = parseTimeMin(assignment.scheduledEnd);
  return endMin !== null && currentMinuteOfDay() > endMin;
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
    return {
      label: "Geen matchdata",
      bg: "#F8FAFC",
      text: "#64748B",
      border: "#E2E8F0",
    };
  }
  const score =
    typeof match.matchScore === "number" ? ` ${match.matchScore}%` : "";
  if (match.level === "match") {
    return {
      label: `Match${score}`,
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
    };
  }
  if (match.level === "warning") {
    return {
      label: `Waarschuwing${score}`,
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FCD34D",
    };
  }
  return {
    label: "Blokkeert",
    bg: "#FEF2F2",
    text: "#B91C1C",
    border: "#FECACA",
  };
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
    return {
      label: "Beschikbaar",
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
    };
  }
  if (status === "niet_ingesteld") {
    return {
      label: "Onbekend",
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FCD34D",
    };
  }
  if (status === "op_verlof") {
    return {
      label: "Verlof",
      bg: "#EFF6FF",
      text: "#1D4ED8",
      border: "#BFDBFE",
    };
  }
  if (status === "ziek") {
    return { label: "Ziek", bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" };
  }
  return {
    label: "Niet beschikbaar",
    bg: "#F8FAFC",
    text: "#64748B",
    border: "#E2E8F0",
  };
}

function compactTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Geen tijd";
  if (start && end) return `${start}-${end}`;
  return start ?? end ?? "";
}

function appointmentTimingLabel(
  assignment: PlanningBoardPersonnelAssignment,
): string {
  const shown = `Tijd ${planboardDisplayWindow(assignment).label}`;
  const planned = `Gepland ${formatPlanboardTimeRange(assignment.scheduledStart, assignment.scheduledEnd)}`;
  const parts = [shown];
  if (
    assignment.effectiveStart !== assignment.scheduledStart ||
    assignment.effectiveEnd !== assignment.scheduledEnd
  ) {
    parts.push(planned);
  }
  if (assignment.timeDataQualityWarning) {
    parts.push(assignment.timeDataQualityWarning);
  }
  return parts.join("; ");
}

function workOrderTimeLabel(assignment: PlanningBoardAssignment): string {
  return planboardDisplayWindow(assignment).label;
}

function displayWorkOrderTitle(title: string): string {
  return title.replace(/^(open werkbon|ingepland team|conflict-test):\s*/i, "");
}

function slotLabel(filledSlots: number, requiredSlots: number): string {
  return planboardStaffingLabel({ filledSlots, requiredSlots });
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

function capacityTone(stats: {
  match: number;
  warning: number;
  blocked: number;
}): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  if (stats.match > 0) {
    return {
      label: "Ruim planbaar",
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
    };
  }
  if (stats.warning > 0) {
    return {
      label: "Controle nodig",
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FCD34D",
    };
  }
  return {
    label: "Geen match",
    bg: "#FEF2F2",
    text: "#B91C1C",
    border: "#FECACA",
  };
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
  const labelId = `planning-filter-${label.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}`;
  return (
    <div className={`grid gap-1 text-xs font-medium ${className ?? ""}`}>
      <span id={labelId} className="text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-labelledby={labelId}
          className="min-h-9 min-w-[150px] bg-background py-1"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PlanningBoardView({ data, canWrite }: PlanningBoardViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dragRef = useRef<DragState | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  const [searchValue, setSearchValue] = useState(
    searchParams.get("search") ?? "",
  );
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<
    string | null
  >(null);
  const [detailAssignmentId, setDetailAssignmentId] = useState<string | null>(
    null,
  );
  const [openQueueOpen, setOpenQueueOpen] = useState(false);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [ghostInfo, setGhostInfo] = useState<GhostInfo | null>(null);
  const [keyboardPlacement, setKeyboardPlacement] = useState<{
    personnelId: string;
    start: number;
    end: number;
  } | null>(null);
  const [keyboardSourcePersonnelId, setKeyboardSourcePersonnelId] = useState<
    string | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const [plannerInteracting, setPlannerInteracting] = useState(false);
  const [zoomLevel, setZoomLevel] =
    useState<(typeof ZOOM_LEVELS)[number]["id"]>("comfort");
  const [rowDensity, setRowDensity] =
    useState<(typeof DENSITY_LEVELS)[number]["id"]>("comfort");
  const [timelineScope, setTimelineScope] = useState<"workday" | "full">(
    "workday",
  );
  const [personnelSort, setPersonnelSort] =
    useState<(typeof PERSONNEL_SORT_OPTIONS)[number]["value"]>("match");
  const [plannerAnnouncement, setPlannerAnnouncement] = useState(
    "Selecteer een werkbon en kies daarna een medewerker.",
  );
  const [clockNow, setClockNow] = useState(() => Date.now());

  const configuredStart =
    parseTimeMin(data.planningSettings.workdayStart) ?? 8 * 60;
  const liveMinute = currentMinuteOfDay(new Date(clockNow));
  const liveRelativeMinute =
    planboardRelativeTimestampMinute(new Date(clockNow), data.date) ??
    liveMinute;
  const relevantWindow = useMemo(() => {
    const starts: number[] = [];
    const ends: number[] = [];
    for (const assignment of data.scheduledAssignments) {
      const actualStart = planboardRelativeTimestampMinute(
        assignment.actualStartedAt,
        data.date,
      );
      const actualEnd = planboardRelativeTimestampMinute(
        assignment.actualCompletedAt,
        data.date,
      );
      const start =
        actualStart ??
        parseTimeMin(assignment.effectiveStart ?? assignment.scheduledStart);
      const end =
        actualStart !== null
          ? (actualEnd ??
            (assignment.isRunning
              ? liveRelativeMinute
              : parseTimeMin(
                  assignment.effectiveEnd ?? assignment.scheduledEnd,
                )))
          : parseTimeMin(assignment.effectiveEnd ?? assignment.scheduledEnd);
      if (start !== null) starts.push(start);
      if (end !== null) ends.push(end);
    }
    const start = Math.max(
      DAY_START_MIN,
      Math.floor(
        Math.min(
          configuredStart,
          ...(starts.length > 0 ? starts : [configuredStart]),
        ) / 60,
      ) * 60,
    );
    const end = Math.min(
      DAY_END_MIN,
      Math.ceil(
        Math.max(
          18 * 60,
          configuredStart + 8 * 60,
          ...(ends.length > 0 ? ends : [18 * 60]),
        ) / 60,
      ) * 60,
    );
    return {
      start,
      end: Math.max(start + 60, end),
      span: Math.max(60, end - start),
    };
  }, [
    configuredStart,
    data.date,
    data.scheduledAssignments,
    liveRelativeMinute,
  ]);
  const timelineWindow: TimelineWindow =
    timelineScope === "full"
      ? { start: DAY_START_MIN, end: DAY_END_MIN, span: DAY_SPAN }
      : relevantWindow;
  const hourLabels = useMemo(() => {
    const labels: Array<{ label: string; pct: number }> = [];
    for (
      let minute = timelineWindow.start;
      minute <= timelineWindow.end;
      minute += 60
    ) {
      labels.push({
        label: `${String(Math.floor(minute / 60)).padStart(2, "0")}:00`,
        pct: minuteToTimelinePct(minute, timelineWindow),
      });
    }
    return labels;
  }, [timelineWindow.end, timelineWindow.span, timelineWindow.start]);
  const hourWidth =
    ZOOM_LEVELS.find((level) => level.id === zoomLevel)?.hourWidth ??
    HOUR_WIDTH_DEFAULT;
  const density =
    DENSITY_LEVELS.find((level) => level.id === rowDensity) ??
    DENSITY_LEVELS[1];
  const timelineWidth = (timelineWindow.span / 60) * hourWidth;
  const boardWidth = PERSONNEL_COL_WIDTH + timelineWidth;

  const assignmentById = useMemo(() => {
    return new Map(
      [...data.openAssignments, ...data.scheduledAssignments].map(
        (assignment) => [assignment.id, assignment],
      ),
    );
  }, [data.openAssignments, data.scheduledAssignments]);

  const activeAssignmentId = dragging?.assignmentId ?? selectedAssignmentId;
  const activeAssignment = activeAssignmentId
    ? assignmentById.get(activeAssignmentId)
    : null;
  const detailAssignment = detailAssignmentId
    ? assignmentById.get(detailAssignmentId)
    : null;
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
        if (personnelSort === "fixed") return a.index - b.index;
        if (personnelSort === "name") {
          return personnelSortName(a.person).localeCompare(
            personnelSortName(b.person),
            "nl",
          );
        }
        if (personnelSort === "region") {
          const region = (a.person.region ?? "").localeCompare(
            b.person.region ?? "",
            "nl",
          );
          return (
            region ||
            personnelSortName(a.person).localeCompare(
              personnelSortName(b.person),
              "nl",
            )
          );
        }
        if (personnelSort === "availability") {
          const available =
            Number(b.person.availabilityStatus === "beschikbaar") -
            Number(a.person.availabilityStatus === "beschikbaar");
          return (
            available || a.person.scheduledMinutes - b.person.scheduledMinutes
          );
        }
        if (personnelSort === "load") {
          return (
            a.person.scheduledMinutes - b.person.scheduledMinutes ||
            personnelSortName(a.person).localeCompare(
              personnelSortName(b.person),
              "nl",
            )
          );
        }
        if (!activeAssignment) return a.index - b.index;

        const rankA = selectedAssignmentRank(
          activeAssignment,
          a.person,
          a.match,
        );
        const rankB = selectedAssignmentRank(
          activeAssignment,
          b.person,
          b.match,
        );
        if (rankA !== rankB) return rankA - rankB;

        if (rankA === 1 || rankA === 2) {
          const scoreDelta =
            (b.match?.matchScore ?? -1) - (a.match?.matchScore ?? -1);
          if (scoreDelta !== 0) return scoreDelta;

          const loadDelta =
            a.person.scheduledMinutes - b.person.scheduledMinutes;
          if (loadDelta !== 0) return loadDelta;
        }

        if (rankA === 0) return a.index - b.index;
        return personnelSortName(a.person).localeCompare(
          personnelSortName(b.person),
          "nl",
        );
      })
      .map(({ person }) => person);
  }, [
    activeAssignment,
    data.matchesByAssignmentId,
    data.personnel,
    personnelSort,
  ]);
  const conflictCount = data.scheduledAssignments.filter(
    (assignment) => assignment.hasConflict,
  ).length;
  const openSlotCount = data.openAssignments.reduce(
    (total, assignment) =>
      total + Math.max(0, assignment.requiredSlots - assignment.filledSlots),
    0,
  );
  const today = todayDateKey();
  const isToday = data.date === today;
  const currentTimePct =
    isToday &&
    liveMinute >= timelineWindow.start &&
    liveMinute <= timelineWindow.end
      ? minuteToTimelinePct(liveMinute, timelineWindow)
      : null;
  const visibleSlotMarkers = useMemo(() => {
    const start = Math.max(
      timelineWindow.start,
      parseTimeMin(data.planningSettings.workdayStart) ?? 8 * 60,
    );
    const interval = Math.max(
      15,
      Math.min(240, data.planningSettings.slotMinutes),
    );
    const markers: Array<{ label: string; pct: number; isStart: boolean }> = [];
    for (
      let minute = start, index = 0;
      minute <= timelineWindow.end;
      minute += interval, index += 1
    ) {
      markers.push({
        label: minutesToTime(Math.min(minute, timelineWindow.end - 1)),
        pct: minuteToTimelinePct(minute, timelineWindow),
        isStart: index === 0,
      });
    }
    return markers;
  }, [
    data.planningSettings.slotMinutes,
    data.planningSettings.workdayStart,
    timelineWindow.end,
    timelineWindow.span,
    timelineWindow.start,
  ]);
  const availablePersonnelCount = data.personnel.filter(
    (person) => person.availabilityStatus === "beschikbaar",
  ).length;
  const allMatches = Object.values(data.matchesByAssignmentId).flat();
  const dailyMatchStats = matchStats(allMatches);
  const activeMatchStats = activeAssignment
    ? matchStats(data.matchesByAssignmentId[activeAssignment.id])
    : null;
  const activeCapacityTone = activeMatchStats
    ? capacityTone(activeMatchStats)
    : null;
  const activeTopMatches = activeAssignment
    ? [...(data.matchesByAssignmentId[activeAssignment.id] ?? [])]
        .filter((match) => match.level === "match")
        .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
        .slice(0, 3)
    : [];
  const topMatchScore = activeTopMatches[0]?.matchScore ?? null;
  const slotMinutes = data.planningSettings.slotMinutes;
  const workdayStart = data.planningSettings.workdayStart;
  const planningPulseCards = [
    {
      label: "Open plaatsen",
      value: openSlotCount,
      hint: `${data.openAssignments.length} werkbon${data.openAssignments.length === 1 ? "" : "nen"} · tijdvak ${workdayStart}/${slotMinutes} min · plannen per 5 min`,
      tone: "#0EA5E9",
    },
    {
      label: "Ingepland",
      value: data.scheduledAssignments.length,
      hint: `${availablePersonnelCount}/${data.personnel.length} medewerkers beschikbaar`,
      tone: "var(--color-primary)",
    },
    {
      label: "Topmatches",
      value: activeAssignment
        ? (activeMatchStats?.match ?? 0)
        : dailyMatchStats.match,
      hint: activeAssignment
        ? "voor geselecteerde werkbon"
        : "over open werkbonnen",
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
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(PLANNING_PREFERENCES_KEY) ?? "{}",
      ) as Record<string, unknown>;
      if (ZOOM_LEVELS.some((item) => item.id === parsed.zoom)) {
        setZoomLevel(parsed.zoom as (typeof ZOOM_LEVELS)[number]["id"]);
      }
      if (DENSITY_LEVELS.some((item) => item.id === parsed.density)) {
        setRowDensity(parsed.density as (typeof DENSITY_LEVELS)[number]["id"]);
      }
      if (parsed.scope === "workday" || parsed.scope === "full") {
        setTimelineScope(parsed.scope);
      }
      if (PERSONNEL_SORT_OPTIONS.some((item) => item.value === parsed.sort)) {
        setPersonnelSort(
          parsed.sort as (typeof PERSONNEL_SORT_OPTIONS)[number]["value"],
        );
      }
    } catch {
      window.localStorage.removeItem(PLANNING_PREFERENCES_KEY);
    }
  }, []);

  function rememberPlanningPreference(
    key: "zoom" | "density" | "scope" | "sort",
    value: string,
  ) {
    try {
      const current = JSON.parse(
        window.localStorage.getItem(PLANNING_PREFERENCES_KEY) ?? "{}",
      ) as Record<string, unknown>;
      window.localStorage.setItem(
        PLANNING_PREFERENCES_KEY,
        JSON.stringify({ ...current, [key]: value }),
      );
    } catch {
      window.localStorage.setItem(
        PLANNING_PREFERENCES_KEY,
        JSON.stringify({ [key]: value }),
      );
    }
  }

  useEffect(() => {
    const updateClock = () => setClockNow(Date.now());
    const delayUntilNextMinute = 60_000 - (Date.now() % 60_000) + 25;
    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      updateClock();
      intervalId = window.setInterval(updateClock, 60_000);
    }, delayUntilNextMinute);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const scrollEl = boardScrollRef.current;
    if (!scrollEl || plannerInteracting) return;

    const centerMinute = isToday
      ? Math.max(
          timelineWindow.start,
          Math.min(timelineWindow.end, currentMinuteOfDay()),
        )
      : timelineWindow.start;
    const timelineX =
      PERSONNEL_COL_WIDTH +
      ((centerMinute - timelineWindow.start) / timelineWindow.span) *
        timelineWidth;
    const frame = window.requestAnimationFrame(() => {
      const maxLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
      const nextLeft = Math.min(
        maxLeft,
        Math.max(0, timelineX - scrollEl.clientWidth / 2),
      );
      scrollEl.scrollTo({
        left: nextLeft,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    data.date,
    isToday,
    timelineWidth,
    timelineWindow.end,
    timelineWindow.span,
    timelineWindow.start,
  ]);

  function scrollToMinute(minute: number, behavior: ScrollBehavior = "smooth") {
    const scrollEl = boardScrollRef.current;
    if (!scrollEl) return;
    const clampedMinute = Math.max(
      timelineWindow.start,
      Math.min(timelineWindow.end, minute),
    );
    const timelineX =
      PERSONNEL_COL_WIDTH +
      ((clampedMinute - timelineWindow.start) / timelineWindow.span) *
        timelineWidth;
    const maxLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
    scrollEl.scrollTo({
      left: Math.min(
        maxLeft,
        Math.max(0, timelineX - scrollEl.clientWidth / 2),
      ),
      behavior:
        behavior === "smooth" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : behavior,
    });
  }

  function jumpToNow() {
    if (!isToday) {
      updateQuery({ date: today });
      return;
    }
    scrollToMinute(currentMinuteOfDay());
  }

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

  function getMatch(
    assignmentId: string | null | undefined,
    personnelId: string,
  ): PlanningBoardMatch | undefined {
    if (!assignmentId) return undefined;
    return data.matchesByAssignmentId[assignmentId]?.find(
      (match) => match.personnelId === personnelId,
    );
  }

  function isAlreadyAssigned(
    assignmentId: string | null | undefined,
    personnelId: string,
  ): boolean {
    if (!assignmentId) return false;
    return (
      assignmentById
        .get(assignmentId)
        ?.assignedPersonnelIds.includes(personnelId) ?? false
    );
  }

  function handleDragStart(
    e: React.DragEvent,
    assignment: PlanningBoardAssignment,
  ) {
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

  function handleTimelineDragOver(
    e: React.DragEvent<HTMLDivElement>,
    person: PlanningBoardPersonnel,
  ) {
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
    const slot = calcDropSlot(
      e,
      current.duration,
      slotMinutes,
      workdayStart,
      person.scheduledAssignments,
      current.assignmentId,
      timelineWindow,
    );
    setGhostInfo({
      rowId: person.id,
      leftPct: slot.leftPct,
      widthPct: slot.widthPct,
      label: slot.label,
    });
  }

  function handleTimelineDrop(
    e: React.DragEvent<HTMLDivElement>,
    person: PlanningBoardPersonnel,
  ) {
    e.preventDefault();
    const current = dragging ?? dragRef.current;
    const assignmentId =
      e.dataTransfer.getData("text/plain") || current?.assignmentId;
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
      toast.error(
        `Niet inplanbaar: ${match.reasons
          .filter((reason) => reason.severity === "block")
          .map((reason) => reason.label)
          .join("; ")}`,
      );
      return;
    }

    const slot = calcDropSlot(
      e,
      current.duration,
      slotMinutes,
      workdayStart,
      person.scheduledAssignments,
      current.assignmentId,
      timelineWindow,
    );
    scheduleOnBoard(
      assignmentId,
      person.id,
      slot.start,
      slot.end,
      current.sourcePersonnelId,
      "pointer",
    );
  }

  function scheduleSelected(person: PlanningBoardPersonnel) {
    if (!activeAssignment) return;
    const match = getMatch(activeAssignment.id, person.id);
    if (isAlreadyAssigned(activeAssignment.id, person.id)) {
      toast.error("Deze medewerker is al gekoppeld aan deze werkbon.");
      return;
    }
    if (match?.level === "blocked") {
      toast.error(
        `Niet inplanbaar: ${match.reasons
          .filter((reason) => reason.severity === "block")
          .map((reason) => reason.label)
          .join("; ")}`,
      );
      return;
    }
    const start = suggestedStartForAssignment(activeAssignment, data.date);
    const startMin = parseTimeMin(start) ?? 8 * 60;
    const end = minutesToTime(
      Math.min(DAY_END_MIN, startMin + durationForAssignment(activeAssignment)),
    );
    scheduleOnBoard(activeAssignment.id, person.id, start, end, null, "touch");
  }

  function scheduleOnBoard(
    assignmentId: string,
    personnelId: string,
    start: string,
    end: string,
    sourcePersonnelId?: string | null,
    input: "pointer" | "keyboard" | "touch" = "pointer",
  ) {
    const previousPlacement = sourcePersonnelId
      ? (data.personnel
          .find((person) => person.id === sourcePersonnelId)
          ?.scheduledAssignments.find(
            (assignment) => assignment.id === assignmentId,
          ) ?? null)
      : null;
    const optimisticStart = parseTimeMin(start);
    const optimisticEnd = parseTimeMin(end);
    if (optimisticStart !== null && optimisticEnd !== null) {
      setGhostInfo({
        rowId: personnelId,
        leftPct:
          ((optimisticStart - timelineWindow.start) / timelineWindow.span) *
          100,
        widthPct:
          ((optimisticEnd - optimisticStart) / timelineWindow.span) * 100,
        label: `${start}-${end}`,
      });
      setPlannerAnnouncement(
        `Plaatsing wordt opgeslagen van ${start} tot ${end}.`,
      );
    }

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
        trackUxAnalytics({
          name: "planboard_action",
          surface: "planning",
          action: "move",
          input,
          outcome: "rejected",
        });
        toast.error(result.message);
        setPlannerAnnouncement(`Plaatsing geweigerd. ${result.message}`);
        setGhostInfo(null);
        return;
      }

      const warnings = result.data?.warnings ?? [];
      trackUxAnalytics({
        name: "planboard_action",
        surface: "planning",
        action: "move",
        input,
        outcome: "success",
      });
      if (warnings.length > 0) {
        toast.warning(
          `Ingepland met waarschuwing: ${warnings.map((warning) => warning.label).join("; ")}`,
        );
      } else {
        toast.success(
          sourcePersonnelId ? "Afspraak verplaatst." : "Werkbon ingepland.",
          previousPlacement
            ? {
                action: {
                  label: "Ongedaan maken",
                  onClick: () =>
                    undoScheduleOnBoard({
                      assignmentId,
                      currentPersonnelId: personnelId,
                      previousPersonnelId: sourcePersonnelId!,
                      start: previousPlacement.scheduledStart,
                      end: previousPlacement.scheduledEnd,
                    }),
                },
              }
            : undefined,
        );
      }

      setPlannerAnnouncement(
        `${sourcePersonnelId ? "Afspraak verplaatst" : "Werkbon ingepland"} van ${start} tot ${end}.`,
      );
      setSelectedAssignmentId(null);
      setKeyboardSourcePersonnelId(null);
      setKeyboardPlacement(null);
      setGhostInfo(null);
      router.refresh();
    });
  }

  function undoScheduleOnBoard(input: {
    assignmentId: string;
    currentPersonnelId: string;
    previousPersonnelId: string;
    start: string | null;
    end: string | null;
  }) {
    if (!input.start || !input.end) {
      toast.error("De vorige planning kon niet worden hersteld.");
      return;
    }

    startTransition(async () => {
      const result = await scheduleAssignmentOnBoard({
        assignmentId: input.assignmentId,
        personnelId: input.previousPersonnelId,
        sourcePersonnelId: input.currentPersonnelId,
        date: data.date,
        start: input.start!,
        end: input.end!,
      });
      if (!result.success) {
        trackUxAnalytics({
          name: "planboard_action",
          surface: "planning",
          action: "undo",
          input: "pointer",
          outcome: "rolled_back",
        });
        toast.error(`Ongedaan maken mislukt: ${result.message}`);
        setPlannerAnnouncement(`Ongedaan maken mislukt. ${result.message}`);
        return;
      }
      trackUxAnalytics({
        name: "planboard_action",
        surface: "planning",
        action: "undo",
        input: "pointer",
        outcome: "success",
      });
      toast.success("Vorige planning hersteld.");
      setPlannerAnnouncement("De vorige planning is hersteld.");
      router.refresh();
    });
  }

  function handleAssignmentCardKeyDown(
    e: React.KeyboardEvent<HTMLElement>,
    assignment: PlanningBoardAssignment,
    selected: boolean,
  ) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const nextId = selected ? null : assignment.id;
      setSelectedAssignmentId(nextId);
      setKeyboardSourcePersonnelId(null);
      setDetailAssignmentId(nextId);
      if (openQueueOpen) setOpenQueueOpen(false);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSelectedAssignmentId(null);
      setKeyboardSourcePersonnelId(null);
      setDetailAssignmentId(null);
      setOpenQueueOpen(false);
    }
  }

  function handleScheduledAssignmentKeyDown(
    event: React.KeyboardEvent<HTMLElement>,
    assignment: PlanningBoardPersonnelAssignment,
    sourcePersonnelId: string,
  ) {
    if (!canWrite || !isPlanboardMovableStatus(assignment.status)) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    event.stopPropagation();
    const start =
      parseTimeMin(assignment.scheduledStart ?? assignment.effectiveStart) ??
      timelineWindow.start;
    const end =
      parseTimeMin(assignment.scheduledEnd ?? assignment.effectiveEnd) ??
      Math.min(
        timelineWindow.end,
        start + Math.max(30, assignment.estimatedDurationMinutes || 60),
      );
    setSelectedAssignmentId(assignment.id);
    setDetailAssignmentId(assignment.id);
    setKeyboardSourcePersonnelId(sourcePersonnelId);
    setKeyboardPlacement({
      personnelId: sourcePersonnelId,
      start,
      end,
    });
    setGhostInfo({
      rowId: sourcePersonnelId,
      leftPct: ((start - timelineWindow.start) / timelineWindow.span) * 100,
      widthPct: ((end - start) / timelineWindow.span) * 100,
      label: `${minutesToTime(start)}-${minutesToTime(end)}`,
    });
    setPlannerAnnouncement(
      `${assignment.code} geselecteerd om te verplaatsen. Ga naar een planningtijdlijn, gebruik links of rechts en druk Enter om te bevestigen.`,
    );
  }

  function handleTimelineKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    person: PlanningBoardPersonnel,
  ) {
    if (!canWrite || !activeAssignment) return;
    const match = getMatch(activeAssignment.id, person.id);
    const alreadyAssigned = isAlreadyAssigned(activeAssignment.id, person.id);
    if (
      match?.level === "blocked" ||
      (alreadyAssigned && keyboardSourcePersonnelId !== person.id)
    ) {
      return;
    }

    const duration = durationForAssignment(activeAssignment);
    const suggested =
      parseTimeMin(suggestedStartForAssignment(activeAssignment, data.date)) ??
      timelineWindow.start;
    const current =
      keyboardPlacement?.personnelId === person.id
        ? keyboardPlacement.start
        : Math.max(
            timelineWindow.start,
            Math.min(timelineWindow.end - duration, suggested),
          );

    if (event.key === "Escape") {
      event.preventDefault();
      setKeyboardPlacement(null);
      setKeyboardSourcePersonnelId(null);
      setSelectedAssignmentId(null);
      setGhostInfo(null);
      setPlannerAnnouncement("Toetsenbordplaatsing geannuleerd.");
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const step = event.shiftKey ? 15 : 5;
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const start = Math.max(
        timelineWindow.start,
        Math.min(timelineWindow.end - duration, current + direction * step),
      );
      const end = start + duration;
      const label = `${minutesToTime(start)}-${minutesToTime(end)}`;
      setKeyboardPlacement({ personnelId: person.id, start, end });
      setGhostInfo({
        rowId: person.id,
        leftPct: ((start - timelineWindow.start) / timelineWindow.span) * 100,
        widthPct: (duration / timelineWindow.span) * 100,
        label,
      });
      setPlannerAnnouncement(
        `${person.firstName} ${person.lastName}, ${label}. ${event.shiftKey ? "15" : "5"} minuten verplaatst. Druk Enter om te bevestigen.`,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const placement =
        keyboardPlacement?.personnelId === person.id
          ? keyboardPlacement
          : { personnelId: person.id, start: current, end: current + duration };
      scheduleOnBoard(
        activeAssignment.id,
        person.id,
        minutesToTime(placement.start),
        minutesToTime(placement.end),
        keyboardSourcePersonnelId,
        "keyboard",
      );
    }
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
  const detailMatches = detailAssignment
    ? (data.matchesByAssignmentId[detailAssignment.id] ?? [])
    : [];
  const detailStats = matchStats(detailMatches);

  return (
    <TooltipProvider delayDuration={180}>
      <div className="space-y-4">
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {plannerAnnouncement}
        </p>
        <section
          className="overflow-hidden rounded-xl border bg-white shadow-sm"
          style={{ borderColor: "#DDE7F0" }}
        >
          <div
            className="relative border-b px-4 py-4"
            style={{
              borderColor: "#E2E8F0",
              background:
                "linear-gradient(135deg, #F8FBFF 0%, #FFFFFF 58%, #EFFFFD 100%)",
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl shadow-sm"
                  style={
                    isToday
                      ? { background: "var(--color-primary)", color: "#fff" }
                      : { background: "var(--color-foreground)", color: "#fff" }
                  }
                >
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      className="font-heading text-xl font-semibold capitalize tracking-tight"
                      style={{ color: "var(--color-foreground)" }}
                    >
                      {formatBoardDate(data.date)}
                    </h2>
                    {activeCapacityTone && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
                        style={{
                          background: activeCapacityTone.bg,
                          borderColor: activeCapacityTone.border,
                          color: activeCapacityTone.text,
                        }}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {activeCapacityTone.label}
                      </span>
                    )}
                  </div>
                  <p
                    className="mt-1 max-w-2xl text-sm"
                    style={{ color: "#64748B" }}
                  >
                    Selecteer een werkbon en plan met de knop, het toetsenbord
                    of slepen. Gebruik pijltjestoetsen voor 5 minuten en Shift
                    voor 15 minuten.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateQuery({ date: addDaysLocal(data.date, -1) })
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                  Vorige
                </Button>
                <Button
                  variant={isToday ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateQuery({ date: today })}
                >
                  Vandaag
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateQuery({ date: addDaysLocal(data.date, 1) })
                  }
                >
                  Volgende
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/planning?day=${data.date}`}>Dag</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/planning?month=${data.date.slice(0, 7)}`}>
                    Maand
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {planningPulseCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-lg border bg-white/85 px-3 py-2.5 shadow-sm"
                  style={{ borderColor: "#E2E8F0" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: "#64748B" }}
                    >
                      {card.label}
                    </p>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: card.tone }}
                    />
                  </div>
                  <p
                    className="mt-1 text-2xl font-semibold leading-none"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    {card.value}
                  </p>
                  <p
                    className="mt-1 truncate text-xs"
                    style={{ color: "#64748B" }}
                  >
                    {card.hint}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <form
              onSubmit={submitSearch}
              className="flex w-full min-w-0 flex-1 items-center gap-2 sm:min-w-[280px]"
            >
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Werkbonnen zoeken</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "#94A3B8" }}
                />
                <Input
                  type="search"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="h-10 rounded-lg pl-9"
                  placeholder="Zoek werkbon, klant, object of regio"
                />
              </label>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                aria-label="Zoeken"
                className="h-10"
              >
                <Search className="h-4 w-4" />
              </Button>
            </form>

            {activeAssignment && (
              <div
                className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-xs xl:flex"
                style={{
                  borderColor: "#BFDBFE",
                  background: "#EFF6FF",
                  color: "#1D4ED8",
                }}
              >
                <Sparkles className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">
                  Beste kandidaten staan bovenaan voor{" "}
                  <strong>{activeAssignment.code}</strong>
                  {topMatchScore !== null
                    ? ` - hoogste match ${topMatchScore}%`
                    : ""}
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
                <label
                  className="grid gap-1 text-xs font-medium"
                  style={{ color: "#64748B" }}
                >
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
                    ...data.filterOptions.customers.map((customer) => ({
                      value: customer.id,
                      label: customer.name,
                    })),
                  ]}
                />
                <FilterSelect
                  className="w-full"
                  label="Sector"
                  value={selectedSector}
                  onChange={(value) => updateQuery({ sectorId: value })}
                  options={[
                    { value: "all", label: "Alle sectoren" },
                    ...data.filterOptions.sectors.map((sector) => ({
                      value: sector.id,
                      label: sector.name,
                    })),
                  ]}
                />
                <FilterSelect
                  className="w-full"
                  label="Regio"
                  value={selectedRegion}
                  onChange={(value) => updateQuery({ region: value })}
                  options={[
                    { value: "all", label: "Alle regio's" },
                    ...data.filterOptions.regions.map((region) => ({
                      value: region,
                      label: region,
                    })),
                  ]}
                />
                <FilterSelect
                  className="w-full"
                  label="Prioriteit"
                  value={selectedPriority}
                  onChange={(value) => updateQuery({ priority: value })}
                  options={[
                    { value: "all", label: "Alle prioriteiten" },
                    ...data.filterOptions.priorities.map((priority) => ({
                      value: priority,
                      label: priorityLabel(priority),
                    })),
                  ]}
                />
                <FilterSelect
                  className="w-full"
                  label="Status"
                  value={selectedStatus}
                  onChange={(value) => updateQuery({ status: value })}
                  options={[
                    { value: "all", label: "Alle statussen" },
                    ...data.filterOptions.statuses.map((status) => ({
                      value: status,
                      label: statusLabel(status),
                    })),
                  ]}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  className="justify-center"
                >
                  <X className="h-4 w-4" />
                  Filters wissen
                </Button>
              </div>
            </TenantFilterDrawer>
          </div>
        </section>

        <div className="grid min-w-0 gap-4">
          <section className="hidden" style={{ borderColor: "#DDE7F0" }}>
            <div
              className="flex items-center justify-between gap-3 border-b px-4 py-3"
              style={{ borderColor: "#E2E8F0", background: "#FBFDFF" }}
            >
              <div>
                <h3
                  className="flex items-center gap-2 font-heading text-sm font-semibold"
                  style={{ color: "var(--color-foreground)" }}
                >
                  <Layers3 className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                  Werkbon-wachtrij
                </h3>
                <p className="mt-0.5 text-xs" style={{ color: "#64748B" }}>
                  Selecteer of sleep naar een medewerker
                </p>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: "#ECFDF5", color: "#047857" }}
              >
                {openSlotCount} open
              </span>
            </div>

            {data.openAssignments.length === 0 ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
                <CheckCircle2
                  className="mb-3 h-9 w-9"
                  style={{ color: "#CBD5E1" }}
                />
                <p className="text-sm font-medium" style={{ color: "#64748B" }}>
                  Geen open werkbonnen
                </p>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-300px)] min-h-[520px] space-y-3 overflow-y-auto p-3">
                {data.openAssignments.map((assignment) => {
                  const selected = selectedAssignmentId === assignment.id;
                  const stats = matchStats(
                    data.matchesByAssignmentId[assignment.id],
                  );
                  const duration = durationForAssignment(assignment);
                  const scheduleDate = assignment.scheduledDate ?? data.date;
                  const scheduleLabel = formatShortDate(scheduleDate);
                  const timeLabel = workOrderTimeLabel(assignment);
                  const title = displayWorkOrderTitle(assignment.title);
                  const sectorStyle = sectorBadgeStyle(assignment.sectorName);
                  const sectorShort = sectorShortLabel(assignment.sectorName);
                  const staffingState = planboardStaffingState(assignment);
                  const staffingStateText =
                    planboardStaffingStateLabel(staffingState);

                  return (
                    <article
                      key={assignment.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      aria-grabbed={
                        canWrite && dragging?.assignmentId === assignment.id
                      }
                      aria-label={`Selecteer open werkbon ${assignment.code}: ${title}`}
                      draggable={canWrite}
                      onKeyDown={(e) =>
                        handleAssignmentCardKeyDown(e, assignment, selected)
                      }
                      onDragStart={(e) => handleDragStart(e, assignment)}
                      onDragEnd={handleDragEnd}
                      onClick={() => {
                        const nextId = selected ? null : assignment.id;
                        setSelectedAssignmentId(nextId);
                        setDetailAssignmentId(nextId);
                      }}
                      className="group relative overflow-hidden rounded-xl border bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      style={{
                        borderColor: selected ? "var(--color-primary)" : "#E2E8F0",
                        boxShadow: selected
                          ? "0 0 0 3px rgba(0,183,179,0.12)"
                          : undefined,
                        cursor: canWrite ? "grab" : "default",
                      }}
                    >
                      <div
                        className="absolute bottom-0 left-0 top-0 w-1"
                        style={{ background: sectorStyle.borderColor }}
                      />
                      <div className="flex items-start gap-2 pl-1">
                        {canWrite && (
                          <GripVertical
                            className="mt-1 h-3.5 w-3.5 flex-shrink-0"
                            style={{ color: "#CBD5E1" }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span
                                className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none"
                                style={{
                                  background: sectorStyle.background,
                                  borderColor: sectorStyle.borderColor,
                                  color: sectorStyle.color,
                                }}
                              >
                                {sectorShort}
                              </span>
                              <span
                                className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] leading-none"
                                style={{ color: "#475569" }}
                              >
                                {assignment.code}
                              </span>
                            </div>
                            <div className="flex flex-wrap justify-end gap-1 [&>span]:px-1.5 [&>span]:text-[10px] [&>span]:leading-none">
                              <AssignmentPriorityBadge
                                priority={assignment.priority}
                              />
                              <AssignmentStatusBadge
                                status={assignment.status}
                              />
                            </div>
                          </div>
                          <Link
                            href={`/assignments/${assignment.id}`}
                            className="mt-2 block text-[13px] font-semibold leading-snug hover:underline"
                            style={{ color: "var(--color-foreground)" }}
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

                      <div
                        className="mt-2 rounded-lg border px-2 py-1.5"
                        style={{
                          borderColor: "#E2E8F0",
                          background: "#F8FAFC",
                        }}
                      >
                        <div
                          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[11px] font-medium"
                          style={{ color: "#334155" }}
                        >
                          <span className="inline-flex min-w-0 items-center gap-1 truncate">
                            <CalendarDays
                              className="h-3 w-3 flex-shrink-0"
                              style={{ color: "#64748B" }}
                            />
                            <span className="truncate">{scheduleLabel}</span>
                          </span>
                          <span className="inline-flex min-w-0 items-center gap-1 truncate">
                            <Clock
                              className="h-3 w-3 flex-shrink-0"
                              style={{ color: "#64748B" }}
                            />
                            <span className="truncate">{timeLabel}</span>
                          </span>
                        </div>
                      </div>

                      <div
                        className="mt-2 space-y-1 text-[11px]"
                        style={{ color: "#64748B" }}
                      >
                        <p className="truncate">
                          {assignment.customerName}
                          {assignment.objectName
                            ? ` - ${assignment.objectName}`
                            : ""}
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
                            <span title={staffingStateText}>
                              {slotLabel(
                                assignment.filledSlots,
                                assignment.requiredSlots,
                              )}
                            </span>
                          </span>
                          {assignment.requiredRegion && (
                            <span className="inline-flex min-w-0 items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">
                                {assignment.requiredRegion}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {assignment.requirements.requiredRoleNames
                          .slice(0, 2)
                          .map((role) => (
                            <span
                              key={role}
                              className="rounded border px-1.5 py-0.5 text-[10px]"
                              style={{
                                borderColor: "#E2E8F0",
                                color: "#64748B",
                              }}
                            >
                              {formatPersonnelRoleName(role)}
                            </span>
                          ))}
                        {assignment.requiredSlots > 1 && (
                          <span
                            className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              borderColor: "#BFDBFE",
                              background: "#EFF6FF",
                              color: "#1D4ED8",
                            }}
                          >
                            <Users className="h-3 w-3" />
                            Team{" "}
                            {slotLabel(
                              assignment.filledSlots,
                              assignment.requiredSlots,
                            )}{" "}
                            · {staffingStateText}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                        <span
                          className="rounded px-1.5 py-0.5 leading-none"
                          style={{ background: "#ECFDF5", color: "#047857" }}
                        >
                          {stats.match} match
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 leading-none"
                          style={{ background: "#FFFBEB", color: "#B45309" }}
                        >
                          {stats.warning} waarschuwing
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 leading-none"
                          style={{ background: "#FEF2F2", color: "#B91C1C" }}
                        >
                          {stats.blocked} blok
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
              style={{ borderColor: "#E2E8F0", background: "#FBFDFF" }}
            >
              <div className="min-w-0 text-xs" style={{ color: "#64748B" }}>
                {activeAssignment ? (
                  <span
                    className="inline-flex max-w-[620px] items-center gap-2 truncate rounded-lg border px-2.5 py-1.5"
                    style={{
                      borderColor: "#BFDBFE",
                      background: "#EFF6FF",
                      color: "#1D4ED8",
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="font-semibold">
                      {activeAssignment.code}
                    </span>
                    <span className="truncate">
                      {displayWorkOrderTitle(activeAssignment.title)}
                    </span>
                    {activeAssignment.sectorName && (
                      <span
                        className="ml-1 rounded border px-1.5 py-0.5 text-[10px]"
                        style={sectorBadgeStyle(activeAssignment.sectorName)}
                      >
                        {sectorShortLabel(activeAssignment.sectorName)}
                      </span>
                    )}
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-2 font-medium"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    <Activity
                      className="h-4 w-4"
                      style={{ color: "var(--color-primary)" }}
                    />
                    Live planbord met {data.personnel.length} medewerkers
                    zichtbaar
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeAssignment && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setDetailAssignmentId(activeAssignment.id)}
                  >
                    Details
                  </Button>
                )}
                <Sheet open={openQueueOpen} onOpenChange={setOpenQueueOpen}>
                  <SheetTrigger asChild>
                    <Button
                      type="button"
                      variant={openQueueOpen ? "default" : "outline"}
                      size="sm"
                      className="h-8"
                      aria-label="Openstaande werkbonnen"
                    >
                      <Layers3 className="h-3.5 w-3.5" />
                      Openstaand ({data.openAssignments.length})
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full p-0 sm:max-w-md">
                    <SheetHeader className="border-b border-border px-4 py-4 pr-14 text-left">
                      <SheetTitle>Werkvoorraad</SheetTitle>
                      <SheetDescription>
                        {openSlotCount} open plaatsen te plannen
                      </SheetDescription>
                    </SheetHeader>
                    {data.openAssignments.length === 0 ? (
                      <div
                        className="flex min-h-[160px] items-center justify-center px-6 text-center text-sm"
                        style={{ color: "#64748B" }}
                      >
                        Geen open werkbonnen.
                      </div>
                    ) : (
                      <div className="max-h-[520px] space-y-2 overflow-y-auto p-3">
                        {data.openAssignments.map((assignment) => {
                          const selected =
                            selectedAssignmentId === assignment.id;
                          const stats = matchStats(
                            data.matchesByAssignmentId[assignment.id],
                          );
                          const sectorStyle = sectorBadgeStyle(
                            assignment.sectorName,
                          );
                          const statusStyle = pastelForAppointment(assignment);
                          const title = displayWorkOrderTitle(assignment.title);

                          return (
                            <article
                              key={assignment.id}
                              role="button"
                              tabIndex={0}
                              aria-pressed={selected}
                              aria-grabbed={
                                canWrite &&
                                dragging?.assignmentId === assignment.id
                              }
                              aria-label={`Selecteer open werkbon ${assignment.code}: ${title}`}
                              draggable={canWrite}
                              onKeyDown={(e) =>
                                handleAssignmentCardKeyDown(
                                  e,
                                  assignment,
                                  selected,
                                )
                              }
                              onDragStart={(e) =>
                                handleDragStart(e, assignment)
                              }
                              onDragEnd={handleDragEnd}
                              onClick={() => {
                                const nextId = selected ? null : assignment.id;
                                setSelectedAssignmentId(nextId);
                                setDetailAssignmentId(nextId);
                                setOpenQueueOpen(false);
                              }}
                              className="relative overflow-hidden rounded-lg border bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                              style={{
                                borderColor: selected
                                  ? "var(--color-primary)"
                                  : statusStyle.border,
                                boxShadow: selected
                                  ? "0 0 0 3px rgba(0,183,179,0.12)"
                                  : undefined,
                                cursor: canWrite ? "grab" : "pointer",
                              }}
                            >
                              <div
                                className="absolute bottom-0 left-0 top-0 w-1"
                                style={{ background: statusStyle.rail }}
                              />
                              <div className="flex items-start justify-between gap-3 pl-1">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none"
                                      style={{
                                        background: sectorStyle.background,
                                        borderColor: sectorStyle.borderColor,
                                        color: sectorStyle.color,
                                      }}
                                    >
                                      {sectorShortLabel(assignment.sectorName)}
                                    </span>
                                    <span
                                      className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] leading-none"
                                      style={{ color: "#475569" }}
                                    >
                                      {assignment.code}
                                    </span>
                                    <AssignmentStatusBadge
                                      status={assignment.status}
                                    />
                                    {assignment.priority !== "normal" && (
                                      <AssignmentPriorityBadge
                                        priority={assignment.priority}
                                      />
                                    )}
                                  </div>
                                  <p
                                    className="mt-1.5 truncate text-[13px] font-semibold"
                                    style={{ color: "var(--color-foreground)" }}
                                  >
                                    {title}
                                  </p>
                                  <p
                                    className="mt-0.5 truncate text-[11px]"
                                    style={{ color: "#64748B" }}
                                  >
                                    {assignment.customerName}
                                    {assignment.objectName
                                      ? ` - ${assignment.objectName}`
                                      : ""}
                                  </p>
                                </div>
                                <div className="flex flex-shrink-0 flex-col items-end gap-1 text-[10px]">
                                  <span
                                    className="rounded px-1.5 py-0.5"
                                    style={{
                                      background: "#ECFDF5",
                                      color: "#047857",
                                    }}
                                  >
                                    {stats.match} match
                                  </span>
                                  <span
                                    className="rounded px-1.5 py-0.5"
                                    style={{
                                      background: "#FEF2F2",
                                      color: "#B91C1C",
                                    }}
                                  >
                                    {stats.blocked} blok
                                  </span>
                                </div>
                              </div>
                              <div
                                className="mt-2 grid grid-cols-3 gap-1.5 rounded-md border px-2 py-1.5 text-[11px]"
                                style={{
                                  borderColor: "#E2E8F0",
                                  background: "#F8FAFC",
                                  color: "#64748B",
                                }}
                              >
                                <span className="inline-flex items-center gap-1 truncate">
                                  <CalendarDays className="h-3 w-3" />
                                  {formatShortDate(
                                    assignment.scheduledDate ?? data.date,
                                  )}
                                </span>
                                <span className="inline-flex items-center gap-1 truncate">
                                  <Clock className="h-3 w-3" />
                                  {workOrderTimeLabel(assignment)}
                                </span>
                                <span className="inline-flex items-center gap-1 truncate">
                                  <Users className="h-3 w-3" />
                                  {slotLabel(
                                    assignment.filledSlots,
                                    assignment.requiredSlots,
                                  )}
                                </span>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </SheetContent>
                </Sheet>
                <ToggleGroup
                  type="single"
                  value={timelineScope}
                  onValueChange={(value) => {
                    if (value !== "workday" && value !== "full") return;
                    setTimelineScope(value);
                    rememberPlanningPreference("scope", value);
                  }}
                  aria-label="Tijdsvenster planbord"
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem value="workday">Werkdag</ToggleGroupItem>
                  <ToggleGroupItem value="full">Volledige dag</ToggleGroupItem>
                </ToggleGroup>
                <ToggleGroup
                  type="single"
                  value={zoomLevel}
                  onValueChange={(value) => {
                    if (!ZOOM_LEVELS.some((level) => level.id === value))
                      return;
                    setZoomLevel(value as (typeof ZOOM_LEVELS)[number]["id"]);
                    rememberPlanningPreference("zoom", value);
                  }}
                  aria-label="Zoomniveau planbord"
                  variant="outline"
                  size="sm"
                >
                  {ZOOM_LEVELS.map((level) => (
                    <ToggleGroupItem key={level.id} value={level.id}>
                      {level.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <ToggleGroup
                  type="single"
                  value={rowDensity}
                  onValueChange={(value) => {
                    if (!DENSITY_LEVELS.some((level) => level.id === value))
                      return;
                    setRowDensity(
                      value as (typeof DENSITY_LEVELS)[number]["id"],
                    );
                    rememberPlanningPreference("density", value);
                  }}
                  aria-label="Rijdichtheid planbord"
                  variant="outline"
                  size="sm"
                >
                  {DENSITY_LEVELS.map((level) => (
                    <ToggleGroupItem key={level.id} value={level.id}>
                      {level.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Select
                  value={personnelSort}
                  onValueChange={(value) => {
                    if (
                      !PERSONNEL_SORT_OPTIONS.some(
                        (option) => option.value === value,
                      )
                    )
                      return;
                    setPersonnelSort(
                      value as (typeof PERSONNEL_SORT_OPTIONS)[number]["value"],
                    );
                    rememberPlanningPreference("sort", value);
                  }}
                >
                  <SelectTrigger
                    className="min-h-9 w-[168px]"
                    aria-label="Sorteer medewerkers"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSONNEL_SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  Gesorteerd op{" "}
                  {PERSONNEL_SORT_OPTIONS.find(
                    (option) => option.value === personnelSort,
                  )?.label.toLowerCase()}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => scrollToMinute(configuredStart)}
                >
                  {minutesToTime(configuredStart)}
                </Button>
                <Button
                  type="button"
                  variant={isToday ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={jumpToNow}
                >
                  Nu
                </Button>
                {isPending && (
                  <span
                    className="inline-flex items-center gap-1 text-xs"
                    style={{ color: "#64748B" }}
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Opslaan
                  </span>
                )}
              </div>
            </div>

            {data.personnel.length > 0 && (
              <section
                className="space-y-3 p-3 lg:hidden"
                aria-label="Mobiele dagagenda"
              >
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-sm font-semibold text-foreground">
                    Dagagenda
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Kies eerst een open werkbon via Werkvoorraad. Kies daarna
                    een medewerker en bevestig het voorgestelde tijdstip.
                  </p>
                </div>
                {visiblePersonnel.map((person) => {
                  const match = getMatch(activeAssignmentId, person.id);
                  const alreadyAssigned = isAlreadyAssigned(
                    activeAssignmentId,
                    person.id,
                  );
                  const canPlaceSelected = Boolean(
                    activeAssignment &&
                    canWrite &&
                    match?.level !== "blocked" &&
                    !alreadyAssigned,
                  );
                  return (
                    <article
                      key={`mobile-${person.id}`}
                      className="rounded-lg border border-border bg-card p-3 shadow-card"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {person.firstName} {person.lastName}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {
                              availabilityConfig(person.availabilityStatus)
                                .label
                            }
                            {person.region ? ` · ${person.region}` : ""}
                          </p>
                        </div>
                        {canPlaceSelected && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => scheduleSelected(person)}
                            disabled={isPending}
                          >
                            Plan hier
                          </Button>
                        )}
                      </div>
                      {person.scheduledAssignments.length > 0 ? (
                        <ul className="mt-3 space-y-2">
                          {person.scheduledAssignments.map((assignment) => (
                            <li key={`mobile-${person.id}-${assignment.id}`}>
                              <Link
                                href={`/assignments/${assignment.id}`}
                                className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-foreground">
                                    {displayWorkOrderTitle(assignment.title)}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {compactPlanboardDisplayWindow(assignment)}
                                  </span>
                                </span>
                                <AssignmentStatusBadge
                                  status={assignment.status}
                                />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                          Geen opdrachten in deze dagagenda.
                        </p>
                      )}
                    </article>
                  );
                })}
              </section>
            )}

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
                className="hidden h-[calc(100vh-300px)] min-h-[420px] max-w-full overflow-auto overscroll-contain lg:block"
                onPointerDown={() => setPlannerInteracting(true)}
                onWheel={() => setPlannerInteracting(true)}
                role="region"
                aria-label="Live planbord tijdlijn"
                style={{ opacity: isPending ? 0.82 : 1 }}
              >
                <div style={{ width: boardWidth, minWidth: "100%" }}>
                  <div
                    className="sticky top-0 z-30 h-10 border-b bg-white"
                    style={{ borderColor: "#E2E8F0" }}
                  >
                    <div
                      className="sticky left-0 top-0 z-30 flex h-full items-center border-r bg-white px-3 text-[11px] font-semibold uppercase tracking-wide"
                      style={{
                        width: PERSONNEL_COL_WIDTH,
                        borderColor: "#E2E8F0",
                        color: "#64748B",
                      }}
                    >
                      Medewerker
                    </div>
                    <div
                      className="absolute bottom-0 top-0"
                      style={{
                        left: PERSONNEL_COL_WIDTH,
                        width: timelineWidth,
                      }}
                    >
                      {hourLabels.map((hour) => (
                        <div
                          key={hour.label}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px]"
                          style={{ left: `${hour.pct}%`, color: "#64748B" }}
                        >
                          {hour.label}
                        </div>
                      ))}
                      {currentTimePct !== null && (
                        <div
                          className="absolute bottom-0 top-0 z-10 -translate-x-1/2"
                          style={{ left: `${currentTimePct}%` }}
                        >
                          <span
                            className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow"
                            style={{ background: "var(--color-primary)" }}
                          />
                          <span
                            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[10px] font-bold shadow-sm"
                            style={{ background: "var(--color-primary)", color: "var(--color-foreground)" }}
                          >
                            Nu {minutesToTime(liveMinute)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <div
                      className="pointer-events-none absolute inset-y-0"
                      style={{
                        left: PERSONNEL_COL_WIDTH,
                        width: timelineWidth,
                      }}
                    >
                      {hourLabels.map((hour) => (
                        <div
                          key={hour.label}
                          className="absolute inset-y-0"
                          style={{
                            left: `${hour.pct}%`,
                            borderLeft: "1px solid #F1F5F9",
                          }}
                        />
                      ))}
                      {visibleSlotMarkers.map((slot) => (
                        <div
                          key={`slot-line-${slot.label}`}
                          className="absolute inset-y-0"
                          style={{
                            left: `${slot.pct}%`,
                            borderLeft: slot.isStart
                              ? "2px solid rgba(0,183,179,0.28)"
                              : "1px dashed rgba(14,165,233,0.18)",
                          }}
                        />
                      ))}
                      {currentTimePct !== null && (
                        <div
                          className="absolute inset-y-0 z-10"
                          style={{
                            left: `${currentTimePct}%`,
                            borderLeft: "2px solid var(--color-primary)",
                            boxShadow: "0 0 0 1px rgba(0,183,179,0.08)",
                          }}
                        />
                      )}
                    </div>

                    {visiblePersonnel.map((person, index) => {
                      const rowBg = index % 2 === 0 ? "#FFFFFF" : "#FCFDFF";
                      const availability = availabilityConfig(
                        person.availabilityStatus,
                      );
                      const match = getMatch(activeAssignmentId, person.id);
                      const matchStyles = matchConfig(match);
                      const isGhostRow = ghostInfo?.rowId === person.id;
                      const alreadyAssigned = isAlreadyAssigned(
                        activeAssignmentId,
                        person.id,
                      );
                      const interestIndicator =
                        planboardInterestAsAssignedIndicator(
                          (
                            match as
                              | { interestStatus?: string | null }
                              | undefined
                          )?.interestStatus,
                        );
                      const canPlaceSelected = Boolean(
                        activeAssignment &&
                        canWrite &&
                        match?.level !== "blocked" &&
                        !alreadyAssigned,
                      );
                      const availabilityBlock = person.availabilityWindow
                        ? timeBlock(
                            person.availabilityWindow.startTime,
                            person.availabilityWindow.endTime,
                            timelineWindow,
                          )
                        : null;

                      return (
                        <div
                          key={person.id}
                          className="relative grid border-b"
                          style={{
                            gridTemplateColumns: `${PERSONNEL_COL_WIDTH}px ${timelineWidth}px`,
                            minHeight: density.rowHeight,
                            borderColor: "#F1F5F9",
                            background: rowBg,
                          }}
                        >
                          <div
                            className="sticky left-0 z-20 flex min-w-0 items-center justify-between gap-2 border-r px-3 py-2.5"
                            style={{
                              background: rowBg,
                              borderColor: "#E2E8F0",
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span
                                  role="img"
                                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                  style={{
                                    background:
                                      person.availabilityStatus ===
                                      "beschikbaar"
                                        ? "#22C55E"
                                        : "#EF4444",
                                  }}
                                  aria-label={availability.label}
                                />
                                <div
                                  className="truncate text-[13px] font-semibold leading-tight"
                                  style={{ color: "var(--color-foreground)" }}
                                >
                                  {person.lastName}, {person.firstName}
                                </div>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="ml-auto rounded-full p-1 hover:bg-slate-100"
                                      aria-label="Personeelsinformatie"
                                    >
                                      <Info
                                        className="h-3.5 w-3.5"
                                        style={{ color: "#64748B" }}
                                      />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="right"
                                    className="max-w-[280px] space-y-2 rounded-xl border bg-white p-3 text-xs shadow-xl"
                                    style={{ color: "#334155" }}
                                  >
                                    <p
                                      className="font-semibold"
                                      style={{ color: "var(--color-foreground)" }}
                                    >
                                      {person.lastName}, {person.firstName}
                                    </p>
                                    <p>
                                      <span className="font-medium">
                                        Beschikbaarheid:
                                      </span>{" "}
                                      {availability.label}
                                      {person.availabilityWindow
                                        ? ` · ${person.availabilityWindow.startTime}-${person.availabilityWindow.endTime}`
                                        : ""}
                                    </p>
                                    <p>
                                      <span className="font-medium">
                                        Branches/regio's:
                                      </span>{" "}
                                      {[
                                        person.region,
                                        ...person.preferredRegions,
                                      ]
                                        .filter(Boolean)
                                        .join(", ") || "Geen branch/regio"}
                                    </p>
                                    <p>
                                      <span className="font-medium">
                                        Diensten:
                                      </span>{" "}
                                      {person.sectorName ??
                                        (formatPersonnelRoleName(
                                          person.roleName,
                                        ) ||
                                          "Niet ingesteld")}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <div
                                className="mt-1 flex items-center gap-2 text-[10px]"
                                style={{ color: "#64748B" }}
                              >
                                {person.region && (
                                  <span className="inline-flex min-w-0 items-center gap-1 truncate">
                                    <MapPin className="h-3 w-3" />
                                    {person.region}
                                  </span>
                                )}
                                <span>
                                  {Math.round(
                                    (person.scheduledMinutes / 60) * 10,
                                  ) / 10}
                                  u
                                </span>
                              </div>
                            </div>

                            {activeAssignment && (
                              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="rounded border px-1.5 py-0.5 text-[10px] font-medium"
                                      style={{
                                        borderColor: matchStyles.border,
                                        background: matchStyles.bg,
                                        color: matchStyles.text,
                                      }}
                                    >
                                      {matchStyles.label}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="right"
                                    className="max-w-[260px]"
                                  >
                                    {match?.reasons.length ? (
                                      <div className="space-y-1">
                                        {match.reasons
                                          .slice(0, 6)
                                          .map((reason) => (
                                            <p
                                              key={`${reason.code}-${reason.label}`}
                                            >
                                              {reason.label}
                                            </p>
                                          ))}
                                      </div>
                                    ) : (
                                      <p>Geen matchdetails beschikbaar.</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                                {canPlaceSelected && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => scheduleSelected(person)}
                                    disabled={isPending}
                                  >
                                    <CalendarDays className="h-3.5 w-3.5" />
                                    Plan
                                  </Button>
                                )}
                                {activeAssignment && alreadyAssigned && (
                                  <span
                                    className="rounded border px-1.5 py-0.5 text-[10px] font-medium"
                                    style={{
                                      borderColor: "#BFDBFE",
                                      background: "#EFF6FF",
                                      color: "#1D4ED8",
                                    }}
                                  >
                                    {interestIndicator.countsAsAssigned &&
                                    interestIndicator.label
                                      ? interestIndicator.label
                                      : "Gekoppeld"}
                                  </span>
                                )}
                                {activeAssignment &&
                                  !alreadyAssigned &&
                                  interestIndicator.label && (
                                    <span
                                      className="rounded border px-1.5 py-0.5 text-[10px] font-medium"
                                      style={{
                                        borderColor: "#A7F3D0",
                                        background: "#ECFDF5",
                                        color: "#047857",
                                      }}
                                    >
                                      {interestIndicator.label}
                                    </span>
                                  )}
                              </div>
                            )}
                          </div>

                          <div
                            className="relative z-10 px-2"
                            style={{
                              minHeight: density.rowHeight,
                              paddingTop: density.inset,
                              paddingBottom: density.inset,
                              cursor: canWrite && dragging ? "copy" : undefined,
                              outline: isGhostRow
                                ? `1px dashed ${matchStyles.border}`
                                : undefined,
                              outlineOffset: isGhostRow ? "-3px" : undefined,
                              background: isGhostRow
                                ? matchStyles.bg
                                : undefined,
                              transition:
                                "background 0.12s ease, outline 0.12s ease",
                            }}
                            role="region"
                            tabIndex={0}
                            aria-label={`Planningtijdlijn voor ${person.firstName} ${person.lastName}. Gebruik links en rechts in stappen van 5 minuten, Shift voor 15 minuten en Enter om te bevestigen.`}
                            aria-dropeffect={
                              canWrite && dragging ? "move" : undefined
                            }
                            onKeyDown={(event) =>
                              handleTimelineKeyDown(event, person)
                            }
                            onDragOver={
                              canWrite
                                ? (e) => handleTimelineDragOver(e, person)
                                : undefined
                            }
                            onDragLeave={
                              canWrite ? () => setGhostInfo(null) : undefined
                            }
                            onDrop={
                              canWrite
                                ? (e) => handleTimelineDrop(e, person)
                                : undefined
                            }
                          >
                            {availabilityBlock && (
                              <div
                                className="absolute rounded"
                                style={{
                                  top: density.inset,
                                  bottom: density.inset,
                                  left: `${availabilityBlock.left}%`,
                                  width: `${availabilityBlock.width}%`,
                                  background: "rgba(0,183,179,0.07)",
                                  border: "1px dashed rgba(0,183,179,0.22)",
                                }}
                              />
                            )}

                            {isGhostRow && ghostInfo && (
                              <div
                                className="absolute z-20 flex items-center justify-center rounded-md px-2"
                                style={{
                                  top: density.inset,
                                  bottom: density.inset,
                                  left: `${ghostInfo.leftPct}%`,
                                  width: `${ghostInfo.widthPct}%`,
                                  minWidth: "76px",
                                  background: matchStyles.bg,
                                  border: `2px dashed ${matchStyles.border}`,
                                  color: matchStyles.text,
                                }}
                              >
                                <span className="truncate text-xs font-semibold">
                                  {ghostInfo.label}
                                </span>
                              </div>
                            )}

                            {person.scheduledAssignments.length === 0 && (
                              <div className="absolute inset-y-0 left-2 right-2 flex items-center">
                                <span
                                  className="rounded border px-2 py-1 text-xs"
                                  style={{
                                    borderColor: "#E2E8F0",
                                    color: "#475569",
                                  }}
                                >
                                  Vrij
                                </span>
                              </div>
                            )}

                            {person.scheduledAssignments.map((assignment) => {
                              const effectiveBlock = timeBlock(
                                assignment.effectiveStart ??
                                  assignment.scheduledStart,
                                assignment.effectiveEnd ??
                                  assignment.scheduledEnd,
                                timelineWindow,
                              );
                              const plannedBlock = timeBlock(
                                assignment.scheduledStart,
                                assignment.scheduledEnd,
                                timelineWindow,
                              );
                              const staffingState =
                                planboardStaffingState(assignment);
                              const staffingIndicator = {
                                empty: {
                                  bg: "rgba(248,250,252,0.78)",
                                  border: "#CBD5E1",
                                  color: "#475569",
                                  label: "Geen bezetting",
                                },
                                partial: {
                                  bg: "rgba(239,246,255,0.86)",
                                  border: "#BFDBFE",
                                  color: "#1D4ED8",
                                  label: "Deels bezet",
                                },
                                filled: {
                                  bg: "rgba(236,253,245,0.86)",
                                  border: "#A7F3D0",
                                  color: "#047857",
                                  label: "Volledig bezet",
                                },
                                overfilled: {
                                  bg: "rgba(255,251,235,0.9)",
                                  border: "#FCD34D",
                                  color: "#B45309",
                                  label: "Overbezet",
                                },
                              }[staffingState];
                              const late = isLateAppointment(
                                assignment,
                                data.date,
                              );
                              const pastel = late
                                ? {
                                    bg: "#FFEDD5",
                                    border: "#FB923C",
                                    text: "#7C2D12",
                                    rail: "#F97316",
                                  }
                                : pastelForAppointment(assignment);
                              const actualBlock = actualTimeBlock(
                                assignment,
                                data.date,
                                liveRelativeMinute,
                                timelineWindow,
                              );
                              const block =
                                actualBlock ?? effectiveBlock ?? plannedBlock;
                              const plannedOverlay =
                                !actualBlock && block
                                  ? relativeTimeBlock(plannedBlock, block)
                                  : null;
                              const actualOverlay = block
                                ? relativeTimeBlock(actualBlock, block)
                                : null;
                              const isMovable =
                                canWrite &&
                                isPlanboardMovableStatus(assignment.status);
                              if (!block) {
                                return (
                                  <Link
                                    key={assignment.id}
                                    href={`/assignments/${assignment.id}`}
                                    draggable={isMovable}
                                    onDragStart={
                                      isMovable
                                        ? (e) =>
                                            handleScheduledDragStart(
                                              e,
                                              assignment,
                                              person.id,
                                            )
                                        : undefined
                                    }
                                    onDragEnd={
                                      isMovable ? handleDragEnd : undefined
                                    }
                                    onKeyDown={
                                      isMovable
                                        ? (event) =>
                                            handleScheduledAssignmentKeyDown(
                                              event,
                                              assignment,
                                              person.id,
                                            )
                                        : undefined
                                    }
                                    aria-keyshortcuts={
                                      isMovable ? "Enter Space" : undefined
                                    }
                                    aria-label={`${assignment.code}: ${displayWorkOrderTitle(assignment.title)}. ${appointmentTimingLabel(assignment)}${isMovable ? ". Druk Enter of spatie om deze afspraak met het toetsenbord te verplaatsen." : ""}`}
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
                                      {assignment.sectorName
                                        ? ` - ${assignment.sectorName}`
                                        : ""}
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
                                      onDragStart={
                                        isMovable
                                          ? (e) =>
                                              handleScheduledDragStart(
                                                e,
                                                assignment,
                                                person.id,
                                              )
                                          : undefined
                                      }
                                      onDragEnd={
                                        isMovable ? handleDragEnd : undefined
                                      }
                                      onKeyDown={
                                        isMovable
                                          ? (event) =>
                                              handleScheduledAssignmentKeyDown(
                                                event,
                                                assignment,
                                                person.id,
                                              )
                                          : undefined
                                      }
                                      aria-keyshortcuts={
                                        isMovable ? "Enter Space" : undefined
                                      }
                                      title={appointmentTimingLabel(assignment)}
                                      aria-label={`${assignment.code}: ${displayWorkOrderTitle(assignment.title)}. ${appointmentTimingLabel(assignment)}${isMovable ? ". Druk Enter of spatie om deze afspraak met het toetsenbord te verplaatsen." : ""}`}
                                      className="absolute z-10 flex min-w-[96px] items-center overflow-hidden rounded-lg border text-[11px] font-medium shadow-sm transition hover:brightness-[0.98]"
                                      style={{
                                        top: density.inset,
                                        bottom: density.inset,
                                        left: `${block.left}%`,
                                        width: `${block.width}%`,
                                        borderColor: assignment.hasConflict
                                          ? "#F59E0B"
                                          : pastel.border,
                                        background: pastel.bg,
                                        color: pastel.text,
                                        cursor: isMovable ? "grab" : undefined,
                                      }}
                                    >
                                      {plannedOverlay && (
                                        <span
                                          aria-hidden="true"
                                          className="absolute inset-y-1 rounded-md border border-dashed"
                                          style={{
                                            left:
                                              String(plannedOverlay.left) + "%",
                                            width:
                                              String(plannedOverlay.width) +
                                              "%",
                                            borderColor: "rgba(8,29,58,0.32)",
                                          }}
                                        />
                                      )}
                                      {actualOverlay &&
                                        (assignment.actualStartedAt ||
                                          assignment.actualCompletedAt) && (
                                          <span
                                            aria-hidden="true"
                                            className="absolute bottom-0 top-0 rounded-md"
                                            style={{
                                              left:
                                                String(actualOverlay.left) +
                                                "%",
                                              width:
                                                String(actualOverlay.width) +
                                                "%",
                                              background:
                                                "rgba(59,130,246,0.18)",
                                            }}
                                          />
                                        )}
                                      <span
                                        className="relative h-full w-1.5 flex-shrink-0"
                                        style={{
                                          background: assignment.hasConflict
                                            ? "#F59E0B"
                                            : pastel.rail,
                                        }}
                                      />
                                      <span className="min-w-0 flex-1 px-2">
                                        <span className="flex min-w-0 items-center gap-1">
                                          <span className="truncate font-mono text-[10px] opacity-80">
                                            {assignment.code}
                                          </span>
                                          <span className="rounded bg-white/60 px-1 py-0.5 text-[9px] leading-none">
                                            {statusLabel(assignment.status)}
                                          </span>
                                        </span>
                                        <span className="mt-0.5 block truncate font-semibold">
                                          {displayWorkOrderTitle(
                                            assignment.title,
                                          )}
                                        </span>
                                        <span className="mt-0.5 block truncate text-[10px] opacity-75">
                                          {late ? "Te laat · " : ""}
                                          {compactPlanboardDisplayWindow(
                                            assignment,
                                          )}
                                          {assignment.sectorName
                                            ? ` - ${assignment.sectorName}`
                                            : ""}
                                        </span>
                                      </span>
                                      <span
                                        className="mr-1 inline-flex flex-shrink-0 items-center gap-0.5 rounded border px-1 py-0.5 text-[10px]"
                                        style={{
                                          background: staffingIndicator.bg,
                                          borderColor: staffingIndicator.border,
                                          color: staffingIndicator.color,
                                        }}
                                        aria-label={staffingIndicator.label}
                                      >
                                        <Users className="h-2.5 w-2.5" />
                                        {slotLabel(
                                          assignment.filledSlots,
                                          assignment.requiredSlots,
                                        )}
                                      </span>
                                      {assignment.hasConflict && (
                                        <AlertTriangle
                                          className="relative z-10 mr-1.5 h-3.5 w-3.5 flex-shrink-0"
                                          style={{ color: "#B45309" }}
                                        />
                                      )}
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="max-w-[260px]"
                                  >
                                    <div className="space-y-1">
                                      <p className="font-medium">
                                        {assignment.title}
                                      </p>
                                      <p>{assignment.customerName}</p>
                                      {assignment.objectName && (
                                        <p>{assignment.objectName}</p>
                                      )}
                                      {assignment.sectorName && (
                                        <p>Sector: {assignment.sectorName}</p>
                                      )}
                                      <p>
                                        {late ? "Te laat · " : ""}
                                        {appointmentTimingLabel(assignment)}
                                      </p>
                                      {assignment.requiredSlots > 1 && (
                                        <p>
                                          Team{" "}
                                          {slotLabel(
                                            assignment.filledSlots,
                                            assignment.requiredSlots,
                                          )}
                                        </p>
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
          description={
            detailAssignment
              ? displayWorkOrderTitle(detailAssignment.title)
              : undefined
          }
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
                <DetailLine
                  label="Klant"
                  value={detailAssignment.customerName}
                />
                <DetailLine
                  label="Object"
                  value={detailAssignment.objectName ?? "Geen object gekoppeld"}
                />
                <DetailLine
                  label="Sector"
                  value={detailAssignment.sectorName ?? "Geen sector"}
                />
                <DetailLine
                  label="Branch/regio"
                  value={
                    detailAssignment.requiredRegion ?? "Geen branch/regio-eis"
                  }
                />
                <DetailLine
                  label="Tijd"
                  value={`${formatShortDate(detailAssignment.scheduledDate ?? data.date)} - ${workOrderTimeLabel(detailAssignment)}`}
                />
                <DetailLine
                  label="Bezetting"
                  value={slotLabel(
                    detailAssignment.filledSlots,
                    detailAssignment.requiredSlots,
                  )}
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Eisen</h3>
                <div className="flex flex-wrap gap-2 text-xs">
                  {detailAssignment.requirements.requiredRoleNames.length >
                  0 ? (
                    detailAssignment.requirements.requiredRoleNames.map(
                      (role) => (
                        <span
                          key={role}
                          className="rounded-full border border-border bg-background px-2.5 py-1 font-medium"
                        >
                          {formatPersonnelRoleName(role)}
                        </span>
                      ),
                    )
                  ) : (
                    <span className="text-muted-foreground">
                      Geen specifieke rollen vereist.
                    </span>
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
                <h3 className="text-sm font-semibold text-foreground">
                  Beste matches
                </h3>
                {detailMatches.length > 0 ? (
                  <div className="space-y-2">
                    {detailMatches.slice(0, 5).map((match) => {
                      const person = data.personnel.find(
                        (item) => item.id === match.personnelId,
                      );
                      const config = matchConfig(match);
                      return (
                        <div
                          key={match.personnelId}
                          className="rounded-lg border border-border bg-background p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {person
                                  ? `${person.firstName} ${person.lastName}`
                                  : "Onbekende medewerker"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatPersonnelRoleName(person?.roleName) ||
                                  "Geen rol"}
                                {person?.region ? ` - ${person.region}` : ""}
                              </p>
                            </div>
                            <span
                              className="rounded-full border px-2 py-1 text-xs font-semibold"
                              style={{
                                borderColor: config.border,
                                background: config.bg,
                                color: config.text,
                              }}
                            >
                              {config.label}
                            </span>
                          </div>
                          {match.reasons.length > 0 && (
                            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {match.reasons.slice(0, 3).map((reason) => (
                                <li
                                  key={`${match.personnelId}-${reason.code}-${reason.label}`}
                                >
                                  {reason.label}
                                </li>
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
                <Link href={`/assignments/${detailAssignment.id}`}>
                  Open werkbon
                </Link>
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
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 text-right font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}
