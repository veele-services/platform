#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkMode = process.argv.includes("--check");

const files = {
  rules: "artifacts/backoffice/src/lib/planning/eta-rules.ts",
  engine: "artifacts/backoffice/src/lib/planning/eta-engine.ts",
  routeCache: "artifacts/backoffice/src/lib/planning/routes/route-cache.ts",
  schema: "lib/db/src/schema/planning-routes.ts",
  docs: "docs/fieldgrid-live-day-map-phase5-eta-engine.md",
  test: "tests/fieldgrid-live-day-map-phase5-eta-rules.test.mjs",
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
    failures.push(`${files[key]} bevat verboden fase-5 patroon: ${label}`);
  }
}

for (const key of ["rules", "engine"]) {
  mustContain(key, 'import "server-only";', "server-only guard");
  mustNotContain(key, "NEXT_PUBLIC", "client-side provider/config");
  mustNotContain(key, "maplibre", "kaart-UI in ETA-fase");
  mustNotContain(key, "PlanningMapView", "kaartcomponent in ETA-fase");
  mustNotContain(key, "applyRouteTimeSuggestion", "planner-mutatie hoort pas later");
  mustNotContain(key, "db.update(assignmentsTable)", "assignment update in read-only ETA-fase");
  mustNotContain(key, ".update(assignmentsTable)", "assignment update in read-only ETA-fase");
}

mustContain("rules", "computeEtaSnapSuggestion", "snapregel helper");
mustContain("rules", "sortEtaAssignmentsForPersonnel", "personeelsdag volgorde");
mustContain("rules", "selectDepartureTime", "vertrekbasis helper");
mustContain("rules", "getRouteBufferMinutes", "buffer per vervoerstype");
mustContain("rules", "outside_window", "buiten klanttijdvak status");
mustContain("rules", "missing_location", "ontbrekende locatie status");
mustContain("rules", "provider_error", "providerfout status");
mustContain("rules", "roundMinutesUpToPlanningSlot", "slot afronding naar boven");

mustContain("engine", "recalculatePlanningRouteContexts", "routecontext recalculatie");
mustContain("engine", "assignmentRouteContextsTable", "routecontexts tabel");
mustContain("engine", "getRouteWithCache", "routecache/provider integratie");
mustContain("engine", "assignmentPersonnelTable", "per personeelskoppeling");
mustContain("engine", "personnelVehicleType", "vervoerstype per medewerker");
mustContain("engine", "previous_assignment", "vorige opdracht oorsprong");
mustContain("engine", "computedEarliestStart", "computed earliest start");
mustContain("engine", "warningCount", "warning summary");
mustContain("engine", "delete(assignmentRouteContextsTable)", "stale context cleanup");
mustContain("engine", "tx.insert(assignmentRouteContextsTable)", "context write");

mustContain("routeCache", "getRouteWithCache", "fase 4 routecache beschikbaar");
mustContain("schema", "assignment_route_contexts", "routecontexts schema");
mustContain("schema", "assignment_route_contexts_assignment_personnel_day_idx", "per-personeel unieke context");

mustContain("test", "computeEtaSnapSuggestion", "snapregel unit test");
mustContain("test", "outside_window", "outside-window unit test");
mustContain("test", "missing_location", "missing-location unit test");
mustContain("test", "provider_error", "provider-error unit test");
mustContain("test", "sortEtaAssignmentsForPersonnel", "volgorde unit test");
mustContain("test", "selectDepartureTime", "vertrekbasis unit test");
mustContain("test", "getRouteBufferMinutes", "buffer unit test");

mustContain("docs", "ETA-engine read-only", "fase-5 documenttitel");
mustContain("docs", "geen assignment update", "read-only garantie");
mustContain("docs", "meerdere personeelsleden", "multi-personnel garantie");
mustContain("docs", "assignment_route_contexts", "routecontext documentatie");
mustContain("docs", "snapregels", "snapregel documentatie");

mustContain("packageJson", "fieldgrid:live-day-map-phase5", "package script");
mustContain(
  "packageJson",
  "fieldgrid:live-day-map-phase5:check",
  "package check script",
);

if (failures.length > 0) {
  console.error("Fieldgrid live day map phase 5 ETA engine check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const message = "Fieldgrid live day map phase 5 ETA engine check passed.";
if (checkMode) {
  console.log(message);
} else {
  console.log(`${message} Run with --check in CI for strict mode.`);
}
