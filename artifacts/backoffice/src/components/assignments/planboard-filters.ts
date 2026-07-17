export type PlanboardAssignmentStatus = string;
export type PlanboardStatusFilter = PlanboardAssignmentStatus | PlanboardAssignmentStatus[] | "all" | null | undefined;
export type PlanboardStringFilter = string | string[] | "all" | null | undefined;
export type PlanboardTeamFilter = "all" | "solo" | "team" | "understaffed" | "filled" | null | undefined;
export type PlanboardUnscheduledFilter = "all" | "unscheduled" | "scheduled" | null | undefined;
export type PlanboardInterestFilter = "all" | "has_interest" | "no_interest" | "interested_personnel" | null | undefined;


export type PlanboardAssignmentShape = {
  id: string;
  status: PlanboardAssignmentStatus;
  sectorId: string | null;
  sectorName: string | null;
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assignedPersonnelIds: string[];
  requiredSlots: number;
  filledSlots: number;
  requiredPersonnelCount: number;
};

export type PlanboardPersonnelAssignmentShape = { id: string };

export type PlanboardPersonnelShape = {
  id: string;
  roleId: string | null;
  roleName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  personnelType: string | null;
  scheduledAssignments: PlanboardPersonnelAssignmentShape[];
};

export type PlanboardMatchShape = { level: "match" | "warning" | "blocked" | string };

export type PlanboardAssignmentInterest = {
  interestedPersonnelIds?: readonly string[] | null;
  interestedCount?: number | null;
  interestCount?: number | null;
  hasInterest?: boolean | null;
};

export type PlanboardFilterableAssignment = Pick<
  PlanboardAssignmentShape,
  | "id"
  | "status"
  | "sectorId"
  | "sectorName"
  | "scheduledDate"
  | "scheduledStart"
  | "scheduledEnd"
  | "assignedPersonnelIds"
  | "requiredSlots"
  | "filledSlots"
> &
  Partial<Pick<PlanboardAssignmentShape, "requiredPersonnelCount">> &
  PlanboardAssignmentInterest;

export type PlanboardFilterablePersonnel = Pick<
  PlanboardPersonnelShape,
  "id" | "roleId" | "roleName" | "sectorId" | "sectorName" | "personnelType" | "scheduledAssignments"
>;

export type PlanboardAssignmentFilterInput = {
  personnelId?: PlanboardStringFilter;
  team?: PlanboardTeamFilter;
  sector?: PlanboardStringFilter;
  status?: PlanboardStatusFilter;
  type?: PlanboardStringFilter;
  unscheduled?: PlanboardUnscheduledFilter;
  interest?: PlanboardInterestFilter;
};

export type PlanboardPersonnelFilterInput = {
  personnelId?: PlanboardStringFilter;
  sector?: PlanboardStringFilter;
  type?: PlanboardStringFilter;
};

export type PlanboardAssignmentIndicators = {
  isScheduled: boolean;
  isUnscheduled: boolean;
  hasInterest: boolean;
  interestCount: number;
  interestedPersonnelIds: string[];
};

function normalizeValues(value: PlanboardStringFilter): string[] {
  if (!value || value === "all") return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function matchesStringFilter(value: string | null | undefined, filter: PlanboardStringFilter): boolean {
  const values = normalizeValues(filter);
  if (values.length === 0) return true;
  return value ? values.includes(value.trim().toLowerCase()) : false;
}

export function getPlanboardAssignmentIndicators(assignment: PlanboardFilterableAssignment): PlanboardAssignmentIndicators {
  const interestedPersonnelIds = [...(assignment.interestedPersonnelIds ?? [])].filter(Boolean);
  const interestCount = Math.max(
    interestedPersonnelIds.length,
    assignment.interestedCount ?? 0,
    assignment.interestCount ?? 0,
  );
  const isScheduled = Boolean(assignment.scheduledDate || assignment.scheduledStart || assignment.scheduledEnd);

  return {
    isScheduled,
    isUnscheduled: !isScheduled,
    hasInterest: Boolean(assignment.hasInterest) || interestCount > 0,
    interestCount,
    interestedPersonnelIds,
  };
}

export function matchesPlanboardPersonnelFilter(
  person: PlanboardFilterablePersonnel,
  filters: PlanboardPersonnelFilterInput = {},
): boolean {
  return (
    matchesStringFilter(person.id, filters.personnelId) &&
    (matchesStringFilter(person.sectorId, filters.sector) || matchesStringFilter(person.sectorName, filters.sector)) &&
    (matchesStringFilter(person.personnelType, filters.type) || matchesStringFilter(person.roleId, filters.type) || matchesStringFilter(person.roleName, filters.type))
  );
}

export function matchesPlanboardAssignmentFilter(
  assignment: PlanboardFilterableAssignment,
  filters: PlanboardAssignmentFilterInput = {},
): boolean {
  const statusValues = normalizeValues(filters.status as PlanboardStringFilter);
  if (statusValues.length > 0 && !statusValues.includes(String(assignment.status).toLowerCase())) return false;

  if (!(matchesStringFilter(assignment.sectorId, filters.sector) || matchesStringFilter(assignment.sectorName, filters.sector))) return false;

  if (!matchesAssignmentPersonnelFilter(assignment, filters.personnelId)) return false;
  if (!matchesAssignmentTeamFilter(assignment, filters.team)) return false;
  if (!matchesAssignmentTypeFilter(assignment, filters.type)) return false;
  if (!matchesAssignmentUnscheduledFilter(assignment, filters.unscheduled)) return false;
  if (!matchesAssignmentInterestFilter(assignment, filters.interest, filters.personnelId)) return false;

  return true;
}

export function filterPlanboardAssignments<T extends PlanboardFilterableAssignment>(
  assignments: readonly T[],
  filters: PlanboardAssignmentFilterInput = {},
): T[] {
  return assignments.filter((assignment) => matchesPlanboardAssignmentFilter(assignment, filters));
}

export function filterPlanboardPersonnel<T extends PlanboardFilterablePersonnel>(
  personnel: readonly T[],
  filters: PlanboardPersonnelFilterInput = {},
): T[] {
  return personnel.filter((person) => matchesPlanboardPersonnelFilter(person, filters));
}

export function matchesAssignmentPersonnelFilter(
  assignment: PlanboardFilterableAssignment,
  personnelId: PlanboardStringFilter,
): boolean {
  const values = normalizeValues(personnelId);
  if (values.length === 0) return true;
  return assignment.assignedPersonnelIds.some((id) => values.includes(id.toLowerCase()));
}

export function matchesAssignmentTeamFilter(
  assignment: PlanboardFilterableAssignment,
  team: PlanboardTeamFilter,
): boolean {
  if (!team || team === "all") return true;
  const requiredSlots = Math.max(assignment.requiredSlots, assignment.requiredPersonnelCount ?? 0, 1);
  if (team === "solo") return requiredSlots <= 1;
  if (team === "team") return requiredSlots > 1;
  if (team === "understaffed") return assignment.filledSlots < requiredSlots;
  if (team === "filled") return assignment.filledSlots >= requiredSlots;
  return true;
}

export function matchesAssignmentTypeFilter(
  assignment: PlanboardFilterableAssignment,
  type: PlanboardStringFilter,
): boolean {
  const values = normalizeValues(type);
  if (values.length === 0) return true;
  const requiredSlots = Math.max(assignment.requiredSlots, assignment.requiredPersonnelCount ?? 0, 1);
  const derivedType = requiredSlots > 1 ? "team" : "solo";
  return values.includes(derivedType);
}

export function matchesAssignmentUnscheduledFilter(
  assignment: PlanboardFilterableAssignment,
  filter: PlanboardUnscheduledFilter,
): boolean {
  if (!filter || filter === "all") return true;
  const indicators = getPlanboardAssignmentIndicators(assignment);
  return filter === "unscheduled" ? indicators.isUnscheduled : indicators.isScheduled;
}

export function matchesAssignmentInterestFilter(
  assignment: PlanboardFilterableAssignment,
  filter: PlanboardInterestFilter,
  personnelId?: PlanboardStringFilter,
): boolean {
  if (!filter || filter === "all") return true;
  const indicators = getPlanboardAssignmentIndicators(assignment);
  if (filter === "has_interest") return indicators.hasInterest;
  if (filter === "no_interest") return !indicators.hasInterest;
  if (filter === "interested_personnel") {
    const values = normalizeValues(personnelId);
    if (values.length === 0) return indicators.hasInterest;
    return indicators.interestedPersonnelIds.some((id) => values.includes(id.toLowerCase()));
  }
  return true;
}

export function countPlanboardMatches(matches: readonly PlanboardMatchShape[] | undefined): {
  total: number;
  matches: number;
  warnings: number;
  blocked: number;
} {
  const items = matches ?? [];
  return {
    total: items.length,
    matches: items.filter((match) => match.level === "match").length,
    warnings: items.filter((match) => match.level === "warning").length,
    blocked: items.filter((match) => match.level === "blocked").length,
  };
}

export const PLANBOARD_FILTER_TEST_FIXTURES = {
  soloUnscheduled: {
    id: "fixture-solo-unscheduled",
    status: "plannable",
    sectorId: "sector-security",
    sectorName: "Security",
    scheduledDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    assignedPersonnelIds: [],
    requiredSlots: 1,
    filledSlots: 0,
    requiredPersonnelCount: 1,
  },
  teamWithInterest: {
    id: "fixture-team-interest",
    status: "scheduled",
    sectorId: "sector-cleaning",
    sectorName: "Cleaning",
    scheduledDate: "2026-07-16",
    scheduledStart: "09:00",
    scheduledEnd: "11:00",
    assignedPersonnelIds: ["person-1"],
    requiredSlots: 2,
    filledSlots: 1,
    requiredPersonnelCount: 2,
    interestedPersonnelIds: ["person-2"],
  },
} satisfies Record<string, PlanboardFilterableAssignment>;
