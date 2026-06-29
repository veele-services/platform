export const dynamic = "force-dynamic";

import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  Calendar,
  ClipboardCheck,
  Globe,
  MapPin,
  Tag,
} from "lucide-react";
import { getOpenAssignments } from "@/actions/open-assignments";
import { MobilePageShell } from "@/components/MobilePageShell";
import { ApplyButton } from "./ApplyButton";

const PRIORITY_LABELS: Record<string, string> = {
  low:      "Laag",
  normal:   "Normaal",
  high:     "Hoog",
  urgent:   "Urgent",
};

const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  low:    { bg: "#f1f5f9", fg: "#64748b" },
  normal: { bg: "#eff6ff", fg: "#3b82f6" },
  high:   { bg: "#fef3c7", fg: "#d97706" },
  urgent: { bg: "#fee2e2", fg: "#dc2626" },
};

const SECTOR_PREFIX_LABELS: Record<string, string> = {
  SCH: "Schoonmaak",
  BEV: "Beveiliging",
  FAC: "Facilitair",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

function timeRange(start: string | null, end: string | null): string | null {
  if (start && end) return `${start} - ${end}`;
  if (start) return `Vanaf ${start}`;
  if (end) return `Tot ${end}`;
  return null;
}

function serviceLabel(assignment: Awaited<ReturnType<typeof getOpenAssignments>>[number]): string {
  if (assignment.sectorName) return assignment.sectorName;
  const prefix = assignment.code.split("-")[0]?.toUpperCase();
  if (prefix && SECTOR_PREFIX_LABELS[prefix]) return SECTOR_PREFIX_LABELS[prefix];
  return assignment.taskCodes[0] ?? "Dienst";
}

export default async function OpenstaandePage() {
  const assignments = await getOpenAssignments();

  const open    = assignments.filter((a) => !a.isAlreadyApplied);
  const applied = assignments.filter((a) => a.isAlreadyApplied);

  return (
    <MobilePageShell
      title="Open diensten"
      subtitle="Meld je aan als kandidaat; planning bevestigt de inzet."
    >
      <div className="hidden">
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
          Openstaande opdrachten
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--color-secondary)" }}>
          Meld u aan als kandidaat — de planner bevestigt de definitieve inzet.
        </p>
      </div>

      {assignments.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <ClipboardCheck size={32} className="mx-auto mb-3" style={{ color: "var(--color-muted-fg)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            Geen openstaande opdrachten
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-secondary)" }}>
            Er zijn momenteel geen opdrachten beschikbaar waarvoor u in aanmerking komt.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <section>
          <h2
            className="mb-2 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Beschikbaar ({open.length})
          </h2>
          <div className="space-y-3">
            {open.map((a) => (
              <AssignmentCard key={a.id} assignment={a} />
            ))}
          </div>
        </section>
      )}

      {applied.length > 0 && (
        <section>
          <h2
            className="mb-2 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Al aangemeld ({applied.length})
          </h2>
          <div className="space-y-3">
            {applied.map((a) => (
              <AssignmentCard key={a.id} assignment={a} />
            ))}
          </div>
        </section>
      )}
    </MobilePageShell>
  );
}

function AssignmentCard({
  assignment,
}: {
  assignment: Awaited<ReturnType<typeof getOpenAssignments>>[number];
}) {
  const priorityStyle = assignment.priority
    ? (PRIORITY_COLORS[assignment.priority] ?? PRIORITY_COLORS.normal)
    : null;
  const priorityLabel = assignment.priority
    ? (PRIORITY_LABELS[assignment.priority] ?? assignment.priority)
    : null;

  const service = serviceLabel(assignment);
  const when = [formatDate(assignment.scheduledDate), timeRange(assignment.scheduledStart, assignment.scheduledEnd)]
    .filter(Boolean)
    .join(" · ");
  const clientLine = [assignment.customerName, assignment.objectName].filter(Boolean).join(" · ");
  const addressLine = [assignment.objectAddress, assignment.objectCity].filter(Boolean).join(", ");

  return (
    <article className="rounded-[22px] border bg-white p-3.5 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold" style={{ color: "var(--color-secondary)" }}>
            {assignment.code}
          </p>
          <p className="mt-1 line-clamp-2 text-[16px] font-black leading-5" style={{ color: "var(--color-primary)" }}>
            {assignment.title}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {assignment.isInterestInvite && (
            <span className="rounded-full px-2.5 py-1 text-[11px] font-black" style={{ backgroundColor: "#ecfeff", color: "#0f766e" }}>
              Onder voorbehoud
            </span>
          )}
          {priorityLabel && priorityStyle && (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-black"
              style={{ backgroundColor: priorityStyle.bg, color: priorityStyle.fg }}
            >
              {priorityLabel === "Urgent" && (
                <AlertCircle size={10} className="mr-0.5 inline-block" />
              )}
              {priorityLabel}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border bg-[#FAFBFD] p-3" style={{ borderColor: "var(--color-border)" }}>
        <div className="grid gap-2 text-[12px] font-semibold" style={{ color: "var(--color-secondary)" }}>
          <div className="flex items-center gap-2">
            <BriefcaseBusiness size={14} className="shrink-0" style={{ color: "var(--color-accent)" }} />
            <span className="min-w-0 truncate">
              <span className="font-black" style={{ color: "var(--color-primary)" }}>{service}</span>
              {assignment.taskCodes.length > 0 ? ` · ${assignment.taskCodes.slice(0, 2).join(", ")}` : ""}
            </span>
          </div>
          {clientLine && (
            <div className="flex items-center gap-2">
              <Building2 size={14} className="shrink-0" style={{ color: "var(--color-accent)" }} />
              <span className="min-w-0 truncate">{clientLine}</span>
            </div>
          )}
          {when && (
            <div className="flex items-center gap-2">
              <Calendar size={14} className="shrink-0" style={{ color: "var(--color-accent)" }} />
              <span className="min-w-0 truncate">{when}</span>
            </div>
          )}
          {assignment.requiredRegion && (
            <div className="flex items-center gap-2">
              <Globe size={14} className="shrink-0" style={{ color: "var(--color-accent)" }} />
              <span className="min-w-0 truncate">{assignment.requiredRegion}</span>
            </div>
          )}
          {addressLine && (
            <div className="flex items-center gap-2">
              <MapPin size={14} className="shrink-0" style={{ color: "var(--color-accent)" }} />
              <span className="min-w-0 truncate">{addressLine}</span>
            </div>
          )}
        </div>
        {assignment.taskCodes.length > 0 && (
          <div className="mt-2 flex items-start gap-2 border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
            <Tag size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
            <div className="flex flex-wrap gap-1">
              {assignment.taskCodes.map((code) => (
                <span
                  key={code}
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{ backgroundColor: "var(--color-muted)", color: "var(--color-secondary)" }}
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <ApplyButton
          assignmentId={assignment.id}
          title={assignment.title}
          isAlreadyApplied={assignment.isAlreadyApplied}
          interestStatus={assignment.interestStatus}
          canDecline={assignment.isInterestInvite}
        />
      </div>
    </article>
  );
}
