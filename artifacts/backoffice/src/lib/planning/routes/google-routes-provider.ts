import "server-only";

import {
  computeGoogleRoute,
  GoogleRoutesClientError,
} from "@/lib/google-maps/routes-client";
import {
  providerModeForVehicle,
  routeWarningsForVehicle,
  ROUTE_PROVIDER_GOOGLE,
  validateRouteCoordinates,
} from "./route-utils";
import type {
  FetchLike,
  RouteProvider,
  RouteProviderMode,
  RouteRequest,
  RouteResult,
} from "./types";

type GoogleRouteProviderOptions = {
  apiKey?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

function routeFailure(
  providerMode: RouteProviderMode,
  error: string,
  retryable: boolean,
  warnings: string[] = [],
  providerMeta?: Record<string, unknown>,
): RouteResult {
  return {
    success: false,
    provider: ROUTE_PROVIDER_GOOGLE,
    providerMode,
    error,
    retryable,
    warnings,
    providerMeta,
  };
}

export function createGoogleRoutesProvider(
  options: GoogleRouteProviderOptions = {},
): RouteProvider {
  const apiKey =
    options.apiKey ??
    process.env.GOOGLE_MAPS_SERVER_API_KEY ??
    process.env.GOOGLE_ROUTES_API_KEY;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5500;

  return {
    name: ROUTE_PROVIDER_GOOGLE,
    async getRoute(request: RouteRequest): Promise<RouteResult> {
      const providerMode = providerModeForVehicle(request.vehicleType);
      const baseWarnings = routeWarningsForVehicle(request.vehicleType);
      const coordinateError = validateRouteCoordinates(
        request.origin,
        request.destination,
      );

      if (coordinateError) {
        return routeFailure(providerMode, coordinateError, false, baseWarnings);
      }

      if (!apiKey) {
        return routeFailure(
          providerMode,
          "GOOGLE_MAPS_SERVER_API_KEY is niet geconfigureerd.",
          false,
          baseWarnings,
        );
      }

      try {
        const route = await computeGoogleRoute({
          apiKey,
          origin: request.origin,
          destination: request.destination,
          travelMode: providerMode,
          departureTime: request.departureTime,
          trafficAware: providerMode === "DRIVE",
          fetchImpl,
          timeoutMs,
        });

        return {
          success: true,
          provider: ROUTE_PROVIDER_GOOGLE,
          providerMode,
          durationSeconds: route.durationSeconds,
          distanceMeters: route.distanceMeters,
          warnings: baseWarnings,
          providerMeta: {
            routeCount: route.routeCount,
            staticDurationSeconds: route.staticDurationSeconds,
            trafficDelaySeconds:
              route.staticDurationSeconds !== null
                ? Math.max(0, route.durationSeconds - route.staticDurationSeconds)
                : null,
            encodedPolyline: route.encodedPolyline,
            description: route.description,
            viewport: route.viewport,
            trafficPreference:
              providerMode === "DRIVE" ? "TRAFFIC_AWARE" : null,
          },
        };
      } catch (error) {
        if (error instanceof GoogleRoutesClientError) {
          return routeFailure(
            providerMode,
            error.code === "configuration_error"
              ? error.message
              : error.retryable
                ? "Routeprovider kon niet worden bereikt. Probeer later opnieuw."
                : "Routeprovider gaf geen bruikbare route terug.",
            error.retryable,
            baseWarnings,
            {
              providerErrorCode: error.code,
              httpStatus: error.status ?? null,
            },
          );
        }

        return routeFailure(
          providerMode,
          "Routeprovider kon niet veilig worden aangeroepen.",
          true,
          baseWarnings,
        );
      }
    },
  };
}

export const googleRoutesInternals = {};
