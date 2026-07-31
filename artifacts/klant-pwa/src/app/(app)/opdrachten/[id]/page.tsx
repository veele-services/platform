export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  Calendar,
  Camera,
  CheckSquare,
  ChevronLeft,
  Download,
  FileCheck2,
  FileText,
  MapPin,
  MessageSquare,
  Receipt,
} from "lucide-react";
import { getMyAssignmentDetail } from "@/actions/assignments";
import { getMyDocuments } from "@/actions/documents";
import { getMyReports } from "@/actions/reports";
import { DocumentDownloadButton } from "@/components/DocumentDownloadButton";
import { PortalPageShell } from "@/components/portal-ui";
import { STATUS_COLOR, STATUS_LABEL } from "@/types/assignments";
import { getCustomerPortalFeatureFlags } from "@/lib/portal-features";
import type {
  AssignmentStatus,
  InvoiceStatus,
  QuoteStatus,
} from "@workspace/db";

type Props = { params: Promise<{ id: string }> };

const SHOW_TASKS_STATUSES = new Set<AssignmentStatus>([
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

const FINAL_REPORT_STATUSES = new Set<AssignmentStatus>([
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Concept",
  sent: "Ter goedkeuring",
  approved: "Akkoord",
  rejected: "Afgewezen",
  expired: "Verlopen",
};

const QUOTE_STATUS_COLOR: Record<QuoteStatus, { bg: string; color: string }> = {
  draft: { bg: "#F1F5F9", color: "#64748B" },
  sent: { bg: "#FEF9C3", color: "#A16207" },
  approved: { bg: "#DCFCE7", color: "#15803D" },
  rejected: { bg: "#FEE2E2", color: "#DC2626" },
  expired: { bg: "#F1F5F9", color: "#64748B" },
};

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Concept",
  sent: "Verzonden",
  paid: "Betaald",
  cancelled: "Geannuleerd",
};

const INVOICE_STATUS_COLOR: Record<
  InvoiceStatus,
  { bg: string; color: string }
> = {
  draft: { bg: "#F1F5F9", color: "#64748B" },
  sent: { bg: "#EDE9FE", color: "#6D28D9" },
  paid: { bg: "#DCFCE7", color: "#15803D" },
  cancelled: { bg: "#FEE2E2", color: "#DC2626" },
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "Nog niet bekend";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Nog niet bekend";
  return d.toLocaleString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

function formatTimelineTime(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Geen datum";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatAmount(amount: string): string {
  return Number.parseFloat(amount).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

function supportHrefForAssignment(code: string, title: string): string {
  return `/meldingen/tickets?${new URLSearchParams({
    context: "assignment",
    department: "planning",
    subject: `Vraag over opdracht ${code} - ${title}`,
    body: `Opdracht: ${code} - ${title}\n\nVraag:`,
  }).toString()}`;
}

function StatusPill({ status }: { status: AssignmentStatus }) {
  const cfg = STATUS_COLOR[status] ?? { bg: "#F1F5F9", color: "#64748B" };
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      className="inline-flex rounded-full px-3 py-1 text-xs font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {label}
    </span>
  );
}

function customerTimelinePhase(
  status: AssignmentStatus,
  scheduledDate: string | null,
): "pre_scheduled" | "scheduled" | "in_progress" | "completed" {
  if (
    [
      "completed",
      "report_submitted",
      "report_approved",
      "invoice_ready",
      "invoiced",
      "paid",
      "closed",
    ].includes(status)
  ) {
    return "completed";
  }
  if (["seen", "en_route", "in_progress", "not_completed"].includes(status)) {
    return "in_progress";
  }
  if (status === "scheduled" && scheduledDate) {
    return "scheduled";
  }
  return "pre_scheduled";
}

function AssignmentTimeline({
  assignment,
}: {
  assignment: Awaited<ReturnType<typeof getMyAssignmentDetail>> & {};
}) {
  if (!assignment) return null;
  const phase = assignment.actualCompletedAt
    ? "completed"
    : assignment.actualStartedAt
      ? "in_progress"
      : customerTimelinePhase(assignment.status, assignment.scheduledDate);
  const plannedWindow = [assignment.scheduledStart, assignment.scheduledEnd]
    .filter(Boolean)
    .join(" - ");
  const actualStart = formatTimelineTime(assignment.actualStartedAt);
  const actualEnd = formatTimelineTime(assignment.actualCompletedAt);
  const actualWindow = actualStart
    ? `${actualStart} - ${actualEnd ?? "nu"}`
    : null;
  const steps = [
    {
      key: "scheduled",
      label: "Ingepland",
      description: assignment.scheduledDate
        ? `Gepland tijdvenster: ${formatDate(assignment.scheduledDate)}${plannedWindow ? `, ${plannedWindow}` : ""}`
        : "Gepland tijdvenster: nog niet bekend.",
      state: phase === "pre_scheduled" ? "upcoming" : "done",
    },
    {
      key: "in_progress",
      label: "Uitvoering",
      description: assignment.actualStartedAt
        ? `Werkelijke uitvoering: ${actualWindow ?? formatDateTime(assignment.actualStartedAt)}`
        : phase === "in_progress"
          ? "De uitvoering is gestart of de medewerker is onderweg."
          : "Nog niet gestart.",
      state:
        phase === "in_progress" || phase === "completed" ? "done" : "upcoming",
    },
    {
      key: "completed",
      label: "Afgerond",
      description: assignment.actualCompletedAt
        ? `Werk afgerond op ${formatDateTime(assignment.actualCompletedAt)}`
        : "Na afronding ziet u hier het goedgekeurde rapport en zichtbare documenten.",
      state: phase === "completed" ? "done" : "upcoming",
    },
  ] as const;

  return (
    <div
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3
            className="text-base font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            Tijdlijn voor de klant
          </h3>
          <p
            className="mt-1 text-sm font-semibold leading-5"
            style={{ color: "var(--color-secondary)" }}
          >
            Rustige weergave van planning, uitvoering en afronding zonder
            interne planningsdetails.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-[#E8FBFA] px-3 py-1 text-xs font-semibold text-[#087C79]">
          {phase === "completed"
            ? "Afgerond"
            : phase === "in_progress"
              ? "In uitvoering"
              : phase === "scheduled"
                ? "Ingepland"
                : "Nog niet ingepland"}
        </span>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => {
          const done = step.state === "done";
          return (
            <li key={step.key} className="relative rounded-2xl bg-slate-50 p-4">
              <span
                className="mb-3 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: done ? "var(--color-accent)" : "#E2E8F0",
                  color: done ? "white" : "#64748B",
                }}
              >
                {index + 1}
              </span>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                {step.label}
              </p>
              <p
                className="mt-1 text-xs font-semibold leading-5"
                style={{ color: "var(--color-secondary)" }}
              >
                {step.description}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Section({
  id,
  icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-xl border bg-white p-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_10%,white)] text-[var(--color-accent-accessible)]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {title}
          </h2>
          <p
            className="mt-1 text-sm font-semibold leading-5"
            style={{ color: "var(--color-secondary)" }}
          >
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed px-4 py-6 text-center"
      style={{ borderColor: "var(--color-border)" }}
    >
      <p
        className="text-sm font-semibold"
        style={{ color: "var(--color-primary)" }}
      >
        {title}
      </p>
      <p
        className="mx-auto mt-1 max-w-md text-xs font-semibold leading-5"
        style={{ color: "var(--color-secondary)" }}
      >
        {description}
      </p>
    </div>
  );
}

function SectionNav({
  documentsEnabled,
  reportingEnabled,
}: {
  documentsEnabled: boolean;
  reportingEnabled: boolean;
}) {
  const items = [
    ["status", "Status"],
    ["planning", "Planning"],
    ...(reportingEnabled ? [["rapportage", "Rapportage"] as const] : []),
    ...(documentsEnabled ? [["documenten", "Documenten"] as const] : []),
    ["support", "Support"],
  ] as const;

  return (
    <nav
      className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1"
      style={{ borderColor: "var(--color-border)" }}
    >
      {items.map(([href, label]) => (
        <a
          key={href}
          href={`#${href}`}
          className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition hover:bg-slate-50"
          style={{ color: "var(--color-primary)" }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

export default async function KlantWerkbonDetailPage({ params }: Props) {
  const { id } = await params;
  const featureFlags = await getCustomerPortalFeatureFlags();

  const [assignment, reports, documents] = await Promise.all([
    getMyAssignmentDetail(id),
    featureFlags.reporting ? getMyReports() : Promise.resolve([]),
    featureFlags.documents ? getMyDocuments() : Promise.resolve([]),
  ]);

  if (!assignment) notFound();

  const report = reports.find((item) => item.assignmentId === assignment.id);
  const assignmentDocuments = documents.filter(
    (document) =>
      document.assignmentId === assignment.id ||
      document.entityId === assignment.id,
  );
  const showTasks =
    SHOW_TASKS_STATUSES.has(assignment.status) && assignment.tasks.length > 0;
  const addressLine = [
    assignment.objectAddress,
    assignment.objectPostalCode,
    assignment.objectCity,
  ]
    .filter(Boolean)
    .join(", ");
  const supportHref = supportHrefForAssignment(
    assignment.code,
    assignment.title,
  );
  const { quote, invoice } = assignment;

  return (
    <PortalPageShell
      title={assignment.title}
      subtitle={`${assignment.code} - status, planning, documenten en support`}
      status={{
        label:
          !featureFlags.finance && assignment.status === "awaiting_approval"
            ? "In behandeling"
            : (STATUS_LABEL[assignment.status] ?? assignment.status),
        tone: "accent",
      }}
      actions={
        <>
          <Link
            href={supportHref}
            className="inline-flex items-center gap-2 rounded-xl bg-[#E8FBFA] px-4 py-2 text-sm font-semibold text-[#087C79]"
          >
            <MessageSquare size={16} />
            Vraag over opdracht
          </Link>
          <Link
            href="/opdrachten"
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          >
            <ChevronLeft size={16} />
            Opdrachten
          </Link>
        </>
      }
    >
      <SectionNav
        documentsEnabled={featureFlags.documents}
        reportingEnabled={featureFlags.reporting}
      />

      <Section
        id="status"
        icon={<CheckSquare size={20} />}
        title="Status"
        subtitle={
          featureFlags.finance
            ? "Waar deze opdracht nu staat en welke financiële documenten eraan hangen."
            : "Waar deze opdracht nu staat en wat de volgende stap is."
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p
              className="text-xs font-semibold uppercase"
              style={{ color: "var(--color-muted-fg)" }}
            >
              Opdrachtstatus
            </p>
            <div className="mt-2">
              <StatusPill status={assignment.status} />
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p
              className="text-xs font-semibold uppercase"
              style={{ color: "var(--color-muted-fg)" }}
            >
              Object
            </p>
            <p
              className="mt-2 text-sm font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              {assignment.objectName ?? "Geen object"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p
              className="text-xs font-semibold uppercase"
              style={{ color: "var(--color-muted-fg)" }}
            >
              Documenten
            </p>
            <p
              className="mt-2 text-sm font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              {assignmentDocuments.length} gekoppeld
            </p>
          </div>
        </div>

        {assignment.description ? (
          <div
            className="mt-4 rounded-2xl border p-4"
            style={{ borderColor: "var(--color-border)" }}
          >
            <p
              className="text-xs font-semibold uppercase"
              style={{ color: "var(--color-muted-fg)" }}
            >
              Omschrijving
            </p>
            <p
              className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6"
              style={{ color: "var(--color-primary)" }}
            >
              {assignment.description}
            </p>
          </div>
        ) : null}

        {featureFlags.finance && (quote || invoice) ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {quote ? (
              <div
                className="rounded-2xl border p-4"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="flex items-center gap-2 text-sm font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    <FileText size={16} />
                    Offerte {quote.quoteNumber}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: QUOTE_STATUS_COLOR[quote.status].bg,
                      color: QUOTE_STATUS_COLOR[quote.status].color,
                    }}
                  >
                    {QUOTE_STATUS_LABEL[quote.status]}
                  </span>
                </div>
                <p
                  className="mt-3 text-xl font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  {formatAmount(quote.amount)}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    href="/offertes"
                    className="inline-flex text-xs font-semibold"
                    style={{ color: "var(--color-accent-accessible)" }}
                  >
                    Offertes bekijken
                  </Link>
                  <Link
                    href={`/api/offerte/${quote.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold"
                    style={{ color: "var(--color-accent-accessible)" }}
                  >
                    <Download size={14} />
                    PDF downloaden
                  </Link>
                </div>
              </div>
            ) : null}
            {invoice ? (
              <div
                className="rounded-2xl border p-4"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="flex items-center gap-2 text-sm font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    <Receipt size={16} />
                    Factuur {invoice.invoiceNumber}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: INVOICE_STATUS_COLOR[invoice.status].bg,
                      color: INVOICE_STATUS_COLOR[invoice.status].color,
                    }}
                  >
                    {INVOICE_STATUS_LABEL[invoice.status]}
                  </span>
                </div>
                <p
                  className="mt-3 text-xl font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  {formatAmount(invoice.totalAmount)}
                </p>
                <Link
                  href="/facturen"
                  className="mt-2 inline-flex text-xs font-semibold"
                  style={{ color: "var(--color-accent-accessible)" }}
                >
                  Facturen bekijken
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section
        id="planning"
        icon={<Calendar size={20} />}
        title="Planning"
        subtitle="Geplande en werkelijke tijdlijn, locatie en werkzaamheden."
      >
        <AssignmentTimeline assignment={assignment} />

        <div className="mt-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p
              className="text-xs font-semibold uppercase"
              style={{ color: "var(--color-muted-fg)" }}
            >
              Locatie
            </p>
            <p
              className="mt-2 flex items-start gap-2 text-sm font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              <MapPin size={15} className="mt-0.5 shrink-0" />
              {addressLine || "Geen adres"}
            </p>
          </div>
        </div>

        {showTasks ? (
          <div className="mt-4 grid gap-2">
            {assignment.tasks
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((task, index) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 rounded-xl border px-4 py-3"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: "var(--color-accent-accessible)" }}
                  >
                    {index + 1}
                  </span>
                  <p
                    className="text-sm font-semibold leading-5"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {task.customerDescription}
                  </p>
                </div>
              ))}
          </div>
        ) : (
          <EmptyState
            title="Werkzaamheden nog niet beschikbaar"
            description="De werkzaamheden worden zichtbaar zodra de opdracht verder in de uitvoering is."
          />
        )}
      </Section>

      {featureFlags.reporting ? (
        <Section
          id="rapportage"
          icon={<FileCheck2 size={20} />}
          title="Rapportage"
          subtitle="Goedgekeurd werkrapport en zichtbare foto's vanuit de uitvoering."
        >
          {report ? (
            <div
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--color-border)" }}
            >
              <p
                className="whitespace-pre-wrap text-sm font-semibold leading-6"
                style={{ color: "var(--color-primary)" }}
              >
                {report.customerVisibleSummary}
              </p>
              <div
                className="mt-4 flex flex-wrap gap-2 text-xs font-semibold"
                style={{ color: "var(--color-secondary)" }}
              >
                <span className="rounded-full bg-slate-100 px-3 py-1.5">
                  {formatDate(report.submittedAt)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5">
                  {report.hoursWorked
                    ? `${Number.parseFloat(report.hoursWorked).toLocaleString("nl-NL")} uur`
                    : "Geen uren"}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Rapport nog niet beschikbaar"
              description={
                FINAL_REPORT_STATUSES.has(assignment.status)
                  ? "Er is nog geen klantzichtbaar rapport gekoppeld."
                  : "Het werkrapport verschijnt zodra de opdracht uitgevoerd en goedgekeurd is."
              }
            />
          )}

          {assignment.approvedPhotos.length > 0 &&
          FINAL_REPORT_STATUSES.has(assignment.status) ? (
            <div className="mt-4">
              <h3
                className="mb-3 flex items-center gap-2 text-sm font-semibold"
                style={{ color: "var(--color-primary)" }}
              >
                <Camera size={16} />
                Foto's werkbon
              </h3>
              <div className="flex flex-wrap gap-2">
                {assignment.approvedPhotos.map((photo) =>
                  photo.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.id}
                      src={photo.signedUrl}
                      alt="Werkbon foto"
                      className="h-24 w-24 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      key={photo.id}
                      className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100"
                    >
                      <Camera
                        size={20}
                        style={{ color: "var(--color-muted-fg)" }}
                      />
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}
        </Section>
      ) : null}

      {featureFlags.documents ? (
        <Section
          id="documenten"
          icon={<FileText size={20} />}
          title="Documenten"
          subtitle="Bestanden die direct aan deze opdracht gekoppeld zijn."
        >
          {assignmentDocuments.length > 0 ? (
            <div className="grid gap-2">
              {assignmentDocuments.map((document) => (
                <div
                  key={document.id}
                  className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span className="min-w-0">
                    <span
                      className="block truncate text-sm font-semibold"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {document.name}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-xs font-semibold"
                      style={{ color: "var(--color-muted-fg)" }}
                    >
                      {document.filename}
                    </span>
                  </span>
                  <DocumentDownloadButton
                    documentId={document.id}
                    filename={document.filename}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Geen opdrachtdocumenten"
              description="Documenten voor deze opdracht verschijnen hier zodra ze gedeeld zijn."
            />
          )}
        </Section>
      ) : null}

      <Section
        id="support"
        icon={<MessageSquare size={20} />}
        title="Support"
        subtitle="Start een ticket met de opdrachtcontext alvast ingevuld."
      >
        <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              Vraag over deze opdracht
            </p>
            <p
              className="mt-1 text-sm font-semibold leading-5"
              style={{ color: "var(--color-secondary)" }}
            >
              Het opdrachtnummer en de titel worden automatisch in het ticket
              gezet.
            </p>
          </div>
          <Link
            href={supportHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8FBFA] px-4 py-2.5 text-sm font-semibold text-[#087C79]"
          >
            <MessageSquare size={16} />
            Ticket starten
          </Link>
        </div>
      </Section>
    </PortalPageShell>
  );
}
