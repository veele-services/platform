import "server-only";

import {
  assignmentRouteCacheTable,
  db,
  organizationSettingsTable,
} from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { getDefaultRouteProvider } from "./route-provider";
import {
  coordinateHash,
  coordinateNumericValue,
  expiresAtFromTtl,
  parseCoordinateNumeric,
  providerModeForVehicle,
} from "./route-utils";
import type {
  RouteProvider,
  RouteRequest,
  RouteResult,
  SuccessfulRouteResult,
} from "./types";

export type RouteCacheStatus =
  | "hit"
  | "miss"
  | "bypass"
  | "write_failed";

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

function routeCacheWhere(
  request: RouteRequest,
  provider: string,
  now: Date,
) {
  return and(
    eq(assignmentRouteCacheTable.tenantId, request.tenantId),
    eq(assignmentRouteCacheTable.provider, provider),
    eq(assignmentRouteCacheTable.vehicleType, request.vehicleType),
    eq(assignmentRouteCacheTable.originHash, coordinateHash(request.origin)),
    eq(
      assignmentRouteCacheTable.destinationHash,
      coordinateHash(request.destination),
    ),
    gt(assignmentRouteCacheTable.expiresAt, now),
  );
}

function routeCacheIdentityWhere(request: RouteRequest, provider: string) {
  return and(
    eq(assignmentRouteCacheTable.tenantId, request.tenantId),
    eq(assignmentRouteCacheTable.provider, provider),
    eq(assignmentRouteCacheTable.vehicleType, request.vehicleType),
    eq(assignmentRouteCacheTable.originHash, coordinateHash(request.origin)),
    eq(
      assignmentRouteCacheTable.destinationHash,
      coordinateHash(request.destination),
    ),
  );
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
    vehicleType: request.vehicleType,
    originLat: coordinateNumericValue(request.origin.lat),
    originLng: coordinateNumericValue(request.origin.lng),
    destinationLat: coordinateNumericValue(request.destination.lat),
    destinationLng: coordinateNumericValue(request.destination.lng),
    originHash: coordinateHash(request.origin),
    destinationHash: coordinateHash(request.destination),
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
  const cached = await getCachedRoute(request, {
    provider: provider.name,
    now,
  });
  if (cached) return cached;

  let route: RouteResult;
  try {
    route = await provider.getRoute(request);
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

  if (!route.success) {
    return { ...route, cacheStatus: "miss" };
  }

  try {
    const ttlHours =
      options.ttlHours ?? (await getRouteCacheTtlHours(request.tenantId));
    await upsertRouteCache(request, route, { ...options, now, ttlHours });
    return { ...route, cacheStatus: "miss" };
  } catch {
    return { ...route, cacheStatus: "write_failed" };
  }
}
