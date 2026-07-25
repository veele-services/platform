import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  filterPlanboardAssignments,
  filterPlanboardPersonnel,
  type PlanboardFilterableAssignment,
  type PlanboardFilterablePersonnel,
} from "../../artifacts/backoffice/src/components/assignments/planboard-filters";

const root = fileURLToPath(new URL("../../", import.meta.url));
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const personnel: PlanboardFilterablePersonnel[] = Array.from(
  { length: 250 },
  (_, index) => ({
    id: `person-${index}`,
    roleId: `role-${index % 12}`,
    roleName: `Vakrol ${index % 12}`,
    sectorId: `sector-${index % 8}`,
    sectorName: `Sector ${index % 8}`,
    personnelType: index % 4 === 0 ? "flex" : "employee",
    scheduledAssignments: Array.from(
      { length: index % 9 },
      (__, assignmentIndex) => ({
        id: `person-${index}-assignment-${assignmentIndex}`,
      }),
    ),
  }),
);

const assignments: PlanboardFilterableAssignment[] = Array.from(
  { length: 2_000 },
  (_, index) => {
    const requiredSlots = (index % 4) + 1;
    const filledSlots = index % (requiredSlots + 1);
    return {
      id: `assignment-${index}`,
      status: index % 3 === 0 ? "scheduled" : "plannable",
      sectorId: `sector-${index % 8}`,
      sectorName: `Sector ${index % 8}`,
      scheduledDate: index % 3 === 0 ? "2026-07-25" : null,
      scheduledStart: index % 3 === 0 ? "09:00" : null,
      scheduledEnd: index % 3 === 0 ? "10:30" : null,
      assignedPersonnelIds: Array.from(
        { length: filledSlots },
        (__, personnelIndex) =>
          `person-${(index + personnelIndex) % personnel.length}`,
      ),
      requiredSlots,
      requiredPersonnelCount: requiredSlots,
      filledSlots,
      interestedPersonnelIds:
        index % 5 === 0 ? [`person-${index % personnel.length}`] : [],
    };
  },
);

test("realistic large planboard fixtures stay within a deterministic local budget", () => {
  const startedAt = performance.now();
  let assignmentMatches = 0;
  let personnelMatches = 0;

  for (let iteration = 0; iteration < 20; iteration += 1) {
    assignmentMatches += filterPlanboardAssignments(assignments, {
      sector: `sector-${iteration % 8}`,
      status: iteration % 2 === 0 ? "scheduled" : "plannable",
      team: iteration % 2 === 0 ? "team" : "understaffed",
      interest: iteration % 3 === 0 ? "has_interest" : "all",
    }).length;
    personnelMatches += filterPlanboardPersonnel(personnel, {
      sector: `sector-${iteration % 8}`,
      type: iteration % 2 === 0 ? "employee" : "flex",
    }).length;
  }

  const durationMs = performance.now() - startedAt;
  assert.ok(assignmentMatches > 0);
  assert.ok(personnelMatches > 0);
  assert.ok(
    durationMs < 2_000,
    `large fixture filtering exceeded 2000 ms: ${durationMs.toFixed(2)} ms`,
  );
  process.stdout.write(
    `W14 planboard fixture: 2,000 assignments, 250 personnel, 20 passes in ${durationMs.toFixed(2)} ms\n`,
  );
});

test("minute ticker updates client state without a write or route refresh", () => {
  const source = readSource(
    "artifacts/backoffice/src/components/assignments/PlanningBoardView.tsx",
  );
  const ticker = source.match(
    /useEffect\(\(\) => \{[\s\S]*?setInterval\(updateClock, 60_000\)[\s\S]*?\}, \[\]\);/u,
  )?.[0];

  assert.ok(ticker, "minute ticker effect not found");
  assert.match(ticker, /setClockNow\(Date\.now\(\)\)/u);
  assert.doesNotMatch(
    ticker,
    /\b(?:fetch|router\.(?:refresh|push|replace)|startTransition|scheduleOnBoard)\b/u,
  );
});

test("heavy dossier loaders remain gated by their active route tab", () => {
  const customerPage = readSource(
    "artifacts/backoffice/src/app/(dashboard)/customers/[id]/page.tsx",
  );
  const assignmentPage = readSource(
    "artifacts/backoffice/src/app/(dashboard)/assignments/[id]/page.tsx",
  );

  for (const loader of [
    "listObjectsForCustomer",
    "listAssignmentsForCustomer",
    "listInvoicesForCustomer",
    "listReportsForCustomer",
  ]) {
    assert.match(
      customerPage,
      new RegExp(`activeTab === "[^"]+"[\\s\\S]*?${loader}`, "u"),
      loader,
    );
  }
  for (const loader of [
    "listDocuments",
    "getReportForAssignment",
    "getInvoiceForAssignment",
    "getQuoteForAssignment",
    "getAssignmentPlanningReadiness",
  ]) {
    assert.match(
      assignmentPage,
      new RegExp(`activeTab === "[^"]+"[\\s\\S]*?${loader}`, "u"),
      loader,
    );
  }
});
