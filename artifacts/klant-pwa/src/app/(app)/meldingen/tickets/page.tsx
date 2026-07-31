import { SelectAdapter } from "@workspace/shared-ui";
export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  BriefcaseBusiness,
  Building2,
  Inbox,
  MessageSquare,
  Receipt,
  Wrench,
} from "lucide-react";
import { getMyCustomerTickets } from "@/actions/tickets";
import {
  PortalActionMenu,
  PortalActionMenuLink,
} from "@/components/PortalActionMenu";
import { PortalFilterSheet } from "@/components/PortalFilterSheet";
import {
  PortalActiveFilterChips,
  PortalDataList,
  PortalPageShell,
  PortalToolbar,
  PortalToolbarSearch,
  PortalToolbarSelect,
  type PortalDataColumn,
} from "@/components/portal-ui";
import { NewTicketForm } from "./NewTicketForm";
import {
  departmentLabel,
  PriorityBadge,
  TicketStatusBadge,
} from "./TicketStatus";

type CustomerTicket = Awaited<ReturnType<typeof getMyCustomerTickets>>[number];
type TicketFilter =
  | "all"
  | "open"
  | "waiting_backoffice"
  | "waiting_customer"
  | "closed";
type TicketPriorityFilter = "all" | "urgent" | "high" | "normal" | "low";
type TicketContextFilter =
  | "all"
  | "object"
  | "assignment"
  | "invoice"
  | "general";
type TicketDateFilter = "all" | "today" | "week" | "month" | "older";

function ticketPrefillHref(params: Record<string, string>): string {
  return `/meldingen/tickets?${new URLSearchParams(params).toString()}`;
}

const TOPICS = [
  {
    key: "object",
    label: "Object",
    description: "Locatie, toegang, sleutels of contactgegevens.",
    Icon: Building2,
    href: ticketPrefillHref({
      context: "object",
      department: "service",
      subject: "Vraag over object",
      body: "Object:\n\nVraag:",
    }),
  },
  {
    key: "assignment",
    label: "Opdracht",
    description: "Planning, uitvoering, rapportage of werkbon.",
    Icon: BriefcaseBusiness,
    href: ticketPrefillHref({
      context: "assignment",
      department: "planning",
      subject: "Vraag over opdracht",
      body: "Opdracht:\n\nVraag:",
    }),
  },
  {
    key: "invoice",
    label: "Factuur",
    description: "Factuur, betaling, offerte of verzamelfactuur.",
    Icon: Receipt,
    href: ticketPrefillHref({
      context: "invoice",
      department: "finance",
      subject: "Vraag over factuur",
      body: "Factuur:\n\nVraag:",
    }),
  },
  {
    key: "general",
    label: "Algemeen",
    description: "Andere vraag voor support of backoffice.",
    Icon: Wrench,
    href: ticketPrefillHref({
      context: "general",
      department: "support",
      subject: "Algemene vraag",
      body: "Vraag:",
    }),
  },
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeQuery(value?: string): string {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeTextParam(value?: string): string {
  return value?.trim().slice(0, 500) ?? "";
}

function normalizeStatus(value?: string): TicketFilter {
  return ["open", "waiting_backoffice", "waiting_customer", "closed"].includes(
    value ?? "",
  )
    ? (value as TicketFilter)
    : "all";
}

function normalizePriority(value?: string): TicketPriorityFilter {
  return ["urgent", "high", "normal", "low"].includes(value ?? "")
    ? (value as TicketPriorityFilter)
    : "all";
}

function normalizeContext(value?: string): TicketContextFilter {
  return ["object", "assignment", "invoice", "general"].includes(value ?? "")
    ? (value as TicketContextFilter)
    : "all";
}

function normalizeDateFilter(value?: string): TicketDateFilter {
  return ["today", "week", "month", "older"].includes(value ?? "")
    ? (value as TicketDateFilter)
    : "all";
}

function ticketStatusLabel(value: TicketFilter) {
  const labels: Record<TicketFilter, string> = {
    all: "Alle tickets",
    open: "Open",
    waiting_backoffice: "Actie dienstverlener",
    waiting_customer: "Wacht op klant",
    closed: "Afgesloten",
  };
  return labels[value];
}

function ticketPriorityLabel(value: TicketPriorityFilter) {
  const labels: Record<TicketPriorityFilter, string> = {
    all: "Alle prioriteiten",
    urgent: "Urgent",
    high: "Hoog",
    normal: "Normaal",
    low: "Laag",
  };
  return labels[value];
}

function ticketContextLabel(value: TicketContextFilter) {
  const labels: Record<TicketContextFilter, string> = {
    all: "Alle contexten",
    object: "Object",
    assignment: "Opdracht",
    invoice: "Factuur",
    general: "Algemeen",
  };
  return labels[value];
}

function ticketDateLabel(value: TicketDateFilter) {
  const labels: Record<TicketDateFilter, string> = {
    all: "Alle datums",
    today: "Vandaag",
    week: "Laatste 7 dagen",
    month: "Laatste 30 dagen",
    older: "Ouder dan 30 dagen",
  };
  return labels[value];
}

function ticketSearchText(ticket: CustomerTicket) {
  return [
    ticket.subject,
    ticket.lastMessagePreview,
    departmentLabel(ticket.department),
    ticketStatusLabel(ticket.status),
    ticketPriorityLabel(ticket.priority),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesTicketSearch(ticket: CustomerTicket, query: string) {
  return !query || ticketSearchText(ticket).includes(query.toLowerCase());
}

function matchesTicketContext(
  ticket: CustomerTicket,
  context: TicketContextFilter,
): boolean {
  if (context === "all") return true;
  const text = ticketSearchText(ticket);

  if (context === "object") {
    return (
      text.includes("object") ||
      text.includes("locatie") ||
      ticket.department === "service"
    );
  }
  if (context === "assignment") {
    return (
      text.includes("opdracht") ||
      text.includes("werkbon") ||
      ticket.department === "planning"
    );
  }
  if (context === "invoice") {
    return (
      text.includes("factuur") ||
      text.includes("betaling") ||
      ticket.department === "finance"
    );
  }

  return (
    !matchesTicketContext(ticket, "object") &&
    !matchesTicketContext(ticket, "assignment") &&
    !matchesTicketContext(ticket, "invoice")
  );
}

function matchesTicketDate(ticket: CustomerTicket, date: TicketDateFilter) {
  if (date === "all") return true;

  const lastMessageAt = new Date(ticket.lastMessageAt).getTime();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const ageDays = (now - lastMessageAt) / day;

  if (date === "today") return ageDays < 1;
  if (date === "week") return ageDays < 7;
  if (date === "month") return ageDays < 30;
  return ageDays >= 30;
}

function filterTickets(
  tickets: CustomerTicket[],
  query: string,
  status: TicketFilter,
  priority: TicketPriorityFilter,
  context: TicketContextFilter,
  date: TicketDateFilter,
) {
  return tickets.filter((ticket) => {
    const matchesStatus = status === "all" || ticket.status === status;
    const matchesPriority = priority === "all" || ticket.priority === priority;
    return (
      matchesStatus &&
      matchesPriority &&
      matchesTicketContext(ticket, context) &&
      matchesTicketDate(ticket, date) &&
      matchesTicketSearch(ticket, query)
    );
  });
}

function filterHref({
  query,
  status,
  priority,
  context,
  date,
  remove,
}: {
  query: string;
  status: TicketFilter;
  priority: TicketPriorityFilter;
  context: TicketContextFilter;
  date: TicketDateFilter;
  remove: "query" | "status" | "priority" | "context" | "date";
}) {
  const params = new URLSearchParams();
  if (remove !== "query" && query) params.set("q", query);
  if (remove !== "status" && status !== "all") params.set("status", status);
  if (remove !== "priority" && priority !== "all")
    params.set("priority", priority);
  if (remove !== "context" && context !== "all") params.set("context", context);
  if (remove !== "date" && date !== "all") params.set("date", date);
  const value = params.toString();
  return value ? `/meldingen/tickets?${value}` : "/meldingen/tickets";
}

function ticketColumns(): Array<PortalDataColumn<CustomerTicket>> {
  return [
    {
      key: "subject",
      header: "Onderwerp",
      render: (ticket) => (
        <span className="block min-w-[18rem]">
          <span
            className="block truncate text-sm font-black"
            style={{ color: "var(--color-primary)" }}
          >
            {ticket.subject}
          </span>
          <span
            className="mt-0.5 block line-clamp-1 text-xs font-semibold"
            style={{ color: "var(--color-muted-fg)" }}
          >
            {ticket.lastMessagePreview ?? "Nog geen berichtinhoud"} -{" "}
            {formatDate(ticket.lastMessageAt)}
          </span>
        </span>
      ),
    },
    {
      key: "department",
      header: "Afdeling",
      render: (ticket) => (
        <span
          className="truncate text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          {departmentLabel(ticket.department)}
        </span>
      ),
    },
    {
      key: "priority",
      header: "Prioriteit",
      render: (ticket) => <PriorityBadge priority={ticket.priority} />,
    },
    {
      key: "status",
      header: "Status",
      render: (ticket) => <TicketStatusBadge status={ticket.status} />,
    },
    {
      key: "unread",
      header: "Nieuw",
      align: "right",
      render: (ticket) =>
        ticket.unreadCount > 0 ? (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-black text-white">
            {ticket.unreadCount}
          </span>
        ) : (
          <span className="text-xs font-semibold text-slate-400">-</span>
        ),
    },
    {
      key: "actions",
      header: "Acties",
      align: "right",
      render: (ticket) => (
        <PortalActionMenu label={`Acties voor ticket ${ticket.subject}`}>
          <PortalActionMenuLink href={`/meldingen/tickets/${ticket.id}`}>
            Ticket openen
          </PortalActionMenuLink>
        </PortalActionMenu>
      ),
    },
  ];
}

export default async function CustomerTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
    context?: string;
    date?: string;
    department?: string;
    subject?: string;
    body?: string;
  }>;
}) {
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const status = normalizeStatus(params.status);
  const priority = normalizePriority(params.priority);
  const context = normalizeContext(params.context);
  const date = normalizeDateFilter(params.date);
  const initialSubject = normalizeTextParam(params.subject);
  const initialBody = normalizeTextParam(params.body);
  const tickets = await getMyCustomerTickets();
  const visibleTickets = filterTickets(
    tickets,
    query,
    status,
    priority,
    context,
    date,
  );
  const unreadTotal = tickets.reduce(
    (sum, ticket) => sum + ticket.unreadCount,
    0,
  );
  const openTickets = tickets.filter(
    (ticket) => ticket.status !== "closed",
  ).length;

  const activeFilters = [
    query
      ? {
          label: `Zoeken: ${query}`,
          href: filterHref({
            query,
            status,
            priority,
            context,
            date,
            remove: "query",
          }),
        }
      : null,
    status !== "all"
      ? {
          label: ticketStatusLabel(status),
          href: filterHref({
            query,
            status,
            priority,
            context,
            date,
            remove: "status",
          }),
        }
      : null,
    priority !== "all"
      ? {
          label: `Prioriteit: ${ticketPriorityLabel(priority)}`,
          href: filterHref({
            query,
            status,
            priority,
            context,
            date,
            remove: "priority",
          }),
        }
      : null,
    context !== "all"
      ? {
          label: `Context: ${ticketContextLabel(context)}`,
          href: filterHref({
            query,
            status,
            priority,
            context,
            date,
            remove: "context",
          }),
        }
      : null,
    date !== "all"
      ? {
          label: ticketDateLabel(date),
          href: filterHref({
            query,
            status,
            priority,
            context,
            date,
            remove: "date",
          }),
        }
      : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <PortalPageShell
      title="Support"
      subtitle="Tickets, vragen en opvolging richting uw dienstverlener."
      status={{
        label: unreadTotal > 0 ? `${unreadTotal} nieuw` : `${openTickets} open`,
        tone: unreadTotal > 0 || openTickets > 0 ? "warning" : "accent",
      }}
      size="default"
    >
      <section className="grid gap-3 md:grid-cols-4">
        {TOPICS.map(({ key, label, description, Icon, href }) => (
          <Link
            key={key}
            href={href}
            className="rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            style={{
              borderColor:
                context === key ? "var(--color-accent)" : "var(--color-border)",
            }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8FBFA] text-[#087C79]">
              <Icon size={18} />
            </span>
            <h2
              className="mt-3 text-sm font-black"
              style={{ color: "var(--color-primary)" }}
            >
              {label}
            </h2>
            <p
              className="mt-1 text-xs font-semibold leading-5"
              style={{ color: "var(--color-secondary)" }}
            >
              {description}
            </p>
          </Link>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(18rem,1fr)_minmax(0,2fr)]">
        <section className="space-y-4">
          <PortalToolbar
            resultLabel={`${visibleTickets.length} van ${tickets.length} tickets`}
            activeFilters={
              <PortalActiveFilterChips
                filters={activeFilters}
                clearHref="/meldingen/tickets"
              />
            }
            actions={
              <PortalFilterSheet
                title="Ticketfilters"
                description="Filter op status, prioriteit, context en recente activiteit."
                activeCount={activeFilters.length}
              >
                <TicketFilterForm
                  query={query}
                  status={status}
                  priority={priority}
                  context={context}
                  date={date}
                />
              </PortalFilterSheet>
            }
          >
            <form
              action="/meldingen/tickets"
              className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
            >
              <PortalToolbarSearch
                name="q"
                defaultValue={query}
                placeholder="Zoek ticket of bericht"
              />
              <PortalToolbarSelect
                name="status"
                label="Status"
                defaultValue={status}
              >
                <option value="all">Alle tickets</option>
                <option value="open">Open</option>
                <option value="waiting_backoffice">Actie dienstverlener</option>
                <option value="waiting_customer">Wacht op klant</option>
                <option value="closed">Afgesloten</option>
              </PortalToolbarSelect>
              <input type="hidden" name="priority" value={priority} />
              <input type="hidden" name="context" value={context} />
              <input type="hidden" name="date" value={date} />
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-black text-white shadow-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                Toepassen
              </button>
            </form>
          </PortalToolbar>

          <div
            className="rounded-2xl border bg-white px-4 py-3 shadow-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            <p
              className="text-sm font-black"
              style={{ color: "var(--color-primary)" }}
            >
              Supportstatus
            </p>
            <p
              className="mt-1 text-sm font-semibold leading-6"
              style={{ color: "var(--color-secondary)" }}
            >
              Open tickets worden opgepakt door de juiste afdeling. Urgentie en
              onderwerp bepalen de volgorde. Bij een kritieke melding neemt ons
              serviceteam zo snel mogelijk contact met u op.
            </p>
          </div>

          <PortalDataList
            items={visibleTickets}
            columns={ticketColumns()}
            getItemKey={(ticket) => ticket.id}
            tableLabel="Supporttickets"
            emptyState={{
              icon: (
                <Inbox size={30} style={{ color: "var(--color-muted-fg)" }} />
              ),
              title:
                activeFilters.length > 0
                  ? "Geen tickets gevonden"
                  : "Geen tickets",
              description:
                activeFilters.length > 0
                  ? "Pas uw zoekopdracht of filters aan om de support inbox opnieuw te bekijken."
                  : "Kies bovenaan een onderwerp of start rechts een nieuw contactverzoek.",
            }}
            renderMobileCard={(ticket) => (
              <article
                className="rounded-2xl border bg-white p-4 shadow-sm"
                style={{
                  borderColor:
                    ticket.unreadCount > 0
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor:
                        ticket.unreadCount > 0 ? "#E8FBFA" : "#F1F5F9",
                      color: ticket.unreadCount > 0 ? "#009E9A" : "#64748B",
                    }}
                  >
                    <MessageSquare size={18} strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3
                          className="line-clamp-1 text-sm font-black"
                          style={{ color: "var(--color-primary)" }}
                        >
                          {ticket.subject}
                        </h3>
                        <p
                          className="mt-1 line-clamp-2 text-xs font-semibold"
                          style={{ color: "var(--color-muted-fg)" }}
                        >
                          {ticket.lastMessagePreview ??
                            "Nog geen berichtinhoud"}
                        </p>
                      </div>
                      {ticket.unreadCount > 0 ? (
                        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-black text-white">
                          {ticket.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <TicketStatusBadge status={ticket.status} />
                      <PriorityBadge priority={ticket.priority} />
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                        {departmentLabel(ticket.department)}
                      </span>
                      <span className="text-[11px] font-bold text-slate-400">
                        {formatDate(ticket.lastMessageAt)}
                      </span>
                    </div>
                    <div
                      className="mt-3 flex items-center justify-between border-t pt-3"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <Link
                        href={`/meldingen/tickets/${ticket.id}`}
                        className="text-xs font-black"
                        style={{ color: "var(--color-accent)" }}
                      >
                        Ticket openen
                      </Link>
                      <PortalActionMenu
                        label={`Acties voor ticket ${ticket.subject}`}
                      >
                        <PortalActionMenuLink
                          href={`/meldingen/tickets/${ticket.id}`}
                        >
                          Ticket openen
                        </PortalActionMenuLink>
                      </PortalActionMenu>
                    </div>
                  </div>
                </div>
              </article>
            )}
          />
        </section>

        <NewTicketForm
          initialDepartment={params.department}
          initialPriority={priority === "all" ? "normal" : priority}
          initialSubject={initialSubject}
          initialBody={initialBody}
          contextLabel={
            context === "all" ? undefined : ticketContextLabel(context)
          }
        />
      </div>
    </PortalPageShell>
  );
}

function TicketFilterForm({
  query,
  status,
  priority,
  context,
  date,
}: {
  query: string;
  status: TicketFilter;
  priority: TicketPriorityFilter;
  context: TicketContextFilter;
  date: TicketDateFilter;
}) {
  return (
    <form action="/meldingen/tickets" className="space-y-4">
      <div>
        <label
          htmlFor="ticket-filter-query"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Zoeken
        </label>
        <input
          id="ticket-filter-query"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Ticket of bericht"
          className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor="ticket-filter-status"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Status
        </label>
        <SelectAdapter
          id="ticket-filter-status"
          name="status"
          defaultValue={status}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle tickets</option>
          <option value="open">Open</option>
          <option value="waiting_backoffice">Actie dienstverlener</option>
          <option value="waiting_customer">Wacht op klant</option>
          <option value="closed">Afgesloten</option>
        </SelectAdapter>
      </div>
      <div>
        <label
          htmlFor="ticket-filter-priority"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Prioriteit
        </label>
        <SelectAdapter
          id="ticket-filter-priority"
          name="priority"
          defaultValue={priority}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle prioriteiten</option>
          <option value="urgent">Urgent</option>
          <option value="high">Hoog</option>
          <option value="normal">Normaal</option>
          <option value="low">Laag</option>
        </SelectAdapter>
      </div>
      <div>
        <label
          htmlFor="ticket-filter-context"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Context
        </label>
        <SelectAdapter
          id="ticket-filter-context"
          name="context"
          defaultValue={context}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle contexten</option>
          <option value="object">Object</option>
          <option value="assignment">Opdracht</option>
          <option value="invoice">Factuur</option>
          <option value="general">Algemeen</option>
        </SelectAdapter>
      </div>
      <div>
        <label
          htmlFor="ticket-filter-date"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Datum
        </label>
        <SelectAdapter
          id="ticket-filter-date"
          name="date"
          defaultValue={date}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle datums</option>
          <option value="today">Vandaag</option>
          <option value="week">Laatste 7 dagen</option>
          <option value="month">Laatste 30 dagen</option>
          <option value="older">Ouder dan 30 dagen</option>
        </SelectAdapter>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Link
          href="/meldingen/tickets"
          className="inline-flex h-10 items-center justify-center rounded-xl border text-sm font-black"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          Wissen
        </Link>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-black text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          Toepassen
        </button>
      </div>
    </form>
  );
}
