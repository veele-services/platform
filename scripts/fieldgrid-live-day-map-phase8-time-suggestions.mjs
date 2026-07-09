#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkMode = process.argv.includes("--check");

const files = {
  assignmentsActions: "artifacts/backoffice/src/app/actions/assignments.ts",
  planningPage: "artifacts/backoffice/src/app/(dashboard)/planning/page.tsx",
  mapView: "artifacts/backoffice/src/components/assignments/PlanningMapView.tsx",
  docs: "docs/fieldgrid-live-day-map-phase8-time-suggestions.md",
  test: "tests/fieldgrid-live-day-map-phase8-time-suggestions.test.mjs",
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

function mustMatch(key, pattern, label = String(pattern)) {
  const contents = requireFile(key);
  if (!pattern.test(contents)) {
    failures.push(`${files[key]} mist patroon: ${label}`);
  }
}

mustContain("assignmentsActions", "export async function applyRouteTimeSuggestion", "server action");
mustContain("assignmentsActions", 'requirePermission("planning", "write")', "planning write guard");
mustContain("assignmentsActions", "requireCurrentTenantId", "tenant guard");
mustContain("assignmentsActions", "assignmentRouteContextsTable", "route context lookup");
mustContain("assignmentsActions", "eq(assignmentRouteContextsTable.tenantId, tenantId)", "route context tenant filter");
mustContain("assignmentsActions", "eq(assignmentsTable.tenantId, tenantId)", "assignment tenant filter");
mustContain("assignmentsActions", "snapSuggestedStart", "suggested start guard");
mustContain("assignmentsActions", "reshiftAssignment(assignmentId, to.start, to.end)", "existing conflict validation reuse");
mustContain("assignmentsActions", "apply_route_time_suggestion", "audit action");
mustContain("assignmentsActions", "tenantId,", "tenant-aware audit metadata");
mustContain("assignmentsActions", "revalidatePath(`/assignments/${assignmentId}`)", "assignment revalidation");

mustContain("mapView", "applyRouteTimeSuggestion", "client calls server action");
mustContain("mapView", "AlertDialog", "confirm dialog primitive");
mustContain("mapView", "Tijdvoorstel toepassen?", "confirm dialog title");
mustContain("mapView", "Fieldgrid past routevoorstellen nooit automatisch toe", "no silent apply copy");
mustContain("mapView", "Voorstel toepassen", "drawer action button");
mustContain("mapView", "Huidig", "before time label");
mustContain("mapView", "Voorstel", "after time label");
mustContain("mapView", "routeContextCanApply", "context guard in UI");
mustContain("mapView", "canApplySuggestions", "planning write capability in UI");
mustContain("mapView", "Alleen planners met schrijfrecht", "read-only planner copy");
mustContain("mapView", "router.refresh()", "planning refresh after apply");
mustMatch("mapView", /event\.preventDefault\(\);\s*handleApplySuggestion\(\);/s, "dialog stays open on server error");
mustContain("planningPage", "canApplySuggestions={canWrite}", "planning page passes write capability");

mustContain("docs", "Fase 8", "phase-8 documentation");
mustContain("docs", "planning:write", "permission documentation");
mustContain("docs", "geen automatische bulk", "no bulk apply documentation");
mustContain("docs", "audit", "audit documentation");
mustContain("docs", "rollback", "rollback documentation");

mustContain("test", "applyRouteTimeSuggestion", "test covers action");
mustContain("test", 'requirePermission\\("planning", "write"\\)', "test covers permission");
mustContain("test", "apply_route_time_suggestion", "test covers audit");
mustContain("test", "Tijdvoorstel toepassen\\?", "test covers confirm dialog");

mustContain("rootPackageJson", "fieldgrid:live-day-map-phase8", "package script");
mustContain("rootPackageJson", "fieldgrid:live-day-map-phase8:check", "package check script");

if (failures.length > 0) {
  console.error("Fieldgrid live day map phase 8 time suggestion check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const message = "Fieldgrid live day map phase 8 time suggestion check passed.";
if (checkMode) {
  console.log(message);
} else {
  console.log(`${message} Run with --check in CI for strict mode.`);
}
