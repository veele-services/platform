import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Hourglass,
  Inbox,
  UserRound,
  UsersRound,
} from "lucide-react";
import type {
  BackofficeTicketPriority,
  BackofficeTicketStatus,
  TicketKind,
} from "@/app/actions/tickets";

export function statusLabel(status: BackofficeTicketStatus) {
  const labels: Record<BackofficeTicketStatus, string> = {
    open: "Open",
    waiting_backoffice: "Bij Veele",
    waiting_customer: "Wacht op klant",
    waiting_personnel: "Wacht op medewerker",
    closed: "Gesloten",
  };
  return labels[status];
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
  const config: Record<
    BackofficeTicketStatus,
    { color: string; bg: string; Icon: typeof Inbox }
  > = {
    open: { color: "#2563EB", bg: "#EFF6FF", Icon: Inbox },
    waiting_backoffice: { color: "#B45309", bg: "#FFFBEB", Icon: Hourglass },
    waiting_customer: { color: "#DC2626", bg: "#FEF2F2", Icon: AlertTriangle },
    waiting_personnel: { color: "#DC2626", bg: "#FEF2F2", Icon: AlertTriangle },
    closed: { color: "#047857", bg: "#ECFDF5", Icon: CheckCircle2 },
  };
  const { color, bg, Icon } = config[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black"
      style={{ color, backgroundColor: bg }}
    >
      <Icon size={13} strokeWidth={2.4} />
      {statusLabel(status)}
    </span>
  );
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
