import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { test } from "node:test";

const roots = [
  "artifacts/backoffice/src",
  "artifacts/klant-pwa/src",
  "artifacts/personeel-pwa/src",
];

function sourceFiles(root) {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}

test("released interfaces contain no raw browser dialogs", () => {
  for (const path of roots.flatMap(sourceFiles)) {
    assert.doesNotMatch(
      readFileSync(path, "utf8"),
      /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/u,
      path,
    );
  }
});

test("content editors use the validated canonical prompt dialog", () => {
  for (const path of [
    "artifacts/backoffice/src/components/website/WebsiteRichTextEditor.tsx",
    "artifacts/backoffice/src/components/news/TipTapNewsEditor.tsx",
    "artifacts/backoffice/src/components/knowledgebase/TipTapKnowledgebaseEditor.tsx",
  ]) {
    assert.match(readFileSync(path, "utf8"), /PromptDialog/u, path);
  }
});

test("irreversible website actions use in-product confirmation", () => {
  for (const path of [
    "artifacts/backoffice/src/components/website/WebsiteBlogPostEditor.tsx",
    "artifacts/backoffice/src/components/website/WebsiteSectionCanvas.tsx",
    "artifacts/backoffice/src/components/website/WebsitePublicationReviewPanel.tsx",
    "artifacts/backoffice/src/components/website/WebsiteSubmissionActions.tsx",
  ]) {
    assert.match(readFileSync(path, "utf8"), /TenantConfirmDialog/u, path);
  }
});
