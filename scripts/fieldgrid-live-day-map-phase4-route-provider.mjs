#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkMode = process.argv.includes("--check");

const files = {
  types: "artifacts/backoffice/src/lib/planning/routes/types.ts",
  utils: "artifacts/backoffice/src/lib/planning/routes/route-utils.ts",
  googleProvider:
    "artifacts/backoffice/src/lib/planning/routes/google-routes-provider.ts",
  mockProvider:
    "artifacts/backoffice/src/lib/planning/routes/mock-route-provider.ts",
  routeProvider:
    "artifacts/backoffice/src/lib/planning/routes/route-provider.ts",
  routeCache: "artifacts/backoffice/src/lib/planning/routes/route-cache.ts",
  routeIndex: "artifacts/backoffice/src/lib/planning/routes/index.ts",
  schema: "lib/db/src/schema/planning-routes.ts",
  settingsSchema: "lib/db/src/schema/organization-settings.ts",
  docs: "docs/fieldgrid-live-day-map-phase4-route-provider-cache.md",
  packageJson: "package.json",
};

function read(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute, "utf8");
}

const failures = [];

function requireFile(key) {
  const contents = read(files[key]);
  if (!contents) failures.push(`${files[key]} ontbreekt.`);
  return contents ?? "";
}

function mustContain(key, needle, label = needle) {
  const contents = requireFile(key);
  if (!contents.includes(needle)) {
    failures.push(`${files[key]} mist: ${label}`);
  }
}

function mustNotContain(key, needle, label = needle) {
  const contents = requireFile(key);
  if (contents.includes(needle)) {
    failures.push(`${files[key]} bevat verboden fase-4 patroon: ${label}`);
  }
}

for (const key of [
  "utils",
  "googleProvider",
  "mockProvider",
  "routeProvider",
  "routeCache",
  "routeIndex",
]) {
  mustContain(key, 'import "server-only";', "server-only guard");
  mustNotContain(key, "NEXT_PUBLIC", "client-side routeprovider config");
  mustNotContain(key, "maplibre", "kaart-UI in routeproviderlaag");
  mustNotContain(key, "PlanningMapView", "kaartcomponent in routeproviderlaag");
}

mustContain("types", "RouteProvider", "route provider contract");
mustContain("types", "RouteRequest", "route request contract");
mustContain("types", "RouteResult", "route result contract");
mustContain("types", "RouteVehicleType", "vehicle type reuse");

mustContain("utils", "providerModeForVehicle", "vehicle mode mapping");
mustContain("utils", 'case "moped_or_scooter"', "legacy moped/scooter mapping");
mustContain("utils", 'return "DRIVE"', "moped/scooter maps to DRIVE");
mustNotContain("utils", "TWO_WHEELER", "TWO_WHEELER is out of Google Maps canon scope");
mustContain("utils", "coordinateHash", "stable cache coordinate hash");
mustContain("utils", "expiresAtFromTtl", "TTL calculation");

mustContain("googleProvider", "GOOGLE_ROUTES_API_KEY", "server-only Google API key");
mustContain("googleProvider", "routes.googleapis.com", "Google Routes endpoint");
mustContain("googleProvider", "X-Goog-Api-Key", "Google key header");
mustContain("googleProvider", "X-Goog-FieldMask", "field mask");
mustContain("googleProvider", "AbortController", "provider timeout");
mustContain("googleProvider", "parseGoogleDurationSeconds", "duration parser");
mustContain("googleProvider", "retryable", "retryable provider failures");

mustContain("mockProvider", "createMockRouteProvider", "deterministic mock provider");
mustContain("mockProvider", "haversineDistanceMeters", "haversine distance");
mustContain("mockProvider", "DEFAULT_SPEED_KILOMETERS_PER_HOUR", "vehicle speed table");
mustContain("mockProvider", "deterministic: true", "deterministic metadata");

mustContain("routeProvider", "FIELDGRID_ROUTE_PROVIDER", "mock provider override");
mustContain("routeProvider", "createRouteProvider", "provider factory");
mustContain("routeProvider", "getDefaultRouteProvider", "default provider");

mustContain("routeCache", "assignmentRouteCacheTable", "route cache table");
mustContain("routeCache", "organizationSettingsTable", "tenant route settings");
mustContain("routeCache", "tenantId", "tenant-scoped cache key");
mustContain("routeCache", "originHash", "origin cache hash");
mustContain("routeCache", "destinationHash", "destination cache hash");
mustContain("routeCache", "expiresAt", "cache expiry");
mustContain("routeCache", "getCachedRoute", "cache read helper");
mustContain("routeCache", "upsertRouteCache", "cache write helper");
mustContain("routeCache", "getRouteWithCache", "route orchestration helper");
mustContain("routeCache", "getRouteCacheTtlHours", "tenant TTL helper");
mustContain("routeCache", 'cacheStatus: "write_failed"', "safe cache write failure");

mustContain("schema", "assignment_route_cache", "route cache schema");
mustContain("schema", "assignment_route_cache_unique_idx", "unique route cache key");
mustContain("schema", "assignment_route_cache_tenant_expires_idx", "tenant expiry index");
mustContain("settingsSchema", "routeProvider", "route provider setting");
mustContain("settingsSchema", "routeCacheTtlHours", "route cache TTL setting");

mustContain("docs", "Routeprovider en cache zonder UI", "phase 4 doc title");
mustContain("docs", "GOOGLE_ROUTES_API_KEY", "server secret documentation");
mustContain("docs", "server-only", "server-only documentation");
mustContain("docs", "geen kaart-UI", "no UI guarantee");
mustContain("docs", "tenant-scoped", "tenant scope documentation");
mustContain("docs", "mock", "mock provider documentation");

mustContain("packageJson", "fieldgrid:live-day-map-phase4", "package script");
mustContain(
  "packageJson",
  "fieldgrid:live-day-map-phase4:check",
  "package check script",
);

if (failures.length > 0) {
  console.error("Fieldgrid live day map phase 4 route provider check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const message = "Fieldgrid live day map phase 4 route provider check passed.";
if (checkMode) {
  console.log(message);
} else {
  console.log(`${message} Run with --check in CI for strict mode.`);
}
