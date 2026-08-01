import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import skippedTestEvidenceReporter from "../scripts/fieldgrid-skipped-test-evidence-reporter.mjs";
import {
  allowedAdditionalSkips,
  compareFailureSets,
  compareTestCoverage,
  extractFailureNames,
  extractSkippedTestNames,
  extractTestRunSummary,
  normalizeFailureName,
  rootTestArgs,
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
    {
      mainSkippedTests: ["existing database test"],
      candidateSkippedTests: [
        "existing database test",
        "new environment-gated test",
      ],
      allowedAdditionalSkips: [],
    },
  );

  assert.equal(comparison.pass, false);
  assert.match(comparison.reasons.join("\n"), /skipped more tests/u);
});

test("candidate accepts a name-based additional skip allowlist without stale entries", () => {
  const mainSummary = {
    valid: true,
    tests: 100,
    pass: 99,
    fail: 0,
    cancelled: 0,
    skipped: 1,
    todo: 0,
    executedTests: 99,
  };
  const candidateSummary = {
    valid: true,
    tests: 101,
    pass: 99,
    fail: 0,
    cancelled: 0,
    skipped: 2,
    todo: 0,
    executedTests: 99,
  };
  const basePolicy = {
    mainSkippedTests: ["existing database test"],
    candidateSkippedTests: [
      "existing database test",
      "new environment-gated test",
    ],
  };

  assert.equal(
    compareTestCoverage(
      mainSummary,
      candidateSummary,
      ["tests/a.test.mjs"],
      ["tests/a.test.mjs"],
      {
        ...basePolicy,
        allowedAdditionalSkips: [
          "existing database test",
          "new environment-gated test",
        ],
      },
    ).pass,
    true,
  );
  const stale = compareTestCoverage(
    mainSummary,
    candidateSummary,
    ["tests/a.test.mjs"],
    ["tests/a.test.mjs"],
    {
      ...basePolicy,
      allowedAdditionalSkips: [
        "existing database test",
        "new environment-gated test",
        "sk_live_do_not_log",
      ],
    },
  );
  const serializedStale = JSON.stringify(stale);
  assert.equal(stale.pass, false);
  assert.equal(stale.unusedAllowedSkippedTestCount, 1);
  assert.match(stale.unusedAllowedSkippedTestSha256, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(serializedStale, /sk_live_do_not_log/u);
  assert.equal(stale.allowedAdditionalSkipCount, 3);
  assert.match(stale.allowedAdditionalSkipSha256, /^[a-f0-9]{64}$/u);
});

test("candidate rejects skipped-test evidence that disagrees with its summary", () => {
  const comparison = compareTestCoverage(
    {
      valid: true,
      tests: 1,
      pass: 0,
      fail: 0,
      cancelled: 0,
      skipped: 1,
      todo: 0,
      executedTests: 0,
    },
    {
      valid: true,
      tests: 2,
      pass: 0,
      fail: 0,
      cancelled: 0,
      skipped: 2,
      todo: 0,
      executedTests: 0,
    },
    ["tests/a.test.mjs"],
    ["tests/a.test.mjs"],
    {
      mainSkippedTests: ["existing database test"],
      candidateSkippedTests: ["existing database test"],
      allowedAdditionalSkips: ["existing database test"],
    },
  );

  assert.equal(comparison.pass, false);
  assert.match(comparison.reasons.join("\n"), /evidence does not match/u);
});

test("structured skip evidence and explicit allowlist parsing are fail closed", () => {
  assert.deepEqual(
    extractSkippedTestNames(
      [
        'FIELDGRID_SKIPPED_TEST_V1 {"file":"tests/database.test.mjs","suitePath":["database"],"name":"database behavior stays tenant safe","occurrence":1}',
        'FIELDGRID_SKIPPED_TEST_V1 {"file":"tests/database.test.mjs","suitePath":["database"],"name":"custom database behavior","occurrence":1}',
        'FIELDGRID_SKIPPED_TEST_V1 {"file":"tests/provider.test.mjs","suitePath":[],"name":"provider behavior is optional","occurrence":1}',
      ].join("\n"),
    ),
    [
      "tests/database.test.mjs :: database > custom database behavior [occurrence 1]",
      "tests/database.test.mjs :: database > database behavior stays tenant safe [occurrence 1]",
      "tests/provider.test.mjs :: provider behavior is optional [occurrence 1]",
    ],
  );
  assert.throws(
    () => extractSkippedTestNames("not structured evidence"),
    /invalid record/u,
  );
  assert.deepEqual(allowedAdditionalSkips({}), []);
  assert.deepEqual(
    allowedAdditionalSkips({
      FIELDGRID_BASELINE_DIFF_ALLOWED_ADDITIONAL_SKIPS_JSON:
        '["provider behavior is optional"]',
    }),
    ["provider behavior is optional"],
  );
  assert.throws(
    () =>
      allowedAdditionalSkips({
        FIELDGRID_BASELINE_DIFF_ALLOWED_ADDITIONAL_SKIPS_JSON: "not-json",
      }),
    /must be a JSON array/u,
  );
  assert.throws(
    () =>
      allowedAdditionalSkips({
        FIELDGRID_BASELINE_DIFF_ALLOWED_ADDITIONAL_SKIPS_JSON:
          '["duplicate", "duplicate"]',
      }),
    /duplicate test names/u,
  );
  assert.throws(
    () =>
      allowedAdditionalSkips({
        FIELDGRID_BASELINE_DIFF_ALLOWED_ADDITIONAL_SKIPS_JSON: `["${"x".repeat(
          257,
        )}"]`,
      }),
    /at most 256 characters/u,
  );
  assert.throws(
    () =>
      allowedAdditionalSkips({
        FIELDGRID_BASELINE_DIFF_ALLOWED_ADDITIONAL_SKIPS_JSON:
          '["database\\nsecret"]',
      }),
    /without control characters/u,
  );
});

test("skip evidence reporter excludes skipped suites and keeps test skip reasons", async () => {
  const file = `${process.cwd()}/tests/reporter-fixture.test.mjs`;
  async function* events() {
    yield {
      type: "test:enqueue",
      data: {
        name: "skipped suite",
        file,
        testId: 1,
        type: "suite",
      },
    };
    yield {
      type: "test:enqueue",
      data: {
        name: "skipped test",
        file,
        testId: 2,
        type: "test",
      },
    };
    yield {
      type: "test:dequeue",
      data: {
        name: "skipped suite",
        file,
        nesting: 0,
        testId: 1,
        type: "test",
      },
    };
    yield {
      type: "test:start",
      data: {
        name: "skipped suite",
        file,
        nesting: 0,
        testId: 1,
      },
    };
    yield {
      type: "test:start",
      data: {
        name: "skipped test",
        file,
        nesting: 1,
        testId: 2,
      },
    };
    yield {
      type: "test:pass",
      data: {
        name: "skipped test",
        file,
        nesting: 1,
        testId: 2,
        skip: "missing database",
        details: { type: "test" },
      },
    };
    yield {
      type: "test:pass",
      data: {
        name: "skipped suite",
        file,
        nesting: 0,
        testId: 1,
        details: { type: "suite" },
      },
    };
    yield {
      type: "test:enqueue",
      data: {
        name: "entire skipped suite",
        file,
        testId: 3,
        type: "suite",
      },
    };
    yield {
      type: "test:start",
      data: {
        name: "entire skipped suite",
        file,
        nesting: 0,
        testId: 3,
      },
    };
    yield {
      type: "test:pass",
      data: {
        name: "entire skipped suite",
        file,
        nesting: 0,
        testId: 3,
        skip: "missing database",
        details: { type: "suite" },
      },
    };
  }

  let evidence = "";
  for await (const record of skippedTestEvidenceReporter(events())) {
    evidence += record;
  }
  assert.deepEqual(extractSkippedTestNames(evidence), [
    "tests/reporter-fixture.test.mjs :: skipped suite > skipped test [occurrence 1]",
  ]);
});

test("skip evidence keeps duplicate and suite-qualified names distinct", () => {
  const evidence = [
    'FIELDGRID_SKIPPED_TEST_V1 {"file":"tests/a.test.mjs","suitePath":["suite A"],"name":"duplicate skip","occurrence":1}',
    'FIELDGRID_SKIPPED_TEST_V1 {"file":"tests/a.test.mjs","suitePath":["suite A"],"name":"duplicate skip","occurrence":2}',
    'FIELDGRID_SKIPPED_TEST_V1 {"file":"tests/a.test.mjs","suitePath":["suite B"],"name":"duplicate skip","occurrence":1}',
  ].join("\n");

  assert.deepEqual(extractSkippedTestNames(evidence), [
    "tests/a.test.mjs :: suite A > duplicate skip [occurrence 1]",
    "tests/a.test.mjs :: suite A > duplicate skip [occurrence 2]",
    "tests/a.test.mjs :: suite B > duplicate skip [occurrence 1]",
  ]);

  const summary = {
    valid: true,
    tests: 1,
    pass: 0,
    fail: 0,
    cancelled: 0,
    skipped: 1,
    todo: 0,
    executedTests: 0,
  };
  const swappedSkip = compareTestCoverage(
    summary,
    summary,
    ["tests/a.test.mjs"],
    ["tests/a.test.mjs"],
    {
      mainSkippedTests: [
        "tests/a.test.mjs :: suite A > duplicate skip [occurrence 1]",
      ],
      candidateSkippedTests: [
        "tests/a.test.mjs :: suite B > duplicate skip [occurrence 1]",
      ],
      allowedAdditionalSkips: [],
    },
  );
  assert.equal(swappedSkip.pass, false);
  assert.match(
    swappedSkip.reasons.join("\n"),
    /outside the explicit allowlist/u,
  );
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
  const args = rootTestArgs(
    ["tests/a.test.mjs", "tests/b.test.mjs"],
    "/tmp/skipped-tests.jsonl",
  );
  assert.equal(args[0], "--test");
  assert.ok(args.includes("--test-reporter=spec"));
  assert.ok(
    args.some((argument) => argument.startsWith("--test-reporter=file:///")),
  );
  assert.ok(
    args.includes("--test-reporter-destination=/tmp/skipped-tests.jsonl"),
  );
  assert.deepEqual(args.slice(-2), ["tests/a.test.mjs", "tests/b.test.mjs"]);
  assert.match(differentialSource, /rootTestArgs\(mainTestFiles,/u);
  assert.match(differentialSource, /rootTestArgs\(candidateTestFiles,/u);
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
