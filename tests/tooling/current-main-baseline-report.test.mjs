import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  loadBaselineReport,
  renderMarkdown,
  validateBaselineReport,
} from "../../scripts/fieldgrid-current-main-baseline-report.mjs";

const reportText = readFileSync(new URL("../../docs/testing/current-main-baseline-2026-07-14.json", import.meta.url), "utf8");

function assertNoPendingOrNullRunFields(value) {
  const serialized = JSON.stringify(value);
  const stalePendingMarker = ["pending", "run", "id", "update", "after", "push"].join("-");
  const runtimeRunField = ["runtime", "Safety", "Run"].join("");
  const healthRunField = ["health", "Gate", "Run"].join("");
  assert.equal(serialized.includes(stalePendingMarker), false);
  assert.equal(Object.hasOwn(value.githubActionsEvidence, runtimeRunField), false);
  assert.equal(Object.hasOwn(value.githubActionsEvidence, healthRunField), false);
}

test("current main baseline report preserves verified totals and failure semantics", () => {
  const report = loadBaselineReport();

  assert.deepEqual(validateBaselineReport(report), []);
  assert.equal(report.rootSuite.total, 759);
  assert.equal(report.rootSuite.passed, 745);
  assert.equal(report.rootSuite.failed, 14);
  assert.equal(report.rootSuite.skipped, 0);
  assert.equal(report.rootSuite.flaky, 0);
  assert.equal(report.baselineDifferential.candidateOnlyFailures, 0);
  assert.equal(report.baselineDifferential.permanentFailureAllowlistAdded, false);
  assert.equal(report.failures.length, 14);
});

test("current main baseline uses a durable GitHub Actions evidence contract", () => {
  const report = loadBaselineReport();

  assertNoPendingOrNullRunFields(report);
  assert.equal(report.githubActionsEvidence.status, "required-on-reviewed-head");
  assert.equal(report.githubActionsEvidence.source, "GitHub pull-request checks for the reviewed head");
  assert.deepEqual(report.githubActionsEvidence.requiredWorkflows, [
    "Runtime Safety Harness",
    "Fieldgrid Deploy Health Gate",
  ]);
  assert.deepEqual(report.githubActionsEvidence.requiredLanes, [
    "build",
    "PostgreSQL migration smoke",
    "Tenant A/B DB integration",
    "RLS security",
    "previous-release compatibility",
    "API runtime",
    "typecheck",
    "health gate",
  ]);
});

test("current main baseline keeps local blocks separate from CI evidence", () => {
  const report = loadBaselineReport();

  assert.equal(Object.hasOwn(report.baselineDifferential, "environmentBlocks"), false);
  assert.equal(report.localExecutionConstraints.length, 3);
  assert.ok(report.localExecutionConstraints.every((lane) => lane.status === "blocked"));
  assert.equal(report.githubActionsEvidence.requiredWorkflows.length, 2);
  assert.equal(report.githubActionsEvidence.requiredLanes.length, 8);
});

test("current main baseline does not commit raw output paths or placeholders", () => {
  const report = loadBaselineReport();
  const markdown = renderMarkdown(report);

  const rawOutputPath = ["outputs", "current-main-baseline-2026-07-14"].join("/");
  const stalePendingMarker = ["pending", "run", "id", "update", "after", "push"].join("-");
  assert.equal(reportText.includes(rawOutputPath), false);
  assert.equal(markdown.includes(rawOutputPath), false);
  assert.equal(markdown.includes(stalePendingMarker), false);
  assertNoPendingOrNullRunFields(report);
});

test("current main baseline markdown is generated from JSON and remains consistent", () => {
  const report = loadBaselineReport();
  const markdown = renderMarkdown(report);

  assert.match(markdown, /## Local execution constraints/u);
  assert.match(markdown, /## GitHub Actions evidence contract/u);
  assert.match(markdown, /Local execution constraints are separate from product failures/u);
  assert.match(markdown, /Runtime Safety Harness/u);
  assert.match(markdown, /Fieldgrid Deploy Health Gate/u);
  assert.match(markdown, /Concrete workflow run IDs belong in the PR body or review evidence/u);
  assert.match(markdown, new RegExp(`Total: ${report.rootSuite.total}`, "u"));
  assert.match(markdown, new RegExp(`Candidate-only failures: ${report.baselineDifferential.candidateOnlyFailures}`, "u"));
});
