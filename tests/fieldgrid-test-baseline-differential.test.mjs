import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  compareFailureSets,
  compareTestCoverage,
  extractFailureNames,
  extractTestRunSummary,
  normalizeFailureName,
  shouldFetchOriginMain,
  shouldInstallCandidate,
} from "../scripts/fieldgrid-test-baseline-differential.mjs";

const differentialSource = readFileSync(
  new URL(
    "../scripts/fieldgrid-test-baseline-differential.mjs",
    import.meta.url,
  ),
  "utf8",
);

test("candidate with the same baseline failures is differential pass", () => {
  const comparison = compareFailureSets(
    [
      "tenant isolation rejects cross-tenant reads",
      "notification contract rejects missing role",
    ],
    [
      "notification contract rejects missing role",
      "tenant isolation rejects cross-tenant reads",
    ],
  );

  assert.equal(comparison.pass, true);
  assert.equal(comparison.counts.mainFailures, 2);
  assert.equal(comparison.counts.candidateFailures, 2);
  assert.deepEqual(comparison.candidateOnlyFailures, []);
});

test("one candidate-only failure is differential fail", () => {
  const comparison = compareFailureSets(
    ["baseline failure"],
    ["baseline failure", "new regression"],
  );

  assert.equal(comparison.pass, false);
  assert.deepEqual(comparison.candidateOnlyFailures, ["new regression"]);
  assert.match(comparison.reasons.join("\n"), /candidate-only/);
});

test("candidate with more failures than main is fail", () => {
  const comparison = compareFailureSets(
    ["baseline failure"],
    ["baseline failure", "additional failure"],
  );

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

  assert.equal(
    normalizeFailureName("✖ sample failure (1.5ms)"),
    "sample failure",
  );
  assert.deepEqual(extractFailureNames(log), [
    "notification contract rejects missing role",
    "tenant isolation rejects cross-tenant reads",
    "Windows path C:/repo/tests/sample.test.mjs",
  ]);
});

test("test run summaries preserve executed, skipped and total coverage", () => {
  assert.deepEqual(
    extractTestRunSummary(
      [
        "ℹ tests 1007",
        "ℹ pass 1001",
        "ℹ fail 0",
        "ℹ cancelled 0",
        "ℹ skipped 6",
        "ℹ todo 0",
      ].join("\n"),
    ),
    {
      valid: true,
      tests: 1007,
      pass: 1001,
      fail: 0,
      cancelled: 0,
      skipped: 6,
      todo: 0,
      executedTests: 1001,
    },
  );
  assert.equal(extractTestRunSummary("no TAP summary").valid, false);
  assert.equal(
    extractTestRunSummary(
      [
        "# tests 10",
        "# pass 10",
        "# fail 0",
        "# cancelled 0",
        "# skipped 1",
      ].join("\n"),
    ).valid,
    false,
  );
  assert.equal(
    extractTestRunSummary(
      [
        "# tests 10",
        "# tests 10",
        "# pass 10",
        "# fail 0",
        "# cancelled 0",
        "# skipped 0",
        "# todo 0",
      ].join("\n"),
    ).valid,
    false,
  );
});

test("candidate cannot pass by executing fewer tests or dropping a root test file", () => {
  const comparison = compareTestCoverage(
    {
      valid: true,
      tests: 100,
      pass: 98,
      fail: 0,
      cancelled: 0,
      skipped: 2,
      todo: 0,
      executedTests: 98,
    },
    {
      valid: true,
      tests: 99,
      pass: 97,
      fail: 0,
      cancelled: 0,
      skipped: 2,
      todo: 0,
      executedTests: 97,
    },
    ["tests/a.test.mjs", "tests/b.test.mjs"],
    ["tests/a.test.mjs"],
  );

  assert.equal(comparison.pass, false);
  assert.deepEqual(comparison.missingTestFiles, ["tests/b.test.mjs"]);
  assert.match(comparison.reasons.join("\n"), /executed fewer tests/u);
  assert.match(comparison.reasons.join("\n"), /not a superset/u);
});

test("candidate cannot increase skipped tests without an explicit allowlist", () => {
  const comparison = compareTestCoverage(
    {
      valid: true,
      tests: 100,
      pass: 98,
      fail: 0,
      cancelled: 0,
      skipped: 2,
      todo: 0,
      executedTests: 98,
    },
    {
      valid: true,
      tests: 101,
      pass: 98,
      fail: 0,
      cancelled: 0,
      skipped: 3,
      todo: 0,
      executedTests: 98,
    },
    ["tests/a.test.mjs"],
    ["tests/a.test.mjs", "tests/new.test.mjs"],
  );

  assert.equal(comparison.pass, false);
  assert.match(comparison.reasons.join("\n"), /skipped more tests/u);
});

test("candidate cannot replace coverage with todo or cancelled tests", () => {
  const mainSummary = {
    valid: true,
    tests: 100,
    pass: 100,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    executedTests: 100,
  };
  for (const candidateSummary of [
    {
      valid: true,
      tests: 101,
      pass: 100,
      fail: 0,
      cancelled: 0,
      skipped: 0,
      todo: 1,
      executedTests: 100,
    },
    {
      valid: true,
      tests: 101,
      pass: 100,
      fail: 0,
      cancelled: 1,
      skipped: 0,
      todo: 0,
      executedTests: 100,
    },
  ]) {
    assert.equal(
      compareTestCoverage(
        mainSummary,
        candidateSummary,
        ["tests/a.test.mjs"],
        ["tests/a.test.mjs"],
      ).pass,
      false,
    );
  }
});

test("baseline differential directly executes every enumerated root test file", () => {
  assert.match(
    differentialSource,
    /runLogged\("node", \["--test", \.\.\.mainTestFiles\]/u,
  );
  assert.match(
    differentialSource,
    /runLogged\(\s*"node",\s*\["--test", \.\.\.candidateTestFiles\]/u,
  );
  assert.doesNotMatch(differentialSource, /runLogged\("pnpm", \["test"\]/u);
});

test("checkout-provided main mode is explicit and fail-closed", () => {
  assert.equal(shouldFetchOriginMain({}), true);
  assert.equal(
    shouldFetchOriginMain({ FIELDGRID_BASELINE_DIFF_USE_CHECKOUT_MAIN: "0" }),
    true,
  );
  assert.equal(
    shouldFetchOriginMain({ FIELDGRID_BASELINE_DIFF_USE_CHECKOUT_MAIN: "1" }),
    false,
  );
  assert.throws(
    () =>
      shouldFetchOriginMain({
        FIELDGRID_BASELINE_DIFF_USE_CHECKOUT_MAIN: "yes",
      }),
    /must be 0 or 1/u,
  );
});

test("candidate preinstall mode is explicit and fail-closed", () => {
  assert.equal(shouldInstallCandidate({}), true);
  assert.equal(
    shouldInstallCandidate({
      FIELDGRID_BASELINE_DIFF_CANDIDATE_PREINSTALLED: "0",
    }),
    true,
  );
  assert.equal(
    shouldInstallCandidate({
      FIELDGRID_BASELINE_DIFF_CANDIDATE_PREINSTALLED: "1",
    }),
    false,
  );
  assert.throws(
    () =>
      shouldInstallCandidate({
        FIELDGRID_BASELINE_DIFF_CANDIDATE_PREINSTALLED: "yes",
      }),
    /must be 0 or 1/u,
  );
});
