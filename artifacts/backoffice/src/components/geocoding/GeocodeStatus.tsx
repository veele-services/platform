import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MapPin,
  MinusCircle,
} from "lucide-react";

type GeocodeStatus =
  | "pending"
  | "geocoded"
  | "failed"
  | "manual"
  | "not_required"
  | string
  | null
  | undefined;

type GeocodeStatusProps = {
  status: GeocodeStatus;
  latitude?: string | null;
  longitude?: string | null;
  geocodedAt?: string | null;
  provider?: string | null;
  confidence?: string | null;
  error?: string | null;
  compact?: boolean;
};

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function normalizeStatus(status: GeocodeStatus): string {
  return (status ?? "pending").toString();
}

export function formatGeocodeStatus(status: GeocodeStatus): string {
  switch (normalizeStatus(status)) {
    case "geocoded":
      return "Gecodeerd";
    case "pending":
      return "Wacht op geocoding";
    case "failed":
      return "Niet gevonden";
    case "manual":
      return "Handmatig";
    case "not_required":
      return "Niet nodig";
    default:
      return "Onbekend";
  }
}

function statusTone(status: GeocodeStatus): {
  icon: typeof CheckCircle2;
  classes: string;
} {
  switch (normalizeStatus(status)) {
    case "geocoded":
      return { icon: CheckCircle2, classes: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "failed":
      return { icon: AlertTriangle, classes: "border-red-200 bg-red-50 text-red-700" };
    case "manual":
      return { icon: MapPin, classes: "border-blue-200 bg-blue-50 text-blue-700" };
    case "not_required":
      return { icon: MinusCircle, classes: "border-slate-200 bg-slate-50 text-slate-500" };
    case "pending":
    default:
      return { icon: Clock3, classes: "border-amber-200 bg-amber-50 text-amber-700" };
  }
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function GeocodeStatusBadge({ status }: { status: GeocodeStatus }) {
  const tone = statusTone(status);
  const Icon = tone.icon;

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        tone.classes,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {formatGeocodeStatus(status)}
    </span>
  );
}

export function GeocodeStatusSummary({
  status,
  latitude,
  longitude,
  geocodedAt,
  provider,
  confidence,
  error,
  compact = false,
}: GeocodeStatusProps) {
  const hasCoordinates = Boolean(latitude && longitude);
  const dateLabel = formatDateTime(geocodedAt);
  const metadata = [
    provider ? provider.toUpperCase() : null,
    confidence ? `${confidence}%` : null,
    dateLabel,
  ].filter(Boolean);

  return (
    <div
      className={cx(
        "rounded-lg border border-slate-200 bg-slate-50/70",
        compact ? "px-3 py-2" : "px-4 py-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <GeocodeStatusBadge status={status} />
        {hasCoordinates && (
          <span className="font-mono text-xs text-slate-500">
            {latitude}, {longitude}
          </span>
        )}
      </div>
      {metadata.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">{metadata.join(" - ")}</p>
      )}
      {error && (
        <p className="mt-1 text-xs font-medium text-red-700">{error}</p>
      )}
    </div>
  );
}
