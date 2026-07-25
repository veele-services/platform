import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const planboard = readFileSync(
  "artifacts/backoffice/src/components/assignments/PlanningBoardView.tsx",
  "utf8",
);

test("planboard controls use canonical Radix-backed primitives", () => {
  assert.match(planboard, /from "@\/components\/ui\/select"/u);
  assert.match(planboard, /from "@\/components\/ui\/toggle-group"/u);
  assert.match(planboard, /from "@\/components\/ui\/sheet"/u);
  assert.match(planboard, /<SheetContent side="right"/u);
  assert.doesNotMatch(planboard, /<select\b/u);
  assert.doesNotMatch(planboard, /role="dialog"/u);
  assert.doesNotMatch(planboard, /@radix-ui\/react-/u);
});

test("workday, full-day, zoom, density and personnel order persist locally", () => {
  assert.match(planboard, /fieldgrid:planning-board:preferences/u);
  assert.match(planboard, /value="workday"/u);
  assert.match(planboard, /Volledige dag/u);
  assert.match(planboard, /ZOOM_LEVELS/u);
  assert.match(planboard, /DENSITY_LEVELS/u);
  assert.match(planboard, /PERSONNEL_SORT_OPTIONS/u);
  assert.match(planboard, /Gesorteerd op/u);
  assert.match(planboard, /localStorage\.setItem/u);
});

test("keyboard planning supports precise movement, confirmation and announcements", () => {
  assert.match(planboard, /event\.shiftKey \? 15 : 5/u);
  assert.match(planboard, /event\.key === "ArrowLeft"/u);
  assert.match(planboard, /event\.key === "ArrowRight"/u);
  assert.match(planboard, /event\.key === "Enter"/u);
  assert.match(planboard, /event\.key === "Escape"/u);
  assert.match(planboard, /aria-live="polite"/u);
  assert.match(planboard, /Druk Enter om te bevestigen/u);
  assert.match(planboard, /handleScheduledAssignmentKeyDown/u);
  assert.match(planboard, /setKeyboardSourcePersonnelId\(sourcePersonnelId\)/u);
  assert.match(planboard, /aria-keyshortcuts=/u);
  assert.match(
    planboard,
    /keyboardSourcePersonnelId,\s*"keyboard"/u,
    "a keyboard move must preserve the source personnel id for rescheduling",
  );
});

test("mobile agenda and optimistic rollback/undo do not depend on drag", () => {
  assert.match(planboard, /aria-label="Mobiele dagagenda"/u);
  assert.match(planboard, /Plan hier/u);
  assert.match(planboard, /Plaatsing wordt opgeslagen/u);
  assert.match(planboard, /setGhostInfo/u);
  assert.match(planboard, /label: "Ongedaan maken"/u);
  assert.match(planboard, /Vorige planning hersteld/u);
});
