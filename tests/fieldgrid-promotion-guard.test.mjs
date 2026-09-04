import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/promotion-guard.yml",
  "utf8",
);

test("staging pull requests fail closed in favor of exact-ref promotion", () => {
  assert.match(workflow, /base_branch" == "staging"/u);
  assert.match(workflow, /Staging pull requests are forbidden/u);
  assert.match(workflow, /guarded fast-forward command/u);
  assert.doesNotMatch(workflow, /head_branch" == "main"/u);
  assert.doesNotMatch(workflow, /head_branch" == codex\/promote-/u);
  assert.doesNotMatch(workflow, /git diff --quiet origin\/main/u);
  assert.doesNotMatch(workflow, /exact main tree only/u);
});
