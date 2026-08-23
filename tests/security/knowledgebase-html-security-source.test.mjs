import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  sanitizeKnowledgebaseEmbedUrl,
  sanitizeKnowledgebaseHtml,
} from "../../lib/shared-ui/src/knowledgebase-html.ts";

const root = new URL("../../", import.meta.url);

const executablePayloads = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<svg onload=alert(1)></svg>",
  '<a href="javascript:alert(1)">x</a>',
  '<a href="java\nscript:alert(1)">x</a>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="javascript:alert(1)"></object>',
  '<div style="background:url(javascript:alert(1))"></div>',
];

test("knowledgebase executable payloads are inert in the canonical parser boundary", () => {
  for (const payload of executablePayloads) {
    const sanitized = sanitizeKnowledgebaseHtml(payload);
    assert.doesNotMatch(
      sanitized,
      /<script|<svg|<object|\sonerror|\sonload|\sstyle=|javascript:|srcdoc/iu,
      payload,
    );
  }
});

test("knowledgebase storage and every renderer share the canonical safety contract", async () => {
  const files = [
    "artifacts/backoffice/src/app/actions/knowledgebase.ts",
    "artifacts/backoffice/src/components/knowledgebase/KnowledgebaseContentRenderer.tsx",
    "artifacts/klant-pwa/src/components/KnowledgebaseContentRenderer.tsx",
    "artifacts/personeel-pwa/src/components/KnowledgebaseContentRenderer.tsx",
  ];

  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.match(source, /sanitizeKnowledgebaseHtml/u, file);
  }

  const action = await readFile(
    new URL("artifacts/backoffice/src/app/actions/knowledgebase.ts", root),
    "utf8",
  );
  assert.doesNotMatch(action, /function sanitizeHtmlFragment/u);
});

test("knowledgebase iframes are exact-provider embeds with fixed sandboxing", () => {
  assert.ok(
    sanitizeKnowledgebaseEmbedUrl(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ),
  );
  assert.equal(
    sanitizeKnowledgebaseEmbedUrl("https://attacker.example/embed/video"),
    null,
  );

  const sanitized = sanitizeKnowledgebaseHtml(
    '<iframe src="https://player.vimeo.com/video/123456" srcdoc="x"></iframe>',
  );
  assert.match(sanitized, /sandbox="allow-scripts allow-same-origin allow-presentation"/u);
  assert.doesNotMatch(sanitized, /srcdoc/iu);
});
