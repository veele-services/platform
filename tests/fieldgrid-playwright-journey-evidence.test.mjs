import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractPlaywrightJourneyIds,
  flattenPlaywrightSuites,
  resolvePlaywrightJourneyEvidence,
} from "../scripts/fieldgrid-playwright-journey-evidence.mjs";

const journeyId = "phase2.offline.mutation-chain";
const exactGitHead = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const now = Date.parse("2026-07-20T12:00:00.000Z");

function browserTest(overrides = {}) {
  return {
    testId: "e2e/fieldgrid/tests/golden-path.spec.ts:390:1",
    file: "e2e/fieldgrid/tests/golden-path.spec.ts",
    title: "fieldgrid golden path › a deliberately renamed offline journey",
    journeyIds: [journeyId],
    projectName: "chromium",
    expectedStatus: "passed",
    status: "passed",
    startedAt: "2026-07-20T11:59:00.000Z",
    finishedAt: "2026-07-20T11:59:30.000Z",
    retry: 0,
    errors: [],
    attachments: [],
    ...overrides,
  };
}

function browserSummary(tests = [browserTest()], overrides = {}) {
  return {
    schemaVersion: "2.0.0",
    exactGitHead,
    generatedAt: "2026-07-20T11:59:31.000Z",
    source: {
      path: "artifacts/fieldgrid-playwright/playwright-results.json",
      sha256: "b".repeat(64),
    },
    counts: {
      total: tests.length,
      passed: tests.length,
      failed: 0,
      skipped: 0,
    },
    tests,
    ...overrides,
  };
}

function resolve(summary) {
  return resolvePlaywrightJourneyEvidence(summary, journeyId, {
    expectedHead: exactGitHead,
    now,
  });
}

test("Playwright reporter annotations become canonical journey IDs", () => {
  assert.deepEqual(
    extractPlaywrightJourneyIds([
      { type: "fieldgrid.journey-id", description: journeyId },
      { type: "issue", description: "337" },
    ]),
    [journeyId],
  );
});

test("a realistic Playwright JSON reporter record retains the stable journey ID", () => {
  const suites = [
    {
      title: "fieldgrid golden path",
      file: "e2e/fieldgrid/tests/golden-path.spec.ts",
      specs: [
        {
          id: "offline-mutation-chain",
          title: "a reporter-visible title that can change safely",
          tests: [
            {
              projectName: "chromium",
              expectedStatus: "passed",
              annotations: [
                { type: "fieldgrid.journey-id", description: journeyId },
              ],
              results: [
                {
                  status: "passed",
                  startTime: "2026-07-20T11:59:00.000Z",
                  duration: 30_000,
                  retry: 0,
                  errors: [],
                  attachments: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  const [record] = flattenPlaywrightSuites(suites, "/workspace");
  assert.deepEqual(record.journeyIds, [journeyId]);
  assert.equal(
    record.title,
    "fieldgrid golden path › a reporter-visible title that can change safely",
  );
  assert.equal(record.finishedAt, "2026-07-20T11:59:30.000Z");
});

test("the current mutation-chain display title resolves through the stable journey ID", () => {
  const currentTitle = browserTest({
    title:
      "golden-path.spec.ts › 9. Offline work-order mutation chain survives refresh and converges after reconnect",
  });
  assert.equal(resolve(browserSummary([currentTitle])).status, "passed");
});

test("a later display-title change still resolves through the stable journey ID", () => {
  assert.equal(resolve(browserSummary()).status, "passed");
  assert.equal(
    resolve(browserSummary()).title,
    "fieldgrid golden path › a deliberately renamed offline journey",
  );
});

test("the obsolete title without stable metadata is rejected", () => {
  const oldTitleOnly = browserTest({
    title:
      "fieldgrid golden path › 9. Offline work-order mutation survives refresh and converges after reconnect",
    journeyIds: [],
  });
  assert.throws(() => resolve(browserSummary([oldTitleOnly])), /found 0/u);
});

test("zero and duplicate journey matches are rejected", () => {
  assert.throws(
    () => resolve(browserSummary([browserTest({ journeyIds: [] })])),
    /found 0/u,
  );
  assert.throws(
    () =>
      resolve(
        browserSummary([
          browserTest(),
          browserTest({ testId: "duplicate-result" }),
        ]),
      ),
    /found 2/u,
  );
});

test("unknown journey metadata is rejected", () => {
  assert.throws(
    () =>
      resolve(
        browserSummary([browserTest({ journeyIds: ["phase2.unknown"] })]),
      ),
    /Unknown Playwright journey ID/u,
  );
  assert.throws(
    () =>
      extractPlaywrightJourneyIds([
        { type: "fieldgrid.journey-id", description: "phase2.unknown" },
      ]),
    /Unknown Playwright journey ID/u,
  );
});

test("failed and skipped journey results are rejected", () => {
  assert.throws(
    () =>
      resolve(
        browserSummary([
          browserTest({ status: "failed", errors: [{ message: "boom" }] }),
        ]),
      ),
    /did not pass/u,
  );
  assert.throws(
    () =>
      resolve(
        browserSummary([
          browserTest({ status: "skipped", expectedStatus: "skipped" }),
        ]),
      ),
    /did not pass/u,
  );
});

test("wrong-head, stale and incomplete journey evidence is rejected", () => {
  assert.throws(
    () => resolve(browserSummary(undefined, { exactGitHead: "c".repeat(40) })),
    /another git head/u,
  );
  assert.throws(
    () =>
      resolve(
        browserSummary([
          browserTest({
            startedAt: "2026-07-19T20:00:00.000Z",
            finishedAt: "2026-07-19T20:01:00.000Z",
          }),
        ]),
      ),
    /stale/u,
  );
  assert.throws(
    () => resolve(browserSummary([browserTest({ file: "" })])),
    /incomplete file/u,
  );
});
