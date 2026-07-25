import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OBJECT_ACTIVE_ASSIGNMENT_STATUSES,
  OBJECT_COMPLETED_ASSIGNMENT_STATUSES,
  OBJECT_OPEN_ACTION_ASSIGNMENT_STATUSES,
  isObjectActiveAssignmentStatus,
} from "../../lib/db/src/object-metrics";
import {
  ASSIGNMENT_STATUSES,
  type AssignmentStatus,
} from "../../lib/db/src/schema";

test("object active assignments follow one explicit lifecycle definition", () => {
  assert.deepEqual(OBJECT_ACTIVE_ASSIGNMENT_STATUSES, [
    "approved",
    "plannable",
    "scheduled",
    "seen",
    "en_route",
    "in_progress",
  ]);
  for (const status of ASSIGNMENT_STATUSES) {
    assert.equal(
      isObjectActiveAssignmentStatus(status),
      OBJECT_ACTIVE_ASSIGNMENT_STATUSES.includes(
        status as (typeof OBJECT_ACTIVE_ASSIGNMENT_STATUSES)[number],
      ),
      status,
    );
  }
});

test("completed and open-action sets are disjoint and canonical", () => {
  const completed = new Set<AssignmentStatus>(
    OBJECT_COMPLETED_ASSIGNMENT_STATUSES,
  );
  const openActions = new Set<AssignmentStatus>(
    OBJECT_OPEN_ACTION_ASSIGNMENT_STATUSES,
  );
  for (const status of completed) {
    if (status !== "report_submitted") {
      assert.equal(openActions.has(status), false, status);
    }
  }
  assert.equal(openActions.has("report_submitted"), true);
  assert.equal(completed.has("report_submitted"), true);
  assert.equal(
    [...completed].filter((status) => openActions.has(status)).length,
    1,
    "report_submitted is completed work but still one review action",
  );
});
