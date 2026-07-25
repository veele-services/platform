import assert from "node:assert/strict";
import test from "node:test";

import {
  dataViewResultRange,
  dataViewSelectionState,
  nextDataViewSort,
  normalizeDataViewSavedViews,
  toggleDataViewPageSelection,
  upsertDataViewSavedView,
} from "../../artifacts/backoffice/src/lib/data-view";

test("sorting toggles only the active column", () => {
  assert.deepEqual(nextDataViewSort("name", "asc", "name"), {
    key: "name",
    direction: "desc",
  });
  assert.deepEqual(nextDataViewSort("name", "desc", "city"), {
    key: "city",
    direction: "asc",
  });
});

test("page selection preserves rows selected on other pages", () => {
  const initial = new Set(["outside", "row-1"]);
  assert.equal(
    dataViewSelectionState(["row-1", "row-2"], initial),
    "indeterminate",
  );

  const selected = toggleDataViewPageSelection(
    ["row-1", "row-2"],
    initial,
    true,
  );
  assert.deepEqual([...selected].sort(), ["outside", "row-1", "row-2"]);
  assert.equal(dataViewSelectionState(["row-1", "row-2"], selected), true);

  const cleared = toggleDataViewPageSelection(
    ["row-1", "row-2"],
    selected,
    false,
  );
  assert.deepEqual([...cleared], ["outside"]);
  assert.equal(dataViewSelectionState(["row-1", "row-2"], cleared), false);
});

test("saved views are bounded, sanitized and replace equal Dutch names", () => {
  const invalid = normalizeDataViewSavedViews([
    null,
    { id: 1, name: "ongeldig", query: "", createdAt: "" },
    {
      id: "a",
      name: "  Actieve objecten  ",
      query: "?status=active",
      createdAt: "2026-07-25T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(invalid, [
    {
      id: "a",
      name: "Actieve objecten",
      query: "status=active",
      createdAt: "2026-07-25T00:00:00.000Z",
    },
  ]);

  const replaced = upsertDataViewSavedView(invalid, {
    id: "b",
    name: "actieve objecten",
    query: "status=active&region=west",
    createdAt: "2026-07-25T01:00:00.000Z",
  });
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0]?.id, "b");
  assert.equal(replaced[0]?.query, "status=active&region=west");
});

test("result ranges fail closed at empty and out-of-range totals", () => {
  assert.deepEqual(dataViewResultRange(1, 25, 0), { from: 0, to: 0 });
  assert.deepEqual(dataViewResultRange(2, 25, 61), { from: 26, to: 50 });
  assert.deepEqual(dataViewResultRange(99, 25, 61), { from: 61, to: 61 });
});
