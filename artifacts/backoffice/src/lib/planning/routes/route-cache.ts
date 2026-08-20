import "server-only";

import {
  assignmentRouteCacheTable,
  db,
  organizationSettingsTable,
} from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import {
  GOOGLE_MAPS_PROVIDER,
  type GoogleMapsUsageMetricInput,
} from "@/lib/google-maps";
import {
  dedupeGoogleMapsRequest,
  stableGoogleMapsDedupeKey,
} from "@/lib/google-maps/cache";
import { checkGoogleMapsRateLimit } from "@/lib/google-maps/rate-limit";
import { recordGoogleMapsUsageEvent } from "@/lib/google-maps/usage-recorder";
import { getDefaultRouteProvider } from "./route-provider";
import {
  canonicalVehicleTypeForRoute,
  coordinateHash,
  coordinateNumericValue,
  expiresAtFromTtl,
  parseCoordinateNumeric,
  providerModeForVehicle,
  routeCacheContextHash,
  routeExpiresAtFromPolicy,
  routeTrafficPreferenceForMode,
  routeUsageEventForMode,
} from "./route-utils";
import type {
  FailedRouteResult,
  RouteProvider,
  RouteProviderMode,
  RouteRequest,
  RouteResult,
  SuccessfulRouteResult,
} from "./types";

export type RouteCacheStatus =
  | "hit"
  | "miss"
  | "bypass"
  | "write_failed"
  | "deduped"
  | "rate_limited"
  | "negative_hit";

export type RouteResultWithCacheStatus = RouteResult & {
  cacheStatus: RouteCacheStatus;
};

type CachedRouteLookupOptions = {
  provider: string;
  now?: Date;
};

type RouteCacheWriteOptions = {
  now?: Date;
  ttlHours?: number;
  expiresAt?: Date;
};

type RouteCacheMeta = Record<string, unknown> & {
  warnings?: string[];
};

type NegativeRouteCacheEntry = {
  result: FailedRouteResult;
  expiresAt: number;
};

const negativeRouteCache = new Map<string, NegativeRouteCacheEntry>();

function routeCacheWhere(
  request: RouteRequest,
  provider: string,
  now: Date,
) {
  const vehicleType = canonicalVehicleTypeForRoute(request.vehicleType);
  return and(
    eq(assignmentRouteCacheTable.tenantId, request.tenantId),
    eq(assignmentRouteCacheTable.provider, provider),
    eq(assignmentRouteCacheTable.vehicleType, vehicleType),
    eq(assignmentRouteCacheTable.originHash, coordinateHash(request.origin)),
    eq(
      assignmentRouteCacheTable.destinationHash,
      coordinateHash(request.destination),
    ),
    eq(assignmentRouteCacheTable.requestContextHash, routeCacheContextHash(request)),
    gt(assignmentRouteCacheTable.expiresAt, now),
  );
}

function routeCacheIdentityWhere(request: RouteRequest, provider: string) {
  const vehicleType = canonicalVehicleTypeForRoute(request.vehicleType);
  return and(
    eq(assignmentRouteCacheTable.tenantId, request.tenantId),
    eq(assignmentRouteCacheTable.provider, provider),
    eq(assignmentRouteCacheTable.vehicleType, vehicleType),
    eq(assignmentRouteCacheTable.originHash, coordinateHash(request.origin)),
    eq(
      assignmentRouteCacheTable.destinationHash,
      coordinateHash(request.destination),
    ),
    eq(assignmentRouteCacheTable.requestContextHash, routeCacheContextHash(request)),
  );
}

function routeMetricEnvironment(): string {
  return process.env.APP_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
}

function routeMetricMetadata(input: {
  providerMode: RouteProviderMode;
  cacheKey: string;
  trafficPreference: "TRAFFIC_AWARE" | "NONE";
  retryable?: boolean;
  httpStatus?: number | null;
}): GoogleMapsUsageMetricInput["metadata"] {
  return {
    providerMode: input.providerMode,
    cacheKey: input.cacheKey,
    trafficPreference: input.trafficPreference,
    retryable: input.retryable ?? null,
    httpStatus: input.httpStatus ?? null,
  };
}

async function recordRouteUsage(input: {
  request: RouteRequest;
  providerMode: RouteProviderMode;
  eventType?: GoogleMapsUsageMetricInput["eventType"];
  success: boolean;
  responseTimeMs: number | null;
  cacheOrDedupeStatus: GoogleMapsUsageMetricInput["cacheOrDedupeStatus"];
  retryable?: boolean;
  httpStatus?: number | null;
}): Promise<void> {
  await recordGoogleMapsUsageEvent({
    tenantId: input.request.tenantId,
    userId: input.request.userId ?? null,
    eventType: input.eventType ?? routeUsageEventForMode(input.providerMode),
    environment: routeMetricEnvironment(),
    success: input.success,
    responseTimeMs: input.responseTimeMs,
    cacheOrDedupeStatus: input.cacheOrDedupeStatus,
    provider: GOOGLE_MAPS_PROVIDER,
    estimatedSku: "routes_compute_routes",
    metadata: routeMetricMetadata({
      providerMode: input.providerMode,
      cacheKey: routeCacheContextHash(input.request),
      trafficPreference: routeTrafficPreferenceForMode(input.providerMode),
      retryable: input.retryable,
      httpStatus: input.httpStatus,
    }),
  });
}

function negativeRouteCacheKey(
  request: RouteRequest,
  providerName: string,
): string {
  return stableGoogleMapsDedupeKey([
    "route_negative",
    providerName,
    request.tenantId,
    coordinateHash(request.origin),
    coordinateHash(request.destination),
    providerModeForVehicle(request.vehicleType),
    routeCacheContextHash(request),
  ]);
}

function getNegativeCachedRoute(
  request: RouteRequest,
  providerName: string,
  nowMs: number,
): (FailedRouteResult & { cacheStatus: "negative_hit" }) | null {
  const key = negativeRouteCacheKey(request, providerName);
  const entry = negativeRouteCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs) {
    negativeRouteCache.delete(key);
    return null;
  }
  return { ...entry.result, cacheStatus: "negative_hit" };
}

function setNegativeCachedRoute(
  request: RouteRequest,
  providerName: string,
  result: FailedRouteResult,
  nowMs: number,
): void {
  negativeRouteCache.set(negativeRouteCacheKey(request, providerName), {
    result,
    expiresAt: nowMs + 15_000,
  });
}

export async function getRouteCacheTtlHours(
  tenantId: string,
  fallbackHours = 24,
): Promise<number> {
  const [settings] = await db
    .select({ routeCacheTtlHours: organizationSettingsTable.routeCacheTtlHours })
    .from(organizationSettingsTable)
    .where(eq(organizationSettingsTable.tenantId, tenantId))
    .limit(1);

  const configured = settings?.routeCacheTtlHours;
  if (!configured || !Number.isFinite(configured)) return fallbackHours;
  return Math.max(1, Math.min(720, configured));
}

export async function getCachedRoute(
  request: RouteRequest,
  options: CachedRouteLookupOptions,
): Promise<(SuccessfulRouteResult & { cacheStatus: "hit" }) | null> {
  const now = options.now ?? new Date();
  const [cached] = await db
    .select()
    .from(assignmentRouteCacheTable)
    .where(routeCacheWhere(request, options.provider, now))
    .limit(1);

  if (!cached) return null;

  const providerMeta = (cached.providerMeta ?? {}) as RouteCacheMeta;
  return {
    success: true,
    provider: cached.provider,
    providerMode: providerModeForVehicle(cached.vehicleType),
    durationSeconds: cached.durationSeconds,
    distanceMeters: cached.distanceMeters,
    warnings: providerMeta.warnings ?? [],
    providerMeta: {
      ...providerMeta,
      cacheHit: true,
      calculatedAt: cached.calculatedAt.toISOString(),
      expiresAt: cached.expiresAt.toISOString(),
      origin: {
        lat: parseCoordinateNumeric(cached.originLat),
        lng: parseCoordinateNumeric(cached.originLng),
      },
      destination: {
        lat: parseCoordinateNumeric(cached.destinationLat),
        lng: parseCoordinateNumeric(cached.destinationLng),
      },
    },
    cacheStatus: "hit",
  };
}

export async function upsertRouteCache(
  request: RouteRequest,
  result: SuccessfulRouteResult,
  options: RouteCacheWriteOptions = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const expiresAt =
    options.expiresAt ?? expiresAtFromTtl(now, options.ttlHours ?? 24);
  const values = {
    tenantId: request.tenantId,
    provider: result.provider,
    vehicleType: canonicalVehicleTypeForRoute(request.vehicleType),
    originLat: coordinateNumericValue(request.origin.lat),
    originLng: coordinateNumericValue(request.origin.lng),
    destinationLat: coordinateNumericValue(request.destination.lat),
    destinationLng: coordinateNumericValue(request.destination.lng),
    originHash: coordinateHash(request.origin),
    destinationHash: coordinateHash(request.destination),
    requestContextHash: routeCacheContextHash(request),
    durationSeconds: result.durationSeconds,
    distanceMeters: result.distanceMeters,
    providerMeta: {
      ...(result.providerMeta ?? {}),
      warnings: result.warnings,
      providerMode: result.providerMode,
    },
    calculatedAt: now,
    expiresAt,
  };

  const [existing] = await db
    .select({ id: assignmentRouteCacheTable.id })
    .from(assignmentRouteCacheTable)
    .where(routeCacheIdentityWhere(request, result.provider))
    .limit(1);

  if (existing) {
    await db
      .update(assignmentRouteCacheTable)
      .set(values)
      .where(eq(assignmentRouteCacheTable.id, existing.id));
    return;
  }

  try {
    await db.insert(assignmentRouteCacheTable).values(values);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code !== "23505") throw error;

    await db
      .update(assignmentRouteCacheTable)
      .set(values)
      .where(routeCacheIdentityWhere(request, result.provider));
  }
}

export async function getRouteWithCache(
  request: RouteRequest,
  provider: RouteProvider = getDefaultRouteProvider(),
  options: RouteCacheWriteOptions = {},
): Promise<RouteResultWithCacheStatus> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const providerMode = providerModeForVehicle(request.vehicleType);
  const isGoogleRoutesProvider = provider.name === "google_routes";
  const cached = await getCachedRoute(request, {
    provider: provider.name,
    now,
  });
  if (cached) {
    if (isGoogleRoutesProvider) {
      await recordRouteUsage({
        request,
        providerMode,
        success: true,
        responseTimeMs: 0,
        cacheOrDedupeStatus: "cache_hit",
      });
    }
    return cached;
  }

  const negativeCached = getNegativeCachedRoute(request, provider.name, nowMs);
  if (negativeCached) {
    if (isGoogleRoutesProvider) {
      await recordRouteUsage({
        request,
        providerMode,
        success: false,
        responseTimeMs: 0,
        cacheOrDedupeStatus: "negative_cache",
        retryable: negativeCached.retryable,
      });
    }
    return negativeCached;
  }

  if (isGoogleRoutesProvider) {
    const rateLimit = await checkGoogleMapsRateLimit({
      tenantId: request.tenantId,
      userId: request.userId ?? null,
      action: "route_request",
    });
    if (!rateLimit.allowed) {
      await recordRouteUsage({
        request,
        providerMode,
        eventType: "google_api_rate_limited",
        success: false,
        responseTimeMs: 0,
        cacheOrDedupeStatus: "rate_limited",
      });
      return {
        success: false,
        provider: provider.name,
        providerMode,
        error: rateLimit.reason === "service_unavailable"
          ? "Routeberekening is tijdelijk niet beschikbaar."
          : "Routeberekening is tijdelijk begrensd. Probeer het zo opnieuw.",
        retryable: true,
        warnings: [],
        providerMeta: { rateLimitResetAt: rateLimit.resetAt, rateLimitReason: rateLimit.reason },
        cacheStatus: "rate_limited",
      };
    }
  }

  let route: RouteResult;
  let dedupeStatus: "miss" | "deduped" = "miss";
  const startedAt = Date.now();
  try {
    const deduped = await dedupeGoogleMapsRequest(
      stableGoogleMapsDedupeKey([
        "route",
        provider.name,
        request.tenantId,
        coordinateHash(request.origin),
        coordinateHash(request.destination),
        providerMode,
        routeCacheContextHash(request),
      ]),
      () => provider.getRoute(request),
      { now: nowMs },
    );
    route = deduped.value;
    dedupeStatus = deduped.status === "deduped" ? "deduped" : "miss";
  } catch {
    return {
      success: false,
      provider: provider.name,
      providerMode: providerModeForVehicle(request.vehicleType),
      error: "Routeprovider kon niet veilig worden aangeroepen.",
      retryable: true,
      warnings: [],
      cacheStatus: "miss",
    };
  }
  const responseTimeMs = Math.max(0, Date.now() - startedAt);

  if (!route.success) {
    setNegativeCachedRoute(request, provider.name, route, nowMs);
    if (isGoogleRoutesProvider) {
      await recordRouteUsage({
        request,
        providerMode,
        eventType: route.providerMeta?.providerErrorCode
          ? "google_api_error"
          : routeUsageEventForMode(providerMode),
        success: false,
        responseTimeMs,
        cacheOrDedupeStatus: dedupeStatus,
        retryable: route.retryable,
        httpStatus:
          typeof route.providerMeta?.httpStatus === "number"
            ? route.providerMeta.httpStatus
            : null,
      });
    }
    return { ...route, cacheStatus: "miss" };
  }

  try {
    const ttlHours =
      options.ttlHours ?? (await getRouteCacheTtlHours(request.tenantId));
    await upsertRouteCache(request, route, {
      ...options,
      now,
      ttlHours,
      expiresAt: routeExpiresAtFromPolicy(now, providerMode, ttlHours),
    });
    if (isGoogleRoutesProvider) {
      await recordRouteUsage({
        request,
        providerMode,
        success: true,
        responseTimeMs,
        cacheOrDedupeStatus: dedupeStatus,
      });
    }
    return { ...route, cacheStatus: dedupeStatus === "deduped" ? "deduped" : "miss" };
  } catch {
    if (isGoogleRoutesProvider) {
      await recordRouteUsage({
        request,
        providerMode,
        success: true,
        responseTimeMs,
        cacheOrDedupeStatus: "cache_miss",
      });
    }
    return { ...route, cacheStatus: "write_failed" };
  }
}

export function clearRouteRuntimeCaches(): void {
  negativeRouteCache.clear();
}
