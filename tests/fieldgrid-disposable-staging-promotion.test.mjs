import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DISPOSABLE_REBUILD_CONFIRMATION,
  assertDisposableRebuildReport,
  assertPromotionContract,
  parseArgs,
  selectAuthenticatedRebuildArtifact,
} from "../scripts/fieldgrid-phase2e-staging-promote.mjs";

const MAIN = "a".repeat(40);
const STAGING = "b".repeat(40);
const RUN_ID = "123";
const NOW = Date.parse("2026-09-23T12:00:00Z");

function run() {
  return {
    id: Number(RUN_ID),
    name: "Fieldgrid Disposable Staging Rebuild",
    path: ".github/workflows/fieldgrid-disposable-staging-rebuild.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: MAIN,
    status: "completed",
    conclusion: "success",
    run_attempt: 2,
    updated_at: "2026-09-23T11:30:00Z",
    repository: { full_name: "veele-services/platform", id: 99 },
  };
}

function artifact() {
  return {
    id: 456,
    name: `disposable-staging-rebuild-${RUN_ID}-${MAIN}`,
    expired: false,
    size_in_bytes: 1000,
    archive_download_url:
      "https://api.github.com/repos/veele-services/platform/actions/artifacts/456/zip",
    digest: `sha256:${"c".repeat(64)}`,
    updated_at: "2026-09-23T11:31:00Z",
    workflow_run: {
      id: Number(RUN_ID),
      head_branch: "main",
      head_sha: MAIN,
      repository_id: 99,
    },
  };
}

test("promotion accepts exactly one disposable rebuild evidence run", () => {
  const options = parseArgs([
    "--run",
    "--approved-main",
    MAIN,
    "--expected-staging",
    STAGING,
    "--rebuild-run-id",
    RUN_ID,
    "--confirm",
    DISPOSABLE_REBUILD_CONFIRMATION,
  ]);
  assert.equal(assertPromotionContract(options), true);
  assert.throws(
    () => assertPromotionContract({ ...options, preflightRunId: "5" }),
    /exactly one/u,
  );
  assert.throws(
    () =>
      assertPromotionContract({
        ...options,
        confirmation: "phase2e-fast-forward-staging",
      }),
    /disposable-rebuild/u,
  );
});

test("rebuild artifact selector rejects plan artifacts and stale or wrong-sha runs", () => {
  const selected = selectAuthenticatedRebuildArtifact(
    { approvedMain: MAIN, rebuildRunId: RUN_ID },
    { run: run(), artifactsPayload: { artifacts: [artifact()] }, nowMs: NOW },
  );
  assert.equal(selected.id, 456);
  assert.throws(() =>
    selectAuthenticatedRebuildArtifact(
      { approvedMain: MAIN, rebuildRunId: RUN_ID },
      {
        run: run(),
        artifactsPayload: {
          artifacts: [
            {
              ...artifact(),
              name: `disposable-staging-plan-${RUN_ID}-${MAIN}`,
            },
          ],
        },
        nowMs: NOW,
      },
    ),
  );
  assert.throws(() =>
    selectAuthenticatedRebuildArtifact(
      { approvedMain: MAIN, rebuildRunId: RUN_ID },
      {
        run: { ...run(), head_sha: "d".repeat(40) },
        artifactsPayload: { artifacts: [artifact()] },
        nowMs: NOW,
      },
    ),
  );
});

test("only complete active smoke-passed rebuild evidence is promotable", () => {
  const report = {
    contract: "fieldgrid-disposable-staging-rebuild-v1",
    repository: "veele-services/platform",
    project: "olyfmekyqozxrbrwwszu",
    environment: "staging",
    mode: "rebuild",
    status: "passed",
    candidateSha: MAIN,
    expectedStagingSha: STAGING,
    runId: Number(RUN_ID),
    attempt: 2,
    phase: "COMPLETE",
    destructiveBoundaryPassed: true,
    releaseActive: true,
    smokePassed: true,
    acceptancePassed: true,
    backupRequired: false,
    oldDataRestored: false,
    mutationsPerformed: true,
    proofDigest: "e".repeat(64),
  };
  assert.equal(
    assertDisposableRebuildReport(report, {
      approvedMain: MAIN,
      expectedStaging: STAGING,
      rebuildRunId: RUN_ID,
      run: run(),
    }),
    true,
  );
  for (const change of [
    { mode: "plan" },
    { smokePassed: false },
    { acceptancePassed: false },
    { releaseActive: false },
    { phase: "VERIFIED" },
  ]) {
    assert.throws(() =>
      assertDisposableRebuildReport(
        { ...report, ...change },
        {
          approvedMain: MAIN,
          expectedStaging: STAGING,
          rebuildRunId: RUN_ID,
          run: run(),
        },
      ),
    );
  }
});
