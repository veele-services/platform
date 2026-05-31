"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Plus, CalendarDays, Users } from "lucide-react";
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
  in_progress: "#fff",
};

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

  const totalAssignments = rows.reduce((s, r) => s + r.assignments.length, 0) + unassigned.length;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
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

      {/* ── Empty state ─────────────────────────────────────────── */}
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

      {/* ── Unassigned assignments ───────────────────────────────── */}
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
                  {(a.scheduledStart || a.scheduledEnd) && (
                    <span className="text-xs flex items-center gap-1" style={{ color: "#94A3B8" }}>
                      <Clock className="h-3 w-3" />
                      {a.scheduledStart ?? ""}
                      {a.scheduledStart && a.scheduledEnd ? " – " : ""}
                      {a.scheduledEnd ?? ""}
                    </span>
                  )}
                  <AssignmentStatusBadge status={a.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Per-medewerker tijdlijn ──────────────────────────────── */}
      {rows.length > 0 && (
        <div className="veele-card overflow-x-auto">
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
              {rows.map((row, idx) => (
                <div
                  key={row.personnelId}
                  className="flex items-center"
                  style={{
                    minHeight: "44px",
                    borderTop: idx === 0 ? "1px solid #E2E8F0" : undefined,
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

                  {/* Timeline area */}
                  <div className="relative flex-1 py-2" style={{ minHeight: "44px" }}>
                    {row.assignments.map((a) => {
                      const block = timeBlock(a.scheduledStart, a.scheduledEnd);
                      const bg   = STATUS_BLOCK_BG[a.status] ?? "#F1F5F9";
                      const text = STATUS_BLOCK_TEXT[a.status] ?? "#081D3A";

                      if (!block) {
                        // No time set — show as a full-width tag
                        return (
                          <Link
                            key={a.id}
                            href={`/assignments/${a.id}`}
                            title={`${a.title} · ${a.customerName}`}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded mr-1 font-medium truncate max-w-[200px]"
                            style={{ background: bg, color: text, border: "1px solid rgba(0,0,0,0.06)" }}
                          >
                            {a.title}
                          </Link>
                        );
                      }

                      return (
                        <Link
                          key={a.id}
                          href={`/assignments/${a.id}`}
                          title={`${a.title} · ${a.scheduledStart}–${a.scheduledEnd} · ${a.customerName}`}
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
                          <span className="truncate">{a.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Create assignment sheet ──────────────────────────────── */}
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
