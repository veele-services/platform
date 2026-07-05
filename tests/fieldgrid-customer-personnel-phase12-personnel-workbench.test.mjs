import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 12 adds a personnel planning command bar with filters and view modes", () => {
  const planningPage = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/page.tsx");

  for (const marker of [
    "type PlanningStatusFilter",
    "type PlanningViewMode",
    "function PlanningCommandBar",
    'name="q"',
    'name="date"',
    'name="status"',
    'name="view"',
    "filterAssignments",
    "buildPlanningHref",
  ]) {
    assert.match(planningPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
});

test("phase 12 keeps planning cards compact and status-led on tablet and desktop", () => {
  const planningPage = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/page.tsx");

  assert.match(planningPage, /viewMode === "compact"/u);
  assert.match(planningPage, /md:grid-cols-\[9rem_minmax\(0,1fr\)_8rem\]/u);
  assert.match(planningPage, /md:grid-cols-2 xl:grid-cols-3/u);
  assert.match(planningPage, /StatusPill/u);
});

test("phase 12 builds the work order detail as a tablet desktop workbench", () => {
  const workOrderPage = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/page.tsx");

  for (const marker of [
    "function nextActionCopy",
    "function PrimaryActionDock",
    "function WorkbenchRail",
    "function WorkbenchSection",
    "Object en contact",
    "Werkbon onderdelen",
    "Volgende actie",
    "md:grid-cols-[minmax(0,1fr)_22rem]",
    "md:sticky md:top-4",
  ]) {
    assert.match(workOrderPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
});

test("phase 12 keeps risky work order status changes behind a shared confirmation dialog", () => {
  const statusProgress = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderStatusProgress.tsx");

  assert.match(statusProgress, /PersonnelConfirmDialog/u);
  assert.match(statusProgress, /Werkzaamheden starten\?/u);
  assert.doesNotMatch(statusProgress, /window\.confirm/u);
});
