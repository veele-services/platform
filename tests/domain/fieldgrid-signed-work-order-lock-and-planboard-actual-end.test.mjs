import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  formatPlanboardActualTime,
  planboardDateKey,
  planboardMinuteOfDay,
  planboardRelativeTimestampMinute,
  planboardTimestampMinute,
} from "../../artifacts/backoffice/src/components/assignments/planboard-assignment-states.ts";

const read = (path) => readFileSync(path, "utf8");

const lockHelper = read("artifacts/personeel-pwa/src/lib/work-order-lock.ts");
const assignmentActions = read(
  "artifacts/personeel-pwa/src/actions/assignments.ts",
);
const reportActions = read("artifacts/personeel-pwa/src/actions/reports.ts");
const extraWorkActions = read(
  "artifacts/personeel-pwa/src/actions/extra-work.ts",
);
const materialActions = read(
  "artifacts/personeel-pwa/src/actions/materials.ts",
);
const inventoryActions = read(
  "artifacts/personeel-pwa/src/actions/inventory.ts",
);
const workOrderPage = read(
  "artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/page.tsx",
);
const workOrderSections = read(
  "artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderSections.tsx",
);
const materialPage = read(
  "artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/materiaal/page.tsx",
);
const inventoryPage = read(
  "artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/inventaris/page.tsx",
);
const extraWorkPage = read(
  "artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/meerwerk/page.tsx",
);
const planningAction = read("artifacts/backoffice/src/app/actions/planning.ts");
const planningBoard = read(
  "artifacts/backoffice/src/components/assignments/PlanningBoardView.tsx",
);
const planboardStates = read(
  "artifacts/backoffice/src/components/assignments/planboard-assignment-states.ts",
);

function functionBody(source, name, nextName) {
  const start = source.indexOf(name);
  assert.ok(start >= 0, `${name} is missing`);
  const end = nextName
    ? source.indexOf(nextName, start + name.length)
    : source.length;
  return source.slice(start, end >= 0 ? end : source.length);
}

test("a customer signature is the canonical personnel work-order lock", () => {
  assert.match(
    lockHelper,
    /assignment\.customerSignedAt[\s\S]*assignment\.customerSignatureDataUrl\?\.trim\(\)/u,
  );
  assert.match(lockHelper, /kan niet meer worden gewijzigd/u);
  assert.match(
    assignmentActions,
    /customerSignedAt:\s+assignmentsTable\.customerSignedAt/u,
  );
  assert.match(
    assignmentActions,
    /customerSignatureDataUrl:\s+assignmentsTable\.customerSignatureDataUrl/u,
  );

  const guardedActions = [
    [
      "async function setAssignmentStatusInternal",
      "export async function startAssignment",
    ],
    [
      "async function setAssignmentTaskCompletionInternal",
      "export async function completeAssignment",
    ],
    [
      "async function completeAssignmentInternal",
      "export async function notCompleteAssignment",
    ],
    ["async function notCompleteAssignmentInternal", "export async function"],
  ];
  for (const [name, nextName] of guardedActions) {
    assert.match(
      functionBody(assignmentActions, name, nextName),
      /personnelWorkOrderIsSigned\(current\)/u,
      name,
    );
  }
});

test("reporting and all personnel work-order registration paths reject signed work orders", () => {
  for (const [name, nextName] of [
    [
      "export async function prepareReportNoteAttachmentUploads",
      "export async function getMyReportForAssignment",
    ],
    [
      "async function addReportNoteInternal",
      "export async function submitMyReport",
    ],
    ["export async function submitMyReport", null],
  ]) {
    assert.match(
      functionBody(reportActions, name, nextName),
      /personnelWorkOrderIsSigned\(assignment\)/u,
      name,
    );
  }
  assert.match(reportActions, /isNull\(assignmentsTable\.customerSignedAt\)/u);
  assert.match(
    reportActions,
    /isNull\(assignmentsTable\.customerSignatureDataUrl\)/u,
  );
  assert.match(
    extraWorkActions,
    /!personnelWorkOrderIsSigned\(row\) && !LOCKED_STATUSES\.has\(row\.status\)/u,
  );
  assert.match(materialActions, /personnelWorkOrderIsSigned\(assignment\)/u);
  assert.match(inventoryActions, /personnelWorkOrderIsSigned\(assignment\)/u);
});

test("signed work orders render reporting, checklist, material, inventory and extra work as read-only", () => {
  assert.match(
    workOrderPage,
    /!personnelWorkOrderIsSigned\(assignment\)[\s\S]*canAddReportNote/u,
  );
  assert.match(
    workOrderSections,
    /const isLocked = personnelWorkOrderIsSigned\(assignment\)/u,
  );
  assert.match(workOrderSections, /const disabled = isLocked \|\|/u);
  for (const page of [materialPage, inventoryPage, extraWorkPage]) {
    assert.match(
      page,
      /const canEdit = !personnelWorkOrderIsSigned\(assignment\)/u,
    );
  }
});

test("planboard cards use persisted actual timestamps and stop at the actual completion time", () => {
  assert.match(
    planningAction,
    /actualStartedAt:\s*row\.actualStartedAt\?\.toISOString\(\) \?\? null/u,
  );
  assert.match(
    planningAction,
    /actualCompletedAt:\s*row\.actualCompletedAt\?\.toISOString\(\) \?\? null/u,
  );
  assert.match(
    planboardStates,
    /formatPlanboardActualTime\(input\.actualStartedAt\)/u,
  );
  assert.match(planboardStates, /PLANBOARD_TIME_ZONE\s*=\s*"Europe\/Amsterdam"/u);
  assert.match(
    planningBoard,
    /const block =\s*actualBlock\s*\?\?\s*effectiveBlock\s*\?\?\s*plannedBlock/u,
  );
  assert.doesNotMatch(planningBoard, /unionTimeBlocks/u);
});

test("planboard actual timestamps use Europe/Amsterdam for labels, dates and timeline positions", () => {
  const summerTimestamp = "2026-07-21T15:30:00.000Z";
  assert.equal(formatPlanboardActualTime(summerTimestamp), "17:30");
  assert.equal(planboardDateKey(summerTimestamp), "2026-07-21");
  assert.equal(planboardMinuteOfDay(summerTimestamp), 17 * 60 + 30);
  assert.equal(planboardTimestampMinute(summerTimestamp, "2026-07-21"), 17 * 60 + 30);

  const afterMidnightInAmsterdam = "2026-07-21T22:15:00.000Z";
  assert.equal(planboardDateKey(afterMidnightInAmsterdam), "2026-07-22");
  assert.equal(planboardTimestampMinute(afterMidnightInAmsterdam, "2026-07-21"), null);
  assert.equal(planboardTimestampMinute(afterMidnightInAmsterdam, "2026-07-22"), 15);
  assert.equal(
    planboardRelativeTimestampMinute(
      afterMidnightInAmsterdam,
      "2026-07-21",
    ),
    24 * 60 + 15,
  );
  assert.equal(
    planboardRelativeTimestampMinute(
      "2026-07-20T21:15:00.000Z",
      "2026-07-21",
    ),
    -45,
  );
  assert.equal(
    planboardRelativeTimestampMinute(
      "2026-10-25T22:30:00.000Z",
      "2026-10-25",
    ),
    23 * 60 + 30,
  );
  assert.match(
    planningBoard,
    /planboardRelativeTimestampMinute\(\s*assignment\.actualCompletedAt/u,
  );
  assert.match(
    planningBoard,
    /assignment\.isRunning\s*\?\s*liveRelativeMinute/u,
  );
});
