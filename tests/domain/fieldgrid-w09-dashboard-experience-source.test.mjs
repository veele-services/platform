import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const dashboard = read("artifacts/backoffice/src/app/(dashboard)/page.tsx");
const layout = read("artifacts/backoffice/src/app/(dashboard)/layout.tsx");
const experience = read(
  "artifacts/backoffice/src/components/dashboard/DashboardExperience.tsx",
);
const recentContext = read(
  "artifacts/backoffice/src/lib/navigation/recent-context.ts",
);

test("dashboard keeps permitted panels visible while persisting persona order", () => {
  assert.match(dashboard, /<DashboardPersonaFocus/u);
  assert.match(dashboard, /defaultPersona=\{defaultPersona\}/u);
  assert.match(experience, /fieldgrid:dashboard-persona/u);
  assert.match(experience, /<ToggleGroup/u);
  assert.match(experience, /planner: planning/u);
  assert.match(experience, /administration/u);
  assert.match(experience, /management/u);
  assert.match(experience, /all: "Alles"/u);
});

test("dashboard exposes owned urgent actions and resumable context", () => {
  assert.match(dashboard, /Eigenaar: \{item\.owner\}/u);
  assert.match(dashboard, /Urgentie: \{item\.urgency\}/u);
  assert.match(dashboard, /Doorgaan waar ik was/u);
  assert.match(dashboard, /<DashboardResumePanel/u);
  assert.match(layout, /<RecentContextTracker \/>/u);
  assert.match(layout, /principalId=\{user\.id\}/u);
  assert.match(experience, /filterRecentContextsForPermissions/u);
  assert.match(experience, /recentContextStorageKey/u);
});

test("recent context stores no query contents or entity display values", () => {
  assert.match(recentContext, /planningHref/u);
  assert.match(
    recentContext,
    /for \(const key of \["day", "date", "view"\]\)/u,
  );
  assert.doesNotMatch(
    recentContext,
    /customerName|assignmentTitle|objectName|email|notes|signature|token/u,
  );
});
