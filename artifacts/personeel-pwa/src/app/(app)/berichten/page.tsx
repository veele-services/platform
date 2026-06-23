export const dynamic = "force-dynamic";

import Link from "next/link";
import { ChevronRight, Inbox, MessageSquare } from "lucide-react";
import { getMyTickets } from "@/actions/messages";
import { NewTicketForm } from "./NewTicketForm";
import {
  departmentLabel,
  PriorityBadge,
  TicketStatusBadge,
} from "./TicketStatus";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function BerichtenPage() {
  const tickets = await getMyTickets();

  return (
    <div className="min-h-[calc(100vh-4.2rem)] bg-[#061F44] md:bg-transparent">
      <section className="px-4 pb-6 pt-4 md:rounded-3xl md:px-6">
        <h1 className="text-[29px] font-black leading-tight text-white md:text-3xl">
          Berichten
        </h1>
        <p className="mt-1 text-base font-medium text-white/68">
          Tickets met planning, management en backoffice
        </p>
      </section>

      <section className="min-h-[calc(100vh-14rem)] rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:min-h-0 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto max-w-xl space-y-4 md:max-w-3xl">
          <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)] md:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                <MessageSquare size={21} strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black text-[#081D3A]">
                  Mijn tickets
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {tickets.length} lopende of afgeronde berichten
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {tickets.length > 0 ? (
                tickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    href={`/berichten/${ticket.id}`}
                    className="block rounded-[20px] border bg-white p-3 shadow-sm active:scale-[0.99]"
                    style={{
                      borderColor:
                        ticket.unreadCount > 0
                          ? "var(--color-accent)"
                          : "var(--color-border)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                        style={{
                          backgroundColor:
                            ticket.unreadCount > 0 ? "#E8FBFA" : "#F1F5F9",
                          color:
                            ticket.unreadCount > 0 ? "#009E9A" : "#64748B",
                        }}
                      >
                        <MessageSquare size={18} strokeWidth={2.4} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-1 text-sm font-black text-[#081D3A]">
                              {ticket.subject}
                            </span>
                            <span className="mt-1 block line-clamp-2 text-xs font-semibold text-slate-500">
                              {ticket.lastMessagePreview ??
                                "Nog geen berichtinhoud"}
                            </span>
                          </span>
                          {ticket.unreadCount > 0 ? (
                            <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-black text-white">
                              {ticket.unreadCount}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-1.5">
                          <TicketStatusBadge status={ticket.status} />
                          <PriorityBadge priority={ticket.priority} />
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                            {departmentLabel(ticket.department)}
                          </span>
                          <span className="text-[11px] font-bold text-slate-400">
                            {formatDate(ticket.lastMessageAt)}
                          </span>
                        </span>
                      </span>
                      <ChevronRight
                        size={19}
                        strokeWidth={2.4}
                        className="mt-2 shrink-0 text-slate-400"
                      />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[20px] border border-[#D8E8F3] bg-[#F8FBFE] px-4 py-10 text-center">
                  <Inbox className="mx-auto text-slate-400" size={30} />
                  <p className="mt-3 text-sm font-black text-[#081D3A]">
                    Geen tickets
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Start hieronder een nieuw bericht richting een afdeling.
                  </p>
                </div>
              )}
            </div>
          </section>

          <NewTicketForm />
        </div>
      </section>
    </div>
  );
}
