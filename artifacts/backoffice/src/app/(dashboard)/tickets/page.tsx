import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Inbox, MessageSquare, Search } from "lucide-react";
import { listTickets } from "@/app/actions/tickets";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { hasPermission } from "@/lib/auth/permissions";
import {
  TICKET_KIND_OPTIONS,
  TICKET_STATUS_OPTIONS,
} from "@/lib/ticket-options";
import {
  departmentLabel,
  PriorityBadge,
  TicketSourceBadge,
  TicketStatusBadge,
} from "./TicketBadges";

export const metadata: Metadata = { title: "Tickets" };

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function str(v: string | string[] | undefined, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function TicketsPage({ searchParams }: Props) {
  if (!(await hasPermission("tickets", "read"))) {
    return <ForbiddenPage resource="tickets" action="read" />;
  }

  const sp = await searchParams;
  const search = str(sp.search);
  const status = str(sp.status, "all");
  const source = str(sp.source, "all");
  const result = await listTickets({ search, status, source });

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6">
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <KpiCard label="Open tickets" value={result.openCount} />
        <KpiCard label="Actie Veele" value={result.waitingBackofficeCount} accent="#B45309" />
        <KpiCard label="Ongelezen" value={result.unreadCount} accent="#DC2626" />
      </div>

      <section className="rounded-lg border bg-white p-4 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
        <form className="mb-4 grid gap-3 lg:grid-cols-[1fr_12rem_12rem_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="search"
              defaultValue={search}
              placeholder="Zoek op onderwerp, klant, medewerker..."
              className="h-10 w-full rounded-md border bg-white pl-9 pr-3 text-sm font-medium outline-none focus:border-[#00B7B3] focus:ring-4 focus:ring-[#00B7B3]/10"
              style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
            />
          </label>
          <select
            name="source"
            defaultValue={source}
            className="h-10 rounded-md border bg-white px-3 text-sm font-semibold outline-none focus:border-[#00B7B3] focus:ring-4 focus:ring-[#00B7B3]/10"
            style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
          >
            {TICKET_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={status}
            className="h-10 rounded-md border bg-white px-3 text-sm font-semibold outline-none focus:border-[#00B7B3] focus:ring-4 focus:ring-[#00B7B3]/10"
            style={{ borderColor: "#E2E8F0", color: "#081D3A" }}
          >
            <option value="all">Alle statussen</option>
            {TICKET_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-10 rounded-md bg-[#081D3A] px-4 text-sm font-black text-white"
          >
            Filter
          </button>
        </form>

        <div className="space-y-2">
          {result.rows.length > 0 ? (
            result.rows.map((ticket) => (
              <Link
                key={`${ticket.kind}-${ticket.id}`}
                href={`/tickets/${ticket.kind}/${ticket.id}`}
                className="block rounded-lg border bg-white p-4 transition hover:border-[#00B7B3] hover:shadow-md"
                style={{ borderColor: ticket.unreadCount > 0 ? "#00B7B3" : "#E2E8F0" }}
              >
                <div className="flex items-start gap-4">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: ticket.unreadCount > 0 ? "#E8FBFA" : "#F1F5F9",
                      color: ticket.unreadCount > 0 ? "#087C79" : "#64748B",
                    }}
                  >
                    <MessageSquare size={20} strokeWidth={2.3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-1 text-sm font-black" style={{ color: "#081D3A" }}>
                          {ticket.subject}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-slate-500">
                          {ticket.requesterName}
                          {ticket.requesterMeta ? ` - ${ticket.requesterMeta}` : ""}
                        </span>
                      </span>
                      {ticket.unreadCount > 0 ? (
                        <span className="rounded-full bg-red-500 px-2 py-1 text-[11px] font-black text-white">
                          {ticket.unreadCount} nieuw
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 block line-clamp-1 text-sm font-medium text-slate-600">
                      {ticket.lastMessagePreview ?? "Nog geen berichtinhoud"}
                    </span>
                    <span className="mt-3 flex flex-wrap items-center gap-1.5">
                      <TicketSourceBadge kind={ticket.kind} />
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
                  <ChevronRight className="mt-2 shrink-0 text-slate-400" size={20} />
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-14 text-center">
              <Inbox className="mx-auto text-slate-400" size={32} />
              <p className="mt-3 text-sm font-black" style={{ color: "#081D3A" }}>
                Geen tickets gevonden
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Pas de filters aan of wacht op nieuwe klant- en personeelstickets.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent = "#087C79",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}
