import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("phase 9 exposes a shared planning realtime helper", () => {
  const helper = read("lib/db/src/planning-realtime.ts");
  const dbPackage = JSON.parse(read("lib/db/package.json"));
  const dbIndex = read("lib/db/src/index.ts");

  assert.match(helper, /export async function emitPlanningRouteRefreshEvent/);
  assert.match(helper, /export async function invalidateAssignmentRouteContexts/);
  assert.match(helper, /export async function safelyInvalidateAssignmentRouteContexts/);
  assert.match(helper, /portal_realtime_emit_management/);
  assert.match(helper, /planning_refresh/);
  assert.match(helper, /assignmentRouteContextsTable/);
  assert.match(helper, /routeContextsDeleted/);
  assert.equal(dbPackage.exports["./planning-realtime"], "./src/planning-realtime.ts");
  assert.match(dbIndex, /export \* from "\.\/planning-realtime"/);
});

test("phase 9 recalculates ETA contexts in backoffice mutations", () => {
  const helper = read("artifacts/backoffice/src/lib/planning/route-refresh.ts");
  const assignments = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const planning = read("artifacts/backoffice/src/app/actions/planning.ts");

  assert.match(helper, /recalculatePlanningRouteContexts/);
  assert.match(helper, /emitPlanningRouteRefreshEvent/);
  assert.match(helper, /previousScheduledDate/);
  assert.match(assignments, /ROUTE_REFRESH_STATUS_REASONS/);
  assert.match(assignments, /status_en_route/);
  assert.match(assignments, /status_in_progress/);
  assert.match(assignments, /status_completed/);
  assert.match(assignments, /status_not_completed/);
  assert.match(assignments, /reason: "assignment_assigned"/);
  assert.match(assignments, /reason: "assignment_unassigned"/);
  assert.match(assignments, /reason: "assignment_rescheduled"/);
  assert.match(assignments, /reason: "assignment_reshifted"/);
  assert.match(assignments, /reason: "route_time_suggestion_applied"/);
  assert.match(planning, /reason: "planning_board_schedule"/);
  assert.match(planning, /previousScheduledDate: assignment\.scheduledDate/);
});

test("phase 9 keeps en-route customer messaging one-shot while refreshing PWA planning", () => {
  const personnelActions = read("artifacts/personeel-pwa/src/actions/assignments.ts");

  assert.match(personnelActions, /let firstEnRouteTrigger = false/);
  assert.match(personnelActions, /isNull\(assignmentsTable\.enRouteAt\)/);
  assert.match(personnelActions, /newStatus === "en_route" && firstEnRouteTrigger/);
  assert.match(personnelActions, /safelyInvalidateAssignmentRouteContexts/);
  assert.match(personnelActions, /source: "personnel-pwa"/);
  assert.match(personnelActions, /reason: "status_completed"/);
  assert.match(personnelActions, /reason: "status_not_completed"/);
});

test("phase 9 gate is exposed through package scripts", () => {
  const pkg = JSON.parse(read("package.json"));

  assert.equal(
    pkg.scripts["fieldgrid:live-day-map-phase9"],
    "node scripts/fieldgrid-live-day-map-phase9-realtime-status.mjs && node --test tests/fieldgrid-live-day-map-phase9-realtime-status.test.mjs",
  );
  assert.equal(
    pkg.scripts["fieldgrid:live-day-map-phase9:check"],
    "node scripts/fieldgrid-live-day-map-phase9-realtime-status.mjs --check && node --test tests/fieldgrid-live-day-map-phase9-realtime-status.test.mjs",
  );
});
