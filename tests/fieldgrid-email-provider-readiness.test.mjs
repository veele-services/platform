import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const script = readFileSync(
  "scripts/fieldgrid-email-provider-readiness.mts",
  "utf8",
);

test("staging deployment verifies transactional email readiness before activation", () => {
  const readinessIndex = workflow.indexOf(
    "Verify staging e-mail provider readiness",
  );
  const migrationAdminIndex = workflow.indexOf(
    "Verify migration-admin ownership before runtime principal cutover",
    readinessIndex,
  );
  const activationIndex = workflow.indexOf("Activate release");

  assert.notEqual(readinessIndex, -1);
  assert.notEqual(migrationAdminIndex, -1);
  assert.ok(readinessIndex < activationIndex);
  const readinessBlock = workflow.slice(readinessIndex, migrationAdminIndex);
  assert.match(
    readinessBlock,
    /FIELDGRID_MIGRATION_DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/u,
  );
  assert.match(
    readinessBlock,
    /pnpm fieldgrid:email-provider-readiness --migration-database/u,
  );
  assert.doesNotMatch(workflow, /FIELDGRID_DATABASE_CONNECTION_PURPOSE/u);
  assert.match(script, /const MIGRATION_DATABASE_FLAG = "--migration-database"/u);
  assert.match(script, /FIELDGRID_DATABASE_CONNECTION_PURPOSE = "migration"/u);
  assert.match(script, /await import\(\s*"\.\.\/lib\/db\/src\/email-service\.ts"/u);
  assert.match(script, /provider\.isActive/u);
  assert.match(script, /provider\.configured/u);
  assert.match(script, /provider\.lastTestStatus === "success"/u);
  assert.match(
    script,
    /await import\(\s*"\.\.\/lib\/db\/src\/email-service\.ts"/u,
  );
  assert.doesNotMatch(script, /from "@workspace\/db/u);
  assert.doesNotMatch(script, /process\.env\.RESEND_API_KEY/u);
  assert.match(script, /process\.exitCode = 1/u);
});
