import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("database mutations are manual and staging-only", () => {
  const workflow = read(".github/workflows/database-autofix.yml");
  const deployWorkflow = read(".github/workflows/deploy.yml");
  const docs = read("docs/operations/main-staging-promotion.md");

  assert.match(workflow, /name:\s*Database Autofix/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /\n\s*push:/u);
  assert.doesNotMatch(workflow, /target_environment:/u);
  assert.match(workflow, /if:\s*github\.ref_name == 'staging'/u);
  assert.match(workflow, /environment:\s*staging/u);
  assert.match(workflow, /TARGET_ENVIRONMENT:\s*staging/u);
  assert.match(workflow, /APP_ENV:\s*staging/u);
  assert.match(workflow, /EXPECTED_SUPABASE_PROJECT_REF:\s*olyfmekyqozxrbrwwszu/u);
  assert.match(workflow, /DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/u);
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL:\s*\$\{\{\s*secrets\.NEXT_PUBLIC_SUPABASE_URL\s*\}\}/u);
  assert.match(workflow, /pnpm run db:migrate/u);
  assert.match(workflow, /group:\s*veele-staging/u);
  assert.doesNotMatch(workflow, /FIELDGRID_MIGRATION_SMOKE_(EMPTY|STAGING_COPY)_DATABASE_URL/u);
  assert.doesNotMatch(workflow, /\bmain\b/u);

  assert.match(deployWorkflow, /branches:\s*\r?\n(?:\s+- [^\r\n]+\r?\n)*\s+- staging/u);
  assert.doesNotMatch(deployWorkflow, /\s+- main(?:\r?\n|$)/u);

  assert.match(docs, /`main` is the canonical source branch/u);
  assert.match(docs, /`main` has no database/u);
  assert.match(docs, /`staging` is a release pointer/u);
  assert.match(docs, /must resolve to the exact promoted `main` commit SHA/u);
  assert.match(docs, /Database Autofix is manual-only/u);
});
