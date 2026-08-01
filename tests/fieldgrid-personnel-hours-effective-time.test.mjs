import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("personnel weekly hours use the canonical actual-first interval without overwriting planned time", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/hours.ts");

  assert.match(actions, /resolveAssignmentEffectiveInterval/u);
  assert.match(
    actions,
    /actualStartedAt:\s*assignmentParticipantExecutionsTable\.actualStartedAt/u,
  );
  assert.match(
    actions,
    /actualCompletedAt:\s*assignmentParticipantExecutionsTable\.actualCompletedAt/u,
  );
  assert.match(
    actions,
    /participantStatus:\s*assignmentParticipantExecutionsTable\.participantStatus/u,
  );
  const executionJoinStart = actions.indexOf(
    ".leftJoin(\n      assignmentParticipantExecutionsTable",
  );
  const objectJoinStart = actions.indexOf(
    ".leftJoin(objectsTable",
    executionJoinStart,
  );
  assert.notEqual(executionJoinStart, -1);
  assert.ok(objectJoinStart > executionJoinStart);
  const executionJoin = actions.slice(executionJoinStart, objectJoinStart);
  for (const binding of [
    "reportsTable.assignmentParticipantExecutionId",
    "assignmentParticipantExecutionsTable.id",
    "assignmentParticipantExecutionsTable.tenantId",
    "identity.tenantId",
    "assignmentParticipantExecutionsTable.assignmentId",
    "reportsTable.assignmentId",
    "assignmentParticipantExecutionsTable.personnelId",
    "identity.personnelId",
  ]) {
    assert.ok(
      executionJoin.includes(binding),
      `missing execution binding ${binding}`,
    );
  }
  assert.match(actions, /eq\(reportsTable\.tenantId,\s*identity\.tenantId\)/u);
  assert.match(
    actions,
    /resolveAssignmentEffectiveInterval\(\{[\s\S]*scheduledDate:\s*row\.scheduledDate[\s\S]*scheduledStart:\s*row\.scheduledStart[\s\S]*scheduledEnd:\s*row\.scheduledEnd[\s\S]*actualStartedAt:\s*row\.actualStartedAt[\s\S]*actualCompletedAt:\s*row\.actualCompletedAt[\s\S]*status:\s*row\.participantStatus/u,
  );
  assert.doesNotMatch(
    actions,
    /actualStartedAt:\s*assignmentsTable\.actualStartedAt/u,
  );
  assert.doesNotMatch(
    actions,
    /actualCompletedAt:\s*assignmentsTable\.actualCompletedAt/u,
  );
  assert.match(actions, /effectiveStart:\s*interval\.effectiveStart/u);
  assert.match(actions, /effectiveEnd:\s*interval\.effectiveEnd/u);
  assert.match(actions, /timeSource:\s*interval\.source/u);
  assert.match(
    actions,
    /timeSource:\s*"planned"\s*\|\s*"partly_actual"\s*\|\s*"actual"/u,
  );
});

test("personnel hours UI labels planned, partly actual and actual intervals explicitly", () => {
  const page = read("artifacts/personeel-pwa/src/app/(app)/uren/page.tsx");

  assert.match(page, /entry\.timeSource === "planned"/u);
  assert.match(page, /entry\.timeSource === "actual"/u);
  assert.match(page, /"Gepland "/u);
  assert.match(page, /"Werkelijk "/u);
  assert.match(page, /"Deels werkelijk "/u);
  assert.match(
    page,
    /formatTimeRange\(\s*entry\.effectiveStart,\s*entry\.effectiveEnd/u,
  );
});
