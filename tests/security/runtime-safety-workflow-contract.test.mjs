import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8").replace(/\r\n/gu, "\n");
}

test("runtime safety workflow exposes required Linux PR jobs", () => {
  const workflow = read(".github/workflows/runtime-safety-harness.yml");

  assert.match(workflow, /on:\s*\n\s+pull_request:\s*\n\s+branches:\s*\n\s+- main/u);
  for (const job of [
    "contract-static",
    "unit-domain",
    "security-source",
    "migration-order",
    "typecheck",
    "build",
    "diff-check",
    "postgres17-migration-smoke",
    "db-integration-tenant-ab",
    "rls-security",
    "phase-b-previous-release-database-compatibility",
    "api-runtime",
  ]) {
    assert.match(workflow, new RegExp(`\\n  ${job}:\\n    name: ${job}\\n    runs-on: ubuntu-latest`, "u"));
  }
});

test("runtime safety workflow runs the required gate commands", () => {
  const workflow = read(".github/workflows/runtime-safety-harness.yml");

  for (const command of [
    "pnpm fieldgrid:test:contract-static",
    "pnpm fieldgrid:test:unit-domain",
    "pnpm fieldgrid:test:security-source",
    "pnpm fieldgrid:migration-order-check:check",
    "pnpm run typecheck",
    "pnpm build",
    "git diff --check origin/${{ github.base_ref }}...HEAD",
    "pnpm fieldgrid:test:postgres17-migration-smoke",
    "pnpm fieldgrid:test:db-integration-tenant-ab",
    "pnpm fieldgrid:test:rls-security",
    "pnpm fieldgrid:test:phase-b-previous-release-database-compatibility",
    "pnpm fieldgrid:test:api-runtime",
  ]) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});
