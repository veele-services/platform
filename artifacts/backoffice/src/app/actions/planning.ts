"use server";

import { db } from "@workspace/db";
import {
  personnelTable,
  rolesTable,
  customersTable,
  objectsTable,
  sectorsTable,
  assignmentTasksTable,
  taskCodesTable,
  assignmentPersonnelTable,
  assignmentsTable,
  auditLogTable,
  assignmentCandidatesTable,
  availabilityDayEntriesTable,
  availabilityWindowsTable,
  ASSIGNMENT_PRIORITIES,
  ASSIGNMENT_STATUSES,
  type AssignmentPriority,
  type AssignmentStatus,
} from "@workspace/db";
import {
  asc,
  desc,
  eq,
  and,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getBatchAvailabilityStatus,
  type AvailabilityStatus,
} from "./availability";
import type { ActionResult } from "./customers";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssignmentRequirements = {
  requiredRoleIds: string[];
  requiredCertificates: string[];
  requiredKnowledge: string[];
  requiredDiplomas: string[];
  /** Required region from assignments.required_region — null means no restriction */
  assignmentRegion: string | null;
  /** The assignment's scheduled date (YYYY-MM-DD) — used for availability lookup */
  scheduledDate: string | null;
};

export type PersonnelEligibilityEntry = {
  personnelId: string;
  linkId: string | null;
  firstName: string;
  lastName: string;
  roleId: string | null;
  roleName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  region: string | null;
  certificates: string[];
  diplomas: string[];
  knowledge: string[];
  isActive: boolean;
  availabilityStatus: AvailabilityStatus;
};

export type PersonnelForAssignmentResult = {
  requirements: AssignmentRequirements;
  personnel: PersonnelEligibilityEntry[];
};

export type PlanningBoardMatchSeverity = "ok" | "warning" | "block";

export type PlanningBoardMatchReasonCode =
  | "assigned"
  | "available"
  | "unknown_availability"
  | "unavailable"
  | "on_leave"
  | "sick"
  | "outside_availability_window"
  | "already_booked"
  | "role_mismatch"
  | "certificate_missing"
  | "diploma_missing"
  | "knowledge_missing"
  | "sector_mismatch"
  | "region_mismatch"
  | "not_available_for_planning";

export type PlanningBoardMatchReason = {
  code: PlanningBoardMatchReasonCode;
  label: string;
  severity: PlanningBoardMatchSeverity;
};

export type PlanningBoardMatch = {
  personnelId: string;
  level: "match" | "warning" | "blocked";
  eligible: boolean;
  matchScore: number | null;
  reasons: PlanningBoardMatchReason[];
};

export type PlanningBoardAssignmentRequirements = AssignmentRequirements & {
  requiredRoleNames: string[];
  taskCount: number;
  estimatedDurationMinutes: number;
  taskSectorIds: string[];
};

export type PlanningBoardAssignment = {
  id: string;
  code: string;
  title: string;
  status: AssignmentStatus;
  priority: AssignmentPriority;
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  customerId: string;
  customerName: string;
  objectId: string | null;
  objectName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  requiredRegion: string | null;
  requiredPersonnelCount: number;
  assignedPersonnelIds: string[];
  requiredSlots: number;
  filledSlots: number;
  hasConflict: boolean;
  requirements: PlanningBoardAssignmentRequirements;
};

export type PlanningBoardPersonnelAssignment = {
  id: string;
  code: string;
  title: string;
  status: AssignmentStatus;
  priority: AssignmentPriority;
  customerName: string;
  objectName: string | null;
  sectorName: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estimatedDurationMinutes: number;
  requiredSlots: number;
  filledSlots: number;
  hasConflict: boolean;
};

export type PlanningBoardPersonnel = {
  id: string;
  firstName: string;
  lastName: string;
  roleId: string | null;
  roleName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  region: string | null;
  preferredRegions: string[];
  personnelType: string | null;
  emergencyAvailable: boolean;
  availabilityStatus: AvailabilityStatus;
  availabilityWindow: { startTime: string; endTime: string } | null;
  scheduledAssignments: PlanningBoardPersonnelAssignment[];
  scheduledMinutes: number;
};

export type PlanningBoardFilters = {
  date?: string;
  search?: string;
  customerId?: string;
  sectorId?: string;
  region?: string;
  priority?: AssignmentPriority | "";
  statuses?: AssignmentStatus[];
};

export type PlanningBoardFilterOptions = {
  customers: Array<{ id: string; name: string }>;
  sectors: Array<{ id: string; name: string }>;
  regions: string[];
  priorities: AssignmentPriority[];
  statuses: AssignmentStatus[];
};

export type PlanningBoardData = {
  date: string;
  openAssignments: PlanningBoardAssignment[];
  scheduledAssignments: PlanningBoardAssignment[];
  personnel: PlanningBoardPersonnel[];
  matchesByAssignmentId: Record<string, PlanningBoardMatch[]>;
  filterOptions: PlanningBoardFilterOptions;
};

export type PlanningBoardScheduleInput = {
  assignmentId: string;
  personnelId: string;
  sourcePersonnelId?: string | null;
  date: string;
  start: string;
  end?: string | null;
};

export type PlanningBoardScheduleResult = ActionResult<{
  warnings: PlanningBoardMatchReason[];
}>;

const OPEN_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["plannable"];

function todayDateKey(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function isDateKey(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
  );
}

function isTimeKey(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToTime(value: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, value));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutes(value: string, minutes: number): string {
  return minutesToTime(timeToMinutes(value) + minutes);
}

function durationMinutes(
  start: string | null,
  end: string | null,
  fallback = 60,
): number {
  if (!start || !end) return fallback;
  return Math.max(15, timeToMinutes(end) - timeToMinutes(start));
}

function overlaps(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  return aStart < bEnd && aEnd > bStart;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function certNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) {
        return String((item as { name?: unknown }).name ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

function normalizeStatuses(statuses?: AssignmentStatus[]): AssignmentStatus[] {
  if (!statuses || statuses.length === 0) return [];
  return statuses.filter((status): status is AssignmentStatus =>
    ASSIGNMENT_STATUSES.includes(status),
  );
}

function buildReason(
  code: PlanningBoardMatchReasonCode,
  label: string,
  severity: PlanningBoardMatchSeverity,
): PlanningBoardMatchReason {
  return { code, label, severity };
}

type PlanningPersonnelCandidate = {
  id: string;
  roleId: string | null;
  sectorId: string | null;
  region: string | null;
  preferredRegions: string[];
  certificates: string[];
  diplomas: string[];
  knowledge: string[];
  isAvailable: boolean;
};

function buildPlanningMatch(params: {
  assignment: PlanningBoardAssignment;
  personnel: PlanningPersonnelCandidate;
  availabilityStatus: AvailabilityStatus;
  availabilityWindow: { startTime: string; endTime: string } | null;
  personnelAssignments: PlanningBoardPersonnelAssignment[];
}): PlanningBoardMatch {
  const {
    assignment,
    personnel,
    availabilityStatus,
    availabilityWindow,
    personnelAssignments,
  } = params;

  const reasons: PlanningBoardMatchReason[] = [];
  const req = assignment.requirements;
  const isAssigned = assignment.assignedPersonnelIds.includes(personnel.id);

  if (isAssigned) {
    reasons.push(
      buildReason("assigned", "Al gekoppeld aan deze werkbon", "ok"),
    );
  }

  if (!personnel.isAvailable) {
    reasons.push(
      buildReason(
        "not_available_for_planning",
        "Niet beschikbaar voor planning",
        "block",
      ),
    );
  }

  if (availabilityStatus === "beschikbaar") {
    reasons.push(buildReason("available", "Beschikbaar op deze datum", "ok"));
  } else if (availabilityStatus === "niet_ingesteld") {
    reasons.push(
      buildReason(
        "unknown_availability",
        "Beschikbaarheid niet ingesteld",
        "warning",
      ),
    );
  } else if (availabilityStatus === "ziek") {
    reasons.push(buildReason("sick", "Ziek gemeld op deze datum", "block"));
  } else if (availabilityStatus === "op_verlof") {
    reasons.push(buildReason("on_leave", "Op verlof op deze datum", "block"));
  } else {
    reasons.push(
      buildReason("unavailable", "Niet beschikbaar op deze datum", "block"),
    );
  }

  if (
    assignment.scheduledStart &&
    assignment.scheduledEnd &&
    availabilityStatus === "beschikbaar"
  ) {
    if (!availabilityWindow) {
      reasons.push(
        buildReason(
          "outside_availability_window",
          "Geen beschikbaarheidsvenster voor dit tijdslot",
          "block",
        ),
      );
    } else if (
      timeToMinutes(availabilityWindow.startTime) >
        timeToMinutes(assignment.scheduledStart) ||
      timeToMinutes(availabilityWindow.endTime) <
        timeToMinutes(assignment.scheduledEnd)
    ) {
      reasons.push(
        buildReason(
          "outside_availability_window",
          "Beschikbaarheidsvenster dekt dit tijdslot niet",
          "block",
        ),
      );
    }
  }

  const hasOverlappingAssignment = personnelAssignments.some((other) => {
    if (other.id === assignment.id) return false;
    if (!assignment.scheduledDate) return false;
    return overlaps(
      other.scheduledStart,
      other.scheduledEnd,
      assignment.scheduledStart,
      assignment.scheduledEnd,
    );
  });
  if (hasOverlappingAssignment) {
    reasons.push(
      buildReason("already_booked", "Al ingepland op dit tijdstip", "block"),
    );
  }

  if (
    req.requiredRoleIds.length > 0 &&
    !req.requiredRoleIds.includes(personnel.roleId ?? "")
  ) {
    reasons.push(
      buildReason("role_mismatch", "Benodigde rol ontbreekt", "block"),
    );
  }

  if (assignment.sectorId && assignment.sectorId !== personnel.sectorId) {
    reasons.push(
      buildReason("sector_mismatch", "Sector komt niet overeen", "block"),
    );
  }

  const missingCertificates = req.requiredCertificates.filter(
    (cert) => !personnel.certificates.includes(cert),
  );
  if (missingCertificates.length > 0) {
    reasons.push(
      buildReason(
        "certificate_missing",
        `Certificaat ontbreekt: ${missingCertificates.join(", ")}`,
        "block",
      ),
    );
  }

  const missingDiplomas = req.requiredDiplomas.filter(
    (diploma) => !personnel.diplomas.includes(diploma),
  );
  if (missingDiplomas.length > 0) {
    reasons.push(
      buildReason(
        "diploma_missing",
        `Diploma ontbreekt: ${missingDiplomas.join(", ")}`,
        "block",
      ),
    );
  }

  const missingKnowledge = req.requiredKnowledge.filter(
    (knowledge) => !personnel.knowledge.includes(knowledge),
  );
  if (missingKnowledge.length > 0) {
    reasons.push(
      buildReason(
        "knowledge_missing",
        `Kennis ontbreekt: ${missingKnowledge.join(", ")}`,
        "block",
      ),
    );
  }

  if (assignment.requiredRegion) {
    const required = assignment.requiredRegion.trim().toLowerCase();
    const regions = uniqueStrings([
      personnel.region,
      ...personnel.preferredRegions,
    ]).map((region) => region.trim().toLowerCase());
    if (!regions.includes(required)) {
      reasons.push(
        buildReason("region_mismatch", "Regio komt niet overeen", "block"),
      );
    }
  }

  const hasBlock = reasons.some((reason) => reason.severity === "block");
  const hasWarning = reasons.some((reason) => reason.severity === "warning");

  return {
    personnelId: personnel.id,
    level: hasBlock ? "blocked" : hasWarning ? "warning" : "match",
    eligible: !hasBlock,
    matchScore: null,
    reasons,
  };
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getPlanningBoardData(
  filters: PlanningBoardFilters = {},
): Promise<PlanningBoardData> {
  const canRead = await hasPermission("planning", "read");
  const empty: PlanningBoardData = {
    date:
      filters.date && isDateKey(filters.date) ? filters.date : todayDateKey(),
    openAssignments: [],
    scheduledAssignments: [],
    personnel: [],
    matchesByAssignmentId: {},
    filterOptions: {
      customers: [],
      sectors: [],
      regions: [],
      priorities: [...ASSIGNMENT_PRIORITIES],
      statuses: [...ASSIGNMENT_STATUSES],
    },
  };
  if (!canRead) return empty;

  const date =
    filters.date && isDateKey(filters.date) ? filters.date : todayDateKey();
  const statuses = normalizeStatuses(filters.statuses);

  const conditions = [eq(assignmentsTable.isActive, true)];
  const boardScope = or(
    eq(assignmentsTable.scheduledDate, date),
    inArray(assignmentsTable.status, OPEN_ASSIGNMENT_STATUSES),
  );
  if (boardScope) conditions.push(boardScope);
  if (statuses.length > 0)
    conditions.push(inArray(assignmentsTable.status, statuses));

  const term = filters.search?.trim();
  if (term) {
    const searchCondition = or(
      ilike(assignmentsTable.title, `%${term}%`),
      ilike(assignmentsTable.code, `%${term}%`),
      ilike(customersTable.name, `%${term}%`),
      ilike(objectsTable.name, `%${term}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  if (filters.customerId) {
    conditions.push(eq(assignmentsTable.customerId, filters.customerId));
  }

  if (filters.priority && ASSIGNMENT_PRIORITIES.includes(filters.priority)) {
    conditions.push(eq(assignmentsTable.priority, filters.priority));
  }

  if (filters.sectorId) {
    const sectorCondition = or(
      eq(objectsTable.sectorId, filters.sectorId),
      eq(customersTable.sectorId, filters.sectorId),
      sql<boolean>`exists (
        select 1
        from ${assignmentTasksTable}
        inner join ${taskCodesTable}
          on ${taskCodesTable.id} = ${assignmentTasksTable.taskCodeId}
        where ${assignmentTasksTable.assignmentId} = ${assignmentsTable.id}
          and ${taskCodesTable.sectorId} = ${filters.sectorId}
      )`,
    );
    if (sectorCondition) conditions.push(sectorCondition);
  }

  if (filters.region) {
    conditions.push(ilike(assignmentsTable.requiredRegion, filters.region));
  }

  const personnelConditions = [
    eq(personnelTable.isActive, true),
    eq(personnelTable.isAvailable, true),
  ];
  if (filters.sectorId) {
    personnelConditions.push(eq(personnelTable.sectorId, filters.sectorId));
  }

  const [assignmentRows, personnelRows, sectorRows, customerRows] =
    await Promise.all([
      db
        .select({
          id: assignmentsTable.id,
          code: assignmentsTable.code,
          title: assignmentsTable.title,
          status: assignmentsTable.status,
          priority: assignmentsTable.priority,
          scheduledDate: assignmentsTable.scheduledDate,
          scheduledStart: assignmentsTable.scheduledStart,
          scheduledEnd: assignmentsTable.scheduledEnd,
          requiredRegion: assignmentsTable.requiredRegion,
          requiredPersonnelCount: assignmentsTable.requiredPersonnelCount,
          customerId: assignmentsTable.customerId,
          customerName: customersTable.name,
          customerSectorId: customersTable.sectorId,
          objectId: assignmentsTable.objectId,
          objectName: objectsTable.name,
          objectSectorId: objectsTable.sectorId,
        })
        .from(assignmentsTable)
        .leftJoin(
          customersTable,
          eq(assignmentsTable.customerId, customersTable.id),
        )
        .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
        .where(and(...conditions))
        .orderBy(
          asc(assignmentsTable.scheduledDate),
          asc(assignmentsTable.scheduledStart),
          desc(assignmentsTable.createdAt),
        ),

      db
        .select({
          id: personnelTable.id,
          firstName: personnelTable.firstName,
          lastName: personnelTable.lastName,
          roleId: personnelTable.roleId,
          roleName: rolesTable.name,
          sectorId: personnelTable.sectorId,
          sectorName: sectorsTable.name,
          region: personnelTable.region,
          preferredRegions: personnelTable.preferredRegions,
          certificates: personnelTable.certificates,
          diplomas: personnelTable.diplomas,
          knowledge: personnelTable.knowledge,
          personnelType: personnelTable.personnelType,
          emergencyAvailable: personnelTable.emergencyAvailable,
          isAvailable: personnelTable.isAvailable,
        })
        .from(personnelTable)
        .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
        .leftJoin(sectorsTable, eq(personnelTable.sectorId, sectorsTable.id))
        .where(and(...personnelConditions))
        .orderBy(asc(personnelTable.lastName), asc(personnelTable.firstName)),

      db
        .select({ id: sectorsTable.id, name: sectorsTable.name })
        .from(sectorsTable)
        .where(eq(sectorsTable.isActive, true))
        .orderBy(asc(sectorsTable.name)),

      db
        .select({ id: customersTable.id, name: customersTable.name })
        .from(customersTable)
        .where(eq(customersTable.isActive, true))
        .orderBy(asc(customersTable.name)),
    ]);

  const assignmentIds = assignmentRows.map((row) => row.id);
  const personnelIds = personnelRows.map((row) => row.id);

  const [taskRows, linkRows, dayEntryRows, windowRows, candidateRows, availabilityMap] =
    await Promise.all([
      assignmentIds.length > 0
        ? db
            .select({
              assignmentId: assignmentTasksTable.assignmentId,
              taskCodeId: assignmentTasksTable.taskCodeId,
              requiredRoleId: taskCodesTable.requiredRoleId,
              requiredRoleName: rolesTable.name,
              requiredCertificates: taskCodesTable.requiredCertificates,
              requiredDiploma: taskCodesTable.requiredDiploma,
              requiredKnowledge: taskCodesTable.requiredKnowledge,
              durationMinutes: taskCodesTable.durationMinutes,
              sectorId: taskCodesTable.sectorId,
            })
            .from(assignmentTasksTable)
            .leftJoin(
              taskCodesTable,
              eq(assignmentTasksTable.taskCodeId, taskCodesTable.id),
            )
            .leftJoin(
              rolesTable,
              eq(taskCodesTable.requiredRoleId, rolesTable.id),
            )
            .where(inArray(assignmentTasksTable.assignmentId, assignmentIds))
        : Promise.resolve([]),

      assignmentIds.length > 0
        ? db
            .select({
              assignmentId: assignmentPersonnelTable.assignmentId,
              personnelId: assignmentPersonnelTable.personnelId,
            })
            .from(assignmentPersonnelTable)
            .where(
              and(
                inArray(assignmentPersonnelTable.assignmentId, assignmentIds),
                eq(assignmentPersonnelTable.status, "assigned"),
              ),
            )
        : Promise.resolve([]),

      personnelIds.length > 0
        ? db
            .select({
              personnelId: availabilityDayEntriesTable.personnelId,
              startTime: availabilityDayEntriesTable.startTime,
              endTime: availabilityDayEntriesTable.endTime,
            })
            .from(availabilityDayEntriesTable)
            .where(
              and(
                inArray(availabilityDayEntriesTable.personnelId, personnelIds),
                eq(availabilityDayEntriesTable.date, date),
              ),
            )
        : Promise.resolve([]),

      personnelIds.length > 0
        ? db
            .select({
              personnelId: availabilityWindowsTable.personnelId,
              startTime: availabilityWindowsTable.startTime,
              endTime: availabilityWindowsTable.endTime,
            })
            .from(availabilityWindowsTable)
            .where(
              and(
                inArray(availabilityWindowsTable.personnelId, personnelIds),
                eq(
                  availabilityWindowsTable.dayOfWeek,
                  new Date(`${date}T00:00:00`).getDay(),
                ),
              ),
            )
        : Promise.resolve([]),

      assignmentIds.length > 0
        ? db
            .select({
              assignmentId: assignmentCandidatesTable.assignmentId,
              personnelId: assignmentCandidatesTable.personnelId,
              hardStatus: assignmentCandidatesTable.hardStatus,
              matchScore: assignmentCandidatesTable.matchScore,
            })
            .from(assignmentCandidatesTable)
            .where(inArray(assignmentCandidatesTable.assignmentId, assignmentIds))
        : Promise.resolve(
            [] as Array<{
              assignmentId: string;
              personnelId: string;
              hardStatus: string;
              matchScore: number;
            }>,
          ),

      personnelIds.length > 0
        ? getBatchAvailabilityStatus(personnelIds, date)
        : Promise.resolve({} as Record<string, AvailabilityStatus>),
    ]);

  const sectorNameById = new Map(
    sectorRows.map((sector) => [sector.id, sector.name]),
  );
  const requirementMap = new Map<
    string,
    {
      requiredRoleIds: Set<string>;
      requiredRoleNames: Set<string>;
      requiredCertificates: Set<string>;
      requiredKnowledge: Set<string>;
      requiredDiplomas: Set<string>;
      taskSectorIds: Set<string>;
      taskCount: number;
      estimatedDurationMinutes: number;
    }
  >();

  for (const row of taskRows) {
    const current = requirementMap.get(row.assignmentId) ?? {
      requiredRoleIds: new Set<string>(),
      requiredRoleNames: new Set<string>(),
      requiredCertificates: new Set<string>(),
      requiredKnowledge: new Set<string>(),
      requiredDiplomas: new Set<string>(),
      taskSectorIds: new Set<string>(),
      taskCount: 0,
      estimatedDurationMinutes: 0,
    };
    current.taskCount += 1;
    if (row.requiredRoleId) current.requiredRoleIds.add(row.requiredRoleId);
    if (row.requiredRoleName)
      current.requiredRoleNames.add(row.requiredRoleName);
    for (const cert of (row.requiredCertificates ?? []) as string[])
      current.requiredCertificates.add(cert);
    for (const knowledge of (row.requiredKnowledge ?? []) as string[])
      current.requiredKnowledge.add(knowledge);
    if (row.requiredDiploma) current.requiredDiplomas.add(row.requiredDiploma);
    if (row.sectorId) current.taskSectorIds.add(row.sectorId);
    current.estimatedDurationMinutes += row.durationMinutes ?? 0;
    requirementMap.set(row.assignmentId, current);
  }

  const personnelIdsByAssignment = new Map<string, string[]>();
  for (const link of linkRows) {
    const ids = personnelIdsByAssignment.get(link.assignmentId) ?? [];
    ids.push(link.personnelId);
    personnelIdsByAssignment.set(link.assignmentId, ids);
  }

  const baseAssignmentsById = new Map(
    assignmentRows.map((row) => [row.id, row]),
  );
  const conflictAssignmentIds = new Set<string>();

  for (const link of linkRows) {
    const assignment = baseAssignmentsById.get(link.assignmentId);
    if (!assignment || assignment.scheduledDate !== date) continue;
    const status = availabilityMap[link.personnelId];
    if (
      status === "ziek" ||
      status === "op_verlof" ||
      status === "niet_beschikbaar"
    ) {
      conflictAssignmentIds.add(link.assignmentId);
    }
  }

  const assignmentsByPersonnel = new Map<string, typeof assignmentRows>();
  for (const link of linkRows) {
    const assignment = baseAssignmentsById.get(link.assignmentId);
    if (!assignment || assignment.scheduledDate !== date) continue;
    const list = assignmentsByPersonnel.get(link.personnelId) ?? [];
    list.push(assignment);
    assignmentsByPersonnel.set(link.personnelId, list);
  }

  for (const list of assignmentsByPersonnel.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (
          overlaps(
            a.scheduledStart,
            a.scheduledEnd,
            b.scheduledStart,
            b.scheduledEnd,
          )
        ) {
          conflictAssignmentIds.add(a.id);
          conflictAssignmentIds.add(b.id);
        }
      }
    }
  }

  const boardAssignments: PlanningBoardAssignment[] = assignmentRows.map(
    (row) => {
      const req = requirementMap.get(row.id);
      const taskSectorIds = req ? [...req.taskSectorIds] : [];
      const sectorId =
        row.objectSectorId ?? row.customerSectorId ?? taskSectorIds[0] ?? null;
      const requiredRoleIds = req ? [...req.requiredRoleIds] : [];
      const estimatedDurationMinutes = req?.estimatedDurationMinutes
        ? req.estimatedDurationMinutes
        : durationMinutes(
            row.scheduledStart ?? null,
            row.scheduledEnd ?? null,
            60,
          );
      const assignedPersonnelIds = personnelIdsByAssignment.get(row.id) ?? [];
      const requiredSlots = Math.max(row.requiredPersonnelCount ?? 1, requiredRoleIds.length, 1);

      return {
        id: row.id,
        code: row.code,
        title: row.title,
        status: row.status as AssignmentStatus,
        priority: row.priority as AssignmentPriority,
        scheduledDate: row.scheduledDate ?? null,
        scheduledStart: row.scheduledStart ?? null,
        scheduledEnd: row.scheduledEnd ?? null,
        customerId: row.customerId,
        customerName: row.customerName ?? "",
        objectId: row.objectId ?? null,
        objectName: row.objectName ?? null,
        sectorId,
        sectorName: sectorId ? (sectorNameById.get(sectorId) ?? null) : null,
        requiredRegion: row.requiredRegion ?? null,
        requiredPersonnelCount: row.requiredPersonnelCount ?? 1,
        assignedPersonnelIds,
        requiredSlots,
        filledSlots: assignedPersonnelIds.length,
        hasConflict: conflictAssignmentIds.has(row.id),
        requirements: {
          requiredRoleIds,
          requiredRoleNames: req ? [...req.requiredRoleNames] : [],
          requiredCertificates: req ? [...req.requiredCertificates] : [],
          requiredKnowledge: req ? [...req.requiredKnowledge] : [],
          requiredDiplomas: req ? [...req.requiredDiplomas] : [],
          assignmentRegion: row.requiredRegion ?? null,
          scheduledDate: row.scheduledDate ?? null,
          taskCount: req?.taskCount ?? 0,
          estimatedDurationMinutes,
          taskSectorIds,
        },
      };
    },
  );

  const assignmentById = new Map(
    boardAssignments.map((assignment) => [assignment.id, assignment]),
  );
  const scheduledBlocksByPersonnel = new Map<
    string,
    PlanningBoardPersonnelAssignment[]
  >();

  for (const link of linkRows) {
    const assignment = assignmentById.get(link.assignmentId);
    if (!assignment || assignment.scheduledDate !== date) continue;
    const list = scheduledBlocksByPersonnel.get(link.personnelId) ?? [];
    list.push({
      id: assignment.id,
      code: assignment.code,
      title: assignment.title,
      status: assignment.status,
      priority: assignment.priority,
      customerName: assignment.customerName,
      objectName: assignment.objectName,
      sectorName: assignment.sectorName,
      scheduledStart: assignment.scheduledStart,
      scheduledEnd: assignment.scheduledEnd,
      estimatedDurationMinutes:
        assignment.requirements.estimatedDurationMinutes,
      requiredSlots: assignment.requiredSlots,
      filledSlots: assignment.filledSlots,
      hasConflict: assignment.hasConflict,
    });
    scheduledBlocksByPersonnel.set(link.personnelId, list);
  }

  const windowByPersonnelId = new Map<
    string,
    { startTime: string; endTime: string }
  >();
  for (const window of windowRows) {
    windowByPersonnelId.set(window.personnelId, {
      startTime: window.startTime,
      endTime: window.endTime,
    });
  }
  for (const entry of dayEntryRows) {
    windowByPersonnelId.set(entry.personnelId, {
      startTime: entry.startTime,
      endTime: entry.endTime,
    });
  }

  const personnel: PlanningBoardPersonnel[] = personnelRows.map((row) => {
    const scheduledAssignments = (
      scheduledBlocksByPersonnel.get(row.id) ?? []
    ).sort((a, b) =>
      (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""),
    );
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      roleId: row.roleId ?? null,
      roleName: row.roleName ?? null,
      sectorId: row.sectorId ?? null,
      sectorName: row.sectorName ?? null,
      region: row.region ?? null,
      preferredRegions: stringArray(row.preferredRegions),
      personnelType: row.personnelType ?? null,
      emergencyAvailable: row.emergencyAvailable,
      availabilityStatus: (availabilityMap[row.id] ??
        "niet_ingesteld") as AvailabilityStatus,
      availabilityWindow: windowByPersonnelId.get(row.id) ?? null,
      scheduledAssignments,
      scheduledMinutes: scheduledAssignments.reduce(
        (total, assignment) =>
          total +
          durationMinutes(
            assignment.scheduledStart,
            assignment.scheduledEnd,
            assignment.estimatedDurationMinutes,
          ),
        0,
      ),
    };
  });

  const personnelCandidates = new Map<string, PlanningPersonnelCandidate>(
    personnelRows.map((row) => [
      row.id,
      {
        id: row.id,
        roleId: row.roleId ?? null,
        sectorId: row.sectorId ?? null,
        region: row.region ?? null,
        preferredRegions: stringArray(row.preferredRegions),
        certificates: certNames(row.certificates),
        diplomas: stringArray(row.diplomas),
        knowledge: stringArray(row.knowledge),
        isAvailable: row.isAvailable,
      },
    ]),
  );

  const smartCandidateByKey = new Map(
    candidateRows.map((row) => [
      `${row.assignmentId}:${row.personnelId}`,
      {
        hardStatus: row.hardStatus,
        matchScore: row.matchScore ?? 0,
      },
    ]),
  );

  const openAssignments = boardAssignments.filter((assignment) => {
    if (assignment.filledSlots >= assignment.requiredSlots) return false;
    return (
      OPEN_ASSIGNMENT_STATUSES.includes(assignment.status) ||
      assignment.status === "scheduled"
    );
  });

  const scheduledAssignments = boardAssignments.filter(
    (assignment) => assignment.scheduledDate === date,
  );

  const matchesByAssignmentId: Record<string, PlanningBoardMatch[]> = {};
  for (const assignment of boardAssignments) {
    matchesByAssignmentId[assignment.id] = personnel
      .map((person) => {
        const candidate = personnelCandidates.get(person.id)!;
        const match = buildPlanningMatch({
          assignment: {
            ...assignment,
            scheduledDate: assignment.scheduledDate ?? date,
          },
          personnel: candidate,
          availabilityStatus: person.availabilityStatus,
          availabilityWindow: person.availabilityWindow,
          personnelAssignments: person.scheduledAssignments,
        });
        const smart = smartCandidateByKey.get(`${assignment.id}:${person.id}`);
        return {
          ...match,
          matchScore: smart?.matchScore ?? match.matchScore,
        };
      })
      .sort((a, b) => {
        const order = { match: 0, warning: 1, blocked: 2 };
        const levelDelta = order[a.level] - order[b.level];
        if (levelDelta !== 0) return levelDelta;
        return (b.matchScore ?? -1) - (a.matchScore ?? -1);
      });
  }

  const regions = uniqueStrings([
    ...personnelRows.map((row) => row.region),
    ...personnelRows.flatMap((row) => stringArray(row.preferredRegions)),
    ...assignmentRows.map((row) => row.requiredRegion),
  ]).sort((a, b) => a.localeCompare(b, "nl"));

  return {
    date,
    openAssignments,
    scheduledAssignments,
    personnel,
    matchesByAssignmentId,
    filterOptions: {
      customers: customerRows,
      sectors: sectorRows,
      regions,
      priorities: [...ASSIGNMENT_PRIORITIES],
      statuses: [...ASSIGNMENT_STATUSES],
    },
  };
}

/**
 * Returns the union of task-code requirements for the assignment,
 * all active personnel (with role and availability), and which are already assigned.
 * Also loads region + scheduled date so the drawer can show region-match badges
 * and colour-coded availability indicators.
 */
export async function getPersonnelForAssignment(
  assignmentId: string,
): Promise<PersonnelForAssignmentResult | null> {
  const canRead = await hasPermission("planning", "read");
  if (!canRead) return null;

  const [taskRows, personnelRows, assignedRows, [assignmentRow]] =
    await Promise.all([
      db
        .select({
          requiredRoleId: taskCodesTable.requiredRoleId,
          requiredCertificates: taskCodesTable.requiredCertificates,
          requiredKnowledge: taskCodesTable.requiredKnowledge,
          requiredDiploma: taskCodesTable.requiredDiploma,
        })
        .from(assignmentTasksTable)
        .innerJoin(
          taskCodesTable,
          eq(assignmentTasksTable.taskCodeId, taskCodesTable.id),
        )
        .where(eq(assignmentTasksTable.assignmentId, assignmentId)),

      db
        .select({
          id: personnelTable.id,
          firstName: personnelTable.firstName,
          lastName: personnelTable.lastName,
          roleId: personnelTable.roleId,
          roleName: rolesTable.name,
          sectorId: personnelTable.sectorId,
          sectorName: sectorsTable.name,
          region: personnelTable.region,
          certificates: personnelTable.certificates,
          diplomas: personnelTable.diplomas,
          knowledge: personnelTable.knowledge,
          isActive: personnelTable.isActive,
        })
        .from(personnelTable)
        .leftJoin(rolesTable, eq(personnelTable.roleId, rolesTable.id))
        .leftJoin(sectorsTable, eq(personnelTable.sectorId, sectorsTable.id))
        .where(eq(personnelTable.isActive, true))
        .orderBy(personnelTable.lastName),

      db
        .select({
          linkId: assignmentPersonnelTable.id,
          personnelId: assignmentPersonnelTable.personnelId,
        })
        .from(assignmentPersonnelTable)
        .where(
          and(
            eq(assignmentPersonnelTable.assignmentId, assignmentId),
            eq(assignmentPersonnelTable.status, "assigned"),
          ),
        ),

      db
        .select({
          scheduledDate: assignmentsTable.scheduledDate,
          requiredRegion: assignmentsTable.requiredRegion,
        })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, assignmentId))
        .limit(1),
    ]);

  const assignedMap = new Map(
    assignedRows.map((r) => [r.personnelId, r.linkId]),
  );
  const scheduledDate = assignmentRow?.scheduledDate ?? null;
  const assignmentRegion = assignmentRow?.requiredRegion ?? null;

  // ── Batch availability status ──────────────────────────────────────────────
  let availabilityMap: Record<string, AvailabilityStatus> = {};
  if (scheduledDate && personnelRows.length > 0) {
    availabilityMap = await getBatchAvailabilityStatus(
      personnelRows.map((p) => p.id),
      scheduledDate,
    );
  }

  const requiredRoleIds = [
    ...new Set(
      taskRows
        .map((r) => r.requiredRoleId)
        .filter((id): id is string => id !== null && id !== undefined),
    ),
  ];
  const requiredCertificates = [
    ...new Set(
      taskRows.flatMap(
        (r) => (r.requiredCertificates as string[] | null) ?? [],
      ),
    ),
  ];
  const requiredKnowledge = [
    ...new Set(
      taskRows.flatMap((r) => (r.requiredKnowledge as string[] | null) ?? []),
    ),
  ];
  const requiredDiplomas = [
    ...new Set(
      taskRows
        .map((r) => r.requiredDiploma)
        .filter((d): d is string => d !== null && d !== undefined),
    ),
  ];

  return {
    requirements: {
      requiredRoleIds,
      requiredCertificates,
      requiredKnowledge,
      requiredDiplomas,
      assignmentRegion,
      scheduledDate,
    },
    personnel: personnelRows.map((r) => ({
      personnelId: r.id,
      linkId: assignedMap.get(r.id) ?? null,
      firstName: r.firstName,
      lastName: r.lastName,
      roleId: r.roleId ?? null,
      roleName: r.roleName ?? null,
      sectorId: r.sectorId ?? null,
      sectorName: r.sectorName ?? null,
      region: r.region ?? null,
      certificates: (
        (r.certificates ?? []) as (
          | { name: string; expires_at?: string }
          | string
        )[]
      ).map((c) => (typeof c === "string" ? c : c.name)),
      diplomas: (r.diplomas as string[] | null) ?? [],
      knowledge: (r.knowledge as string[] | null) ?? [],
      isActive: r.isActive,
      availabilityStatus: (availabilityMap[r.id] ??
        "niet_ingesteld") as AvailabilityStatus,
    })),
  };
}

/**
 * Remove a personnel member from an assignment by personnelId.
 * Reverts the assignment status back to 'plannable' if it was 'scheduled'.
 */
export async function unassignPersonnel(
  assignmentId: string,
  personnelId: string,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [[link], [current]] = await Promise.all([
    db
      .select({ id: assignmentPersonnelTable.id })
      .from(assignmentPersonnelTable)
      .where(
        and(
          eq(assignmentPersonnelTable.assignmentId, assignmentId),
          eq(assignmentPersonnelTable.personnelId, personnelId),
        ),
      )
      .limit(1),
    db
      .select({ status: assignmentsTable.status })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, assignmentId))
      .limit(1),
  ]);

  if (!link) return { success: false, message: "Koppeling niet gevonden." };

  await db
    .delete(assignmentPersonnelTable)
    .where(eq(assignmentPersonnelTable.id, link.id));

  if (current?.status === "scheduled") {
    await db
      .update(assignmentsTable)
      .set({ status: "plannable", updatedAt: new Date() })
      .where(eq(assignmentsTable.id, assignmentId));
  }

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "unassign_personnel",
    resource: "assignments",
    resourceId: assignmentId,
    metadata: { personnelId },
  });

  revalidatePath("/planning");
  revalidatePath(`/assignments/${assignmentId}`);
  return { success: true };
}

export async function scheduleAssignmentOnBoard(
  input: PlanningBoardScheduleInput,
): Promise<PlanningBoardScheduleResult> {
  await requirePermission("planning", "write");

  const assignmentId = input.assignmentId.trim();
  const personnelId = input.personnelId.trim();
  const sourcePersonnelId = input.sourcePersonnelId?.trim() || null;
  const date = input.date.trim();
  const start = input.start.trim();

  if (!assignmentId || !personnelId) {
    return {
      success: false,
      message: "Opdracht en medewerker zijn verplicht.",
    };
  }
  if (!isDateKey(date)) {
    return {
      success: false,
      message: "Ongeldige plandatum.",
      fieldErrors: { date: "Gebruik YYYY-MM-DD." },
    };
  }
  if (!isTimeKey(start)) {
    return {
      success: false,
      message: "Ongeldige starttijd.",
      fieldErrors: { start: "Gebruik HH:MM." },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [[assignment], [personnel], taskRows, assignedRows] = await Promise.all(
    [
      db
        .select({
          id: assignmentsTable.id,
          code: assignmentsTable.code,
          title: assignmentsTable.title,
          status: assignmentsTable.status,
          priority: assignmentsTable.priority,
          customerId: assignmentsTable.customerId,
          customerName: customersTable.name,
          customerSectorId: customersTable.sectorId,
          objectId: assignmentsTable.objectId,
          objectName: objectsTable.name,
          objectSectorId: objectsTable.sectorId,
          requiredRegion: assignmentsTable.requiredRegion,
        })
        .from(assignmentsTable)
        .leftJoin(
          customersTable,
          eq(assignmentsTable.customerId, customersTable.id),
        )
        .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
        .where(eq(assignmentsTable.id, assignmentId))
        .limit(1),

      db
        .select({
          id: personnelTable.id,
          firstName: personnelTable.firstName,
          lastName: personnelTable.lastName,
          roleId: personnelTable.roleId,
          sectorId: personnelTable.sectorId,
          region: personnelTable.region,
          preferredRegions: personnelTable.preferredRegions,
          certificates: personnelTable.certificates,
          diplomas: personnelTable.diplomas,
          knowledge: personnelTable.knowledge,
          isActive: personnelTable.isActive,
          isAvailable: personnelTable.isAvailable,
        })
        .from(personnelTable)
        .where(eq(personnelTable.id, personnelId))
        .limit(1),

      db
        .select({
          requiredRoleId: taskCodesTable.requiredRoleId,
          requiredRoleName: rolesTable.name,
          requiredCertificates: taskCodesTable.requiredCertificates,
          requiredDiploma: taskCodesTable.requiredDiploma,
          requiredKnowledge: taskCodesTable.requiredKnowledge,
          durationMinutes: taskCodesTable.durationMinutes,
          sectorId: taskCodesTable.sectorId,
        })
        .from(assignmentTasksTable)
        .leftJoin(
          taskCodesTable,
          eq(assignmentTasksTable.taskCodeId, taskCodesTable.id),
        )
        .leftJoin(rolesTable, eq(taskCodesTable.requiredRoleId, rolesTable.id))
        .where(eq(assignmentTasksTable.assignmentId, assignmentId)),

      db
        .select({
          id: assignmentPersonnelTable.id,
          personnelId: assignmentPersonnelTable.personnelId,
        })
        .from(assignmentPersonnelTable)
        .where(
          and(
            eq(assignmentPersonnelTable.assignmentId, assignmentId),
            eq(assignmentPersonnelTable.status, "assigned"),
          ),
        ),
    ],
  );

  if (!assignment)
    return { success: false, message: "Opdracht niet gevonden." };
  if (!personnel || !personnel.isActive)
    return { success: false, message: "Medewerker niet gevonden of inactief." };

  const allowedStatuses: AssignmentStatus[] = ["plannable", "scheduled"];
  if (!allowedStatuses.includes(assignment.status as AssignmentStatus)) {
    return {
      success: false,
      message: `Alleen planbare of ingeplande werkbonnen kunnen via het planbord worden geplaatst (huidige status: ${assignment.status}).`,
    };
  }

  const requiredRoleIds = uniqueStrings(
    taskRows.map((row) => row.requiredRoleId),
  );
  const requiredRoleNames = uniqueStrings(
    taskRows.map((row) => row.requiredRoleName),
  );
  const requiredCertificates = uniqueStrings(
    taskRows.flatMap((row) => (row.requiredCertificates ?? []) as string[]),
  );
  const requiredKnowledge = uniqueStrings(
    taskRows.flatMap((row) => (row.requiredKnowledge ?? []) as string[]),
  );
  const requiredDiplomas = uniqueStrings(
    taskRows.map((row) => row.requiredDiploma),
  );
  const taskSectorIds = uniqueStrings(taskRows.map((row) => row.sectorId));
  const estimatedDurationMinutes =
    taskRows.reduce((total, row) => total + (row.durationMinutes ?? 0), 0) ||
    60;
  const requiredSlots = Math.max(requiredRoleIds.length, 1);
  const targetLinkBeforeMove = assignedRows.find(
    (row) => row.personnelId === personnelId,
  );
  const sourceLinkBeforeMove = sourcePersonnelId
    ? assignedRows.find((row) => row.personnelId === sourcePersonnelId)
    : null;

  if (sourcePersonnelId && !sourceLinkBeforeMove) {
    return {
      success: false,
      message: "Bronmedewerker is niet gekoppeld aan deze werkbon.",
    };
  }
  if (
    !sourcePersonnelId &&
    !targetLinkBeforeMove &&
    assignedRows.length >= requiredSlots
  ) {
    return {
      success: false,
      message:
        "Deze werkbon is al volledig bezet. Sleep een bestaande afspraak om de medewerker te vervangen.",
    };
  }

  const end = input.end?.trim() || addMinutes(start, estimatedDurationMinutes);
  if (!isTimeKey(end)) {
    return {
      success: false,
      message: "Ongeldige eindtijd.",
      fieldErrors: { end: "Gebruik HH:MM." },
    };
  }
  if (timeToMinutes(end) <= timeToMinutes(start)) {
    return {
      success: false,
      message: "Eindtijd moet na starttijd liggen.",
      fieldErrors: { end: "Kies een latere eindtijd." },
    };
  }

  const [
    availabilityMap,
    [availabilityDayEntry],
    [availabilityWindow],
    existingRows,
  ] = await Promise.all([
    getBatchAvailabilityStatus([personnelId], date),

    db
      .select({
        startTime: availabilityDayEntriesTable.startTime,
        endTime: availabilityDayEntriesTable.endTime,
      })
      .from(availabilityDayEntriesTable)
      .where(
        and(
          eq(availabilityDayEntriesTable.personnelId, personnelId),
          eq(availabilityDayEntriesTable.date, date),
        ),
      )
      .limit(1),

    db
      .select({
        startTime: availabilityWindowsTable.startTime,
        endTime: availabilityWindowsTable.endTime,
      })
      .from(availabilityWindowsTable)
      .where(
        and(
          eq(availabilityWindowsTable.personnelId, personnelId),
          eq(
            availabilityWindowsTable.dayOfWeek,
            new Date(`${date}T00:00:00`).getDay(),
          ),
        ),
      )
      .limit(1),

    db
      .select({
        id: assignmentsTable.id,
        code: assignmentsTable.code,
        title: assignmentsTable.title,
        status: assignmentsTable.status,
        priority: assignmentsTable.priority,
        customerName: customersTable.name,
        objectName: objectsTable.name,
        scheduledStart: assignmentsTable.scheduledStart,
        scheduledEnd: assignmentsTable.scheduledEnd,
      })
      .from(assignmentPersonnelTable)
      .innerJoin(
        assignmentsTable,
        eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
      )
      .leftJoin(
        customersTable,
        eq(assignmentsTable.customerId, customersTable.id),
      )
      .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
      .where(
        and(
          eq(assignmentPersonnelTable.personnelId, personnelId),
          eq(assignmentPersonnelTable.status, "assigned"),
          eq(assignmentsTable.scheduledDate, date),
          ne(assignmentsTable.id, assignmentId),
          or(
            isNull(assignmentsTable.scheduledStart),
            isNull(assignmentsTable.scheduledEnd),
            sql<boolean>`${assignmentsTable.scheduledStart} < ${end} AND ${assignmentsTable.scheduledEnd} > ${start}`,
          ),
        ),
      ),
  ]);

  const sectorId =
    assignment.objectSectorId ??
    assignment.customerSectorId ??
    taskSectorIds[0] ??
    null;
  const syntheticAssignment: PlanningBoardAssignment = {
    id: assignment.id,
    code: assignment.code,
    title: assignment.title,
    status: assignment.status as AssignmentStatus,
    priority: assignment.priority as AssignmentPriority,
    scheduledDate: date,
    scheduledStart: start,
    scheduledEnd: end,
    customerId: assignment.customerId,
    customerName: assignment.customerName ?? "",
    objectId: assignment.objectId ?? null,
    objectName: assignment.objectName ?? null,
    sectorId,
    sectorName: null,
    requiredRegion: assignment.requiredRegion ?? null,
    requiredPersonnelCount: requiredSlots,
    assignedPersonnelIds: assignedRows.map((row) => row.personnelId),
    requiredSlots,
    filledSlots: assignedRows.length,
    hasConflict: existingRows.length > 0,
    requirements: {
      requiredRoleIds,
      requiredRoleNames,
      requiredCertificates,
      requiredKnowledge,
      requiredDiplomas,
      assignmentRegion: assignment.requiredRegion ?? null,
      scheduledDate: date,
      taskCount: taskRows.length,
      estimatedDurationMinutes,
      taskSectorIds,
    },
  };

  const match = buildPlanningMatch({
    assignment: syntheticAssignment,
    personnel: {
      id: personnel.id,
      roleId: personnel.roleId ?? null,
      sectorId: personnel.sectorId ?? null,
      region: personnel.region ?? null,
      preferredRegions: stringArray(personnel.preferredRegions),
      certificates: certNames(personnel.certificates),
      diplomas: stringArray(personnel.diplomas),
      knowledge: stringArray(personnel.knowledge),
      isAvailable: personnel.isAvailable,
    },
    availabilityStatus: (availabilityMap[personnelId] ??
      "niet_ingesteld") as AvailabilityStatus,
    availabilityWindow: availabilityDayEntry ?? availabilityWindow ?? null,
    personnelAssignments: existingRows.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      status: row.status as AssignmentStatus,
      priority: row.priority as AssignmentPriority,
      customerName: row.customerName ?? "",
      objectName: row.objectName ?? null,
      sectorName: null,
      scheduledStart: row.scheduledStart ?? null,
      scheduledEnd: row.scheduledEnd ?? null,
      estimatedDurationMinutes: durationMinutes(
        row.scheduledStart ?? null,
        row.scheduledEnd ?? null,
        60,
      ),
      requiredSlots: syntheticAssignment.requiredSlots,
      filledSlots: syntheticAssignment.filledSlots,
      hasConflict: true,
    })),
  });

  const blockers = match.reasons.filter(
    (reason) => reason.severity === "block",
  );
  if (blockers.length > 0) {
    return {
      success: false,
      message: `Deze medewerker kan niet worden ingepland: ${blockers.map((reason) => reason.label).join("; ")}.`,
    };
  }

  const warnings = match.reasons.filter(
    (reason) => reason.severity === "warning",
  );
  const nextStatus =
    assignment.status === "plannable" ? "scheduled" : assignment.status;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(assignmentsTable)
        .set({
          scheduledDate: date,
          scheduledStart: start,
          scheduledEnd: end,
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(assignmentsTable.id, assignmentId));

      const [existingLink] = await tx
        .select({
          id: assignmentPersonnelTable.id,
          status: assignmentPersonnelTable.status,
        })
        .from(assignmentPersonnelTable)
        .where(
          and(
            eq(assignmentPersonnelTable.assignmentId, assignmentId),
            eq(assignmentPersonnelTable.personnelId, personnelId),
          ),
        )
        .limit(1);

      if (
        sourcePersonnelId &&
        sourcePersonnelId !== personnelId &&
        sourceLinkBeforeMove
      ) {
        if (existingLink) {
          await tx
            .update(assignmentPersonnelTable)
            .set({
              status: "assigned",
              assignedBy: user.id,
              assignedAt: new Date(),
            })
            .where(eq(assignmentPersonnelTable.id, existingLink.id));

          await tx
            .delete(assignmentPersonnelTable)
            .where(eq(assignmentPersonnelTable.id, sourceLinkBeforeMove.id));
        } else {
          await tx
            .update(assignmentPersonnelTable)
            .set({
              personnelId,
              status: "assigned",
              assignedBy: user.id,
              assignedAt: new Date(),
            })
            .where(eq(assignmentPersonnelTable.id, sourceLinkBeforeMove.id));
        }
      } else if (existingLink) {
        await tx
          .update(assignmentPersonnelTable)
          .set({
            status: "assigned",
            assignedBy: user.id,
            assignedAt: new Date(),
          })
          .where(eq(assignmentPersonnelTable.id, existingLink.id));
      } else {
        await tx.insert(assignmentPersonnelTable).values({
          assignmentId,
          personnelId,
          assignedBy: user.id,
        });
      }

      await tx.insert(auditLogTable).values({
        userId: user.id,
        action: "planning_schedule_assignment",
        resource: "assignments",
        resourceId: assignmentId,
        metadata: {
          personnelId,
          sourcePersonnelId,
          date,
          start,
          end,
          mode: sourcePersonnelId ? "move" : "schedule",
          fromStatus: assignment.status,
          toStatus: nextStatus,
          warnings: warnings.map((warning) => warning.label),
        },
      });

      if (assignment.status !== nextStatus) {
        await tx.insert(auditLogTable).values({
          userId: user.id,
          action: "status_change",
          resource: "assignments",
          resourceId: assignmentId,
          metadata: {
            from: assignment.status,
            to: nextStatus,
            trigger: "planning_board",
          },
        });
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        message: "Deze medewerker is al gekoppeld aan deze werkbon.",
      };
    }
    return {
      success: false,
      message: "Inplannen via het planbord is mislukt.",
    };
  }

  revalidatePath("/planning");
  revalidatePath(`/assignments/${assignmentId}`);

  return { success: true, data: { warnings } };
}
