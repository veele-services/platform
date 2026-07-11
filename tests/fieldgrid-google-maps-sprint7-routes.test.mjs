import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Sprint 7 central Routes API client uses safe computeRoutes field masks", () => {
  const client = read("artifacts/backoffice/src/lib/google-maps/routes-client.ts");

  assert.match(client, /directions\/v2:computeRoutes/u);
  assert.match(client, /GOOGLE_ROUTES_FIELD_MASK/u);
  assert.match(client, /routes\.duration/u);
  assert.match(client, /routes\.staticDuration/u);
  assert.match(client, /routes\.distanceMeters/u);
  assert.match(client, /routes\.polyline\.encodedPolyline/u);
  assert.match(client, /routes\.description/u);
  assert.match(client, /routes\.viewport/u);
  assert.match(client, /X-Goog-FieldMask/u);
  assert.doesNotMatch(client, /reviews|rating|photos|openingHours|websiteUri/u);
});

test("Sprint 7 Routes API supports only canon modes and DRIVE traffic aware", () => {
  const client = read("artifacts/backoffice/src/lib/google-maps/routes-client.ts");
  const utils = read("artifacts/backoffice/src/lib/planning/routes/route-utils.ts");

  for (const mode of ["DRIVE", "BICYCLE", "WALK", "TRANSIT"]) {
    assert.match(client, new RegExp(`"${mode}"`, "u"));
  }
  assert.match(client, /input\.travelMode === "DRIVE"[\s\S]*routingPreference = "TRAFFIC_AWARE"/u);
  assert.match(utils, /routeTrafficPreferenceForMode/u);
  assert.match(utils, /providerMode === "DRIVE" \? "TRAFFIC_AWARE" : "NONE"/u);
  assert.doesNotMatch(client, /TRAFFIC_AWARE_OPTIMAL|TWO_WHEELER|computeRouteMatrix|optimizeWaypointOrder|routeOptimization|fleet/u);
});

test("Sprint 7 provider uses GOOGLE_MAPS_SERVER_API_KEY without legacy route key fallback", () => {
  const provider = read("artifacts/backoffice/src/lib/planning/routes/route-provider.ts");
  const googleProvider = read("artifacts/backoffice/src/lib/planning/routes/google-routes-provider.ts");

  assert.match(provider, /process\.env\.GOOGLE_MAPS_SERVER_API_KEY/u);
  assert.doesNotMatch(provider, /process\.env\.GOOGLE_ROUTES_API_KEY/u);
  assert.match(googleProvider, /process\.env\.GOOGLE_MAPS_SERVER_API_KEY/u);
  assert.doesNotMatch(googleProvider, /process\.env\.GOOGLE_ROUTES_API_KEY/u);
  assert.match(googleProvider, /GOOGLE_MAPS_SERVER_API_KEY is niet geconfigureerd/u);
  assert.doesNotMatch(googleProvider, /NEXT_PUBLIC/u);
});

test("Sprint 7 cache identity includes route request context and short policy TTL", () => {
  const routeCache = read("artifacts/backoffice/src/lib/planning/routes/route-cache.ts");
  const routeUtils = read("artifacts/backoffice/src/lib/planning/routes/route-utils.ts");
  const schema = read("lib/db/src/schema/planning-routes.ts");
  const migration = read("lib/db/migrations/20260710220000_google_routes_cache_context.sql");

  assert.match(schema, /requestContextHash: varchar\("request_context_hash"/u);
  assert.match(migration, /request_context_hash/u);
  assert.match(routeCache, /requestContextHash: routeCacheContextHash\(request\)/u);
  assert.match(routeUtils, /departureTimeBucket/u);
  assert.match(routeUtils, /routeCacheContextHash/u);
  assert.match(routeUtils, /routeCacheTtlMsForMode/u);
  assert.match(routeUtils, /5 \* 60 \* 1000/u);
  assert.match(routeUtils, /30 \* 60 \* 1000/u);
});

test("Sprint 7 route orchestration has dedupe, negative cache, metrics and rate limiting", () => {
  const routeCache = read("artifacts/backoffice/src/lib/planning/routes/route-cache.ts");
  const routeUtils = read("artifacts/backoffice/src/lib/planning/routes/route-utils.ts");
  const rateLimit = read("artifacts/backoffice/src/lib/google-maps/rate-limit.ts");
  const types = read("artifacts/backoffice/src/lib/planning/routes/types.ts");

  assert.match(routeCache, /dedupeGoogleMapsRequest/u);
  assert.match(routeCache, /stableGoogleMapsDedupeKey/u);
  assert.match(routeCache, /negativeRouteCache/u);
  assert.match(routeCache, /checkGoogleMapsRateLimit/u);
  assert.match(rateLimit, /"route_request"/u);
  assert.match(routeCache, /recordGoogleMapsUsageEvent/u);
  assert.match(routeUtils, /route_request_drive_traffic/u);
  assert.match(routeCache, /google_api_error/u);
  assert.match(routeCache, /google_api_rate_limited/u);
  assert.match(routeCache, /userId: input\.request\.userId \?\? null/u);
  assert.match(types, /userId\?: string \| null/u);
});

test("Sprint 7 route metrics and errors avoid secrets and personal payloads", () => {
  const routeCache = read("artifacts/backoffice/src/lib/planning/routes/route-cache.ts");
  const metrics = read("artifacts/backoffice/src/lib/google-maps/metrics.ts");
  const client = read("artifacts/backoffice/src/lib/google-maps/routes-client.ts");

  assert.match(metrics, /address\|api\.\?key\|secret\|token\|polyline/u);
  assert.match(routeCache, /metadata: routeMetricMetadata/u);
  assert.doesNotMatch(routeCache, /encodedPolyline: input|origin: input|destination: input/u);
  assert.doesNotMatch(client, /console\.log\([\s\S]*apiKey/u);
  assert.doesNotMatch(client, /NEXT_PUBLIC_GOOGLE_MAPS_SERVER_API_KEY/u);
});
