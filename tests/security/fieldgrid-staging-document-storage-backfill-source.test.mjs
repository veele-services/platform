import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const workflow = read(
  ".github/workflows/fieldgrid-staging-document-storage-backfill.yml",
);
const runner = read("scripts/fieldgrid-staging-document-storage-backfill.mts");

function step(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.ok(start >= 0, `Missing protected step: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
}

test("storage maintenance is confined to reviewed main and the staging environment", () => {
  assert.match(workflow, /environment: staging/u);
  assert.match(workflow, /group: veele-staging/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /permissions:\n  contents: read\n  actions: read/u);
  const dispatch = step("Reject non-main authorization dispatch");
  assert.match(dispatch, /test "\$GITHUB_EVENT_NAME" = "workflow_dispatch"/u);
  assert.match(
    dispatch,
    /test "\$GITHUB_REPOSITORY" = "veele-services\/platform"/u,
  );
  assert.match(dispatch, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(dispatch, /test "\$GITHUB_SHA" = "\$EXPECTED_MAIN_SHA"/u);
  assert.match(dispatch, /diagnose\|apply\)/u);
  assert.match(
    workflow,
    /EXPECTED_SUPABASE_PROJECT_REF: olyfmekyqozxrbrwwszu/u,
  );
  assert.doesNotMatch(workflow, /environment:\s*production|contents:\s*write/u);
});

test("database and storage credentials are exposed only after the exact main CI proof", () => {
  const verifyName =
    "Reverify exact main and successful Main Exact Head Validation before apply";
  const operationName = "Diagnose objects or apply verified canonical copies";
  const verify = step(verifyName);
  const operation = step(operationName);
  assert.ok(workflow.indexOf(verify) < workflow.indexOf(operation));
  assert.match(verify, /verifyTenantManagementAuthorizationMainHead\(/u);
  assert.match(verify, /process\.env\.EXPECTED_MAIN_SHA/u);
  assert.match(verify, /process\.env\.STORAGE_OPERATION/u);
  assert.doesNotMatch(verify, /continue-on-error|\|\|\s*true/u);
  assert.match(
    operation,
    /FIELDGRID_MIGRATION_DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u,
  );
  assert.match(
    operation,
    /DATABASE_URL: \$\{\{ secrets\.FIELDGRID_RUNTIME_DATABASE_URL \}\}/u,
  );
  assert.match(operation, /FIELDGRID_DATABASE_CONNECTION_PURPOSE: migration/u);
  assert.match(operation, /--diagnose --expected-sha "\$EXPECTED_MAIN_SHA"/u);
  assert.match(operation, /--apply --expected-sha "\$EXPECTED_MAIN_SHA"/u);
  for (const secret of [
    "DATABASE_URL",
    "FIELDGRID_RUNTIME_DATABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    const binding = `secrets.${secret}`;
    assert.equal(workflow.split(binding).length - 1, 1);
    assert.ok(operation.includes(binding));
  }
});

test("storage evidence upload excludes persistent private recovery manifests", () => {
  const upload = step("Upload bounded storage evidence");
  assert.match(upload, /if: always\(\)/u);
  assert.match(
    upload,
    /path: artifacts\/document-storage-backfill\/\*-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\.json/u,
  );
  assert.match(upload, /retention-days: 1/u);
  assert.doesNotMatch(
    upload,
    /runner\.temp|RUNNER_TEMP|rollback|shared\/|\/var\/www/u,
  );
  assert.match(
    runner,
    /\/var\/www\/veele\/staging\/shared\/document-storage-backfill/u,
  );
  assert.doesNotMatch(runner, /mkdtempSync\(join\([^\n]*RUNNER_TEMP/u);
});

test("workflow validates the runner without live database or storage credentials", () => {
  const validate = step("Validate storage runner without database credentials");
  assert.match(validate, /tsc --noEmit/u);
  assert.match(
    validate,
    /fieldgrid-staging-document-storage-backfill\.mts --check/u,
  );
  assert.match(validate, /tsx --test/u);
  assert.match(
    validate,
    /node --test tests\/security\/fieldgrid-staging-document-storage-backfill-source\.test\.mjs/u,
  );
  assert.doesNotMatch(validate, /secrets\./u);
  assert.ok(
    workflow.indexOf(validate) <
      workflow.indexOf(
        step("Diagnose objects or apply verified canonical copies"),
      ),
  );
});
