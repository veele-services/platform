import assert from "node:assert/strict";
import test from "node:test";

import {
  createUxAnalyticsEvent,
  type UxAnalyticsEventInput,
} from "../../artifacts/backoffice/src/lib/ux-analytics";

test("UX events contain only bounded dimensions and schema metadata", () => {
  const event = createUxAnalyticsEvent(
    {
      name: "search_submitted",
      surface: "objects",
      scope: "current_context",
      activeFilterCount: 1_000,
    },
    new Date("2026-07-25T12:00:00.000Z"),
  );

  assert.deepEqual(event, {
    name: "search_submitted",
    surface: "objects",
    scope: "current_context",
    activeFilterCount: 99,
    schemaVersion: 1,
    occurredAt: "2026-07-25T12:00:00.000Z",
  });
});

test("event schema has no field capable of carrying product content or identity", () => {
  const examples: UxAnalyticsEventInput[] = [
    {
      name: "filter_changed",
      surface: "customers",
      action: "applied",
      activeFilterCount: 3,
    },
    {
      name: "form_progress",
      surface: "assignments",
      form: "assignment",
      action: "completed",
    },
    {
      name: "mutation_error",
      surface: "platform",
      category: "permission",
    },
    {
      name: "command_palette",
      surface: "navigation",
      action: "scoped_search_selected",
      scope: "tenant",
    },
  ];

  const forbiddenKeys = new Set([
    "query",
    "email",
    "fullName",
    "address",
    "note",
    "signature",
    "token",
    "secret",
    "userId",
    "tenantId",
    "entityId",
  ]);
  for (const event of examples) {
    for (const key of Object.keys(event)) {
      assert.equal(forbiddenKeys.has(key), false, `${event.name}:${key}`);
    }
  }
});
