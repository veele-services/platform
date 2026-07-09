#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkMode = process.argv.includes("--check");

const files = {
  packageJson: "artifacts/backoffice/package.json",
  lockfile: "pnpm-lock.yaml",
  planningPage: "artifacts/backoffice/src/app/(dashboard)/planning/page.tsx",
  mapView: "artifacts/backoffice/src/components/assignments/PlanningMapView.tsx",
  featureFlag: "artifacts/backoffice/src/lib/planning/day-map-feature.ts",
  docs: "docs/fieldgrid-live-day-map-phase7-map-ui.md",
  test: "tests/fieldgrid-live-day-map-phase7-map-ui.test.mjs",
  rootPackageJson: "package.json",
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
    failures.push(`${files[key]} bevat verboden fase-7 patroon: ${label}`);
  }
}

mustContain("packageJson", '"maplibre-gl"', "MapLibre dependency");
mustContain("lockfile", "maplibre-gl@5.24.0", "MapLibre lockfile entry");

mustContain("featureFlag", "PLANNING_DAY_MAP_FEATURE_KEY", "feature flag key");
mustContain("featureFlag", "PLANNING_DAY_MAP_ENABLED_BY_DEFAULT = false", "flag default uit");

mustContain("planningPage", "isPlanningDayMapEnabled", "planning page feature flag");
mustContain("planningPage", "mapEnabled && view === \"map\"", "map route achter flag");
mustContain("planningPage", "getPlanningDayMapData", "map data server action");
mustContain("planningPage", "PlanningMapView", "map client component");
mustNotContain("planningPage", "Planning workbench", "duplicated page title");
mustNotContain("planningPage", "Tenant planning", "duplicated planning eyebrow");
mustNotContain("planningPage", "TenantConflictStrip", "duplicated planning summary strip");

mustContain("mapView", '"use client";', "client component");
mustContain("mapView", 'await import("maplibre-gl")', "lazy MapLibre import");
mustContain("mapView", "PlanningMapView", "exported map component");
mustContain("mapView", "markerTone", "marker status colors");
mustContain("mapView", "createRouteFeatures", "route line features");
mustContain("mapView", "OverlayChip", "overlay chips");
mustContain("mapView", "werkbonnen", "work order overlay");
mustContain("mapView", "waarschuwingen", "warning overlay");
mustContain("mapView", "routes", "route overlay");
mustNotContain("mapView", "Routepaneel", "legacy route side panel");
mustContain("mapView", "SheetContent", "detail drawer");
mustContain("mapView", "Geen werkbonnen met bruikbare coordinaten", "missing coordinate state");
mustContain("mapView", "Kaart kon niet laden", "provider/map load warning state");
mustContain("mapView", "OpenStreetMap", "keyless raster map source");
mustNotContain("mapView", 'from "maplibre-gl"', "static MapLibre import");
mustNotContain("mapView", "NEXT_PUBLIC", "client-side provider/config");
mustNotContain("mapView", "GOOGLE", "provider key leakage");
mustNotContain("mapView", "MAPBOX", "provider key leakage");

mustContain("docs", "Fase 7", "fase-7 documenttitel");
mustContain("docs", "feature flag", "feature flag documentatie");
mustContain("docs", "MapLibre", "MapLibre documentatie");
mustContain("docs", "lazy", "lazy-loading documentatie");
mustContain("docs", "rollback", "rollback documentatie");

mustContain("test", "mapEnabled && view === \"map\"", "flag route test");
mustContain("test", 'await import\\("maplibre-gl"\\)', "lazy import test");
mustContain("test", "Geen werkbonnen met bruikbare coordinaten", "missing location UI test");

mustContain("rootPackageJson", "fieldgrid:live-day-map-phase7", "package script");
mustContain("rootPackageJson", "fieldgrid:live-day-map-phase7:check", "package check script");

if (failures.length > 0) {
  console.error("Fieldgrid live day map phase 7 map UI check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const message = "Fieldgrid live day map phase 7 map UI check passed.";
if (checkMode) {
  console.log(message);
} else {
  console.log(`${message} Run with --check in CI for strict mode.`);
}
