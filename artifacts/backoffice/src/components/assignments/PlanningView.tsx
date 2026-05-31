"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { AssignmentStatusBadge } from "./AssignmentStatusBadge";
import { AssignmentForm } from "./AssignmentForm";
import { rescheduleAssignment } from "@/app/actions/assignments";
import type { WeekAssignment, CustomerOption } from "@/app/actions/assignments";
import { AlertTriangle, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const NL_DAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const NL_MONTHS = [
  "jan", "feb", "mrt", "apr", "mei", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
];

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

interface PlanningViewProps {
  weekStartStr: string;
  assignments:  WeekAssignment[];
  canWrite:     boolean;
  customers:    CustomerOption[];
}

export function PlanningView({ weekStartStr, assignments, canWrite, customers }: PlanningViewProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [createDate,      setCreateDate]      = useState("");

  // Drag-and-drop state
  const [draggingId,      setDraggingId]      = useState<string | null>(null);
  const [dragOverDate,    setDragOverDate]     = useState<string | null>(null);
  const [isPending,       startTransition]     = useTransition();
  // Optimistic moved assignments: id → newDate (applied before server confirm)
  const [movedMap,        setMovedMap]         = useState<Map<string, string>>(new Map());
  const dragRef = useRef<string | null>(null); // sync fallback for drag events
  // Conflict warning banner
  const [conflictWarning, setConflictWarning]  = useState<string | null>(null);

  const weekStart = new Date(weekStartStr + "T00:00:00");
  const weekEnd   = addDays(weekStart, 6);
  const weekNum   = getWeekNumber(weekStart);

  const startYear  = weekStart.getFullYear();
  const startMonth = NL_MONTHS[weekStart.getMonth()];
  const startDay   = weekStart.getDate();
  const endMonth   = NL_MONTHS[weekEnd.getMonth()];
  const endDay     = weekEnd.getDate();
  const endYear    = weekEnd.getFullYear();

  const weekLabel =
    startMonth === endMonth && startYear === endYear
      ? `Week ${weekNum} — ${startDay}–${endDay} ${startMonth} ${startYear}`
      : startYear === endYear
        ? `Week ${weekNum} — ${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`
        : `Week ${weekNum} — ${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;

  const prevWeek = formatDateKey(addDays(weekStart, -7));
  const nextWeek = formatDateKey(addDays(weekStart,  7));
  const todayStr = formatDateKey(new Date());

  // Build date → assignments map, applying optimistic moves
  const effectiveAssignments = assignments.map((a) => ({
    ...a,
    scheduledDate: movedMap.get(a.id) ?? a.scheduledDate,
  }));

  const byDate = new Map<string, WeekAssignment[]>();
  for (const a of effectiveAssignments) {
    const list = byDate.get(a.scheduledDate) ?? [];
    list.push(a);
    byDate.set(a.scheduledDate, list);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const date    = addDays(weekStart, i);
    const dateStr = formatDateKey(date);
    return {
      label:   NL_DAYS[i],
      dateStr,
      date,
      isToday: dateStr === todayStr,
      items:   byDate.get(dateStr) ?? [],
    };
  });

  const totalForWeek = effectiveAssignments.length;

  function openCreate(dateStr: string) {
    setCreateDate(dateStr);
    setCreateSheetOpen(true);
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, assignmentId: string) {
    dragRef.current = assignmentId;
    setDraggingId(assignmentId);
    setConflictWarning(null); // clear any previous warning when a new drag starts
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", assignmentId);
  }

  function handleDragEnd() {
    dragRef.current = null;
    setDraggingId(null);
    setDragOverDate(null);
  }

  function handleDragOver(e: React.DragEvent, dateStr: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);
  }

  function handleDragLeave() {
    setDragOverDate(null);
  }

  function handleDrop(e: React.DragEvent, targetDate: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragRef.current;
    setDragOverDate(null);
    setDraggingId(null);
    dragRef.current = null;

    if (!id) return;

    // Find current date of the dragged assignment
    const original = assignments.find((a) => a.id === id);
    const currentDate = movedMap.get(id) ?? original?.scheduledDate;
    if (!original || currentDate === targetDate) return;

    // Optimistic update
    setMovedMap((prev) => {
      const next = new Map(prev);
      next.set(id, targetDate);
      return next;
    });

    startTransition(async () => {
      const result = await rescheduleAssignment(id, targetDate);
      if (!result.success) {
        // Hard block — roll back optimistic move and show error
        setMovedMap((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setConflictWarning(result.message);
      } else {
        // Move succeeded — show warning if any (conflicts that didn't block)
        if (result.warning) {
          setConflictWarning(result.warning);
        }
        // Server did a revalidatePath; router.refresh picks up new data
        router.refresh();
        setMovedMap(new Map());
      }
    });
  }

  return (
    <div>
      {/* Conflict / hard-block warning banner */}
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

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold" style={{ color: "#081D3A" }}>
            {weekLabel}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#64748B" }}>
            {totalForWeek === 0
              ? "Geen ingeplande opdrachten"
              : `${totalForWeek} opdracht${totalForWeek > 1 ? "en" : ""} ingepland`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.replace(`${pathname}?week=${prevWeek}`)}
          >
            <ChevronLeft className="h-4 w-4" />
            Vorige week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.replace(`${pathname}?week=${todayStr}`)}
          >
            Vandaag
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.replace(`${pathname}?week=${nextWeek}`)}
          >
            Volgende week
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => {
          const isDragTarget = canWrite && dragOverDate === day.dateStr && draggingId !== null;
          return (
            <div
              key={day.dateStr}
              className="min-w-0"
              onDragOver={canWrite ? (e) => handleDragOver(e, day.dateStr) : undefined}
              onDragLeave={canWrite ? handleDragLeave : undefined}
              onDrop={canWrite ? (e) => handleDrop(e, day.dateStr) : undefined}
            >
              {/* Day header — click to day view */}
              <Link
                href={`${pathname}?day=${day.dateStr}`}
                className="flex flex-col items-center justify-center pb-2 mb-2 group"
                style={{ borderBottom: "1px solid #E2E8F0" }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: day.isToday ? "#00B7B3" : "#64748B" }}
                >
                  {day.label}
                </span>
                <span
                  className="font-heading text-xl font-bold mt-0.5 w-8 h-8 flex items-center justify-center rounded-full transition-colors group-hover:ring-2"
                  style={
                    day.isToday
                      ? { background: "#00B7B3", color: "#fff" }
                      : { color: "#081D3A" }
                  }
                >
                  {day.date.getDate()}
                </span>
              </Link>

              {/* Drop zone + assignment cards */}
              <div
                className="flex flex-col gap-2 rounded-lg transition-colors min-h-[40px]"
                style={
                  isDragTarget
                    ? { background: "rgba(0,183,179,0.06)", outline: "2px dashed #00B7B3", outlineOffset: "2px" }
                    : undefined
                }
              >
                {day.items.map((a) => {
                  const isBeingDragged = draggingId === a.id;
                  return canWrite ? (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, a.id)}
                      onDragEnd={handleDragEnd}
                      className="rounded p-2 transition-shadow hover:shadow-md cursor-grab active:cursor-grabbing"
                      style={{
                        background: "#fff",
                        border: "1px solid #E2E8F0",
                        opacity: isBeingDragged ? 0.4 : isPending ? 0.7 : 1,
                        transition: "opacity 0.15s, box-shadow 0.15s",
                        userSelect: "none",
                      }}
                    >
                      <AssignmentCardContent a={a} />
                    </div>
                  ) : (
                    <Link
                      key={a.id}
                      href={`/assignments/${a.id}`}
                      className="block rounded p-2 transition-shadow hover:shadow-md"
                      style={{ background: "#fff", border: "1px solid #E2E8F0" }}
                    >
                      <AssignmentCardContent a={a} />
                    </Link>
                  );
                })}

                {/* Add button */}
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => openCreate(day.dateStr)}
                    className="flex items-center justify-center gap-1 rounded py-2 text-xs transition-colors hover:opacity-80"
                    style={{
                      border: "1px dashed #CBD5E1",
                      color: "#94A3B8",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                    aria-label={`Opdracht toevoegen op ${day.dateStr}`}
                  >
                    <Plus className="h-3 w-3" />
                    <span>Nieuw</span>
                  </button>
                ) : day.items.length === 0 ? (
                  <div
                    className="text-xs text-center py-4 rounded"
                    style={{ color: "#CBD5E1" }}
                  >
                    —
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create assignment sheet */}
      {canWrite && (
        <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
          <SheetContent side="right" className="w-[560px] sm:max-w-[560px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Nieuwe opdracht aanmaken</SheetTitle>
              <SheetDescription>
                {createDate
                  ? `Datum voorgeselecteerd: ${new Date(createDate + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}`
                  : "Vul de opdrachtgegevens in."}
              </SheetDescription>
            </SheetHeader>
            <AssignmentForm
              key={createDate}
              mode="create"
              customers={customers}
              defaultDate={createDate}
              onSuccess={() => {
                setCreateSheetOpen(false);
                router.refresh();
              }}
              onCancel={() => setCreateSheetOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

// ── Shared card content (used for both draggable div and Link) ────────────────

function AssignmentCardContent({ a }: { a: WeekAssignment }) {
  return (
    <TooltipProvider>
      <div className="flex items-start justify-between gap-1 mb-1">
        <p
          className="text-xs font-semibold leading-snug line-clamp-2 flex-1 min-w-0"
          style={{ color: "#081D3A" }}
        >
          {a.title}
        </p>
        {a.hasConflict && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex-shrink-0 mt-0.5 cursor-default" aria-label="Conflict gedetecteerd">
                <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#F59E0B" }} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              Ten minste één medewerker is niet beschikbaar of heeft een conflicterende inplanning.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className="text-xs mb-1.5 truncate" style={{ color: "#64748B" }}>
        {a.customerName}
      </p>
      <div className="mb-1.5">
        <AssignmentStatusBadge status={a.status} />
      </div>
      {(a.scheduledStart || a.scheduledEnd) && (
        <p className="text-xs flex items-center gap-1" style={{ color: "#94A3B8" }}>
          <Clock className="h-3 w-3 flex-shrink-0" />
          {a.scheduledStart ?? ""}
          {a.scheduledStart && a.scheduledEnd ? " – " : ""}
          {a.scheduledEnd ?? ""}
        </p>
      )}
      {a.personnelNames.length > 0 && (
        <p className="text-xs flex items-center gap-1 mt-1" style={{ color: "#94A3B8" }}>
          <Users className="h-3 w-3 flex-shrink-0" />
          {a.personnelNames.slice(0, 2).join(", ")}
          {a.personnelNames.length > 2 && ` +${a.personnelNames.length - 2}`}
        </p>
      )}
    </TooltipProvider>
  );
}
