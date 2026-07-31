import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("personnel planning keeps the date strip and removes the secondary filter container", () => {
  const planningPage = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/page.tsx");
  const planningWeekStrip = read("artifacts/personeel-pwa/src/components/PlanningWeekStrip.tsx");

  for (const marker of ["PlanningWeekStrip", "buildPlanningHref", "getPlanningDays"]) {
    assert.match(planningPage, new RegExp(marker, "u"));
  }
  for (const removedMarker of [
    "function PlanningCommandBar",
    'name="q"',
    'name="status"',
    'name="view"',
    "werkbonnen zichtbaar",
  ]) {
    assert.doesNotMatch(planningPage, new RegExp(removedMarker, "u"));
  }
  assert.doesNotMatch(
    planningWeekStrip,
    /boxShadow:\s*day\.isActive/u,
    "the active planning date should not render a glow",
  );
});

test("planning cards show one effective time with the work order number below and status alongside", () => {
  const planningPage = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/page.tsx");

  assert.match(planningPage, /justify-between gap-3/u);
  assert.match(
    planningPage,
    /formatTime\(\s*assignment\.effectiveStart,\s*assignment\.isRunning\s*\?\s*"nu"\s*:\s*assignment\.effectiveEnd,\s*\)/u,
  );
  assert.match(planningPage, /assignment\.code \|\| "Werkbon"/u);
  assert.match(planningPage, /md:grid-cols-2 xl:grid-cols-3/u);
  assert.match(planningPage, /StatusPill/u);
  assert.doesNotMatch(planningPage, /Werkelijk|Gepland/u);
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
