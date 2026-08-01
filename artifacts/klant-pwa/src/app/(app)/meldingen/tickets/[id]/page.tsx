export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Clock3,
  MessageSquare,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import { getMyCustomerTicket } from "@/actions/tickets";
import { PortalPageShell } from "@/components/portal-ui";
import {
  departmentLabel,
  PriorityBadge,
  TicketStatusBadge,
} from "../TicketStatus";
import { ReplyForm } from "./ReplyForm";
import { TicketActions } from "./TicketActions";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function supportStatusCopy(status: string) {
  if (status === "closed") {
    return "Dit ticket is afgesloten. Heropen het ticket als u nog iets wilt toevoegen.";
  }
  if (status === "waiting_customer") {
    return "De dienstverlener wacht op uw reactie. Voeg hieronder uw antwoord toe.";
  }
  if (status === "waiting_backoffice") {
    return "Uw reactie staat bij de dienstverlener. U ontvangt hier een update zodra er antwoord is.";
  }
  return "Het ticket is open en wordt opgevolgd door de juiste afdeling.";
}

export default async function CustomerTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = await getMyCustomerTicket(id);
  if (!ticket) notFound();

  const isClosed = ticket.status === "closed";

  return (
    <PortalPageShell
      title={ticket.subject}
      subtitle="Supportgesprek en opvolging."
      eyebrow="Klantticket"
      status={{ label: isClosed ? "Afgesloten" : "In behandeling", tone: isClosed ? "neutral" : "warning" }}
      actions={
        <Link
          href="/meldingen/tickets"
          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <ArrowLeft size={15} />
          Tickets
        </Link>
      }
      size="default"
    >
      <div className="md:hidden">
        <Link
          href="/meldingen/tickets"
          className="mb-3 inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold shadow-sm"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <ArrowLeft size={16} />
          Terug naar tickets
        </Link>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <section
            className="rounded-2xl border bg-white p-4 shadow-sm md:p-5"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8FBFA] text-[#009E9A]">
                  <MessageSquare size={21} strokeWidth={2.4} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted-fg)" }}>
                    Gesprek
                  </p>
                  <h2 className="mt-1 text-lg font-semibold" style={{ color: "var(--color-primary)" }}>
                    {ticket.messages.length} bericht{ticket.messages.length === 1 ? "" : "en"}
                  </h2>
                  <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                    {supportStatusCopy(ticket.status)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <TicketStatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
              </div>
            </div>
          </section>

          <section
            className="rounded-2xl border bg-white p-4 shadow-sm md:p-5"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="space-y-4">
              {ticket.messages.map((message, index) => {
                const isCustomer = message.authorType === "customer";
                return (
                  <article key={message.id} className="relative pl-8">
                    {index < ticket.messages.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-[0.55rem] top-8 h-[calc(100%-1rem)] w-px"
                        style={{ backgroundColor: "var(--color-border)" }}
                      />
                    ) : null}
                    <span
                      className="absolute left-0 top-1 flex h-5 w-5 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: isCustomer ? "var(--color-accent)" : "var(--color-primary)",
                      }}
                    >
                      <span className="h-2 w-2 rounded-full bg-white" />
                    </span>
                    <div
                      className="rounded-2xl border p-4"
                      style={{
                        borderColor: isCustomer ? "#BDEDEA" : "#D8E8F3",
                        backgroundColor: isCustomer ? "#FCFFFF" : "#F8FBFE",
                      }}
                    >
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
                            {message.authorName}
                          </p>
                          <p className="mt-0.5 text-xs font-bold" style={{ color: "var(--color-muted-fg)" }}>
                            {isCustomer
                              ? "U"
                              : departmentLabel(message.department ?? ticket.department)}
                          </p>
                        </div>
                        <time className="text-xs font-bold" style={{ color: "var(--color-muted-fg)" }}>
                          {formatDateTime(message.createdAt)}
                        </time>
                      </div>
                      <p className="whitespace-pre-line text-sm font-semibold leading-7" style={{ color: "var(--color-primary)" }}>
                        {message.body}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section
            className="rounded-2xl border bg-white p-4 shadow-sm md:p-5"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "var(--color-primary)" }}>
                  Reageren
                </h2>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
                  Voeg context toe of beantwoord de laatste vraag van support.
                </p>
              </div>
            </div>
            <ReplyForm ticketId={ticket.id} disabled={isClosed} />
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <section
            className="rounded-2xl border bg-white p-4 shadow-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8FBFA] text-[#087C79]">
                <ShieldCheck size={18} />
              </span>
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--color-primary)" }}>
                  Status en SLA
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                  {supportStatusCopy(ticket.status)}
                </p>
              </div>
            </div>
            <dl className="mt-4 space-y-2">
              <InfoRow label="Afdeling" value={departmentLabel(ticket.department)} />
              <InfoRow label="Aangemaakt" value={formatDateTime(ticket.createdAt)} />
              <InfoRow label="Laatste bericht" value={formatDateTime(ticket.lastMessageAt)} />
            </dl>
            <div className="mt-4">
              <TicketActions ticketId={ticket.id} isClosed={isClosed} variant="solid" />
            </div>
          </section>

          <section
            className="rounded-2xl border bg-white p-4 shadow-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Paperclip size={18} />
              </span>
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--color-primary)" }}>
                  Bijlagen
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                  Noem bestandsnamen of documentreferenties in uw reactie. Support deelt bestanden veilig via Documenten.
                </p>
              </div>
            </div>
          </section>

          <section
            className="rounded-2xl border bg-white p-4 shadow-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Clock3 size={18} />
              </span>
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--color-primary)" }}>
                  Opvolging
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                  SLA-statussen zijn voorbereid voor contractafspraken. Tot die tijd toont dit ticket de actuele workflowstatus.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </PortalPageShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted-fg)" }}>
        {label}
      </dt>
      <dd className="text-right text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
        {value}
      </dd>
    </div>
  );
}
