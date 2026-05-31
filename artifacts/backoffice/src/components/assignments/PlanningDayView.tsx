"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Users, Plus, CalendarDays } from "lucide-react";
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
import type { WeekAssignment, CustomerOption } from "@/app/actions/assignments";

const NL_MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];
const NL_WEEKDAYS = [
  "zondag", "maandag", "dinsdag", "woensdag",
  "donderdag", "vrijdag", "zaterdag",
];

function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

interface PlanningDayViewProps {
  dateStr:     string;
  assignments: WeekAssignment[];
  canWrite:    boolean;
  customers:   CustomerOption[];
}

export function PlanningDayView({ dateStr, assignments, canWrite, customers }: PlanningDayViewProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  const date    = new Date(dateStr + "T00:00:00");
  const weekday = NL_WEEKDAYS[date.getDay()];
  const dayNum  = date.getDate();
  const month   = NL_MONTHS[date.getMonth()];
  const year    = date.getFullYear();
  const label   = `${weekday} ${dayNum} ${month} ${year}`;

  const weekStr = getWeekMonday(dateStr);

  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday  = dateStr === todayStr;

  const sorted = [...assignments].sort((a, b) => {
    const ta = a.scheduledStart ?? "00:00";
    const tb = b.scheduledStart ?? "00:00";
    return ta.localeCompare(tb);
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.push(`/planning?week=${weekStr}`)}
            className="inline-flex items-center gap-1 text-sm mb-2 transition-colors hover:underline"
            style={{ color: "#64748B" }}
          >
            <ArrowLeft className="h-4 w-4" />
            Terug naar weekoverzicht
          </button>

          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-lg w-12 h-12 flex-shrink-0"
              style={isToday ? { background: "#00B7B3", color: "#fff" } : { background: "#F1F5F9", color: "#081D3A" }}
            >
              <span className="font-heading text-xl font-bold">{dayNum}</span>
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold capitalize" style={{ color: "#081D3A" }}>
                {label}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: "#64748B" }}>
                {sorted.length === 0
                  ? "Geen ingeplande opdrachten"
                  : `${sorted.length} opdracht${sorted.length > 1 ? "en" : ""} ingepland`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const prev = new Date(date);
              prev.setDate(prev.getDate() - 1);
              const p = prev.toISOString().slice(0, 10);
              router.push(`/planning?day=${p}`);
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Vorige dag
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = new Date(date);
              next.setDate(next.getDate() + 1);
              const n = next.toISOString().slice(0, 10);
              router.push(`/planning?day=${n}`);
            }}
          >
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

      {/* Assignment list */}
      {sorted.length === 0 ? (
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
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((a) => (
            <Link
              key={a.id}
              href={`/assignments/${a.id}`}
              className="block rounded-lg p-4 transition-shadow hover:shadow-md"
              style={{ background: "#fff", border: "1px solid #E2E8F0" }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p
                    className="font-heading text-sm font-semibold mb-0.5"
                    style={{ color: "#081D3A" }}
                  >
                    {a.title}
                  </p>
                  <p className="text-xs mb-2" style={{ color: "#64748B" }}>
                    {a.customerName}
                    {a.objectName && ` · ${a.objectName}`}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <AssignmentStatusBadge status={a.status} />
                    {(a.scheduledStart || a.scheduledEnd) && (
                      <span
                        className="text-xs flex items-center gap-1"
                        style={{ color: "#94A3B8" }}
                      >
                        <Clock className="h-3 w-3" />
                        {a.scheduledStart ?? ""}
                        {a.scheduledStart && a.scheduledEnd ? " – " : ""}
                        {a.scheduledEnd ?? ""}
                      </span>
                    )}
                  </div>
                </div>
                {a.personnelNames.length > 0 && (
                  <div className="flex items-start gap-1 text-xs" style={{ color: "#64748B" }}>
                    <Users className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>{a.personnelNames.join(", ")}</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create sheet */}
      {canWrite && (
        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent side="right" className="w-[560px] sm:max-w-[560px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Nieuwe opdracht aanmaken</SheetTitle>
              <SheetDescription>
                {`Datum voorgeselecteerd: ${label}`}
              </SheetDescription>
            </SheetHeader>
            <AssignmentForm
              mode="create"
              customers={customers}
              defaultDate={dateStr}
              onSuccess={(id) => {
                setCreateOpen(false);
                router.push(`/assignments/${id}`);
              }}
              onCancel={() => setCreateOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
