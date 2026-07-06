export const dynamic = "force-dynamic";

import Link from "next/link";
import { ChevronRight, Inbox, MessageSquare, Send } from "lucide-react";
import { getMyTickets } from "@/actions/messages";
import { NewTicketForm } from "./NewTicketForm";
import {
  departmentLabel,
  PriorityBadge,
  TicketStatusBadge,
} from "./TicketStatus";

type TicketListItem = Awaited<ReturnType<typeof getMyTickets>>[number];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function TicketSummaryStrip({
  unreadCount,
  openCount,
  totalCount,
}: {
  unreadCount: number;
  openCount: number;
  totalCount: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: "Ongelezen", value: unreadCount, tone: unreadCount > 0 ? "accent" : "neutral" },
        { label: "Actief", value: openCount, tone: openCount > 0 ? "accent" : "neutral" },
        { label: "Totaal", value: totalCount, tone: "neutral" },
      ].map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border bg-white px-3 py-2 shadow-sm"
          style={{
            borderColor: item.tone === "accent" ? "rgba(0,183,179,0.35)" : "var(--color-border)",
          }}
        >
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
            {item.label}
          </p>
          <p className="mt-1 text-[20px] font-black leading-none" style={{ color: "var(--color-primary)" }}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function TicketInboxCard({ ticket }: { ticket: TicketListItem }) {
  const hasUnread = ticket.unreadCount > 0;

  return (
    <Link
      href={`/berichten/${ticket.id}`}
      className="block rounded-[20px] border bg-white p-3 shadow-sm active:scale-[0.99]"
      style={{
        borderColor: hasUnread ? "var(--color-accent)" : "var(--color-border)",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: hasUnread ? "#E8FBFA" : "#F1F5F9",
            color: hasUnread ? "#009E9A" : "#64748B",
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
                {ticket.lastMessagePreview ?? "Nog geen berichtinhoud"}
              </span>
            </span>
            {hasUnread ? (
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
  );
}

function TicketListSection({
  title,
  description,
  tickets,
}: {
  title: string;
  description: string;
  tickets: TicketListItem[];
}) {
  if (tickets.length === 0) return null;

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
          {title} ({tickets.length})
        </h2>
        <p className="mt-0.5 text-[12px] font-semibold" style={{ color: "var(--color-secondary)" }}>
          {description}
        </p>
      </div>
      <div className="space-y-2">
        {tickets.map((ticket) => (
          <TicketInboxCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
    </section>
  );
}

export default async function BerichtenPage() {
  const tickets = await getMyTickets();
  const unreadTickets = tickets.filter((ticket) => ticket.unreadCount > 0);
  const activeTickets = tickets.filter((ticket) => ticket.status !== "closed" && ticket.unreadCount === 0);
  const closedTickets = tickets.filter((ticket) => ticket.status === "closed");
  const openCount = tickets.filter((ticket) => ticket.status !== "closed").length;
  const unreadCount = unreadTickets.reduce((sum, ticket) => sum + ticket.unreadCount, 0);

  return (
    <div className="min-h-[calc(100vh-4.2rem)] bg-[#F4F7FB] md:bg-transparent">
      <section className="bg-[#061F44] px-4 pb-10 pt-4 md:rounded-3xl md:bg-transparent md:px-6 md:pb-6">
        <h1 className="text-[29px] font-black leading-tight text-white md:text-3xl">
          Berichten
        </h1>
        <p className="mt-1 text-base font-medium text-white/68">
          Inbox voor tickets met planning, management en backoffice
        </p>
      </section>

      <section className="-mt-7 min-h-[calc(100vh-14rem)] rounded-t-[28px] bg-[#F4F7FB] px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:mt-0 md:min-h-0 md:rounded-3xl md:px-0 md:pb-0 md:pt-0">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-[minmax(18rem,1fr)_minmax(0,2fr)] md:items-start">
          <div className="space-y-4">
            <TicketSummaryStrip
              unreadCount={unreadCount}
              openCount={openCount}
              totalCount={tickets.length}
            />

            <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)] md:p-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                  <Inbox size={21} strokeWidth={2.4} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black text-[#081D3A]">
                    Mijn inbox
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {tickets.length} gesprek{tickets.length === 1 ? "" : "ken"} met planning of backoffice
                  </p>
                </div>
              </div>

              {tickets.length > 0 ? (
                <div className="space-y-5">
                  <TicketListSection
                    title="Actie nodig"
                    description="Nieuwe reacties die je nog niet hebt gelezen."
                    tickets={unreadTickets}
                  />
                  <TicketListSection
                    title="Lopende gesprekken"
                    description="Open tickets zonder nieuwe reactie."
                    tickets={activeTickets}
                  />
                  <TicketListSection
                    title="Afgerond"
                    description="Gesloten gesprekken blijven beschikbaar als naslag."
                    tickets={closedTickets}
                  />
                </div>
              ) : (
                <div className="rounded-[20px] border border-[#D8E8F3] bg-[#F8FBFE] px-4 py-10 text-center">
                  <Inbox className="mx-auto text-slate-400" size={30} />
                  <p className="mt-3 text-sm font-black text-[#081D3A]">
                    Geen tickets
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Start rechts of hieronder een nieuw bericht richting een afdeling.
                  </p>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4 md:sticky md:top-4">
            <section className="rounded-[22px] border bg-white p-4 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                  <Send size={19} strokeWidth={2.4} />
                </span>
                <div>
                  <h2 className="text-[15px] font-black text-[#081D3A]">
                    Nieuw bericht
                  </h2>
                  <p className="mt-1 text-[13px] font-semibold leading-5 text-slate-500">
                    Stel een vraag over planning, werkbon, uren of materiaal.
                  </p>
                </div>
              </div>
            </section>
            <NewTicketForm />
          </aside>
        </div>
      </section>
    </div>
  );
}
