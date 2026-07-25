import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  MapPin,
  Calendar,
  Clock,
  FileText,
  StickyNote,
  Users,
  CheckCircle2,
  Clock3,
  Receipt,
  FileCheck2,
  AlertTriangle,
  TrendingUp,
  ClipboardList,
  Mail,
  Phone,
  KeyRound,
} from "lucide-react";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import {
  AssignmentStatusBadge,
  AssignmentPriorityBadge,
} from "@/components/assignments/AssignmentStatusBadge";
import {
  AssignmentDetailActions,
  AssignmentTaskManager,
} from "@/components/assignments/AssignmentDetailActions";
import { AssignmentStatusStepper } from "@/components/assignments/AssignmentStatusStepper";
import {
  getAssignment,
  getAssignmentPlanningReadiness,
  getCustomerOptions,
  getPersonnelEligibilityForAssignment,
  getTaskCodeOptions,
  listAssignmentInterestRounds,
  type AssignmentStatus,
} from "@/app/actions/assignments";
import { getReportForAssignment } from "@/app/actions/reports";
import { SubmitReportForm } from "@/components/reports/SubmitReportForm";
import {
  getInvoiceForAssignment,
  getAssignmentInvoiceData,
  getInvoiceDefaultPaymentTermDays,
} from "@/app/actions/invoices";
import { CreateInvoiceForm } from "@/components/invoices/CreateInvoiceForm";
import {
  getQuoteForAssignment,
  getAssignmentQuoteData,
} from "@/app/actions/quotes";
import { CreateQuoteForm } from "@/components/quotes/CreateQuoteForm";
import { DirectApprovalButton } from "@/components/quotes/DirectApprovalButton";
import type { QuoteStatus } from "@/app/actions/quotes";
import { listDocuments } from "@/app/actions/documents";
import { AssignmentDocumentsPanel } from "@/components/documents/AssignmentDocumentsPanel";
import { InterestPollButton } from "@/components/assignments/InterestPollButton";
import { InterestRoundHistory } from "@/components/assignments/InterestRoundHistory";
import { SmartCandidateActions } from "@/components/assignments/SmartCandidateActions";
import {
  ProcessStatusBadge,
  ProcessStepper,
} from "@/components/workflows/ProcessStatus";
import {
  TenantDetailHeader,
  TenantDetailResponsiveActions,
  TenantDetailSectionNav,
  TenantPageShell,
} from "@/components/tenant-ui";

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canRead = await hasPermission("assignments", "read");
    if (!canRead) return { title: "Geen toegang" };
    const { id } = await params;
    const assignment = await getAssignment(id);
    return { title: assignment?.title ?? "Assignment" };
  } catch {
    return { title: "Assignment" };
  }
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-3 py-3"
      style={{ borderBottom: "1px solid #F1F5F9" }}
    >
      <Icon
        className="h-4 w-4 mt-0.5 flex-shrink-0"
        style={{ color: "#94A3B8" }}
      />
      <div className="min-w-0 flex-1">
        <p
          className="text-xs font-medium uppercase tracking-wider mb-0.5"
          style={{ color: "#94A3B8" }}
        >
          {label}
        </p>
        <div className="text-sm" style={{ color: "var(--color-foreground)" }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function capacityStyle(status: "green" | "orange" | "red") {
  if (status === "green") {
    return {
      label: "Groen",
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
    };
  }
  if (status === "orange") {
    return {
      label: "Oranje",
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FCD34D",
    };
  }
  return {
    label: "Rood",
    bg: "#FEF2F2",
    text: "#B91C1C",
    border: "#FECACA",
  };
}

function formatActualTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function formatAddress(parts: Array<string | null | undefined>): string {
  return (
    parts
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(", ") || "Geen adres bekend"
  );
}

function DetailCard({
  title,
  children,
  icon: Icon,
}: {
  title: string;
  children: React.ReactNode;
  icon: React.ElementType;
}) {
  return (
    <div
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: "#E2E8F0" }}
    >
      <h3
        className="mb-3 flex items-center gap-2 font-heading text-sm font-semibold"
        style={{ color: "var(--color-foreground)" }}
      >
        <Icon className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm" style={{ color: "#94A3B8" }}>
      {children}
    </p>
  );
}

type AssignmentDetail = NonNullable<Awaited<ReturnType<typeof getAssignment>>>;
type PlanningReadiness = NonNullable<
  Awaited<ReturnType<typeof getAssignmentPlanningReadiness>>
>;
type InterestRounds = Awaited<ReturnType<typeof listAssignmentInterestRounds>>;

type PlanningPersonState = {
  label: string;
  bg: string;
  text: string;
  border: string;
};

function getPlanningPersonState(
  person: {
    assignmentLinkStatus: string | null;
    interestStatus: string | null;
  },
  hasPlannedDate: boolean,
): PlanningPersonState | null {
  if (person.assignmentLinkStatus === "assigned") {
    return {
      label: hasPlannedDate ? "Ingepland" : "Gekoppeld",
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
    };
  }

  if (person.assignmentLinkStatus === "suggested") {
    return {
      label: "Voorgesteld",
      bg: "#EFF6FF",
      text: "#1D4ED8",
      border: "#BFDBFE",
    };
  }

  if (person.interestStatus === "confirmed") {
    return {
      label: "Bevestigd",
      bg: "#ECFDF5",
      text: "#047857",
      border: "#A7F3D0",
    };
  }

  if (person.interestStatus === "selected") {
    return {
      label: "Geselecteerd",
      bg: "#EEF2FF",
      text: "#4338CA",
      border: "#C7D2FE",
    };
  }

  if (person.interestStatus === "reserve") {
    return {
      label: "Reserve",
      bg: "#FFFBEB",
      text: "#B45309",
      border: "#FCD34D",
    };
  }

  if (person.interestStatus === "interested") {
    return {
      label: "Interesse",
      bg: "#ECFEFF",
      text: "#0F766E",
      border: "#A5F3FC",
    };
  }

  return null;
}

function CapacityMatchingSection({
  assignmentId,
  planningReadiness,
  interestRounds,
  canManagePlanning,
}: {
  assignmentId: string;
  planningReadiness: PlanningReadiness;
  interestRounds: InterestRounds;
  canManagePlanning: boolean;
}) {
  const style = capacityStyle(planningReadiness.capacityStatus);

  const metrics = [
    {
      label: "Benodigd",
      value: planningReadiness.requiredSlots,
      className: "bg-slate-50",
      valueClassName: "",
      labelClassName: "",
    },
    {
      label: "Geschikt totaal",
      value: planningReadiness.suitableCount,
      className: "bg-sky-50",
      valueClassName: "text-sky-700",
      labelClassName: "text-sky-700/75",
    },
    {
      label: "Beschikbaar",
      value: planningReadiness.fullyAvailableCount,
      className: "bg-emerald-50",
      valueClassName: "text-emerald-700",
      labelClassName: "text-emerald-700/75",
    },
    {
      label: "Topmatches",
      value: planningReadiness.topMatchCount,
      className: "bg-violet-50",
      valueClassName: "text-violet-700",
      labelClassName: "text-violet-700/75",
    },
    {
      label: "Interesse",
      value: planningReadiness.interestedCount,
      className: "bg-amber-50",
      valueClassName: "text-amber-700",
      labelClassName: "text-amber-700/75",
    },
    {
      label: "Blokkades",
      value: planningReadiness.blockedCount,
      className: "bg-red-50",
      valueClassName: "text-red-700",
      labelClassName: "text-red-700/75",
    },
  ];

  return (
    <section className="veele-card">
      <div
        className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-start md:justify-between"
        style={{ borderColor: "#E2E8F0" }}
      >
        <div>
          <h2
            className="font-heading text-lg font-semibold flex items-center gap-2"
            style={{ color: "var(--color-foreground)" }}
          >
            <TrendingUp className="h-5 w-5" style={{ color: "var(--color-primary)" }} />
            Capaciteit & matching
          </h2>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Controleer direct of deze opdracht uitvoerbaar is en welke
            medewerkers logisch passen.
          </p>
        </div>
        <span
          className="w-fit rounded-full border px-3 py-1 text-xs font-semibold"
          style={{
            backgroundColor: style.bg,
            borderColor: style.border,
            color: style.text,
          }}
        >
          {style.label}
        </span>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div
          className="rounded-2xl border p-4 text-sm leading-6"
          style={{
            borderColor: style.border,
            backgroundColor: style.bg,
            color: style.text,
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
            Planningsadvies
          </p>
          <p className="mt-1">{planningReadiness.advice}</p>
        </div>

        <div
          className="rounded-2xl border p-4 text-sm"
          style={{ borderColor: "#E2E8F0" }}
        >
          <div className="flex items-center justify-between gap-3">
            <span style={{ color: "#64748B" }}>Hoogste match</span>
            <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>
              {planningReadiness.highestMatchScore}%
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span style={{ color: "#64748B" }}>Definitief gekoppeld</span>
            <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>
              {planningReadiness.assignedCount}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span style={{ color: "#64748B" }}>Suggesties</span>
            <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>
              {planningReadiness.suggestedCount}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={`rounded-2xl p-4 ${metric.className}`}
          >
            <p
              className={`text-xl font-semibold ${metric.valueClassName}`}
              style={metric.valueClassName ? undefined : { color: "var(--color-foreground)" }}
            >
              {metric.value}
            </p>
            <p
              className={`mt-1 text-xs ${metric.labelClassName}`}
              style={metric.labelClassName ? undefined : { color: "#64748B" }}
            >
              {metric.label}
            </p>
          </div>
        ))}
      </div>

      {planningReadiness.topMatches.length > 0 && (
        <div className="mt-5">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-wide"
            style={{ color: "#94A3B8" }}
          >
            Beste matches
          </p>
          <div className="grid gap-3 lg:grid-cols-3">
            {planningReadiness.topMatches.map((person) => {
              const personState = getPlanningPersonState(
                person,
                planningReadiness.hasPlannedDate,
              );

              return (
                <div
                  key={person.id}
                  className="rounded-2xl bg-slate-50 px-4 py-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="truncate font-semibold"
                        style={{ color: "var(--color-foreground)" }}
                      >
                        {person.name}
                      </p>
                      <p
                        className="mt-0.5 truncate text-xs"
                        style={{ color: "#64748B" }}
                      >
                        {person.sectorName ?? "Geen sector"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {person.matchScore}%
                      </span>
                      {personState && (
                        <span
                          className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: personState.bg,
                            borderColor: personState.border,
                            color: personState.text,
                          }}
                        >
                          {personState.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {person.positives.slice(0, 3).map((reason) => (
                      <span
                        key={reason}
                        className="rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700"
                      >
                        + {reason}
                      </span>
                    ))}
                    {person.negatives.slice(0, 2).map((reason) => (
                      <span
                        key={reason}
                        className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700"
                      >
                        - {reason}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "#94A3B8" }}
            >
              Kandidaten
            </p>
            <span className="text-xs" style={{ color: "#94A3B8" }}>
              {planningReadiness.candidates.length} beoordeeld
            </span>
          </div>

          {planningReadiness.candidates.length > 0 ? (
            <div className="grid max-h-[560px] gap-3 overflow-y-auto pr-1 2xl:grid-cols-2">
              {planningReadiness.candidates.slice(0, 12).map((candidate) => {
                const candidateState = getPlanningPersonState(
                  candidate,
                  planningReadiness.hasPlannedDate,
                );
                const isAlreadyAssigned =
                  candidate.assignmentLinkStatus === "assigned";

                return (
                  <div
                    key={candidate.id}
                    className="rounded-2xl border p-4 text-sm"
                    style={{
                      borderColor:
                        candidate.hardStatus === "eligible"
                          ? "#A7F3D0"
                          : candidate.hardStatus === "warning"
                            ? "#FCD34D"
                            : "#FECACA",
                      backgroundColor:
                        candidate.hardStatus === "eligible"
                          ? "#F8FFFC"
                          : candidate.hardStatus === "warning"
                            ? "#FFFCF3"
                            : "#FFF7F7",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="truncate font-semibold"
                          style={{ color: "var(--color-foreground)" }}
                        >
                          {candidate.name}
                        </p>
                        <p
                          className="mt-0.5 truncate text-xs"
                          style={{ color: "#64748B" }}
                        >
                          {candidate.sectorName ?? "Geen sector"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold"
                          style={{ color: "var(--color-foreground)" }}
                        >
                          {candidate.matchScore}%
                        </span>
                        {candidateState && (
                          <span
                            className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              backgroundColor: candidateState.bg,
                              borderColor: candidateState.border,
                              color: candidateState.text,
                            }}
                          >
                            {candidateState.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {candidate.positives.slice(0, 3).map((reason) => (
                        <span
                          key={reason}
                          className="rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700"
                        >
                          + {reason}
                        </span>
                      ))}
                      {candidate.negatives.slice(0, 3).map((reason) => (
                        <span
                          key={reason}
                          className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700"
                        >
                          - {reason}
                        </span>
                      ))}
                    </div>
                    {canManagePlanning &&
                      candidate.hardStatus !== "blocked" &&
                      !isAlreadyAssigned && (
                        <div className="mt-3">
                          <SmartCandidateActions
                            assignmentId={assignmentId}
                            personnelId={candidate.id}
                          />
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="rounded-2xl border border-dashed p-6 text-sm"
              style={{ borderColor: "#CBD5E1", color: "#64748B" }}
            >
              Nog geen kandidaten berekend.
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          {!planningReadiness.hasMoment && (
            <div
              className="rounded-2xl border p-4 text-sm"
              style={{
                borderColor: "#FCD34D",
                background: "#FFFBEB",
                color: "#92400E",
              }}
            >
              Vul eerst datum en tijdvak in om beschikbaarheid betrouwbaar te
              bepalen.
            </div>
          )}

          {canManagePlanning && (
            <div
              className="rounded-2xl border p-4"
              style={{ borderColor: "#E2E8F0" }}
            >
              <p
                className="mb-3 text-xs font-semibold uppercase tracking-wide"
                style={{ color: "#94A3B8" }}
              >
                Interessepeiling
              </p>
              <InterestPollButton
                assignmentId={assignmentId}
                disabled={!planningReadiness.canPoll}
              />
            </div>
          )}

          <div
            className="rounded-2xl border p-4"
            style={{ borderColor: "#E2E8F0" }}
          >
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-wide"
              style={{ color: "#94A3B8" }}
            >
              Rondegeschiedenis
            </p>
            <InterestRoundHistory
              assignmentId={assignmentId}
              rounds={interestRounds}
              canWrite={canManagePlanning}
            />
          </div>
        </aside>
      </div>
    </section>
  );
}

function WorkOrderOverviewSection({
  assignment,
  canWrite,
}: {
  assignment: AssignmentDetail;
  canWrite: boolean;
}) {
  const objectAddress = formatAddress([
    assignment.objectAddress,
    [assignment.objectPostalCode, assignment.objectCity]
      .filter(Boolean)
      .join(" "),
  ]);
  const customerAddress = formatAddress([
    assignment.customerAddress,
    [assignment.customerPostalCode, assignment.customerCity]
      .filter(Boolean)
      .join(" "),
  ]);
  const objectNotes = [
    assignment.objectFixedInstructions && {
      label: "Vaste instructies",
      value: assignment.objectFixedInstructions,
    },
    assignment.objectSpecialNotes && {
      label: "Bijzonderheden object",
      value: assignment.objectSpecialNotes,
    },
    assignment.description && {
      label: "Opdrachtomschrijving",
      value: assignment.description,
    },
    canWrite &&
      assignment.notes && {
        label: "Interne opdrachtnotities",
        value: assignment.notes,
      },
    canWrite &&
      assignment.customerNotes && {
        label: "Interne klantnotities",
        value: assignment.customerNotes,
      },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <section className="veele-card">
      <div
        className="flex flex-col gap-2 border-b pb-4 md:flex-row md:items-start md:justify-between"
        style={{ borderColor: "#E2E8F0" }}
      >
        <div>
          <h2
            className="font-heading text-lg font-semibold"
            style={{ color: "var(--color-foreground)" }}
          >
            Werkboninformatie
          </h2>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Klant, object, adres, opmerkingen en checklist voor uitvoering en
            backoffice-afhandeling.
          </p>
        </div>
        <span
          className="w-fit rounded-full border px-3 py-1 text-xs font-semibold"
          style={{
            background: "#EFF6FF",
            borderColor: "#BFDBFE",
            color: "#1D4ED8",
          }}
        >
          {assignment.personnel.length} / {assignment.requiredPersonnelCount}{" "}
          medewerker(s)
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <DetailCard title="Klantdata" icon={Building2}>
          <div className="space-y-2 text-sm" style={{ color: "var(--color-foreground)" }}>
            <p className="font-semibold">{assignment.customerName}</p>
            {assignment.customerCode && (
              <p className="text-xs" style={{ color: "#64748B" }}>
                {assignment.customerCode}
              </p>
            )}
            {customerAddress !== "Geen adres bekend" && (
              <p>{customerAddress}</p>
            )}
            {assignment.customerContactName && (
              <p>Contact: {assignment.customerContactName}</p>
            )}
            {assignment.customerContactEmail && (
              <p className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                {assignment.customerContactEmail}
              </p>
            )}
            {assignment.customerContactPhone && (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                {assignment.customerContactPhone}
              </p>
            )}
          </div>
        </DetailCard>

        <DetailCard title="Object & adres" icon={MapPin}>
          <div className="space-y-2 text-sm" style={{ color: "var(--color-foreground)" }}>
            <p className="font-semibold">
              {assignment.objectName ?? "Geen object gekoppeld"}
            </p>
            <p>{objectAddress}</p>
            {assignment.objectContactName && (
              <p>Contact: {assignment.objectContactName}</p>
            )}
            {assignment.objectContactPhone && (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                {assignment.objectContactPhone}
              </p>
            )}
            {assignment.objectContactEmail && (
              <p className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" style={{ color: "#94A3B8" }} />
                {assignment.objectContactEmail}
              </p>
            )}
          </div>
        </DetailCard>

        <DetailCard title="Toegang & aandachtspunten" icon={KeyRound}>
          <div className="space-y-2 text-sm" style={{ color: "var(--color-foreground)" }}>
            {assignment.objectAccessInfo && (
              <p>
                <span className="font-medium">Toegang:</span>{" "}
                {assignment.objectAccessInfo}
              </p>
            )}
            {assignment.objectKeyInfo && (
              <p>
                <span className="font-medium">Sleutel:</span>{" "}
                {assignment.objectKeyInfo}
              </p>
            )}
            {assignment.objectAlarmInfo && (
              <p>
                <span className="font-medium">Alarm:</span>{" "}
                {assignment.objectAlarmInfo}
              </p>
            )}
            {!assignment.objectAccessInfo &&
              !assignment.objectKeyInfo &&
              !assignment.objectAlarmInfo && (
                <EmptyText>Geen toegangsinformatie vastgelegd.</EmptyText>
              )}
          </div>
        </DetailCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DetailCard title="Opmerkingen klant/object" icon={StickyNote}>
          {objectNotes.length > 0 ? (
            <div className="space-y-3">
              {objectNotes.map((note) => (
                <div key={note.label} className="rounded-xl bg-slate-50 p-3">
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "#64748B" }}
                  >
                    {note.label}
                  </p>
                  <p
                    className="mt-1 whitespace-pre-wrap text-sm"
                    style={{ color: "var(--color-foreground)" }}
                  >
                    {note.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyText>Geen opmerkingen of instructies vastgelegd.</EmptyText>
          )}
        </DetailCard>

        <DetailCard title="Checklist & taken" icon={ClipboardList}>
          {assignment.tasks.length > 0 ? (
            <ul className="space-y-2">
              {assignment.tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 flex-shrink-0"
                    style={{ color: "var(--color-primary)" }}
                  />
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--color-foreground)" }}
                    >
                      {task.taskCodeCode && (
                        <span
                          className="mr-1.5 rounded bg-white px-1.5 py-0.5 font-mono text-xs"
                          style={{ color: "#64748B" }}
                        >
                          {task.taskCodeCode}
                        </span>
                      )}
                      {task.taskCodeName ?? "Taak"}
                    </p>
                    {task.notes && (
                      <p className="mt-1 text-xs" style={{ color: "#64748B" }}>
                        {task.notes}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyText>Nog geen taken gekoppeld.</EmptyText>
          )}
          {canWrite && (
            <p className="mt-3 text-xs" style={{ color: "#64748B" }}>
              Taken toevoegen of verwijderen kan in het rechter workflowpaneel.
            </p>
          )}
        </DetailCard>
      </div>
    </section>
  );
}

async function safeOptional<T>(
  label: string,
  assignmentId: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    console.error("assignment detail optional data failed", {
      label,
      assignmentId,
      error,
    });
    return fallback;
  }
}

type AssignmentDetailTab =
  | "werkbon"
  | "gegevens"
  | "planning"
  | "offerte"
  | "rapport"
  | "factuur"
  | "bijlagen";

function isAssignmentDetailTab(
  value: string | undefined,
): value is AssignmentDetailTab {
  return (
    value === "werkbon" ||
    value === "gegevens" ||
    value === "planning" ||
    value === "offerte" ||
    value === "rapport" ||
    value === "factuur" ||
    value === "bijlagen"
  );
}

function workflowTabLabel(
  tab: "offerte" | "rapport" | "factuur",
  status: AssignmentStatus,
): string {
  if (tab === "offerte") {
    if (status === "review" || status === "quote_preparation")
      return "Offerte · Concept";
    if (status === "awaiting_approval") return "Offerte · Wacht op akkoord";
    return "Offerte";
  }
  if (tab === "rapport") {
    if (status === "completed" || status === "not_completed")
      return "Rapport · In te dienen";
    if (status === "report_submitted") return "Rapport · Ter controle";
    if (
      status === "report_approved" ||
      status === "invoice_ready" ||
      status === "invoiced" ||
      status === "paid" ||
      status === "closed"
    )
      return "Rapport · Goedgekeurd";
    return "Rapport";
  }
  if (status === "report_approved" || status === "invoice_ready")
    return "Factuur · Concept";
  if (status === "invoiced") return "Factuur · Verzonden";
  if (status === "paid" || status === "closed") return "Factuur · Betaald";
  return "Factuur";
}

function nextAssignmentStep(
  status: AssignmentStatus,
): { label: string; tab: AssignmentDetailTab } | null {
  if (status === "requested" || status === "review")
    return { label: "Offerte voorbereiden", tab: "offerte" };
  if (status === "quote_preparation" || status === "awaiting_approval")
    return { label: "Akkoord op offerte volgen", tab: "offerte" };
  if (status === "approved" || status === "plannable")
    return { label: "Planning afronden", tab: "planning" };
  if (status === "scheduled" || status === "seen")
    return { label: "Uitvoering voorbereiden", tab: "werkbon" };
  if (status === "en_route" || status === "in_progress")
    return { label: "Werkbon afronden", tab: "werkbon" };
  if (status === "completed" || status === "not_completed")
    return { label: "Rapport indienen", tab: "rapport" };
  if (status === "report_submitted")
    return { label: "Rapport controleren", tab: "rapport" };
  if (status === "report_approved" || status === "invoice_ready")
    return { label: "Factuur opstellen", tab: "factuur" };
  if (status === "invoiced")
    return { label: "Betaling volgen", tab: "factuur" };
  return null;
}

export default async function AssignmentDetailPage({
  params,
  searchParams,
}: Props) {
  const canRead = await hasPermission("assignments", "read");
  if (!canRead) return <ForbiddenPage resource="assignments" action="read" />;

  const { id } = await params;
  const requestedTab = (await searchParams)?.tab;

  const [
    assignment,
    canWrite,
    canReadReports,
    canSubmitReport,
    canReadInvoices,
    canWriteInvoices,
    canReadQuotes,
    canWriteQuotes,
    canReadDocuments,
    canWriteDocuments,
    canReadPlanning,
    canWritePlanning,
  ] = await Promise.all([
    safeOptional("assignment", id, () => getAssignment(id), null),
    hasPermission("assignments", "write"),
    hasPermission("reports", "read"),
    hasPermission("reports", "submit"),
    hasPermission("invoices", "read"),
    hasPermission("invoices", "write"),
    hasPermission("quotes", "read"),
    hasPermission("quotes", "write"),
    hasPermission("documents", "read"),
    hasPermission("documents", "write"),
    hasPermission("planning", "read"),
    hasPermission("planning", "write"),
  ]);

  if (!assignment) notFound();

  const REPORT_STATUSES = [
    "completed",
    "not_completed",
    "report_submitted",
    "report_approved",
    "invoice_ready",
    "invoiced",
    "paid",
    "closed",
  ];
  const INVOICE_STATUSES = ["invoice_ready", "invoiced", "paid", "closed"];
  const QUOTE_STATUSES_SHOW = [
    "quote_preparation",
    "awaiting_approval",
    "approved",
    "plannable",
    "scheduled",
    "seen",
    "en_route",
    "in_progress",
    "not_completed",
    "completed",
    "report_submitted",
    "report_approved",
    "invoice_ready",
    "invoiced",
    "paid",
    "closed",
  ];

  const planningFirstStatuses: AssignmentStatus[] = [
    "requested",
    "review",
    "quote_preparation",
    "awaiting_approval",
    "approved",
    "plannable",
  ];
  const needsPlanning =
    planningFirstStatuses.includes(assignment.status) ||
    assignment.personnel.length < assignment.requiredPersonnelCount;
  const showPlanningFirst = canReadPlanning && needsPlanning;
  const visibleTabs: AssignmentDetailTab[] = [
    "werkbon",
    "gegevens",
    ...(canReadPlanning ? ["planning" as const] : []),
    ...(canReadQuotes || canWriteQuotes ? ["offerte" as const] : []),
    ...(canReadReports || canSubmitReport ? ["rapport" as const] : []),
    ...(canReadInvoices || canWriteInvoices ? ["factuur" as const] : []),
    ...(canReadDocuments ? ["bijlagen" as const] : []),
  ];
  const defaultTab: AssignmentDetailTab = showPlanningFirst
    ? "planning"
    : "werkbon";
  const activeTab: AssignmentDetailTab =
    isAssignmentDetailTab(requestedTab) && visibleTabs.includes(requestedTab)
      ? requestedTab
      : defaultTab;

  const [
    assignmentDocuments,
    existingReport,
    invoiceBundle,
    quoteBundle,
    editOptions,
    taskCodes,
    planningReadiness,
    interestRounds,
  ] = await Promise.all([
    canReadDocuments && activeTab === "bijlagen"
      ? safeOptional(
          "documents",
          id,
          () => listDocuments({ entityType: "assignment", entityId: id }),
          [],
        )
      : Promise.resolve([]),
    activeTab === "rapport" &&
    canReadReports &&
    REPORT_STATUSES.includes(assignment.status)
      ? safeOptional("report", id, () => getReportForAssignment(id), null)
      : Promise.resolve(null),
    activeTab === "factuur" && canReadInvoices
      ? safeOptional(
          "invoice",
          id,
          () =>
            Promise.all([
              INVOICE_STATUSES.includes(assignment.status)
                ? getInvoiceForAssignment(id)
                : Promise.resolve(null),
              assignment.status === "report_approved" && canWriteInvoices
                ? getAssignmentInvoiceData(id)
                : Promise.resolve(null),
              canWriteInvoices
                ? getInvoiceDefaultPaymentTermDays()
                : Promise.resolve(30),
            ]),
          [null, null, 30] as const,
        )
      : Promise.resolve([null, null, 30] as const),
    activeTab === "offerte" && canReadQuotes
      ? safeOptional(
          "quote",
          id,
          () =>
            Promise.all([
              QUOTE_STATUSES_SHOW.includes(assignment.status)
                ? getQuoteForAssignment(id)
                : Promise.resolve(null),
              assignment.status === "review" && canWriteQuotes
                ? getAssignmentQuoteData(id)
                : Promise.resolve(null),
            ]),
          [null, null] as const,
        )
      : Promise.resolve([null, null] as const),
    activeTab === "gegevens" && canWrite
      ? safeOptional(
          "edit-options",
          id,
          () =>
            Promise.all([
              getCustomerOptions(),
              getPersonnelEligibilityForAssignment(id),
            ]),
          [[], []] as const,
        )
      : Promise.resolve([[], []] as const),
    activeTab === "werkbon" && canWrite
      ? safeOptional("task-code-options", id, () => getTaskCodeOptions(), [])
      : Promise.resolve([]),
    activeTab === "planning" && canReadPlanning
      ? safeOptional(
          "planning-readiness",
          id,
          () => getAssignmentPlanningReadiness(id),
          null,
        )
      : Promise.resolve(null),
    activeTab === "planning" && canReadPlanning
      ? safeOptional(
          "interest-rounds",
          id,
          () => listAssignmentInterestRounds(id),
          [],
        )
      : Promise.resolve([]),
  ]);
  const [existingInvoice, invoicePrefill, invoiceDefaultPaymentTermDays] =
    invoiceBundle;
  const [existingQuote, quotePrefill] = quoteBundle;
  const customers = [...editOptions[0]];
  const personnelList = [...editOptions[1]];

  // ── Formatted dates ────────────────────────────────────────────────────────
  const updatedAt = new Date(assignment.updatedAt).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let scheduledLabel = "Nog niet ingepland";
  if (assignment.scheduledDate) {
    const d = new Date(assignment.scheduledDate + "T00:00:00");
    scheduledLabel = d.toLocaleDateString("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  let timeLabel: string | null = null;
  if (assignment.scheduledStart) {
    timeLabel = assignment.scheduledEnd
      ? `${assignment.scheduledStart} – ${assignment.scheduledEnd}`
      : assignment.scheduledStart;
  }

  const actualStartLabel = formatActualTime(assignment.actualStartedAt);
  const actualEndLabel = formatActualTime(assignment.actualCompletedAt);
  const actualTimeLabel = actualStartLabel
    ? `${actualStartLabel} – ${actualEndLabel ?? "bezig"}`
    : null;

  const tabHref = (tab: AssignmentDetailTab) =>
    `/assignments/${assignment.id}?tab=${tab}`;
  const showWorkflowPanel = activeTab === "gegevens";
  const nextStep = nextAssignmentStep(assignment.status);

  return (
    <TenantPageShell>
      <TenantDetailHeader
        backHref="/assignments"
        backLabel="Opdrachten"
        title={assignment.title}
        badges={
          <>
            <span className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {assignment.code}
            </span>
            <AssignmentPriorityBadge priority={assignment.priority} />
          </>
        }
        actions={
          <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-2 text-left sm:w-auto sm:grid-cols-4 sm:text-right">
            <div className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                Gepland
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {scheduledLabel}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                Gepland tijdslot
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {timeLabel ?? "Nog geen tijdslot"}
              </dd>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                Werkelijk
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {actualTimeLabel ?? "Nog niet gestart"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                Bijgewerkt
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {updatedAt}
              </dd>
            </div>
          </dl>
        }
        summary={
          <AssignmentStatusStepper
            assignmentId={assignment.id}
            status={assignment.status}
            canWrite={canWrite}
          />
        }
      />

      <TenantDetailSectionNav
        items={[
          {
            tab: "werkbon" as const,
            label: "Werkbon",
            href: tabHref("werkbon"),
            active: activeTab === "werkbon",
          },
          {
            tab: "gegevens" as const,
            label: "Gegevens",
            href: tabHref("gegevens"),
            active: activeTab === "gegevens",
          },
          {
            tab: "planning" as const,
            label: "Planning",
            href: tabHref("planning"),
            active: activeTab === "planning",
            count: planningReadiness?.candidates.length,
          },
          {
            tab: "offerte" as const,
            label: workflowTabLabel("offerte", assignment.status),
            href: tabHref("offerte"),
            active: activeTab === "offerte",
          },
          {
            tab: "rapport" as const,
            label: workflowTabLabel("rapport", assignment.status),
            href: tabHref("rapport"),
            active: activeTab === "rapport",
          },
          {
            tab: "factuur" as const,
            label: workflowTabLabel("factuur", assignment.status),
            href: tabHref("factuur"),
            active: activeTab === "factuur",
          },
          {
            tab: "bijlagen" as const,
            label: "Bijlagen",
            href: tabHref("bijlagen"),
            active: activeTab === "bijlagen",
            count:
              activeTab === "bijlagen" ? assignmentDocuments.length : undefined,
          },
        ]
          .filter((item) => visibleTabs.includes(item.tab))
          .map(({ tab: _tab, ...item }) => item)}
      />

      {nextStep && visibleTabs.includes(nextStep.tab) && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Volgende stap
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {nextStep.label}
            </p>
          </div>
          <Link
            href={tabHref(nextStep.tab)}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-button)] border border-primary-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Open {nextStep.tab}
          </Link>
        </div>
      )}

      {/* ── Two-column layout ─────────────────────────── */}
      {activeTab === "planning" && planningReadiness && (
        <div className="scroll-mt-24">
          <CapacityMatchingSection
            assignmentId={assignment.id}
            planningReadiness={planningReadiness}
            interestRounds={interestRounds}
            canManagePlanning={canWrite && canWritePlanning}
          />
        </div>
      )}

      {activeTab === "werkbon" && (
        <div className="scroll-mt-24 space-y-6">
          <WorkOrderOverviewSection
            assignment={assignment}
            canWrite={canWrite}
          />
          <AssignmentTaskManager
            assignmentId={assignment.id}
            canWrite={canWrite}
            taskCodes={taskCodes}
            tasks={assignment.tasks}
          />
        </div>
      )}

      {["gegevens", "offerte", "rapport", "factuur"].includes(activeTab) && (
        <div
          className={
            showWorkflowPanel
              ? "grid scroll-mt-24 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_390px]"
              : "grid scroll-mt-24 grid-cols-1 gap-6"
          }
        >
          {/* Left: static details */}
          <div className="flex flex-col gap-6">
            {/* General info */}
            <div className={activeTab === "gegevens" ? "veele-card" : "hidden"}>
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: "#94A3B8" }}
              >
                Opdrachtgegevens
              </p>

              <InfoRow
                icon={Building2}
                label="Klant"
                value={
                  <Link
                    href={`/customers/${assignment.customerId}`}
                    className="hover:underline"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {assignment.customerName}
                  </Link>
                }
              />

              {assignment.objectName && (
                <InfoRow
                  icon={MapPin}
                  label="Object"
                  value={assignment.objectName}
                />
              )}

              {assignment.requiredRegion && (
                <InfoRow
                  icon={MapPin}
                  label="Branch/regio"
                  value={assignment.requiredRegion}
                />
              )}

              <InfoRow
                icon={Calendar}
                label="Geplande datum"
                value={scheduledLabel}
              />

              {actualTimeLabel && (
                <InfoRow
                  icon={Clock3}
                  label="Werkelijke uitvoering"
                  value={actualTimeLabel}
                />
              )}

              {timeLabel && (
                <InfoRow icon={Clock} label="Tijdslot" value={timeLabel} />
              )}
            </div>

            {/* Description */}
            {activeTab === "gegevens" && assignment.description && (
              <div className="veele-card">
                <h2
                  className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                  style={{ color: "var(--color-foreground)" }}
                >
                  <FileText className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                  Beschrijving
                </h2>
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: "#374151" }}
                >
                  {assignment.description}
                </p>
              </div>
            )}

            {/* Internal notes — management only */}
            {activeTab === "gegevens" && canWrite && assignment.notes && (
              <div
                className="veele-card"
                style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}
              >
                <h2
                  className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                  style={{ color: "#92400E" }}
                >
                  <StickyNote className="h-4 w-4" />
                  Interne notities
                </h2>
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: "#78350F" }}
                >
                  {assignment.notes}
                </p>
              </div>
            )}

            {/* ── Quote section — status: review ────────────── */}
            {activeTab === "offerte" &&
              assignment.status === "review" &&
              canReadQuotes &&
              quotePrefill && (
                <CreateQuoteForm
                  assignmentId={assignment.id}
                  prefill={quotePrefill}
                />
              )}

            {/* ── Existing quote info card ──────────────────── */}
            {activeTab === "offerte" && existingQuote && (
              <div className="veele-card scroll-mt-24">
                <h2
                  className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                  style={{ color: "var(--color-foreground)" }}
                >
                  <FileCheck2
                    className="h-4 w-4"
                    style={{ color: "var(--color-primary)" }}
                  />
                  Offerte
                  <ProcessStatusBadge
                    kind="quote"
                    status={
                      existingQuote.isExpired ? "expired" : existingQuote.status
                    }
                    size="xs"
                  />
                </h2>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span
                    className="font-mono text-xs rounded px-1.5 py-0.5"
                    style={{ background: "#F1F5F9", color: "#475569" }}
                  >
                    {existingQuote.quoteNumber}
                  </span>
                  <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>
                    {new Intl.NumberFormat("nl-NL", {
                      style: "currency",
                      currency: "EUR",
                    }).format(parseFloat(existingQuote.amount) || 0)}
                  </span>
                </div>
                {existingQuote.validityDate && (
                  <p
                    className="text-xs mb-3"
                    style={{
                      color: existingQuote.isExpired ? "#DC2626" : "#64748B",
                    }}
                  >
                    {existingQuote.isExpired && (
                      <AlertTriangle className="inline h-3 w-3 mr-1 mb-0.5" />
                    )}
                    Geldig tot{" "}
                    {new Date(
                      existingQuote.validityDate + "T00:00:00",
                    ).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                )}
                <Link
                  href={`/quotes/${existingQuote.id}`}
                  className="text-sm font-medium hover:underline"
                  style={{ color: "var(--color-primary)" }}
                >
                  Offerte bekijken →
                </Link>
              </div>
            )}

            {/* ── Report section ────────────────────────────── */}
            {activeTab === "rapport" &&
              (assignment.status === "completed" ||
                assignment.status === "not_completed") &&
              (!existingReport || existingReport.status === "rejected") &&
              canSubmitReport && (
                <SubmitReportForm
                  assignmentId={assignment.id}
                  rejectedReport={existingReport ?? null}
                />
              )}

            {activeTab === "rapport" && existingReport && (
              <div className="veele-card scroll-mt-24">
                <h2
                  className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                  style={{ color: "var(--color-foreground)" }}
                >
                  <FileText className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                  Rapport
                  <ProcessStatusBadge
                    kind="report"
                    status={existingReport.status}
                    size="xs"
                  />
                </h2>
                <p
                  className="text-sm whitespace-pre-wrap line-clamp-4 mb-3"
                  style={{ color: "#374151" }}
                >
                  {existingReport.content}
                </p>
                <Link
                  href={`/reports/${existingReport.id}`}
                  className="text-sm font-medium hover:underline"
                  style={{ color: "var(--color-primary)" }}
                >
                  Rapport bekijken →
                </Link>
              </div>
            )}

            {/* ── Invoice section ───────────────────────────── */}
            {activeTab === "factuur" && invoicePrefill && (
              <CreateInvoiceForm
                assignmentId={assignment.id}
                prefill={invoicePrefill}
                defaultPaymentTermDays={invoiceDefaultPaymentTermDays}
              />
            )}

            {activeTab === "factuur" && existingInvoice && (
              <div className="veele-card scroll-mt-24">
                <h2
                  className="font-heading text-base font-semibold mb-3 flex items-center gap-2"
                  style={{ color: "var(--color-foreground)" }}
                >
                  <Receipt className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                  Factuur
                  <ProcessStatusBadge
                    kind="invoice"
                    status={existingInvoice.status}
                    size="xs"
                  />
                </h2>
                <div className="flex items-center justify-between text-sm mb-3">
                  <span
                    className="font-mono text-xs rounded px-1.5 py-0.5"
                    style={{ background: "#F1F5F9", color: "#475569" }}
                  >
                    {existingInvoice.invoiceNumber}
                  </span>
                  <span className="font-semibold" style={{ color: "var(--color-foreground)" }}>
                    {new Intl.NumberFormat("nl-NL", {
                      style: "currency",
                      currency: "EUR",
                    }).format(parseFloat(existingInvoice.totalAmount) || 0)}
                  </span>
                </div>
                <Link
                  href={`/invoices/${existingInvoice.id}`}
                  className="text-sm font-medium hover:underline"
                  style={{ color: "var(--color-primary)" }}
                >
                  Factuur bekijken →
                </Link>
              </div>
            )}
          </div>

          {/* Right: interactive actions panel (or read-only for viewers) */}
          {showWorkflowPanel && (
            <TenantDetailResponsiveActions
              title="Workflowacties"
              description="Volgende stap, planning, personeel en taken voor deze opdracht."
            >
              {/* Direct approval button — only when status is review and user can write quotes */}
              {assignment.status === "review" && canWrite && canReadQuotes && (
                <DirectApprovalButton assignmentId={assignment.id} />
              )}

              {canWrite ? (
                <AssignmentDetailActions
                  assignmentId={assignment.id}
                  status={assignment.status}
                  canWrite={canWrite}
                  customers={customers}
                  personnelList={personnelList}
                  personnel={assignment.personnel}
                />
              ) : (
                <>
                  {/* Read-only: personnel */}
                  <div className="veele-card">
                    <h3
                      className="font-heading text-sm font-semibold mb-3 flex items-center gap-2"
                      style={{ color: "var(--color-foreground)" }}
                    >
                      <Users className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
                      Medewerkers
                    </h3>
                    {assignment.personnel.length === 0 ? (
                      <p className="text-sm" style={{ color: "#94A3B8" }}>
                        Geen medewerkers gekoppeld.
                      </p>
                    ) : (
                      <ul
                        className="divide-y"
                        style={{ borderColor: "#F1F5F9" }}
                      >
                        {assignment.personnel.map((p) => (
                          <li
                            key={p.id}
                            className="py-2 text-sm"
                            style={{ color: "var(--color-foreground)" }}
                          >
                            {p.firstName} {p.lastName}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Read-only: tasks */}
                  {assignment.tasks.length > 0 && (
                    <div className="veele-card">
                      <h3
                        className="font-heading text-sm font-semibold mb-3"
                        style={{ color: "var(--color-foreground)" }}
                      >
                        Taken
                      </h3>
                      <ul
                        className="divide-y"
                        style={{ borderColor: "#F1F5F9" }}
                      >
                        {assignment.tasks.map((t) => (
                          <li key={t.id} className="py-2">
                            <span
                              className="text-sm"
                              style={{ color: "var(--color-foreground)" }}
                            >
                              {t.taskCodeCode && (
                                <span
                                  className="text-xs font-mono px-1.5 py-0.5 rounded mr-1.5"
                                  style={{
                                    background: "#F1F5F9",
                                    color: "#64748B",
                                  }}
                                >
                                  {t.taskCodeCode}
                                </span>
                              )}
                              {t.taskCodeName ?? "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </TenantDetailResponsiveActions>
          )}
        </div>
      )}

      {/* ── Bijlagen ─────────────────────────────────────── */}
      {activeTab === "bijlagen" && canReadDocuments && (
        <div className="scroll-mt-24">
          <AssignmentDocumentsPanel
            assignmentId={assignment.id}
            initialDocuments={assignmentDocuments}
            canWrite={canWriteDocuments}
          />
        </div>
      )}
    </TenantPageShell>
  );
}
