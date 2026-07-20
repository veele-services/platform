import { relative } from "node:path";

export const FIELDGRID_PLAYWRIGHT_JOURNEY_ANNOTATION = "fieldgrid.journey-id";
export const FIELDGRID_PLAYWRIGHT_JOURNEY_IDS = Object.freeze([
  "phase2.offline.mutation-chain",
]);

const knownJourneyIds = new Set(FIELDGRID_PLAYWRIGHT_JOURNEY_IDS);
const maxEvidenceAgeMs = 12 * 60 * 60 * 1000;
const maxFutureSkewMs = 5 * 60 * 1000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function extractPlaywrightJourneyIds(annotations = []) {
  assert(
    Array.isArray(annotations),
    "Playwright annotations must be an array.",
  );
  const journeyIds = annotations
    .filter(
      (annotation) =>
        annotation?.type === FIELDGRID_PLAYWRIGHT_JOURNEY_ANNOTATION,
    )
    .map((annotation) => annotation.description);
  for (const journeyId of journeyIds) {
    assert(
      typeof journeyId === "string" && journeyId.length > 0,
      "Playwright journey annotation has no ID.",
    );
    assert(
      knownJourneyIds.has(journeyId),
      `Unknown Playwright journey ID: ${journeyId}`,
    );
  }
  assert(
    new Set(journeyIds).size === journeyIds.length,
    "A Playwright result declares a duplicate journey ID.",
  );
  return journeyIds;
}

function iso(value) {
  const date = new Date(value);
  assert(!Number.isNaN(date.getTime()), `Invalid runtime timestamp: ${value}`);
  return date.toISOString();
}

export function flattenPlaywrightSuites(
  suites,
  root,
  file = null,
  titlePath = [],
) {
  const records = [];
  for (const suite of suites ?? []) {
    const nextFile = suite.file ?? file;
    const nextTitle = suite.title ? [...titlePath, suite.title] : titlePath;
    for (const spec of suite.specs ?? []) {
      for (const playwrightTest of spec.tests ?? []) {
        const journeyIds = extractPlaywrightJourneyIds(
          playwrightTest.annotations,
        );
        for (const result of playwrightTest.results ?? []) {
          const startedAt = iso(result.startTime);
          records.push({
            testId: spec.id,
            file: nextFile,
            title: [...nextTitle, spec.title].filter(Boolean).join(" › "),
            journeyIds,
            projectName: playwrightTest.projectName,
            expectedStatus: playwrightTest.expectedStatus,
            status: result.status,
            startedAt,
            finishedAt: new Date(
              new Date(startedAt).getTime() + Number(result.duration ?? 0),
            ).toISOString(),
            retry: result.retry ?? 0,
            errors: (result.errors ?? []).map((error) => ({
              message: error.message ?? String(error),
              location: error.location ?? null,
            })),
            attachments: (result.attachments ?? []).map((attachment) => ({
              name: attachment.name,
              contentType: attachment.contentType,
              path: attachment.path
                ? relative(root, attachment.path)
                : null,
            })),
          });
        }
      }
    }
    records.push(
      ...flattenPlaywrightSuites(suite.suites, root, nextFile, nextTitle),
    );
  }
  return records;
}

export function resolvePlaywrightJourneyEvidence(
  browserSummary,
  journeyId,
  options = {},
) {
  const expectedHead = options.expectedHead;
  const now = options.now ?? Date.now();
  assert(
    knownJourneyIds.has(journeyId),
    `Unknown Playwright journey ID requested: ${journeyId}`,
  );
  assert(
    browserSummary && typeof browserSummary === "object",
    "Playwright browser summary is missing.",
  );
  assert(
    browserSummary.schemaVersion === "2.0.0",
    "Playwright browser summary has an unsupported schema.",
  );
  assert(
    /^[0-9a-f]{40}$/u.test(expectedHead ?? ""),
    "Expected Playwright evidence head is incomplete.",
  );
  assert(
    browserSummary.exactGitHead === expectedHead,
    "Playwright journey evidence belongs to another git head.",
  );
  assert(
    Array.isArray(browserSummary.tests),
    "Playwright browser summary has no test results.",
  );

  for (const test of browserSummary.tests) {
    assert(
      Array.isArray(test.journeyIds),
      "Playwright test result has incomplete journey metadata.",
    );
    assert(
      new Set(test.journeyIds).size === test.journeyIds.length,
      "A Playwright result declares a duplicate journey ID.",
    );
    for (const declaredId of test.journeyIds) {
      assert(
        knownJourneyIds.has(declaredId),
        `Unknown Playwright journey ID: ${declaredId}`,
      );
    }
  }

  const matches = browserSummary.tests.filter((test) =>
    test.journeyIds.includes(journeyId),
  );
  assert(
    matches.length === 1,
    `Expected exactly one Playwright journey "${journeyId}", found ${matches.length}.`,
  );
  const match = matches[0];
  for (const field of [
    "testId",
    "file",
    "title",
    "expectedStatus",
    "status",
    "startedAt",
    "finishedAt",
  ]) {
    assert(
      typeof match[field] === "string" && match[field].length > 0,
      `Playwright journey "${journeyId}" has incomplete ${field} evidence.`,
    );
  }
  assert(
    Array.isArray(match.errors),
    `Playwright journey "${journeyId}" has incomplete error evidence.`,
  );
  assert(
    match.expectedStatus === "passed" &&
      match.status === "passed" &&
      match.errors.length === 0,
    `Playwright journey "${journeyId}" did not pass.`,
  );
  const startedAt = Date.parse(match.startedAt);
  const finishedAt = Date.parse(match.finishedAt);
  assert(
    Number.isFinite(startedAt) &&
      Number.isFinite(finishedAt) &&
      startedAt <= finishedAt,
    `Playwright journey "${journeyId}" has invalid timestamps.`,
  );
  assert(
    now - finishedAt <= maxEvidenceAgeMs,
    `Playwright journey "${journeyId}" evidence is stale.`,
  );
  assert(
    finishedAt <= now + maxFutureSkewMs,
    `Playwright journey "${journeyId}" evidence timestamp is unexpectedly in the future.`,
  );
  return match;
}
