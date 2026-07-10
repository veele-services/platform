import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function extractFunction(source, functionName) {
  const start = source.indexOf(`export async function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} must exist`);
  const nextExport = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

test("Sprint 8 map data read does not trigger route provider calls", () => {
  const planningActions = read("artifacts/backoffice/src/app/actions/planning.ts");
  const mapDataAction = extractFunction(planningActions, "getPlanningDayMapData");

  assert.doesNotMatch(mapDataAction, /getRouteWithCache/u);
  assert.doesNotMatch(mapDataAction, /recalculatePlanningRouteContexts/u);
  assert.doesNotMatch(mapDataAction, /ensurePlanningDayRouteContextsFresh\(/u);
  assert.match(mapDataAction, /Routecontext wordt hier bewust niet meer automatisch berekend/u);
});

test("Sprint 8 explicit route action is tenant-scoped and permission-checked", () => {
  const planningActions = read("artifacts/backoffice/src/app/actions/planning.ts");
  const routeAction = extractFunction(planningActions, "calculatePlanningMapRoute");

  assert.match(routeAction, /hasPermission\("planning", "read"\)/u);
  assert.match(routeAction, /requireCurrentTenantId\(\)/u);
  assert.match(routeAction, /getCurrentBackofficeUser\(\)/u);
  assert.match(routeAction, /eq\(assignmentPersonnelTable\.status, "assigned"\)/u);
  assert.match(routeAction, /eq\(assignmentsTable\.tenantId, tenantId\)/u);
  assert.match(routeAction, /eq\(personnelTable\.tenantId, tenantId\)/u);
  assert.match(routeAction, /eq\(objectsTable\.tenantId, tenantId\)/u);
  assert.match(routeAction, /eq\(customersTable\.tenantId, tenantId\)/u);
  assert.match(routeAction, /getRouteWithCache/u);
  assert.match(routeAction, /validateRouteCoordinates/u);
});

test("Sprint 8 route action supports explicit modes without transit auto fallback", () => {
  const planningActions = read("artifacts/backoffice/src/app/actions/planning.ts");
  const routeAction = extractFunction(planningActions, "calculatePlanningMapRoute");

  for (const mode of ["DRIVE", "BICYCLE", "WALK", "TRANSIT"]) {
    assert.match(planningActions, new RegExp(`"${mode}"`, "u"));
  }
  assert.match(routeAction, /providerModeForVehicle\(travelMode\)/u);
  assert.match(routeAction, /trafficDelaySeconds/u);
  assert.match(routeAction, /staticDurationSeconds/u);
  assert.match(routeAction, /encodedPolyline/u);
  assert.match(routeAction, /code: providerMode === "TRANSIT" \? "transit_no_result" : "provider_error"/u);
  assert.match(routeAction, /Geen OV-route gevonden/u);
  assert.doesNotMatch(routeAction, /TRANSIT[\s\S]{0,160}DRIVE/u);
});

test("Sprint 8 route pane calls server action only from explicit button handler", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");

  const handlerStart = mapView.indexOf("function handleCalculateRoute()");
  assert.notEqual(handlerStart, -1, "explicit route handler must exist");
  const handlerEnd = mapView.indexOf("\n  function", handlerStart + 1);
  const handlerBody = mapView.slice(handlerStart, handlerEnd);
  assert.match(handlerBody, /calculatePlanningMapRoute\(/u);
  assert.match(handlerBody, /assignmentId/u);
  assert.match(handlerBody, /personnelId/u);
  assert.match(handlerBody, /travelMode/u);

  const firstCallIndex = mapView.indexOf("calculatePlanningMapRoute(");
  assert.ok(
    firstCallIndex >= handlerStart && firstCallIndex < handlerEnd,
    "route calculation must be isolated to handleCalculateRoute",
  );
  assert.match(mapView, /onClick=\{handleCalculateRoute\}/u);
  assert.doesNotMatch(mapView, /onMouseEnter=\{handleCalculateRoute\}/u);
  assert.doesNotMatch(mapView, /onMarkerSelect=\{handleCalculateRoute\}/u);
});

test("Sprint 8 route pane has personnel, override, warnings, retry and external link", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");

  assert.match(mapView, /Route bekijken/u);
  assert.match(mapView, /Medewerker/u);
  assert.match(mapView, /Vervoersmiddel/u);
  assert.match(mapView, /routePersonnelId/u);
  assert.match(mapView, /routeTravelMode/u);
  assert.match(mapView, /wijzigt het medewerkerprofiel niet/u);
  assert.match(mapView, /Fiets- en wandelroutes kunnen onvolledige paden bevatten/u);
  assert.match(mapView, /Zonder verkeer/u);
  assert.match(mapView, /Vertraging/u);
  assert.match(mapView, /Geen OV-route gevonden/u);
  assert.match(mapView, /Opnieuw proberen/u);
  assert.match(mapView, /Open in Google Maps/u);
});

test("Sprint 8 explicit route polyline renders without replacing scheduled route lines", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");
  const canvas = read("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx");

  assert.match(mapView, /decodeEncodedPolyline/u);
  assert.match(mapView, /activeRoutePolyline/u);
  assert.match(mapView, /explicit-route-/u);
  assert.match(mapView, /\.\.\.scheduledRouteLines, activeRoutePolyline/u);
  assert.match(canvas, /validPolylinePositions/u);
  assert.match(canvas, /boundsPositions/u);
  assert.match(canvas, /\.\.\.validPolylinePositions/u);
});
