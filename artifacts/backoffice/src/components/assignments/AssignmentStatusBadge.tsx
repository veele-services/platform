import type { AssignmentStatus, AssignmentPriority } from "@/app/actions/assignments";
import { ProcessStatusBadge } from "@/components/workflows/ProcessStatus";
import { processStatusLabel, processStatusStyle } from "@/lib/process-status";

const PRIORITY_CONFIG: Record<AssignmentPriority, { label: string; bg: string; text: string }> = {
  low: { label: "Laag", bg: "#F1F5F9", text: "#64748B" },
  normal: { label: "Normaal", bg: "#EFF6FF", text: "#3B82F6" },
  high: { label: "Hoog", bg: "#FFF7ED", text: "#EA580C" },
  urgent: { label: "Urgent", bg: "#FEF2F2", text: "#DC2626" },
};

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  return <ProcessStatusBadge kind="assignment" status={status} />;
}

export function AssignmentPriorityBadge({ priority }: { priority: AssignmentPriority }) {
  const cfg = PRIORITY_CONFIG[priority] ?? {
    label: priority,
    bg: "#F1F5F9",
    text: "#64748B",
  };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

export function statusLabel(status: AssignmentStatus): string {
  return processStatusLabel("assignment", status);
}

export function statusAccentColor(status: string): string {
  return processStatusStyle("assignment", status).text;
}

export function priorityLabel(priority: AssignmentPriority): string {
  return PRIORITY_CONFIG[priority]?.label ?? priority;
}
