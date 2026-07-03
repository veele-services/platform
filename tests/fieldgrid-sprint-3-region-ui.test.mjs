import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

const regionActions = "artifacts/backoffice/src/app/actions/regions.ts";
const regionSelect = "artifacts/backoffice/src/components/regions/RegionMultiSelect.tsx";
const personnelForm = "artifacts/backoffice/src/components/personnel/PersonnelForm.tsx";
const objectForm = "artifacts/backoffice/src/components/objects/ObjectForm.tsx";
const assignmentForm = "artifacts/backoffice/src/components/assignments/AssignmentForm.tsx";
const objectsPage = "artifacts/backoffice/src/app/(dashboard)/objects/page.tsx";
const assignmentsPage = "artifacts/backoffice/src/app/(dashboard)/assignments/page.tsx";
const objectsView = "artifacts/backoffice/src/components/objects/ObjectsView.tsx";
const assignmentsView = "artifacts/backoffice/src/components/assignments/AssignmentsView.tsx";
const sprintDoc = "docs/fieldgrid-sprint-3-region-ui.md";
const sprintPlan = "docs/fieldgrid-saas-proof-sprint-plan.md";

test("sprint 3 has a reusable region multiselect with autocomplete and create-on-type", () => {
  const component = read(regionSelect);

  assertContains(
    component,
    [
      "export function RegionMultiSelect",
      "CommandInput",
      "value={query}",
      "onValueChange={setQuery}",
      "Nieuwe regio:",
      "Badge",
      "onChange(uniqueRegionNames(next))",
    ],
    "region multiselect",
  );
});

test("region server actions keep region links tenant scoped", () => {
  const actions = read(regionActions);

  assertContains(
    actions,
    [
      "requireCurrentTenantId",
      "tenantRegionsTable",
      "personnelRegionsTable",
      "objectRegionsTable",
      "assignmentRequiredRegionsTable",
      "listRegionOptions",
      "getPersonnelRegionNames",
      "syncPersonnelRegions",
      "getObjectRegionNames",
      "syncObjectRegions",
      "getAssignmentRegionNames",
      "syncAssignmentRequiredRegions",
      "eq(personnelTable.tenantId, tenantId)",
      "eq(objectsTable.tenantId, tenantId)",
      "eq(assignmentsTable.tenantId, tenantId)",
    ],
    "region actions",
  );
});

test("personnel form uses multi-region UI and preserves legacy region fields", () => {
  const form = read(personnelForm);

  assertContains(
    form,
    [
      "RegionMultiSelect",
      "listRegionOptions",
      "getPersonnelRegionNames",
      "syncPersonnelRegions",
      "region:             regionNames[0]",
      "preferredRegions:   regionNames.slice(1)",
      "setRegionNames(linkedRegions.length ? linkedRegions",
    ],
    "personnel region UI",
  );
});

test("object form uses tenant region links", () => {
  const form = read(objectForm);

  assertContains(
    form,
    [
      "RegionMultiSelect",
      "regionOptions: RegionOption[]",
      "getObjectRegionNames",
      "syncObjectRegions",
      "setRegionNames(linkedRegions)",
      "Objectregio",
    ],
    "object region UI",
  );
});

test("assignment form uses multi-region UI while preserving requiredRegion", () => {
  const form = read(assignmentForm);

  assertContains(
    form,
    [
      "RegionMultiSelect",
      "regionOptions:  RegionOption[]",
      "getAssignmentRegionNames",
      "syncAssignmentRequiredRegions",
      "requiredRegion: regionNames[0] || undefined",
      "setValue(\"requiredRegion\", next[0] ?? \"\"",
      "extra regio",
    ],
    "assignment region UI",
  );
});

test("object and assignment pages pass tenant region options into their forms", () => {
  const combined = [
    read(objectsPage),
    read(assignmentsPage),
    read(objectsView),
    read(assignmentsView),
  ].join("\n");

  assertContains(
    combined,
    [
      "listRegionOptions",
      "regionOptions",
      "<ObjectForm",
      "<AssignmentForm",
    ],
    "region option wiring",
  );
});

test("sprint plan records sprint 3 region UI delivery", () => {
  const combined = `${read(sprintDoc)}\n${read(sprintPlan)}`;

  assertContains(
    combined,
    [
      "Sprint 3",
      "Regio UI backoffice breed",
      "RegionMultiSelect",
      "autocomplete",
      "create-on-type",
      "personnel.region",
      "assignments.required_region",
      "Sprint 4",
    ],
    "sprint 3 canon",
  );
});
