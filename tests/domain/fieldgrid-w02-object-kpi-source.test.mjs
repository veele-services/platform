import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actions = readFileSync(
  "artifacts/backoffice/src/app/actions/objects.ts",
  "utf8",
);
const listPage = readFileSync(
  "artifacts/backoffice/src/app/(dashboard)/objects/page.tsx",
  "utf8",
);
const detailPage = readFileSync(
  "artifacts/backoffice/src/app/(dashboard)/objects/[id]/page.tsx",
  "utf8",
);

test("visible object KPI labels map to semantic result fields", () => {
  for (const field of [
    "totalObjects",
    "activeAssignments",
    "distinctServiceTypes",
    "inactiveObjects",
    "objectDocuments",
  ]) {
    assert.match(actions, new RegExp(`${field}:`, "u"), field);
    assert.match(listPage, new RegExp(`stats\\.${field}`, "u"), field);
  }
  assert.doesNotMatch(
    actions,
    /\b(?:periodicTasks|openAlerts|contracts):/u,
  );
});

test("object metrics do not attribute customer-wide tickets", () => {
  assert.doesNotMatch(actions, /customerMessageThreadsTable/u);
  assert.doesNotMatch(actions, /Klantbreed ticket/u);
  assert.match(actions, /eq\(documentsTable\.entityType, "object"\)/u);
  assert.match(actions, /eq\(documentsTable\.entityId, objectId\)/u);
});

test("object performance uses actual completion and avoids doubled actions", () => {
  assert.match(actions, /assignmentsTable\.actualCompletedAt/u);
  assert.match(actions, /openActions: assignments\?\.openActions \?\? 0/u);
  assert.match(actions, /'en_route'/u);
});

test("object tabs and cross-domain loaders fail closed by permission", () => {
  assert.match(actions, /hasPermission\("assignments", "read"\)/u);
  assert.match(actions, /hasPermission\("reports", "read"\)/u);
  assert.match(actions, /hasPermission\("documents", "read"\)/u);
  assert.match(detailPage, /const visibleTabs = OBJECT_TAB_KEYS\.filter/u);
  assert.match(detailPage, /visibleTabs\.map/u);
  assert.doesNotMatch(
    detailPage,
    /<ForbiddenPage resource="(?:materials|inventory)"/u,
  );
});
