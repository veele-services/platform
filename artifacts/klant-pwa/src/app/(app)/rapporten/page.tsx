export const dynamic = "force-dynamic";

import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { getMyReports } from "@/actions/reports";
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

type CustomerReport = Awaited<ReturnType<typeof getMyReports>>[number];
type ReportFilter = "all" | "hours" | "summary";

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatHours(value: string | null) {
  return value ? `${parseFloat(value).toLocaleString("nl-NL")} uur` : "-";
}

function normalizeQuery(value?: string): string {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeFilter(value?: string): ReportFilter {
  return value === "hours" || value === "summary" ? value : "all";
}

function reportFilterLabel(value: ReportFilter) {
  const labels: Record<ReportFilter, string> = {
    all: "Alle rapporten",
    hours: "Met uren",
    summary: "Met samenvatting",
  };
  return labels[value];
}

function matchesReportSearch(report: CustomerReport, query: string) {
  if (!query) return true;
  const haystack = [
    report.assignmentTitle,
    report.customerVisibleSummary,
    report.hoursWorked,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function filterReports(reports: CustomerReport[], query: string, filter: ReportFilter) {
  return reports.filter((report) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "hours" ? Boolean(report.hoursWorked) : Boolean(report.customerVisibleSummary));
    return matchesFilter && matchesReportSearch(report, query);
  });
}

function filterHref({
  query,
  filter,
  remove,
}: {
  query: string;
  filter: ReportFilter;
  remove: "query" | "filter";
}) {
  const params = new URLSearchParams();
  if (remove !== "query" && query) params.set("q", query);
  if (remove !== "filter" && filter !== "all") params.set("filter", filter);
  const value = params.toString();
  return value ? `/rapporten?${value}` : "/rapporten";
}

function reportColumns(): Array<PortalDataColumn<CustomerReport>> {
  return [
    {
      key: "report",
      header: "Rapport",
      render: (report) => (
        <span className="block min-w-[18rem]">
          <span className="block truncate text-sm font-black" style={{ color: "var(--color-primary)" }}>
            {report.assignmentTitle}
          </span>
          <span className="mt-0.5 block text-xs font-semibold" style={{ color: "var(--color-muted-fg)" }}>
            Goedgekeurd werkrapport
          </span>
        </span>
      ),
    },
    {
      key: "date",
      header: "Datum",
      render: (report) => (
        <span className="text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
          {formatDate(report.submittedAt)}
        </span>
      ),
    },
    {
      key: "hours",
      header: "Uren",
      render: (report) => (
        <span className="text-sm font-bold" style={{ color: "var(--color-primary)" }}>
          {formatHours(report.hoursWorked)}
        </span>
      ),
    },
    {
      key: "summary",
      header: "Samenvatting",
      render: (report) => (
        <span
          className="line-clamp-2 block min-w-[18rem] text-sm font-semibold leading-5"
          style={{ color: "var(--color-secondary)" }}
        >
          {report.customerVisibleSummary}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Acties",
      align: "right",
      render: (report) => (
        <PortalActionMenu label={`Acties voor rapport ${report.assignmentTitle}`}>
          <PortalActionMenuLink href={`/opdrachten/${report.assignmentId}`}>
            Opdracht bekijken
          </PortalActionMenuLink>
        </PortalActionMenu>
      ),
    },
  ];
}

export default async function RapportenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const filter = normalizeFilter(params.filter);
  const reports = await getMyReports();
  const visibleReports = filterReports(reports, query, filter);

  const activeFilters = [
    query
      ? {
          label: `Zoeken: ${query}`,
          href: filterHref({ query, filter, remove: "query" }),
        }
      : null,
    filter !== "all"
      ? {
          label: reportFilterLabel(filter),
          href: filterHref({ query, filter, remove: "filter" }),
        }
      : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <PortalPageShell
      title="Rapporten"
      subtitle="Goedgekeurde werkrapportages en bijbehorende informatie."
      status={{ label: `${reports.length} rapporten`, tone: reports.length > 0 ? "accent" : "neutral" }}
    >
      <PortalToolbar
        resultLabel={`${visibleReports.length} van ${reports.length} rapporten`}
        activeFilters={<PortalActiveFilterChips filters={activeFilters} clearHref="/rapporten" />}
        actions={
          <PortalFilterSheet
            title="Rapportfilters"
            description="Filter op titel, samenvatting of urengegevens."
            activeCount={activeFilters.length}
          >
            <ReportFilterForm query={query} filter={filter} />
          </PortalFilterSheet>
        }
      >
        <form action="/rapporten" className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
          <PortalToolbarSearch
            name="q"
            defaultValue={query}
            placeholder="Zoek rapport of opdracht"
          />
          <PortalToolbarSelect name="filter" label="Filter" defaultValue={filter}>
            <option value="all">Alle rapporten</option>
            <option value="hours">Met uren</option>
            <option value="summary">Met samenvatting</option>
          </PortalToolbarSelect>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-black text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Toepassen
          </button>
        </form>
      </PortalToolbar>

      <PortalDataList
        items={visibleReports}
        columns={reportColumns()}
        getItemKey={(report) => report.id}
        tableLabel="Rapporten"
        emptyState={{
          icon: <FileCheck2 size={32} style={{ color: "var(--color-muted-fg)" }} />,
          title: activeFilters.length > 0 ? "Geen rapporten gevonden" : "Nog geen goedgekeurde rapporten",
          description:
            activeFilters.length > 0
              ? "Pas uw zoekopdracht of filters aan om de rapporten opnieuw te bekijken."
              : "Rapporten verschijnen hier zodra ze zijn goedgekeurd.",
        }}
        renderMobileCard={(report) => (
          <article className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <FileCheck2 size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black leading-snug" style={{ color: "var(--color-primary)" }}>
                  {report.assignmentTitle}
                </h3>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
                  <span>{formatDate(report.submittedAt)}</span>
                  <span>{formatHours(report.hoursWorked)}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-xs font-semibold leading-5" style={{ color: "var(--color-secondary)" }}>
                  {report.customerVisibleSummary}
                </p>
                <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
                  <Link
                    href={`/opdrachten/${report.assignmentId}`}
                    className="text-xs font-black"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Opdracht bekijken
                  </Link>
                  <PortalActionMenu label={`Acties voor rapport ${report.assignmentTitle}`}>
                    <PortalActionMenuLink href={`/opdrachten/${report.assignmentId}`}>
                      Opdracht bekijken
                    </PortalActionMenuLink>
                  </PortalActionMenu>
                </div>
              </div>
            </div>
          </article>
        )}
      />
    </PortalPageShell>
  );
}

function ReportFilterForm({ query, filter }: { query: string; filter: ReportFilter }) {
  return (
    <form action="/rapporten" className="space-y-4">
      <div>
        <label htmlFor="report-filter-query" className="text-xs font-black" style={{ color: "var(--color-secondary)" }}>
          Zoeken
        </label>
        <input
          id="report-filter-query"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Rapport of opdracht"
          className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </div>
      <div>
        <label htmlFor="report-filter-kind" className="text-xs font-black" style={{ color: "var(--color-secondary)" }}>
          Filter
        </label>
        <select
          id="report-filter-kind"
          name="filter"
          defaultValue={filter}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        >
          <option value="all">Alle rapporten</option>
          <option value="hours">Met uren</option>
          <option value="summary">Met samenvatting</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Link
          href="/rapporten"
          className="inline-flex h-10 items-center justify-center rounded-xl border text-sm font-black"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
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
