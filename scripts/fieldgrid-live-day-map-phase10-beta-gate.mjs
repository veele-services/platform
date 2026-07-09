#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkMode = process.argv.includes("--check");
const strictEvidence = process.argv.includes("--strict-evidence");

const files = {
  planningPage: "artifacts/backoffice/src/app/(dashboard)/planning/page.tsx",
  dashboardLayout: "artifacts/backoffice/src/app/(dashboard)/layout.tsx",
  sidebar: "artifacts/backoffice/src/components/layout/Sidebar.tsx",
  planningActions: "artifacts/backoffice/src/app/actions/planning.ts",
  mapView: "artifacts/backoffice/src/components/assignments/PlanningMapView.tsx",
  mapData: "artifacts/backoffice/src/lib/planning/map-data.ts",
  routeProvider: "artifacts/backoffice/src/lib/planning/routes/route-provider.ts",
  googleProvider: "artifacts/backoffice/src/lib/planning/routes/google-routes-provider.ts",
  mockProvider: "artifacts/backoffice/src/lib/planning/routes/mock-route-provider.ts",
  routeUtils: "artifacts/backoffice/src/lib/planning/routes/route-utils.ts",
  featureFlag: "artifacts/backoffice/src/lib/planning/day-map-feature.ts",
  phase5Gate: "scripts/fieldgrid-live-day-map-phase5-eta-engine.mjs",
  phase6Gate: "scripts/fieldgrid-live-day-map-phase6-map-data.mjs",
  phase7Gate: "scripts/fieldgrid-live-day-map-phase7-map-ui.mjs",
  phase8Gate: "scripts/fieldgrid-live-day-map-phase8-time-suggestions.mjs",
  phase9Gate: "scripts/fieldgrid-live-day-map-phase9-realtime-status.mjs",
  phase10Doc: "docs/fieldgrid-live-day-map-phase10-beta-gate.md",
  phase10Test: "tests/fieldgrid-live-day-map-phase10-beta-gate.test.mjs",
  phase10PerformanceTest: "tests/fieldgrid-live-day-map-phase10-performance.test.mjs",
  packageJson: "package.json",
};

const evidenceDir = path.join(root, "outputs/live-day-map-phase10-beta-gate");
const requiredEvidenceFiles = [
  "planning-map-desktop.png",
  "planning-map-tablet.png",
  "planning-map-mobile.png",
  "planning-board-desktop.png",
  "planning-day-tablet.png",
  "planning-month-mobile.png",
  "phase10-playwright-report.json",
];

const failures = [];

function read(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute, "utf8");
}

function requireFile(key) {
  const contents = read(files[key]);
  if (!contents) failures.push(`${files[key]} ontbreekt.`);
  return contents ?? "";
}

function mustContain(key, needle, label = needle) {
  const contents = requireFile(key);
  if (!contents.includes(needle)) failures.push(`${files[key]} mist: ${label}`);
}

function mustNotContain(key, needle, label = needle) {
  const contents = requireFile(key);
  if (contents.includes(needle)) failures.push(`${files[key]} bevat verboden tekst: ${label}`);
}

function mustMatch(key, pattern, label = String(pattern)) {
  const contents = requireFile(key);
  if (!pattern.test(contents)) failures.push(`${files[key]} mist patroon: ${label}`);
}

function requireEvidence() {
  for (const fileName of requiredEvidenceFiles) {
    const absolute = path.join(evidenceDir, fileName);
    if (!fs.existsSync(absolute)) {
      failures.push(`Strict evidence mist ${path.relative(root, absolute)}.`);
      continue;
    }
    if (fs.statSync(absolute).size === 0) {
      failures.push(`Strict evidence bestand is leeg: ${path.relative(root, absolute)}.`);
    }
  }
}

mustContain("phase5Gate", "ETA", "phase 5 ETA gate");
mustContain("phase6Gate", "map-data", "phase 6 map-data gate");
mustContain("phase7Gate", "PlanningMapView", "phase 7 map UI gate");
mustContain("phase8Gate", "applyRouteTimeSuggestion", "phase 8 suggestion gate");
mustContain("phase9Gate", "planning_refresh", "phase 9 realtime gate");

mustContain("featureFlag", "FIELDGRID_PLANNING_DAY_MAP_ENABLED", "explicit beta feature flag");
mustContain("featureFlag", "betaEnvironmentValues", "staging/preview beta fallback");
mustContain("featureFlag", "APP_ENV", "staging app env fallback");
mustContain("featureFlag", "VERCEL_ENV", "preview env fallback");
mustContain("planningPage", "isPlanningDayMapEnabled", "planning map gated by feature flag");
mustMatch("planningPage", /mapEnabled\s*&&\s*view\s*===\s*"map"/, "map route is flag gated");
mustContain("dashboardLayout", "isPlanningDayMapEnabled", "sidebar receives map feature flag");
mustContain("dashboardLayout", "planningMapEnabled={planningMapEnabled}", "sidebar map flag prop");
mustContain("sidebar", "/planning?view=map", "planning map sidebar navigation");
mustContain("sidebar", "label: \"Kaart\"", "planning map sidebar label");
mustContain("sidebar", "feature: \"planning-map\"", "planning map menu feature flag");
mustContain("sidebar", "useSearchParams", "query-aware active state");
mustContain("sidebar", "href === \"/planning\" && searchParams.get(\"view\") === \"map\"", "planning item inactive when map view active");

mustContain("planningPage", "PlanningBoardView", "board planning view");
mustContain("planningPage", "PlanningDayView", "day planning view");
mustContain("planningPage", "PlanningMonthView", "month planning view");
mustContain("planningPage", "PlanningMapView", "map planning view");
mustNotContain("planningPage", "Planning workbench", "duplicated planning page title");
mustNotContain("planningPage", "Tenant planning", "duplicated planning page eyebrow");

mustContain("planningActions", "hasPermission(\"planning\", \"read\")", "planning read permission check");
mustContain("planningActions", "createEmptyPlanningDayMapData(date, { accessDenied: true })", "access denied empty result");
mustContain("planningActions", "requireCurrentTenantId", "tenant context requirement");
mustMatch("planningActions", /eq\(assignmentsTable\.tenantId,\s*tenantId\)/, "assignments are tenant scoped");
mustMatch("planningActions", /eq\(personnelTable\.tenantId,\s*tenantId\)/, "personnel joins are tenant scoped");
mustMatch("planningActions", /eq\(customersTable\.tenantId,\s*tenantId\)/, "customer joins are tenant scoped");
mustMatch("planningActions", /eq\(objectsTable\.tenantId,\s*tenantId\)/, "object joins are tenant scoped");
mustMatch("planningActions", /eq\(assignmentRouteContextsTable\.tenantId,\s*tenantId\)/, "route contexts are tenant scoped");

mustContain("routeProvider", "FIELDGRID_ROUTE_PROVIDER", "route provider env switch");
mustContain("routeProvider", "mock", "mock provider fallback option");
mustMatch("routeProvider", /GOOGLE_ROUTES_API_KEY[\s\S]*\?\s*"google"\s*:\s*"mock"/, "default mock provider without Google key");
mustContain("googleProvider", "GOOGLE_ROUTES_API_KEY is niet geconfigureerd.", "safe no-api-key failure");
mustMatch(
  "googleProvider",
  /return routeFailure\([\s\S]*?GOOGLE_ROUTES_API_KEY is niet geconfigureerd\.[\s\S]*?false/s,
  "missing Google key is non-retryable and does not call network",
);
mustContain("mockProvider", "createMockRouteProvider", "mock provider for CI/beta fallback");
mustContain("routeUtils", "validateRouteCoordinates", "coordinate validation before provider call");

mustContain("mapView", "OverlayChip", "compact map overlays");
mustContain("mapView", "overflow-hidden", "map shell clips map canvas");
mustContain("mapView", "w-full overflow-y-auto sm:max-w-xl", "mobile-safe drawer width");
mustContain("mapView", "max-h-80", "bounded overlay lists");
mustContain("mapView", "min-h-[620px]", "stable map height");
mustContain("mapView", "await import(\"maplibre-gl\")", "lazy map dependency");
mustNotContain("mapView", "min-w-[", "no fixed minimum width causing mobile overflow");

mustContain("mapData", "new Map<string, PlanningDayMapMarker>()", "single-pass marker grouping");
mustContain("mapData", "new Map<string, PlanningDayMapPersonnelRoute>()", "single-pass route grouping");
mustContain("mapData", "rowMatchesFilters", "server-side filters before rendering");
mustContain("mapData", "visibleAssignmentIds", "route filtering follows visible markers");
mustContain("mapData", "warningsOnly", "warning-only filter support");

mustContain("phase10Doc", "Fase 10", "phase 10 documentation");
mustContain("phase10Doc", "Release notes", "release notes");
mustContain("phase10Doc", "Beheerinstructies", "admin instructions");
mustContain("phase10Doc", "FIELDGRID_PLANNING_DAY_MAP_ENABLED", "feature flag instructions");
mustContain("phase10Doc", "APP_ENV=staging", "staging fallback documentation");
mustContain("phase10Doc", "Kaart", "map menu documentation");
mustContain("phase10Doc", "Rollback", "rollback instructions");
mustContain("phase10Doc", "50 opdrachten", "performance target");
mustContain("phase10Doc", "20 personeelsleden", "performance target");
mustContain("phase10Doc", "cross-tenant", "tenant isolation wording");

mustContain("phase10Test", "phase 10", "phase 10 regression test");
mustContain("phase10PerformanceTest", "50", "50 assignments performance fixture");
mustContain("phase10PerformanceTest", "20", "20 personnel performance fixture");
mustContain("packageJson", "fieldgrid:live-day-map-phase10", "package phase 10 script");
mustContain("packageJson", "fieldgrid:live-day-map-phase10:check", "package phase 10 check script");
mustContain("packageJson", "fieldgrid:live-day-map-phase10:strict", "package phase 10 strict script");

if (strictEvidence) requireEvidence();

if (failures.length > 0) {
  console.error("Fieldgrid live day map phase 10 beta gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mode = strictEvidence ? "strict evidence" : checkMode ? "check" : "local";
console.log(`Fieldgrid live day map phase 10 beta gate passed (${mode}).`);
