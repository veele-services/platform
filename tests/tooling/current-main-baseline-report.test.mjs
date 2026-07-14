import test from "node:test";
import assert from "node:assert/strict";
import {
  loadBaselineReport,
  renderMarkdown,
  validateBaselineReport,
} from "../../scripts/fieldgrid-current-main-baseline-report.mjs";

test("current main baseline report remains compact and internally consistent", () => {
  const report = loadBaselineReport();

  assert.deepEqual(validateBaselineReport(report), []);
  assert.equal(report.rootSuite.total, 759);
  assert.equal(report.rootSuite.passed, 745);
  assert.equal(report.rootSuite.failed, 14);
  assert.equal(report.rootSuite.skipped, 0);
  assert.equal(report.rootSuite.flaky, 0);
  assert.equal(report.baselineDifferential.candidateOnlyFailures, 0);
  assert.equal(report.baselineDifferential.permanentFailureAllowlistAdded, false);
  assert.ok(report.localExecutionConstraints.every((lane) => lane.status === "blocked"));
});

test("current main baseline markdown separates local blocks from CI evidence", () => {
  const markdown = renderMarkdown(loadBaselineReport());

  assert.match(markdown, /## Local execution constraints/u);
  assert.match(markdown, /## GitHub Actions evidence/u);
  assert.match(markdown, /Full command logs belong in GitHub Actions artifacts, not source control\./u);
  assert.doesNotMatch(markdown, /outputs\/current-main-baseline-2026-07-14/u);
});
