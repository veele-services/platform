import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  canOpenPublicationDiagnostic,
  presentPublicationDiagnostic,
} from "../../artifacts/backoffice/src/components/website/website-publication-diagnostics";

const pages = [{ id: "page-123", title: "Home" }];

const reviewPanel = readFileSync(
  new URL(
    "../../artifacts/backoffice/src/components/website/WebsitePublicationReviewPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const sectionCanvas = readFileSync(
  new URL(
    "../../artifacts/backoffice/src/components/website/WebsiteSectionCanvas.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("the review UI hides compiler messages and technical diagnostic paths", () => {
  assert.doesNotMatch(reviewPanel, /\{diagnostic\.message\}/u);
  assert.doesNotMatch(
    reviewPanel,
    /<code[^>]*>[\s\S]*?\{diagnostic\.path\}[\s\S]*?<\/code>/u,
  );
  assert.match(reviewPanel, /presentPublicationDiagnostic/u);
  assert.match(sectionCanvas, /id=\{`sectie-\$\{section\.id\}`\}/u);
});

test("review diagnostics explain the required action without exposing IDs", () => {
  const result = presentPublicationDiagnostic(
    {
      severity: "error",
      code: "template_content_requires_review",
      path: "pages.page-123.sections.section-456.requiresReview",
    },
    pages,
  );

  assert.deepEqual(result, {
    title: "Keur een sectie op ‘Home’ goed",
    explanation:
      "Open de sectie, controleer de inhoud, zet ‘Inhoud gecontroleerd’ aan en sla de sectie op.",
    actionLabel: "Naar deze sectie",
    href: "/website/pages/page-123#sectie-section-456",
  });
  assert.doesNotMatch(`${result.title} ${result.explanation}`, /page-123|section-456/u);
});

test("diagnostics link to the editor that can resolve the problem", () => {
  const cases = [
    ["navigation_cycle", "navigation.item-1.parentId", "/website/navigation"],
    ["redirect_page_collision", "redirects.redirect-1.sourcePath", "/website/redirects"],
    ["draft_form_excluded", "forms.form-1.status", "/website/forms"],
    ["draft_page_excluded", "pages.page-123.status", "#conceptpaginas"],
  ] as const;

  for (const [code, path, expectedHref] of cases) {
    const result = presentPublicationDiagnostic(
      { severity: "error", code, path },
      pages,
    );
    assert.equal(result.href, expectedHref, code);
    assert.ok(result.actionLabel?.startsWith("Naar"), code);
  }
});

test("unknown page diagnostics still use a plain-language fallback", () => {
  const result = presentPublicationDiagnostic(
    {
      severity: "error",
      code: "invalid_type",
      path: "pages.page-123.sections.section-456.content.title",
    },
    pages,
  );

  assert.equal(result.title, "Controleer Home");
  assert.equal(result.actionLabel, "Naar deze sectie");
  assert.equal(result.href, "/website/pages/page-123#sectie-section-456");
});

test("draft warnings keep human names while hiding diagnostic paths", () => {
  const result = presentPublicationDiagnostic(
    {
      severity: "warning",
      code: "draft_blog_post_excluded",
      path: "blog.posts.post-789.status",
      message:
        "Zo onderhoudt u uw dak staat nog op concept en wordt niet opgenomen in de publieke blog.",
    },
    pages,
  );

  assert.equal(result.title, "‘Zo onderhoudt u uw dak’ staat nog als concept");
  assert.equal(result.href, "/website/blog/post-789");
  assert.doesNotMatch(`${result.title} ${result.explanation}`, /post-789/u);
});

test("actions respect independently configured website permissions", () => {
  const restricted = { settings: false, navigation: false, forms: false };
  assert.equal(
    canOpenPublicationDiagnostic("/website/navigation", restricted),
    false,
  );
  assert.equal(
    canOpenPublicationDiagnostic("/website/redirects", restricted),
    false,
  );
  assert.equal(
    canOpenPublicationDiagnostic("/website/forms", restricted),
    false,
  );
  assert.equal(
    canOpenPublicationDiagnostic("/website/pages/page-123", restricted),
    true,
  );
});

test("non-actionable blockers and capability warnings do not offer dead links", () => {
  const domain = presentPublicationDiagnostic(
    {
      severity: "error",
      code: "primary_domain_missing",
      path: "site.canonicalHostname",
    },
    pages,
  );
  assert.equal(domain.href, null);
  assert.match(domain.explanation, /platformbeheerder/u);

  const media = presentPublicationDiagnostic(
    {
      severity: "warning",
      code: "section_media_resolution_pending",
      path: "pages.page-123.sections.section-456",
    },
    pages,
  );
  assert.equal(media.href, null);
  assert.match(media.explanation, /nog niet/u);
});

test("missing form bindings route to the form workflow", () => {
  const result = presentPublicationDiagnostic(
    {
      severity: "error",
      code: "missing_published_form",
      path: "pages.page-123.sections.section-456.content.formId",
    },
    pages,
  );
  assert.equal(result.href, "/website/forms");
  assert.equal(result.actionLabel, "Naar formulieren");
});
