"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import type { CustomerReport } from "@/actions/reports";

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("nl-NL", {
    day:   "numeric",
    month: "long",
    year:  "numeric",
  });
}

interface Props {
  report: CustomerReport;
}

export function RapportCard({ report }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: "rgba(0,183,179,0.1)" }}
        >
          <Clock size={18} style={{ color: "var(--color-accent-accessible)" }} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-snug" style={{ color: "var(--color-primary)" }}>
            {report.assignmentTitle}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "var(--color-secondary)" }}>
            <span>{formatDate(report.submittedAt)}</span>
            {report.hoursWorked && (
              <span>{parseFloat(report.hoursWorked).toLocaleString("nl-NL")} uur gewerkt</span>
            )}
          </div>
          <p className="mt-1.5 text-xs line-clamp-2" style={{ color: "var(--color-secondary)" }}>
            {report.customerVisibleSummary}
          </p>
        </div>

        <span className="flex-shrink-0 mt-1" style={{ color: "var(--color-secondary)" }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {expanded && (
        <div
          className="px-4 pb-4 space-y-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <div className="pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-secondary)" }}>
              Rapportinhoud
            </p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-primary)" }}>
              {report.customerVisibleSummary}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
