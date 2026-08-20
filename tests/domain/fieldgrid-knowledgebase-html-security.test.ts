import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeKnowledgebaseEmbedUrl,
  sanitizeKnowledgebaseHtml,
} from "../../lib/shared-ui/src/knowledgebase-html.ts";

const ACTIVE_HTML_PATTERN =
  /<(?:script|style|object|embed|svg|math|form|input|button|meta|base|link)\b|\son[a-z]+\s*=|\sstyle\s*=|(?:javascript|vbscript|data)\s*:/iu;

test("knowledgebase sanitizer removes executable HTML payloads", () => {
  const payloads = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)></svg>",
    '<a href="javascript:alert(1)">x</a>',
    '<a href="java\nscript:alert(1)">x</a>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<object data="javascript:alert(1)"></object>',
    '<div style="background:url(javascript:alert(1))"></div>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--></mglyph><img src=1 onerror=alert(1)>',
    '<svg><textarea><img src=x onerror=alert(1)></textarea></svg>',
    '<img src="data:text/html,<script>alert(1)</script>">',
  ];

  for (const payload of payloads) {
    const sanitized = sanitizeKnowledgebaseHtml(payload);
    assert.doesNotMatch(sanitized, ACTIVE_HTML_PATTERN, payload);
    assert.doesNotMatch(sanitized, /srcdoc/iu, payload);
  }
});

test("knowledgebase sanitizer preserves the explicitly supported content model", () => {
  const sanitized = sanitizeKnowledgebaseHtml(`
    <h2>Uitleg</h2>
    <p>Veilige <strong>inhoud</strong> met <a href="https://fieldgrid.nl/help" target="_blank">link</a>.</p>
    <ol><li>Stap een</li></ol><ul><li>Controle</li></ul>
    <div data-type="callout" data-tone="warning"><p>Let op</p></div>
    <table><thead><tr><th scope="col">Kolom</th></tr></thead><tbody><tr><td>Waarde</td></tr></tbody></table>
    <figure data-type="kb-media" data-media-type="image"><img src="/help/media/123e4567-e89b-12d3-a456-426614174000" alt="Voorbeeld"></figure>
    <video src="https://cdn.fieldgrid.nl/video/demo.mp4"></video>
  `);

  for (const expected of [
    "<h2>Uitleg</h2>",
    "<strong>inhoud</strong>",
    "noopener noreferrer",
    '<div data-type="callout" data-tone="warning">',
    "<table>",
    'scope="col"',
    'alt="Voorbeeld"',
    "controls",
  ]) {
    assert.ok(sanitized.includes(expected), expected);
  }
});

test("knowledgebase media rewriting is parser based and keeps only recognized media ids", () => {
  const sanitized = sanitizeKnowledgebaseHtml(
    '<img src="/platform/knowledgebase/media/123e4567-e89b-12d3-a456-426614174000"><a href="/help/media/not-a-uuid<script>">x</a>',
    { mediaBasePath: "/admin/help/media" },
  );

  assert.match(
    sanitized,
    /src="\/admin\/help\/media\/123e4567-e89b-12d3-a456-426614174000"/u,
  );
  assert.doesNotMatch(sanitized, /<script/iu);
});

test("knowledgebase embeds accept only canonical HTTPS YouTube and Vimeo players", () => {
  const accepted = [
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ?start=10",
    "https://player.vimeo.com/video/123456789",
  ];
  const rejected = [
    "https://example.com/embed/video",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com.evil.test/embed/dQw4w9WgXcQ",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
  ];

  for (const url of accepted) assert.ok(sanitizeKnowledgebaseEmbedUrl(url), url);
  for (const url of rejected) assert.equal(sanitizeKnowledgebaseEmbedUrl(url), null, url);

  const sanitized = sanitizeKnowledgebaseHtml(
    `<iframe src="${accepted[0]}" srcdoc="<script>alert(1)</script>" onload="alert(1)"></iframe>
     <iframe src="${rejected[0]}"></iframe>`,
  );
  assert.equal((sanitized.match(/<iframe/gu) ?? []).length, 1);
  assert.match(sanitized, /sandbox="allow-scripts allow-same-origin allow-presentation"/u);
  assert.doesNotMatch(sanitized, /srcdoc|onload|example\.com/iu);
});
