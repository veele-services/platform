export type FieldgridMarkerStatus =
  | "draft"
  | "open"
  | "planned"
  | "assigned"
  | "seen"
  | "started"
  | "paused"
  | "completed"
  | "cancelled"
  | "overdue"
  | "urgent";

export type MarkerStatusDefinition = {
  label: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  icon: "circle" | "diamond" | "square" | "triangle" | "check" | "warning";
  semantic: "inactive" | "open" | "planned" | "active" | "success" | "danger";
};

export const GOOGLE_MAPS_MARKER_STATUS: Record<
  FieldgridMarkerStatus,
  MarkerStatusDefinition
> = {
  draft: {
    label: "Concept",
    color: "#475569",
    backgroundColor: "#F1F5F9",
    borderColor: "#CBD5E1",
    icon: "circle",
    semantic: "inactive",
  },
  open: {
    label: "Open",
    color: "#1D4ED8",
    backgroundColor: "#DBEAFE",
    borderColor: "#60A5FA",
    icon: "circle",
    semantic: "open",
  },
  planned: {
    label: "Planbaar",
    color: "#7C3AED",
    backgroundColor: "#EDE9FE",
    borderColor: "#A78BFA",
    icon: "diamond",
    semantic: "planned",
  },
  assigned: {
    label: "Ingepland",
    color: "#0E7490",
    backgroundColor: "#CFFAFE",
    borderColor: "#22D3EE",
    icon: "square",
    semantic: "planned",
  },
  seen: {
    label: "Gezien",
    color: "#0369A1",
    backgroundColor: "#E0F2FE",
    borderColor: "#7DD3FC",
    icon: "circle",
    semantic: "active",
  },
  started: {
    label: "Gestart",
    color: "#C2410C",
    backgroundColor: "#FFEDD5",
    borderColor: "#FB923C",
    icon: "triangle",
    semantic: "active",
  },
  paused: {
    label: "Gepauzeerd",
    color: "#A16207",
    backgroundColor: "#FEF3C7",
    borderColor: "#FBBF24",
    icon: "warning",
    semantic: "active",
  },
  completed: {
    label: "Afgerond",
    color: "#047857",
    backgroundColor: "#D1FAE5",
    borderColor: "#34D399",
    icon: "check",
    semantic: "success",
  },
  cancelled: {
    label: "Geannuleerd",
    color: "#334155",
    backgroundColor: "#E2E8F0",
    borderColor: "#94A3B8",
    icon: "square",
    semantic: "inactive",
  },
  overdue: {
    label: "Te laat",
    color: "#B91C1C",
    backgroundColor: "#FEE2E2",
    borderColor: "#F87171",
    icon: "warning",
    semantic: "danger",
  },
  urgent: {
    label: "Urgent",
    color: "#BE123C",
    backgroundColor: "#FFE4E6",
    borderColor: "#FB7185",
    icon: "warning",
    semantic: "danger",
  },
};

export function markerStatusForAssignment(input: {
  status: string | null | undefined;
  priority?: string | null;
  overdue?: boolean;
}): FieldgridMarkerStatus {
  if (input.overdue) return "overdue";
  if (input.priority === "urgent" || input.priority === "high") return "urgent";

  switch (input.status) {
    case "draft":
      return "draft";
    case "open":
    case "requested":
      return "open";
    case "planned":
    case "schedulable":
      return "planned";
    case "assigned":
    case "scheduled":
      return "assigned";
    case "seen":
      return "seen";
    case "started":
    case "in_progress":
    case "on_the_way":
      return "started";
    case "paused":
      return "paused";
    case "completed":
    case "done":
    case "approved":
      return "completed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "open";
  }
}
