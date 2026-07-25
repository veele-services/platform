import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("phase 7 planning map tab is guarded by the feature flag", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/planning/page.tsx");
  const flag = read("artifacts/backoffice/src/lib/planning/day-map-feature.ts");

  assert.match(flag, /PLANNING_DAY_MAP_ENABLED_BY_DEFAULT = false/);
  assert.match(page, /const mapEnabled = isPlanningDayMapEnabled\(\)/);
  assert.match(page, /if \(mapEnabled && view === "map"\)/);
  assert.match(page, /getPlanningDayMapData/);
  assert.match(page, /PlanningMapView/);
  assert.doesNotMatch(page, /Planning workbench/);
  assert.doesNotMatch(page, /Tenant planning/);
  assert.doesNotMatch(page, /TenantConflictStrip/);
});

test("phase 7 map component is now backed by the shared lazy Google map", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");
  const canvas = read("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx");

  assert.match(mapView, /"use client";/);
  assert.match(mapView, /GoogleMapCanvas/);
  assert.match(canvas, /IntersectionObserver/);
  assert.match(canvas, /loadGoogleMapsJavaScriptApi/);
  assert.match(canvas, /AdvancedMarkerElement/);
  assert.doesNotMatch(mapView, /basemaps\.cartocdn\.com\/light_all/);
  assert.doesNotMatch(mapView, /tile\.openstreetmap\.org/);
  assert.doesNotMatch(mapView, /maplibre-gl/);
  assert.doesNotMatch(mapView, /NEXT_PUBLIC/);
  assert.doesNotMatch(mapView, /MAPBOX|GOOGLE_ROUTES_API_KEY|GOOGLE_MAPS_SERVER_API_KEY/);
});

test("phase 7 map UI exposes marker, route, warning and detail surfaces", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");

  assert.match(mapView, /markerTone/);
  assert.match(mapView, /GOOGLE_MAPS_MARKER_STATUS/);
  assert.match(mapView, /markerStatusForAssignment/);
  assert.match(mapView, /GoogleMapCanvas/);
  assert.match(mapView, /dateLabel/);
  assert.match(mapView, /min-h-\[620px\]/);
  assert.match(mapView, /Adresgegevens/);
  assert.match(mapView, /Opdrachtinformatie/);
  assert.match(mapView, />\s*Routecontext\s*</);
  assert.match(mapView, /OverlayChip/);
  assert.match(mapView, /werkbonnen/);
  assert.match(mapView, /waarschuwingen/);
  assert.match(mapView, /routes/);
  assert.match(mapView, /SheetContent/);
  assert.match(mapView, /Geen werkbonnen met bruikbare coordinaten/);
  assert.match(mapView, /Route bekijken/);
  assert.match(mapView, /Werkbon openen/);
});

test("phase 7 avoids MapLibre dependency for the map surface", () => {
  const pkg = JSON.parse(read("artifacts/backoffice/package.json"));
  const lock = read("pnpm-lock.yaml");

  assert.equal(pkg.dependencies["maplibre-gl"], undefined);
  assert.doesNotMatch(lock, /maplibre-gl@/);
});
