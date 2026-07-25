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
  assignmentRouteContextsTable,
  assignmentsTable,
  auditLogTable,
  assignmentCandidatesTable,
  availabilityDayEntriesTable,
  availabilityWindowsTable,
  organizationSettingsTable,
  qualificationItemsTable,
  roleQualificationsTable,
  ASSIGNMENT_PRIORITIES,
  ASSIGNMENT_STATUSES,
  type AssignmentPriority,
  type AssignmentStatus,
  effectiveAssignmentIntervalsOverlap,
  resolveAssignmentEffectiveInterval,
  resolveRequiredSlots,
  type EffectiveAssignmentInterval,
  transitionAssignmentStaffing,
  reconcileAssignmentChecklistsRecoverably,
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
  type SQL,
} from "drizzle-orm";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getBatchAvailabilityStatus,
  type AvailabilityStatus,
} from "./availability";
import type { ActionResult } from "./customers";
import { emitAssignmentWorkflowEvent } from "@workspace/db/workflow-events";
import { triggerNotificationWorker } from "@/lib/notification-worker";
import {
  buildPlanningDayMapDataFromRows,
  createEmptyPlanningDayMapData,
  type PlanningDayMapData,
  type PlanningDayMapFilters,
  type PlanningDayMapRow,
} from "@/lib/planning/map-data";
import { recalculatePlanningRouteContexts } from "@/lib/planning/eta-engine";
import { safeRefreshPlanningRoutesForAssignment } from "@/lib/planning/route-refresh";
import { getRouteWithCache } from "@/lib/planning/routes/route-cache";
import {
  providerModeForVehicle,
  validateRouteCoordinates,
} from "@/lib/planning/routes/route-utils";
import type { RouteCoordinate } from "@/lib/planning/routes/types";
import {
  PLANNING_ROUTE_TRAVEL_MODES,
  type PlanningRouteTravelMode,
} from "@/lib/google-maps/planning-travel-modes";

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
  lifecycleVersion: number | null;
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

export type PlanningMapRouteCalculationResult =
  | {
      success: true;
      assignmentId: string;
      personnelId: string;
      travelMode: PlanningRouteTravelMode;
      providerMode: PlanningRouteTravelMode;
      origin: RouteCoordinate;
      destination: RouteCoordinate;
      originLabel: string;
      destinationLabel: string;
      distanceMeters: number | null;
      durationSeconds: number;
      staticDurationSeconds: number | null;
      trafficDelaySeconds: number | null;
      encodedPolyline: string | null;
      externalUrl: string;
      warnings: string[];
      cacheStatus: string;
      provider: string;
    }
  | {
      success: false;
      assignmentId: string;
      personnelId: string;
      travelMode: PlanningRouteTravelMode;
      providerMode: PlanningRouteTravelMode;
      code:
        | "forbidden"
        | "invalid_input"
        | "not_found"
        | "missing_origin"
        | "missing_destination"
        | "invalid_coordinates"
        | "transit_no_result"
        | "provider_error";
      message: string;
      retryable: boolean;
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
  actualStartedAt: string | null;
  actualCompletedAt: string | null;
  effectiveDate: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  effectiveStartAt: string | null;
  effectiveEndAt: string | null;
  endMode: EffectiveAssignmentInterval["endMode"];
  timeSource: EffectiveAssignmentInterval["source"];
  isRunning: boolean;
  hasTimeDeviation: boolean;
  timeDataQualityWarning: string | null;
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
  actualStartedAt: string | null;
  actualCompletedAt: string | null;
  effectiveDate: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  effectiveStartAt: string | null;
  effectiveEndAt: string | null;
  endMode: EffectiveAssignmentInterval["endMode"];
  timeSource: EffectiveAssignmentInterval["source"];
  isRunning: boolean;
  hasTimeDeviation: boolean;
  timeDataQualityWarning: string | null;
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
  planningSettings: { workdayStart: string; slotMinutes: number };
};

export type PlanningBoardScheduleInput = {
  assignmentId: string;
  personnelId: string;
  sourcePersonnelId?: string | null;
  date: string;
  start: string;
  end?: string | null;
  expectedUpdatedAt?: string | null;
};

export type PlanningBoardSaveMetadata = {
  status: "saved";
  mode: "schedule" | "move";
  requested: { date: string; start: string; end: string | null };
  saved: { date: string; start: string; end: string };
  autoAdjusted: boolean;
};

export type PlanningBoardStaleConflictMetadata = {
  code: "stale_assignment" | "stale_assignment_personnel";
  assignmentId: string;
  attempted: {
    personnelId: string;
    sourcePersonnelId: string | null;
    date: string;
    start: string;
    end: string;
  };
  current?: {
    assignedPersonnelIds?: string[];
  };
};

export type PlanningBoardScheduleResult =
  | {
      success: true;
      data: {
        warnings: PlanningBoardMatchReason[];
        save: PlanningBoardSaveMetadata;
      };
    }
  | {
      success: false;
      message: string;
      fieldErrors?: Record<string, string>;
      conflict?: PlanningBoardStaleConflictMetadata;
    };

const OPEN_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["plannable"];

class PlanningBoardSaveConflictError extends Error {
  constructor(readonly conflict: PlanningBoardStaleConflictMetadata) {
    super("Planning board save conflict");
  }
}

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

const PLANNING_SNAP_MINUTES = 5;

function alignToPlanningGrid(value: number, slotMinutes: number, workdayStart: string, mode: "nearest" | "up"): number {
  const interval = Math.max(1, Math.min(240, slotMinutes));
  const base = isTimeKey(workdayStart) ? timeToMinutes(workdayStart) : 0;
  const raw = (value - base) / interval;
  return base + (mode === "up" ? Math.ceil(raw) : Math.round(raw)) * interval;
}

function overlapsMinutes(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

function nextNonOverlappingStart(input: {
  preferredStart: string;
  durationMinutes: number;
  slotMinutes: number;
  workdayStart: string;
  movingAssignmentId: string;
  existingAssignments: Array<{ id: string; scheduledStart: string | null; scheduledEnd: string | null }>;
}): string {
  let start = alignToPlanningGrid(timeToMinutes(input.preferredStart), input.slotMinutes, input.workdayStart, "nearest");
  let changed = true;
  while (changed) {
    changed = false;
    const end = start + input.durationMinutes;
    for (const assignment of input.existingAssignments) {
      if (assignment.id === input.movingAssignmentId || !assignment.scheduledStart || !assignment.scheduledEnd) continue;
      const otherStart = timeToMinutes(assignment.scheduledStart);
      const otherEnd = timeToMinutes(assignment.scheduledEnd);
      if (overlapsMinutes(start, end, otherStart, otherEnd)) {
        start = alignToPlanningGrid(otherEnd, input.slotMinutes, input.workdayStart, "up");
        changed = true;
        break;
      }
    }
  }
  return minutesToTime(start);
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
        const certificate = item as { name?: unknown; expires_at?: unknown; expiresAt?: unknown };
        const expiresAt = certificate.expires_at ?? certificate.expiresAt;
        if (typeof expiresAt === "string" && isExpiredDate(expiresAt)) return "";
        return String(certificate.name ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

function isExpiredDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${value}T00:00:00`) < today;
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
    planningSettings: { workdayStart: "08:00", slotMinutes: 90 },
  };
  if (!canRead) return empty;

  const tenantId = await requireCurrentTenantId();
  const date =
    filters.date && isDateKey(filters.date) ? filters.date : todayDateKey();
  const statuses = normalizeStatuses(filters.statuses);

  const conditions = [
    eq(assignmentsTable.tenantId, tenantId),
    eq(assignmentsTable.isActive, true),
  ];
  const boardScope = or(
    and(
      isNull(assignmentsTable.actualStartedAt),
      eq(assignmentsTable.scheduledDate, date),
    ),
    sql<boolean>`(${assignmentsTable.actualStartedAt} at time zone 'Europe/Amsterdam')::date = ${date}::date`,
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
          and ${taskCodesTable.tenantId} = ${tenantId}
          and ${taskCodesTable.sectorId} = ${filters.sectorId}
      )`,
    );
    if (sectorCondition) conditions.push(sectorCondition);
  }

  if (filters.region) {
    conditions.push(ilike(assignmentsTable.requiredRegion, filters.region));
  }

  const personnelConditions = [
    eq(personnelTable.tenantId, tenantId),
    eq(personnelTable.isActive, true),
    eq(personnelTable.isAvailable, true),
  ];
  if (filters.sectorId) {
    personnelConditions.push(eq(personnelTable.sectorId, filters.sectorId));
  }

  const [assignmentRows, personnelRows, sectorRows, customerRows, [settingsRow]] =
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
          actualStartedAt: assignmentsTable.actualStartedAt,
          actualCompletedAt: assignmentsTable.actualCompletedAt,
          requiredRegion: assignmentsTable.requiredRegion,
          updatedAt: assignmentsTable.updatedAt,
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
          and(
            eq(assignmentsTable.customerId, customersTable.id),
            eq(customersTable.tenantId, tenantId),
          ),
        )
        .leftJoin(
          objectsTable,
          and(
            eq(assignmentsTable.objectId, objectsTable.id),
            eq(objectsTable.tenantId, tenantId),
          ),
        )
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
        .where(
          and(
            eq(customersTable.tenantId, tenantId),
            eq(customersTable.isActive, true),
          ),
        )
        .orderBy(asc(customersTable.name)),

      db
        .select({
          workdayStart: organizationSettingsTable.planningWorkdayStart,
          slotMinutes: organizationSettingsTable.planningTimeSlotMinutes,
        })
        .from(organizationSettingsTable)
        .where(eq(organizationSettingsTable.tenantId, tenantId))
        .limit(1),
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
              and(
                eq(assignmentTasksTable.taskCodeId, taskCodesTable.id),
                eq(taskCodesTable.tenantId, tenantId),
              ),
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
            .innerJoin(
              personnelTable,
              and(
                eq(assignmentPersonnelTable.personnelId, personnelTable.id),
                eq(personnelTable.tenantId, tenantId),
              ),
            )
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

  const boardRequiredRoleIds = uniqueStrings(
    [...requirementMap.values()].flatMap((requirements) => [
      ...requirements.requiredRoleIds,
    ]),
  );
  const roleQualificationRows =
    boardRequiredRoleIds.length > 0
      ? await db
          .select({
            roleId: roleQualificationsTable.roleId,
            type: qualificationItemsTable.type,
            name: qualificationItemsTable.name,
          })
          .from(roleQualificationsTable)
          .innerJoin(
            qualificationItemsTable,
            eq(roleQualificationsTable.qualificationId, qualificationItemsTable.id),
          )
          .where(
            and(
              inArray(roleQualificationsTable.roleId, boardRequiredRoleIds),
              eq(roleQualificationsTable.required, true),
              eq(qualificationItemsTable.isActive, true),
            ),
          )
      : [];

  for (const requirements of requirementMap.values()) {
    for (const qualification of roleQualificationRows) {
      if (!requirements.requiredRoleIds.has(qualification.roleId)) continue;
      if (qualification.type === "certificate") {
        requirements.requiredCertificates.add(qualification.name);
      } else if (qualification.type === "diploma") {
        requirements.requiredDiplomas.add(qualification.name);
      } else if (qualification.type === "knowledge") {
        requirements.requiredKnowledge.add(qualification.name);
      }
    }
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
  const projectionNow = new Date();
  const effectiveIntervalsByAssignment = new Map(
    assignmentRows.map((row) => [
      row.id,
      resolveAssignmentEffectiveInterval({
        scheduledDate: row.scheduledDate ?? null,
        scheduledStart: row.scheduledStart ?? null,
        scheduledEnd: row.scheduledEnd ?? null,
        actualStartedAt: row.actualStartedAt ?? null,
        actualCompletedAt: row.actualCompletedAt ?? null,
        status: row.status,
        now: projectionNow,
      }),
    ]),
  );
  const conflictAssignmentIds = new Set<string>();

  for (const link of linkRows) {
    const assignment = baseAssignmentsById.get(link.assignmentId);
    const interval = effectiveIntervalsByAssignment.get(link.assignmentId);
    if (!assignment || interval?.effectiveDate !== date) continue;
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
    const interval = effectiveIntervalsByAssignment.get(link.assignmentId);
    if (!assignment || interval?.effectiveDate !== date) continue;
    const list = assignmentsByPersonnel.get(link.personnelId) ?? [];
    list.push(assignment);
    assignmentsByPersonnel.set(link.personnelId, list);
  }

  for (const list of assignmentsByPersonnel.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const aInterval = effectiveIntervalsByAssignment.get(a.id);
        const bInterval = effectiveIntervalsByAssignment.get(b.id);
        if (
          aInterval &&
          bInterval &&
          effectiveAssignmentIntervalsOverlap(aInterval, bInterval)
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
      const requiredSlots = resolveRequiredSlots(
        row.requiredPersonnelCount,
        requiredRoleIds,
      );
      const timeProjection = effectiveIntervalsByAssignment.get(row.id)!;

      return {
        id: row.id,
        code: row.code,
        title: row.title,
        status: row.status as AssignmentStatus,
        priority: row.priority as AssignmentPriority,
        scheduledDate: row.scheduledDate ?? null,
        scheduledStart: timeProjection.plannedStart,
        scheduledEnd: timeProjection.plannedEnd,
        actualStartedAt: row.actualStartedAt?.toISOString() ?? null,
        actualCompletedAt: row.actualCompletedAt?.toISOString() ?? null,
        effectiveDate: timeProjection.effectiveDate,
        effectiveStart: timeProjection.effectiveStart,
        effectiveEnd: timeProjection.effectiveEnd,
        effectiveStartAt: timeProjection.effectiveStartAt,
        effectiveEndAt: timeProjection.effectiveEndAt,
        endMode: timeProjection.endMode,
        timeSource: timeProjection.source,
        isRunning: timeProjection.isRunning,
        hasTimeDeviation: timeProjection.hasDeviation,
        timeDataQualityWarning: timeProjection.dataQualityWarning,
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
    if (!assignment || assignment.effectiveDate !== date) continue;
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
      actualStartedAt: assignment.actualStartedAt,
      actualCompletedAt: assignment.actualCompletedAt,
      effectiveDate: assignment.effectiveDate,
      effectiveStart: assignment.effectiveStart,
      effectiveEnd: assignment.effectiveEnd,
      effectiveStartAt: assignment.effectiveStartAt,
      effectiveEndAt: assignment.effectiveEndAt,
      endMode: assignment.endMode,
      timeSource: assignment.timeSource,
      isRunning: assignment.isRunning,
      hasTimeDeviation: assignment.hasTimeDeviation,
      timeDataQualityWarning: assignment.timeDataQualityWarning,
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
      (a.effectiveStart ?? a.scheduledStart ?? "").localeCompare(b.effectiveStart ?? b.scheduledStart ?? ""),
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
            assignment.effectiveStart,
            assignment.effectiveEnd,
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
    (assignment) => assignment.effectiveDate === date,
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
    planningSettings: {
      workdayStart: settingsRow?.workdayStart ?? "08:00",
      slotMinutes: Math.max(15, Math.min(240, settingsRow?.slotMinutes ?? 90)),
    },
  };
}

function timestampValue(value: Date | string | null): number | null {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function ensurePlanningDayRouteContextsFresh(input: {
  tenantId: string;
  userId?: string | null;
  date: string;
  personnelId?: string | null;
}): Promise<void> {
  const conditions: SQL[] = [
    eq(assignmentsTable.tenantId, input.tenantId),
    eq(assignmentsTable.isActive, true),
    eq(assignmentsTable.scheduledDate, input.date),
    eq(assignmentPersonnelTable.status, "assigned"),
  ];

  if (input.personnelId) {
    conditions.push(eq(assignmentPersonnelTable.personnelId, input.personnelId));
  }

  const rows = await db
    .select({
      personnelId: assignmentPersonnelTable.personnelId,
      routeContextId: assignmentRouteContextsTable.id,
      contextCalculatedAt: assignmentRouteContextsTable.calculatedAt,
      warningCode: assignmentRouteContextsTable.warningCode,
      addressGeocodedAt: personnelTable.addressGeocodedAt,
      objectGeocodedAt: objectsTable.geocodedAt,
    })
    .from(assignmentsTable)
    .innerJoin(
      assignmentPersonnelTable,
      eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
    )
    .innerJoin(
      personnelTable,
      and(
        eq(assignmentPersonnelTable.personnelId, personnelTable.id),
        eq(personnelTable.tenantId, input.tenantId),
        eq(personnelTable.isActive, true),
      ),
    )
    .leftJoin(
      objectsTable,
      and(
        eq(assignmentsTable.objectId, objectsTable.id),
        eq(objectsTable.tenantId, input.tenantId),
      ),
    )
    .leftJoin(
      assignmentRouteContextsTable,
      and(
        eq(assignmentRouteContextsTable.tenantId, input.tenantId),
        eq(assignmentRouteContextsTable.assignmentId, assignmentsTable.id),
        eq(
          assignmentRouteContextsTable.personnelId,
          assignmentPersonnelTable.personnelId,
        ),
        eq(assignmentRouteContextsTable.scheduledDate, input.date),
      ),
    )
    .where(and(...conditions));

  const stalePersonnelIds = new Set<string>();
  for (const row of rows) {
    const contextCalculatedAt = timestampValue(row.contextCalculatedAt);
    const addressGeocodedAt = timestampValue(row.addressGeocodedAt);
    const addressIsNewer =
      addressGeocodedAt !== null &&
      (contextCalculatedAt === null || addressGeocodedAt > contextCalculatedAt);
    const objectGeocodedAt = timestampValue(row.objectGeocodedAt);
    const objectIsNewer =
      objectGeocodedAt !== null &&
      (contextCalculatedAt === null || objectGeocodedAt > contextCalculatedAt);
    const providerErrorCanUseMock =
      row.warningCode === "provider_error" &&
      process.env.FIELDGRID_ROUTE_PROVIDER !== "google";

    if (!row.routeContextId || addressIsNewer || objectIsNewer || providerErrorCanUseMock) {
      stalePersonnelIds.add(row.personnelId);
    }
  }

  for (const personnelId of stalePersonnelIds) {
    await recalculatePlanningRouteContexts({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      scheduledDate: input.date,
      personnelId,
    });
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePlanningRouteTravelMode(
  value: unknown,
): PlanningRouteTravelMode | null {
  if (typeof value !== "string") return null;
  return PLANNING_ROUTE_TRAVEL_MODES.includes(
    value as PlanningRouteTravelMode,
  )
    ? (value as PlanningRouteTravelMode)
    : null;
}

function numericCoordinateValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coordinateFromValues(
  lat: unknown,
  lng: unknown,
): RouteCoordinate | null {
  const parsedLat = numericCoordinateValue(lat);
  const parsedLng = numericCoordinateValue(lng);
  if (parsedLat === null || parsedLng === null) return null;
  return { lat: parsedLat, lng: parsedLng };
}

function joinAddressParts(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

function buildRouteDepartureTime(
  date: string | null,
  time: string | null,
): Date | undefined {
  if (!date || !time) return undefined;
  const candidate = new Date(`${date}T${time}:00`);
  return Number.isFinite(candidate.getTime()) ? candidate : undefined;
}

function mapsTravelMode(mode: PlanningRouteTravelMode): string {
  switch (mode) {
    case "BICYCLE":
      return "bicycling";
    case "WALK":
      return "walking";
    case "TRANSIT":
      return "transit";
    case "DRIVE":
    default:
      return "driving";
  }
}

function buildGoogleMapsDirectionsUrl(input: {
  origin: RouteCoordinate;
  destination: RouteCoordinate;
  travelMode: PlanningRouteTravelMode;
}): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${input.origin.lat},${input.origin.lng}`,
    destination: `${input.destination.lat},${input.destination.lng}`,
    travelmode: mapsTravelMode(input.travelMode),
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function routeMetaNumber(
  meta: Record<string, unknown> | undefined,
  key: string,
): number | null {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function calculatePlanningMapRoute(input: {
  assignmentId: string;
  personnelId: string;
  travelMode?: PlanningRouteTravelMode | string;
}): Promise<PlanningMapRouteCalculationResult> {
  const requestedMode = parsePlanningRouteTravelMode(input.travelMode);
  const fallbackMode = requestedMode ?? "DRIVE";

  if (!UUID_RE.test(input.assignmentId) || !UUID_RE.test(input.personnelId)) {
    return {
      success: false,
      assignmentId: input.assignmentId,
      personnelId: input.personnelId,
      travelMode: fallbackMode,
      providerMode: fallbackMode,
      code: "invalid_input",
      message: "Werkbon of medewerker is ongeldig.",
      retryable: false,
    };
  }

  const canRead = await hasPermission("planning", "read");
  if (!canRead) {
    return {
      success: false,
      assignmentId: input.assignmentId,
      personnelId: input.personnelId,
      travelMode: fallbackMode,
      providerMode: fallbackMode,
      code: "forbidden",
      message: "U heeft geen planningrechten om routes te berekenen.",
      retryable: false,
    };
  }

  const tenantId = await requireCurrentTenantId();
  const user = await getCurrentBackofficeUser();

  const [row] = await db
    .select({
      assignmentId: assignmentsTable.id,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      customerName: customersTable.name,
      customerAddress: customersTable.address,
      customerPostalCode: customersTable.postalCode,
      customerCity: customersTable.city,
      customerFormattedAddress: customersTable.formattedAddress,
      customerLat: customersTable.latitude,
      customerLng: customersTable.longitude,
      objectName: objectsTable.name,
      objectAddress: sql<string | null>`coalesce(${assignmentsTable.executionAddressLine1}, ${objectsTable.address})`,
      objectPostalCode: sql<string | null>`coalesce(${assignmentsTable.executionPostalCode}, ${objectsTable.postalCode})`,
      objectCity: sql<string | null>`coalesce(${assignmentsTable.executionCity}, ${objectsTable.city})`,
      objectFormattedAddress: sql<string | null>`coalesce(${assignmentsTable.executionFormattedAddress}, ${objectsTable.formattedAddress})`,
      objectLat: sql<string | null>`coalesce(${assignmentsTable.executionLatitude}, ${objectsTable.latitude})`,
      objectLng: sql<string | null>`coalesce(${assignmentsTable.executionLongitude}, ${objectsTable.longitude})`,
      personnelFirstName: personnelTable.firstName,
      personnelLastName: personnelTable.lastName,
      personnelVehicleType: personnelTable.vehicleType,
      personnelAddressStreet: personnelTable.addressStreet,
      personnelAddressPostalCode: personnelTable.addressPostalCode,
      personnelAddressCity: personnelTable.addressCity,
      personnelFormattedAddress: personnelTable.formattedAddress,
      personnelLat: personnelTable.addressLatitude,
      personnelLng: personnelTable.addressLongitude,
      routeOriginLat: assignmentRouteContextsTable.originLat,
      routeOriginLng: assignmentRouteContextsTable.originLng,
      routeDestinationLat: assignmentRouteContextsTable.destinationLat,
      routeDestinationLng: assignmentRouteContextsTable.destinationLng,
      routePreviousAssignmentId: assignmentRouteContextsTable.previousAssignmentId,
    })
    .from(assignmentsTable)
    .innerJoin(
      assignmentPersonnelTable,
      and(
        eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
        eq(assignmentPersonnelTable.personnelId, input.personnelId),
        eq(assignmentPersonnelTable.status, "assigned"),
      ),
    )
    .innerJoin(
      personnelTable,
      and(
        eq(personnelTable.id, assignmentPersonnelTable.personnelId),
        eq(personnelTable.tenantId, tenantId),
        eq(personnelTable.isActive, true),
      ),
    )
    .innerJoin(
      customersTable,
      and(
        eq(customersTable.id, assignmentsTable.customerId),
        eq(customersTable.tenantId, tenantId),
      ),
    )
    .leftJoin(
      objectsTable,
      and(
        eq(objectsTable.id, assignmentsTable.objectId),
        eq(objectsTable.tenantId, tenantId),
      ),
    )
    .leftJoin(
      assignmentRouteContextsTable,
      and(
        eq(assignmentRouteContextsTable.tenantId, tenantId),
        eq(assignmentRouteContextsTable.assignmentId, assignmentsTable.id),
        eq(assignmentRouteContextsTable.personnelId, input.personnelId),
        eq(assignmentRouteContextsTable.scheduledDate, assignmentsTable.scheduledDate),
      ),
    )
    .where(
      and(
        eq(assignmentsTable.id, input.assignmentId),
        eq(assignmentsTable.tenantId, tenantId),
        eq(assignmentsTable.isActive, true),
      ),
    )
    .limit(1);

  const travelMode =
    requestedMode ??
    parsePlanningRouteTravelMode(row?.personnelVehicleType) ??
    "DRIVE";
  const providerMode = providerModeForVehicle(travelMode) as PlanningRouteTravelMode;

  if (!row) {
    return {
      success: false,
      assignmentId: input.assignmentId,
      personnelId: input.personnelId,
      travelMode,
      providerMode,
      code: "not_found",
      message: "Werkbon of gekoppelde medewerker is niet gevonden.",
      retryable: false,
    };
  }

  const personnelName = `${row.personnelFirstName} ${row.personnelLastName}`.trim();
  const personnelAddress =
    row.personnelFormattedAddress ??
    joinAddressParts(
      row.personnelAddressStreet,
      [row.personnelAddressPostalCode, row.personnelAddressCity]
        .filter(Boolean)
        .join(" "),
    );
  const objectAddress =
    row.objectFormattedAddress ??
    joinAddressParts(
      row.objectAddress,
      [row.objectPostalCode, row.objectCity].filter(Boolean).join(" "),
    );
  const customerAddress =
    row.customerFormattedAddress ??
    joinAddressParts(
      row.customerAddress,
      [row.customerPostalCode, row.customerCity].filter(Boolean).join(" "),
    );

  const contextOrigin = coordinateFromValues(
    row.routeOriginLat,
    row.routeOriginLng,
  );
  const personnelOrigin = coordinateFromValues(
    row.personnelLat,
    row.personnelLng,
  );
  const firstStopUsesHome = !row.routePreviousAssignmentId;
  const origin = firstStopUsesHome
    ? personnelOrigin ?? contextOrigin
    : contextOrigin ?? personnelOrigin;
  const originFromHome = Boolean(
    personnelOrigin && (firstStopUsesHome || !contextOrigin),
  );
  if (!origin) {
    return {
      success: false,
      assignmentId: row.assignmentId,
      personnelId: input.personnelId,
      travelMode,
      providerMode,
      code: "missing_origin",
      message:
        "Vertreklocatie ontbreekt. Vul het huisadres van de medewerker aan of bereken routecontext vanuit een vorige werkbon.",
      retryable: false,
    };
  }

  const contextDestination = coordinateFromValues(
    row.routeDestinationLat,
    row.routeDestinationLng,
  );
  const objectDestination = coordinateFromValues(row.objectLat, row.objectLng);
  const destination = contextDestination ?? objectDestination;
  if (!destination) {
    return {
      success: false,
      assignmentId: row.assignmentId,
      personnelId: input.personnelId,
      travelMode,
      providerMode,
      code: "missing_destination",
      message:
        "Bestemmingslocatie ontbreekt. Vul de objectlocatie aan voordat de route kan worden berekend.",
      retryable: false,
    };
  }

  const coordinateError = validateRouteCoordinates(origin, destination);
  if (coordinateError) {
    return {
      success: false,
      assignmentId: row.assignmentId,
      personnelId: input.personnelId,
      travelMode,
      providerMode,
      code: "invalid_coordinates",
      message: coordinateError,
      retryable: false,
    };
  }

  const route = await getRouteWithCache({
    tenantId,
    userId: user?.id ?? null,
    origin,
    destination,
    vehicleType: travelMode,
    departureTime: buildRouteDepartureTime(
      row.scheduledDate,
      row.scheduledStart,
    ),
  });

  if (!route.success) {
    return {
      success: false,
      assignmentId: row.assignmentId,
      personnelId: input.personnelId,
      travelMode,
      providerMode,
      code: providerMode === "TRANSIT" ? "transit_no_result" : "provider_error",
      message:
        providerMode === "TRANSIT"
          ? "Geen OV-route gevonden voor deze medewerker en werkbon. Kies handmatig een ander vervoersmiddel als u toch wilt vergelijken."
          : route.error,
      retryable: route.retryable,
    };
  }

  const providerMeta = route.providerMeta ?? {};
  const staticDurationSeconds = routeMetaNumber(
    providerMeta,
    "staticDurationSeconds",
  );
  const trafficDelaySeconds =
    providerMode === "DRIVE"
      ? routeMetaNumber(providerMeta, "trafficDelaySeconds") ??
        (staticDurationSeconds === null
          ? null
          : Math.max(0, route.durationSeconds - staticDurationSeconds))
      : null;
  const encodedPolyline =
    typeof providerMeta.encodedPolyline === "string"
      ? providerMeta.encodedPolyline
      : null;

  return {
    success: true,
    assignmentId: row.assignmentId,
    personnelId: input.personnelId,
    travelMode,
    providerMode,
    origin,
    destination,
    originLabel: originFromHome
      ? `Huisadres ${personnelName || "medewerker"}${personnelAddress ? ` - ${personnelAddress}` : ""}`
      : row.routePreviousAssignmentId
        ? "Vorige werkbon"
        : "Routecontext",
    destinationLabel:
      row.objectName && (objectAddress || contextDestination)
        ? `${row.objectName}${objectAddress ? ` - ${objectAddress}` : ""}`
        : `${row.customerName}${customerAddress ? ` - ${customerAddress}` : ""}`,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    staticDurationSeconds,
    trafficDelaySeconds,
    encodedPolyline,
    externalUrl: buildGoogleMapsDirectionsUrl({
      origin,
      destination,
      travelMode,
    }),
    warnings: route.warnings,
    cacheStatus: route.cacheStatus,
    provider: route.provider,
  };
}

export async function getPlanningDayMapData(
  filters: PlanningDayMapFilters = {},
): Promise<PlanningDayMapData> {
  const date =
    filters.date && isDateKey(filters.date) ? filters.date : todayDateKey();
  const canRead = await hasPermission("planning", "read");
  if (!canRead) {
    return createEmptyPlanningDayMapData(date, { accessDenied: true });
  }

  const tenantId = await requireCurrentTenantId();
  // Routecontext wordt hier bewust niet meer automatisch berekend.
  // Google Routes-calls lopen uitsluitend via expliciete gebruikersactie in de kaart.

  const conditions: SQL[] = [
    eq(assignmentsTable.tenantId, tenantId),
    eq(assignmentsTable.isActive, true),
    eq(assignmentsTable.scheduledDate, date),
    eq(assignmentPersonnelTable.status, "assigned"),
  ];

  if (filters.personnelId) {
    conditions.push(eq(assignmentPersonnelTable.personnelId, filters.personnelId));
  }

  if (filters.status && ASSIGNMENT_STATUSES.includes(filters.status)) {
    conditions.push(eq(assignmentsTable.status, filters.status));
  }

  const rows = await db
    .select({
      assignmentId: assignmentsTable.id,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      priority: assignmentsTable.priority,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      customerId: assignmentsTable.customerId,
      customerName: customersTable.name,
      objectId: assignmentsTable.objectId,
      objectName: objectsTable.name,
      objectAddress: sql<string | null>`coalesce(${assignmentsTable.executionAddressLine1}, ${objectsTable.address})`,
      objectPostalCode: sql<string | null>`coalesce(${assignmentsTable.executionPostalCode}, ${objectsTable.postalCode})`,
      objectCity: sql<string | null>`coalesce(${assignmentsTable.executionCity}, ${objectsTable.city})`,
      objectFormattedAddress: sql<string | null>`coalesce(${assignmentsTable.executionFormattedAddress}, ${objectsTable.formattedAddress})`,
      requiredRegion: assignmentsTable.requiredRegion,
      objectLat: sql<string | null>`coalesce(${assignmentsTable.executionLatitude}, ${objectsTable.latitude})`,
      objectLng: sql<string | null>`coalesce(${assignmentsTable.executionLongitude}, ${objectsTable.longitude})`,
      customerLat: customersTable.latitude,
      customerLng: customersTable.longitude,
      personnelId: assignmentPersonnelTable.personnelId,
      personnelFirstName: personnelTable.firstName,
      personnelLastName: personnelTable.lastName,
      personnelRegion: personnelTable.region,
      personnelVehicleType: personnelTable.vehicleType,
      routeContextId: assignmentRouteContextsTable.id,
      previousAssignmentId: assignmentRouteContextsTable.previousAssignmentId,
      sequenceIndex: assignmentRouteContextsTable.sequenceIndex,
      originLat: assignmentRouteContextsTable.originLat,
      originLng: assignmentRouteContextsTable.originLng,
      destinationLat: assignmentRouteContextsTable.destinationLat,
      destinationLng: assignmentRouteContextsTable.destinationLng,
      travelDurationSeconds: assignmentRouteContextsTable.travelDurationSeconds,
      travelDistanceMeters: assignmentRouteContextsTable.travelDistanceMeters,
      bufferMinutes: assignmentRouteContextsTable.bufferMinutes,
      computedEarliestStart: assignmentRouteContextsTable.computedEarliestStart,
      customerWindowStart: assignmentRouteContextsTable.customerWindowStart,
      customerWindowEnd: assignmentRouteContextsTable.customerWindowEnd,
      snapStatus: assignmentRouteContextsTable.snapStatus,
      snapSuggestedStart: assignmentRouteContextsTable.snapSuggestedStart,
      snapSuggestedEnd: assignmentRouteContextsTable.snapSuggestedEnd,
      warningCode: assignmentRouteContextsTable.warningCode,
      warningMessage: assignmentRouteContextsTable.warningMessage,
    })
    .from(assignmentsTable)
    .innerJoin(
      assignmentPersonnelTable,
      eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
    )
    .innerJoin(
      personnelTable,
      and(
        eq(assignmentPersonnelTable.personnelId, personnelTable.id),
        eq(personnelTable.tenantId, tenantId),
        eq(personnelTable.isActive, true),
      ),
    )
    .leftJoin(
      customersTable,
      and(
        eq(assignmentsTable.customerId, customersTable.id),
        eq(customersTable.tenantId, tenantId),
      ),
    )
    .leftJoin(
      objectsTable,
      and(
        eq(assignmentsTable.objectId, objectsTable.id),
        eq(objectsTable.tenantId, tenantId),
      ),
    )
    .leftJoin(
      assignmentRouteContextsTable,
      and(
        eq(assignmentRouteContextsTable.tenantId, tenantId),
        eq(assignmentRouteContextsTable.assignmentId, assignmentsTable.id),
        eq(
          assignmentRouteContextsTable.personnelId,
          assignmentPersonnelTable.personnelId,
        ),
        eq(assignmentRouteContextsTable.scheduledDate, date),
      ),
    )
    .where(and(...conditions));

  return buildPlanningDayMapDataFromRows(rows as PlanningDayMapRow[], {
    date,
    filters,
  });
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
  const tenantId = await requireCurrentTenantId();

  const [assignmentRow] = await db
    .select({
      scheduledDate: assignmentsTable.scheduledDate,
      requiredRegion: assignmentsTable.requiredRegion,
    })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!assignmentRow) return null;

  const [taskRows, personnelRows, assignedRows] =
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
          and(
            eq(assignmentTasksTable.taskCodeId, taskCodesTable.id),
            eq(taskCodesTable.tenantId, tenantId),
          ),
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
        .where(
          and(
            eq(personnelTable.tenantId, tenantId),
            eq(personnelTable.isActive, true),
          ),
        )
        .orderBy(personnelTable.lastName),

      db
        .select({
          linkId: assignmentPersonnelTable.id,
          personnelId: assignmentPersonnelTable.personnelId,
          lifecycleVersion: assignmentPersonnelTable.lifecycleVersion,
        })
        .from(assignmentPersonnelTable)
        .innerJoin(
          personnelTable,
          and(
            eq(assignmentPersonnelTable.personnelId, personnelTable.id),
            eq(personnelTable.tenantId, tenantId),
          ),
        )
        .where(
          and(
            eq(assignmentPersonnelTable.assignmentId, assignmentId),
            eq(assignmentPersonnelTable.status, "assigned"),
          ),
        ),
    ]);

  const assignedMap = new Map(
    assignedRows.map((r) => [r.personnelId, { linkId: r.linkId, lifecycleVersion: r.lifecycleVersion }]),
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
  const roleQualificationRows =
    requiredRoleIds.length > 0
      ? await db
          .select({
            type: qualificationItemsTable.type,
            name: qualificationItemsTable.name,
          })
          .from(roleQualificationsTable)
          .innerJoin(
            qualificationItemsTable,
            eq(roleQualificationsTable.qualificationId, qualificationItemsTable.id),
          )
          .where(
            and(
              inArray(roleQualificationsTable.roleId, requiredRoleIds),
              eq(roleQualificationsTable.required, true),
              eq(qualificationItemsTable.isActive, true),
            ),
          )
      : [];
  const requiredCertificates = uniqueStrings([
    ...taskRows.flatMap((r) => (r.requiredCertificates as string[] | null) ?? []),
    ...roleQualificationRows.filter((row) => row.type === "certificate").map((row) => row.name),
  ]);
  const requiredKnowledge = uniqueStrings([
    ...taskRows.flatMap((r) => (r.requiredKnowledge as string[] | null) ?? []),
    ...roleQualificationRows.filter((row) => row.type === "knowledge").map((row) => row.name),
  ]);
  const requiredDiplomas = uniqueStrings([
    ...taskRows
      .map((r) => r.requiredDiploma)
      .filter((d): d is string => d !== null && d !== undefined),
    ...roleQualificationRows.filter((row) => row.type === "diploma").map((row) => row.name),
  ]);

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
      linkId: assignedMap.get(r.id)?.linkId ?? null,
      lifecycleVersion: assignedMap.get(r.id)?.lifecycleVersion ?? null,
      firstName: r.firstName,
      lastName: r.lastName,
      roleId: r.roleId ?? null,
      roleName: r.roleName ?? null,
      sectorId: r.sectorId ?? null,
      sectorName: r.sectorName ?? null,
      region: r.region ?? null,
      certificates: certNames(r.certificates),
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
  reason: string,
  expectedVersion?: number,
): Promise<ActionResult> {
  await requirePermission("assignments", "write");
  const tenantId = await requireCurrentTenantId();
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    return { success: false, message: "Een reden voor ontkoppelen is verplicht." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  try {
    const staffing = await transitionAssignmentStaffing({
      tenantId,
      assignmentId,
      personnelId,
      actorUserId: user.id,
      action: "unassign",
      reason: normalizedReason,
      expectedVersion,
    });
    await reconcileAssignmentChecklistsRecoverably({
      tenantId,
      assignmentId,
      trigger: "assignment_staffing_changed",
      idempotencyKey: `assignment-staffing:${staffing.assignmentPersonnelId}:${staffing.lifecycleVersion}`,
      actorUserId: user.id,
    });

    await safeRefreshPlanningRoutesForAssignment({
      tenantId,
      assignmentId,
      reason: "assignment_unassigned",
      status: staffing.assignmentStatus,
      personnelIds: [personnelId],
      source: "backoffice",
    });
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Ontkoppelen mislukt.",
    };
  }

  revalidatePath("/planning");
  revalidatePath(`/assignments/${assignmentId}`);
  return { success: true };
}

async function rebalancePersonnelDaySchedule(params: {
  tenantId: string;
  personnelId: string;
  actorUserId: string;
  changedAssignmentId: string;
  date: string;
}): Promise<PlanningBoardMatchReason[]> {
  const warnings: PlanningBoardMatchReason[] = [];
  const rows = await db
    .select({
      assignmentId: assignmentsTable.id,
      title: assignmentsTable.title,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      status: assignmentsTable.status,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, and(
      eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
      eq(assignmentsTable.tenantId, params.tenantId),
    ))
    .where(and(
      eq(assignmentPersonnelTable.personnelId, params.personnelId),
      eq(assignmentPersonnelTable.status, "assigned"),
      eq(assignmentsTable.scheduledDate, params.date),
    ))
    .orderBy(asc(assignmentsTable.scheduledStart));

  const [availability] = await db
    .select({ startTime: availabilityDayEntriesTable.startTime, endTime: availabilityDayEntriesTable.endTime })
    .from(availabilityDayEntriesTable)
    .where(and(
      eq(availabilityDayEntriesTable.personnelId, params.personnelId),
      eq(availabilityDayEntriesTable.date, params.date),
    ))
    .limit(1);
  const fallbackEnd = availability?.endTime ?? "23:59";
  const availableEnd = timeToMinutes(fallbackEnd);

  let cursor: number | null = null;
  for (const row of rows) {
    const startMin = row.scheduledStart ? timeToMinutes(row.scheduledStart) : null;
    const endMin = row.scheduledEnd ? timeToMinutes(row.scheduledEnd) : null;
    if (startMin === null || endMin === null || endMin <= startMin) continue;
    const duration = endMin - startMin;
    const nextStart: number = cursor === null ? startMin : Math.max(startMin, cursor);
    const nextEnd: number = nextStart + duration;

    if (nextEnd > availableEnd + 30) {
      try {
        const staffing = await transitionAssignmentStaffing({
          tenantId: params.tenantId,
          assignmentId: row.assignmentId,
          personnelId: params.personnelId,
          actorUserId: params.actorUserId,
          action: "unassign",
          reason: "Automatische herplanning: inzet valt buiten het beschikbaarheidsvenster.",
        });
        await reconcileAssignmentChecklistsRecoverably({
          tenantId: params.tenantId,
          assignmentId: row.assignmentId,
          trigger: "assignment_staffing_changed",
          idempotencyKey: `assignment-staffing:${staffing.assignmentPersonnelId}:${staffing.lifecycleVersion}`,
          actorUserId: params.actorUserId,
        });

        if (staffing.assignedCount === 0) {
          warnings.push(buildReason("outside_availability_window", row.title + " is teruggezet naar planbaar: eindtijd valt meer dan 30 minuten buiten beschikbaarheid.", "warning"));
        } else {
          warnings.push(buildReason("outside_availability_window", row.title + " heeft te weinig personeel: deze medewerker valt buiten beschikbaarheid.", "warning"));
        }
      } catch (error) {
        warnings.push(buildReason(
          "outside_availability_window",
          row.title + " blijft ingepland omdat de uitvoering al is gestart of de planning intussen is gewijzigd: " + (error instanceof Error ? error.message : "ontkoppelen mislukt"),
          "warning",
        ));
        cursor = nextEnd;
      }
      continue;
    }

    if (nextStart !== startMin || nextEnd !== endMin) {
      await db.update(assignmentsTable).set({
        scheduledStart: minutesToTime(nextStart),
        scheduledEnd: minutesToTime(nextEnd),
        status: row.status === "plannable" ? "scheduled" : row.status,
        updatedAt: new Date(),
      }).where(and(
        eq(assignmentsTable.id, row.assignmentId),
        eq(assignmentsTable.tenantId, params.tenantId),
      ));
      if (row.assignmentId !== params.changedAssignmentId) {
        warnings.push(buildReason("already_booked", `${row.title} is automatisch doorgeschoven naar ${minutesToTime(nextStart)}-${minutesToTime(nextEnd)}.`, "warning"));
      }
    }
    cursor = nextEnd;
  }

  return warnings;
}

export async function scheduleAssignmentOnBoard(
  input: PlanningBoardScheduleInput,
): Promise<PlanningBoardScheduleResult> {
  await requirePermission("planning", "write");
  const tenantId = await requireCurrentTenantId();

  const assignmentId = input.assignmentId.trim();
  const personnelId = input.personnelId.trim();
  const sourcePersonnelId = input.sourcePersonnelId?.trim() || null;
  const date = input.date.trim();
  let start = input.start.trim();

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
          scheduledDate: assignmentsTable.scheduledDate,
          customerId: assignmentsTable.customerId,
          customerName: customersTable.name,
          customerSectorId: customersTable.sectorId,
          objectId: assignmentsTable.objectId,
          objectName: objectsTable.name,
          objectSectorId: objectsTable.sectorId,
          requiredRegion: assignmentsTable.requiredRegion,
          updatedAt: assignmentsTable.updatedAt,
        })
        .from(assignmentsTable)
        .leftJoin(
          customersTable,
          and(
            eq(assignmentsTable.customerId, customersTable.id),
            eq(customersTable.tenantId, tenantId),
          ),
        )
        .leftJoin(
          objectsTable,
          and(
            eq(assignmentsTable.objectId, objectsTable.id),
            eq(objectsTable.tenantId, tenantId),
          ),
        )
        .where(
          and(
            eq(assignmentsTable.id, assignmentId),
            eq(assignmentsTable.tenantId, tenantId),
          ),
        )
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
        .where(
          and(
            eq(personnelTable.id, personnelId),
            eq(personnelTable.tenantId, tenantId),
          ),
        )
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
          and(
            eq(assignmentTasksTable.taskCodeId, taskCodesTable.id),
            eq(taskCodesTable.tenantId, tenantId),
          ),
        )
        .leftJoin(rolesTable, eq(taskCodesTable.requiredRoleId, rolesTable.id))
        .where(eq(assignmentTasksTable.assignmentId, assignmentId)),

      db
        .select({
          id: assignmentPersonnelTable.id,
          personnelId: assignmentPersonnelTable.personnelId,
        })
        .from(assignmentPersonnelTable)
        .innerJoin(
          personnelTable,
          and(
            eq(assignmentPersonnelTable.personnelId, personnelTable.id),
            eq(personnelTable.tenantId, tenantId),
          ),
        )
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

  const allowedStatuses: AssignmentStatus[] = ["plannable", "scheduled", "seen", "en_route", "in_progress"];
  if (!allowedStatuses.includes(assignment.status as AssignmentStatus)) {
    return {
      success: false,
      message: `Alleen planbare, ingeplande of actieve werkbonnen kunnen via het planbord worden geplaatst (huidige status: ${assignment.status}).`,
    };
  }

  const requiredRoleIds = uniqueStrings(
    taskRows.map((row) => row.requiredRoleId),
  );
  const requiredRoleNames = uniqueStrings(
    taskRows.map((row) => row.requiredRoleName),
  );
  const roleQualificationRows =
    requiredRoleIds.length > 0
      ? await db
          .select({
            type: qualificationItemsTable.type,
            name: qualificationItemsTable.name,
          })
          .from(roleQualificationsTable)
          .innerJoin(
            qualificationItemsTable,
            eq(roleQualificationsTable.qualificationId, qualificationItemsTable.id),
          )
          .where(
            and(
              inArray(roleQualificationsTable.roleId, requiredRoleIds),
              eq(roleQualificationsTable.required, true),
              eq(qualificationItemsTable.isActive, true),
            ),
          )
      : [];
  const requiredCertificates = uniqueStrings([
    ...taskRows.flatMap((row) => (row.requiredCertificates ?? []) as string[]),
    ...roleQualificationRows.filter((row) => row.type === "certificate").map((row) => row.name),
  ]);
  const requiredKnowledge = uniqueStrings([
    ...taskRows.flatMap((row) => (row.requiredKnowledge ?? []) as string[]),
    ...roleQualificationRows.filter((row) => row.type === "knowledge").map((row) => row.name),
  ]);
  const requiredDiplomas = uniqueStrings([
    ...taskRows.map((row) => row.requiredDiploma),
    ...roleQualificationRows.filter((row) => row.type === "diploma").map((row) => row.name),
  ]);
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


  const [
    availabilityMap,
    [availabilityDayEntry],
    [availabilityWindow],
    existingRows,
    [settingsRow],
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
        scheduledDate: assignmentsTable.scheduledDate,
        customerName: customersTable.name,
        objectName: objectsTable.name,
        scheduledStart: assignmentsTable.scheduledStart,
        scheduledEnd: assignmentsTable.scheduledEnd,
        actualStartedAt: assignmentsTable.actualStartedAt,
        actualCompletedAt: assignmentsTable.actualCompletedAt,
      })
      .from(assignmentPersonnelTable)
      .innerJoin(
        assignmentsTable,
        and(
          eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
          eq(assignmentsTable.tenantId, tenantId),
        ),
      )
      .leftJoin(
        customersTable,
        and(
          eq(assignmentsTable.customerId, customersTable.id),
          eq(customersTable.tenantId, tenantId),
        ),
      )
      .leftJoin(
        objectsTable,
        and(
          eq(assignmentsTable.objectId, objectsTable.id),
          eq(objectsTable.tenantId, tenantId),
        ),
      )
      .where(
        and(
          eq(assignmentPersonnelTable.personnelId, personnelId),
          eq(assignmentPersonnelTable.status, "assigned"),
          or(
            and(
              isNull(assignmentsTable.actualStartedAt),
              eq(assignmentsTable.scheduledDate, date),
            ),
            sql<boolean>`(${assignmentsTable.actualStartedAt} at time zone 'Europe/Amsterdam')::date = ${date}::date`,
          ),
          ne(assignmentsTable.id, assignmentId),
        ),
      ),

    db
      .select({
        workdayStart: organizationSettingsTable.planningWorkdayStart,
        slotMinutes: organizationSettingsTable.planningTimeSlotMinutes,
      })
      .from(organizationSettingsTable)
      .where(eq(organizationSettingsTable.tenantId, tenantId))
      .limit(1),
  ]);

  const planningSlotMinutes = Math.max(15, Math.min(240, settingsRow?.slotMinutes ?? 90));
  const planningWorkdayStart = settingsRow?.workdayStart ?? "08:00";
  const requestedStart = start;
  const requestedEnd = input.end?.trim() && isTimeKey(input.end.trim())
    ? input.end.trim()
    : null;
  const requestedDuration = requestedEnd
    ? timeToMinutes(requestedEnd) - timeToMinutes(start)
    : estimatedDurationMinutes;
  const duration = Math.max(15, requestedDuration);
  const projectionNow = new Date();
  const existingIntervals = existingRows.map((row) => ({
    row,
    interval: resolveAssignmentEffectiveInterval({
      scheduledDate: row.scheduledDate ?? null,
      scheduledStart: row.scheduledStart ?? null,
      scheduledEnd: row.scheduledEnd ?? null,
      actualStartedAt: row.actualStartedAt ?? null,
      actualCompletedAt: row.actualCompletedAt ?? null,
      status: row.status,
      now: projectionNow,
    }),
  }));
  start = nextNonOverlappingStart({
    preferredStart: start,
    durationMinutes: duration,
    slotMinutes: PLANNING_SNAP_MINUTES,
    workdayStart: planningWorkdayStart,
    movingAssignmentId: assignmentId,
    existingAssignments: existingIntervals.map(({ row, interval }) => ({
      id: row.id,
      scheduledStart: interval.effectiveStart,
      scheduledEnd: interval.effectiveEnd,
    })),
  });
  const end = addMinutes(start, duration);
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

  const sectorId =
    assignment.objectSectorId ??
    assignment.customerSectorId ??
    taskSectorIds[0] ??
    null;
  const syntheticInterval = resolveAssignmentEffectiveInterval({
    scheduledDate: date,
    scheduledStart: start,
    scheduledEnd: end,
    actualStartedAt: null,
    actualCompletedAt: null,
    status: assignment.status,
    now: projectionNow,
  });
  const syntheticAssignment: PlanningBoardAssignment = {
    id: assignment.id,
    code: assignment.code,
    title: assignment.title,
    status: assignment.status as AssignmentStatus,
    priority: assignment.priority as AssignmentPriority,
    scheduledDate: date,
    scheduledStart: start,
    scheduledEnd: end,
    actualStartedAt: null,
    actualCompletedAt: null,
    effectiveDate: syntheticInterval.effectiveDate,
    effectiveStart: syntheticInterval.effectiveStart,
    effectiveEnd: syntheticInterval.effectiveEnd,
    effectiveStartAt: syntheticInterval.effectiveStartAt,
    effectiveEndAt: syntheticInterval.effectiveEndAt,
    endMode: syntheticInterval.endMode,
    timeSource: syntheticInterval.source,
    isRunning: syntheticInterval.isRunning,
    hasTimeDeviation: syntheticInterval.hasDeviation,
    timeDataQualityWarning: syntheticInterval.dataQualityWarning,
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
    hasConflict: existingIntervals.some(({ interval }) =>
      effectiveAssignmentIntervalsOverlap(syntheticInterval, interval),
    ),
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
    personnelAssignments: existingIntervals.map(({ row, interval }) => ({
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
      actualStartedAt: row.actualStartedAt?.toISOString() ?? null,
      actualCompletedAt: row.actualCompletedAt?.toISOString() ?? null,
      effectiveDate: interval.effectiveDate,
      effectiveStart: interval.effectiveStart,
      effectiveEnd: interval.effectiveEnd,
      effectiveStartAt: interval.effectiveStartAt,
      effectiveEndAt: interval.effectiveEndAt,
      endMode: interval.endMode,
      timeSource: interval.source,
      isRunning: interval.isRunning,
      hasTimeDeviation: interval.hasDeviation,
      timeDataQualityWarning: interval.dataQualityWarning,
      estimatedDurationMinutes: durationMinutes(
        interval.effectiveStart,
        interval.effectiveEnd,
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
  let nextStatus: AssignmentStatus = assignment.status as AssignmentStatus;

  try {
    await db.transaction(async (tx) => {
      const [updatedAssignment] = await tx
        .update(assignmentsTable)
        .set({
          scheduledDate: date,
          scheduledStart: start,
          scheduledEnd: end,
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(assignmentsTable.id, assignmentId),
            eq(assignmentsTable.tenantId, tenantId),
            eq(assignmentsTable.updatedAt, assignment.updatedAt),
          ),
        )
        .returning({ id: assignmentsTable.id });

      if (!updatedAssignment) {
        throw new PlanningBoardSaveConflictError({
          code: "stale_assignment",
          assignmentId,
          attempted: {
            personnelId,
            sourcePersonnelId,
            date,
            start,
            end,
          },
        });
      }

      const currentLinks = await tx
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
        );
      const currentPersonnelIds = currentLinks.map((row) => row.personnelId);
      const currentTargetLink = currentLinks.find(
        (row) => row.personnelId === personnelId,
      );
      const currentSourceLink = sourcePersonnelId
        ? currentLinks.find((row) => row.personnelId === sourcePersonnelId)
        : null;

      if (sourcePersonnelId && !currentSourceLink) {
        throw new PlanningBoardSaveConflictError({
          code: "stale_assignment_personnel",
          assignmentId,
          attempted: {
            personnelId,
            sourcePersonnelId,
            date,
            start,
            end,
          },
          current: { assignedPersonnelIds: currentPersonnelIds },
        });
      }

      if (
        !sourcePersonnelId &&
        !currentTargetLink &&
        currentLinks.length >= requiredSlots
      ) {
        throw new PlanningBoardSaveConflictError({
          code: "stale_assignment_personnel",
          assignmentId,
          attempted: {
            personnelId,
            sourcePersonnelId,
            date,
            start,
            end,
          },
          current: { assignedPersonnelIds: currentPersonnelIds },
        });
      }

      if (sourcePersonnelId && sourcePersonnelId !== personnelId && currentSourceLink) {
        await tx.execute(sql`
          SELECT * FROM public.transition_assignment_staffing(
            ${tenantId}::uuid,
            ${assignmentId}::uuid,
            ${sourcePersonnelId}::uuid,
            ${user.id}::uuid,
            'unassign',
            'Herplanning op het planbord: vervangen door een andere medewerker.',
            NULL
          )
        `);
      }

      if (!currentTargetLink) {
        await tx.execute(sql`
          SELECT * FROM public.transition_assignment_staffing(
            ${tenantId}::uuid,
            ${assignmentId}::uuid,
            ${personnelId}::uuid,
            ${user.id}::uuid,
            'assign',
            NULL,
            NULL
          )
        `);
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
          save: {
            status: "saved",
            requested: { date, start: requestedStart, end: requestedEnd },
            saved: { date, start, end },
            autoAdjusted: requestedStart !== start || (requestedEnd !== null && requestedEnd !== end),
          },
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
    if (err instanceof PlanningBoardSaveConflictError) {
      return {
        success: false,
        message:
          "Deze planning is ondertussen gewijzigd. Vernieuw het planbord en probeer opnieuw.",
        conflict: err.conflict,
      };
    }
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

  warnings.push(...await rebalancePersonnelDaySchedule({ tenantId, personnelId, actorUserId: user.id, changedAssignmentId: assignmentId, date }));

  const [projectedAssignment] = await db
    .select({ status: assignmentsTable.status })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);
  nextStatus = (projectedAssignment?.status ?? assignment.status) as AssignmentStatus;

  await reconcileAssignmentChecklistsRecoverably({
    tenantId,
    assignmentId,
    trigger: "assignment_scheduled",
    idempotencyKey: `planning-board:${assignmentId}:${assignment.updatedAt.toISOString()}`,
    actorUserId: user.id,
  });

  await safeRefreshPlanningRoutesForAssignment({
    tenantId,
    assignmentId,
    reason: "planning_board_schedule",
    previousScheduledDate: assignment.scheduledDate,
    status: nextStatus,
    personnelIds: [personnelId, sourcePersonnelId].filter((value): value is string => Boolean(value)),
    source: "backoffice",
  });

  revalidatePath("/planning");
  revalidatePath(`/assignments/${assignmentId}`);

  try {
    await emitAssignmentWorkflowEvent({
      eventKey: sourcePersonnelId ? "assignment_rescheduled" : "assignment_assigned",
      assignmentId,
      actorUserId: user.id,
      audience: "personnel",
      recipients: { personnelIds: [personnelId] },
      fallback: {
        title: sourcePersonnelId
          ? `Werkbon ${assignment.code} verplaatst`
          : `Werkbon ${assignment.code} ingepland`,
        body: `Je planning is bijgewerkt: ${date} van ${start} tot ${end}.`,
        pushTitle: sourcePersonnelId
          ? `Werkbon ${assignment.code} verplaatst`
          : `Werkbon ${assignment.code} ingepland`,
        pushBody: `${date} ${start}-${end}. Bekijk je planning.`,
        priority: date === new Date().toISOString().slice(0, 10) ? "high" : "normal",
      },
    });
    await triggerNotificationWorker({ channels: ["push"], limit: 25 });
  } catch (error) {
    console.error("planning assignment notification failed", {
      assignmentId,
      personnelId,
      error,
    });
  }

  return {
    success: true,
    data: {
      warnings,
      save: {
        status: "saved",
        mode: sourcePersonnelId ? "move" : "schedule",
        requested: { date, start: requestedStart, end: requestedEnd },
        saved: { date, start, end },
        autoAdjusted: requestedStart !== start || (requestedEnd !== null && requestedEnd !== end),
      },
    },
  };
}
