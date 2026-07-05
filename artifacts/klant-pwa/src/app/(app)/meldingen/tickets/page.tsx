export const dynamic = "force-dynamic";

import Link from "next/link";
import { ChevronRight, Inbox, MessageSquare } from "lucide-react";
import { getMyCustomerTickets } from "@/actions/tickets";
import { PageShell } from "@/components/PageShell";
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

export default async function CustomerTicketsPage() {
  const tickets = await getMyCustomerTickets();

  return (
    <PageShell
      title="Support"
      subtitle="Tickets en vragen richting uw dienstverlener."
    >
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_24rem]">
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
                {tickets.length} ticket{tickets.length === 1 ? "" : "s"} in uw
                klantportaal
              </p>
            </div>
          </div>

          <div
            className="hidden overflow-x-auto rounded-[18px] border md:block"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div
              className="grid grid-cols-[minmax(16rem,1fr)_8rem_8rem_8rem_4rem] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-slate-500"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span>Onderwerp</span>
              <span>Afdeling</span>
              <span>Prioriteit</span>
              <span>Status</span>
              <span className="text-right">Nieuw</span>
            </div>
            {tickets.length > 0 ? (
              <div
                className="divide-y"
                style={{ borderColor: "var(--color-border)" }}
              >
                {tickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    href={`/meldingen/tickets/${ticket.id}`}
                    className="grid grid-cols-[minmax(16rem,1fr)_8rem_8rem_8rem_4rem] items-center gap-3 px-4 py-3 transition hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[#081D3A]">
                        {ticket.subject}
                      </span>
                      <span className="mt-0.5 block line-clamp-1 text-xs font-semibold text-slate-500">
                        {ticket.lastMessagePreview ?? "Nog geen berichtinhoud"}{" "}
                        - {formatDate(ticket.lastMessageAt)}
                      </span>
                    </span>
                    <span className="truncate text-xs font-black text-slate-600">
                      {departmentLabel(ticket.department)}
                    </span>
                    <PriorityBadge priority={ticket.priority} />
                    <TicketStatusBadge status={ticket.status} />
                    <span className="text-right">
                      {ticket.unreadCount > 0 ? (
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-black text-white">
                          {ticket.unreadCount}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">
                          -
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-center">
                <Inbox className="mx-auto text-slate-400" size={30} />
                <p className="mt-3 text-sm font-black text-[#081D3A]">
                  Geen tickets
                </p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Start rechts een nieuw contactverzoek.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 md:hidden">
            {tickets.length > 0 ? (
              tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/meldingen/tickets/${ticket.id}`}
                  className="block rounded-[20px] border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
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
                        color: ticket.unreadCount > 0 ? "#009E9A" : "#64748B",
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
                  Start rechts een nieuw contactverzoek.
                </p>
              </div>
            )}
          </div>
        </section>

        <NewTicketForm />
      </div>
    </PageShell>
  );
}
