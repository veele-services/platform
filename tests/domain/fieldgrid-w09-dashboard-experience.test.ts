import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveRecentContext,
  mergeRecentContexts,
  parseRecentContexts,
} from "../../artifacts/backoffice/src/lib/navigation/recent-context";

const visitedAt = new Date("2026-07-25T12:00:00.000Z");

test("recent work context stores generic labels without entity content", () => {
  assert.deepEqual(
    deriveRecentContext(
      "/assignments/assignment_123",
      new URLSearchParams("tab=rapport&note=secret"),
      visitedAt,
    ),
    {
      kind: "assignment",
      href: "/assignments/assignment_123",
      label: "Opdracht opnieuw openen",
      detail: "Ga verder in het laatst bekeken opdrachtdossier.",
      visitedAt: "2026-07-25T12:00:00.000Z",
    },
  );
});

test("planning context keeps only bounded view parameters", () => {
  assert.equal(
    deriveRecentContext(
      "/planning",
      new URLSearchParams(
        "day=2026-07-25&view=week&search=Klantnaam&token=secret",
      ),
      visitedAt,
    )?.href,
    "/planning?day=2026-07-25&view=week",
  );
});

test("recent contexts reject unsafe routes and keep one item per kind", () => {
  assert.equal(
    deriveRecentContext("/customers/new", new URLSearchParams(), visitedAt),
    null,
  );
  assert.deepEqual(parseRecentContexts("{broken"), []);

  const first = deriveRecentContext(
    "/objects/object_123",
    new URLSearchParams(),
    visitedAt,
  );
  const next = deriveRecentContext(
    "/objects/object_456",
    new URLSearchParams(),
    new Date("2026-07-25T13:00:00.000Z"),
  );
  assert.ok(first);
  assert.ok(next);
  assert.deepEqual(mergeRecentContexts([first], next), [next]);
});
