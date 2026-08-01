import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("backoffice personnel form persists the canonical default travel mode", () => {
  const form = read(
    "artifacts/backoffice/src/components/personnel/PersonnelForm.tsx",
  );
  const actions = read("artifacts/backoffice/src/app/actions/personnel.ts");

  for (const value of ["DRIVE", "BICYCLE", "WALK", "TRANSIT"]) {
    assert.match(form, new RegExp(`value: "${value}"`, "u"));
  }
  for (const label of ["Auto", "Fiets", "Lopen", "Openbaar vervoer"]) {
    assert.match(form, new RegExp(label, "u"));
  }

  assert.match(form, /Standaard vervoersmiddel/u);
  assert.match(form, /vehicleType:\s+z\.enum/u);
  assert.match(
    form,
    /setValue\("vehicleType",\s+p\.vehicleType\s+\?\?\s+"DRIVE"\)/u,
  );
  assert.match(form, /vehicleType:\s+parsed\.data\.vehicleType/u);

  assert.match(actions, /vehicleType\?:\s+PersonnelVehicleType \| string/u);
  assert.match(actions, /vehicleType:\s+data\.vehicleType \|\| "DRIVE"/u);
  assert.match(actions, /normalizePersonnelVehicleType\(parsedVehicleType\)/u);
  assert.match(
    actions,
    /tenantId,\s*\r?\n\s*userId:\s+user\.id,\s*\r?\n\s*action:\s+"update"/u,
  );
  assert.match(actions, /previousVehicleType/u);
  assert.match(actions, /vehicleTypeChanged/u);
});

test("backoffice personnel queries and details expose the canonical travel mode", () => {
  const actions = read("artifacts/backoffice/src/app/actions/personnel.ts");
  const detail = read(
    "artifacts/backoffice/src/app/(dashboard)/personnel/[id]/page.tsx",
  );
  const slimProfile = read(
    "artifacts/backoffice/src/components/personnel/SlimProfielPanel.tsx",
  );
  const regionRuntime = read(
    "artifacts/backoffice/src/app/actions/region-runtime.ts",
  );

  assert.match(actions, /vehicleType:\s+PersonnelVehicleType/u);
  assert.match(actions, /vehicleType:\s+personnelTable\.vehicleType/u);
  assert.match(
    actions,
    /vehicleType:\s+normalizePersonnelVehicleType\(r\.vehicleType\) \?\? "DRIVE"/u,
  );
  assert.match(regionRuntime, /vehicleType:\s+personnelTable\.vehicleType/u);

  assert.match(detail, /Standaard vervoer/u);
  assert.match(detail, /Standaard vervoersmiddel/u);
  assert.match(detail, /vehicleTypeLabel\(person\.vehicleType\)/u);
  assert.match(slimProfile, /Standaard vervoer:/u);
  assert.match(slimProfile, /vehicleTypeLabel\(person\.vehicleType\)/u);
});

test("personnel PWA profile can edit travel mode with audit and tenant scope", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/personnel.ts");
  const form = read(
    "artifacts/personeel-pwa/src/app/(app)/profiel/ProfileForm.tsx",
  );
  const page = read("artifacts/personeel-pwa/src/app/(app)/profiel/page.tsx");

  assert.match(actions, /vehicleType:\s+PersonnelVehicleType/u);
  assert.match(actions, /"vehicle_type"/u);
  assert.match(
    actions,
    /normalizePersonnelVehicleType\(vehicleTypeRaw \?\? "DRIVE"\)/u,
  );
  assert.match(actions, /eq\(personnelTable\.userId,\s+user\.id\)/u);
  assert.match(actions, /eq\(personnelTable\.tenantId,\s+tenantId\)/u);
  assert.match(actions, /vehicleType,/u);
  assert.match(actions, /auditLogTable/u);
  assert.match(actions, /action:\s+"update_profile"/u);
  assert.match(actions, /assignmentRouteContextsTable/u);

  assert.match(form, /Standaard vervoersmiddel/u);
  assert.match(form, /name="vehicleType"/u);
  assert.match(form, /profile\.vehicleType \?\? "DRIVE"/u);
  for (const label of ["Auto", "Fiets", "Lopen", "Openbaar vervoer"]) {
    assert.match(form, new RegExp(label, "u"));
  }

  assert.match(page, /<ProfileForm profile=\{profile\} \/>/u);
  assert.doesNotMatch(page, /vehicleTypeLabel\(profile\.vehicleType\)/u);
});

test("planning route calculation uses profile default, supports override and prefers home for first stop", () => {
  const planningActions = read(
    "artifacts/backoffice/src/app/actions/planning.ts",
  );
  const mapView = read(
    "artifacts/backoffice/src/components/assignments/PlanningMapView.tsx",
  );

  assert.match(
    planningActions,
    /requestedMode\s+\?\?\s*\r?\n\s*parsePlanningRouteTravelMode\(row\?\.personnelVehicleType\)\s+\?\?\s*\r?\n\s*"DRIVE"/u,
  );
  assert.match(
    planningActions,
    /firstStopUsesHome\s*=\s*!row\.routePreviousAssignmentId/u,
  );
  assert.match(
    planningActions,
    /firstStopUsesHome\s*\?\s*personnelOrigin \?\? contextOrigin\s*:\s*contextOrigin \?\? personnelOrigin/u,
  );
  assert.match(planningActions, /originFromHome/u);
  assert.match(planningActions, /Huisadres \$\{personnelName/u);

  assert.match(mapView, /routeTravelMode/u);
  assert.match(
    mapView,
    /setRouteTravelMode\(canonicalTravelMode\(nextPersonnel\.vehicleType\)\)/u,
  );
  assert.match(mapView, /travelMode,\s*\r?\n\s*\}\)/u);
  assert.match(mapView, /wijzigt het medewerkerprofiel niet/u);
  assert.doesNotMatch(mapView, /updatePersonnel\(/u);
});
