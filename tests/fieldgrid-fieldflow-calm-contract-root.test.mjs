import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function independentRoot(manifest) {
  const payload = {
    schemaVersion: manifest.schemaVersion,
    name: manifest.name,
    algorithm: manifest.algorithm,
    serialization: manifest.serialization,
    lineage: manifest.lineage,
    trustPolicy: manifest.trustPolicy,
    digests: manifest.digests,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

test("independent oracle pins the protected Fieldflow Calm contract root", () => {
  const manifest = JSON.parse(
    readFileSync(
      resolve(
        ROOT,
        "docs/uiux/fieldflow-calm-handoff/manifests/contract-root.json",
      ),
      "utf8",
    ),
  );
  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(manifest.lineage, {
    sequence: 1,
    previousRootSha256:
      "a392990a3317941ec7fde1ab298dd4cd638c1da181d2865ff48aaf44c46bf788",
  });
  assert.equal(manifest.trustPolicy.executionBranch, "main");
  assert.equal(manifest.trustPolicy.environmentBranchPolicy, "main");
  assert.equal(
    manifest.trustPolicy.candidateRefTemplate,
    "refs/pull/{pullRequestNumber}/head",
  );
  assert.match(manifest.trustPolicy.bootstrapRule, /break-glass-only/u);
  const bootstrap = manifest.trustPolicy.bootstrapRule;
  const orderedBootstrapMarkers = [
    "freeze the exact foundation HEAD",
    "copy its three byte-identical v2 workflows",
    "set pending to the frozen candidate root",
    "temporarily remove only the required root-status check",
    "merge only that frozen foundation HEAD into UIUX",
    "set active to the candidate root and clear pending",
    "restore the required root-status check",
    "successful normal-mode probe",
  ];
  let previousOffset = -1;
  for (const marker of orderedBootstrapMarkers) {
    const offset = bootstrap.indexOf(marker);
    assert.ok(offset > previousOffset, `bootstrapvolgorde mist: ${marker}`);
    previousOffset = offset;
  }
  assert.match(
    bootstrap,
    /pre-merge mismatch aborts.*post-merge mismatch.*reverts the exact UIUX merge.*restores all three main workflows byte-identically.*restores the prior environment policy, active\/pending values and required check.*only then probes normal mode/su,
  );
  assert.match(
    bootstrap,
    /ordinary branch-protection requirements other than the temporarily bypassed root-status check/u,
  );
  assert.match(
    bootstrap,
    /adds no reviewer count, reviewer role or review-body marker beyond repository branch protection/u,
  );
  assert.doesNotMatch(bootstrap, /three independent role approvals/u);
  assert.match(bootstrap, /Automated v2 rotation never accepts a v1 base/u);
  const rotation = manifest.trustPolicy.rotationRule;
  assert.match(
    rotation,
    /adds no reviewer count, reviewer role or review-body marker beyond repository branch protection/u,
  );
  assert.match(
    rotation,
    /pull_request_target edited event.*generic trusted retrigger.*no approval semantics/su,
  );
  assert.doesNotMatch(rotation, /FIELDFLOW-ROOT-(?:ROTATION|RECHECK)/u);
  const runnerIsolation = manifest.trustPolicy.runnerIsolationRule;
  assert.match(
    runnerIsolation,
    /untrusted non-OIDC producer.*clean non-OIDC validator\/package job.*isolated OIDC signer/su,
  );
  assert.match(
    runnerIsolation,
    /read-only candidate source.*dedicated writable output root.*no nonce, GitHub credential, secret or file-command path.*verified termination of every candidate process/su,
  );
  assert.match(
    runnerIsolation,
    /Raw artifacts, receipts and producer nonces are non-authenticating/u,
  );
  assert.match(
    runnerIsolation,
    /independently derives immutable event, run, attempt, head, job and artifact bindings.*exact safe regular-file closure without symlinks or hardlinks.*byte-identical base-owned validator code and dependencies/su,
  );
  assert.match(runnerIsolation, /Only the signer may receive id-token: write/u);
  assert.match(
    runnerIsolation,
    /missing containment-capable runner fails closed/u,
  );
  assert.match(manifest.rootSha256, /^[0-9a-f]{64}$/u);
  assert.equal(manifest.rootSha256, independentRoot(manifest));
});

test("independent oracle pins the base-owned inert-candidate workflow boundary", () => {
  const workflow = readFileSync(
    resolve(ROOT, ".github/workflows/fieldflow-calm-contract-root.yml"),
    "utf8",
  );
  assert.match(workflow, /EXPECTED_EXECUTION_BRANCH: main/u);
  assert.match(workflow, /EXPECTED_EVENT_REF: refs\/heads\/main/u);
  assert.match(workflow, /pull_request_target:[\s\S]*- edited/u);
  assert.doesNotMatch(workflow, /pull_request_review:/u);
  assert.equal(
    workflow.match(
      /github\.event\.pull_request\.base\.repo\.full_name == 'veele-services\/platform' && github\.event\.pull_request\.base\.ref == 'codex\/fieldgrid-uiux-master'/gu,
    )?.length,
    2,
  );
  assert.match(workflow, /test "\$EVENT_NAME" = "pull_request_target"/u);
  assert.match(workflow, /test "\$EVENT_ACTION" = "edited"/u);
  assert.doesNotMatch(workflow, /EVENT_PULL_REQUEST_UPDATED_AT/u);
  assert.doesNotMatch(workflow, /EVENT_BODY_CHANGE_JSON/u);
  assert.doesNotMatch(workflow, /EVENT_SENDER_LOGIN/u);
  assert.match(workflow, /--event-name "\$EVENT_NAME"/u);
  assert.match(workflow, /--event-action "\$EVENT_ACTION"/u);
  assert.doesNotMatch(workflow, /--event-pr-updated-at/u);
  assert.doesNotMatch(workflow, /--event-body-change-json/u);
  assert.doesNotMatch(workflow, /--event-sender-login/u);
  assert.match(workflow, /EXECUTOR_WORKFLOW_SHA:.*github\.workflow_sha/u);
  assert.match(
    workflow,
    /refs\/pull\/\$\{\{ github\.event\.pull_request\.number \}\}\/head/u,
  );
  assert.match(workflow, /repository: \$\{\{ env\.BASE_REPOSITORY \}\}/u);
  assert.match(
    workflow,
    /cmp -- "executor\/\$\{workflow_path\}" "trusted\/\$\{workflow_path\}"/u,
  );
  assert.match(workflow, /pnpm install --frozen-lockfile --ignore-scripts/u);
  assert.match(workflow, /Reject a PR-head race after validation/u);
  assert.doesNotMatch(workflow, /CANDIDATE_REPOSITORY/u);
  assert.match(workflow, /name: Fieldflow Calm contract root/u);
  assert.match(
    workflow,
    /if: \$\{\{ always\(\) && github\.event\.pull_request\.base\.repo\.full_name/u,
  );
  assert.match(workflow, /test "\$VERIFICATION_RESULT" = "success"/u);
});
