import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FIELDGRID_CRITICAL_WORKFLOWS } from "../../e2e/fieldgrid/workflow-manifest.mjs";
import { validateWorkflowManifest } from "../../scripts/fieldgrid-workflow-bot-coverage.mjs";

test("every manifest-listed workflow has an executable evidence marker", () => {
  const summary = validateWorkflowManifest();
  assert.equal(summary.workflows, FIELDGRID_CRITICAL_WORKFLOWS.length);
  assert.ok(summary.mutations >= 20);
  assert.deepEqual(summary.surfaces, ["backoffice", "customer-pwa", "personnel-pwa"]);
});

test("the manifest does not claim report writes from read-only evidence", () => {
  const reportVisibility = FIELDGRID_CRITICAL_WORKFLOWS.find(({ id }) => id === "report-visibility");
  assert.deepEqual(reportVisibility?.mutations, ["report.read-approved"]);
  assert.deepEqual(reportVisibility?.surfaces, ["customer-pwa"]);
  assert.deepEqual(reportVisibility?.actors, ["customer"]);
});

test("the mutating workflow runs as an isolated Playwright phase", () => {
  const runner = readFileSync("e2e/fieldgrid/run-playwright.mjs", "utf8");
  assert.match(runner, /name: 'workflow-bot'/u);
  assert.match(runner, /workflow-bot\.spec\.ts/u);
  assert.match(runner, /FIELDGRID_WORKFLOW_RUN_ID/u);
  assert.match(runner, /GITHUB_RUN_ID/u);
  assert.match(runner, /GITHUB_RUN_ATTEMPT/u);
  assert.match(runner, /randomUUID\(\)/u);
  const workflow = readFileSync("e2e/fieldgrid/tests/workflow-bot.spec.ts", "utf8");
  assert.doesNotMatch(workflow, /Date\.now\(\)/u);
  assert.match(workflow, /response\?\.status\(\)\)\.toBe\(200\)/u);
  assert.match(workflow, /Runtime Customer B/u);
});

test("missing workflow evidence fails closed", () => {
  const broken = [{ ...FIELDGRID_CRITICAL_WORKFLOWS[0], evidenceMarker: "marker-does-not-exist" }];
  assert.throws(() => validateWorkflowManifest(broken), /mist bewijsmarker/u);
});

test("floating Radix controls remain interactive above modal sheets", () => {
  const tokens = readFileSync("lib/shared-ui/src/styles.css", "utf8");
  const modal = Number(/--z-modal:\s*(\d+)/u.exec(tokens)?.[1]);
  const floating = Number(/--z-floating:\s*(\d+)/u.exec(tokens)?.[1]);
  assert.ok(floating > modal);
  for (const file of [
    "artifacts/backoffice/src/components/ui/popover.tsx",
    "artifacts/backoffice/src/components/ui/select.tsx",
    "artifacts/backoffice/src/components/ui/dropdown-menu.tsx",
  ]) {
    assert.match(readFileSync(file, "utf8"), /z-\[var\(--z-floating\)\]/u);
  }
});
