import { SelectAdapter } from "@workspace/shared-ui";
export const dynamic = "force-dynamic";

import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  Calendar,
  ClipboardCheck,
  Globe,
  MapPin,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { getOpenAssignments } from "@/actions/open-assignments";
import { MobilePageShell } from "@/components/MobilePageShell";
import { ApplyButton } from "./ApplyButton";

type OpenAssignment = Awaited<ReturnType<typeof getOpenAssignments>>[number];
type OpenAssignmentFilterStatus =
  | "all"
  | "available"
  | "invited"
  | "responded"
  | "unavailable";
type OpenAssignmentPriorityFilter =
  | "all"
  | "urgent"
  | "high"
  | "normal"
  | "low";

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
  }>;
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Laag",
  normal: "Normaal",
  high: "Hoog",
  urgent: "Urgent",
};

const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  low: { bg: "#f1f5f9", fg: "#64748b" },
  normal: { bg: "#eff6ff", fg: "#3b82f6" },
  high: { bg: "#fef3c7", fg: "#d97706" },
  urgent: { bg: "#fee2e2", fg: "#dc2626" },
};

const SECTOR_PREFIX_LABELS: Record<string, string> = {
  SCH: "Schoonmaak",
  BEV: "Beveiliging",
  FAC: "Facilitair",
};

const STATUS_FILTERS: Array<{
  value: OpenAssignmentFilterStatus;
  label: string;
}> = [
  { value: "all", label: "Alles" },
  { value: "available", label: "Nog te reageren" },
  { value: "invited", label: "Uitnodigingen" },
  { value: "responded", label: "Gereageerd" },
  { value: "unavailable", label: "Niet beschikbaar" },
];

const PRIORITY_FILTERS: Array<{
  value: OpenAssignmentPriorityFilter;
  label: string;
}> = [
  { value: "all", label: "Alle prioriteiten" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "Hoog" },
  { value: "normal", label: "Normaal" },
  { value: "low", label: "Laag" },
];

function normalizeQuery(value: string | undefined): string {
  return value?.trim().slice(0, 80) ?? "";
}

function normalizeStatus(
  value: string | undefined,
): OpenAssignmentFilterStatus {
  return STATUS_FILTERS.some((option) => option.value === value)
    ? (value as OpenAssignmentFilterStatus)
    : "all";
}

function normalizePriority(
  value: string | undefined,
): OpenAssignmentPriorityFilter {
  return PRIORITY_FILTERS.some((option) => option.value === value)
    ? (value as OpenAssignmentPriorityFilter)
    : "all";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function timeRange(start: string | null, end: string | null): string | null {
  if (start && end) return `${start} - ${end}`;
  if (start) return `Vanaf ${start}`;
  if (end) return `Tot ${end}`;
  return null;
}

function serviceLabel(assignment: OpenAssignment): string {
  if (assignment.sectorName) return assignment.sectorName;
  const prefix = assignment.code.split("-")[0]?.toUpperCase();
  if (prefix && SECTOR_PREFIX_LABELS[prefix])
    return SECTOR_PREFIX_LABELS[prefix];
  return assignment.taskCodes[0] ?? "Dienst";
}

function responseState(assignment: OpenAssignment): OpenAssignmentFilterStatus {
  if (assignment.interestStatus === "unavailable") return "unavailable";
  if (
    assignment.isAlreadyApplied ||
    ["interested", "question", "selected", "reserve", "confirmed"].includes(
      assignment.interestStatus ?? "",
    )
  ) {
    return "responded";
  }
  if (assignment.isInterestInvite) return "invited";
  return "available";
}

function matchesOpenAssignmentQuery(
  assignment: OpenAssignment,
  query: string,
): boolean {
  if (!query) return true;
  const haystack = [
    assignment.code,
    assignment.title,
    assignment.customerName,
    assignment.objectName,
    assignment.sectorName,
    assignment.objectAddress,
    assignment.objectCity,
    assignment.requiredRegion,
    ...assignment.taskCodes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("nl-NL");

  return haystack.includes(query.toLocaleLowerCase("nl-NL"));
}

function filterOpenAssignments({
  assignments,
  query,
  status,
  priority,
}: {
  assignments: OpenAssignment[];
  query: string;
  status: OpenAssignmentFilterStatus;
  priority: OpenAssignmentPriorityFilter;
}): OpenAssignment[] {
  return assignments.filter((assignment) => {
    const priorityMatches =
      priority === "all" || assignment.priority === priority;
    const statusMatches =
      status === "all" || responseState(assignment) === status;
    return (
      priorityMatches &&
      statusMatches &&
      matchesOpenAssignmentQuery(assignment, query)
    );
  });
}

function openAssignmentsHref({
  q,
  status,
  priority,
}: {
  q: string;
  status: OpenAssignmentFilterStatus;
  priority: OpenAssignmentPriorityFilter;
}): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  if (priority !== "all") params.set("priority", priority);
  const query = params.toString();
  return query ? `/openstaand?${query}` : "/openstaand";
}

function OpenAssignmentsCommandBar({
  query,
  status,
  priority,
  visibleCount,
  totalCount,
}: {
  query: string;
  status: OpenAssignmentFilterStatus;
  priority: OpenAssignmentPriorityFilter;
  visibleCount: number;
  totalCount: number;
}) {
  const activeFilters = [
    query
      ? {
          label: `Zoeken: ${query}`,
          href: openAssignmentsHref({ q: "", status, priority }),
        }
      : null,
    status !== "all"
      ? {
          label:
            STATUS_FILTERS.find((option) => option.value === status)?.label ??
            "Status",
          href: openAssignmentsHref({ q: query, status: "all", priority }),
        }
      : null,
    priority !== "all"
      ? {
          label:
            PRIORITY_FILTERS.find((option) => option.value === priority)
              ?.label ?? "Prioriteit",
          href: openAssignmentsHref({ q: query, status, priority: "all" }),
        }
      : null,
  ].filter((filter): filter is { label: string; href: string } =>
    Boolean(filter),
  );

  return (
    <section
      className="rounded-[22px] border bg-white p-3 shadow-sm md:p-4"
      style={{ borderColor: "var(--color-border)" }}
    >
      <form
        action="/openstaand"
        className="grid gap-2 md:grid-cols-[minmax(0,1fr)_11rem_12rem_auto] md:items-end"
      >
        <div>
          <label
            htmlFor="open-assignment-search"
            className="mb-1.5 block text-[11px] font-black uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Zoeken
          </label>
          <div
            className="flex h-11 items-center gap-2 rounded-2xl border px-3"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Search
              size={16}
              strokeWidth={2.35}
              style={{ color: "var(--color-muted-fg)" }}
            />
            <input
              id="open-assignment-search"
              name="q"
              defaultValue={query}
              placeholder="Dienst, object, regio..."
              className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none placeholder:text-slate-400"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="open-assignment-status"
            className="mb-1.5 block text-[11px] font-black uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Status
          </label>
          <SelectAdapter
            id="open-assignment-status"
            name="status"
            defaultValue={status}
            className="h-11 w-full rounded-2xl border bg-white px-3 text-[14px] font-black outline-none"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectAdapter>
        </div>
        <div>
          <label
            htmlFor="open-assignment-priority"
            className="mb-1.5 block text-[11px] font-black uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Prioriteit
          </label>
          <SelectAdapter
            id="open-assignment-priority"
            name="priority"
            defaultValue={priority}
            className="h-11 w-full rounded-2xl border bg-white px-3 text-[14px] font-black outline-none"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          >
            {PRIORITY_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectAdapter>
        </div>
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-[14px] font-black text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          <SlidersHorizontal size={16} strokeWidth={2.4} />
          Filter
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-[12px] font-bold"
          style={{ color: "var(--color-secondary)" }}
        >
          {visibleCount} van {totalCount} diensten zichtbaar
        </p>
        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {activeFilters.map((filter) => (
              <a
                key={filter.label}
                href={filter.href}
                className="inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-[11px] font-black"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-primary)",
                }}
              >
                {filter.label}
                <X size={12} />
              </a>
            ))}
            <a
              href="/openstaand"
              className="rounded-full px-2.5 py-1 text-[11px] font-black"
              style={{ color: "var(--color-secondary)" }}
            >
              Wissen
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default async function OpenstaandePage({ searchParams }: Props) {
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const status = normalizeStatus(params.status);
  const priority = normalizePriority(params.priority);
  const assignments = await getOpenAssignments();
  const visibleAssignments = filterOpenAssignments({
    assignments,
    query,
    status,
    priority,
  });
  const open = visibleAssignments.filter((assignment) => {
    const state = responseState(assignment);
    return state === "available" || state === "invited";
  });
  const responded = visibleAssignments.filter((assignment) => {
    const state = responseState(assignment);
    return state === "responded" || state === "unavailable";
  });

  return (
    <MobilePageShell
      title="Open diensten"
      subtitle="Meld je aan als kandidaat; planning bevestigt de inzet."
    >
      <OpenAssignmentsCommandBar
        query={query}
        status={status}
        priority={priority}
        visibleCount={visibleAssignments.length}
        totalCount={assignments.length}
      />

      {assignments.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <ClipboardCheck
            size={32}
            className="mx-auto mb-3"
            style={{ color: "var(--color-muted-fg)" }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--color-primary)" }}
          >
            Geen openstaande opdrachten
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-secondary)" }}
          >
            Er zijn momenteel geen opdrachten beschikbaar waarvoor je in
            aanmerking komt.
          </p>
        </div>
      ) : null}

      {assignments.length > 0 && visibleAssignments.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <Search
            size={32}
            className="mx-auto mb-3"
            style={{ color: "var(--color-muted-fg)" }}
          />
          <p
            className="text-sm font-black"
            style={{ color: "var(--color-primary)" }}
          >
            Geen diensten gevonden
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-secondary)" }}
          >
            Pas je zoekopdracht of filters aan om de beschikbare diensten
            opnieuw te bekijken.
          </p>
        </div>
      ) : null}

      {open.length > 0 ? (
        <section>
          <h2
            className="mb-2 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Nog te reageren ({open.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {open.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        </section>
      ) : null}

      {responded.length > 0 ? (
        <section>
          <h2
            className="mb-2 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Reacties ({responded.length})
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {responded.map((assignment) => (
              <AssignmentCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
        </section>
      ) : null}
    </MobilePageShell>
  );
}

function AssignmentCard({ assignment }: { assignment: OpenAssignment }) {
  const priorityStyle = assignment.priority
    ? (PRIORITY_COLORS[assignment.priority] ?? PRIORITY_COLORS.normal)
    : null;
  const priorityLabel = assignment.priority
    ? (PRIORITY_LABELS[assignment.priority] ?? assignment.priority)
    : null;

  const service = serviceLabel(assignment);
  const when = [
    formatDate(assignment.scheduledDate),
    timeRange(assignment.scheduledStart, assignment.scheduledEnd),
  ]
    .filter(Boolean)
    .join(" - ");
  const clientLine = [assignment.customerName, assignment.objectName]
    .filter(Boolean)
    .join(" - ");
  const addressLine = [assignment.objectAddress, assignment.objectCity]
    .filter(Boolean)
    .join(", ");

  return (
    <article
      className="rounded-[22px] border bg-white p-3.5 shadow-sm"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="font-mono text-[11px] font-semibold"
            style={{ color: "var(--color-secondary)" }}
          >
            {assignment.code}
          </p>
          <p
            className="mt-1 line-clamp-2 text-[16px] font-black leading-5"
            style={{ color: "var(--color-primary)" }}
          >
            {assignment.title}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {assignment.isInterestInvite ? (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-black"
              style={{ backgroundColor: "#ecfeff", color: "#0f766e" }}
            >
              Uitnodiging
            </span>
          ) : null}
          {priorityLabel && priorityStyle ? (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-black"
              style={{
                backgroundColor: priorityStyle.bg,
                color: priorityStyle.fg,
              }}
            >
              {priorityLabel === "Urgent" ? (
                <AlertCircle size={10} className="mr-0.5 inline-block" />
              ) : null}
              {priorityLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="mt-3 rounded-2xl border bg-[#FAFBFD] p-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div
          className="grid gap-2 text-[12px] font-semibold"
          style={{ color: "var(--color-secondary)" }}
        >
          <div className="flex items-center gap-2">
            <BriefcaseBusiness
              size={14}
              className="shrink-0"
              style={{ color: "var(--color-accent)" }}
            />
            <span className="min-w-0 truncate">
              <span
                className="font-black"
                style={{ color: "var(--color-primary)" }}
              >
                {service}
              </span>
              {assignment.taskCodes.length > 0
                ? ` - ${assignment.taskCodes.slice(0, 2).join(", ")}`
                : ""}
            </span>
          </div>
          {clientLine ? (
            <div className="flex items-center gap-2">
              <Building2
                size={14}
                className="shrink-0"
                style={{ color: "var(--color-accent)" }}
              />
              <span className="min-w-0 truncate">{clientLine}</span>
            </div>
          ) : null}
          {when ? (
            <div className="flex items-center gap-2">
              <Calendar
                size={14}
                className="shrink-0"
                style={{ color: "var(--color-accent)" }}
              />
              <span className="min-w-0 truncate">{when}</span>
            </div>
          ) : null}
          {assignment.requiredRegion ? (
            <div className="flex items-center gap-2">
              <Globe
                size={14}
                className="shrink-0"
                style={{ color: "var(--color-accent)" }}
              />
              <span className="min-w-0 truncate">
                {assignment.requiredRegion}
              </span>
            </div>
          ) : null}
          {addressLine ? (
            <div className="flex items-center gap-2">
              <MapPin
                size={14}
                className="shrink-0"
                style={{ color: "var(--color-accent)" }}
              />
              <span className="min-w-0 truncate">{addressLine}</span>
            </div>
          ) : null}
        </div>
        {assignment.taskCodes.length > 0 ? (
          <div
            className="mt-2 flex items-start gap-2 border-t pt-2"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Tag
              size={13}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--color-accent)" }}
            />
            <div className="flex flex-wrap gap-1">
              {assignment.taskCodes.map((code) => (
                <span
                  key={code}
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{
                    backgroundColor: "var(--color-muted)",
                    color: "var(--color-secondary)",
                  }}
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        <ApplyButton
          assignmentId={assignment.id}
          title={assignment.title}
          isAlreadyApplied={assignment.isAlreadyApplied}
          interestStatus={assignment.interestStatus}
          canDecline={assignment.isInterestInvite}
        />
      </div>
    </article>
  );
}
