import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Sprint 0 baseline: planning map still uses current raster tiles pending Google migration", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");

  assert.match(mapView, /basemaps\.cartocdn\.com\/light_all/u);
  assert.match(mapView, /tile\.openstreetmap\.org/u);
  assert.match(mapView, /OpenStreetMap & CARTO/u);
  assert.match(mapView, /STATUS_COLORS/u);
  assert.doesNotMatch(mapView, /@googlemaps\/js-api-loader|google\.maps\.Map/u);
});

test("Sprint 0 baseline: address suggestions still use PDOK through shared helpers", () => {
  const dbGeocoding = read("lib/db/src/address-geocoding.ts");
  const backofficeAddressRoute = read("artifacts/backoffice/src/app/api/address-suggestions/route.ts");
  const personnelAddressRoute = read("artifacts/personeel-pwa/src/app/api/address-suggestions/route.ts");

  assert.match(dbGeocoding, /api\.pdok\.nl\/bzk\/locatieserver\/search\/v3_1\/free/u);
  assert.match(dbGeocoding, /provider:\s*"pdok"/u);
  assert.match(dbGeocoding, /q\.length < 4/u);
  assert.match(backofficeAddressRoute, /suggestDutchAddresses/u);
  assert.match(personnelAddressRoute, /suggestDutchAddresses/u);
});

test("Sprint 0 baseline: route provider has Google Routes server adapter and mock fallback", () => {
  const routeProvider = read("artifacts/backoffice/src/lib/planning/routes/route-provider.ts");
  const googleProvider = read("artifacts/backoffice/src/lib/planning/routes/google-routes-provider.ts");
  const mockProvider = read("artifacts/backoffice/src/lib/planning/routes/mock-route-provider.ts");

  assert.match(routeProvider, /FIELDGRID_ROUTE_PROVIDER/u);
  assert.match(routeProvider, /GOOGLE_ROUTES_API_KEY/u);
  assert.match(routeProvider, /createMockRouteProvider/u);
  assert.match(googleProvider, /directions\/v2:computeRoutes/u);
  assert.match(googleProvider, /TRAFFIC_AWARE/u);
  assert.match(googleProvider, /routes\.duration,routes\.distanceMeters,routes\.warnings/u);
  assert.match(mockProvider, /ROUTE_PROVIDER_MOCK/u);
});

test("Sprint 0 baseline: planning map data is tenant-scoped and permission-gated", () => {
  const planningActions = read("artifacts/backoffice/src/app/actions/planning.ts");

  assert.match(planningActions, /hasPermission\("planning",\s*"read"\)/u);
  assert.match(planningActions, /requireCurrentTenantId\(\)/u);
  assert.match(planningActions, /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u);
  assert.match(planningActions, /eq\(personnelTable\.tenantId,\s*tenantId\)/u);
  assert.match(planningActions, /eq\(customersTable\.tenantId,\s*tenantId\)/u);
  assert.match(planningActions, /eq\(objectsTable\.tenantId,\s*tenantId\)/u);
  assert.match(planningActions, /eq\(assignmentRouteContextsTable\.tenantId,\s*tenantId\)/u);
});

test("Sprint 0 baseline: personnel vehicle types are normalized with legacy mapping", () => {
  const personnelSchema = read("lib/db/src/schema/personnel.ts");
  const routeUtils = read("artifacts/backoffice/src/lib/planning/routes/route-utils.ts");

  for (const vehicleType of ["DRIVE", "BICYCLE", "WALK", "TRANSIT"]) {
    assert.match(personnelSchema, new RegExp(`"${vehicleType}"`, "u"));
  }

  for (const legacyVehicleType of [
    "car",
    "bicycle",
    "walking",
    "moped_or_scooter",
    "public_transport",
  ]) {
    assert.match(personnelSchema, new RegExp(`"${legacyVehicleType}"`, "u"));
  }

  assert.match(routeUtils, /case "bicycle":[\s\S]*?return "BICYCLE"/u);
  assert.match(routeUtils, /case "walking":[\s\S]*?return "WALK"/u);
  assert.match(routeUtils, /case "moped_or_scooter":[\s\S]*?return "DRIVE"/u);
  assert.match(routeUtils, /case "public_transport":[\s\S]*?return "TRANSIT"/u);
  assert.doesNotMatch(routeUtils, /TWO_WHEELER/u);
});

test("Sprint 0 baseline: planning map feature flag and sidebar entry exist", () => {
  const featureFlag = read("artifacts/backoffice/src/lib/planning/day-map-feature.ts");
  const sidebar = read("artifacts/backoffice/src/components/layout/Sidebar.tsx");

  assert.match(featureFlag, /FIELDGRID_PLANNING_DAY_MAP_ENABLED/u);
  assert.match(featureFlag, /planning_day_map_enabled/u);
  assert.match(sidebar, /\/planning\?view=map/u);
  assert.match(sidebar, /label:\s*"Kaart"/u);
  assert.match(sidebar, /feature:\s*"planning-map"/u);
});

test("Sprint 0 baseline: integration plan tracks canon gaps and rollback", () => {
  const planPath = "docs/google-maps-platform-integration-plan.md";
  assert.equal(existsSync(new URL(`../${planPath}`, import.meta.url)), true);
  const plan = read(planPath);

  for (const expected of [
    "CARTO",
    "OpenStreetMap",
    "PDOK",
    "GOOGLE_ROUTES_API_KEY",
    "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY",
    "GOOGLE_MAPS_SERVER_API_KEY",
    "GOOGLE_MAPS_MAP_ID",
    "rollback",
    "geen functionele migratie",
  ]) {
    assert.match(plan, new RegExp(expected, "iu"));
  }
});
