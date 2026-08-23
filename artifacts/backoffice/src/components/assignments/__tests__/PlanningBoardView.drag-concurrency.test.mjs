import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../PlanningBoardView.tsx", import.meta.url), "utf8");
const planningAction = readFileSync(new URL("../../../app/actions/planning.ts", import.meta.url), "utf8");

test("drop scheduling carries source personnel to move appointments atomically", () => {
  assert.match(source, /sourcePersonnelId\?: string \| null/u);
  assert.match(source, /handleScheduledDragStart/u);
  assert.match(source, /sourcePersonnelId,/u);
  assert.match(
    source,
    /scheduleOnBoard\(\s*assignmentId,\s*person\.id,\s*slot\.start,\s*slot\.end,\s*current\.sourcePersonnelId,\s*"pointer",\s*\)/u,
  );
  assert.match(planningAction, /sourcePersonnelId,\n\s*date,\n\s*start,\n\s*end,/u);
});

test("drag/drop rejects duplicate personnel and blocked canonical matches before mutation", () => {
  assert.match(source, /alreadyAssigned && current\.sourcePersonnelId !== person\.id/u);
  assert.match(source, /Deze medewerker is al gekoppeld aan deze werkbon\./u);
  assert.match(source, /match\?\.level === "blocked"/u);
  assert.match(source, /Niet inplanbaar/u);
});

test("timeline drop slots resolve collisions to the next planning grid slot", () => {
  assert.match(source, /nextNonOverlappingStart/u);
  assert.match(source, /overlapsMinutes\(start, end, otherStart, otherEnd\)/u);
  assert.match(source, /alignToPlanningGrid\(otherEnd, slotMinutes, workdayStart, "up"\)/u);
  assert.match(source, /const resolvedStart = nextNonOverlappingStart/u);
});
