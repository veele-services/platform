"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, CalendarRange, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveLeavePeriod, rejectLeavePeriod } from "@/app/actions/availability";
import type { PendingLeaveRequest, LeaveType } from "@/app/actions/availability";

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  vakantie: "Vakantie",
  ziekte:   "Ziekte",
  overig:   "Overig",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

interface RowProps {
  request:  PendingLeaveRequest;
  onAction: () => void;
}

function VerlofRow({ request, onAction }: RowProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  function handle(action: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      const result = action === "approve"
        ? await approveLeavePeriod(request.id, request.personnelId)
        : await rejectLeavePeriod(request.id, request.personnelId);

      if (!result.success) {
        setError(result.message ?? "Actie mislukt.");
      } else {
        onAction();
      }
    });
  }

  return (
    <tr
      style={{
        borderBottom: "1px solid #E2E8F0",
        opacity: isPending ? 0.5 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {/* Medewerker */}
      <td className="py-3 pr-4">
        <span
          className="font-medium"
          style={{ color: "var(--color-foreground)", fontFamily: "var(--font-inter)", fontSize: "13px" }}
        >
          {request.firstName} {request.lastName}
        </span>
      </td>

      {/* Type */}
      <td className="py-3 pr-4">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={
            request.leaveType === "ziekte"
              ? { backgroundColor: "#FEE2E2", color: "#991B1B" }
              : request.leaveType === "vakantie"
                ? { backgroundColor: "#DBEAFE", color: "#1E40AF" }
                : { backgroundColor: "#F1F5F9", color: "#475569" }
          }
        >
          {LEAVE_TYPE_LABELS[request.leaveType]}
        </span>
      </td>

      {/* Periode */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1.5" style={{ color: "#334155", fontSize: "13px" }}>
          <CalendarRange style={{ width: "13px", height: "13px", color: "#64748B", flexShrink: 0 }} />
          <span>
            {formatDate(request.startDate)}
            {request.endDate && request.endDate !== request.startDate
              ? ` – ${formatDate(request.endDate)}`
              : ""}
          </span>
        </div>
      </td>

      {/* Reden */}
      <td className="py-3 pr-4">
        <span style={{ color: "#64748B", fontSize: "13px" }}>
          {request.reason ?? <span style={{ color: "#CBD5E1" }}>—</span>}
        </span>
      </td>

      {/* Ingediend */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-1" style={{ color: "#94A3B8", fontSize: "12px" }}>
          <Clock style={{ width: "12px", height: "12px", flexShrink: 0 }} />
          {formatDateTime(request.createdAt)}
        </div>
      </td>

      {/* Acties */}
      <td className="py-3">
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs" style={{ color: "#DC2626" }}>{error}</span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => handle("approve")}
            className="flex items-center gap-1.5 text-xs h-7 px-2.5"
            style={{ borderColor: "#16A34A", color: "#16A34A" }}
          >
            <CheckCircle2 style={{ width: "13px", height: "13px" }} />
            Goedkeuren
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => handle("reject")}
            className="flex items-center gap-1.5 text-xs h-7 px-2.5"
            style={{ borderColor: "#DC2626", color: "#DC2626" }}
          >
            <XCircle style={{ width: "13px", height: "13px" }} />
            Afwijzen
          </Button>
        </div>
      </td>
    </tr>
  );
}

interface VerlofInboxViewProps {
  initialRequests: PendingLeaveRequest[];
}

export function VerlofInboxView({ initialRequests }: VerlofInboxViewProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = initialRequests.filter((r) => !dismissed.has(r.id));

  function handleAction(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
  }

  if (visible.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl py-20 text-center"
        style={{ background: "#fff", border: "1px solid #E2E8F0" }}
      >
        <CheckCircle2 style={{ width: "40px", height: "40px", color: "var(--color-primary)", marginBottom: "12px" }} />
        <p className="font-medium" style={{ color: "var(--color-foreground)", fontSize: "15px" }}>
          Geen openstaande verlofaanvragen
        </p>
        <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
          Alle aanvragen zijn verwerkt.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "#fff", border: "1px solid #E2E8F0" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}>
              {["Medewerker", "Type", "Periode", "Reden", "Ingediend", "Acties"].map((h) => (
                <th
                  key={h}
                  className="px-0 pr-4 py-3 text-left font-semibold first:pl-6"
                  style={{
                    color: "#64748B",
                    fontSize: "11px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <VerlofRow
                key={r.id}
                request={r}
                onAction={() => handleAction(r.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
