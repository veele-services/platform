import "server-only";

import { createHash } from "node:crypto";
import type { PersonnelVehicleType } from "@workspace/db";
import type {
  RouteCoordinate,
  RouteProviderMode,
  RouteRequest,
  RouteVehicleType,
} from "./types";

export const ROUTE_PROVIDER_GOOGLE = "google_routes";
export const ROUTE_PROVIDER_MOCK = "mock_routes";

export function isValidCoordinate(coordinate: RouteCoordinate): boolean {
  return (
    Number.isFinite(coordinate.lat) &&
    Number.isFinite(coordinate.lng) &&
    coordinate.lat >= -90 &&
    coordinate.lat <= 90 &&
    coordinate.lng >= -180 &&
    coordinate.lng <= 180
  );
}

export function validateRouteCoordinates(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
): string | null {
  if (!isValidCoordinate(origin)) {
    return "Vertreklocatie mist geldige latitude/longitude.";
  }

  if (!isValidCoordinate(destination)) {
    return "Bestemming mist geldige latitude/longitude.";
  }

  return null;
}

export function providerModeForVehicle(
  vehicleType: RouteVehicleType,
): RouteProviderMode {
  switch (vehicleType) {
    case "BICYCLE":
    case "bicycle":
      return "BICYCLE";
    case "WALK":
    case "walking":
      return "WALK";
    case "TRANSIT":
    case "public_transport":
      return "TRANSIT";
    case "moped_or_scooter":
    case "DRIVE":
    case "car":
    default:
      return "DRIVE";
  }
}

export function canonicalVehicleTypeForRoute(
  vehicleType: RouteVehicleType,
): PersonnelVehicleType {
  switch (vehicleType) {
    case "BICYCLE":
    case "bicycle":
      return "BICYCLE";
    case "WALK":
    case "walking":
      return "WALK";
    case "TRANSIT":
    case "public_transport":
      return "TRANSIT";
    case "moped_or_scooter":
    case "DRIVE":
    case "car":
    default:
      return "DRIVE";
  }
}

export function routeWarningsForVehicle(
  vehicleType: RouteVehicleType,
): string[] {
  if (vehicleType === "moped_or_scooter") {
    return [
      "Scooter/brommer is naar autoroutering gemigreerd omdat tweewieler-routering buiten deze Google Maps-fase valt.",
    ];
  }

  return [];
}

export function coordinateHash(coordinate: RouteCoordinate): string {
  return `${coordinate.lat.toFixed(5)},${coordinate.lng.toFixed(5)}`;
}

export function departureTimeBucket(
  departureTime: Date | null | undefined,
  bucketMinutes = 15,
): string {
  if (!departureTime) return "no_departure";
  const bucketMs = Math.max(1, bucketMinutes) * 60 * 1000;
  return String(Math.floor(departureTime.getTime() / bucketMs));
}

export function routeTrafficPreferenceForMode(
  providerMode: RouteProviderMode,
): "TRAFFIC_AWARE" | "NONE" {
  return providerMode === "DRIVE" ? "TRAFFIC_AWARE" : "NONE";
}

export function routeCacheContextHash(request: RouteRequest): string {
  const providerMode = providerModeForVehicle(request.vehicleType);
  return createHash("sha256")
    .update(
      [
        request.tenantId,
        coordinateHash(request.origin),
        coordinateHash(request.destination),
        providerMode,
        departureTimeBucket(request.departureTime),
        routeTrafficPreferenceForMode(providerMode),
      ].join("|"),
    )
    .digest("hex");
}

export function routeCacheTtlMsForMode(
  providerMode: RouteProviderMode,
  configuredTtlHours = 24,
): number {
  const configuredMs = Math.max(1, Math.min(720, configuredTtlHours)) * 60 * 60 * 1000;
  const policyMaxMs =
    providerMode === "DRIVE" || providerMode === "TRANSIT"
      ? 5 * 60 * 1000
      : 30 * 60 * 1000;
  return Math.min(configuredMs, policyMaxMs);
}

export function routeExpiresAtFromPolicy(
  now: Date,
  providerMode: RouteProviderMode,
  configuredTtlHours = 24,
): Date {
  return new Date(now.getTime() + routeCacheTtlMsForMode(providerMode, configuredTtlHours));
}

export function routeUsageEventForMode(
  providerMode: RouteProviderMode,
):
  | "route_request_drive_traffic"
  | "route_request_bicycle"
  | "route_request_walk"
  | "route_request_transit" {
  switch (providerMode) {
    case "BICYCLE":
      return "route_request_bicycle";
    case "WALK":
      return "route_request_walk";
    case "TRANSIT":
      return "route_request_transit";
    case "DRIVE":
    default:
      return "route_request_drive_traffic";
  }
}

export function coordinateNumericValue(value: number): string {
  return value.toFixed(6);
}

export function parseCoordinateNumeric(value: number | string): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

export function expiresAtFromTtl(now: Date, ttlHours: number): Date {
  const safeTtlHours = Number.isFinite(ttlHours)
    ? Math.max(1, Math.min(720, Math.round(ttlHours)))
    : 24;
  return new Date(now.getTime() + safeTtlHours * 60 * 60 * 1000);
}
