import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Segment } from "./model";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  env: {
    OPENROUTESERVICE_API_KEY: "fictional-test-only",
    OPENROUTESERVICE_BASE_URL: "https://api.heigit.org/openrouteservice/v2",
    ROUTING_PROVIDER: "openrouteservice",
    ROUTING_CACHE_DAYS: 30,
    ROUTING_MATRIX_MINUTE_LIMIT: 35,
    ROUTING_MATRIX_DAY_LIMIT: 450,
    ROUTING_DIRECTIONS_MINUTE_LIMIT: 35,
    ROUTING_DIRECTIONS_DAY_LIMIT: 1900,
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mock.rpc }),
}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => mock.env }));
import { parseMatrix, routeKey, routesFor, type CachedRoute } from "./provider";
const leg = {
  origin: [4.3, 52.1],
  destination: [4.4, 52.2],
  profile: "driving-car",
} as Segment;
const cache = new Map<string, CachedRoute>();
beforeEach(() => {
  cache.clear();
  mock.env.OPENROUTESERVICE_API_KEY = "fictional-test-only";
  mock.rpc.mockReset();
  mock.rpc.mockImplementation(async (name, args) => {
    if (name === "route_cache_read")
      return {
        data: args.keys.map((k: string) => cache.get(k)).filter(Boolean),
        error: null,
      };
    if (name === "route_cache_claim")
      return { data: { claimed: args.keys, limited: false }, error: null };
    if (name === "route_cache_finish") {
      cache.set(args.cache_key, {
        key: args.cache_key,
        result: args.payload,
        calculated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        leased_until: null,
        retry_after: null,
        error_code: args.failure,
      });
      return { error: null };
    }
    throw new Error("Unexpected RPC");
  });
});
afterEach(() => vi.unstubAllGlobals());
it("keeps direction and profile in the cache key; tenant margins do not invalidate routes", () => {
  expect(routeKey(leg)).not.toBe(
    routeKey({ ...leg, origin: leg.destination, destination: leg.origin }),
  );
  expect(routeKey(leg)).not.toBe(
    routeKey({ ...leg, profile: "cycling-electric" }),
  );
  expect(routeKey(leg)).toBe(routeKey({ ...leg, marginMinutes: 50 }));
  expect(routeKey(leg, true)).not.toBe(routeKey(leg));
});
it("asks a minimal one-to-many matrix, deduplicates and reuses a fresh result", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ durations: [[1080, 360]], distances: [[5000, 1000]] }),
    );
  vi.stubGlobal("fetch", fetcher);
  const second = { ...leg, destination: [4.5, 52.3] as [number, number] };
  await routesFor([leg, leg, second]);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe(
    "https://api.heigit.org/openrouteservice/v2/matrix/driving-car",
  );
  expect(JSON.parse(init.body)).toMatchObject({
    locations: [
      [4.3, 52.1],
      [4.4, 52.2],
      [4.5, 52.3],
    ],
    sources: ["0"],
    destinations: ["1", "2"],
  });
  expect(cache.get(routeKey(leg))?.result?.seconds).toBe(1080);
  await routesFor([leg, second]);
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each([429, 500, 404])(
  "HTTP %s never yields a fictitious zero",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status })),
    );
    const r = await routesFor([leg]);
    expect(r.cache.get(routeKey(leg))?.result).toBeNull();
    expect(r.cache.get(routeKey(leg))?.error_code).toBe(
      status === 429
        ? "rate_limit"
        : status === 404
          ? "no_route"
          : "provider_unavailable",
    );
  },
);
it("null matrix entry means no route; malformed values fail instead of defaulting to zero", () => {
  expect(parseMatrix({ durations: [[null]], distances: [[null]] }, 1)).toEqual([
    null,
  ]);
  expect(() =>
    parseMatrix({ durations: [["18"]], distances: [[100]] }, 1),
  ).toThrow();
  expect(parseMatrix({ durations: [[0]], distances: [[0]] }, 1)).toEqual([
    { seconds: 0, metres: 0 },
  ]);
});
it("missing configuration sends no provider request", async () => {
  mock.env.OPENROUTESERVICE_API_KEY = "";
  const f = vi.fn();
  vi.stubGlobal("fetch", f);
  expect((await routesFor([leg])).configured).toBe(false);
  expect(f).not.toHaveBeenCalled();
});
it("requests geometry only explicitly and validates coordinates", async () => {
  const f = vi.fn().mockResolvedValue(
    Response.json({
      features: [
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [4.3, 52.1],
              [4.4, 52.2],
            ],
          },
          properties: { summary: { duration: 1080, distance: 5000 } },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", f);
  const r = await routesFor([leg], true);
  expect(f.mock.calls[0][0]).toContain("/directions/driving-car/geojson");
  expect(r.cache.get(routeKey(leg, true))?.result?.geometry?.type).toBe(
    "LineString",
  );
});
