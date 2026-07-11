import "server-only";

import type { FetchLike } from "@/lib/planning/routes/types";

export const GOOGLE_ROUTES_COMPUTE_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

export const GOOGLE_ROUTES_FIELD_MASK = [
  "routes.duration",
  "routes.staticDuration",
  "routes.distanceMeters",
  "routes.polyline.encodedPolyline",
  "routes.description",
  "routes.viewport",
].join(",");

export type GoogleRoutesTravelMode = "DRIVE" | "BICYCLE" | "WALK" | "TRANSIT";

export type GoogleRoutesCoordinate = {
  lat: number;
  lng: number;
};

export type GoogleRoutesComputeInput = {
  apiKey: string;
  origin: GoogleRoutesCoordinate;
  destination: GoogleRoutesCoordinate;
  travelMode: GoogleRoutesTravelMode;
  departureTime?: Date;
  trafficAware?: boolean;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

export type GoogleRoutesComputeResult = {
  durationSeconds: number;
  staticDurationSeconds: number | null;
  distanceMeters: number | null;
  encodedPolyline: string | null;
  description: string | null;
  viewport: unknown;
  routeCount: number;
};

export class GoogleRoutesClientError extends Error {
  readonly code:
    | "configuration_error"
    | "invalid_request"
    | "rate_limited"
    | "provider_unavailable"
    | "no_results";
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: GoogleRoutesClientError["code"],
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "GoogleRoutesClientError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

type GoogleRoutesResponse = {
  routes?: Array<{
    duration?: string;
    staticDuration?: string;
    distanceMeters?: number;
    polyline?: { encodedPolyline?: string };
    description?: string;
    viewport?: unknown;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function parseGoogleDurationSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (!match) return null;

  const seconds = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(seconds) ? Math.round(seconds) : null;
}

function assertGoogleRoutesConfig(apiKey: string): void {
  if (!apiKey.trim()) {
    throw new GoogleRoutesClientError(
      "configuration_error",
      "GOOGLE_MAPS_SERVER_API_KEY ontbreekt.",
    );
  }
}

function assertGoogleRoutesInput(input: GoogleRoutesComputeInput): void {
  if (!["DRIVE", "BICYCLE", "WALK", "TRANSIT"].includes(input.travelMode)) {
    throw new GoogleRoutesClientError(
      "invalid_request",
      "Onbekend vervoersmiddel voor routeberekening.",
    );
  }
}

function mapProviderStatus(status: number): GoogleRoutesClientError {
  if (status === 429) {
    return new GoogleRoutesClientError(
      "rate_limited",
      "Google Routes rate limit bereikt.",
      { retryable: true, status },
    );
  }
  if (status >= 500) {
    return new GoogleRoutesClientError(
      "provider_unavailable",
      "Google Routes is tijdelijk niet bereikbaar.",
      { retryable: true, status },
    );
  }
  return new GoogleRoutesClientError(
    "invalid_request",
    "Google Routes verzoek is geweigerd.",
    { status },
  );
}

function buildGoogleRoutesBody(input: GoogleRoutesComputeInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    origin: {
      location: {
        latLng: {
          latitude: input.origin.lat,
          longitude: input.origin.lng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: input.destination.lat,
          longitude: input.destination.lng,
        },
      },
    },
    travelMode: input.travelMode,
    polylineQuality: "OVERVIEW",
    computeAlternativeRoutes: false,
  };

  if (input.travelMode === "DRIVE" && input.trafficAware !== false) {
    body.routingPreference = "TRAFFIC_AWARE";
  }

  if (input.departureTime) {
    body.departureTime = input.departureTime.toISOString();
  }

  return body;
}

export async function computeGoogleRoute(
  input: GoogleRoutesComputeInput,
): Promise<GoogleRoutesComputeResult> {
  assertGoogleRoutesConfig(input.apiKey);
  assertGoogleRoutesInput(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 5500);

  try {
    const response = await (input.fetchImpl ?? fetch)(GOOGLE_ROUTES_COMPUTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": input.apiKey,
        "X-Goog-FieldMask": GOOGLE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(buildGoogleRoutesBody(input)),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as GoogleRoutesResponse;
    if (!response.ok) {
      throw mapProviderStatus(response.status);
    }

    const route = payload.routes?.[0];
    const durationSeconds = parseGoogleDurationSeconds(route?.duration);
    if (!route || durationSeconds === null) {
      throw new GoogleRoutesClientError(
        "no_results",
        "Google Routes gaf geen bruikbare route terug.",
      );
    }

    return {
      durationSeconds,
      staticDurationSeconds: parseGoogleDurationSeconds(route.staticDuration),
      distanceMeters: Number.isFinite(route.distanceMeters)
        ? Math.round(route.distanceMeters ?? 0)
        : null,
      encodedPolyline: route.polyline?.encodedPolyline ?? null,
      description:
        typeof route.description === "string" && route.description.trim()
          ? route.description.trim()
          : null,
      viewport: route.viewport ?? null,
      routeCount: payload.routes?.length ?? 0,
    };
  } catch (error) {
    if (error instanceof GoogleRoutesClientError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new GoogleRoutesClientError(
      "provider_unavailable",
      aborted
        ? "Google Routes reageerde niet op tijd."
        : "Google Routes kon niet worden bereikt.",
      { retryable: true },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const googleRoutesClientInternals = {
  buildGoogleRoutesBody,
  parseGoogleDurationSeconds,
};
