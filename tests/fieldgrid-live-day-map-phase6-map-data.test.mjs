import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const sourcePath = path.join(
  root,
  "artifacts/backoffice/src/lib/planning/map-data.ts",
);
const source = fs
  .readFileSync(sourcePath, "utf8")
  .replace('import "server-only";', "");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});
const module = { exports: {} };
vm.runInNewContext(transpiled.outputText, {
  module,
  exports: module.exports,
  require: (id) => {
    throw new Error(`Unexpected runtime import in map-data test: ${id}`);
  },
});

const {
  buildPlanningDayMapDataFromRows,
  createEmptyPlanningDayMapData,
  resolvePlanningMapCoordinate,
} = module.exports;

const baseRow = {
  assignmentId: "assignment-a",
  code: "OPD-001",
  title: "Controle object",
  status: "scheduled",
  priority: "normal",
  scheduledDate: "2026-07-09",
  scheduledStart: "09:00",
  scheduledEnd: "10:00",
  customerId: "customer-a",
  customerName: "Klant A",
  objectId: "object-a",
  objectName: "Object A",
  objectAddress: "Hoofdstraat 1",
  objectPostalCode: "1234 AB",
  objectCity: "Den Haag",
  requiredRegion: "Den Haag",
  objectLat: "52.0705",
  objectLng: "4.3007",
  customerLat: "51.9225",
  customerLng: "4.4792",
  personnelId: "personnel-a",
  personnelFirstName: "Dana",
  personnelLastName: "Planner",
  personnelRegion: "Den Haag",
  personnelVehicleType: "car",
  routeContextId: "route-a",
  previousAssignmentId: null,
  sequenceIndex: 1,
  originLat: null,
  originLng: null,
  destinationLat: "52.0705",
  destinationLng: "4.3007",
  travelDurationSeconds: 600,
  travelDistanceMeters: 3200,
  bufferMinutes: 10,
  computedEarliestStart: "2026-07-09T07:00:00.000Z",
  customerWindowStart: "09:00",
  customerWindowEnd: "10:00",
  snapStatus: "ok",
  snapSuggestedStart: null,
  snapSuggestedEnd: null,
  warningCode: null,
  warningMessage: null,
};

function row(overrides = {}) {
  return { ...baseRow, ...overrides };
}

test("phase 6 map data uses object coordinates and does not fall back to customer coordinates", () => {
  const objectCoordinate = resolvePlanningMapCoordinate(row());
  assert.equal(objectCoordinate.lat, 52.0705);
  assert.equal(objectCoordinate.lng, 4.3007);
  assert.equal(objectCoordinate.source, "object");

  const customerFallback = resolvePlanningMapCoordinate(
    row({
      objectLat: null,
      objectLng: null,
    }),
  );
  assert.equal(customerFallback, null);

  const missing = resolvePlanningMapCoordinate(
    row({
      objectLat: "not-a-number",
      objectLng: "4.3007",
      customerLat: null,
      customerLng: null,
    }),
  );
  assert.equal(missing, null);
});

test("phase 6 map data normalizes markers, routes and missing-location warnings", () => {
  const data = buildPlanningDayMapDataFromRows(
    [
      row(),
      row({
        assignmentId: "assignment-b",
        code: "OPD-002",
        objectLat: null,
        objectLng: null,
        customerLat: null,
        customerLng: null,
        routeContextId: "route-b",
        sequenceIndex: 2,
        travelDurationSeconds: null,
        travelDistanceMeters: null,
      }),
    ],
    {
      date: "2026-07-09",
      generatedAt: new Date("2026-07-09T08:00:00.000Z"),
    },
  );

  assert.equal(data.accessDenied, false);
  assert.equal(data.markers.length, 2);
  assert.equal(data.personnelRoutes.length, 1);
  assert.equal(data.personnelRoutes[0].stops.length, 2);
  assert.equal(data.personnelRoutes[0].totalTravelDurationSeconds, 600);
  assert.equal(data.missingLocationCount, 1);
  assert.equal(data.warnings.length, 1);
  assert.equal(data.warnings[0].warningCode, "missing_location");
});

test("phase 6 map data keeps multiple personnel contexts on the same assignment", () => {
  const data = buildPlanningDayMapDataFromRows(
    [
      row(),
      row({
        personnelId: "personnel-b",
        personnelFirstName: "Bo",
        personnelLastName: "Monteur",
        personnelVehicleType: "bicycle",
        routeContextId: "route-b",
        sequenceIndex: 1,
        travelDurationSeconds: 900,
      }),
    ],
    { date: "2026-07-09" },
  );

  assert.equal(data.markers.length, 1);
  assert.equal(data.markers[0].assignedPersonnel.length, 2);
  assert.equal(data.markers[0].routeContexts.length, 2);
  assert.equal(data.personnelRoutes.length, 2);
});

test("phase 6 map data filters by personnel, status, region and warnings only", () => {
  const rows = [
    row(),
    row({
      assignmentId: "assignment-b",
      code: "OPD-002",
      status: "completed",
      personnelId: "personnel-b",
      personnelFirstName: "Bo",
      requiredRegion: "Rotterdam",
      personnelRegion: "Rotterdam",
      routeContextId: "route-b",
    }),
    row({
      assignmentId: "assignment-c",
      code: "OPD-003",
      status: "scheduled",
      personnelId: "personnel-c",
      personnelFirstName: "Chris",
      requiredRegion: "Utrecht",
      personnelRegion: "Utrecht",
      objectLat: null,
      objectLng: null,
      customerLat: null,
      customerLng: null,
      routeContextId: "route-c",
    }),
  ];

  assert.equal(
    buildPlanningDayMapDataFromRows(rows, {
      date: "2026-07-09",
      filters: { personnelId: "personnel-b" },
    }).markers.length,
    1,
  );
  assert.equal(
    buildPlanningDayMapDataFromRows(rows, {
      date: "2026-07-09",
      filters: { status: "completed" },
    }).markers[0].id,
    "assignment-b",
  );
  assert.equal(
    buildPlanningDayMapDataFromRows(rows, {
      date: "2026-07-09",
      filters: { region: "utrecht", warningsOnly: true },
    }).markers[0].id,
    "assignment-c",
  );
});

test("phase 6 map data omits providerMeta and supports accessDenied empty response", () => {
  const denied = createEmptyPlanningDayMapData("2026-07-09", {
    accessDenied: true,
    generatedAt: new Date("2026-07-09T08:00:00.000Z"),
  });

  assert.equal(denied.accessDenied, true);
  assert.equal(denied.markers.length, 0);

  const data = buildPlanningDayMapDataFromRows([row()], {
    date: "2026-07-09",
    generatedAt: new Date("2026-07-09T08:00:00.000Z"),
  });
  assert.equal(JSON.stringify(data).includes("providerMeta"), false);
});

test("phase 6 map data action has tenant boundary and read-only contract", () => {
  const planningSource = fs.readFileSync(
    path.join(root, "artifacts/backoffice/src/app/actions/planning.ts"),
    "utf8",
  );
  const actionStart = planningSource.indexOf("export async function getPlanningDayMapData");
  const actionEnd = planningSource.indexOf(
    "\n/**",
    actionStart,
  );
  const mapDataAction = planningSource.slice(
    actionStart,
    actionEnd === -1 ? undefined : actionEnd,
  );

  assert.match(mapDataAction, /export async function getPlanningDayMapData/);
  assert.match(mapDataAction, /hasPermission\("planning", "read"\)/);
  assert.match(mapDataAction, /requireCurrentTenantId\(\)/);
  assert.match(mapDataAction, /eq\(assignmentsTable\.tenantId, tenantId\)/);
  assert.match(mapDataAction, /eq\(personnelTable\.tenantId, tenantId\)/);
  assert.match(mapDataAction, /eq\(customersTable\.tenantId, tenantId\)/);
  assert.match(mapDataAction, /eq\(objectsTable\.tenantId, tenantId\)/);
  assert.match(
    mapDataAction,
    /eq\(assignmentRouteContextsTable\.tenantId, tenantId\)/,
  );
  assert.match(mapDataAction, /buildPlanningDayMapDataFromRows/);
  assert.doesNotMatch(mapDataAction, /providerMeta/);
  assert.doesNotMatch(mapDataAction, /getRouteWithCache/);
});
