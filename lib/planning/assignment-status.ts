import type { CSSProperties } from "react";
import { executionLabels } from "../dossiers/status";

// These are personnel assignment states, independent of the shared work order.
export const assignmentStatuses = [
  { status: "planned", label: executionLabels.planned, description: "Ingepland, nog niet vrijgegeven aan deze medewerker.", background: "#f1f5f9", border: "#64748b", ink: "#334155" },
  { status: "released", label: "Nog niet gezien", description: "Vrijgegeven aan deze medewerker, nog niet geopend.", background: "#eff6ff", border: "#3b82f6", ink: "#1e40af" },
  { status: "seen", label: executionLabels.seen, description: "Deze medewerker heeft de werkbon geopend.", background: "#ecfeff", border: "#0891b2", ink: "#155e75" },
  { status: "travelling", label: executionLabels.travelling, description: "Deze medewerker is onderweg naar de locatie.", background: "#fffbeb", border: "#d97706", ink: "#92400e" },
  { status: "in_progress", label: executionLabels.in_progress, description: "Deze medewerker is gestart met de werkzaamheden.", background: "#f5f3ff", border: "#8b5cf6", ink: "#5b21b6" },
  { status: "completed", label: executionLabels.completed, description: "Deze medewerker heeft de eigen inzet afgerond.", background: "#f0fdf4", border: "#16a34a", ink: "#166534" },
  { status: "returned", label: executionLabels.returned, description: "De inzet is teruggegeven aan de planning.", background: "#fff1f2", border: "#e11d48", ink: "#9f1239" },
  { status: "cancelled", label: executionLabels.cancelled, description: "Deze inzet is ingetrokken.", background: "#faf5f0", border: "#a87850", ink: "#78543a" },
] as const;

const unknownStatus = { status: "unknown", label: "Status onbekend", description: "De status van deze medewerker is nog niet bekend.", background: "#f8fafc", border: "#94a3b8", ink: "#475569" };

export function assignmentStatus(status: string) {
  return assignmentStatuses.find((item) => item.status === status) ?? unknownStatus;
}

// Cards and legend use the same palette, including a neutral unknown fallback.
export function assignmentStatusStyle(status: ReturnType<typeof assignmentStatus>): CSSProperties {
  return {
    "--pb-status-background": status.background,
    "--pb-status-border": status.border,
    "--pb-status-ink": status.ink,
  } as CSSProperties;
}
