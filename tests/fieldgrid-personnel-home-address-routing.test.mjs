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
  const backofficeAutocomplete = read("artifacts/backoffice/src/components/google-maps/AddressAutocomplete.tsx");
  const personnelAutocomplete = read("artifacts/personeel-pwa/src/components/google-maps/AddressAutocomplete.tsx");
  const backofficeForm = read("artifacts/backoffice/src/components/personnel/PersonnelForm.tsx");
  const objectForm = read("artifacts/backoffice/src/components/objects/ObjectForm.tsx");
  const personnelForm = read("artifacts/personeel-pwa/src/app/(app)/profiel/ProfileForm.tsx");

  assert.match(backofficeRoute, /hasPermission\("personnel",\s*"read"\)/);
  assert.match(backofficeRoute, /hasPermission\("objects",\s*"read"\)/);
  assert.match(backofficeRoute, /fetchGooglePlacesAutocomplete/);
  assert.match(personnelRoute, /getMyPersonnel\(\)/);
  assert.match(personnelRoute, /fetchGooglePlacesAutocomplete/);
  assert.match(backofficeAutocomplete, /\/api\/google-maps\/places/);
  assert.match(backofficeAutocomplete, /z-\[80\]/);
  assert.match(personnelAutocomplete, /\/personeel\/api\/google-maps\/places/);
  assert.match(backofficeForm, /AddressAutocomplete/);
  assert.match(objectForm, /AddressAutocomplete/);
  assert.match(objectForm, /Objectadres/);
  assert.match(personnelForm, /AddressAutocomplete/);
  assert.match(personnelForm, /Dit adres wordt gebruikt als vertrekpunt voor je eerste werkbon/);
});

test("personnel address updates geocode and refresh planning route contexts", () => {
  const backofficeActions = read("artifacts/backoffice/src/app/actions/personnel.ts");
  const personnelActions = read("artifacts/personeel-pwa/src/actions/personnel.ts");
  const routeRefresh = read("artifacts/backoffice/src/lib/planning/route-refresh.ts");
  const realtime = read("lib/db/src/planning-realtime.ts");

  assert.match(backofficeActions, /buildPersonnelAddressGeocodePatch/);
  assert.match(backofficeActions, /safeRefreshPlanningRoutesForPersonnel/);
  assert.match(backofficeActions, /fromDate:\s*"0001-01-01"/);
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

test("planning map uses personnel home address only after explicit route request", () => {
  const planningActions = read("artifacts/backoffice/src/app/actions/planning.ts");
  const actionStart = planningActions.indexOf("export async function getPlanningDayMapData");
  const actionEnd = planningActions.indexOf("\n/**", actionStart);
  const mapDataAction = planningActions.slice(
    actionStart,
    actionEnd === -1 ? undefined : actionEnd,
  );

  assert.match(planningActions, /export async function calculatePlanningMapRoute/);
  assert.match(planningActions, /ensurePlanningDayRouteContextsFresh/);
  assert.match(planningActions, /addressGeocodedAt:\s+personnelTable\.addressGeocodedAt/);
  assert.match(planningActions, /!row\.routeContextId\s*\|\|\s*addressIsNewer/);
  assert.match(planningActions, /recalculatePlanningRouteContexts\(\{/);
  assert.match(planningActions, /personnelLat:\s+personnelTable\.addressLatitude/);
  assert.match(planningActions, /personnelLng:\s+personnelTable\.addressLongitude/);
  assert.match(planningActions, /const contextOrigin = coordinateFromValues/);
  assert.match(planningActions, /const personnelOrigin = coordinateFromValues/);
  assert.match(planningActions, /const origin = contextOrigin \?\? personnelOrigin/);
  assert.match(planningActions, /getRouteWithCache\(\{/);
  assert.match(mapDataAction, /Routecontext wordt hier bewust niet meer automatisch berekend/);
  assert.doesNotMatch(mapDataAction, /await ensurePlanningDayRouteContextsFresh/);
});

test("object address updates geocode automatically and refresh route contexts", () => {
  const objectActions = read("artifacts/backoffice/src/app/actions/objects.ts");
  const routeRefresh = read("artifacts/backoffice/src/lib/planning/route-refresh.ts");
  const realtime = read("lib/db/src/planning-realtime.ts");
  const etaEngine = read("artifacts/backoffice/src/lib/planning/eta-engine.ts");
  const mapData = read("artifacts/backoffice/src/lib/planning/map-data.ts");

  assert.match(objectActions, /buildObjectAddressGeocodePatch/);
  assert.match(objectActions, /await buildObjectAddressGeocodePatch\(payload\)/);
  assert.match(objectActions, /geocodingStatus:\s*"geocoded"/);
  assert.match(objectActions, /safeRefreshPlanningRoutesForObject/);
  assert.match(objectActions, /reason:\s*"object_location_updated"/);
  assert.match(routeRefresh, /refreshPlanningRoutesForObject/);
  assert.match(realtime, /object_location_updated/);
  assert.doesNotMatch(etaEngine, /kind:\s*"customer"/);
  assert.match(mapData, /Deze werkbon heeft geen bruikbare objectcoordinaten/);
});
