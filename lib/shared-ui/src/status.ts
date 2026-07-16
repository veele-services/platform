export const statusTones = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-status-info/30 bg-status-info/10 text-status-info-foreground",
  pending: "border-status-pending/30 bg-status-pending/10 text-status-pending-foreground",
  success: "border-status-success/30 bg-status-success/10 text-status-success-foreground",
  warning: "border-status-warning/30 bg-status-warning/10 text-status-warning-foreground",
  danger: "border-status-danger/30 bg-status-danger/10 text-status-danger-foreground",
} as const;

export type StatusTone = keyof typeof statusTones;

export const statusLabels: Record<StatusTone, string> = {
  neutral: "Onbekend",
  info: "Informatie",
  pending: "In behandeling",
  success: "Geslaagd",
  warning: "Let op",
  danger: "Mislukt",
};
