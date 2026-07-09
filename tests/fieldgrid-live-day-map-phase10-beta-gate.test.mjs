import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("phase 10 keeps live day map beta-gated and preserves planning views", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/planning/page.tsx");
  const featureFlag = read("artifacts/backoffice/src/lib/planning/day-map-feature.ts");
  const layout = read("artifacts/backoffice/src/app/(dashboard)/layout.tsx");
  const sidebar = read("artifacts/backoffice/src/components/layout/Sidebar.tsx");

  assert.match(featureFlag, /FIELDGRID_PLANNING_DAY_MAP_ENABLED/);
  assert.match(page, /isPlanningDayMapEnabled/);
  assert.match(page, /mapEnabled\s*&&\s*view\s*===\s*"map"/);
  assert.match(layout, /isPlanningDayMapEnabled/);
  assert.match(layout, /planningMapEnabled=\{planningMapEnabled\}/);
  assert.match(sidebar, /\/planning\?view=map/);
  assert.match(sidebar, /label: "Kaart"/);
  assert.match(sidebar, /feature: "planning-map"/);
  assert.match(sidebar, /useSearchParams/);
  assert.match(sidebar, /href === "\/planning" && searchParams\.get\("view"\) === "map"/);
  assert.match(page, /PlanningBoardView/);
  assert.match(page, /PlanningDayView/);
  assert.match(page, /PlanningMonthView/);
  assert.match(page, /PlanningMapView/);
  assert.match(page, /\/planning\?date=/);
  assert.match(page, /\/planning\?day=/);
  assert.match(page, /\/planning\?month=/);
  assert.match(page, /view=map&date=/);
});

test("phase 10 map data server action is tenant and permission scoped", () => {
  const planning = read("artifacts/backoffice/src/app/actions/planning.ts");

  assert.match(planning, /hasPermission\("planning", "read"\)/);
  assert.match(planning, /createEmptyPlanningDayMapData\(date, \{ accessDenied: true \}\)/);
  assert.match(planning, /requireCurrentTenantId/);
  assert.match(planning, /eq\(assignmentsTable\.tenantId,\s*tenantId\)/);
  assert.match(planning, /eq\(personnelTable\.tenantId,\s*tenantId\)/);
  assert.match(planning, /eq\(customersTable\.tenantId,\s*tenantId\)/);
  assert.match(planning, /eq\(objectsTable\.tenantId,\s*tenantId\)/);
  assert.match(planning, /eq\(assignmentRouteContextsTable\.tenantId,\s*tenantId\)/);
});

test("phase 10 route provider has deterministic fallback without external API keys", () => {
  const routeProvider = read("artifacts/backoffice/src/lib/planning/routes/route-provider.ts");
  const googleProvider = read("artifacts/backoffice/src/lib/planning/routes/google-routes-provider.ts");
  const mockProvider = read("artifacts/backoffice/src/lib/planning/routes/mock-route-provider.ts");

  assert.match(routeProvider, /FIELDGRID_ROUTE_PROVIDER/);
  assert.match(routeProvider, /createMockRouteProvider/);
  assert.match(googleProvider, /GOOGLE_ROUTES_API_KEY is niet geconfigureerd\./);
  assert.match(
    googleProvider,
    /return routeFailure\([\s\S]*?GOOGLE_ROUTES_API_KEY is niet geconfigureerd\.[\s\S]*?false/s,
  );
  assert.match(mockProvider, /createMockRouteProvider/);
  assert.match(mockProvider, /durationSeconds/);
});

test("phase 10 map UI avoids fixed-width overflow and lazy-loads MapLibre", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");

  assert.match(mapView, /minmax\(0,1fr\)/);
  assert.match(mapView, /overflow-hidden/);
  assert.match(mapView, /w-full overflow-y-auto sm:max-w-xl/);
  assert.match(mapView, /max-h-\[390px\]/);
  assert.match(mapView, /min-h-\[420px\]/);
  assert.match(mapView, /await import\("maplibre-gl"\)/);
  assert.doesNotMatch(mapView, /min-w-\[/);
});

test("phase 10 exposes package gates and beta documentation", () => {
  const pkg = JSON.parse(read("package.json"));
  const docs = read("docs/fieldgrid-live-day-map-phase10-beta-gate.md");

  assert.equal(
    pkg.scripts["fieldgrid:live-day-map-phase10"],
    "node scripts/fieldgrid-live-day-map-phase10-beta-gate.mjs && node --test tests/fieldgrid-live-day-map-phase10-beta-gate.test.mjs tests/fieldgrid-live-day-map-phase10-performance.test.mjs",
  );
  assert.equal(
    pkg.scripts["fieldgrid:live-day-map-phase10:check"],
    "node scripts/fieldgrid-live-day-map-phase10-beta-gate.mjs --check && node --test tests/fieldgrid-live-day-map-phase10-beta-gate.test.mjs tests/fieldgrid-live-day-map-phase10-performance.test.mjs",
  );
  assert.equal(
    pkg.scripts["fieldgrid:live-day-map-phase10:strict"],
    "node scripts/fieldgrid-live-day-map-phase10-beta-gate.mjs --strict-evidence && node --test tests/fieldgrid-live-day-map-phase10-beta-gate.test.mjs tests/fieldgrid-live-day-map-phase10-performance.test.mjs",
  );
  assert.match(docs, /Release notes/);
  assert.match(docs, /Beheerinstructies/);
  assert.match(docs, /Rollback/);
});
