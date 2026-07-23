import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WebsiteStructuredData,
  buildWebsiteStructuredData,
  safeJsonLd,
  websiteCanonicalUrl,
  websiteSocialImageUrl,
} from "../src/lib/seo";
import { publicationSnapshot, TEST_IDS } from "./fixtures";

test("canonical and social metadata stay on validated publication fields", () => {
  const snapshot = publicationSnapshot();
  snapshot.defaultSeo.socialImageUrl =
    "https://cdn.example.test/default-social.jpg";
  const seo = {
    ...snapshot.pages[0]!.seo,
    canonicalPath: "/",
    socialImageUrl: "https://cdn.example.test/page-social.jpg",
  };
  assert.equal(
    websiteCanonicalUrl(snapshot, seo, "/diensten"),
    "https://alpha.fieldgrid.nl/",
  );
  assert.equal(
    websiteSocialImageUrl(snapshot, seo),
    "https://cdn.example.test/page-social.jpg",
  );
  assert.equal(
    websiteSocialImageUrl(snapshot, { ...seo, socialImageUrl: null }),
    "https://cdn.example.test/default-social.jpg",
  );
});

test("structured data derives fixed organization, breadcrumb, service and eligible FAQ nodes", () => {
  const snapshot = publicationSnapshot();
  const page = snapshot.pages[0]!;
  page.pageType = "service";
  page.title = "Onderhoud </script>";
  const faq = page.sections.find((section) => section.type === "faq");
  assert.ok(faq?.type === "faq");
  faq.content.schemaEligible = true;
  faq.content.items[0]!.question = "Is <script> toegestaan?";
  faq.content.items[0]!.answer = {
    type: "doc",
    schemaVersion: 2,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nee </script><script>alert(1)" }],
      },
    ],
  };
  snapshot.seoSettings.structuredData.organizationType =
    "home_and_construction_business";

  const data = buildWebsiteStructuredData(snapshot, { kind: "page", page });
  assert.ok(data);
  const graph = data["@graph"] as Array<Record<string, unknown>>;
  assert.ok(
    graph.some((node) => node["@type"] === "HomeAndConstructionBusiness"),
  );
  assert.ok(graph.some((node) => node["@type"] === "BreadcrumbList"));
  assert.ok(graph.some((node) => node["@type"] === "FAQPage"));
  assert.ok(graph.some((node) => node["@type"] === "Service"));

  const serialized = safeJsonLd(data);
  assert.doesNotMatch(serialized, /<script|<\/script/iu);
  assert.match(serialized, /\\u003cscript\\u003e/iu);
  const html = renderToStaticMarkup(
    <WebsiteStructuredData
      snapshot={snapshot}
      route={{ kind: "page", page }}
      nonce="runtime-nonce"
    />,
  );
  assert.match(html, /type="application\/ld\+json"/u);
  assert.match(html, /nonce="runtime-nonce"/u);
  assert.doesNotMatch(html, /<\/script><script>/iu);
});

test("article data uses canonical URL, publisher and immutable publication dates", () => {
  const snapshot = publicationSnapshot();
  const post = {
    id: "20000000-0000-4000-8000-000000000024",
    locale: "nl-NL",
    title: "Veilig werken",
    slug: "veilig-werken",
    path: "/blog/veilig-werken",
    excerpt: "Praktische uitleg.",
    body: {
      type: "doc" as const,
      schemaVersion: 2 as const,
      content: [{ type: "paragraph" as const, content: [] }],
    },
    categoryId: null,
    tagIds: [],
    seo: {
      title: "Veilig werken",
      description: "Praktische uitleg over veilig werken.",
      canonicalPath: null,
      socialImageMediaId: null,
      socialImageUrl: "https://cdn.example.test/article.jpg",
      indexable: true,
    },
    visibility: "published" as const,
    publishedAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-21T09:00:00.000Z",
  };
  const data = buildWebsiteStructuredData(snapshot, {
    kind: "blog_post",
    post,
  });
  assert.ok(data);
  const graph = data["@graph"] as Array<Record<string, unknown>>;
  const article = graph.find((node) => node["@type"] === "Article");
  assert.equal(
    article?.mainEntityOfPage,
    "https://alpha.fieldgrid.nl/blog/veilig-werken",
  );
  assert.equal(article?.datePublished, "2026-07-20T08:00:00.000Z");
  assert.deepEqual(article?.publisher, {
    "@id": "https://alpha.fieldgrid.nl/#organization",
  });
  assert.deepEqual(article?.image, ["https://cdn.example.test/article.jpg"]);
  assert.equal(snapshot.siteId, TEST_IDS.site);
});

test("structured data can be disabled without leaving an empty script", () => {
  const snapshot = publicationSnapshot();
  snapshot.seoSettings.structuredData.enabled = false;
  assert.equal(
    buildWebsiteStructuredData(snapshot, {
      kind: "page",
      page: snapshot.pages[0]!,
    }),
    null,
  );
  assert.equal(
    renderToStaticMarkup(
      <WebsiteStructuredData
        snapshot={snapshot}
        route={{ kind: "page", page: snapshot.pages[0]! }}
      />,
    ),
    "",
  );
});
