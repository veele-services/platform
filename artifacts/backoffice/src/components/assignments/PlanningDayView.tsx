"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Plus, CalendarDays, Users, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { AssignmentStatusBadge } from "./AssignmentStatusBadge";
import { AssignmentForm } from "./AssignmentForm";
import { reshiftAssignment } from "@/app/actions/assignments";
import type {
  TimelinePersonnelRow,
  TimelineAssignment,
  CustomerOption,
} from "@/app/actions/assignments";

// ── Date helpers (local, no toISOString to avoid timezone drift) ────────────

function addDaysLocal(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}

function getWeekMonday(dateStr: string): string {
  const d   = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}

// ── Timeline helpers ────────────────────────────────────────────────────────

const DAY_START_MIN = 7 * 60;   // 07:00
const DAY_END_MIN   = 20 * 60;  // 20:00
const DAY_SPAN      = DAY_END_MIN - DAY_START_MIN; // 780 min

function parseTimeMin(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function amsterdamMinuteOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function isTimelineMovable(status: TimelineAssignment["status"]): boolean {
  return status === "plannable" || status === "scheduled";
}

function timeBlock(start: string | null, end: string | null): { left: number; width: number } | null {
  const s = parseTimeMin(start);
  const e = parseTimeMin(end);
  if (s === null) return null;
  const clampedStart = Math.max(s, DAY_START_MIN);
  const clampedEnd   = Math.min(e ?? s + 60, DAY_END_MIN);
  if (clampedStart >= clampedEnd) return null;
  return {
    left:  ((clampedStart - DAY_START_MIN) / DAY_SPAN) * 100,
    width: ((clampedEnd - clampedStart) / DAY_SPAN) * 100,
  };
}

const HOUR_LABELS = Array.from({ length: 14 }, (_, i) => {
  const h = 7 + i;
  return { label: `${h}:00`, pct: ((h * 60 - DAY_START_MIN) / DAY_SPAN) * 100 };
});

const NL_MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];
const NL_WEEKDAYS = [
  "zondag", "maandag", "dinsdag", "woensdag",
  "donderdag", "vrijdag", "zaterdag",
];

const STATUS_BLOCK_BG: Record<string, string> = {
  requested:         "#EFF6FF",
  review:            "#FEF3C7",
  quote_preparation: "#FEF3C7",
  awaiting_approval: "#FEF3C7",
  approved:          "#D1FAE5",
  plannable:         "#D1FAE5",
  scheduled:         "#DBEAFE",
  seen:              "#DBEAFE",
  en_route:          "#CCFBF1",
  in_progress:       "#00B7B3",
  not_completed:     "#FEE2E2",
  completed:         "#D1FAE5",
  report_submitted:  "#E0E7FF",
  report_approved:   "#D1FAE5",
  invoice_ready:     "#FEF3C7",
  invoiced:          "#D1FAE5",
  paid:              "#D1FAE5",
  closed:            "#F1F5F9",
};
const STATUS_BLOCK_TEXT: Record<string, string> = {
  en_route: "#115E59",
  in_progress: "#fff",
};

// ── DnD helpers ─────────────────────────────────────────────────────────────

interface GhostInfo {
  rowId:    string;
  leftPct:  number;
  widthPct: number;
  label:    string;
}

function calcDropSlot(
  e: React.DragEvent<HTMLDivElement>,
  durationMin: number,
): { newStart: string; newEnd: string; leftPct: number; widthPct: number; label: string } {
  const rect = e.currentTarget.getBoundingClientRect();
  const x    = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const pct  = x / rect.width;
  const rawStart    = DAY_START_MIN + pct * DAY_SPAN;
  const snapped     = Math.round(rawStart / 15) * 15;
  const clampStart  = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - durationMin, snapped));
  const clampEnd    = clampStart + durationMin;
  return {
    newStart: minToTime(clampStart),
    newEnd:   minToTime(clampEnd),
    leftPct:  ((clampStart - DAY_START_MIN) / DAY_SPAN) * 100,
    widthPct: ((clampEnd   - clampStart)    / DAY_SPAN) * 100,
    label:    `${minToTime(clampStart)}–${minToTime(clampEnd)}`,
  };
}

// ── Props ────────────────────────────────────────────────────────────────────

interface PlanningDayViewProps {
  dateStr:    string;
  rows:       TimelinePersonnelRow[];
  unassigned: TimelineAssignment[];
  canWrite:   boolean;
  customers:  CustomerOption[];
}

export function PlanningDayView({
  dateStr,
  rows,
  unassigned,
  canWrite,
  customers,
}: PlanningDayViewProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  // ── DnD state ──────────────────────────────────────────────────────────────
  const [draggingId,       setDraggingId]       = useState<string | null>(null);
  const [draggingDuration, setDraggingDuration] = useState<number>(60);
  const [ghostInfo,        setGhostInfo]        = useState<GhostInfo | null>(null);
  const [optimisticShifts, setOptimisticShifts] = useState<Map<string, { start: string; end: string }>>(new Map());
  const [conflictWarning,  setConflictWarning]  = useState<string | null>(null);
  const [isPending,        startTransition]     = useTransition();
  const [clockNow, setClockNow] = useState(() => Date.now());
  const dragRef = useRef<string | null>(null);

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

  // ── Derived ────────────────────────────────────────────────────────────────
  const date    = new Date(dateStr + "T00:00:00");
  const weekday = NL_WEEKDAYS[date.getDay()];
  const dayNum  = date.getDate();
  const month   = NL_MONTHS[date.getMonth()];
  const year    = date.getFullYear();
  const label   = `${weekday} ${dayNum} ${month} ${year}`;

  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
  })();
  const isToday = dateStr === todayStr;

  const weekStr  = getWeekMonday(dateStr);
  const prevDay  = addDaysLocal(dateStr, -1);
  const nextDay  = addDaysLocal(dateStr,  1);
  const liveMinute = amsterdamMinuteOfDay(new Date(clockNow));

  // Apply optimistic shifts to the rows
  const effectiveRows: TimelinePersonnelRow[] = rows.map((row) => ({
    ...row,
    assignments: row.assignments.map((a) => {
      const shift = optimisticShifts.get(a.id);
      if (!shift) return a;
      return {
        ...a,
        scheduledStart: shift.start,
        scheduledEnd: shift.end,
        effectiveStart: shift.start,
        effectiveEnd: shift.end,
      };
    }),
  }));

  const totalAssignments = rows.reduce((s, r) => s + r.assignments.length, 0) + unassigned.length;

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, a: TimelineAssignment) {
    if (!canWrite || !isTimelineMovable(a.status)) return;
    const s = parseTimeMin(a.scheduledStart);
    const end = parseTimeMin(a.scheduledEnd);
    const duration = (s !== null && end !== null) ? Math.max(15, end - s) : 60;
    dragRef.current = a.id;
    setDraggingId(a.id);
    setDraggingDuration(duration);
    setConflictWarning(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", a.id);
  }

  function handleDragEnd() {
    dragRef.current = null;
    setDraggingId(null);
    setGhostInfo(null);
  }

  function handleTimelineDragOver(e: React.DragEvent<HTMLDivElement>, rowId: string) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const slot = calcDropSlot(e, draggingDuration);
    setGhostInfo({ rowId, leftPct: slot.leftPct, widthPct: slot.widthPct, label: slot.label });
  }

  function handleTimelineDragLeave() {
    setGhostInfo(null);
  }

  function handleTimelineDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragRef.current;
    const slot = calcDropSlot(e, draggingDuration);
    setGhostInfo(null);
    setDraggingId(null);
    dragRef.current = null;

    if (!id) return;

    // Check no-op: compare with current effective times
    const currentRow = rows.find((r) => r.assignments.some((a) => a.id === id));
    const currentA   = currentRow?.assignments.find((a) => a.id === id);
    const currentShift = optimisticShifts.get(id);
    const currentStart = currentShift?.start ?? currentA?.scheduledStart;
    const currentEnd   = currentShift?.end   ?? currentA?.scheduledEnd;
    if (currentStart === slot.newStart && currentEnd === slot.newEnd) return;

    // Optimistic update
    setOptimisticShifts((prev) => {
      const next = new Map(prev);
      next.set(id, { start: slot.newStart, end: slot.newEnd });
      return next;
    });

    startTransition(async () => {
      const result = await reshiftAssignment(id, slot.newStart, slot.newEnd);
      if (!result.success) {
        setOptimisticShifts((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setConflictWarning(result.message);
      } else {
        if (result.warning) setConflictWarning(result.warning);
        router.refresh();
        setOptimisticShifts(new Map());
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Conflict / error warning banner ─────────────────────────── */}
      {conflictWarning && (
        <div
          className="flex items-start gap-3 rounded-lg px-4 py-3 mb-4 text-sm"
          style={{
            background: "#FFFBEB",
            border:     "1px solid #F59E0B",
            color:      "#92400E",
          }}
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#F59E0B" }} />
          <span className="flex-1">{conflictWarning}</span>
          <button
            type="button"
            onClick={() => setConflictWarning(null)}
            className="flex-shrink-0 rounded p-0.5 transition-opacity hover:opacity-70"
            aria-label="Melding sluiten"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.push(`/planning?week=${weekStr}`)}
            className="inline-flex items-center gap-1 text-sm mb-2 hover:underline"
            style={{ color: "#64748B" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Weekoverzicht
          </button>

          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-xl w-12 h-12 flex-shrink-0"
              style={isToday
                ? { background: "#00B7B3", color: "#fff" }
                : { background: "#F1F5F9", color: "#081D3A" }}
            >
              <span className="font-heading text-xl font-bold">{dayNum}</span>
            </div>
            <div>
              <h2
                className="font-heading text-xl font-bold capitalize"
                style={{ color: "#081D3A" }}
              >
                {label}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: "#64748B" }}>
                {totalAssignments === 0
                  ? "Geen ingeplande opdrachten"
                  : `${totalAssignments} opdracht${totalAssignments > 1 ? "en" : ""} ingepland`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => router.push(`/planning?day=${prevDay}`)}>
            <ArrowLeft className="h-4 w-4" />
            Vorige dag
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/planning?day=${nextDay}`)}>
            Volgende dag
            <ArrowLeft className="h-4 w-4 rotate-180" />
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nieuwe opdracht
            </Button>
          )}
        </div>
      </div>

      {/* ── DnD hint ────────────────────────────────────────────────── */}
      {canWrite && rows.some((r) => r.assignments.some((a) => a.scheduledStart)) && (
        <p className="text-xs mb-3" style={{ color: "#94A3B8" }}>
          Sleep een opdracht naar een ander tijdslot om de starttijd aan te passen.
        </p>
      )}

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {rows.length === 0 && unassigned.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-lg text-center"
          style={{ border: "1px dashed #E2E8F0" }}
        >
          <CalendarDays className="h-10 w-10 mb-3" style={{ color: "#CBD5E1" }} />
          <p className="text-sm font-medium" style={{ color: "#94A3B8" }}>
            Geen opdrachten ingepland op deze dag
          </p>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Opdracht toevoegen
            </Button>
          )}
        </div>
      )}

      {/* ── Unassigned assignments ───────────────────────────────────── */}
      {unassigned.length > 0 && (
        <div className="mb-6 veele-card">
          <h3
            className="font-heading text-sm font-semibold mb-3 flex items-center gap-2"
            style={{ color: "#94A3B8" }}
          >
            <Users className="h-4 w-4" />
            Geen medewerker toegewezen
          </h3>
          <div className="flex flex-col gap-2">
            {unassigned.map((a) => (
              <Link
                key={a.id}
                href={`/assignments/${a.id}`}
                className="flex items-center justify-between gap-3 p-2 rounded hover:shadow-sm transition-shadow"
                style={{ border: "1px solid #E2E8F0", background: "#FAFAFA" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: "#081D3A" }}>
                    {a.title}
                  </p>
                  <p className="text-xs" style={{ color: "#64748B" }}>{a.customerName}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(a.effectiveStart || a.effectiveEnd) && (
                    <span className="text-xs flex items-center gap-1" style={{ color: "#94A3B8" }}>
                      <Clock className="h-3 w-3" />
                      {a.effectiveStart ?? ""}
                      {a.effectiveStart && (a.effectiveEnd || a.isRunning) ? " – " : ""}
                      {a.isRunning ? "nu" : (a.effectiveEnd ?? "")}
                    </span>
                  )}
                  <AssignmentStatusBadge status={a.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Per-medewerker tijdlijn ──────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="veele-card overflow-x-auto" style={{ opacity: isPending ? 0.85 : 1, transition: "opacity 0.15s" }}>
          <h3
            className="font-heading text-sm font-semibold mb-4 flex items-center gap-2"
            style={{ color: "#081D3A" }}
          >
            <Clock className="h-4 w-4" style={{ color: "#00B7B3" }} />
            Tijdlijn per medewerker
          </h3>

          <div className="min-w-[700px]">
            {/* Hour axis */}
            <div className="flex mb-2 pl-[160px] relative">
              {HOUR_LABELS.map((h) => (
                <div
                  key={h.label}
                  className="absolute text-xs"
                  style={{
                    left: `calc(160px + ${h.pct}%)`,
                    color: "#CBD5E1",
                    transform: "translateX(-50%)",
                  }}
                >
                  {h.label}
                </div>
              ))}
              <div style={{ height: "16px" }} />
            </div>

            {/* Grid lines + rows */}
            <div className="relative">
              {/* Vertical hour grid lines */}
              <div className="absolute inset-y-0 right-0" style={{ left: "160px" }}>
                {HOUR_LABELS.map((h) => (
                  <div
                    key={h.label}
                    className="absolute inset-y-0"
                    style={{
                      left: `${h.pct}%`,
                      borderLeft: "1px solid #F1F5F9",
                    }}
                  />
                ))}
              </div>

              {/* Personnel rows */}
              {effectiveRows.map((row, idx) => {
                const isGhostRow = ghostInfo?.rowId === row.personnelId;
                return (
                  <div
                    key={row.personnelId}
                    className="flex items-center"
                    style={{
                      minHeight: "44px",
                      borderTop:    idx === 0 ? "1px solid #E2E8F0" : undefined,
                      borderBottom: "1px solid #F1F5F9",
                    }}
                  >
                    {/* Name column */}
                    <div
                      className="flex-shrink-0 pr-3 py-2 text-sm font-medium truncate"
                      style={{ width: "160px", color: "#081D3A" }}
                      title={`${row.firstName} ${row.lastName}`}
                    >
                      {row.lastName}, {row.firstName}
                    </div>

                    {/* Timeline area — also serves as drop zone */}
                    <div
                      className="relative flex-1 py-2"
                      style={{
                        minHeight: "44px",
                        cursor: canWrite && draggingId ? "copy" : undefined,
                        outline: isGhostRow ? "1px dashed #00B7B3" : undefined,
                        outlineOffset: isGhostRow ? "-1px" : undefined,
                        borderRadius: "4px",
                        background:   isGhostRow ? "rgba(0,183,179,0.04)" : undefined,
                        transition: "background 0.1s, outline 0.1s",
                      }}
                      onDragOver={canWrite ? (e) => handleTimelineDragOver(e, row.personnelId) : undefined}
                      onDragLeave={canWrite ? handleTimelineDragLeave : undefined}
                      onDrop={canWrite ? handleTimelineDrop : undefined}
                    >
                      {/* Ghost indicator */}
                      {isGhostRow && ghostInfo && (
                        <div
                          className="absolute top-2 bottom-2 flex items-center justify-center rounded pointer-events-none z-10"
                          style={{
                            left:    `${ghostInfo.leftPct}%`,
                            width:   `${ghostInfo.widthPct}%`,
                            minWidth: "40px",
                            background: "rgba(0,183,179,0.18)",
                            border: "2px dashed #00B7B3",
                          }}
                        >
                          <span
                            className="text-xs font-semibold px-1 truncate"
                            style={{ color: "#00B7B3" }}
                          >
                            {ghostInfo.label}
                          </span>
                        </div>
                      )}

                      {/* Assignment blocks */}
                      {row.assignments.map((a) => {
                        const displayEnd = a.isRunning
                          ? minToTime(liveMinute)
                          : a.effectiveEnd;
                        const block = timeBlock(a.effectiveStart, displayEnd);
                        const bg    = STATUS_BLOCK_BG[a.status] ?? "#F1F5F9";
                        const text  = STATUS_BLOCK_TEXT[a.status] ?? "#081D3A";
                        const isBeingDragged = draggingId === a.id;
                        const isMovable = canWrite && isTimelineMovable(a.status);
                        const timeLabel = `${a.effectiveStart ?? "?"}–${
                          a.isRunning ? "nu" : (a.effectiveEnd ?? "?")
                        }`;

                        if (!block) {
                          // No time set — show as inline tag (not draggable)
                          return (
                            <TooltipProvider key={a.id}>
                              <span className="inline-flex items-center gap-1 mr-1">
                                <Link
                                  href={`/assignments/${a.id}`}
                                  title={`${a.title} · ${a.customerName}`}
                                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium truncate max-w-[200px]"
                                  style={{ background: bg, color: text, border: "1px solid rgba(0,0,0,0.06)" }}
                                >
                                  {a.title}
                                </Link>
                                {a.hasConflict && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="flex-shrink-0 cursor-default" aria-label="Conflict gedetecteerd">
                                        <AlertTriangle className="h-3 w-3" style={{ color: "#F59E0B" }} />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      Ten minste één medewerker is niet beschikbaar of heeft een conflicterende inplanning.
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </span>
                            </TooltipProvider>
                          );
                        }

                        // Conflict indicator (shared between both block variants)
                        const conflictIcon = a.hasConflict ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex-shrink-0 ml-1 cursor-default" aria-label="Conflict gedetecteerd">
                                  <AlertTriangle className="h-3 w-3" style={{ color: "#F59E0B" }} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                Ten minste één medewerker is niet beschikbaar of heeft een conflicterende inplanning.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null;

                        // Time is set — render as draggable positioned block
                        const blockEl = (
                          <div
                            key={a.id}
                            draggable={isMovable}
                            onDragStart={isMovable ? (e) => handleDragStart(e, a) : undefined}
                            onDragEnd={isMovable ? handleDragEnd : undefined}
                            title={`${a.title} · ${timeLabel} · gepland ${a.scheduledStart ?? "?"}–${a.scheduledEnd ?? "?"} · ${a.customerName}`}
                            className="absolute top-2 bottom-2 flex items-center px-2 text-xs font-medium rounded overflow-hidden"
                            style={{
                              left:    `${block.left}%`,
                              width:   `${block.width}%`,
                              minWidth: "40px",
                              background:  bg,
                              color:       text,
                              border: "1px solid rgba(0,0,0,0.06)",
                              cursor: isMovable ? (isBeingDragged ? "grabbing" : "grab") : "default",
                              opacity: isBeingDragged ? 0.35 : 1,
                              transition: "opacity 0.15s",
                              zIndex: isBeingDragged ? 0 : 1,
                            }}
                          >
                            <span className="truncate flex-1 min-w-0">{a.title}</span>
                            {conflictIcon}
                          </div>
                        );

                        // Wrap with a link-on-click when NOT actively dragging
                        return isMovable ? (
                          blockEl
                        ) : (
                          <Link
                            key={a.id}
                            href={`/assignments/${a.id}`}
                            title={`${a.title} · ${timeLabel} · gepland ${a.scheduledStart ?? "?"}–${a.scheduledEnd ?? "?"} · ${a.customerName}`}
                            className="absolute top-2 bottom-2 flex items-center px-2 text-xs font-medium rounded overflow-hidden"
                            style={{
                              left:    `${block.left}%`,
                              width:   `${block.width}%`,
                              minWidth: "40px",
                              background: bg,
                              color:      text,
                              border: "1px solid rgba(0,0,0,0.06)",
                            }}
                          >
                            <span className="truncate flex-1 min-w-0">{a.title}</span>
                            {conflictIcon}
                          </Link>
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

      {/* ── Create assignment sheet ──────────────────────────────────── */}
      {canWrite && (
        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent side="right" className="w-[560px] sm:max-w-[560px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Nieuwe opdracht aanmaken</SheetTitle>
              <SheetDescription>{`Datum: ${label}`}</SheetDescription>
            </SheetHeader>
            <AssignmentForm
              key={dateStr}
              mode="create"
              customers={customers}
              defaultDate={dateStr}
              onSuccess={() => {
                setCreateOpen(false);
                router.refresh();
              }}
              onCancel={() => setCreateOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
