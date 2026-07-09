#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkMode = process.argv.includes("--check");

const files = {
  dbRealtime: "lib/db/src/planning-realtime.ts",
  dbPackage: "lib/db/package.json",
  dbIndex: "lib/db/src/index.ts",
  backofficeRefresh: "artifacts/backoffice/src/lib/planning/route-refresh.ts",
  assignmentsActions: "artifacts/backoffice/src/app/actions/assignments.ts",
  planningActions: "artifacts/backoffice/src/app/actions/planning.ts",
  personnelActions: "artifacts/personeel-pwa/src/actions/assignments.ts",
  docs: "docs/fieldgrid-live-day-map-phase9-realtime-status.md",
  test: "tests/fieldgrid-live-day-map-phase9-realtime-status.test.mjs",
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

mustContain("dbRealtime", "emitPlanningRouteRefreshEvent", "shared realtime helper");
mustContain("dbRealtime", "invalidateAssignmentRouteContexts", "shared invalidation helper");
mustContain("dbRealtime", "safelyInvalidateAssignmentRouteContexts", "non-blocking PWA helper");
mustContain("dbRealtime", "portal_realtime_emit_management", "management realtime SQL helper");
mustContain("dbRealtime", "planning_refresh", "planning refresh topic");
mustContain("dbRealtime", "assignmentRouteContextsTable", "route context invalidation");
mustContain("dbRealtime", "routeContextsDeleted", "stale context cleanup evidence");
mustContain("dbPackage", "./planning-realtime", "workspace export");
mustContain("dbIndex", "export * from \"./planning-realtime\"", "index export");

mustContain("backofficeRefresh", "recalculatePlanningRouteContexts", "backoffice ETA recalculation");
mustContain("backofficeRefresh", "emitPlanningRouteRefreshEvent", "backoffice realtime event");
mustContain("backofficeRefresh", "safeRefreshPlanningRoutesForAssignment", "non-blocking backoffice helper");
mustContain("backofficeRefresh", "previousScheduledDate", "old day recalculation");

mustContain("assignmentsActions", "ROUTE_REFRESH_STATUS_REASONS", "status reason map");
mustContain("assignmentsActions", "status_en_route", "en route recalculation reason");
mustContain("assignmentsActions", "status_in_progress", "in progress recalculation reason");
mustContain("assignmentsActions", "status_completed", "completed recalculation reason");
mustContain("assignmentsActions", "status_not_completed", "not completed recalculation reason");
mustContain("assignmentsActions", "assignment_assigned", "assign recalculation reason");
mustContain("assignmentsActions", "assignment_unassigned", "unassign recalculation reason");
mustContain("assignmentsActions", "assignment_rescheduled", "reschedule recalculation reason");
mustContain("assignmentsActions", "assignment_reshifted", "reshift recalculation reason");
mustContain("assignmentsActions", "route_time_suggestion_applied", "route suggestion refresh reason");
mustMatch(
  "assignmentsActions",
  /safeRefreshPlanningRoutesForAssignment\(\{[\s\S]*?reason: "assignment_rescheduled"[\s\S]*?previousScheduledDate: existing\.scheduledDate/,
  "reschedule refreshes old and new route context days",
);

mustContain("planningActions", "planning_board_schedule", "planning board refresh reason");
mustContain("planningActions", "previousScheduledDate: assignment.scheduledDate", "planning board old date refresh");
mustContain("planningActions", "sourcePersonnelId", "planning board source personnel refresh context");

mustContain("personnelActions", "firstEnRouteTrigger", "single en-route customer trigger");
mustContain("personnelActions", "newStatus === \"en_route\" && firstEnRouteTrigger", "customer notification remains first trigger only");
mustContain("personnelActions", "safelyInvalidateAssignmentRouteContexts", "PWA route invalidation");
mustContain("personnelActions", "source: \"personnel-pwa\"", "PWA source marker");
mustContain("personnelActions", "reason: \"status_completed\"", "PWA completed invalidation");
mustContain("personnelActions", "reason: \"status_not_completed\"", "PWA not-completed invalidation");

mustContain("docs", "Fase 9", "phase documentation");
mustContain("docs", "maximaal 1 klantmail", "single customer message documentation");
mustContain("docs", "planning_refresh", "realtime topic documentation");
mustContain("docs", "rollback", "rollback documentation");

mustContain("test", "firstEnRouteTrigger", "test covers first en-route trigger");
mustContain("test", "recalculatePlanningRouteContexts", "test covers ETA recalculation");
mustContain("test", "planning_refresh", "test covers realtime refresh");

mustContain("rootPackageJson", "fieldgrid:live-day-map-phase9", "package script");
mustContain("rootPackageJson", "fieldgrid:live-day-map-phase9:check", "package check script");

if (failures.length > 0) {
  console.error("Fieldgrid live day map phase 9 realtime/status check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const message = "Fieldgrid live day map phase 9 realtime/status check passed.";
if (checkMode) {
  console.log(message);
} else {
  console.log(`${message} Run with --check in CI for strict mode.`);
}
