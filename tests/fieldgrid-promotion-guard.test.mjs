import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/promotion-guard.yml",
  "utf8",
);

test("resolved staging promotion branches must match the exact main tree", () => {
  assert.match(workflow, /head_branch" == codex\/promote-\*/u);
  assert.match(workflow, /PR_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/u);
  assert.match(workflow, /git fetch origin main --depth=1/u);
  assert.match(workflow, /git diff --quiet origin\/main "\$PR_HEAD_SHA"/u);
  assert.match(workflow, /Promotion branch differs from main/u);
  assert.doesNotMatch(workflow, /head_branch" == codex\/\*/u);
});
