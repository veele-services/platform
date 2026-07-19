import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflowPath = ".github/workflows/main-exact-head-validation.yml";
const workflow = readFileSync(workflowPath, "utf8").replaceAll("\r\n", "\n");

test("exact-head validation preserves PR coverage and adds main push and dispatch", () => {
  assert.match(workflow, /pull_request:\n\s+branches:\n\s+- main/u);
  assert.match(workflow, /push:\n\s+branches:\n\s+- main/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /permissions:\n\s+contents: read/u);
  assert.match(
    workflow,
    /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/u,
  );
});

test("every validation group checks out and proves the immutable event validation SHA", () => {
  const checkoutGroups = workflow.match(/uses: actions\/checkout@v4/gu) ?? [];
  const explicitRefs =
    workflow.match(/ref: \$\{\{ env\.FIELDGRID_VALIDATION_SHA \}\}/gu) ?? [];
  const headProofs = workflow.match(/git rev-parse HEAD/gu) ?? [];

  assert.equal(checkoutGroups.length, 8);
  assert.equal(explicitRefs.length, checkoutGroups.length);
  assert.equal(headProofs.length, checkoutGroups.length);
  assert.match(
    workflow,
    /FIELDGRID_VALIDATION_SHA: \$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u,
  );
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /FIELDGRID_BASELINE_DIFF_USE_CHECKOUT_MAIN: "1"/u);
});

test("exact-head validation includes every authoritative gate", () => {
  for (const command of [
    "pnpm fieldgrid:test:contract-static",
    "pnpm fieldgrid:test:unit-domain",
    "pnpm fieldgrid:test:security-source",
    "pnpm fieldgrid:migration-order-check:check",
    "pnpm run typecheck",
    "pnpm build",
    "pnpm fieldgrid:test:postgres17-migration-smoke",
    "pnpm fieldgrid:test:db-integration-tenant-ab",
    "pnpm fieldgrid:test:rls-security",
    "pnpm fieldgrid:test:api-runtime",
    "pnpm fieldgrid:test:phase-b-previous-release-database-compatibility",
    "pnpm fieldgrid:test:credential-recovery-runtime",
    "pnpm fieldgrid:phase2d:runtime-journeys",
    "pnpm fieldgrid:runtime-entrypoints:check",
    "pnpm fieldgrid:deploy-health-gate:test",
    "pnpm fieldgrid:test:baseline-differential",
    "pnpm fieldgrid:playwright",
  ]) {
    assert.ok(
      workflow.includes(command),
      `missing authoritative command: ${command}`,
    );
  }
});

test("aggregate is fail-closed and workflow cannot deploy", () => {
  assert.match(
    workflow,
    /required:\n\s+name: Main exact-head gate\n\s+if: always\(\)/u,
  );
  assert.match(workflow, /value\.result !== "success"/u);
  assert.doesNotMatch(workflow, /continue-on-error/u);
  assert.doesNotMatch(workflow, /secrets\./u);
  assert.doesNotMatch(workflow, /^\s+environment:/mu);
  assert.doesNotMatch(
    workflow,
    /fieldgrid-atomic-release-activate|fieldgrid-deploy-health-gate\.sh\s+(?:staging|production)|db:migrate/u,
  );
});
