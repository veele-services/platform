import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cleanBaseManifest, validateCleanBaseManifest } from "../scripts/fieldgrid-v1-wp1-clean-base.mjs";

test("WP1 clean-base manifest is staging-only, bounded and provider-safe", () => {
  assert.deepEqual(validateCleanBaseManifest(), []);
  assert.equal(cleanBaseManifest.target.environment, "staging");
  assert.ok(cleanBaseManifest.prohibited.includes("auth.users SQL wipe"));
  assert.ok(cleanBaseManifest.prohibited.includes("storage.objects SQL wipe"));
  assert.ok(cleanBaseManifest.stopConditions.includes("active or unknown payment"));
  assert.ok(cleanBaseManifest.canonical.includes("isolation tenant"));
});

test("WP1 workflow is manual, main-bound, approval-protected and exact-SHA gated", () => {
  const workflow = readFileSync(".github/workflows/fieldgrid-v1-wp1-clean-base.yml", "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|\npush:/);
  assert.match(workflow, /expected_main_sha:/);
  assert.match(workflow, /fieldgrid-v1-wp1-clean-reset-v1/);
  assert.match(workflow, /environment:\s*staging/);
  assert.match(workflow, /group:\s*veele-staging/);
  assert.match(workflow, /GITHUB_REF" = "refs\/heads\/main/);
  assert.match(workflow, /GITHUB_SHA" = "\$EXPECTED_MAIN_SHA/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /fieldgrid-v1-wp1-clean-base\.mjs --check/);
});
