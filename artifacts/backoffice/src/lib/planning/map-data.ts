import "server-only";

import type {
  AssignmentPriority,
  AssignmentStatus,
  PersonnelVehicleType,
  PlanningRouteSnapStatus,
} from "@workspace/db";

type CoordinateValue = number | string | null;

export type PlanningDayMapFilters = {
  date?: string;
  personnelId?: string | null;
  status?: AssignmentStatus | "";
  region?: string | null;
  warningsOnly?: boolean;
};

export type PlanningDayMapCoordinate = {
  lat: number;
  lng: number;
  source: "object" | "customer";
};

export type PlanningDayMapRouteContext = {
  id: string | null;
  assignmentId: string;
  personnelId: string;
  previousAssignmentId: string | null;
  sequenceIndex: number | null;
  vehicleType: PersonnelVehicleType;
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  travelDurationSeconds: number | null;
  travelDistanceMeters: number | null;
  bufferMinutes: number;
  computedEarliestStart: string | null;
  customerWindowStart: string | null;
  customerWindowEnd: string | null;
  snapStatus: PlanningRouteSnapStatus | null;
  snapSuggestedStart: string | null;
  snapSuggestedEnd: string | null;
  warningCode: string | null;
  warningMessage: string | null;
};

export type PlanningDayMapAssignedPersonnel = {
  id: string;
  name: string;
  vehicleType: PersonnelVehicleType;
  region: string | null;
};

export type PlanningDayMapMarker = {
  id: string;
  code: string;
  title: string;
  status: AssignmentStatus;
  priority: AssignmentPriority;
  scheduledDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  customerId: string;
  customerName: string;
  objectId: string | null;
  objectName: string | null;
  requiredRegion: string | null;
  coordinate: PlanningDayMapCoordinate | null;
  missingLocation: boolean;
  assignedPersonnel: PlanningDayMapAssignedPersonnel[];
  routeContexts: PlanningDayMapRouteContext[];
  primarySnapStatus: PlanningRouteSnapStatus | null;
  primaryWarningCode: string | null;
  primaryWarningMessage: string | null;
};

export type PlanningDayMapRouteStop = {
  assignmentId: string;
  code: string;
  title: string;
  status: AssignmentStatus;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  sequenceIndex: number | null;
  routeContextId: string | null;
  snapStatus: PlanningRouteSnapStatus | null;
  warningCode: string | null;
  warningMessage: string | null;
  travelDurationSeconds: number | null;
  travelDistanceMeters: number | null;
  bufferMinutes: number;
};

export type PlanningDayMapPersonnelRoute = {
  personnelId: string;
  personnelName: string;
  vehicleType: PersonnelVehicleType;
  region: string | null;
  stops: PlanningDayMapRouteStop[];
  totalTravelDurationSeconds: number;
  totalTravelDistanceMeters: number;
  warningCount: number;
};

export type PlanningDayMapWarning = {
  assignmentId: string;
  personnelId: string | null;
  code: string;
  title: string;
  warningCode: string;
  warningMessage: string;
};

export type PlanningDayMapData = {
  date: string;
  accessDenied: boolean;
  markers: PlanningDayMapMarker[];
  personnelRoutes: PlanningDayMapPersonnelRoute[];
  warnings: PlanningDayMapWarning[];
  missingLocationCount: number;
  generatedAt: string;
};

export type PlanningDayMapRow = {
  assignmentId: string;
  code: string;
  title: string;
  status: AssignmentStatus;
  priority: AssignmentPriority;
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  customerId: string;
  customerName: string | null;
  objectId: string | null;
  objectName: string | null;
  requiredRegion: string | null;
  objectLat: CoordinateValue;
  objectLng: CoordinateValue;
  customerLat: CoordinateValue;
  customerLng: CoordinateValue;
  personnelId: string;
  personnelFirstName: string;
  personnelLastName: string;
  personnelRegion: string | null;
  personnelVehicleType: PersonnelVehicleType;
  routeContextId: string | null;
  previousAssignmentId: string | null;
  sequenceIndex: number | null;
  originLat: CoordinateValue;
  originLng: CoordinateValue;
  destinationLat: CoordinateValue;
  destinationLng: CoordinateValue;
  travelDurationSeconds: number | null;
  travelDistanceMeters: number | null;
  bufferMinutes: number | null;
  computedEarliestStart: Date | string | null;
  customerWindowStart: string | null;
  customerWindowEnd: string | null;
  snapStatus: PlanningRouteSnapStatus | null;
  snapSuggestedStart: string | null;
  snapSuggestedEnd: string | null;
  warningCode: string | null;
  warningMessage: string | null;
};

function parseCoordinate(value: CoordinateValue): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validCoordinate(lat: CoordinateValue, lng: CoordinateValue) {
  const parsedLat = parseCoordinate(lat);
  const parsedLng = parseCoordinate(lng);
  if (parsedLat === null || parsedLng === null) return null;
  if (parsedLat < -90 || parsedLat > 90) return null;
  if (parsedLng < -180 || parsedLng > 180) return null;
  return { lat: parsedLat, lng: parsedLng };
}

export function resolvePlanningMapCoordinate(
  row: Pick<
    PlanningDayMapRow,
    "objectLat" | "objectLng" | "customerLat" | "customerLng"
  >,
): PlanningDayMapCoordinate | null {
  const objectCoordinate = validCoordinate(row.objectLat, row.objectLng);
  if (objectCoordinate) {
    return { ...objectCoordinate, source: "object" };
  }

  const customerCoordinate = validCoordinate(row.customerLat, row.customerLng);
  if (customerCoordinate) {
    return { ...customerCoordinate, source: "customer" };
  }

  return null;
}

function pointFromCoordinates(
  lat: CoordinateValue,
  lng: CoordinateValue,
): { lat: number; lng: number } | null {
  return validCoordinate(lat, lng);
}

function dateToIso(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function personnelName(row: PlanningDayMapRow): string {
  return `${row.personnelFirstName} ${row.personnelLastName}`.trim();
}

function routeContextFromRow(row: PlanningDayMapRow): PlanningDayMapRouteContext {
  return {
    id: row.routeContextId,
    assignmentId: row.assignmentId,
    personnelId: row.personnelId,
    previousAssignmentId: row.previousAssignmentId,
    sequenceIndex: row.sequenceIndex,
    vehicleType: row.personnelVehicleType,
    origin: pointFromCoordinates(row.originLat, row.originLng),
    destination: pointFromCoordinates(row.destinationLat, row.destinationLng),
    travelDurationSeconds: row.travelDurationSeconds,
    travelDistanceMeters: row.travelDistanceMeters,
    bufferMinutes: row.bufferMinutes ?? 0,
    computedEarliestStart: dateToIso(row.computedEarliestStart),
    customerWindowStart: row.customerWindowStart,
    customerWindowEnd: row.customerWindowEnd,
    snapStatus: row.snapStatus,
    snapSuggestedStart: row.snapSuggestedStart,
    snapSuggestedEnd: row.snapSuggestedEnd,
    warningCode: row.warningCode,
    warningMessage: row.warningMessage,
  };
}

function compareRouteStops(
  a: PlanningDayMapRouteStop,
  b: PlanningDayMapRouteStop,
): number {
  const sequence = (a.sequenceIndex ?? 9999) - (b.sequenceIndex ?? 9999);
  if (sequence !== 0) return sequence;
  const start = (a.scheduledStart ?? "99:99").localeCompare(
    b.scheduledStart ?? "99:99",
  );
  if (start !== 0) return start;
  return a.assignmentId.localeCompare(b.assignmentId);
}

function compareMarkers(
  a: PlanningDayMapMarker,
  b: PlanningDayMapMarker,
): number {
  const start = (a.scheduledStart ?? "99:99").localeCompare(
    b.scheduledStart ?? "99:99",
  );
  if (start !== 0) return start;
  return a.code.localeCompare(b.code);
}

function rowMatchesFilters(
  row: PlanningDayMapRow,
  filters: PlanningDayMapFilters,
): boolean {
  if (filters.personnelId && row.personnelId !== filters.personnelId) {
    return false;
  }
  if (filters.status && row.status !== filters.status) return false;
  if (filters.region) {
    const region = filters.region.trim().toLowerCase();
    const assignmentRegion = row.requiredRegion?.trim().toLowerCase();
    const personnelRegion = row.personnelRegion?.trim().toLowerCase();
    if (assignmentRegion !== region && personnelRegion !== region) {
      return false;
    }
  }
  return true;
}

export function createEmptyPlanningDayMapData(
  date: string,
  options: { accessDenied?: boolean; generatedAt?: Date } = {},
): PlanningDayMapData {
  return {
    date,
    accessDenied: options.accessDenied ?? false,
    markers: [],
    personnelRoutes: [],
    warnings: [],
    missingLocationCount: 0,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
  };
}

export function buildPlanningDayMapDataFromRows(
  rows: PlanningDayMapRow[],
  input: {
    date: string;
    filters?: PlanningDayMapFilters;
    generatedAt?: Date;
  },
): PlanningDayMapData {
  const filters = input.filters ?? {};
  const markerMap = new Map<string, PlanningDayMapMarker>();
  const routeMap = new Map<string, PlanningDayMapPersonnelRoute>();
  const warnings: PlanningDayMapWarning[] = [];

  for (const row of rows) {
    if (!rowMatchesFilters(row, filters)) continue;

    const coordinate = resolvePlanningMapCoordinate(row);
    const context = routeContextFromRow(row);
    const existingMarker = markerMap.get(row.assignmentId);
    const marker =
      existingMarker ??
      ({
        id: row.assignmentId,
        code: row.code,
        title: row.title,
        status: row.status,
        priority: row.priority,
        scheduledDate: row.scheduledDate ?? input.date,
        scheduledStart: row.scheduledStart,
        scheduledEnd: row.scheduledEnd,
        customerId: row.customerId,
        customerName: row.customerName ?? "",
        objectId: row.objectId,
        objectName: row.objectName,
        requiredRegion: row.requiredRegion,
        coordinate,
        missingLocation: !coordinate,
        assignedPersonnel: [],
        routeContexts: [],
        primarySnapStatus: null,
        primaryWarningCode: null,
        primaryWarningMessage: null,
      } satisfies PlanningDayMapMarker);

    if (!marker.assignedPersonnel.some((person) => person.id === row.personnelId)) {
      marker.assignedPersonnel.push({
        id: row.personnelId,
        name: personnelName(row),
        vehicleType: row.personnelVehicleType,
        region: row.personnelRegion,
      });
    }
    marker.routeContexts.push(context);

    const warningCode = context.warningCode ?? (!coordinate ? "missing_location" : null);
    const warningMessage =
      context.warningMessage ??
      (!coordinate
        ? "Deze werkbon heeft geen bruikbare object- of klantcoordinaten."
        : null);
    if (warningCode && warningMessage) {
      warnings.push({
        assignmentId: row.assignmentId,
        personnelId: row.personnelId,
        code: row.code,
        title: row.title,
        warningCode,
        warningMessage,
      });
      if (!marker.primaryWarningCode) {
        marker.primaryWarningCode = warningCode;
        marker.primaryWarningMessage = warningMessage;
      }
    }
    if (!marker.primarySnapStatus && context.snapStatus) {
      marker.primarySnapStatus = context.snapStatus;
    }

    markerMap.set(row.assignmentId, marker);

    const route =
      routeMap.get(row.personnelId) ??
      ({
        personnelId: row.personnelId,
        personnelName: personnelName(row),
        vehicleType: row.personnelVehicleType,
        region: row.personnelRegion,
        stops: [],
        totalTravelDurationSeconds: 0,
        totalTravelDistanceMeters: 0,
        warningCount: 0,
      } satisfies PlanningDayMapPersonnelRoute);
    route.stops.push({
      assignmentId: row.assignmentId,
      code: row.code,
      title: row.title,
      status: row.status,
      scheduledStart: row.scheduledStart,
      scheduledEnd: row.scheduledEnd,
      sequenceIndex: row.sequenceIndex,
      routeContextId: row.routeContextId,
      snapStatus: row.snapStatus,
      warningCode,
      warningMessage,
      travelDurationSeconds: row.travelDurationSeconds,
      travelDistanceMeters: row.travelDistanceMeters,
      bufferMinutes: row.bufferMinutes ?? 0,
    });
    route.totalTravelDurationSeconds += row.travelDurationSeconds ?? 0;
    route.totalTravelDistanceMeters += row.travelDistanceMeters ?? 0;
    if (warningCode) route.warningCount += 1;
    routeMap.set(row.personnelId, route);
  }

  let markers = [...markerMap.values()].sort(compareMarkers);
  if (filters.warningsOnly) {
    markers = markers.filter(
      (marker) => marker.missingLocation || Boolean(marker.primaryWarningCode),
    );
  }
  const visibleAssignmentIds = new Set(markers.map((marker) => marker.id));
  const personnelRoutes = [...routeMap.values()]
    .map((route) => ({
      ...route,
      stops: route.stops
        .filter((stop) => visibleAssignmentIds.has(stop.assignmentId))
        .sort(compareRouteStops),
    }))
    .filter((route) => route.stops.length > 0)
    .sort((a, b) => a.personnelName.localeCompare(b.personnelName));

  const visibleWarnings = warnings.filter((warning) =>
    visibleAssignmentIds.has(warning.assignmentId),
  );

  return {
    date: input.date,
    accessDenied: false,
    markers,
    personnelRoutes,
    warnings: visibleWarnings,
    missingLocationCount: markers.filter((marker) => marker.missingLocation).length,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
  };
}
