export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { getMyTicket } from "@/actions/messages";
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
          Ticket
        </p>
        <h1 className="mt-1 text-[27px] font-black leading-tight text-white md:text-3xl">
          {ticket.subject}
        </h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <TicketStatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <span className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-black text-white">
            {departmentLabel(ticket.department)}
          </span>
        </div>
      </section>

      <section className="-mt-7 min-h-[calc(100vh-14rem)] rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:mt-0 md:min-h-0 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto max-w-xl space-y-4 md:max-w-3xl">
          <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)] md:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                <MessageSquare size={21} strokeWidth={2.4} />
              </span>
              <div>
                <h2 className="text-lg font-black text-[#081D3A]">
                  Tijdlijn
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {ticket.messages.length} bericht
                  {ticket.messages.length === 1 ? "" : "en"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {ticket.messages.map((message) => {
                const isPersonnel = message.authorType === "personnel";
                return (
                  <article
                    key={message.id}
                    className="rounded-[20px] border p-3"
                    style={{
                      borderColor: isPersonnel ? "#BDEDEA" : "#D8E8F3",
                      backgroundColor: isPersonnel ? "#FCFFFF" : "#F8FBFE",
                    }}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-[#081D3A]">
                          {message.authorName}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-slate-400">
                          {isPersonnel
                            ? "Jij"
                            : departmentLabel(
                                message.department ?? ticket.department,
                              )}
                        </p>
                      </div>
                      <time className="text-xs font-bold text-slate-400">
                        {formatDateTime(message.createdAt)}
                      </time>
                    </div>
                    <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-[#081D3A]">
                      {message.body}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.10)] md:p-5">
            <h2 className="mb-3 text-lg font-black text-[#081D3A]">
              Reageren
            </h2>
            <ReplyForm ticketId={ticket.id} disabled={isClosed} />
          </section>
        </div>
      </section>
    </div>
  );
}
