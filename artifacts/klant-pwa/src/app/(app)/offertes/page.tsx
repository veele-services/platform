import { SelectAdapter } from "@workspace/shared-ui";
export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  XCircle,
} from "lucide-react";
import { getMyQuotes } from "@/actions/quotes";
import {
  FinanceActionPanel,
  FinanceSummaryStrip,
} from "@/components/FinanceWorkspace";
import { FinanceNavigation } from "@/components/FinanceNavigation";
import { OfferteActieButtons } from "@/components/OfferteActieButtons";
import { OfferteRegelitems } from "@/components/OfferteRegelitems";
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
import { requireCustomerPortalFeature } from "@/lib/portal-features";

type CustomerQuote = Awaited<ReturnType<typeof getMyQuotes>>[number];
type QuoteFilter =
  | "all"
  | "action_required"
  | "sent"
  | "approved"
  | "rejected"
  | "expired";

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; Icon: typeof Clock }
> = {
  draft: { label: "Concept", bg: "#F1F5F9", color: "#64748B", Icon: Clock },
  sent: {
    label: "Ter beoordeling",
    bg: "#FEF3C7",
    color: "#92400E",
    Icon: Clock,
  },
  approved: {
    label: "Goedgekeurd",
    bg: "#DCFCE7",
    color: "#166534",
    Icon: CheckCircle2,
  },
  rejected: {
    label: "Afgewezen",
    bg: "#FEE2E2",
    color: "#991B1B",
    Icon: XCircle,
  },
  expired: {
    label: "Verlopen",
    bg: "#F1F5F9",
    color: "#64748B",
    Icon: AlertTriangle,
  },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(amount: string): string {
  return parseFloat(amount).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function quoteTotal(quotes: CustomerQuote[]): string {
  const total = quotes.reduce(
    (sum, quote) => sum + Number.parseFloat(quote.amount || "0"),
    0,
  );
  return formatAmount(total.toFixed(2));
}

function normalizeQuery(value?: string): string {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeFilter(value?: string): QuoteFilter {
  return [
    "action_required",
    "sent",
    "approved",
    "rejected",
    "expired",
  ].includes(value ?? "")
    ? (value as QuoteFilter)
    : "all";
}

function effectiveStatus(quote: CustomerQuote) {
  return quote.isExpired ? "expired" : quote.status;
}

function quoteFilterFor(quote: CustomerQuote): QuoteFilter {
  const status = effectiveStatus(quote);
  if (quote.assignmentStatus === "awaiting_approval" && status !== "expired")
    return "action_required";
  if (status === "approved" || status === "rejected" || status === "expired")
    return status;
  return "sent";
}

function quoteFilterLabel(value: QuoteFilter) {
  const labels: Record<QuoteFilter, string> = {
    all: "Alle offertes",
    action_required: "Actie vereist",
    sent: "Ter beoordeling",
    approved: "Goedgekeurd",
    rejected: "Afgewezen",
    expired: "Verlopen",
  };
  return labels[value];
}

function matchesQuoteSearch(quote: CustomerQuote, query: string) {
  if (!query) return true;
  const haystack = [
    quote.quoteNumber,
    quote.assignmentTitle,
    quote.amount,
    quoteFilterLabel(quoteFilterFor(quote)),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function filterQuotes(
  quotes: CustomerQuote[],
  query: string,
  filter: QuoteFilter,
) {
  return quotes.filter((quote) => {
    const matchesFilter = filter === "all" || quoteFilterFor(quote) === filter;
    return matchesFilter && matchesQuoteSearch(quote, query);
  });
}

function filterHref({
  query,
  filter,
  remove,
}: {
  query: string;
  filter: QuoteFilter;
  remove: "query" | "filter";
}) {
  const params = new URLSearchParams();
  if (remove !== "query" && query) params.set("q", query);
  if (remove !== "filter" && filter !== "all") params.set("filter", filter);
  const value = params.toString();
  return value ? `/offertes?${value}` : "/offertes";
}

function quoteColumns(): Array<PortalDataColumn<CustomerQuote>> {
  return [
    {
      key: "quote",
      header: "Offerte",
      render: (quote) => (
        <span
          className="font-mono text-xs font-semibold"
          style={{ color: "var(--color-primary)" }}
        >
          {quote.quoteNumber}
        </span>
      ),
    },
    {
      key: "assignment",
      header: "Opdracht",
      render: (quote) => (
        <span className="block min-w-[18rem]">
          <span
            className="block truncate text-sm font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {quote.assignmentTitle}
          </span>
          {quote.assignmentStatus === "awaiting_approval" &&
          !quote.isExpired ? (
            <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              Actie vereist
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Bedrag",
      render: (quote) => (
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-primary)" }}
        >
          {formatAmount(quote.amount)}
        </span>
      ),
    },
    {
      key: "validity",
      header: "Geldig t/m",
      render: (quote) => (
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          {formatDate(quote.validityDate)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (quote) => <QuoteStatusBadge quote={quote} />,
    },
    {
      key: "actions",
      header: "Acties",
      align: "right",
      render: (quote) => (
        <PortalActionMenu label={`Acties voor offerte ${quote.quoteNumber}`}>
          <PortalActionMenuLink href={`/api/offerte/${quote.id}/pdf`} external>
            PDF downloaden
          </PortalActionMenuLink>
          <PortalActionMenuLink href={`/opdrachten/${quote.assignmentId}`}>
            Opdracht bekijken
          </PortalActionMenuLink>
          {quote.assignmentStatus === "awaiting_approval" &&
          !quote.isExpired ? (
            <PortalActionMenuLink href="/offertes?filter=action_required">
              Acties tonen
            </PortalActionMenuLink>
          ) : null}
        </PortalActionMenu>
      ),
    },
  ];
}

export default async function OffertesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  await requireCustomerPortalFeature("finance");
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const filter = normalizeFilter(params.filter);
  const quotes = await getMyQuotes();
  const visibleQuotes = filterQuotes(quotes, query, filter);
  const actionRequired = quotes.filter(
    (quote) =>
      quote.assignmentStatus === "awaiting_approval" && !quote.isExpired,
  );
  const sentQuotes = quotes.filter((quote) => quoteFilterFor(quote) === "sent");
  const approvedQuotes = quotes.filter(
    (quote) => quoteFilterFor(quote) === "approved",
  );
  const expiredQuotes = quotes.filter(
    (quote) => quoteFilterFor(quote) === "expired",
  );

  const activeFilters = [
    query
      ? {
          label: `Zoeken: ${query}`,
          href: filterHref({ query, filter, remove: "query" }),
        }
      : null,
    filter !== "all"
      ? {
          label: quoteFilterLabel(filter),
          href: filterHref({ query, filter, remove: "filter" }),
        }
      : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <PortalPageShell
      title="Offertes"
      subtitle="Controleer en keur offertes digitaal goed of af."
      status={{
        label:
          actionRequired.length > 0
            ? `${actionRequired.length} actie vereist`
            : `${quotes.length} offertes`,
        tone: actionRequired.length > 0 ? "warning" : "accent",
      }}
    >
      <FinanceNavigation />
      <FinanceSummaryStrip
        items={[
          {
            label: "Actie vereist",
            value: `${actionRequired.length}`,
            description: `${quoteTotal(actionRequired)} wacht op akkoord of afwijzing.`,
            icon: <AlertTriangle size={18} />,
            tone: actionRequired.length > 0 ? "warning" : "neutral",
          },
          {
            label: "Ter beoordeling",
            value: `${sentQuotes.length}`,
            description: `${quoteTotal(sentQuotes)} aan open offertes.`,
            icon: <Clock size={18} />,
            tone: sentQuotes.length > 0 ? "accent" : "neutral",
          },
          {
            label: "Goedgekeurd",
            value: `${approvedQuotes.length}`,
            description: `${quoteTotal(approvedQuotes)} akkoord gegeven.`,
            icon: <CheckCircle2 size={18} />,
            tone: approvedQuotes.length > 0 ? "success" : "neutral",
          },
          {
            label: "Verlopen",
            value: `${expiredQuotes.length}`,
            description: `${quoteTotal(expiredQuotes)} is niet meer geldig.`,
            icon: <XCircle size={18} />,
            tone: expiredQuotes.length > 0 ? "danger" : "neutral",
          },
        ]}
      />

      <PortalToolbar
        resultLabel={`${visibleQuotes.length} van ${quotes.length} offertes`}
        activeFilters={
          <PortalActiveFilterChips
            filters={activeFilters}
            clearHref="/offertes"
          />
        }
        actions={
          <PortalFilterSheet
            title="Offertefilters"
            description="Filter op status, offertnummer of opdracht."
            activeCount={activeFilters.length}
          >
            <QuoteFilterForm query={query} filter={filter} />
          </PortalFilterSheet>
        }
      >
        <form
          action="/offertes"
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
        >
          <PortalToolbarSearch
            name="q"
            defaultValue={query}
            placeholder="Zoek offerte of opdracht"
          />
          <PortalToolbarSelect
            name="filter"
            label="Status"
            defaultValue={filter}
          >
            <option value="all">Alle offertes</option>
            <option value="action_required">Actie vereist</option>
            <option value="sent">Ter beoordeling</option>
            <option value="approved">Goedgekeurd</option>
            <option value="rejected">Afgewezen</option>
            <option value="expired">Verlopen</option>
          </PortalToolbarSelect>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent-accessible)" }}
          >
            Toepassen
          </button>
        </form>
      </PortalToolbar>

      {actionRequired.length > 0 ? (
        <FinanceActionPanel
          eyebrow="Actie nodig"
          title="Te beoordelen offertes"
          description="Controleer de belangrijkste details en keur direct goed of wijs af."
          tone="warning"
          action={
            <Link
              href="/offertes?filter=action_required"
              className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: "var(--color-accent-accessible)" }}
            >
              Alle acties tonen
            </Link>
          }
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {actionRequired.map((quote) => (
              <article
                key={quote.id}
                className="rounded-2xl border bg-white p-4 shadow-sm"
                style={{ borderColor: "#FDE68A" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="font-mono text-xs font-semibold"
                      style={{ color: "var(--color-muted-fg)" }}
                    >
                      {quote.quoteNumber}
                    </p>
                    <h2
                      className="mt-1 truncate text-sm font-semibold"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {quote.assignmentTitle}
                    </h2>
                    <p
                      className="mt-1 text-sm font-semibold"
                      style={{ color: "var(--color-secondary)" }}
                    >
                      {formatAmount(quote.amount)}
                      {quote.validityDate
                        ? ` - geldig t/m ${formatDate(quote.validityDate)}`
                        : ""}
                    </p>
                  </div>
                  <QuoteStatusBadge quote={quote} />
                </div>
                <OfferteRegelitems
                  lineItems={quote.lineItems}
                  amount={quote.amount}
                />
                <Link
                  href={`/api/offerte/${quote.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-primary)",
                  }}
                >
                  <Download size={16} />
                  PDF downloaden
                </Link>
                <OfferteActieButtons
                  assignmentId={quote.assignmentId}
                  title={quote.assignmentTitle}
                />
              </article>
            ))}
          </div>
        </FinanceActionPanel>
      ) : null}

      <PortalDataList
        items={visibleQuotes}
        columns={quoteColumns()}
        getItemKey={(quote) => quote.id}
        tableLabel="Offertes"
        emptyState={{
          icon: (
            <FileText size={32} style={{ color: "var(--color-muted-fg)" }} />
          ),
          title:
            activeFilters.length > 0
              ? "Geen offertes gevonden"
              : "Nog geen offertes",
          description:
            activeFilters.length > 0
              ? "Pas uw zoekopdracht of filters aan om de offertes opnieuw te bekijken."
              : "Offertes verschijnen hier zodra ze zijn aangemaakt.",
        }}
        renderMobileCard={(quote) => (
          <article className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-xs font-semibold"
                  style={{
                    backgroundColor: "var(--color-muted)",
                    color: "var(--color-secondary)",
                  }}
                >
                  {quote.quoteNumber}
                </span>
                <h3
                  className="mt-2 truncate font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  {quote.assignmentTitle}
                </h3>
                <p
                  className="mt-1 text-2xl font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  {formatAmount(quote.amount)}
                </p>
                <p
                  className="mt-0.5 text-xs font-semibold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  Geldig t/m: {formatDate(quote.validityDate)}
                </p>
              </div>
              <QuoteStatusBadge quote={quote} />
            </div>
            <OfferteRegelitems
              lineItems={quote.lineItems}
              amount={quote.amount}
            />
            {quote.assignmentStatus === "awaiting_approval" &&
            !quote.isExpired ? (
              <OfferteActieButtons
                assignmentId={quote.assignmentId}
                title={quote.assignmentTitle}
              />
            ) : null}
            <div className="mt-3 flex justify-end">
              <PortalActionMenu
                label={`Acties voor offerte ${quote.quoteNumber}`}
              >
                <PortalActionMenuLink
                  href={`/api/offerte/${quote.id}/pdf`}
                  external
                >
                  PDF downloaden
                </PortalActionMenuLink>
                <PortalActionMenuLink
                  href={`/opdrachten/${quote.assignmentId}`}
                >
                  Opdracht bekijken
                </PortalActionMenuLink>
              </PortalActionMenu>
            </div>
          </article>
        )}
      />
    </PortalPageShell>
  );
}

function QuoteFilterForm({
  query,
  filter,
}: {
  query: string;
  filter: QuoteFilter;
}) {
  return (
    <form action="/offertes" className="space-y-4">
      <div>
        <label
          htmlFor="quote-filter-query"
          className="text-xs font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          Zoeken
        </label>
        <input
          id="quote-filter-query"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Offertenummer of opdracht"
          className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor="quote-filter-status"
          className="text-xs font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          Status
        </label>
        <SelectAdapter
          id="quote-filter-status"
          name="filter"
          defaultValue={filter}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle offertes</option>
          <option value="action_required">Actie vereist</option>
          <option value="sent">Ter beoordeling</option>
          <option value="approved">Goedgekeurd</option>
          <option value="rejected">Afgewezen</option>
          <option value="expired">Verlopen</option>
        </SelectAdapter>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Link
          href="/offertes"
          className="inline-flex h-10 items-center justify-center rounded-xl border text-sm font-semibold"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          Wissen
        </Link>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--color-accent-accessible)" }}
        >
          Toepassen
        </button>
      </div>
    </form>
  );
}

function QuoteStatusBadge({ quote }: { quote: CustomerQuote }) {
  const status = effectiveStatus(quote);
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const StatusIcon = config.Icon;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      <StatusIcon size={11} />
      {config.label}
    </span>
  );
}
