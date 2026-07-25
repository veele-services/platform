import { SelectAdapter } from "@workspace/shared-ui";
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
type ReportDateFilter = "all" | "30d" | "90d" | "year";

const DATE_FILTER_OPTIONS: Array<{ value: ReportDateFilter; label: string }> = [
  { value: "all", label: "Alle datums" },
  { value: "30d", label: "Laatste 30 dagen" },
  { value: "90d", label: "Laatste 90 dagen" },
  { value: "year", label: "Dit jaar" },
];

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

function normalizeDateFilter(value?: string): ReportDateFilter {
  return value === "30d" || value === "90d" || value === "year" ? value : "all";
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
    report.assignmentCode,
    report.objectName,
    report.customerVisibleSummary,
    report.hoursWorked,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function matchesDateFilter(submittedAt: string, date: ReportDateFilter) {
  if (date === "all") return true;
  const submitted = new Date(submittedAt);
  const now = new Date();
  if (date === "year") return submitted.getFullYear() === now.getFullYear();
  const threshold = new Date(now);
  threshold.setDate(now.getDate() - (date === "30d" ? 30 : 90));
  return submitted >= threshold;
}

function filterReports({
  reports,
  query,
  filter,
  objectId,
  assignmentId,
  date,
}: {
  reports: CustomerReport[];
  query: string;
  filter: ReportFilter;
  objectId: string;
  assignmentId: string;
  date: ReportDateFilter;
}) {
  return reports.filter((report) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "hours"
        ? Boolean(report.hoursWorked)
        : Boolean(report.customerVisibleSummary));
    const matchesObject = objectId === "all" || report.objectId === objectId;
    const matchesAssignment =
      assignmentId === "all" || report.assignmentId === assignmentId;
    return (
      matchesFilter &&
      matchesObject &&
      matchesAssignment &&
      matchesDateFilter(report.submittedAt, date) &&
      matchesReportSearch(report, query)
    );
  });
}

function filterHref({
  query,
  filter,
  objectId,
  assignmentId,
  date,
  remove,
}: {
  query: string;
  filter: ReportFilter;
  objectId: string;
  assignmentId: string;
  date: ReportDateFilter;
  remove: "query" | "filter" | "object" | "assignment" | "date";
}) {
  const params = new URLSearchParams();
  if (remove !== "query" && query) params.set("q", query);
  if (remove !== "filter" && filter !== "all") params.set("filter", filter);
  if (remove !== "object" && objectId !== "all") params.set("object", objectId);
  if (remove !== "assignment" && assignmentId !== "all")
    params.set("assignment", assignmentId);
  if (remove !== "date" && date !== "all") params.set("date", date);
  const value = params.toString();
  return value ? `/rapporten?${value}` : "/rapporten";
}

function uniqueOptions(
  items: Array<{ id: string | null; label: string | null }>,
) {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.id && item.label && !map.has(item.id))
      map.set(item.id, item.label);
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "nl"));
}

function reportColumns(): Array<PortalDataColumn<CustomerReport>> {
  return [
    {
      key: "report",
      header: "Rapport",
      render: (report) => (
        <span className="block min-w-[18rem]">
          <span
            className="block truncate text-sm font-black"
            style={{ color: "var(--color-primary)" }}
          >
            {report.assignmentTitle}
          </span>
          <span
            className="mt-0.5 block text-xs font-semibold"
            style={{ color: "var(--color-muted-fg)" }}
          >
            {report.assignmentCode}{" "}
            {report.objectName ? `- ${report.objectName}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "date",
      header: "Datum",
      render: (report) => (
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          {formatDate(report.submittedAt)}
        </span>
      ),
    },
    {
      key: "hours",
      header: "Uren",
      render: (report) => (
        <span
          className="text-sm font-bold"
          style={{ color: "var(--color-primary)" }}
        >
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
        <PortalActionMenu
          label={`Acties voor rapport ${report.assignmentTitle}`}
        >
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
  searchParams: Promise<{
    q?: string;
    filter?: string;
    object?: string;
    assignment?: string;
    date?: string;
  }>;
}) {
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const filter = normalizeFilter(params.filter);
  const selectedObject = params.object?.trim() || "all";
  const selectedAssignment = params.assignment?.trim() || "all";
  const selectedDate = normalizeDateFilter(params.date);
  const reports = await getMyReports();
  const visibleReports = filterReports({
    reports,
    query,
    filter,
    objectId: selectedObject,
    assignmentId: selectedAssignment,
    date: selectedDate,
  });
  const objectOptions = uniqueOptions(
    reports.map((report) => ({
      id: report.objectId,
      label: report.objectName,
    })),
  );
  const assignmentOptions = uniqueOptions(
    reports.map((report) => ({
      id: report.assignmentId,
      label: `${report.assignmentCode} - ${report.assignmentTitle}`,
    })),
  );
  const selectedObjectLabel =
    objectOptions.find((option) => option.id === selectedObject)?.label ??
    "Object";
  const selectedAssignmentLabel =
    assignmentOptions.find((option) => option.id === selectedAssignment)
      ?.label ?? "Opdracht";
  const selectedDateLabel =
    DATE_FILTER_OPTIONS.find((option) => option.value === selectedDate)
      ?.label ?? "Alle datums";

  const activeFilters = [
    query
      ? {
          label: `Zoeken: ${query}`,
          href: filterHref({
            query,
            filter,
            objectId: selectedObject,
            assignmentId: selectedAssignment,
            date: selectedDate,
            remove: "query",
          }),
        }
      : null,
    filter !== "all"
      ? {
          label: reportFilterLabel(filter),
          href: filterHref({
            query,
            filter,
            objectId: selectedObject,
            assignmentId: selectedAssignment,
            date: selectedDate,
            remove: "filter",
          }),
        }
      : null,
    selectedObject !== "all"
      ? {
          label: `Object: ${selectedObjectLabel}`,
          href: filterHref({
            query,
            filter,
            objectId: selectedObject,
            assignmentId: selectedAssignment,
            date: selectedDate,
            remove: "object",
          }),
        }
      : null,
    selectedAssignment !== "all"
      ? {
          label: `Opdracht: ${selectedAssignmentLabel}`,
          href: filterHref({
            query,
            filter,
            objectId: selectedObject,
            assignmentId: selectedAssignment,
            date: selectedDate,
            remove: "assignment",
          }),
        }
      : null,
    selectedDate !== "all"
      ? {
          label: `Datum: ${selectedDateLabel}`,
          href: filterHref({
            query,
            filter,
            objectId: selectedObject,
            assignmentId: selectedAssignment,
            date: selectedDate,
            remove: "date",
          }),
        }
      : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <PortalPageShell
      title="Rapporten"
      subtitle="Goedgekeurde werkrapportages en bijbehorende informatie."
      status={{
        label: `${reports.length} rapporten`,
        tone: reports.length > 0 ? "accent" : "neutral",
      }}
    >
      <PortalToolbar
        resultLabel={`${visibleReports.length} van ${reports.length} rapporten`}
        activeFilters={
          <PortalActiveFilterChips
            filters={activeFilters}
            clearHref="/rapporten"
          />
        }
        actions={
          <PortalFilterSheet
            title="Rapportfilters"
            description="Filter op object, opdracht, rapporttype, datum of inhoud."
            activeCount={activeFilters.length}
          >
            <ReportFilterForm
              query={query}
              filter={filter}
              selectedObject={selectedObject}
              selectedAssignment={selectedAssignment}
              selectedDate={selectedDate}
              objectOptions={objectOptions}
              assignmentOptions={assignmentOptions}
            />
          </PortalFilterSheet>
        }
      >
        <form
          action="/rapporten"
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
        >
          <PortalToolbarSearch
            name="q"
            defaultValue={query}
            placeholder="Zoek rapport of opdracht"
          />
          <PortalToolbarSelect
            name="filter"
            label="Filter"
            defaultValue={filter}
          >
            <option value="all">Alle rapporten</option>
            <option value="hours">Met uren</option>
            <option value="summary">Met samenvatting</option>
          </PortalToolbarSelect>
          {selectedObject !== "all" ? (
            <input type="hidden" name="object" value={selectedObject} />
          ) : null}
          {selectedAssignment !== "all" ? (
            <input type="hidden" name="assignment" value={selectedAssignment} />
          ) : null}
          {selectedDate !== "all" ? (
            <input type="hidden" name="date" value={selectedDate} />
          ) : null}
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
          icon: (
            <FileCheck2 size={32} style={{ color: "var(--color-muted-fg)" }} />
          ),
          title:
            activeFilters.length > 0
              ? "Geen rapporten gevonden"
              : "Nog geen goedgekeurde rapporten",
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
                <h3
                  className="text-sm font-black leading-snug"
                  style={{ color: "var(--color-primary)" }}
                >
                  {report.assignmentTitle}
                </h3>
                <div
                  className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  <span>{report.assignmentCode}</span>
                  {report.objectName ? <span>{report.objectName}</span> : null}
                  <span>{formatDate(report.submittedAt)}</span>
                  <span>{formatHours(report.hoursWorked)}</span>
                </div>
                <p
                  className="mt-2 line-clamp-3 text-xs font-semibold leading-5"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {report.customerVisibleSummary}
                </p>
                <div
                  className="mt-3 flex items-center justify-between border-t pt-3"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <Link
                    href={`/opdrachten/${report.assignmentId}`}
                    className="text-xs font-black"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Opdracht bekijken
                  </Link>
                  <PortalActionMenu
                    label={`Acties voor rapport ${report.assignmentTitle}`}
                  >
                    <PortalActionMenuLink
                      href={`/opdrachten/${report.assignmentId}`}
                    >
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

function ReportFilterForm({
  query,
  filter,
  selectedObject,
  selectedAssignment,
  selectedDate,
  objectOptions,
  assignmentOptions,
}: {
  query: string;
  filter: ReportFilter;
  selectedObject: string;
  selectedAssignment: string;
  selectedDate: ReportDateFilter;
  objectOptions: Array<{ id: string; label: string }>;
  assignmentOptions: Array<{ id: string; label: string }>;
}) {
  return (
    <form action="/rapporten" className="space-y-4">
      <div>
        <label
          htmlFor="report-filter-query"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Zoeken
        </label>
        <input
          id="report-filter-query"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Rapport of opdracht"
          className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor="report-filter-kind"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Type
        </label>
        <SelectAdapter
          id="report-filter-kind"
          name="filter"
          defaultValue={filter}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle rapporten</option>
          <option value="hours">Met uren</option>
          <option value="summary">Met samenvatting</option>
        </SelectAdapter>
      </div>
      <div>
        <label
          htmlFor="report-filter-object"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Object
        </label>
        <SelectAdapter
          id="report-filter-object"
          name="object"
          defaultValue={selectedObject}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle objecten</option>
          {objectOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </SelectAdapter>
      </div>
      <div>
        <label
          htmlFor="report-filter-assignment"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Opdracht
        </label>
        <SelectAdapter
          id="report-filter-assignment"
          name="assignment"
          defaultValue={selectedAssignment}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle opdrachten</option>
          {assignmentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </SelectAdapter>
      </div>
      <div>
        <label
          htmlFor="report-filter-date"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Datum
        </label>
        <SelectAdapter
          id="report-filter-date"
          name="date"
          defaultValue={selectedDate}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          {DATE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectAdapter>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Link
          href="/rapporten"
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
