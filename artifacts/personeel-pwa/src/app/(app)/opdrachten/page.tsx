import Link from "next/link";
import { Building2, MapPin, Clock, ChevronRight, FileText } from "lucide-react";
import { getMyAssignments } from "@/actions/assignments";
import { StatusBadge } from "@/components/StatusBadge";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Geen datum";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

function formatTimeSlot(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  return [start, end].filter(Boolean).join(" – ");
}

const ACTIVE_STATUSES = new Set([
  "scheduled", "seen", "in_progress", "plannable",
]);

const REPORT_STATUSES = new Set([
  "completed", "not_completed", "report_submitted", "report_approved",
  "invoice_ready", "invoiced", "paid", "closed",
]);

export default async function OpdrachtenPage() {
  const assignments = await getMyAssignments();
  const today       = new Date().toISOString().slice(0, 10);

  const upcoming = assignments.filter(
    (a) => a.scheduledDate && a.scheduledDate >= today && ACTIVE_STATUSES.has(a.status),
  );
  const active = assignments.filter(
    (a) => ACTIVE_STATUSES.has(a.status) && !(a.scheduledDate && a.scheduledDate >= today),
  );
  const reporting = assignments.filter((a) => REPORT_STATUSES.has(a.status));

  return (
    <div className="space-y-5 p-4 md:p-0">
      <h1 className="text-xl font-bold md:text-2xl" style={{ color: "var(--color-primary)" }}>
        Werkbonnen
      </h1>

      {assignments.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <FileText size={36} className="mx-auto mb-3" style={{ color: "var(--color-muted-fg)" }} />
          <p className="font-medium" style={{ color: "var(--color-primary)" }}>
            Geen werkbonnen gevonden
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--color-secondary)" }}>
            U heeft nog geen bevestigde opdrachten.
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <WerkbonGroep
          titel="Aankomend"
          items={upcoming}
          accentColor="var(--color-accent)"
        />
      )}

      {active.length > 0 && (
        <WerkbonGroep
          titel="Actief"
          items={active}
          accentColor="var(--color-accent)"
        />
      )}

      {reporting.length > 0 && (
        <WerkbonGroep
          titel="Afgerond & rapportage"
          items={reporting}
          accentColor="var(--color-secondary)"
          muted
        />
      )}
    </div>
  );
}

type WerkbonItem = Awaited<ReturnType<typeof getMyAssignments>>[number];

function WerkbonGroep({
  titel,
  items,
  accentColor,
  muted = false,
}: {
  titel: string;
  items: WerkbonItem[];
  accentColor: string;
  muted?: boolean;
}) {
  return (
    <section>
      <h2
        className="mb-2.5 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-secondary)" }}
      >
        {titel}
      </h2>
      <div className="space-y-2">
        {items.map((a) => (
          <WerkbonKaart key={a.id} item={a} accentColor={accentColor} muted={muted} />
        ))}
      </div>
    </section>
  );
}

function formatDate2(dateStr: string | null): string {
  if (!dateStr) return "Geen datum";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

function WerkbonKaart({
  item,
  accentColor,
  muted,
}: {
  item: WerkbonItem;
  accentColor: string;
  muted: boolean;
}) {
  const timeSlot = [item.scheduledStart, item.scheduledEnd].filter(Boolean).join(" – ");
  const addressLine = [item.objectAddress, item.objectPostalCode, item.objectCity]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/opdrachten/${item.id}`}
      className="block rounded-2xl bg-white shadow-sm transition-all active:scale-[0.99]"
      style={{ opacity: muted ? 0.85 : 1 }}
    >
      {/* Werkbonnummer header strip */}
      <div
        className="flex items-center justify-between rounded-t-2xl px-4 py-2.5"
        style={{ backgroundColor: muted ? "var(--color-muted)" : "rgba(0,183,179,0.08)" }}
      >
        <span className="font-mono text-xs font-bold" style={{ color: accentColor }}>
          {item.code || "—"}
        </span>
        <StatusBadge status={item.status} />
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {/* Datum + tijdvak */}
        <div className="mb-2 flex items-center gap-1.5">
          <Clock size={13} style={{ color: "var(--color-secondary)" }} />
          <span className="text-xs font-medium" style={{ color: "var(--color-secondary)" }}>
            {formatDate2(item.scheduledDate)}
            {timeSlot ? ` · ${timeSlot}` : ""}
          </span>
        </div>

        {/* Klantnaam */}
        {item.customerName && (
          <div className="mb-1 flex items-center gap-1.5">
            <Building2 size={13} style={{ color: "var(--color-secondary)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
              {item.customerName}
            </span>
          </div>
        )}

        {/* Adres */}
        {addressLine && (
          <div className="flex items-start gap-1.5">
            <MapPin size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-muted-fg)" }} />
            <span className="text-xs" style={{ color: "var(--color-secondary)" }}>
              {addressLine}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-end rounded-b-2xl border-t px-4 py-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="text-xs" style={{ color: "var(--color-accent)" }}>
          Werkbon openen
        </span>
        <ChevronRight size={14} style={{ color: "var(--color-accent)" }} />
      </div>
    </Link>
  );
}
