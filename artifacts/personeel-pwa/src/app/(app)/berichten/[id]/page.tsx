export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, MessageSquare, Send } from "lucide-react";
import { getMyTicket, type PersonnelTicketDetail, type PersonnelTicketMessage } from "@/actions/messages";
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

function MessageBubble({
  message,
  ticket,
}: {
  message: PersonnelTicketMessage;
  ticket: PersonnelTicketDetail;
}) {
  const isPersonnel = message.authorType === "personnel";

  return (
    <article className={`flex ${isPersonnel ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-[22px] border px-4 py-3 shadow-sm md:max-w-[76%] ${
          isPersonnel ? "rounded-br-md" : "rounded-bl-md"
        }`}
        style={{
          borderColor: isPersonnel ? "#BDEDEA" : "#D8E8F3",
          backgroundColor: isPersonnel ? "#FCFFFF" : "#FFFFFF",
        }}
      >
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-[var(--color-primary)]">
            {isPersonnel ? "Jij" : message.authorName}
          </p>
          <span className="text-xs font-bold text-slate-400">
            {isPersonnel
              ? "Personeelsapp"
              : departmentLabel(message.department ?? ticket.department)}
          </span>
        </div>
        <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-[var(--color-primary)]">
          {message.body}
        </p>
        <time className="mt-2 block text-right text-[11px] font-bold text-slate-400">
          {formatDateTime(message.createdAt)}
        </time>
      </div>
    </article>
  );
}

function ConversationTimeline({ ticket }: { ticket: PersonnelTicketDetail }) {
  return (
    <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)] md:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
          <MessageSquare size={21} strokeWidth={2.4} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-primary)]">
            Gesprekstijdlijn
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {ticket.messages.length} bericht{ticket.messages.length === 1 ? "" : "en"} in dit gesprek
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {ticket.messages.map((message) => (
          <MessageBubble key={message.id} message={message} ticket={ticket} />
        ))}
      </div>
    </section>
  );
}

function TicketContextPanel({
  ticket,
  isClosed,
}: {
  ticket: PersonnelTicketDetail;
  isClosed: boolean;
}) {
  return (
    <aside className="space-y-4 md:sticky md:top-4">
      <section className="rounded-[22px] border bg-white p-4 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Gesprek
            </p>
            <h2 className="mt-1 text-[17px] font-semibold leading-tight text-[var(--color-primary)]">
              {isClosed ? "Afgerond" : "Actief ticket"}
            </h2>
          </div>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <div className="mt-4 grid gap-2">
          <div className="rounded-2xl bg-[#F8FBFE] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Afdeling
            </p>
            <p className="mt-1 text-[14px] font-semibold text-[var(--color-primary)]">
              {departmentLabel(ticket.department)}
            </p>
          </div>
          <div className="rounded-2xl bg-[#F8FBFE] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Laatste activiteit
            </p>
            <p className="mt-1 text-[14px] font-semibold text-[var(--color-primary)]">
              {formatDateTime(ticket.lastMessageAt)}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <PriorityBadge priority={ticket.priority} />
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            <Clock3 size={12} />
            {ticket.messages.length} bericht{ticket.messages.length === 1 ? "" : "en"}
          </span>
        </div>
      </section>

      <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.10)] md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Send size={18} style={{ color: "var(--color-accent)" }} />
          <h2 className="text-lg font-semibold text-[var(--color-primary)]">
            Reageren
          </h2>
        </div>
        <ReplyForm ticketId={ticket.id} disabled={isClosed} />
      </section>
    </aside>
  );
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = await getMyTicket(id);
  if (!ticket) notFound();

  const isClosed = ticket.status === "closed";

  return (
    <div className="min-h-[calc(100vh-4.2rem)] bg-[#F4F7FB] md:bg-transparent">
      <section className="bg-[#061F44] px-4 pb-10 pt-4 md:rounded-3xl md:bg-transparent md:px-6 md:pb-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            href="/berichten"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white"
            aria-label="Terug naar berichten"
          >
            <ArrowLeft size={21} strokeWidth={2.4} />
          </Link>
          <TicketActions ticketId={ticket.id} isClosed={isClosed} />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">
          Bericht
        </p>
        <h1 className="mt-1 text-[27px] font-semibold leading-tight text-white md:text-3xl">
          {ticket.subject}
        </h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <TicketStatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <span className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-white">
            {departmentLabel(ticket.department)}
          </span>
        </div>
      </section>

      <section className="-mt-7 min-h-[calc(100vh-14rem)] rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:mt-0 md:min-h-0 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start">
          <ConversationTimeline ticket={ticket} />
          <TicketContextPanel ticket={ticket} isClosed={isClosed} />
        </div>
      </section>
    </div>
  );
}
