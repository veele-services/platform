import {
  Clock3,
  UserRound,
  UsersRound,
} from "lucide-react";
import type {
  BackofficeTicketPriority,
  BackofficeTicketStatus,
  TicketKind,
} from "@/app/actions/tickets";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";
import { processStatusLabel } from "@/lib/process-status";

export function statusLabel(status: BackofficeTicketStatus) {
  return processStatusLabel("ticket", status);
}

export function priorityLabel(priority: BackofficeTicketPriority) {
  const labels: Record<BackofficeTicketPriority, string> = {
    low: "Laag",
    normal: "Normaal",
    high: "Hoog",
    urgent: "Urgent",
  };
  return labels[priority];
}

export function sourceLabel(kind: TicketKind) {
  return kind === "customer" ? "Klant" : "Personeel";
}

export function departmentLabel(value: string) {
  const labels: Record<string, string> = {
    planning: "Planning",
    management: "Management",
    backoffice: "Backoffice",
    finance: "Financieel",
    service: "Service",
    support: "App support",
    hr: "HR",
    it: "IT",
  };
  return labels[value] ?? value;
}

export function TicketSourceBadge({ kind }: { kind: TicketKind }) {
  const Icon = kind === "customer" ? UsersRound : UserRound;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#E8FBFA] px-2.5 py-1 text-[11px] font-black text-[#087C79]">
      <Icon size={13} strokeWidth={2.4} />
      {sourceLabel(kind)}
    </span>
  );
}

export function TicketStatusBadge({
  status,
}: {
  status: BackofficeTicketStatus;
}) {
  return <ProcessStatusBadge kind="ticket" status={status} size="xs" />;
}

export function PriorityBadge({
  priority,
}: {
  priority: BackofficeTicketPriority;
}) {
  const color =
    priority === "urgent"
      ? "#DC2626"
      : priority === "high"
        ? "#B45309"
        : priority === "low"
          ? "#64748B"
          : "#087C79";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black"
      style={{ color }}
    >
      <Clock3 size={13} strokeWidth={2.4} />
      {priorityLabel(priority)}
    </span>
  );
}
