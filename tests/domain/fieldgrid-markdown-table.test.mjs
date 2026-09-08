import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownTableCell } from "../../lib/db/scripts/markdown-table.mjs";

test("Markdown table cells escape backslashes before pipes and flatten lines", () => {
  assert.equal(
    markdownTableCell("left\\|middle\r\nright|end"),
    String.raw`left\\\|middle right\|end`,
  );
  assert.equal(markdownTableCell("left\rright"), "left right");
  assert.equal(markdownTableCell(null), "null");
});
