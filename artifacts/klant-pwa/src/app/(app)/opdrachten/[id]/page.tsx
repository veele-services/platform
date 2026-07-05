export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  Calendar,
  Camera,
  CheckSquare,
  ChevronLeft,
  Clock,
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

const INVOICE_STATUS_COLOR: Record<InvoiceStatus, { bg: string; color: string }> = {
  draft: { bg: "#F1F5F9", color: "#64748B" },
  sent: { bg: "#EDE9FE", color: "#6D28D9" },
  paid: { bg: "#DCFCE7", color: "#15803D" },
  cancelled: { bg: "#FEE2E2", color: "#DC2626" },
};

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
      className="inline-flex rounded-full px-3 py-1 text-xs font-black"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {label}
    </span>
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
    <section id={id} className="scroll-mt-24 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8FBFA] text-[#087C79]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
            {title}
          </h2>
          <p className="mt-1 text-sm font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed px-4 py-6 text-center" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-sm font-black" style={{ color: "var(--color-primary)" }}>
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
        {description}
      </p>
    </div>
  );
}

function SectionNav() {
  const items = [
    ["status", "Status"],
    ["planning", "Planning"],
    ["rapportage", "Rapportage"],
    ["documenten", "Documenten"],
    ["support", "Support"],
  ] as const;

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
      {items.map(([href, label]) => (
        <a
          key={href}
          href={`#${href}`}
          className="whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black transition hover:bg-slate-50"
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

  const [assignment, reports, documents] = await Promise.all([
    getMyAssignmentDetail(id),
    getMyReports(),
    getMyDocuments(),
  ]);

  if (!assignment) notFound();

  const report = reports.find((item) => item.assignmentId === assignment.id);
  const assignmentDocuments = documents.filter((document) => document.assignmentId === assignment.id || document.entityId === assignment.id);
  const showTasks = SHOW_TASKS_STATUSES.has(assignment.status) && assignment.tasks.length > 0;
  const timeSlot = [assignment.scheduledStart, assignment.scheduledEnd].filter(Boolean).join(" - ");
  const addressLine = [assignment.objectAddress, assignment.objectPostalCode, assignment.objectCity]
    .filter(Boolean)
    .join(", ");
  const supportHref = supportHrefForAssignment(assignment.code, assignment.title);
  const { quote, invoice } = assignment;

  return (
    <PortalPageShell
      title={assignment.title}
      subtitle={`${assignment.code} - status, planning, documenten en support`}
      status={{ label: STATUS_LABEL[assignment.status] ?? assignment.status, tone: "accent" }}
      actions={
        <>
          <Link
            href={supportHref}
            className="inline-flex items-center gap-2 rounded-xl bg-[#E8FBFA] px-4 py-2 text-sm font-black text-[#087C79]"
          >
            <MessageSquare size={16} />
            Vraag over opdracht
          </Link>
          <Link
            href="/opdrachten"
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black"
            style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
          >
            <ChevronLeft size={16} />
            Opdrachten
          </Link>
        </>
      }
    >
      <SectionNav />

      <Section
        id="status"
        icon={<CheckSquare size={20} />}
        title="Status"
        subtitle="Waar deze opdracht nu staat en welke financiele documenten eraan hangen."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase" style={{ color: "var(--color-muted-fg)" }}>
              Opdrachtstatus
            </p>
            <div className="mt-2">
              <StatusPill status={assignment.status} />
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase" style={{ color: "var(--color-muted-fg)" }}>
              Object
            </p>
            <p className="mt-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
              {assignment.objectName ?? "Geen object"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase" style={{ color: "var(--color-muted-fg)" }}>
              Documenten
            </p>
            <p className="mt-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
              {assignmentDocuments.length} gekoppeld
            </p>
          </div>
        </div>

        {assignment.description ? (
          <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-xs font-black uppercase" style={{ color: "var(--color-muted-fg)" }}>
              Omschrijving
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6" style={{ color: "var(--color-primary)" }}>
              {assignment.description}
            </p>
          </div>
        ) : null}

        {(quote || invoice) ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {quote ? (
              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
                    <FileText size={16} />
                    Offerte {quote.quoteNumber}
                  </span>
                  <span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ backgroundColor: QUOTE_STATUS_COLOR[quote.status].bg, color: QUOTE_STATUS_COLOR[quote.status].color }}>
                    {QUOTE_STATUS_LABEL[quote.status]}
                  </span>
                </div>
                <p className="mt-3 text-xl font-black" style={{ color: "var(--color-primary)" }}>
                  {formatAmount(quote.amount)}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href="/offertes" className="inline-flex text-xs font-black" style={{ color: "var(--color-accent)" }}>
                    Offertes bekijken
                  </Link>
                  <Link
                    href={`/api/offerte/${quote.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-black"
                    style={{ color: "var(--color-accent)" }}
                  >
                    <Download size={14} />
                    PDF downloaden
                  </Link>
                </div>
              </div>
            ) : null}
            {invoice ? (
              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
                    <Receipt size={16} />
                    Factuur {invoice.invoiceNumber}
                  </span>
                  <span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ backgroundColor: INVOICE_STATUS_COLOR[invoice.status].bg, color: INVOICE_STATUS_COLOR[invoice.status].color }}>
                    {INVOICE_STATUS_LABEL[invoice.status]}
                  </span>
                </div>
                <p className="mt-3 text-xl font-black" style={{ color: "var(--color-primary)" }}>
                  {formatAmount(invoice.totalAmount)}
                </p>
                <Link href="/facturen" className="mt-2 inline-flex text-xs font-black" style={{ color: "var(--color-accent)" }}>
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
        subtitle="Geplande datum, tijdvenster, locatie en werkzaamheden."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase" style={{ color: "var(--color-muted-fg)" }}>
              Datum
            </p>
            <p className="mt-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
              {formatDate(assignment.scheduledDate)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase" style={{ color: "var(--color-muted-fg)" }}>
              Tijd
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
              <Clock size={15} />
              {timeSlot || "Geen tijdvenster"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase" style={{ color: "var(--color-muted-fg)" }}>
              Locatie
            </p>
            <p className="mt-2 flex items-start gap-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
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
                <div key={task.id} className="flex items-start gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: "var(--color-accent)" }}>
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold leading-5" style={{ color: "var(--color-primary)" }}>
                    {task.customerDescription}
                  </p>
                </div>
              ))}
          </div>
        ) : (
          <EmptyState title="Werkzaamheden nog niet beschikbaar" description="De werkzaamheden worden zichtbaar zodra de opdracht verder in de uitvoering is." />
        )}
      </Section>

      <Section
        id="rapportage"
        icon={<FileCheck2 size={20} />}
        title="Rapportage"
        subtitle="Goedgekeurd werkrapport en zichtbare foto's vanuit de uitvoering."
      >
        {report ? (
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
            <p className="whitespace-pre-wrap text-sm font-semibold leading-6" style={{ color: "var(--color-primary)" }}>
              {report.customerVisibleSummary}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-black" style={{ color: "var(--color-secondary)" }}>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">{formatDate(report.submittedAt)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5">
                {report.hoursWorked ? `${Number.parseFloat(report.hoursWorked).toLocaleString("nl-NL")} uur` : "Geen uren"}
              </span>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Rapport nog niet beschikbaar"
            description={FINAL_REPORT_STATUSES.has(assignment.status)
              ? "Er is nog geen klantzichtbaar rapport gekoppeld."
              : "Het werkrapport verschijnt zodra de opdracht uitgevoerd en goedgekeurd is."}
          />
        )}

        {assignment.approvedPhotos.length > 0 && FINAL_REPORT_STATUSES.has(assignment.status) ? (
          <div className="mt-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
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
                  <div key={photo.id} className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100">
                    <Camera size={20} style={{ color: "var(--color-muted-fg)" }} />
                  </div>
                ),
              )}
            </div>
          </div>
        ) : null}
      </Section>

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
                  <span className="block truncate text-sm font-black" style={{ color: "var(--color-primary)" }}>
                    {document.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-semibold" style={{ color: "var(--color-muted-fg)" }}>
                    {document.filename}
                  </span>
                </span>
                <DocumentDownloadButton documentId={document.id} filename={document.filename} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Geen opdrachtdocumenten" description="Documenten voor deze opdracht verschijnen hier zodra ze gedeeld zijn." />
        )}
      </Section>

      <Section
        id="support"
        icon={<MessageSquare size={20} />}
        title="Support"
        subtitle="Start een ticket met de opdrachtcontext alvast ingevuld."
      >
        <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black" style={{ color: "var(--color-primary)" }}>
              Vraag over deze opdracht
            </p>
            <p className="mt-1 text-sm font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
              Het opdrachtnummer en de titel worden automatisch in het ticket gezet.
            </p>
          </div>
          <Link
            href={supportHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E8FBFA] px-4 py-2.5 text-sm font-black text-[#087C79]"
          >
            <MessageSquare size={16} />
            Ticket starten
          </Link>
        </div>
      </Section>
    </PortalPageShell>
  );
}
