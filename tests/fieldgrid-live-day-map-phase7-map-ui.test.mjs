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
  assert.match(page, /view=map&date=/);
  assert.match(page, />\s*Kaart\s*</);
});

test("phase 7 map component lazy-loads MapLibre client-side only", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");

  // lazy import test
  assert.match(mapView, /"use client";/);
  assert.match(mapView, /await import\("maplibre-gl"\)/);
  assert.doesNotMatch(mapView, /from "maplibre-gl"/);
  assert.doesNotMatch(mapView, /NEXT_PUBLIC/);
  assert.doesNotMatch(mapView, /MAPBOX|GOOGLE/);
});

test("phase 7 map UI exposes marker, route, warning and detail surfaces", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");

  assert.match(mapView, /markerTone/);
  assert.match(mapView, /STATUS_COLORS/);
  assert.match(mapView, /planning-waypoint-marker/);
  assert.match(mapView, /<svg viewBox="0 0 24 24"/);
  assert.match(mapView, /markerPopupHtml/);
  assert.match(mapView, /mouseenter/);
  assert.match(mapView, /Adresgegevens/);
  assert.match(mapView, /Opdrachtinformatie/);
  assert.doesNotMatch(mapView, />Routecontext</);
  assert.match(mapView, /Routepaneel/);
  assert.match(mapView, /Warnings/);
  assert.match(mapView, /SheetContent/);
  assert.match(mapView, /Geen werkbonnen met bruikbare coordinaten/);
  assert.match(mapView, /Kaart kon niet laden/);
  assert.match(mapView, /Werkbon openen/);
});

test("phase 7 MapLibre dependency is scoped to backoffice package and lockfile", () => {
  const pkg = JSON.parse(read("artifacts/backoffice/package.json"));
  const lock = read("pnpm-lock.yaml");

  assert.equal(pkg.dependencies["maplibre-gl"], "^5.24.0");
  assert.match(lock, /maplibre-gl@5\.24\.0/);
});
