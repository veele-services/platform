import assert from "node:assert/strict";
import test from "node:test";

import {
  compareFailureSets,
  extractFailureNames,
  normalizeFailureName,
  shouldFetchOriginMain,
} from "../scripts/fieldgrid-test-baseline-differential.mjs";

test("candidate with the same baseline failures is differential pass", () => {
  const comparison = compareFailureSets(
    ["tenant isolation rejects cross-tenant reads", "notification contract rejects missing role"],
    ["notification contract rejects missing role", "tenant isolation rejects cross-tenant reads"],
  );

  assert.equal(comparison.pass, true);
  assert.equal(comparison.counts.mainFailures, 2);
  assert.equal(comparison.counts.candidateFailures, 2);
  assert.deepEqual(comparison.candidateOnlyFailures, []);
});

test("one candidate-only failure is differential fail", () => {
  const comparison = compareFailureSets(["baseline failure"], ["baseline failure", "new regression"]);

  assert.equal(comparison.pass, false);
  assert.deepEqual(comparison.candidateOnlyFailures, ["new regression"]);
  assert.match(comparison.reasons.join("\n"), /candidate-only/);
});

test("candidate with more failures than main is fail", () => {
  const comparison = compareFailureSets(["baseline failure"], ["baseline failure", "additional failure"]);

  assert.equal(comparison.pass, false);
  assert.equal(comparison.counts.candidateFailures, 2);
  assert.equal(comparison.counts.mainFailures, 1);
  assert.match(comparison.reasons.join("\n"), /more failures/);
});

test("normalized failure extraction is stable", () => {
  const log = [
    "2026-07-13T12:00:00.000Z ✖ tenant isolation rejects cross-tenant reads (12.34ms)",
    "✖ tenant isolation rejects cross-tenant reads (10ms)",
    "✖ failing tests:",
    "not ok 14 - notification contract rejects missing role # time=3.2ms",
    "\u001b[31m✖ Windows path C:\\repo\\tests\\sample.test.mjs (1ms)\u001b[0m",
  ].join("\n");

  assert.equal(normalizeFailureName("✖ sample failure (1.5ms)"), "sample failure");
  assert.deepEqual(extractFailureNames(log), [
    "notification contract rejects missing role",
    "tenant isolation rejects cross-tenant reads",
    "Windows path C:/repo/tests/sample.test.mjs",
  ]);
});

test("checkout-provided main mode is explicit and fail-closed", () => {
  assert.equal(shouldFetchOriginMain({}), true);
  assert.equal(shouldFetchOriginMain({ FIELDGRID_BASELINE_DIFF_USE_CHECKOUT_MAIN: "0" }), true);
  assert.equal(shouldFetchOriginMain({ FIELDGRID_BASELINE_DIFF_USE_CHECKOUT_MAIN: "1" }), false);
  assert.throws(
    () => shouldFetchOriginMain({ FIELDGRID_BASELINE_DIFF_USE_CHECKOUT_MAIN: "yes" }),
    /must be 0 or 1/u,
  );
});
