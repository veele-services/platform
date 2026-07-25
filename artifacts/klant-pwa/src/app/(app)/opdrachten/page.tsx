import { SelectAdapter } from "@workspace/shared-ui";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { ClipboardList, Download, FileText, PlusCircle } from "lucide-react";
import type { QuoteStatus } from "@workspace/db";
import { getMyAssignments } from "@/actions/assignments";
import { STATUS_COLOR, STATUS_LABEL } from "@/types/assignments";
import { OfferteActieButtons } from "@/components/OfferteActieButtons";
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

type CustomerAssignment = Awaited<ReturnType<typeof getMyAssignments>>[number];
type AssignmentFilter =
  | "all"
  | "action_required"
  | "active"
  | "open"
  | "history";

const ACTIVE_STATUSES = new Set([
  "scheduled",
  "seen",
  "en_route",
  "in_progress",
  "plannable",
]);
const OPEN_STATUSES = new Set([
  "requested",
  "review",
  "quote_preparation",
  "approved",
]);

const QUOTE_STATUS_BADGE: Partial<
  Record<QuoteStatus, { label: string; bg: string; color: string }>
> = {
  sent: { label: "Offerte verstuurd", bg: "#FEF9C3", color: "#A16207" },
  approved: { label: "Offerte geaccepteerd", bg: "#DCFCE7", color: "#15803D" },
  rejected: { label: "Offerte afgewezen", bg: "#FEE2E2", color: "#B91C1C" },
  expired: { label: "Offerte verlopen", bg: "#F1F5F9", color: "#64748B" },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatActualTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function AssignmentTiming({ assignment }: { assignment: CustomerAssignment }) {
  const actualWindow = [
    formatActualTime(assignment.actualStartedAt),
    formatActualTime(assignment.actualCompletedAt),
  ]
    .filter(Boolean)
    .join(" - ");
  const plannedWindow = [assignment.scheduledStart, assignment.scheduledEnd]
    .filter(Boolean)
    .map((value) => value?.slice(0, 5))
    .join(" - ");

  if (!assignment.scheduledDate) {
    return (
      <span style={{ color: "var(--color-muted-fg)" }}>Nog niet gepland</span>
    );
  }

  return (
    <span
      className="block min-w-[10rem] text-sm font-semibold"
      style={{ color: "var(--color-primary)" }}
    >
      <span className="block">{formatDate(assignment.scheduledDate)}</span>
      {actualWindow ? (
        <>
          <span className="block font-black">Werkelijk {actualWindow}</span>
          <span
            className="block text-xs"
            style={{ color: "var(--color-muted-fg)" }}
          >
            Gepland {plannedWindow || "tijd onbekend"}
          </span>
        </>
      ) : (
        <span className="block">{plannedWindow || "Tijd nog niet bekend"}</span>
      )}
    </span>
  );
}

function formatAmount(amount: string | null): string {
  if (!amount) return "";
  return parseFloat(amount).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

function normalizeQuery(value?: string): string {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeFilter(value?: string): AssignmentFilter {
  return ["action_required", "active", "open", "history"].includes(value ?? "")
    ? (value as AssignmentFilter)
    : "all";
}

function assignmentFilterFor(assignment: CustomerAssignment): AssignmentFilter {
  if (assignment.status === "awaiting_approval") return "action_required";
  if (ACTIVE_STATUSES.has(assignment.status)) return "active";
  if (OPEN_STATUSES.has(assignment.status)) return "open";
  return "history";
}

function assignmentFilterLabel(value: AssignmentFilter) {
  const labels: Record<AssignmentFilter, string> = {
    all: "Alle opdrachten",
    action_required: "Actie vereist",
    active: "In uitvoering",
    open: "Lopende aanvragen",
    history: "Historie",
  };
  return labels[value];
}

function matchesAssignmentSearch(
  assignment: CustomerAssignment,
  query: string,
) {
  if (!query) return true;
  const haystack = [
    assignment.code,
    assignment.title,
    assignment.objectName,
    assignment.objectCity,
    assignment.quoteNumber,
    STATUS_LABEL[assignment.status] ?? assignment.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function filterAssignments(
  assignments: CustomerAssignment[],
  query: string,
  filter: AssignmentFilter,
) {
  return assignments.filter((assignment) => {
    const matchesFilter =
      filter === "all" || assignmentFilterFor(assignment) === filter;
    return matchesFilter && matchesAssignmentSearch(assignment, query);
  });
}

function filterHref({
  query,
  filter,
  remove,
}: {
  query: string;
  filter: AssignmentFilter;
  remove: "query" | "filter";
}) {
  const params = new URLSearchParams();
  if (remove !== "query" && query) params.set("q", query);
  if (remove !== "filter" && filter !== "all") params.set("filter", filter);
  const value = params.toString();
  return value ? `/opdrachten?${value}` : "/opdrachten";
}

function assignmentColumns(): Array<PortalDataColumn<CustomerAssignment>> {
  return [
    {
      key: "code",
      header: "Werkbon",
      render: (assignment) => (
        <span
          className="font-mono text-xs font-black"
          style={{ color: "var(--color-primary)" }}
        >
          {assignment.code}
        </span>
      ),
    },
    {
      key: "assignment",
      header: "Opdracht",
      render: (assignment) => (
        <span className="block min-w-[18rem]">
          <span
            className="block truncate text-sm font-black"
            style={{ color: "var(--color-primary)" }}
          >
            {assignment.title}
          </span>
          <span
            className="mt-0.5 block truncate text-xs font-semibold"
            style={{ color: "var(--color-secondary)" }}
          >
            {assignment.objectName ?? "Geen object"}
            {assignment.objectCity ? ` - ${assignment.objectCity}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "planning",
      header: "Planning",
      render: (assignment) => <AssignmentTiming assignment={assignment} />,
    },
    {
      key: "quote",
      header: "Offerte",
      render: (assignment) => <QuoteCell assignment={assignment} />,
    },
    {
      key: "status",
      header: "Status",
      render: (assignment) => <AssignmentStatusBadge assignment={assignment} />,
    },
    {
      key: "actions",
      header: "Acties",
      align: "right",
      render: (assignment) => (
        <PortalActionMenu label={`Acties voor ${assignment.title}`}>
          <PortalActionMenuLink href={`/opdrachten/${assignment.id}`}>
            Details bekijken
          </PortalActionMenuLink>
          {assignment.quoteId ? (
            <PortalActionMenuLink
              href={`/api/offerte/${assignment.quoteId}/pdf`}
              external
            >
              Offerte PDF downloaden
            </PortalActionMenuLink>
          ) : null}
          {assignment.status === "awaiting_approval" ? (
            <PortalActionMenuLink href="/offertes">
              Naar offertes
            </PortalActionMenuLink>
          ) : null}
        </PortalActionMenu>
      ),
    },
  ];
}

export default async function OpdrachtenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const filter = normalizeFilter(params.filter);
  const assignments = await getMyAssignments();
  const visibleAssignments = filterAssignments(assignments, query, filter);
  const actionRequired = assignments.filter(
    (assignment) => assignment.status === "awaiting_approval",
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
          label: assignmentFilterLabel(filter),
          href: filterHref({ query, filter, remove: "filter" }),
        }
      : null,
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <PortalPageShell
      title="Opdrachten"
      subtitle="Aanvragen, geplande opdrachten en afgeronde werkbonnen."
      status={{
        label:
          actionRequired.length > 0
            ? `${actionRequired.length} actie vereist`
            : `${assignments.length} opdrachten`,
        tone: actionRequired.length > 0 ? "warning" : "accent",
      }}
      primaryAction={{
        label: "Opdracht aanvragen",
        href: "/opdrachten/aanvragen",
      }}
    >
      <PortalToolbar
        resultLabel={`${visibleAssignments.length} van ${assignments.length} opdrachten`}
        activeFilters={
          <PortalActiveFilterChips
            filters={activeFilters}
            clearHref="/opdrachten"
          />
        }
        actions={
          <PortalFilterSheet
            title="Opdrachtfilters"
            description="Filter op statusgroep, werkbonnummer, object of titel."
            activeCount={activeFilters.length}
          >
            <AssignmentFilterForm query={query} filter={filter} />
          </PortalFilterSheet>
        }
      >
        <form
          action="/opdrachten"
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
        >
          <PortalToolbarSearch
            name="q"
            defaultValue={query}
            placeholder="Zoek opdracht, werkbon of object"
          />
          <PortalToolbarSelect
            name="filter"
            label="Statusgroep"
            defaultValue={filter}
          >
            <option value="all">Alle opdrachten</option>
            <option value="action_required">Actie vereist</option>
            <option value="active">In uitvoering</option>
            <option value="open">Lopende aanvragen</option>
            <option value="history">Historie</option>
          </PortalToolbarSelect>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-black text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent-accessible)" }}
          >
            Toepassen
          </button>
        </form>
      </PortalToolbar>

      {actionRequired.length > 0 ? (
        <section
          className="rounded-2xl border bg-white p-4 shadow-sm"
          style={{ borderColor: "#FDE68A" }}
        >
          <div className="mb-3 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <FileText size={18} />
            </span>
            <div>
              <h2
                className="text-base font-black"
                style={{ color: "var(--color-primary)" }}
              >
                Offertes met actie vereist
              </h2>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--color-secondary)" }}
              >
                Controleer de offerte en keur deze digitaal goed of af.
              </p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {actionRequired.map((assignment) => (
              <article
                key={assignment.id}
                className="rounded-2xl border p-4"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="font-mono text-xs font-black"
                      style={{ color: "var(--color-muted-fg)" }}
                    >
                      {assignment.quoteNumber ?? assignment.code}
                    </p>
                    <h3
                      className="mt-1 truncate text-sm font-black"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {assignment.title}
                    </h3>
                    <p
                      className="mt-1 text-sm font-semibold"
                      style={{ color: "var(--color-secondary)" }}
                    >
                      {assignment.quoteAmount
                        ? formatAmount(assignment.quoteAmount)
                        : "Offertebedrag volgt"}
                      {assignment.quoteValidityDate
                        ? ` - geldig t/m ${formatDate(assignment.quoteValidityDate)}`
                        : ""}
                    </p>
                  </div>
                  <AssignmentStatusBadge assignment={assignment} />
                </div>
                {assignment.quoteId ? (
                  <Link
                    href={`/api/offerte/${assignment.quoteId}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black shadow-sm"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-primary)",
                    }}
                  >
                    <Download size={16} />
                    Offerte PDF
                  </Link>
                ) : null}
                <OfferteActieButtons
                  assignmentId={assignment.id}
                  title={assignment.title}
                />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <PortalDataList
        items={visibleAssignments}
        columns={assignmentColumns()}
        getItemKey={(assignment) => assignment.id}
        tableLabel="Opdrachten"
        emptyState={{
          icon: (
            <ClipboardList
              size={32}
              style={{ color: "var(--color-muted-fg)" }}
            />
          ),
          title:
            activeFilters.length > 0
              ? "Geen opdrachten gevonden"
              : "Nog geen opdrachten",
          description:
            activeFilters.length > 0
              ? "Pas uw zoekopdracht of filters aan om de opdrachtlijst opnieuw te bekijken."
              : "Dien een nieuwe aanvraag in om te beginnen.",
          action: (
            <Link
              href="/opdrachten/aanvragen"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white"
              style={{ backgroundColor: "var(--color-accent-accessible)" }}
            >
              <PlusCircle size={16} />
              Opdracht aanvragen
            </Link>
          ),
        }}
        renderMobileCard={(assignment) => (
          <article className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-xs font-black"
                  style={{
                    backgroundColor: "var(--color-muted)",
                    color: "var(--color-secondary)",
                  }}
                >
                  {assignment.code}
                </span>
                <h3
                  className="mt-2 truncate font-black"
                  style={{ color: "var(--color-primary)" }}
                >
                  {assignment.title}
                </h3>
                {assignment.objectName ? (
                  <p
                    className="mt-0.5 truncate text-xs font-semibold"
                    style={{ color: "var(--color-muted-fg)" }}
                  >
                    {assignment.objectName}
                    {assignment.objectCity ? ` - ${assignment.objectCity}` : ""}
                  </p>
                ) : null}
                <span className="mt-1 block text-xs">
                  <AssignmentTiming assignment={assignment} />
                </span>
                <div className="mt-2">
                  <QuoteCell assignment={assignment} />
                </div>
              </div>
              <AssignmentStatusBadge assignment={assignment} />
            </div>
            {assignment.status === "awaiting_approval" ? (
              <OfferteActieButtons
                assignmentId={assignment.id}
                title={assignment.title}
              />
            ) : null}
            <div
              className="mt-3 flex items-center justify-between border-t pt-3"
              style={{ borderColor: "var(--color-border)" }}
            >
              <Link
                href={`/opdrachten/${assignment.id}`}
                className="text-xs font-black"
                style={{ color: "var(--color-accent-accessible)" }}
              >
                Details bekijken
              </Link>
              <PortalActionMenu label={`Acties voor ${assignment.title}`}>
                <PortalActionMenuLink href={`/opdrachten/${assignment.id}`}>
                  Details bekijken
                </PortalActionMenuLink>
                {assignment.quoteId ? (
                  <PortalActionMenuLink
                    href={`/api/offerte/${assignment.quoteId}/pdf`}
                    external
                  >
                    Offerte PDF downloaden
                  </PortalActionMenuLink>
                ) : null}
                {assignment.status === "awaiting_approval" ? (
                  <PortalActionMenuLink href="/offertes">
                    Naar offertes
                  </PortalActionMenuLink>
                ) : null}
              </PortalActionMenu>
            </div>
          </article>
        )}
      />
    </PortalPageShell>
  );
}

function AssignmentFilterForm({
  query,
  filter,
}: {
  query: string;
  filter: AssignmentFilter;
}) {
  return (
    <form action="/opdrachten" className="space-y-4">
      <div>
        <label
          htmlFor="assignment-filter-query"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Zoeken
        </label>
        <input
          id="assignment-filter-query"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Opdracht, werkbon of object"
          className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        />
      </div>
      <div>
        <label
          htmlFor="assignment-filter-status"
          className="text-xs font-black"
          style={{ color: "var(--color-secondary)" }}
        >
          Statusgroep
        </label>
        <SelectAdapter
          id="assignment-filter-status"
          name="filter"
          defaultValue={filter}
          className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(0,183,179,0.14)]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-primary)",
          }}
        >
          <option value="all">Alle opdrachten</option>
          <option value="action_required">Actie vereist</option>
          <option value="active">In uitvoering</option>
          <option value="open">Lopende aanvragen</option>
          <option value="history">Historie</option>
        </SelectAdapter>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Link
          href="/opdrachten"
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
          style={{ backgroundColor: "var(--color-accent-accessible)" }}
        >
          Toepassen
        </button>
      </div>
    </form>
  );
}

function QuoteCell({ assignment }: { assignment: CustomerAssignment }) {
  const quoteBadge = assignment.quoteStatus
    ? QUOTE_STATUS_BADGE[assignment.quoteStatus]
    : null;

  if (quoteBadge) {
    return (
      <span
        className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-black"
        style={{ backgroundColor: quoteBadge.bg, color: quoteBadge.color }}
      >
        {quoteBadge.label}
      </span>
    );
  }

  if (assignment.quoteAmount) {
    return (
      <span
        className="text-sm font-bold"
        style={{ color: "var(--color-primary)" }}
      >
        {formatAmount(assignment.quoteAmount)}
      </span>
    );
  }

  return (
    <span
      className="text-sm font-semibold"
      style={{ color: "var(--color-muted-fg)" }}
    >
      -
    </span>
  );
}

function AssignmentStatusBadge({
  assignment,
}: {
  assignment: CustomerAssignment;
}) {
  const style = STATUS_COLOR[assignment.status] ?? {
    bg: "#F1F5F9",
    color: "#64748B",
  };
  return (
    <span
      className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {STATUS_LABEL[assignment.status] ?? assignment.status}
    </span>
  );
}
