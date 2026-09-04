import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  ".github/workflows/promotion-guard.yml",
  "utf8",
);

test("staging pull requests accept only main as their source", () => {
  assert.match(workflow, /base_branch" == "staging"/u);
  assert.match(workflow, /head_branch" == "main"/u);
  assert.doesNotMatch(workflow, /head_branch" == codex\/promote-/u);
  assert.doesNotMatch(workflow, /git diff --quiet origin\/main/u);
  assert.doesNotMatch(workflow, /exact main tree only/u);
});
