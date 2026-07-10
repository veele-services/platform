import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("phase 8 applies route time suggestions through guarded server action", () => {
  const actions = read("artifacts/backoffice/src/app/actions/assignments.ts");

  assert.match(actions, /export async function applyRouteTimeSuggestion/);
  assert.match(actions, /requirePermission\("planning", "write"\)/);
  assert.match(actions, /requireCurrentTenantId\(\)/);
  assert.match(actions, /eq\(assignmentRouteContextsTable\.tenantId, tenantId\)/);
  assert.match(actions, /eq\(assignmentsTable\.tenantId, tenantId\)/);
  assert.match(actions, /snapSuggestedStart/);
  assert.match(actions, /reshiftAssignment\(assignmentId, to\.start, to\.end\)/);
});

test("phase 8 writes tenant-aware audit when a suggestion is applied", () => {
  const actions = read("artifacts/backoffice/src/app/actions/assignments.ts");

  assert.match(actions, /db\.insert\(auditLogTable\)\.values\(\{/);
  assert.match(actions, /tenantId,/);
  assert.match(actions, /action: "apply_route_time_suggestion"/);
  assert.match(actions, /routeContextId/);
  assert.match(actions, /personnelId/);
  assert.match(actions, /from,/);
  assert.match(actions, /to,/);
});

test("phase 8 map drawer requires explicit before-after confirmation", () => {
  const mapView = read("artifacts/backoffice/src/components/assignments/PlanningMapView.tsx");
  const planningPage = read("artifacts/backoffice/src/app/(dashboard)/planning/page.tsx");

  assert.match(mapView, /applyRouteTimeSuggestion/);
  assert.match(mapView, /AlertDialog/);
  assert.match(mapView, /Voorstel toepassen/);
  assert.match(mapView, /Tijdvoorstel toepassen\?/);
  assert.match(mapView, /Fieldgrid past routevoorstellen nooit automatisch toe/);
  assert.match(mapView, /Huidig/);
  assert.match(mapView, /Voorstel/);
  assert.match(mapView, /routeContextCanApply/);
  assert.match(mapView, /canApplySuggestions/);
  assert.match(planningPage, /canApplySuggestions=\{canWrite\}/);
  assert.match(mapView, /event\.preventDefault\(\);\s*handleApplySuggestion\(\);/s);
});

test("phase 8 gate is exposed through package scripts", () => {
  const pkg = JSON.parse(read("package.json"));

  assert.equal(
    pkg.scripts["fieldgrid:live-day-map-phase8"],
    "node scripts/fieldgrid-live-day-map-phase8-time-suggestions.mjs && node --test tests/fieldgrid-live-day-map-phase8-time-suggestions.test.mjs",
  );
  assert.equal(
    pkg.scripts["fieldgrid:live-day-map-phase8:check"],
    "node scripts/fieldgrid-live-day-map-phase8-time-suggestions.mjs --check && node --test tests/fieldgrid-live-day-map-phase8-time-suggestions.test.mjs",
  );
});
