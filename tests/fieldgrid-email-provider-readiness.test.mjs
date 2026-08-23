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
  const activationIndex = workflow.indexOf("Activate release");

  assert.notEqual(readinessIndex, -1);
  assert.ok(readinessIndex < activationIndex);
  assert.match(workflow, /pnpm fieldgrid:email-provider-readiness/u);
  assert.match(script, /provider\.isActive/u);
  assert.match(script, /provider\.configured/u);
  assert.match(script, /provider\.lastTestStatus === "success"/u);
  assert.match(
    script,
    /from "\.\.\/lib\/db\/src\/email-service\.ts"/u,
  );
  assert.doesNotMatch(script, /from "@workspace\/db/u);
  assert.doesNotMatch(script, /process\.env\.RESEND_API_KEY/u);
  assert.match(script, /process\.exitCode = 1/u);
});
