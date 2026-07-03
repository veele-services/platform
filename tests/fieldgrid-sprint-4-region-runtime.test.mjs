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

const regionRuntime = "artifacts/backoffice/src/app/actions/region-runtime.ts";
const personnelPage = "artifacts/backoffice/src/app/(dashboard)/personnel/page.tsx";
const objectsPage = "artifacts/backoffice/src/app/(dashboard)/objects/page.tsx";
const assignmentsPage = "artifacts/backoffice/src/app/(dashboard)/assignments/page.tsx";
const assignmentsView = "artifacts/backoffice/src/components/assignments/AssignmentsView.tsx";
const assignmentForm = "artifacts/backoffice/src/components/assignments/AssignmentForm.tsx";
const sprintDoc = "docs/fieldgrid-sprint-4-region-runtime.md";

test("sprint 4 runtime queries use tenant-scoped region link tables", () => {
  const runtime = read(regionRuntime);

  assertContains(
    runtime,
    [
      "function personnelRegionCondition",
      "function objectRegionCondition",
      "function assignmentRegionCondition",
      "personnel_regions",
      "object_regions",
      "assignment_required_regions",
      "tenant_regions",
      "pr.tenant_id = ${tenantId}::uuid",
      "object_region.tenant_id = ${tenantId}::uuid",
      "required_region.tenant_id = ${tenantId}::uuid",
      "tr.tenant_id = ${tenantId}::uuid",
      "tr.is_active = true",
    ],
    "region runtime tenant scope",
  );
});

test("backoffice list pages use the region-aware server actions", () => {
  const combined = [read(personnelPage), read(objectsPage), read(assignmentsPage)].join("\n");

  assertContains(
    combined,
    [
      "listPersonnelRegionAware",
      "listObjectsRegionAware",
      "listAssignmentsRegionAware",
      "region",
    ],
    "region-aware pages",
  );
});

test("assignment list exposes a region filter backed by tenant region options", () => {
  const page = read(assignmentsPage);
  const view = read(assignmentsView);

  assertContains(
    `${page}\n${view}`,
    [
      "listRegionOptions",
      "initialRegion",
      "applyFilter(\"region\"",
      "Alle regio&apos;s",
      "regionOptions.map",
    ],
    "assignment region filter",
  );
});

test("assignment create flow can prefill regions from the selected object", () => {
  const form = read(assignmentForm);

  assertContains(
    form,
    [
      "getObjectRegionNames",
      "regionTouched",
      "mode !== \"create\"",
      "objectIdVal === \"NONE\"",
      "setRegionNames(names)",
      "setValue(\"requiredRegion\", names[0] ?? \"\"",
      "setRegionTouched(true)",
    ],
    "assignment object region prefill",
  );
});

test("sprint 4 canon records runtime scope and remaining runtime proof", () => {
  const doc = read(sprintDoc);

  assertContains(
    doc,
    [
      "Regio runtime en planninglogica",
      "runtimebasis",
      "Tenant A/B/Veele",
      "Opdracht zonder regio",
      "meerdere regio's",
      "staging-continuiteit",
    ],
    "sprint 4 canon",
  );
});
