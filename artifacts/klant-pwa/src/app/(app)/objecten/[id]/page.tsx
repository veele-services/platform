export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  FileCheck2,
  FileText,
  MapPin,
  MessageSquare,
  Phone,
  UserRound,
} from "lucide-react";
import { getMyAssignments } from "@/actions/assignments";
import { getMyDocuments } from "@/actions/documents";
import { getCustomerObjectSectors, getMyObject } from "@/actions/objects";
import { getMyReports } from "@/actions/reports";
import { getMyCustomerTickets } from "@/actions/tickets";
import { CustomerObjectForm } from "@/components/CustomerObjectForm";
import { DocumentDownloadButton } from "@/components/DocumentDownloadButton";
import { PortalPageShell } from "@/components/portal-ui";
import { STATUS_LABEL } from "@/types/assignments";
import { getCustomerPortalFeatureFlags } from "@/lib/portal-features";

type Props = { params: Promise<{ id: string }> };

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <dt
        className="text-[11px] font-semibold uppercase tracking-[0.05em]"
        style={{ color: "var(--color-secondary)" }}
      >
        {label}
      </dt>
      <dd
        className="mt-1 text-sm font-bold leading-5"
        style={{
          color: value ? "var(--color-primary)" : "var(--color-muted-fg)",
        }}
      >
        {value || "Niet ingevuld"}
      </dd>
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
    ["overzicht", "Overzicht"],
    ["opdrachten", "Opdrachten"],
    ...(documentsEnabled ? [["documenten", "Documenten"] as const] : []),
    ...(reportingEnabled ? [["rapportages", "Rapportages"] as const] : []),
    ["tickets", "Tickets"],
    ["beheer", "Beheer"],
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

function supportHrefForObject(code: string, name: string): string {
  return `/meldingen/tickets?${new URLSearchParams({
    context: "object",
    department: "service",
    subject: `Vraag over object ${code} - ${name}`,
    body: `Object: ${code} - ${name}\n\nVraag:`,
  }).toString()}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "Geen datum";
  return new Date(
    iso.includes("T") ? iso : `${iso}T00:00:00`,
  ).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ObjectDetailPage({ params }: Props) {
  const { id } = await params;
  const featureFlags = await getCustomerPortalFeatureFlags();
  const [object, sectors, assignments, reports, documents, tickets] =
    await Promise.all([
      getMyObject(id),
      getCustomerObjectSectors(),
      getMyAssignments(),
      featureFlags.reporting ? getMyReports() : Promise.resolve([]),
      featureFlags.documents ? getMyDocuments() : Promise.resolve([]),
      getMyCustomerTickets(),
    ]);

  if (!object) notFound();

  const supportHref = supportHrefForObject(object.code, object.name);
  const addressLine = [object.address, object.postalCode, object.city]
    .filter(Boolean)
    .join(" ");
  const objectAssignments = assignments.filter(
    (assignment) => assignment.objectId === object.id,
  );
  const objectReports = reports.filter(
    (report) => report.objectId === object.id,
  );
  const objectDocuments = documents.filter(
    (document) =>
      document.objectId === object.id || document.entityId === object.id,
  );
  const objectTicketSubjectPrefix =
    `Vraag over object ${object.code} -`.toLocaleLowerCase("nl-NL");
  const objectTickets = tickets.filter((ticket) =>
    ticket.subject
      .toLocaleLowerCase("nl-NL")
      .startsWith(objectTicketSubjectPrefix),
  );

  return (
    <PortalPageShell
      title={object.name}
      subtitle={`${object.code} - object, opdrachten, documenten en rapportages`}
      status={{
        label: object.isActive ? "Goedgekeurd actief" : "Concept of in review",
        tone: object.isActive ? "success" : "warning",
      }}
      actions={
        <>
          <Link
            href={supportHref}
            className="inline-flex items-center gap-2 rounded-xl bg-[#E8FBFA] px-4 py-2 text-sm font-semibold text-[#087C79]"
          >
            <MessageSquare size={16} />
            Vraag over object
          </Link>
          <Link
            href="/objecten"
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          >
            <ArrowLeft size={16} />
            Objecten
          </Link>
        </>
      }
    >
      <SectionNav
        documentsEnabled={featureFlags.documents}
        reportingEnabled={featureFlags.reporting}
      />

      <Section
        id="overzicht"
        icon={<Building2 size={20} />}
        title="Overzicht"
        subtitle="Basisgegevens, reviewstatus en locatie-informatie."
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p
              className="font-mono text-sm font-medium"
              style={{ color: "var(--color-primary)" }}
            >
              Objectcode {object.code}
            </p>
            {addressLine ? (
              <p
                className="mt-2 flex items-start gap-2 text-sm font-semibold leading-5"
                style={{ color: "var(--color-secondary)" }}
              >
                <MapPin size={15} className="mt-0.5 shrink-0" />
                {addressLine}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#E8FBFA] px-3 py-1.5 text-xs font-semibold text-[#087C79]">
              {object.isActive ? "Actief" : "Review nodig"}
            </span>
            {object.sectorName ? (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                {object.sectorName}
              </span>
            ) : null}
          </div>
        </div>

        <dl className="mt-5 grid gap-3 md:grid-cols-4">
          <DetailItem label="Contactpersoon" value={object.contactName} />
          <DetailItem label="Telefoon" value={object.contactPhone} />
          <DetailItem label="Dienstverlening" value={object.serviceType} />
          <DetailItem label="E-mail" value={object.contactEmail} />
        </dl>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <DetailItem
            label="Opdrachten"
            value={`${objectAssignments.length}`}
          />
          {featureFlags.documents ? (
            <DetailItem
              label="Documenten"
              value={`${objectDocuments.length}`}
            />
          ) : null}
          {featureFlags.reporting ? (
            <DetailItem label="Rapportages" value={`${objectReports.length}`} />
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <DetailItem label="Toegang" value={object.accessInfo} />
          <DetailItem label="Sleutels" value={object.keyInfo} />
          <DetailItem label="Alarm" value={object.alarmInfo} />
        </div>
      </Section>

      <Section
        id="opdrachten"
        icon={<ClipboardList size={20} />}
        title="Opdrachten"
        subtitle="Alle klantopdrachten die aan dit object gekoppeld zijn."
      >
        {objectAssignments.length > 0 ? (
          <div className="grid gap-2">
            {objectAssignments.slice(0, 8).map((assignment) => (
              <Link
                key={assignment.id}
                href={`/opdrachten/${assignment.id}`}
                className="flex flex-col gap-2 rounded-xl border px-4 py-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="min-w-0">
                  <span
                    className="block truncate font-mono text-xs font-semibold"
                    style={{ color: "var(--color-accent-accessible)" }}
                  >
                    {assignment.code}
                  </span>
                  <span
                    className="block truncate text-sm font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {assignment.title}
                  </span>
                </span>
                <span
                  className="text-xs font-bold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {STATUS_LABEL[assignment.status] ?? assignment.status} -{" "}
                  {formatDate(assignment.scheduledDate ?? assignment.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nog geen opdrachten"
            description="Nieuwe of geplande opdrachten voor dit object verschijnen hier."
          />
        )}
      </Section>

      {featureFlags.documents ? (
        <Section
          id="documenten"
          icon={<FileText size={20} />}
          title="Documenten"
          subtitle="Documenten die aan dit object of de bijbehorende opdrachten gekoppeld zijn."
        >
          {objectDocuments.length > 0 ? (
            <div className="grid gap-2">
              {objectDocuments.slice(0, 8).map((document) => (
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
                      {document.assignmentCode
                        ? `Opdracht ${document.assignmentCode}`
                        : "Objectdocument"}{" "}
                      - {formatDate(document.createdAt)}
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
              title="Geen documenten"
              description="Object- en opdrachtdocumenten verschijnen hier zodra ze gedeeld zijn."
            />
          )}
        </Section>
      ) : null}

      {featureFlags.reporting ? (
        <Section
          id="rapportages"
          icon={<FileCheck2 size={20} />}
          title="Rapportages"
          subtitle="Goedgekeurde werkrapportages voor dit object."
        >
          {objectReports.length > 0 ? (
            <div className="grid gap-2">
              {objectReports.slice(0, 8).map((report) => (
                <Link
                  key={report.id}
                  href={`/opdrachten/${report.assignmentId}`}
                  className="rounded-xl border px-4 py-3 transition hover:bg-slate-50"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span
                    className="block text-sm font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {report.assignmentCode} - {report.assignmentTitle}
                  </span>
                  <span
                    className="mt-1 block text-xs font-semibold"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {formatDate(report.submittedAt)} -{" "}
                    {report.hoursWorked
                      ? `${Number.parseFloat(report.hoursWorked).toLocaleString("nl-NL")} uur`
                      : "Geen uren"}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Geen rapportages"
              description="Goedgekeurde rapportages voor dit object verschijnen hier."
            />
          )}
        </Section>
      ) : null}

      <Section
        id="tickets"
        icon={<MessageSquare size={20} />}
        title="Tickets"
        subtitle="Supportvragen met dit object als context."
      >
        <div className="mb-4">
          <Link
            href={supportHref}
            className="inline-flex items-center gap-2 rounded-xl bg-[#E8FBFA] px-4 py-2.5 text-sm font-semibold text-[#087C79]"
          >
            <MessageSquare size={16} />
            Nieuw objectticket
          </Link>
        </div>
        {objectTickets.length > 0 ? (
          <div className="grid gap-2">
            {objectTickets.slice(0, 5).map((ticket) => (
              <Link
                key={ticket.id}
                href={`/meldingen/tickets/${ticket.id}`}
                className="rounded-xl border px-4 py-3 transition hover:bg-slate-50"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span
                  className="block text-sm font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  {ticket.subject}
                </span>
                <span
                  className="mt-1 block text-xs font-semibold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {ticket.status} - {formatDate(ticket.lastMessageAt)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Geen objecttickets"
            description="Maak een supportvraag aan wanneer er iets speelt rond dit object."
          />
        )}
      </Section>

      <Section
        id="beheer"
        icon={<UserRound size={20} />}
        title="Beheer"
        subtitle="Objectgegevens en vaste instructies bijwerken."
      >
        {object.contacts.length > 0 ? (
          <div className="mb-4 rounded-2xl bg-slate-50 p-4">
            <div
              className="mb-3 flex items-center gap-2 text-sm font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              <UserRound size={16} />
              Gekoppelde contactpersonen
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {object.contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-xl bg-white px-3 py-2.5"
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {contact.firstName} {contact.lastName}
                    {contact.isPrimary ? (
                      <span className="ml-2 text-[10px] font-semibold text-[#087C79]">
                        Primair
                      </span>
                    ) : null}
                  </p>
                  <p
                    className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    {contact.function ? <span>{contact.function}</span> : null}
                    {contact.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone size={12} /> {contact.phone}
                      </span>
                    ) : null}
                    {contact.email ? <span>{contact.email}</span> : null}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <CustomerObjectForm mode="edit" object={object} sectors={sectors} />
      </Section>
    </PortalPageShell>
  );
}
