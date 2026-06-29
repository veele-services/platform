import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Hourglass,
  Inbox,
} from "lucide-react";
import type {
  PersonnelTicketDepartment,
  PersonnelTicketPriority,
  PersonnelTicketStatus,
} from "@workspace/db";

export function departmentLabel(value: PersonnelTicketDepartment) {
  const labels: Record<PersonnelTicketDepartment, string> = {
    planning: "Planning",
    management: "Management",
    backoffice: "Backoffice",
    hr: "HR",
    finance: "Administratie",
    it: "IT",
  };
  return labels[value];
}

export function priorityLabel(value: PersonnelTicketPriority) {
  const labels: Record<PersonnelTicketPriority, string> = {
    low: "Laag",
    normal: "Normaal",
    high: "Hoog",
    urgent: "Urgent",
  };
  return labels[value];
}

export function TicketStatusBadge({
  status,
}: {
  status: PersonnelTicketStatus;
}) {
  const config: Record<
    PersonnelTicketStatus,
    { label: string; color: string; bg: string; Icon: typeof Inbox }
  > = {
    open: {
      label: "Open",
      color: "#2563EB",
      bg: "#EFF6FF",
      Icon: Inbox,
    },
    waiting_backoffice: {
      label: "Actie Veele",
      color: "#B45309",
      bg: "#FFFBEB",
      Icon: Hourglass,
    },
    waiting_personnel: {
      label: "Wacht op medewerker",
      color: "#DC2626",
      bg: "#FEF2F2",
      Icon: AlertTriangle,
    },
    closed: {
      label: "Afgesloten",
      color: "#047857",
      bg: "#ECFDF5",
      Icon: CheckCircle2,
    },
  };
  const { label, color, bg, Icon } = config[status];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black"
      style={{ color, backgroundColor: bg }}
    >
      <Icon size={13} strokeWidth={2.4} />
      {label}
    </span>
  );
}

export function PriorityBadge({
  priority,
}: {
  priority: PersonnelTicketPriority;
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
