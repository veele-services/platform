import {
  getProcessStatus,
  getProcessStatuses,
  processStatusStyle,
  type ProcessKind,
} from "@/lib/process-status";

type BadgeSize = "xs" | "sm" | "md";

export function ProcessStatusBadge({
  kind,
  status,
  size = "sm",
  label,
}: {
  kind: ProcessKind;
  status: string;
  size?: BadgeSize;
  label?: string;
}) {
  const config = getProcessStatus(kind, status);
  const style = processStatusStyle(kind, status);
  const sizeClass =
    size === "xs"
      ? "px-2 py-0.5 text-[11px]"
      : size === "md"
        ? "px-3 py-1 text-sm"
        : "px-2.5 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${sizeClass}`}
      title={config.description}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.dot }} />
      {label ?? config.label}
    </span>
  );
}

export function ProcessStepper({
  kind,
  status,
  className = "",
  compact = false,
}: {
  kind: ProcessKind;
  status: string;
  className?: string;
  compact?: boolean;
}) {
  const active = getProcessStatus(kind, status);
  const statuses = getProcessStatuses(kind)
    .filter((item) => !["rejected", "expired", "cancelled", "canceled", "failed", "not_completed"].includes(item.value) || item.value === status)
    .sort((a, b) => a.order - b.order);

  return (
    <div className={className}>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {statuses.map((item, index) => {
          const style = processStatusStyle(kind, item.value);
          const current = item.value === active.value;
          const done = item.order < active.order && active.tone !== "danger";
          const pending = !current && !done;

          return (
            <div key={item.value} className="flex min-w-0 items-center gap-2">
              <div
                className="flex items-center gap-2 rounded-full border px-2.5 py-1"
                title={item.description}
                style={{
                  backgroundColor: current ? style.bg : done ? "#ECFDF5" : "#FFFFFF",
                  borderColor: current ? style.border : done ? "#A7F3D0" : "#E2E8F0",
                  color: current ? style.text : done ? "#047857" : "#94A3B8",
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: current ? style.dot : done ? "#10B981" : "#CBD5E1" }}
                />
                <span className={`whitespace-nowrap font-semibold ${compact ? "text-[11px]" : "text-xs"}`}>
                  {item.shortLabel ?? item.label}
                </span>
              </div>
              {index < statuses.length - 1 && (
                <span
                  className="h-px w-4 shrink-0"
                  style={{ backgroundColor: pending ? "#E2E8F0" : "#A7F3D0" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
