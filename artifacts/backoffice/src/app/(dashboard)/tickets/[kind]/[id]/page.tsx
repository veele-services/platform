import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, MessageSquare } from "lucide-react";
import { getTicket, type TicketKind } from "@/app/actions/tickets";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { hasPermission } from "@/lib/auth/permissions";
import {
  departmentLabel,
  PriorityBadge,
  TicketSourceBadge,
  TicketStatusBadge,
} from "../../TicketBadges";
import { ReplyForm } from "./ReplyForm";
import { StatusActions } from "./StatusActions";
import { ProcessStepper } from "@/components/workflows/ProcessStatus";

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

  return (
    <div className="mx-auto w-full max-w-[1600px] p-8">
      <div className="mb-8">
        <Link
          href="/tickets"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-[#081D3A]"
        >
          <ArrowLeft size={17} strokeWidth={2.4} />
          Terug naar tickets
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="flex flex-col gap-6">
          <section className="veele-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Ticket
                </p>
                <h1 className="mt-1 text-2xl font-black leading-tight" style={{ color: "#081D3A" }}>
                  {ticket.subject}
                </h1>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  {ticket.requesterName}
                  {ticket.requesterMeta ? ` - ${ticket.requesterMeta}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <TicketSourceBadge kind={ticket.kind} />
                <TicketStatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
              </div>
            </div>
            <ProcessStepper kind="ticket" status={ticket.status} className="mt-4" />
          </section>

          <section className="veele-card">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E8FBFA] text-[#087C79]">
                <MessageSquare size={20} strokeWidth={2.4} />
              </span>
              <div>
                <h2 className="text-lg font-black" style={{ color: "#081D3A" }}>
                  Tijdlijn
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {ticket.messages.length} bericht{ticket.messages.length === 1 ? "" : "en"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {ticket.messages.map((message) => {
                const external =
                  message.authorType === "customer" ||
                  message.authorType === "personnel";
                return (
                  <article
                    key={message.id}
                    className="rounded-lg border p-4"
                    style={{
                      borderColor: external ? "#BDEDEA" : "#E2E8F0",
                      backgroundColor: external ? "#FCFFFF" : "#F8FAFC",
                    }}
                  >
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black" style={{ color: "#081D3A" }}>
                          {message.authorName}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-slate-400">
                          {external
                            ? ticket.kind === "customer"
                              ? "Klant"
                              : "Personeel"
                            : departmentLabel(message.department ?? ticket.department)}
                        </p>
                      </div>
                      <time className="text-xs font-bold text-slate-400">
                        {formatDateTime(message.createdAt)}
                      </time>
                    </div>
                    <p className="whitespace-pre-line text-sm font-medium leading-6" style={{ color: "#081D3A" }}>
                      {message.body}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="veele-card">
            <h2 className="mb-3 text-lg font-black" style={{ color: "#081D3A" }}>
              Reageren
            </h2>
            {canWrite ? (
              <ReplyForm kind={ticket.kind} ticketId={ticket.id} disabled={isClosed} />
            ) : (
              <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
                U heeft geen rechten om op tickets te reageren.
              </p>
            )}
          </section>
        </main>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-24 xl:self-start">
          <section className="veele-card">
            <h2 className="text-sm font-black" style={{ color: "#081D3A" }}>
              Details
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Meta label="Bron" value={ticket.kind === "customer" ? "Klantportaal" : "Personeelsapp"} />
              <Meta label="Afdeling" value={departmentLabel(ticket.department)} />
              <Meta label="Aangemaakt" value={formatDateTime(ticket.createdAt)} />
              <Meta label="Laatst bericht" value={formatDateTime(ticket.lastMessageAt)} />
            </dl>
          </section>

          {ticket.assignment ? (
            <section className="veele-card" style={{ borderColor: "#BDEDEA" }}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E8FBFA] text-[#087C79]">
                  <CalendarDays size={20} strokeWidth={2.4} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                    Gekoppelde werkbon
                  </p>
                  <h2 className="mt-1 text-sm font-black" style={{ color: "#081D3A" }}>
                    {ticket.assignment.code}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {ticket.assignment.title}
                  </p>
                  <p className="mt-2 text-xs font-bold text-slate-400">
                    {formatAssignmentSlot(ticket.assignment)}
                  </p>
                  <Link
                    href={`/assignments/${ticket.assignment.id}`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black text-white"
                    style={{ backgroundColor: "#087C79" }}
                  >
                    Open werkbon
                    <ExternalLink size={13} strokeWidth={2.4} />
                  </Link>
                </div>
              </div>
            </section>
          ) : null}

          {canWrite ? (
            <StatusActions
              kind={ticket.kind}
              ticketId={ticket.id}
              currentStatus={ticket.status}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 font-bold" style={{ color: "#081D3A" }}>
        {value}
      </dd>
    </div>
  );
}
