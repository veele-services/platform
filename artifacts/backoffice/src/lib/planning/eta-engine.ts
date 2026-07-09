import "server-only";

import {
  assignmentPersonnelTable,
  assignmentRouteContextsTable,
  assignmentsTable,
  customersTable,
  db,
  objectsTable,
  organizationSettingsTable,
  personnelTable,
  type AssignmentStatus,
  type InsertAssignmentRouteContext,
  type PersonnelVehicleType,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  computeEtaSnapSuggestion,
  dateTimeForTime,
  getRouteBufferMinutes,
  isDateKey,
  isTimeKey,
  selectDepartureTime,
  sortEtaAssignmentsForPersonnel,
  type EtaAssignmentForSequence,
  type EtaPlanningSettings,
} from "./eta-rules";
import { getRouteWithCache } from "./routes/route-cache";
import {
  coordinateNumericValue,
  parseCoordinateNumeric,
} from "./routes/route-utils";
import type {
  RouteCoordinate,
  RouteProvider,
  RouteVehicleType,
} from "./routes/types";

const DEFAULT_PLANNING_SETTINGS: EtaPlanningSettings & {
  routeCacheTtlHours: number;
} = {
  planningWorkdayStart: "08:00",
  planningTimeSlotMinutes: 90,
  routeBufferMinutesCar: 10,
  routeBufferMinutesBicycle: 5,
  routeBufferMinutesWalking: 5,
  routeBufferMinutesMopedOrScooter: 8,
  routeBufferMinutesPublicTransport: 15,
  routeCacheTtlHours: 24,
};

type RecalculatePlanningRouteContextsInput = {
  tenantId: string;
  scheduledDate: string;
  personnelId?: string | null;
  now?: Date;
  routeProvider?: RouteProvider;
};

type RecalculatePlanningRouteContextsResult = {
  personnelCount: number;
  assignmentCount: number;
  contextCount: number;
  warningCount: number;
};

type AssignmentLocation = {
  kind: "object";
  coordinate: RouteCoordinate;
};

type PersonnelHomeLocation = {
  kind: "personnel_home";
  coordinate: RouteCoordinate;
};

type RouteAssignmentRow = EtaAssignmentForSequence & {
  tenantId: string;
  assignmentId: string;
  personnelId: string;
  personnelVehicleType: PersonnelVehicleType;
  customerWindowStart: string | null;
  customerWindowEnd: string | null;
  objectLat: number | string | null;
  objectLng: number | string | null;
  customerLat: number | string | null;
  customerLng: number | string | null;
  personnelAddressLat: number | string | null;
  personnelAddressLng: number | string | null;
};

type RouteAssignment = RouteAssignmentRow & {
  location: AssignmentLocation | null;
  personnelHomeLocation: PersonnelHomeLocation | null;
};

function safePlanningSettings(
  row:
    | {
        planningWorkdayStart: string;
        planningTimeSlotMinutes: number;
        routeBufferMinutesCar: number;
        routeBufferMinutesBicycle: number;
        routeBufferMinutesWalking: number;
        routeBufferMinutesMopedOrScooter: number;
        routeBufferMinutesPublicTransport: number;
        routeCacheTtlHours: number;
      }
    | undefined,
): EtaPlanningSettings & { routeCacheTtlHours: number } {
  return {
    ...DEFAULT_PLANNING_SETTINGS,
    ...(row ?? {}),
    planningTimeSlotMinutes: Math.max(
      15,
      Math.min(
        240,
        row?.planningTimeSlotMinutes ??
          DEFAULT_PLANNING_SETTINGS.planningTimeSlotMinutes,
      ),
    ),
    routeCacheTtlHours: Math.max(
      1,
      Math.min(720, row?.routeCacheTtlHours ?? DEFAULT_PLANNING_SETTINGS.routeCacheTtlHours),
    ),
  };
}

function coordinateFromDb(
  lat: number | string | null,
  lng: number | string | null,
): RouteCoordinate | null {
  if (lat === null || lng === null) return null;
  const coordinate = {
    lat: parseCoordinateNumeric(lat),
    lng: parseCoordinateNumeric(lng),
  };

  if (
    !Number.isFinite(coordinate.lat) ||
    !Number.isFinite(coordinate.lng) ||
    coordinate.lat < -90 ||
    coordinate.lat > 90 ||
    coordinate.lng < -180 ||
    coordinate.lng > 180
  ) {
    return null;
  }

  return coordinate;
}

function resolveAssignmentLocation(row: RouteAssignmentRow): AssignmentLocation | null {
  const objectCoordinate = coordinateFromDb(row.objectLat, row.objectLng);
  if (objectCoordinate) {
    return { kind: "object", coordinate: objectCoordinate };
  }

  return null;
}

function resolvePersonnelHomeLocation(row: RouteAssignmentRow): PersonnelHomeLocation | null {
  const coordinate = coordinateFromDb(row.personnelAddressLat, row.personnelAddressLng);
  return coordinate ? { kind: "personnel_home", coordinate } : null;
}

function routeContextCoordinates(
  coordinate: RouteCoordinate | null,
): { lat: string | null; lng: string | null } {
  return coordinate
    ? {
        lat: coordinateNumericValue(coordinate.lat),
        lng: coordinateNumericValue(coordinate.lng),
      }
    : { lat: null, lng: null };
}

function baseRouteContextValues(input: {
  tenantId: string;
  assignment: RouteAssignment;
  previous: RouteAssignment | null;
  sequenceIndex: number;
  now: Date;
  settings: EtaPlanningSettings;
  origin: RouteCoordinate | null;
  originKind: "previous_assignment" | "personnel_home" | null;
  routeDurationSeconds: number | null;
  routeDistanceMeters: number | null;
  bufferMinutes: number;
  snap: ReturnType<typeof computeEtaSnapSuggestion>;
}): InsertAssignmentRouteContext {
  const origin = routeContextCoordinates(input.origin);
  const destination = routeContextCoordinates(input.assignment.location?.coordinate ?? null);
  return {
    tenantId: input.tenantId,
    assignmentId: input.assignment.assignmentId,
    personnelId: input.assignment.personnelId,
    previousAssignmentId: input.previous?.assignmentId ?? null,
    scheduledDate: input.assignment.scheduledDate,
    sequenceIndex: input.sequenceIndex,
    originKind: input.originKind,
    originAssignmentId: input.previous?.assignmentId ?? null,
    originLat: origin.lat,
    originLng: origin.lng,
    destinationLat: destination.lat,
    destinationLng: destination.lng,
    vehicleType: input.assignment.personnelVehicleType,
    travelDurationSeconds: input.routeDurationSeconds,
    travelDistanceMeters: input.routeDistanceMeters,
    bufferMinutes: input.bufferMinutes,
    computedEarliestStart: input.snap.computedEarliestStart,
    customerWindowStart:
      input.assignment.customerWindowStart ?? input.assignment.scheduledStart,
    customerWindowEnd:
      input.assignment.customerWindowEnd ?? input.assignment.scheduledEnd,
    snapStatus: input.snap.snapStatus,
    snapSuggestedStart: input.snap.snapSuggestedStart,
    snapSuggestedEnd: input.snap.snapSuggestedEnd,
    warningCode: input.snap.warningCode,
    warningMessage: input.snap.warningMessage,
    calculatedAt: input.now,
  };
}

async function loadRoutePlanningRows(input: {
  tenantId: string;
  scheduledDate: string;
  personnelId?: string | null;
}): Promise<RouteAssignment[]> {
  const conditions = [
    eq(assignmentsTable.tenantId, input.tenantId),
    eq(assignmentsTable.isActive, true),
    eq(assignmentsTable.scheduledDate, input.scheduledDate),
    eq(assignmentPersonnelTable.status, "assigned"),
  ];

  if (input.personnelId) {
    conditions.push(eq(assignmentPersonnelTable.personnelId, input.personnelId));
  }

  const rows = await db
    .select({
      id: assignmentsTable.id,
      assignmentId: assignmentsTable.id,
      tenantId: assignmentsTable.tenantId,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      customerWindowStart: assignmentsTable.scheduledStart,
      customerWindowEnd: assignmentsTable.scheduledEnd,
      status: assignmentsTable.status,
      actualCompletedAt: assignmentsTable.actualCompletedAt,
      assignedAt: assignmentPersonnelTable.assignedAt,
      personnelId: assignmentPersonnelTable.personnelId,
      personnelVehicleType: personnelTable.vehicleType,
      objectLat: objectsTable.latitude,
      objectLng: objectsTable.longitude,
      customerLat: customersTable.latitude,
      customerLng: customersTable.longitude,
      personnelAddressLat: personnelTable.addressLatitude,
      personnelAddressLng: personnelTable.addressLongitude,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(
      assignmentsTable,
      and(
        eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id),
        eq(assignmentsTable.tenantId, input.tenantId),
      ),
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
      customersTable,
      and(
        eq(assignmentsTable.customerId, customersTable.id),
        eq(customersTable.tenantId, input.tenantId),
      ),
    )
    .where(and(...conditions));

  return rows.map((row) => ({
    ...row,
    scheduledDate: row.scheduledDate ?? input.scheduledDate,
    status: row.status as AssignmentStatus,
    personnelVehicleType: row.personnelVehicleType as PersonnelVehicleType,
    location: resolveAssignmentLocation(row as RouteAssignmentRow),
    personnelHomeLocation: resolvePersonnelHomeLocation(row as RouteAssignmentRow),
  })) as RouteAssignment[];
}

async function loadPlanningSettings(
  tenantId: string,
): Promise<EtaPlanningSettings & { routeCacheTtlHours: number }> {
  const [settings] = await db
    .select({
      planningWorkdayStart: organizationSettingsTable.planningWorkdayStart,
      planningTimeSlotMinutes: organizationSettingsTable.planningTimeSlotMinutes,
      routeBufferMinutesCar: organizationSettingsTable.routeBufferMinutesCar,
      routeBufferMinutesBicycle: organizationSettingsTable.routeBufferMinutesBicycle,
      routeBufferMinutesWalking: organizationSettingsTable.routeBufferMinutesWalking,
      routeBufferMinutesMopedOrScooter:
        organizationSettingsTable.routeBufferMinutesMopedOrScooter,
      routeBufferMinutesPublicTransport:
        organizationSettingsTable.routeBufferMinutesPublicTransport,
      routeCacheTtlHours: organizationSettingsTable.routeCacheTtlHours,
    })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  return safePlanningSettings(settings);
}

async function buildRouteContexts(input: {
  tenantId: string;
  scheduledDate: string;
  assignments: RouteAssignment[];
  settings: EtaPlanningSettings & { routeCacheTtlHours: number };
  now: Date;
  routeProvider?: RouteProvider;
}): Promise<InsertAssignmentRouteContext[]> {
  const byPersonnel = new Map<string, RouteAssignment[]>();
  for (const assignment of input.assignments) {
    const current = byPersonnel.get(assignment.personnelId) ?? [];
    current.push(assignment);
    byPersonnel.set(assignment.personnelId, current);
  }

  const contexts: InsertAssignmentRouteContext[] = [];

  for (const assignments of byPersonnel.values()) {
    const ordered = sortEtaAssignmentsForPersonnel(assignments);
    for (let index = 0; index < ordered.length; index += 1) {
      const assignment = ordered[index];
      const previous = ordered[index - 1] ?? null;
      const vehicleType: RouteVehicleType = assignment.personnelVehicleType;
      const bufferMinutes = previous
        ? getRouteBufferMinutes(input.settings, vehicleType)
        : 0;
      const origin = previous?.location?.coordinate ?? assignment.personnelHomeLocation?.coordinate ?? null;
      const originKind = previous
        ? "previous_assignment"
        : assignment.personnelHomeLocation
          ? "personnel_home"
          : null;
      const destination = assignment.location?.coordinate ?? null;
      const departureTime = previous
        ? selectDepartureTime({
            previousAssignment: previous,
            now: input.now,
          })
        : dateTimeForTime(assignment.scheduledDate, input.settings.planningWorkdayStart);
      let routeDurationSeconds: number | null = null;
      let routeDistanceMeters: number | null = null;

      if (!origin || !destination || !departureTime) {
        const snap = computeEtaSnapSuggestion({
          scheduledDate: assignment.scheduledDate,
          scheduledStart: assignment.scheduledStart,
          scheduledEnd: assignment.scheduledEnd,
          customerWindowStart: assignment.customerWindowStart,
          customerWindowEnd: assignment.customerWindowEnd,
          departureTime: null,
          routeDurationSeconds: null,
          bufferMinutes,
          slotMinutes: input.settings.planningTimeSlotMinutes,
          workdayStart: input.settings.planningWorkdayStart,
          missingLocation: !origin || !destination,
        });
        contexts.push({
          ...baseRouteContextValues({
            tenantId: input.tenantId,
            assignment,
            previous,
            sequenceIndex: index,
            now: input.now,
            settings: input.settings,
            origin,
            originKind,
            routeDurationSeconds,
            routeDistanceMeters,
            bufferMinutes,
            snap,
          }),
          warningCode: !departureTime ? "missing_time" : snap.warningCode,
          warningMessage: !departureTime
            ? "Routecontext kan niet worden berekend omdat de vorige werkbon geen eindtijd heeft."
            : snap.warningMessage,
        });
        continue;
      }

      const route = await getRouteWithCache(
        {
          tenantId: input.tenantId,
          origin,
          destination,
          vehicleType,
          departureTime,
        },
        input.routeProvider,
        { now: input.now, ttlHours: input.settings.routeCacheTtlHours },
      );

      if (!route.success) {
        const snap = computeEtaSnapSuggestion({
          scheduledDate: assignment.scheduledDate,
          scheduledStart: assignment.scheduledStart,
          scheduledEnd: assignment.scheduledEnd,
          customerWindowStart: assignment.customerWindowStart,
          customerWindowEnd: assignment.customerWindowEnd,
          departureTime,
          routeDurationSeconds: null,
          bufferMinutes,
          slotMinutes: input.settings.planningTimeSlotMinutes,
          workdayStart: input.settings.planningWorkdayStart,
          providerError: route.error,
        });
        contexts.push(
          baseRouteContextValues({
            tenantId: input.tenantId,
            assignment,
            previous,
            sequenceIndex: index,
            now: input.now,
            settings: input.settings,
            origin,
            originKind,
            routeDurationSeconds,
            routeDistanceMeters,
            bufferMinutes,
            snap,
          }),
        );
        continue;
      }

      routeDurationSeconds = route.durationSeconds;
      routeDistanceMeters = route.distanceMeters;
      const snap = computeEtaSnapSuggestion({
        scheduledDate: assignment.scheduledDate,
        scheduledStart: assignment.scheduledStart,
        scheduledEnd: assignment.scheduledEnd,
        customerWindowStart: assignment.customerWindowStart,
        customerWindowEnd: assignment.customerWindowEnd,
        departureTime,
        routeDurationSeconds,
        bufferMinutes,
        slotMinutes: input.settings.planningTimeSlotMinutes,
        workdayStart: input.settings.planningWorkdayStart,
      });

      contexts.push(
        baseRouteContextValues({
          tenantId: input.tenantId,
          assignment,
          previous,
          sequenceIndex: index,
          now: input.now,
          settings: input.settings,
          origin,
          originKind,
          routeDurationSeconds,
          routeDistanceMeters,
          bufferMinutes,
          snap,
        }),
      );
    }
  }

  return contexts;
}

export async function recalculatePlanningRouteContexts(
  input: RecalculatePlanningRouteContextsInput,
): Promise<RecalculatePlanningRouteContextsResult> {
  if (!input.tenantId) {
    throw new Error("tenantId is verplicht voor routecontext recalculatie.");
  }
  if (!isDateKey(input.scheduledDate)) {
    throw new Error("scheduledDate moet YYYY-MM-DD zijn.");
  }

  const now = input.now ?? new Date();
  const [settings, assignments] = await Promise.all([
    loadPlanningSettings(input.tenantId),
    loadRoutePlanningRows({
      tenantId: input.tenantId,
      scheduledDate: input.scheduledDate,
      personnelId: input.personnelId,
    }),
  ]);
  const contexts = await buildRouteContexts({
    tenantId: input.tenantId,
    scheduledDate: input.scheduledDate,
    assignments,
    settings,
    now,
    routeProvider: input.routeProvider,
  });

  await db.transaction(async (tx) => {
    const cleanupConditions = [
      eq(assignmentRouteContextsTable.tenantId, input.tenantId),
      eq(assignmentRouteContextsTable.scheduledDate, input.scheduledDate),
    ];
    if (input.personnelId) {
      cleanupConditions.push(
        eq(assignmentRouteContextsTable.personnelId, input.personnelId),
      );
    }

    await tx
      .delete(assignmentRouteContextsTable)
      .where(and(...cleanupConditions));

    if (contexts.length > 0) {
      await tx.insert(assignmentRouteContextsTable).values(contexts);
    }
  });

  return {
    personnelCount: new Set(assignments.map((assignment) => assignment.personnelId))
      .size,
    assignmentCount: assignments.length,
    contextCount: contexts.length,
    warningCount: contexts.filter((context) => context.warningCode).length,
  };
}

export const etaEngineInternals = {
  baseRouteContextValues,
  buildRouteContexts,
  coordinateFromDb,
  resolveAssignmentLocation,
  resolvePersonnelHomeLocation,
  safePlanningSettings,
};
