import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const collector = readFileSync(
  "scripts/fieldgrid-phase2-w11-cross-surface-acceptance.mjs",
  "utf8",
);
const finalizer = readFileSync(
  "e2e/fieldgrid/finalize-runtime-evidence.mjs",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/main-exact-head-validation.yml",
  "utf8",
);
const playwrightWorkflow = readFileSync(
  ".github/workflows/fieldgrid-playwright.yml",
  "utf8",
);
const schema = JSON.parse(
  readFileSync("schemas/fieldgrid-phase2-runtime-evidence.schema.json", "utf8"),
);

test("synthetic and self-declared Phase 2 pass artifacts are not tracked", () => {
  assert.equal(
    existsSync(
      "artifacts/fieldgrid-phase2-w11/cross-surface-acceptance-evidence.json",
    ),
    false,
  );
  assert.equal(existsSync("docs/phase-2/acceptance-evidence.json"), false);
  assert.doesNotMatch(collector, /local-exact-head/u);
  assert.doesNotMatch(collector, /2026-07-17T(?:00|09|11|12):/u);
});

test("runtime collector requires every mandatory journey and machine source", () => {
  for (const id of [
    "planned-versus-actual",
    "availability",
    "interest-selection-and-staffing",
    "durable-unassignment",
    "multi-person-execution",
    "realtime",
    "offline-personnel-pwa",
    "customer-visibility",
    "credential-recovery",
    "tenant-guards",
    "accessibility",
  ])
    assert.match(collector, new RegExp(`['"]${id}['"]`, "u"));
  for (const source of [
    "playwright-results.json",
    "browser-summary.json",
    "accessibility-summary.json",
    "data-path-proof.json",
    "e2e-fixtures.json",
    "offline-reconnect-evidence.json",
    "phase2d-runtime-journeys.json",
    "db-harness.json",
    "rls-harness.json",
    "api-harness.json",
    "credential-recovery.json",
  ])
    assert.ok(
      collector.includes(source) || finalizer.includes(source),
      `missing runtime source ${source}`,
    );
});

test("validator is fail-closed for provenance, duplicates, skips, environment, proof count and secrets", () => {
  for (const contract of [
    "Exact head mismatch",
    "Duplicate journey IDs",
    "Mandatory journey set is incomplete",
    "did not pass",
    "claims pass with a failed/skipped source",
    "Expected exactly one structured data-path proof",
    "Evidence environment classification mismatch",
    "Evidence is stale",
    "Forbidden secret material",
  ])
    assert.ok(
      collector.includes(contract),
      `missing fail-closed contract: ${contract}`,
    );
});

test("evidence schema binds journeys to exact head, run, runtime timestamps and sources", () => {
  assert.equal(schema.properties.schemaVersion.const, "2.0.0");
  assert.match(schema.properties.exactGitHead.pattern, /40/);
  const required = schema.$defs.journey.required;
  for (const field of [
    "exactGitHead",
    "workflowRunId",
    "journeyId",
    "testId",
    "startedAt",
    "finishedAt",
    "status",
    "sources",
    "assertions",
    "failure",
  ]) {
    assert.ok(required.includes(field), `schema is missing ${field}`);
  }
});

test("authoritative and PR workflows collect runtime sources and upload only generated artifacts", () => {
  for (const content of [workflow, playwrightWorkflow]) {
    assert.match(content, /pnpm fieldgrid:phase2-w11/u);
    assert.match(content, /pnpm fieldgrid:phase2-w11:check/u);
    assert.match(content, /artifacts\/fieldgrid-phase2-runtime\/\*\*/u);
    assert.match(content, /FIELDGRID_EXACT_HEAD/u);
    assert.doesNotMatch(content, /artifacts\/fieldgrid-phase2-w11/u);
  }
  assert.match(workflow, /actions\/download-artifact@v4/u);
  assert.match(workflow, /lane: credential-recovery-runtime/u);
  assert.match(playwrightWorkflow, /fieldgrid:phase2d:runtime-journeys/u);
});

test("pull-request validation checks out and binds evidence to the immutable PR head", () => {
  assert.match(
    workflow,
    /FIELDGRID_VALIDATION_SHA:.*github\.event\.pull_request\.head\.sha.*github\.sha/u,
  );
  assert.match(workflow, /ref: \$\{\{ env\.FIELDGRID_VALIDATION_SHA \}\}/u);
  assert.match(
    workflow,
    /EXPECTED_HEAD_SHA: \$\{\{ env\.FIELDGRID_VALIDATION_SHA \}\}/u,
  );
  assert.match(
    playwrightWorkflow,
    /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/u,
  );
  assert.match(
    playwrightWorkflow,
    /EXPECTED_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/u,
  );
});
