import "server-only";

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

const GOOGLE_ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";
const GOOGLE_FIELD_MASK =
  "routes.duration,routes.distanceMeters,routes.warnings";

type GoogleRoutesResponse = {
  routes?: Array<{
    duration?: string;
    distanceMeters?: number;
    warnings?: string[];
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type GoogleRouteProviderOptions = {
  apiKey?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

function parseGoogleDurationSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (!match) return null;

  const seconds = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(seconds) ? Math.round(seconds) : null;
}

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
  const apiKey = options.apiKey ?? process.env.GOOGLE_ROUTES_API_KEY;
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
          "GOOGLE_ROUTES_API_KEY is niet geconfigureerd.",
          false,
          baseWarnings,
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const body: Record<string, unknown> = {
          origin: {
            location: {
              latLng: {
                latitude: request.origin.lat,
                longitude: request.origin.lng,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: request.destination.lat,
                longitude: request.destination.lng,
              },
            },
          },
          travelMode: providerMode,
        };

        if (providerMode === "DRIVE") {
          body.routingPreference = "TRAFFIC_AWARE";
        }

        if (request.departureTime) {
          body.departureTime = request.departureTime.toISOString();
        }

        const response = await fetchImpl(GOOGLE_ROUTES_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const payload = (await response.json().catch(() => ({}))) as GoogleRoutesResponse;

        if (!response.ok) {
          return routeFailure(
            providerMode,
            `Routeprovider gaf HTTP ${response.status}. Probeer later opnieuw.`,
            response.status === 429 || response.status >= 500,
            baseWarnings,
            {
              httpStatus: response.status,
              providerStatus: payload.error?.status,
            },
          );
        }

        const route = payload.routes?.[0];
        const durationSeconds = parseGoogleDurationSeconds(route?.duration);
        if (!route || durationSeconds === null) {
          return routeFailure(
            providerMode,
            "Routeprovider gaf geen bruikbare reistijd terug.",
            false,
            baseWarnings,
            { routeCount: payload.routes?.length ?? 0 },
          );
        }

        const warnings = [...baseWarnings, ...(route.warnings ?? [])];
        return {
          success: true,
          provider: ROUTE_PROVIDER_GOOGLE,
          providerMode,
          durationSeconds,
          distanceMeters: Number.isFinite(route.distanceMeters)
            ? Math.round(route.distanceMeters ?? 0)
            : null,
          warnings,
          providerMeta: {
            routeCount: payload.routes?.length ?? 0,
            warnings,
          },
        };
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        return routeFailure(
          providerMode,
          aborted
            ? "Routeprovider reageerde niet op tijd. Probeer later opnieuw."
            : "Routeprovider kon niet worden bereikt. Probeer later opnieuw.",
          true,
          baseWarnings,
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export const googleRoutesInternals = {
  parseGoogleDurationSeconds,
};
