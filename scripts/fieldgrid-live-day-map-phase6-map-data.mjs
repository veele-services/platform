#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkMode = process.argv.includes("--check");

const files = {
  action: "artifacts/backoffice/src/app/actions/planning.ts",
  mapData: "artifacts/backoffice/src/lib/planning/map-data.ts",
  docs: "docs/fieldgrid-live-day-map-phase6-map-data.md",
  test: "tests/fieldgrid-live-day-map-phase6-map-data.test.mjs",
  packageJson: "package.json",
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
    failures.push(`${files[key]} bevat verboden fase-6 patroon: ${label}`);
  }
}

mustContain("action", "export async function getPlanningDayMapData", "server action");
mustContain("action", 'hasPermission("planning", "read")', "planning:read permissiecheck");
mustContain("action", "createEmptyPlanningDayMapData(date, { accessDenied: true })", "geen permissie response");
mustContain("action", "requireCurrentTenantId()", "tenant context");
mustContain("action", "eq(assignmentsTable.tenantId, tenantId)", "assignment tenantfilter");
mustContain("action", "eq(personnelTable.tenantId, tenantId)", "personnel tenantfilter");
mustContain("action", "eq(customersTable.tenantId, tenantId)", "customer tenantfilter");
mustContain("action", "eq(objectsTable.tenantId, tenantId)", "object tenantfilter");
mustContain("action", "eq(assignmentRouteContextsTable.tenantId, tenantId)", "routecontext tenantfilter");
mustContain("action", "buildPlanningDayMapDataFromRows", "normalisatie helper");

mustContain("mapData", 'import "server-only";', "server-only guard");
mustContain("mapData", "PlanningDayMapMarker", "marker contract");
mustContain("mapData", "PlanningDayMapPersonnelRoute", "personeelsroute contract");
mustContain("mapData", "PlanningDayMapWarning", "warning contract");
mustContain("mapData", "resolvePlanningMapCoordinate", "coordinaten normalisatie");
mustContain("mapData", 'source: "object"', "objectcoordinaten hebben prioriteit");
mustContain("mapData", 'source: "customer"', "klantcoordinaten fallback");
mustContain("mapData", "missing_location", "ontbrekende coordinaten warning");
mustContain("mapData", "warningsOnly", "warnings filter");
mustContain("mapData", "accessDenied", "permission-safe response");
mustNotContain("mapData", "providerMeta", "ruwe provider metadata");
mustNotContain("mapData", "NEXT_PUBLIC", "client-side provider/config");
mustNotContain("mapData", "maplibre", "kaart-UI in datafase");
mustNotContain("mapData", "PlanningMapView", "kaartcomponent in datafase");
mustNotContain("mapData", "db.update", "database-mutatie in read-only datafase");
mustNotContain("mapData", ".update(", "database-mutatie in read-only datafase");

mustNotContain("action", "applyRouteTimeSuggestion", "planner-mutatie hoort niet in map data action");
mustNotContain("action", "recalculatePlanningRouteContexts(", "route recalculatie hoort niet in map data action");

mustContain("test", "buildPlanningDayMapDataFromRows", "normalisatie unit test");
mustContain("test", "tenant boundary", "tenantisolatie contract test");
mustContain("test", "providerMeta", "provider metadata regressietest");
mustContain("test", "accessDenied", "geen-permissie regressietest");

mustContain("docs", "Fase 6", "fase-6 documenttitel");
mustContain("docs", "read-only", "read-only documentatie");
mustContain("docs", "planning:read", "permissie documentatie");
mustContain("docs", "tenant", "tenant-scope documentatie");
mustContain("docs", "provider metadata", "provider metadata documentatie");

mustContain("packageJson", "fieldgrid:live-day-map-phase6", "package script");
mustContain("packageJson", "fieldgrid:live-day-map-phase6:check", "package check script");

if (failures.length > 0) {
  console.error("Fieldgrid live day map phase 6 map data check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const message = "Fieldgrid live day map phase 6 map data check passed.";
if (checkMode) {
  console.log(message);
} else {
  console.log(`${message} Run with --check in CI for strict mode.`);
}
