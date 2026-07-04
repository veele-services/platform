import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("database autofix runs on main and staging environment DATABASE_URL secrets", () => {
  const workflow = read(".github/workflows/database-autofix.yml");
  const docs = read("docs/deployment/self-hosted-runner.md");

  assert.match(workflow, /name:\s*Database Autofix/u);
  assert.match(workflow, /target_environment:/u);
  assert.match(workflow, /branches:\s*\r?\n\s+- main\s*\r?\n\s+- staging/u);
  assert.match(workflow, /options:\s*\r?\n\s+- main\s*\r?\n\s+- staging/u);
  assert.match(workflow, /environment:\s*\r?\n\s+name:\s*\$\{\{/u);
  assert.match(workflow, /DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/u);
  assert.match(workflow, /pnpm run db:migrate/u);
  assert.match(workflow, /veele-\$\{\{/u);
  assert.doesNotMatch(workflow, /FIELDGRID_MIGRATION_SMOKE_(EMPTY|STAGING_COPY)_DATABASE_URL/u);

  assert.match(docs, /Database Autofix workflow/u);
  assert.match(docs, /`main` and `staging`/u);
  assert.match(docs, /`DATABASE_URL` from environment secrets/u);
});
