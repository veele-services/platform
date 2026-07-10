import "server-only";

import {
  providerModeForVehicle,
  ROUTE_PROVIDER_MOCK,
  validateRouteCoordinates,
} from "./route-utils";
import type {
  RouteProvider,
  RouteRequest,
  RouteResult,
  RouteVehicleType,
} from "./types";

type MockRouteProviderOptions = {
  forceFailure?: boolean;
  speedKilometersPerHour?: Partial<Record<RouteVehicleType, number>>;
};

const DEFAULT_SPEED_KILOMETERS_PER_HOUR: Record<RouteVehicleType, number> = {
  DRIVE: 45,
  BICYCLE: 15,
  WALK: 5,
  TRANSIT: 25,
  car: 45,
  bicycle: 15,
  walking: 5,
  moped_or_scooter: 30,
  public_transport: 25,
};

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): number {
  const earthRadiusMeters = 6_371_000;
  const latDelta = toRadians(destination.lat - origin.lat);
  const lngDelta = toRadians(destination.lng - origin.lng);
  const originLat = toRadians(origin.lat);
  const destinationLat = toRadians(destination.lat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c);
}

function durationSecondsForDistance(
  distanceMeters: number,
  vehicleType: RouteVehicleType,
  speeds: Record<RouteVehicleType, number>,
): number {
  const speedMetersPerSecond = ((speeds[vehicleType] ?? speeds.DRIVE) * 1000) / 3600;
  return Math.max(60, Math.round(distanceMeters / speedMetersPerSecond));
}

export function createMockRouteProvider(
  options: MockRouteProviderOptions = {},
): RouteProvider {
  const speeds = {
    ...DEFAULT_SPEED_KILOMETERS_PER_HOUR,
    ...options.speedKilometersPerHour,
  };

  return {
    name: ROUTE_PROVIDER_MOCK,
    async getRoute(request: RouteRequest): Promise<RouteResult> {
      const providerMode = providerModeForVehicle(request.vehicleType);
      const coordinateError = validateRouteCoordinates(
        request.origin,
        request.destination,
      );

      if (coordinateError) {
        return {
          success: false,
          provider: ROUTE_PROVIDER_MOCK,
          providerMode,
          error: coordinateError,
          retryable: false,
          warnings: [],
        };
      }

      if (options.forceFailure) {
        return {
          success: false,
          provider: ROUTE_PROVIDER_MOCK,
          providerMode,
          error: "Mock routeprovider is geforceerd mislukt.",
          retryable: false,
          warnings: [],
        };
      }

      const distanceMeters = haversineDistanceMeters(
        request.origin,
        request.destination,
      );
      const durationSeconds = durationSecondsForDistance(
        distanceMeters,
        request.vehicleType,
        speeds,
      );

      return {
        success: true,
        provider: ROUTE_PROVIDER_MOCK,
        providerMode,
        durationSeconds,
        distanceMeters,
        warnings: [],
        providerMeta: {
          deterministic: true,
          speedKilometersPerHour: speeds[request.vehicleType],
        },
      };
    },
  };
}

export const mockRouteInternals = {
  DEFAULT_SPEED_KILOMETERS_PER_HOUR,
  durationSecondsForDistance,
};
