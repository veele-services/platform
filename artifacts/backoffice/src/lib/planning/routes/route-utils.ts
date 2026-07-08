import "server-only";

import type {
  RouteCoordinate,
  RouteProviderMode,
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
    case "bicycle":
      return "BICYCLE";
    case "walking":
      return "WALK";
    case "moped_or_scooter":
      return "TWO_WHEELER";
    case "public_transport":
      return "TRANSIT";
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
      "Google Routes ondersteunt tweewieler-routering niet in iedere regio; fallback kan nodig zijn.",
    ];
  }

  return [];
}

export function coordinateHash(coordinate: RouteCoordinate): string {
  return `${coordinate.lat.toFixed(5)},${coordinate.lng.toFixed(5)}`;
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
