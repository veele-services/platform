import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ExternalLink, MessageSquare } from "lucide-react";

import { getTicket, type BackofficeTicketMessage, type TicketKind } from "@/app/actions/tickets";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Button } from "@/components/ui/button";
import {
  TenantDetailActionPanel,
  TenantDetailHeader,
  TenantDetailLayout,
  TenantDetailSectionNav,
  TenantPageShell,
  TenantWorkbenchPanel,
} from "@/components/tenant-ui";
import { ProcessStepper } from "@/components/workflows/ProcessStatus";
import { hasPermission } from "@/lib/auth/permissions";
import {
  departmentLabel,
  PriorityBadge,
  TicketSourceBadge,
  TicketStatusBadge,
} from "../../TicketBadges";
import { ReplyForm } from "./ReplyForm";
import { StatusActions } from "./StatusActions";

export const metadata: Metadata = { title: "Ticket" };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatAssignmentSlot(assignment: {
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
}) {
  const date = assignment.scheduledDate
    ? new Intl.DateTimeFormat("nl-NL", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date(`${assignment.scheduledDate}T00:00:00`))
    : "Nog niet gepland";
  const time = [assignment.scheduledStart, assignment.scheduledEnd].filter(Boolean).join(" - ");
  return time ? `${date}, ${time}` : date;
}

function isTicketKind(value: string): value is TicketKind {
  return value === "customer" || value === "personnel";
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  if (!(await hasPermission("tickets", "read"))) {
    return <ForbiddenPage resource="tickets" action="read" />;
  }

  const { kind: rawKind, id } = await params;
  if (!isTicketKind(rawKind)) notFound();

  const [ticket, canWrite] = await Promise.all([
    getTicket(rawKind, id),
    hasPermission("tickets", "write"),
  ]);
  if (!ticket) notFound();

  const isClosed = ticket.status === "closed";
  const detailHref = `/tickets/${ticket.kind}/${ticket.id}`;

  return (
    <TenantPageShell size="wide">
      <TenantDetailHeader
        backHref="/tickets"
        backLabel="Terug naar tickets"
        title={ticket.subject}
        description={`${ticket.requesterName}${ticket.requesterMeta ? ` - ${ticket.requesterMeta}` : ""}`}
        badges={
          <>
            <TicketSourceBadge kind={ticket.kind} />
            <TicketStatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </>
        }
        meta={[
          { label: "Afdeling", value: departmentLabel(ticket.department) },
          { label: "Aangemaakt", value: formatDateTime(ticket.createdAt) },
          { label: "Laatst bericht", value: formatDateTime(ticket.lastMessageAt) },
        ]}
        summary={<ProcessStepper kind="ticket" status={ticket.status} compact />}
      />

      <TenantDetailSectionNav
        items={[
          { label: "Gesprek", href: `${detailHref}#gesprek`, active: true, count: ticket.messages.length },
          { label: "Reageren", href: `${detailHref}#reageren` },
          { label: "Details", href: `${detailHref}#details` },
          ...(ticket.assignment ? [{ label: "Werkbon", href: `${detailHref}#werkbon` }] : []),
        ]}
      />

      <TenantDetailLayout
        aside={
          <TenantDetailActionPanel
            title="Ticketacties"
            description="Status, context en gekoppelde operatie voor dit ticket."
          >
            <section id="details" className="rounded-lg border border-border bg-card p-4 shadow-card">
              <h2 className="text-sm font-semibold text-foreground">Details</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <Meta label="Bron" value={ticket.kind === "customer" ? "Klantportaal" : "Personeelsapp"} />
                <Meta label="Afdeling" value={departmentLabel(ticket.department)} />
                <Meta label="Ongelezen" value={`${ticket.unreadCount}`} />
                <Meta label="Ticket-ID" value={ticket.id.slice(0, 8)} />
              </dl>
            </section>

            {ticket.assignment ? (
              <section id="werkbon" className="rounded-lg border border-primary/20 bg-card p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CalendarDays className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gekoppelde werkbon</p>
                    <h2 className="mt-1 text-sm font-semibold text-foreground">{ticket.assignment.code}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{ticket.assignment.title}</p>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">{formatAssignmentSlot(ticket.assignment)}</p>
                    <Button asChild size="sm" className="mt-3">
                      <Link href={`/assignments/${ticket.assignment.id}`}>
                        Open werkbon
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            {canWrite ? (
              <StatusActions kind={ticket.kind} ticketId={ticket.id} currentStatus={ticket.status} />
            ) : null}
          </TenantDetailActionPanel>
        }
      >
        <main className="flex flex-col gap-6">
          <TenantWorkbenchPanel
            id="gesprek"
            title="Gesprek"
            description={`${ticket.messages.length} bericht${ticket.messages.length === 1 ? "" : "en"} in deze conversatie`}
            actions={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                {ticket.kind === "customer" ? "Klant" : "Personeel"}
              </span>
            }
          >
            <div className="space-y-3 p-4">
              {ticket.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  ticketKind={ticket.kind}
                  fallbackDepartment={ticket.department}
                />
              ))}
            </div>
          </TenantWorkbenchPanel>

          <TenantWorkbenchPanel
            id="reageren"
            title="Reply composer"
            description={isClosed ? "Dit ticket is gesloten; reacties zijn geblokkeerd." : "Reageer namens de backoffice en houd het gesprek binnen dezelfde workflow."}
          >
            <div className="p-4">
              {canWrite ? (
                <ReplyForm kind={ticket.kind} ticketId={ticket.id} disabled={isClosed} />
              ) : (
                <p className="rounded-lg bg-muted px-4 py-3 text-sm font-medium text-muted-foreground">
                  U heeft geen rechten om op tickets te reageren.
                </p>
              )}
            </div>
          </TenantWorkbenchPanel>
        </main>
      </TenantDetailLayout>
    </TenantPageShell>
  );
}

function MessageBubble({
  message,
  ticketKind,
  fallbackDepartment,
}: {
  message: BackofficeTicketMessage;
  ticketKind: TicketKind;
  fallbackDepartment: string;
}) {
  const external = message.authorType === "customer" || message.authorType === "personnel";

  return (
    <article
      className={
        external
          ? "rounded-lg border border-primary/20 bg-primary/5 p-4"
          : "ml-auto rounded-lg border border-border bg-muted/40 p-4 lg:max-w-[82%]"
      }
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{message.authorName}</p>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
            {external
              ? ticketKind === "customer"
                ? "Klant"
                : "Personeel"
              : departmentLabel(message.department ?? fallbackDepartment)}
          </p>
        </div>
        <time className="text-xs font-medium text-muted-foreground">{formatDateTime(message.createdAt)}</time>
      </div>
      <p className="whitespace-pre-line text-sm leading-6 text-foreground">{message.body}</p>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium text-foreground">{value}</dd>
    </div>
  );
}
