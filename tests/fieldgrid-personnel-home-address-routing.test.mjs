import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("personnel home address geocoding is persisted and route-aware", () => {
  const schema = read("lib/db/src/schema/personnel.ts");
  const migration = read("lib/db/migrations/20260709210000_personnel_home_address_geocoding.sql");
  const dbExport = read("lib/db/src/index.ts");
  const dbPackage = read("lib/db/package.json");

  assert.match(schema, /addressLatitude:\s+numeric\("address_latitude"/);
  assert.match(schema, /addressLongitude:\s+numeric\("address_longitude"/);
  assert.match(schema, /addressGeocodingStatus:\s+varchar\("address_geocoding_status"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS address_latitude/);
  assert.match(migration, /personnel_home_location_idx/);
  assert.match(dbExport, /address-geocoding/);
  assert.match(dbPackage, /"\.\/address-geocoding"/);
});

test("backoffice and personnel PWA offer secured address autocomplete", () => {
  const backofficeRoute = read("artifacts/backoffice/src/app/api/address-suggestions/route.ts");
  const personnelRoute = read("artifacts/personeel-pwa/src/app/api/address-suggestions/route.ts");
  const backofficeForm = read("artifacts/backoffice/src/components/personnel/PersonnelForm.tsx");
  const personnelForm = read("artifacts/personeel-pwa/src/app/(app)/profiel/ProfileForm.tsx");

  assert.match(backofficeRoute, /hasPermission\("personnel",\s*"read"\)/);
  assert.match(backofficeRoute, /suggestDutchAddresses/);
  assert.match(personnelRoute, /getMyPersonnel\(\)/);
  assert.match(personnelRoute, /suggestDutchAddresses/);
  assert.match(backofficeForm, /\/api\/address-suggestions\?q=/);
  assert.match(personnelForm, /\/personeel\/api\/address-suggestions\?q=/);
  assert.match(personnelForm, /Dit adres wordt gebruikt als vertrekpunt voor je eerste werkbon/);
});

test("personnel address updates geocode and refresh planning route contexts", () => {
  const backofficeActions = read("artifacts/backoffice/src/app/actions/personnel.ts");
  const personnelActions = read("artifacts/personeel-pwa/src/actions/personnel.ts");
  const routeRefresh = read("artifacts/backoffice/src/lib/planning/route-refresh.ts");
  const realtime = read("lib/db/src/planning-realtime.ts");

  assert.match(backofficeActions, /buildPersonnelAddressGeocodePatch/);
  assert.match(backofficeActions, /safeRefreshPlanningRoutesForPersonnel/);
  assert.match(personnelActions, /buildAddressGeocodePatch/);
  assert.match(personnelActions, /addressGeocodingStatus:\s*"geocoded"/);
  assert.match(routeRefresh, /refreshPlanningRoutesForPersonnel/);
  assert.match(realtime, /personnel_home_address_updated/);
});

test("first planning stop uses personnel home address as route origin", () => {
  const etaEngine = read("artifacts/backoffice/src/lib/planning/eta-engine.ts");

  assert.match(etaEngine, /personnelHomeLocation/);
  assert.match(etaEngine, /personnelAddressLat:\s+personnelTable\.addressLatitude/);
  assert.match(etaEngine, /origin\s*=\s*previous\?\.location\?\.coordinate\s*\?\?\s*assignment\.personnelHomeLocation\?\.coordinate/);
  assert.match(etaEngine, /originKind[\s\S]*"personnel_home"/);
  assert.match(etaEngine, /dateTimeForTime\(assignment\.scheduledDate,\s*input\.settings\.planningWorkdayStart\)/);
});

test("planning map refreshes missing or stale route contexts before rendering", () => {
  const planningActions = read("artifacts/backoffice/src/app/actions/planning.ts");

  assert.match(planningActions, /ensurePlanningDayRouteContextsFresh/);
  assert.match(planningActions, /addressGeocodedAt:\s+personnelTable\.addressGeocodedAt/);
  assert.match(planningActions, /!row\.routeContextId\s*\|\|\s*addressIsNewer/);
  assert.match(planningActions, /recalculatePlanningRouteContexts\(\{/);
  assert.match(planningActions, /await ensurePlanningDayRouteContextsFresh\(\{/);
});
