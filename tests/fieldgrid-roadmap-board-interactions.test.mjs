import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("platform roadmap board is collapsible, draggable and inline editable", () => {
  const board = read("artifacts/backoffice/src/app/(platform)/platform/roadmap/RoadmapBoardClient.tsx");
  const page = read("artifacts/backoffice/src/app/(platform)/platform/roadmap/page.tsx");

  assert.match(page, /RoadmapBoardClient/u);
  assert.match(board, /draggable/u);
  assert.match(board, /onDragStart/u);
  assert.match(board, /onDropStatus/u);
  assert.match(board, /setCollapsedColumns/u);
  assert.match(board, /setCollapsedScopes/u);
  assert.match(board, /Roadmapitem bewerken/u);
  assert.match(board, /savePlatformRoadmapItemFromForm/u);
  assert.match(board, /changePlatformRoadmapStatus/u);
});

test("platform roadmap audiences can be added and removed from the board", () => {
  const board = read("artifacts/backoffice/src/app/(platform)/platform/roadmap/RoadmapBoardClient.tsx");
  const actions = read("artifacts/backoffice/src/app/actions/roadmap.ts");

  assert.match(board, /Audiences beheren/u);
  assert.match(board, /updatePlatformRoadmapAudiences/u);
  assert.match(board, /name="audienceKeys"/u);
  assert.match(actions, /export async function updatePlatformRoadmapAudiences/u);
  assert.match(actions, /roadmap_audiences_updated/u);
  assert.match(actions, /roadmapItemAudiencesTable/u);
});
