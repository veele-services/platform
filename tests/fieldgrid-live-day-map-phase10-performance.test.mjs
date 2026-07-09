import assert from "node:assert/strict";
import test from "node:test";

function rowMatchesFilters(row, filters) {
  if (filters.personnelId && row.personnelId !== filters.personnelId) return false;
  if (filters.status && row.status !== filters.status) return false;
  if (filters.region) {
    const region = filters.region.trim().toLowerCase();
    const assignmentRegion = row.requiredRegion?.trim().toLowerCase();
    const personnelRegion = row.personnelRegion?.trim().toLowerCase();
    if (assignmentRegion !== region && personnelRegion !== region) return false;
  }
  return true;
}

function buildFixtureRows({ assignments = 50, personnel = 20 } = {}) {
  const rows = [];
  for (let index = 0; index < assignments; index += 1) {
    const personnelIndex = index % personnel;
    rows.push({
      assignmentId: `assignment-${String(index + 1).padStart(3, "0")}`,
      code: `OPD-${String(index + 1).padStart(3, "0")}`,
      title: `Werkbon ${index + 1}`,
      status: index % 5 === 0 ? "en_route" : "scheduled",
      requiredRegion: index % 2 === 0 ? "noord" : "zuid",
      personnelId: `personnel-${String(personnelIndex + 1).padStart(2, "0")}`,
      personnelName: `Medewerker ${personnelIndex + 1}`,
      personnelRegion: personnelIndex % 2 === 0 ? "noord" : "zuid",
      scheduledStart: `${String(8 + (index % 9)).padStart(2, "0")}:00`,
      travelDurationSeconds: 600 + index,
      travelDistanceMeters: 1200 + index,
      warningCode: index % 17 === 0 ? "outside_window" : null,
    });
  }
  return rows;
}

function buildMapSummary(rows, filters = {}) {
  const markers = new Map();
  const routes = new Map();
  const warnings = [];

  for (const row of rows) {
    if (!rowMatchesFilters(row, filters)) continue;

    if (!markers.has(row.assignmentId)) {
      markers.set(row.assignmentId, {
        id: row.assignmentId,
        code: row.code,
        status: row.status,
        requiredRegion: row.requiredRegion,
        assignedPersonnel: [],
      });
    }
    markers.get(row.assignmentId).assignedPersonnel.push(row.personnelId);

    if (!routes.has(row.personnelId)) {
      routes.set(row.personnelId, {
        personnelId: row.personnelId,
        stops: [],
        totalTravelDurationSeconds: 0,
        totalTravelDistanceMeters: 0,
      });
    }
    const route = routes.get(row.personnelId);
    route.stops.push(row.assignmentId);
    route.totalTravelDurationSeconds += row.travelDurationSeconds;
    route.totalTravelDistanceMeters += row.travelDistanceMeters;

    if (row.warningCode) warnings.push(row.assignmentId);
  }

  const visibleAssignmentIds = new Set(markers.keys());
  const personnelRoutes = [...routes.values()]
    .map((route) => ({
      ...route,
      stops: route.stops.filter((assignmentId) => visibleAssignmentIds.has(assignmentId)),
    }))
    .filter((route) => route.stops.length > 0);

  return {
    markers: [...markers.values()],
    personnelRoutes,
    warnings,
  };
}

test("phase 10 performance fixture covers at least 50 assignments and 20 personnel", () => {
  const rows = buildFixtureRows({ assignments: 50, personnel: 20 });
  const summary = buildMapSummary(rows);

  assert.equal(rows.length, 50);
  assert.equal(new Set(rows.map((row) => row.personnelId)).size, 20);
  assert.equal(summary.markers.length, 50);
  assert.equal(summary.personnelRoutes.length, 20);
  assert.ok(summary.personnelRoutes.every((route) => route.stops.length > 0));
});

test("phase 10 performance fixture keeps filters tenant-server-side friendly", () => {
  const rows = buildFixtureRows({ assignments: 50, personnel: 20 });
  const north = buildMapSummary(rows, { region: "noord" });
  const enRoute = buildMapSummary(rows, { status: "en_route" });
  const onePerson = buildMapSummary(rows, { personnelId: "personnel-01" });

  assert.equal(north.markers.length, 25);
  assert.equal(enRoute.markers.length, 10);
  assert.equal(onePerson.markers.length, 3);
  assert.ok(onePerson.personnelRoutes.every((route) => route.personnelId === "personnel-01"));
});

test("phase 10 fixture stays comfortably below local beta latency budget", () => {
  const rows = buildFixtureRows({ assignments: 50, personnel: 20 });
  const started = performance.now();
  for (let iteration = 0; iteration < 100; iteration += 1) {
    buildMapSummary(rows, iteration % 2 === 0 ? { region: "noord" } : {});
  }
  const elapsedMs = performance.now() - started;

  assert.ok(elapsedMs < 250, `Fixture shaping took ${elapsedMs.toFixed(1)}ms`);
});
