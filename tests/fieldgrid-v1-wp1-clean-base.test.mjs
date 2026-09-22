import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  cleanBaseManifest,
  validateCleanBaseManifest,
} from "../scripts/fieldgrid-v1-wp1-clean-base.mjs";

test("WP1 clean-base manifest is staging-only and provider-safe", () => {
  assert.deepEqual(validateCleanBaseManifest(), []);
  assert.equal(cleanBaseManifest.target.environment, "staging");
  assert.ok(cleanBaseManifest.prohibited.includes("auth.users SQL wipe"));
  assert.ok(cleanBaseManifest.prohibited.includes("storage.objects SQL wipe"));
  assert.ok(
    cleanBaseManifest.stopConditions.includes("active or unknown payment"),
  );
  assert.ok(cleanBaseManifest.canonical.includes("isolation tenant"));
});

test("WP1 workflow is manual, main-bound and evidence-gated", () => {
  const workflow = readFileSync(
    ".github/workflows/fieldgrid-v1-wp1-clean-base.yml",
    "utf8",
  );

  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /pull_request:|\npush:/u);
  assert.match(workflow, /options:\s*\[diagnose, apply, verify\]/u);
  assert.match(
    workflow,
    /fieldgrid-v1-wp1-staging-application-cleanup-v2/u,
  );
  assert.match(workflow, /environment:\s*staging/u);
  assert.match(workflow, /group:\s*veele-staging/u);
  assert.match(workflow, /GITHUB_REF" = "refs\/heads\/main/u);
  assert.match(workflow, /GITHUB_SHA" = "\$EXPECTED_MAIN_SHA/u);
  assert.match(workflow, /fieldgrid-v1-wp1-clean-base\.mjs --check/u);
  assert.match(workflow, /fieldgrid-v1-wp1-runner\.mjs/u);
  assert.match(
    workflow,
    /DATABASE_URL:\s*\$\{\{\s*secrets\.FIELDGRID_RUNTIME_DATABASE_URL\s*\}\}/u,
  );
  assert.match(
    workflow,
    /FIELDGRID_MIGRATION_DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/u,
  );
  assert.match(
    workflow,
    /FIELDGRID_WP1_TENANT_ID:\s*\$\{\{\s*secrets\.FIELDGRID_W00_STAGING_TENANT_A_ID\s*\}\}/u,
  );
  assert.doesNotMatch(workflow, /FIELDGRID_WP1_ADMIN_USER_ID/u);
  assert.match(workflow, /MOLLIE_API_KEY:/u);
  assert.match(
    workflow,
    /name:\s*wp1-\$\{\{\s*inputs\.mode\s*\}\}-\$\{\{\s*github\.run_id\s*\}\}-\$\{\{\s*github\.run_attempt\s*\}\}/u,
  );
  assert.match(
    workflow,
    /path:\s*artifacts\/fieldgrid-v1-wp1-clean-base\/result\.json/u,
  );
  assert.doesNotMatch(workflow, /PHASE2E_RUN_ID/u);
  assert.doesNotMatch(
    workflow,
    /test "\$RESET_MODE" != "apply"/u,
  );
});
