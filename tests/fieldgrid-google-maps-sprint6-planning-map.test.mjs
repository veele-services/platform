import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Sprint 6 planning page passes safe Google Maps bootstrap config into the map view", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/planning/page.tsx");
  const config = read("artifacts/backoffice/src/lib/google-maps/config.ts");

  assert.match(page, /getGoogleMapsClientBootstrapConfig/u);
  assert.match(page, /googleMapsConfig=\{googleMapsConfig\}/u);
  assert.match(config, /browserApiKey: config\.browserApiKey/u);
  assert.match(config, /mapId: config\.mapId/u);
  assert.doesNotMatch(page, /GOOGLE_MAPS_SERVER_API_KEY/u);
});

test("Sprint 6 planning map uses the shared lazy Google map and no active CARTO/OSM tiles", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");
  const canvas = read("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx");

  assert.match(mapView, /GoogleMapCanvas/u);
  assert.match(mapView, /markerStatusForAssignment/u);
  assert.match(mapView, /GOOGLE_MAPS_MARKER_STATUS/u);
  assert.match(canvas, /loadGoogleMapsJavaScriptApi/u);
  assert.match(canvas, /IntersectionObserver/u);
  assert.match(canvas, /AdvancedMarkerElement/u);
  assert.match(canvas, /PinElement/u);
  assert.match(canvas, /fitBounds/u);
  assert.match(canvas, /data-fieldgrid-google-map="planning"/u);
  assert.doesNotMatch(mapView, /basemaps\.cartocdn\.com|tile\.openstreetmap\.org|OpenStreetMap|CARTO/u);
  assert.doesNotMatch(canvas, /basemaps\.cartocdn\.com|tile\.openstreetmap\.org|OpenStreetMap|CARTO/u);
});

test("Sprint 6 marker data exposes status, labels, aria and detail panel route actions", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");
  const markerStatus = read("artifacts/backoffice/src/lib/google-maps/marker-status.ts");
  const mapData = read("artifacts/backoffice/src/lib/planning/map-data.ts");

  for (const marker of [
    "code",
    "customerName",
    "objectName",
    "objectAddress",
    "scheduledStart",
    "assignedPersonnel",
    "routeContexts",
  ]) {
    assert.match(mapData, new RegExp(marker, "u"));
  }

  assert.match(markerStatus, /planned/u);
  assert.match(markerStatus, /assigned/u);
  assert.match(markerStatus, /started/u);
  assert.match(markerStatus, /completed/u);
  assert.match(mapView, /ariaLabel/u);
  assert.match(mapView, /Route bekijken/u);
  assert.match(mapView, /Werkbon openen/u);
  assert.match(mapView, /Gekoppeld personeel/u);
  assert.match(mapView, /Routecontext/u);
});

test("Sprint 6 keeps permission, no-data and missing-location states explicit", () => {
  const planningAction = read("artifacts/backoffice/src/app/actions/planning.ts");
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");
  const canvas = read("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx");

  assert.match(planningAction, /hasPermission\("planning", "read"\)/u);
  assert.match(planningAction, /createEmptyPlanningDayMapData\(date, \{ accessDenied: true \}\)/u);
  assert.match(planningAction, /requireCurrentTenantId/u);
  assert.match(planningAction, /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u);
  assert.match(planningAction, /eq\(personnelTable\.tenantId,\s*tenantId\)/u);
  assert.match(mapView, /U heeft geen planningrechten/u);
  assert.match(mapView, /missingLocationCount/u);
  assert.match(mapView, /Geen werkbonnen met bruikbare coordinaten/u);
  assert.match(canvas, /Google Maps is niet geconfigureerd/u);
  assert.match(canvas, /Google Maps kon niet laden/u);
});

test("Sprint 6 marker updates do not remount the map instance", () => {
  const canvas = read("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx");

  assert.match(canvas, /mapRef = useRef/u);
  assert.match(canvas, /markerRefs = useRef/u);
  assert.match(canvas, /polylineRefs = useRef/u);
  assert.match(canvas, /markerRefs\.current\.forEach/u);
  assert.match(canvas, /advancedMarker\.addListener\?\.\("click"/u);
  assert.match(canvas, /setRetryNonce/u);

  assert.match(canvas, /loadGoogleMapsJavaScriptApi[\s\S]*retryNonce,\s*\]\);/u);
  assert.match(canvas, /markerRefs\.current\.forEach[\s\S]*validMarkers\.forEach/u);
  assert.match(canvas, /polylineRefs\.current\.forEach[\s\S]*polylines[\s\S]*\.forEach/u);
});
