import { SelectAdapter } from "@/components/ui/select-adapter";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  Inbox,
  MessageSquare,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import {
  listTickets,
  type BackofficeTicketListItem,
} from "@/app/actions/tickets";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Button } from "@/components/ui/button";
import {
  TenantActiveFilters,
  TenantCommandBar,
  TenantConflictStrip,
  TenantFilterDrawer,
  TenantPageHeader,
  TenantPageShell,
  TenantToolbarSearch,
  TenantWorkbenchLayout,
  TenantWorkbenchPanel,
} from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";
import { backofficePath } from "@/lib/backoffice-paths";
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

function ticketsHref(params: {
  search?: string;
  status?: string;
  source?: string;
}) {
  const next = new URLSearchParams();
  if (params.search) next.set("search", params.search);
  if (params.status && params.status !== "all")
    next.set("status", params.status);
  if (params.source && params.source !== "all")
    next.set("source", params.source);
  const query = next.toString();
  return query ? `/tickets?${query}` : "/tickets";
}

function ticketStatusLabel(value: string) {
  return (
    TICKET_STATUS_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}

function ticketSourceLabel(value: string) {
  return (
    TICKET_KIND_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
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
  const previewTicket = result.rows[0] ?? null;
  const activeFilterCount = [
    search,
    status !== "all" ? status : "",
    source !== "all" ? source : "",
  ].filter(Boolean).length;

  return (
    <TenantPageShell size="wide">
      <TenantPageHeader
        title="Tickets"
        description="Inbox voor klant- en personeelstickets met preview, statusbewaking en snelle doorgang naar het gesprek."
        eyebrow="Tenant support"
        badges={
          result.unreadCount > 0 ? (
            <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-semibold text-white">
              {result.unreadCount} ongelezen
            </span>
          ) : null
        }
      />

      <TenantConflictStrip
        items={[
          {
            label: "Open tickets",
            value: result.openCount,
            description: "actieve gesprekken",
            tone: result.openCount > 0 ? "info" : "success",
          },
          {
            label: "Actie backoffice",
            value: result.waitingBackofficeCount,
            description: "wacht op backoffice",
            tone: result.waitingBackofficeCount > 0 ? "warning" : "success",
          },
          {
            label: "Ongelezen",
            value: result.unreadCount,
            description: "nieuwe berichten",
            tone: result.unreadCount > 0 ? "danger" : "success",
          },
          {
            label: "Inbox",
            value: result.rows.length,
            description: "tickets in deze selectie",
            tone: "neutral",
          },
        ]}
      />

      <TenantCommandBar
        title="Ticketinbox"
        description="Zoek direct in onderwerpen, aanvragers en berichtpreview; uitgebreide filters staan in de drawer."
        search={
          <form
            id="ticket-search-form"
            className="flex min-w-0 flex-1 gap-2"
            action={backofficePath("/tickets")}
          >
            <TenantToolbarSearch
              name="search"
              defaultValue={search}
              placeholder="Zoek op onderwerp, klant, medewerker..."
              wrapperClassName="sm:max-w-lg"
            />
            {status !== "all" && (
              <input type="hidden" name="status" value={status} />
            )}
            {source !== "all" && (
              <input type="hidden" name="source" value={source} />
            )}
            <Button type="submit" variant="outline" size="sm" className="h-10">
              <Search className="h-4 w-4" />
              Zoeken
            </Button>
          </form>
        }
        filters={
          <TicketFilterDrawer
            search={search}
            status={status}
            source={source}
            activeCount={activeFilterCount}
          />
        }
        activeFilters={
          <TenantActiveFilters
            filters={[
              ...(search
                ? [
                    {
                      id: "search",
                      label: "Zoek",
                      value: search,
                      href: ticketsHref({ status, source }),
                    },
                  ]
                : []),
              ...(status !== "all"
                ? [
                    {
                      id: "status",
                      label: "Status",
                      value: ticketStatusLabel(status),
                      href: ticketsHref({ search, source }),
                    },
                  ]
                : []),
              ...(source !== "all"
                ? [
                    {
                      id: "source",
                      label: "Bron",
                      value: ticketSourceLabel(source),
                      href: ticketsHref({ search, status }),
                    },
                  ]
                : []),
            ]}
            clearAll={<Link href="/tickets">Filters wissen</Link>}
          />
        }
      />

      <TenantWorkbenchLayout
        aside={<TicketPreviewPanel ticket={previewTicket} />}
      >
        <TenantWorkbenchPanel
          title="Inbox"
          description={`${result.rows.length} ticket${result.rows.length === 1 ? "" : "s"} in deze selectie`}
        >
          <div className="space-y-2 p-3">
            {result.rows.length > 0 ? (
              result.rows.map((ticket) => (
                <TicketInboxCard
                  key={`${ticket.kind}-${ticket.id}`}
                  ticket={ticket}
                />
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-14 text-center">
                <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold text-foreground">
                  Geen tickets gevonden
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pas de filters aan of wacht op nieuwe klant- en
                  personeelstickets.
                </p>
              </div>
            )}
          </div>
        </TenantWorkbenchPanel>
      </TenantWorkbenchLayout>
    </TenantPageShell>
  );
}

function TicketFilterDrawer({
  search,
  status,
  source,
  activeCount,
}: {
  search: string;
  status: string;
  source: string;
  activeCount: number;
}) {
  return (
    <TenantFilterDrawer
      title="Ticketfilters"
      description="Filter de inbox op bron en status zonder de huidige zoekterm kwijt te raken."
      activeCount={activeCount}
      trigger={
        <Button type="button" variant="outline" size="sm" className="h-10">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      }
      footer={
        <>
          <Button variant="outline" asChild>
            <Link href="/tickets">Resetten</Link>
          </Button>
          <Button type="submit" form="ticket-filter-form">
            Toepassen
          </Button>
        </>
      }
    >
      <form
        id="ticket-filter-form"
        action={backofficePath("/tickets")}
        className="space-y-4"
      >
        {search && <input type="hidden" name="search" value={search} />}
        <label className="grid gap-1.5 text-sm font-medium">
          Bron
          <SelectAdapter
            name="source"
            defaultValue={source}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {TICKET_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectAdapter>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Status
          <SelectAdapter
            name="status"
            defaultValue={status}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">Alle statussen</option>
            {TICKET_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectAdapter>
        </label>
      </form>
    </TenantFilterDrawer>
  );
}

function TicketInboxCard({ ticket }: { ticket: BackofficeTicketListItem }) {
  return (
    <Link
      href={`/tickets/${ticket.kind}/${ticket.id}`}
      className="block rounded-lg border border-border bg-card p-4 transition hover:border-primary hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <MessageSquare className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 text-sm font-semibold text-foreground">
                {ticket.subject}
              </span>
              <span className="mt-1 block text-xs font-medium text-muted-foreground">
                {ticket.requesterName}
                {ticket.requesterMeta ? ` - ${ticket.requesterMeta}` : ""}
              </span>
            </span>
            {ticket.unreadCount > 0 ? (
              <span className="rounded-full bg-red-500 px-2 py-1 text-[11px] font-semibold text-white">
                {ticket.unreadCount} nieuw
              </span>
            ) : null}
          </span>
          <span className="mt-2 block line-clamp-1 text-sm text-muted-foreground">
            {ticket.lastMessagePreview ?? "Nog geen berichtinhoud"}
          </span>
          <span className="mt-3 flex flex-wrap items-center gap-1.5">
            <TicketSourceBadge kind={ticket.kind} />
            <TicketStatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              {departmentLabel(ticket.department)}
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {formatDate(ticket.lastMessageAt)}
            </span>
          </span>
        </span>
        <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
    </Link>
  );
}

function TicketPreviewPanel({
  ticket,
}: {
  ticket: BackofficeTicketListItem | null;
}) {
  return (
    <TenantWorkbenchPanel
      title="Preview"
      description="Snelle context voordat u het volledige gesprek opent."
      className="xl:sticky xl:top-24"
    >
      {ticket ? (
        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <TicketSourceBadge kind={ticket.kind} />
              <TicketStatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
            <h2 className="text-lg font-semibold leading-7 text-foreground">
              {ticket.subject}
            </h2>
            <p className="text-sm text-muted-foreground">
              {ticket.requesterName}
              {ticket.requesterMeta ? ` - ${ticket.requesterMeta}` : ""}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Laatste bericht
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-foreground">
              {ticket.lastMessagePreview ?? "Nog geen berichtinhoud"}
            </p>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              {formatDate(ticket.lastMessageAt)}
            </p>
          </div>

          <dl className="grid gap-3 text-sm">
            <Meta label="Afdeling" value={departmentLabel(ticket.department)} />
            <Meta label="Aangemaakt" value={formatDate(ticket.createdAt)} />
            <Meta label="Ongelezen" value={`${ticket.unreadCount}`} />
          </dl>

          <Button asChild className="w-full">
            <Link href={`/tickets/${ticket.kind}/${ticket.id}`}>
              Open gesprek
            </Link>
          </Button>
        </div>
      ) : (
        <div className="px-4 py-12 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            Geen ticket geselecteerd.
          </p>
        </div>
      )}
    </TenantWorkbenchPanel>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
