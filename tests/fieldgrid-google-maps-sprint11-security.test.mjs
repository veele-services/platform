import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const backofficePlaceRoutes = [
  "artifacts/backoffice/src/app/api/google-maps/places/autocomplete/route.ts",
  "artifacts/backoffice/src/app/api/google-maps/places/details/route.ts",
];

const customerPlaceRoutes = [
  "artifacts/klant-pwa/src/app/api/google-maps/places/autocomplete/route.ts",
  "artifacts/klant-pwa/src/app/api/google-maps/places/details/route.ts",
];

const personnelPlaceRoutes = [
  "artifacts/personeel-pwa/src/app/api/google-maps/places/autocomplete/route.ts",
  "artifacts/personeel-pwa/src/app/api/google-maps/places/details/route.ts",
];

test("Sprint 11 DB hardening closes Maps usage and route tables to browser roles", () => {
  const migration = read("lib/db/migrations/20260711110000_google_maps_security_hardening.sql");

  for (const table of [
    "google_maps_usage_events",
    "assignment_route_cache",
    "assignment_route_contexts",
  ]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "u"));
    assert.match(migration, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, "u"));
    assert.match(migration, new RegExp(`${table}_service_role_all`, "u"));
  }

  assert.match(migration, /DROP POLICY IF EXISTS google_maps_usage_events_management_read/u);
  assert.match(migration, /DROP POLICY IF EXISTS assignment_route_cache_management/u);
  assert.match(migration, /DROP POLICY IF EXISTS assignment_route_contexts_management/u);
  assert.doesNotMatch(migration, /CREATE POLICY[\s\S]*TO authenticated/u);
});

test("Sprint 11 backoffice Places routes require auth, server tenant context, permissions, validation and rate limits", () => {
  for (const file of backofficePlaceRoutes) {
    const route = read(file);
    assert.match(route, /requireCurrentTenantIdFromRequest\(request\)/u, `${file} resolves tenant server-side from the route request`);
    assert.match(route, /supabase\.auth\.getUser\(\)/u, `${file} requires an authenticated user`);
    assert.match(route, /hasPermissionFromRequest/u, `${file} checks request-scoped permissions`);
    assert.match(route, /\.safeParse\(await request\.json\(\)\)/u, `${file} validates input schema`);
    assert.match(route, /checkGoogleMapsRateLimit/u, `${file} applies rate limiting`);
    assert.match(route, /createSafeGoogleMapsError/u, `${file} returns safe generic errors`);
    assert.match(route, /console\.error\("\[google-maps\]/u, `${file} logs safe server diagnostics`);
    assert.doesNotMatch(route, /tenantId:\s*z\./u, `${file} must not accept browser tenant IDs`);
    assert.doesNotMatch(route, /NextResponse\.json\(\{[^}]*apiKey/iu, `${file} must not expose API keys`);
  }
});

test("Sprint 11 PWA Places routes use portal identity tenant context and sanitize metrics", () => {
  for (const file of customerPlaceRoutes) {
    const route = read(file);
    assert.match(route, /getMyCustomerIdentity\(\)/u, `${file} uses customer identity`);
    assert.match(route, /identity\.tenantId/u, `${file} derives tenant from identity`);
    assert.match(route, /schema\.safeParse\(await request\.json\(\)\)/u, `${file} validates request body`);
    assert.match(route, /checkCustomerGoogleMapsRateLimit/u, `${file} rate limits`);
    assert.match(route, /sanitizeGoogleMapsMetricMetadata/u, `${file} sanitizes usage metadata`);
    assert.match(route, /console\.error\("\[google-maps\]/u, `${file} logs safe server diagnostics`);
    assert.doesNotMatch(route, /tenantId:\s*z\./u, `${file} must not accept browser tenant IDs`);
  }

  for (const file of personnelPlaceRoutes) {
    const route = read(file);
    assert.match(route, /getMyPersonnel\(\)/u, `${file} uses personnel identity`);
    assert.match(route, /requireCurrentPersonnelPortalTenantId\(\)/u, `${file} resolves tenant server-side`);
    assert.match(route, /schema\.safeParse\(await request\.json\(\)\)/u, `${file} validates request body`);
    assert.match(route, /checkPersonnelGoogleMapsRateLimit/u, `${file} rate limits`);
    assert.match(route, /sanitizeGoogleMapsMetricMetadata/u, `${file} sanitizes usage metadata`);
    assert.match(route, /console\.error\("\[google-maps\]/u, `${file} logs safe server diagnostics`);
    assert.doesNotMatch(route, /tenantId:\s*z\./u, `${file} must not accept browser tenant IDs`);
  }
});

test("Sprint 11 usage endpoint does not trust client SKUs or tenant IDs", () => {
  const route = read("artifacts/backoffice/src/app/api/google-maps/usage/route.ts");
  const limiter = read("artifacts/backoffice/src/lib/google-maps/rate-limit.ts");

  assert.match(route, /requireCurrentTenantIdFromRequest\(request\)/u);
  assert.match(route, /supabase\.auth\.getUser\(\)/u);
  assert.match(route, /canRecordGoogleMapsUsage/u);
  assert.match(route, /hasPermissionFromRequest\(request,\s*"planning", "read"\)/u);
  assert.match(route, /checkGoogleMapsRateLimit/u);
  assert.match(route, /action: "usage_event"/u);
  assert.match(route, /estimatedSkuForEvent\(parsed\.data\.eventType\)/u);
  assert.doesNotMatch(route, /parsed\.data\.estimatedSku/u);
  assert.doesNotMatch(route, /estimatedSku:\s*z\./u);
  assert.doesNotMatch(route, /tenantId:\s*z\./u);
  assert.match(limiter, /"usage_event"/u);
});

test("Sprint 11 route calculation remains server-side tenant scoped and permission checked", () => {
  const planning = read("artifacts/backoffice/src/app/actions/planning.ts");
  const routeCache = read("artifacts/backoffice/src/lib/planning/routes/route-cache.ts");

  assert.match(planning, /export async function calculatePlanningMapRoute/u);
  assert.match(planning, /UUID_RE\.test\(input\.assignmentId\)/u);
  assert.match(planning, /hasPermission\("planning", "read"\)/u);
  assert.match(planning, /requireCurrentTenantId\(\)/u);
  assert.match(planning, /eq\(assignmentPersonnelTable\.status, "assigned"\)/u);
  assert.match(planning, /eq\(personnelTable\.tenantId, tenantId\)/u);
  assert.match(planning, /eq\(personnelTable\.isActive, true\)/u);
  assert.match(planning, /eq\(assignmentsTable\.tenantId, tenantId\)/u);
  assert.match(planning, /validateRouteCoordinates\(origin, destination\)/u);
  assert.match(
    planning,
    /calculatePlanningMapRoute\(input: \{\s*assignmentId: string;\s*personnelId: string;\s*travelMode\?: PlanningRouteTravelMode \| string;\s*\}\)/u,
    "route action input must not accept tenantId from the browser",
  );

  assert.match(routeCache, /checkGoogleMapsRateLimit/u);
  assert.match(routeCache, /eq\(assignmentRouteCacheTable\.tenantId, request\.tenantId\)/u);
  assert.match(routeCache, /stableGoogleMapsDedupeKey/u);
  const metricStart = routeCache.indexOf("function routeMetricMetadata");
  const metricEnd = routeCache.indexOf("async function recordRouteUsage", metricStart);
  const metricMetadata = routeCache.slice(metricStart, metricEnd);
  assert.doesNotMatch(metricMetadata, /origin|destination|lat|lng|address|polyline/iu);
});

test("Sprint 11 server API key is absent from client-facing Google Maps code", () => {
  const clientFacingFiles = [
    "artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx",
    "artifacts/backoffice/src/components/google-maps/AddressAutocomplete.tsx",
    "artifacts/backoffice/src/components/assignments/PlanningMapView.tsx",
    "artifacts/klant-pwa/src/components/google-maps/AddressAutocomplete.tsx",
    "artifacts/personeel-pwa/src/components/google-maps/AddressAutocomplete.tsx",
  ];

  for (const file of clientFacingFiles) {
    const content = read(file);
    assert.doesNotMatch(content, /GOOGLE_MAPS_SERVER_API_KEY/u, `${file} must not reference the server key`);
    assert.doesNotMatch(content, /GOOGLE_ROUTES_API_KEY/u, `${file} must not reference the legacy server key`);
  }

  const sharedSanitizer = read("lib/db/src/google-maps-metrics.ts");
  assert.match(sharedSanitizer, /address\|api\.\?key\|secret\|token\|polyline\|payload/u);
  assert.match(sharedSanitizer, /place\.\?id\|query\|input\|origin\|destination/u);
});
