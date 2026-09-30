import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import type { Json } from "@/lib/database.types";
import type { Segment, TravelState } from "./model";

export type RouteValue = {
  seconds: number;
  metres: number;
  geometry?: { type: "LineString"; coordinates: number[][] };
};
export type CachedRoute = {
  key: string;
  result: RouteValue | null;
  calculated_at: string | null;
  expires_at: string | null;
  leased_until: string | null;
  retry_after: string | null;
  error_code: TravelState | null;
};
export function routeKey(s: Segment, geometry = false) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        provider: getServerEnv().OPENROUTESERVICE_BASE_URL,
        profile: s.profile,
        origin: s.origin,
        destination: s.destination,
        options: {},
        geometry,
      }),
    )
    .digest("hex");
}
async function read(keys: string[]): Promise<Map<string, CachedRoute>> {
  if (!keys.length) return new Map();
  const { data, error } = await createAdminClient().rpc("route_cache_read", {
    keys,
  });
  if (error) throw new Error("Routecache tijdelijk niet beschikbaar.");
  return new Map((data as unknown as CachedRoute[]).map((r) => [r.key, r]));
}
export function parseMatrix(
  body: unknown,
  count: number,
): (RouteValue | null)[] {
  const data = body as { durations?: unknown[][]; distances?: unknown[][] };
  if (
    !Array.isArray(data.durations?.[0]) ||
    !Array.isArray(data.distances?.[0]) ||
    data.durations[0].length !== count ||
    data.distances[0].length !== count
  )
    throw new Error("provider_unavailable");
  return data.durations[0].map((seconds, i) => {
    const metres = data.distances![0][i];
    if (seconds === null || metres === null) return null;
    if (
      typeof seconds !== "number" ||
      typeof metres !== "number" ||
      !Number.isFinite(seconds) ||
      !Number.isFinite(metres) ||
      seconds < 0 ||
      metres < 0
    )
      throw new Error("provider_unavailable");
    return { seconds, metres };
  });
}
export async function routesFor(
  segments: Segment[],
  geometry = false,
): Promise<{
  cache: Map<string, CachedRoute>;
  limited: Set<string>;
  configured: boolean;
}> {
  const env = getServerEnv(),
    db = createAdminClient();
  const unique = new Map(
    segments
      .filter((s) => s.origin && s.destination && s.profile)
      .map((s) => [routeKey(s, geometry), s]),
  );
  const cache = await read([...unique.keys()]);
  const configured =
      env.ROUTING_PROVIDER !== "disabled" &&
      Boolean(env.OPENROUTESERVICE_API_KEY),
    limited = new Set<string>();
  if (!configured) return { cache, limited, configured };
  const groups = new Map<string, Array<[string, Segment]>>();
  for (const [key, s] of unique) {
    const c = cache.get(key),
      now = Date.now();
    if (
      c &&
      (Date.parse(c.expires_at || "") > now ||
        Date.parse(c.leased_until || "") > now ||
        Date.parse(c.retry_after || "") > now)
    )
      continue;
    // A one-to-many matrix asks only for required legs sharing an origin.
    const group = geometry ? key : JSON.stringify([s.profile, s.origin]);
    groups.set(group, [...(groups.get(group) || []), [key, s]]);
  }
  const batches = [...groups.values()].flatMap((g) =>
    Array.from({ length: Math.ceil(g.length / 20) }, (_, i) =>
      g.slice(i * 20, (i + 1) * 20),
    ),
  );
  // A bounded request-driven queue. Other clients see pending leases; subsequent
  // polls pick up deferred batches. Limits and deduplication are database-wide.
  for (const batch of batches.slice(0, 6)) {
    const lease = randomUUID();
    const claim = await db.rpc("route_cache_claim", {
      keys: batch.map(([key]) => key),
      provider_name: "openrouteservice",
      request_kind: geometry ? "directions" : "matrix",
      minute_limit: geometry
        ? env.ROUTING_DIRECTIONS_MINUTE_LIMIT
        : env.ROUTING_MATRIX_MINUTE_LIMIT,
      day_limit: geometry
        ? env.ROUTING_DIRECTIONS_DAY_LIMIT
        : env.ROUTING_MATRIX_DAY_LIMIT,
      lease_id: lease,
    });
    if (claim.error) throw new Error("Routecache tijdelijk niet beschikbaar.");
    const outcome = claim.data as unknown as {
      claimed: string[];
      limited: boolean;
    };
    if (outcome.limited) {
      batch.forEach(([k]) => limited.add(k));
      continue;
    }
    const claimed = batch.filter(([key]) => outcome.claimed.includes(key));
    if (!claimed.length) continue;
    const first = claimed[0][1];
    let values: (RouteValue | null)[] = [],
      failure: string | null = null;
    try {
      const url = `${env.OPENROUTESERVICE_BASE_URL.replace(/\/$/, "")}/${geometry ? "directions" : "matrix"}/${first.profile}${geometry ? "/geojson" : ""}`;
      const body = geometry
        ? {
            coordinates: [first.origin, first.destination],
            instructions: false,
          }
        : {
            locations: [first.origin, ...claimed.map(([, s]) => s.destination)],
            sources: ["0"],
            destinations: claimed.map((_, i) => String(i + 1)),
            metrics: ["duration", "distance"],
            units: "m",
            resolve_locations: false,
          };
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: env.OPENROUTESERVICE_API_KEY!,
          "content-type": "application/json",
          Accept: "application/json, application/geo+json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "rate_limit"
            : response.status === 404
              ? "no_route"
              : "provider_unavailable",
        );
      const data = await response.json();
      if (!geometry) values = parseMatrix(data, claimed.length);
      else {
        const f = data.features?.[0],
          summary = f?.properties?.summary;
        if (
          !f ||
          f.geometry?.type !== "LineString" ||
          !Array.isArray(f.geometry.coordinates) ||
          !Number.isFinite(summary?.duration) ||
          summary.duration < 0 ||
          !Number.isFinite(summary?.distance) ||
          summary.distance < 0 ||
          !f.geometry.coordinates.every(
            (c: unknown) =>
              Array.isArray(c) &&
              c.length >= 2 &&
              c.every(Number.isFinite) &&
              Math.abs(c[0]) <= 180 &&
              Math.abs(c[1]) <= 90,
          )
        )
          throw new Error("no_route");
        values = [
          {
            seconds: summary.duration,
            metres: summary.distance,
            geometry: f.geometry,
          },
        ];
      }
    } catch (e) {
      failure =
        e instanceof Error && ["rate_limit", "no_route"].includes(e.message)
          ? e.message
          : "provider_unavailable";
    }
    await Promise.all(
      claimed.map(async ([key], i) => {
        const result = await db.rpc("route_cache_finish", {
          cache_key: key,
          lease_id: lease,
          payload: (values[i] || null) as unknown as Json,
          failure: (failure ||
            (!values[i] ? "no_route" : null)) as unknown as string,
          ttl_days: env.ROUTING_CACHE_DAYS,
        });
        if (result.error)
          throw new Error("Routecache kon niet worden bijgewerkt.");
      }),
    );
  }
  return { cache: await read([...unique.keys()]), limited, configured };
}
