export const planningViews = {
  unassigned: "In te delen",
  planned: "Gepland",
  running: "Lopend",
  completed: "Afgerond",
  cancelled: "Geannuleerd",
  all: "Alle bonnen",
} as const;
export type PlanningView = keyof typeof planningViews;
export { executionLabels as executionStatuses } from "../dossiers/status";
export type Crew = {
  id: string;
  personnelId: string;
  start: string;
  end: string;
  status: string;
  version: number;
  actualStart?: string | null; actualEnd?: string | null; timeBudgetMinutes?: number; workMinutes?: number; overrun?: boolean;
  qualifications: Array<{ code: string; hard: boolean }>;
  travel: Array<{
    direction: string;
    minutes: number | null;
    state: "known" | "unknown" | "stale" | "failed";
  }>;
};
export type PlanningOrder = {
  id: string;
  number: string;
  customerId: string;
  objectId: string;
  customer: string;
  object: string;
  discipline: string;
  status: string;
  version: number;
  start: string | null;
  end: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  requestedDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  windowKind: "arrival" | "execution" | "unknown";
  requiredPersonnel: number;
  durationMinutes: number | null;
  instructions: string;
  priority: string;
  category: PlanningView;
  assignments: Crew[];
};
export type PlanningPerson = {
  id: string;
  name: string;
  number: string;
  status: string;
};
export type Availability = {
  id: string;
  personnelId: string;
  start: string;
  end: string;
  kind: "available" | "unavailable";
};
export type Undo = { id: string; orderId: string; version: number };
export type PlanboardData = {
  day: string;
  timezone: string;
  board: PlanningOrder[];
  orders: PlanningOrder[];
  total: number;
  page: number;
  people: PlanningPerson[];
  availability: Availability[];
  undo: Undo | null;
};
export type PlanningQuery = {
  day: string;
  view: PlanningView;
  search: string;
  status: string;
  page: number;
};
/** The first client render reuses the exact query that produced the server snapshot. */
export function initialPlanningQuery(day: string): PlanningQuery {
  return { day, view: "unassigned", search: "", status: "", page: 1 };
}

export function samePlanningQuery(left: PlanningQuery, right: PlanningQuery): boolean {
  return left.day === right.day && left.view === right.view && left.search === right.search && left.status === right.status && left.page === right.page;
}
export type AssignmentInput = {
  personnelId: string;
  start: string;
  end: string;
};
export type Proposal = {
  orderId: string;
  version: number;
  mutationId: string;
  start: string | null;
  end: string | null;
  assignments: AssignmentInput[];
  confirmedWarnings: string[];
  undoChange?: string;
  appointment?: Pick<
    PlanningOrder,
    "requestedDate" | "windowKind" | "requiredPersonnel" | "instructions"
  >;
};
export type PlanningWarning = { key: string; message: string };
export type PlanningResult =
  | { ok: true; changeId: string; version: number; replayed?: boolean }
  | {
      ok: false;
      code: "confirmation";
      warnings: PlanningWarning[];
      before: Pick<PlanningOrder, "start" | "end">;
      proposed: Pick<Proposal, "start" | "end" | "assignments">;
    }
  | { ok: false; code: "conflict" | "error"; error: string };
export const canPlan = (order: PlanningOrder) =>
  ["planned", "released", "seen", "travelling"].includes(order.status) &&
  !order.actualStart;
export const overlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) =>
  Date.parse(aStart) < Date.parse(bEnd) &&
  Date.parse(aEnd) > Date.parse(bStart);
export function filterCount(search: string, status: string) {
  return Number(Boolean(search.trim())) + Number(Boolean(status));
}
export function assignmentInput(crew: Crew): AssignmentInput {
  return { personnelId: crew.personnelId, start: crew.start, end: crew.end };
}
export function initialProposal(order: PlanningOrder): Proposal {
  return {
    orderId: order.id,
    version: order.version,
    mutationId: crypto.randomUUID(),
    start: order.start,
    end: order.end,
    assignments: order.assignments.map(assignmentInput),
    confirmedWarnings: [],
  };
}
export function shiftedProposal(order: PlanningOrder, start: string): Proposal {
  if (!order.start || !order.end)
    throw new Error(
      "Vul eerst een geldige uitvoeringsduur in via Tijd aanpassen.",
    );
  const delta = Date.parse(start) - Date.parse(order.start);
  const shift = (value: string) =>
    new Date(Date.parse(value) + delta).toISOString();
  return {
    ...initialProposal(order),
    start,
    end: shift(order.end),
    assignments: order.assignments.map((a) => ({
      personnelId: a.personnelId,
      start: shift(a.start),
      end: shift(a.end),
    })),
  };
}
export function pointerMinute(
  clientX: number,
  left: number,
  scrollLeft: number,
  personnelWidth: number,
  pxPerMinute: number,
  grabOffset: number,
) {
  return Math.round(
    (clientX - left + scrollLeft - personnelWidth - grabOffset) / pxPerMinute,
  );
}
export function clientProblems(
  proposal: Proposal,
  data: PlanboardData,
): string[] {
  const errors: string[] = [];
  for (const a of proposal.assignments) {
    const name =
      data.people.find((p) => p.id === a.personnelId)?.name ?? "Medewerker";
    if (
      data.availability.some(
        (v) =>
          v.personnelId === a.personnelId &&
          v.kind === "unavailable" &&
          overlap(a.start, a.end, v.start, v.end),
      )
    )
      errors.push(`${name}: niet beschikbaar.`);
    if (
      data.board.some(
        (w) =>
          w.id !== proposal.orderId &&
          w.status !== "cancelled" &&
          w.assignments.some(
            (v) =>
              v.personnelId === a.personnelId &&
              !["completed", "returned", "cancelled"].includes(v.status) &&
              overlap(a.start, a.end, v.start, v.end),
          ),
      )
    )
      errors.push(`${name}: overlappende uitvoering.`);
  }
  return errors;
}
