import assert from "node:assert/strict";
import test from "node:test";
import { websitePublicationSnapshotSchema } from "@workspace/website-core";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  managedWebsiteFeedResponse,
  managedWebsiteRobotsResponse,
  managedWebsiteRedirectResponse,
  managedWebsiteSitemapResponse,
} from "../src/lib/public-responses";
import {
  ManagedWebsiteBlogPostView,
  ManagedWebsiteView,
} from "../src/lib/render-document";
import { requestPathOwner } from "../src/lib/request";
import {
  publicationSnapshot,
  readyResolution,
  TEST_IDS,
  websiteRequest,
} from "./fixtures";

function blogSnapshot() {
  const snapshot = publicationSnapshot();
  snapshot.pages.push({
    id: "20000000-0000-4000-8000-000000000021",
    locale: "nl-NL",
    path: "/blog",
    pageType: "blog_index",
    title: "Blog",
    seo: {
      title: "Blog | Alpha Service",
      description: "Nieuws en praktische uitleg.",
      canonicalPath: null,
      socialImageMediaId: null,
      socialImageUrl: null,
      indexable: true,
    },
    sections: [],
  });
  snapshot.blog = {
    categories: [
      {
        id: "20000000-0000-4000-8000-000000000022",
        locale: "nl-NL",
        name: "Advies",
        slug: "advies",
        path: "/blog/categorie/advies",
        description: "Praktische adviezen.",
      },
    ],
    tags: [
      {
        id: "20000000-0000-4000-8000-000000000023",
        locale: "nl-NL",
        name: "Veiligheid",
        slug: "veiligheid",
        path: "/blog/tag/veiligheid",
      },
    ],
    posts: [
      {
        id: "20000000-0000-4000-8000-000000000024",
        locale: "nl-NL",
        title: "Veilig <werken>",
        slug: "veilig-werken",
        path: "/blog/veilig-werken",
        excerpt: "Praktische uitleg & advies.",
        body: {
          type: "doc",
          schemaVersion: 2,
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "<script>alert(1)</script> " },
                {
                  type: "text",
                  text: "Contact",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "/contact" },
                    },
                  ],
                },
              ],
            },
          ],
        },
        categoryId: "20000000-0000-4000-8000-000000000022",
        tagIds: ["20000000-0000-4000-8000-000000000023"],
        seo: {
          title: "Veilig werken",
          description: "Praktische uitleg over veilig werken.",
          canonicalPath: null,
          socialImageMediaId: null,
          socialImageUrl: null,
          indexable: true,
        },
        visibility: "published",
        publishedAt: "2026-01-10T09:00:00.000Z",
        updatedAt: "2026-01-10T09:00:00.000Z",
      },
      {
        id: "20000000-0000-4000-8000-000000000025",
        locale: "nl-NL",
        title: "Privéconcept",
        slug: "priveconcept",
        path: "/blog/priveconcept",
        excerpt: "Niet voor publieke bezoekers.",
        body: {
          type: "doc",
          schemaVersion: 2,
          content: [{ type: "paragraph", content: [] }],
        },
        categoryId: null,
        tagIds: [],
        seo: {
          title: "Privéconcept",
          description: "Niet voor publieke bezoekers.",
          canonicalPath: null,
          socialImageMediaId: null,
          socialImageUrl: null,
          indexable: false,
        },
        visibility: "preview",
        publishedAt: null,
        updatedAt: "2026-01-11T09:00:00.000Z",
      },
    ],
  };
  return websitePublicationSnapshotSchema.parse(snapshot);
}

test("managed page renders all MVP sections as escaped server markup", () => {
  const snapshot = structuredClone(publicationSnapshot());
  const hero = snapshot.pages[0]?.sections[0];
  if (hero?.type === "hero") hero.content.title = "<script>alert(1)</script>";
  snapshot.navigation.push({
    id: "20000000-0000-4000-8000-000000000098",
    label: "Nieuwe tab",
    location: "header",
    parentId: null,
    linkType: "page",
    pageId: snapshot.pages[0]!.id,
    href: "/",
    target: "blank",
    position: 0,
  });
  const ready = readyResolution(snapshot);
  const html = renderToStaticMarkup(
    <ManagedWebsiteView
      snapshot={ready.snapshot}
      page={snapshot.pages[0]!}
      deliveryRevision={ready.deliveryRevision}
    />,
  );
  assert.match(html, /data-delivery-revision="3"/u);
  for (const className of [
    "hero",
    "trust",
    "services",
    "features",
    "process",
    "testimonials",
    "faq",
    "cta",
    "contact",
  ]) {
    assert.match(html, new RegExp(`class="[^"]*${className}`, "u"));
  }
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.doesNotMatch(html, /<script>alert/u);
  assert.match(html, /<form[^>]*contact-form/u);
  assert.match(html, /<button[^>]*disabled/u);
  assert.match(html, /href="\/" target="_blank" rel="noopener noreferrer"/u);
});

test("managed live page renders a same-origin, idempotent public form", () => {
  const snapshot = publicationSnapshot();
  const html = renderToStaticMarkup(
    <ManagedWebsiteView
      snapshot={snapshot}
      page={snapshot.pages[0]!}
      deliveryRevision={snapshot.deliveryRevision}
      submissionId="30000000-0000-4000-8000-000000000099"
      formState="verzonden"
    />,
  );
  assert.match(
    html,
    new RegExp(`action="/api/website-forms/${TEST_IDS.form}/submissions"`, "u"),
  );
  assert.match(html, /method="post"/u);
  assert.match(
    html,
    /name="_submissionId" value="30000000-0000-4000-8000-000000000099"/u,
  );
  assert.match(html, /name="_companyWebsite"/u);
  assert.match(html, /required=""/u);
  assert.match(html, /Uw aanvraag is ontvangen\./u);
  assert.doesNotMatch(html, /notificationEmail/u);
});

test("managed page renders allowlisted TipTap JSON without an HTML escape hatch", () => {
  const source = structuredClone(publicationSnapshot());
  source.pages[0]!.sections.push({
    id: "20000000-0000-4000-8000-000000000097",
    type: "rich_text",
    schemaVersion: 1,
    variant: "narrow",
    visible: true,
    content: {
      title: "Over onze aanpak",
      body: {
        type: "doc",
        schemaVersion: 2,
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Veilig gerenderd" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Lees " },
              {
                type: "text",
                text: "meer",
                marks: [
                  {
                    type: "link",
                    attrs: {
                      href: "https://example.test/uitleg",
                      target: "_blank",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  });
  const snapshot = websitePublicationSnapshotSchema.parse(source);
  const html = renderToStaticMarkup(
    <ManagedWebsiteView
      snapshot={snapshot}
      page={snapshot.pages[0]!}
      deliveryRevision={readyResolution(snapshot).deliveryRevision}
    />,
  );
  assert.match(html, /rich-text-narrow/u);
  assert.match(html, /<h2>Veilig gerenderd<\/h2>/u);
  assert.match(
    html,
    /href="https:\/\/example\.test\/uitleg" rel="noopener noreferrer" target="_blank"/u,
  );
  assert.doesNotMatch(html, /dangerouslySetInnerHTML|javascript:/u);
});

test("blog index and detail render only allowlisted immutable content", () => {
  const snapshot = blogSnapshot();
  const index = snapshot.pages.find((page) => page.pageType === "blog_index")!;
  const indexHtml = renderToStaticMarkup(
    <ManagedWebsiteView
      snapshot={snapshot}
      page={index}
      deliveryRevision={snapshot.deliveryRevision}
    />,
  );
  assert.match(indexHtml, /Veilig &lt;werken&gt;/u);
  assert.doesNotMatch(indexHtml, /Privéconcept/u);

  const postHtml = renderToStaticMarkup(
    <ManagedWebsiteBlogPostView
      snapshot={snapshot}
      post={snapshot.blog.posts[0]!}
      deliveryRevision={snapshot.deliveryRevision}
    />,
  );
  assert.match(postHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.doesNotMatch(postHtml, /<script>alert/u);
  assert.match(postHtml, /href="\/blog\/tag\/veiligheid"/u);
  assert.match(postHtml, /href="\/contact">Contact<\/a>/u);

  const previewPrefix = "/admin/website-preview/fgwp1.opaque.signature";
  const previewPostHtml = renderToStaticMarkup(
    <ManagedWebsiteBlogPostView
      snapshot={snapshot}
      post={snapshot.blog.posts[0]!}
      deliveryRevision={snapshot.deliveryRevision}
      internalPathPrefix={previewPrefix}
    />,
  );
  assert.match(
    previewPostHtml,
    /href="\/admin\/website-preview\/fgwp1\.opaque\.signature\/contact">Contact<\/a>/u,
  );
  assert.doesNotMatch(previewPostHtml, /href="\/contact"/u);
});

test("shared renderer keeps every internal preview navigation inside its opaque boundary", () => {
  const snapshot = publicationSnapshot();
  snapshot.pages[0]!.sections.push({
    id: "20000000-0000-4000-8000-000000000096",
    type: "rich_text",
    schemaVersion: 1,
    variant: "narrow",
    visible: true,
    content: {
      title: "Previewlinks",
      body: {
        type: "doc",
        schemaVersion: 2,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Contactinhoud",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "/contact" },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  });
  const ready = readyResolution(snapshot);
  const prefix = "/admin/website-preview/fgwp1.opaque.signature";
  const html = renderToStaticMarkup(
    <ManagedWebsiteView
      snapshot={snapshot}
      page={snapshot.pages[0]!}
      deliveryRevision={ready.deliveryRevision}
      internalPathPrefix={prefix}
    />,
  );

  assert.match(
    html,
    /href="\/admin\/website-preview\/fgwp1\.opaque\.signature\/"/u,
  );
  assert.match(
    html,
    /href="\/admin\/website-preview\/fgwp1\.opaque\.signature\/contact"/u,
  );
  assert.match(
    html,
    /href="\/admin\/website-preview\/fgwp1\.opaque\.signature\/contact">Contactinhoud<\/a>/u,
  );
  assert.doesNotMatch(html, /href="\/contact"/u);
});

test("application prefixes never fall through to the website renderer", () => {
  for (const pathname of [
    "/admin",
    "/personeel/opdrachten",
    "/klant",
    "/api/private",
  ]) {
    assert.notEqual(
      requestPathOwner("alpha.fieldgrid.nl", pathname),
      "website",
      pathname,
    );
  }
});

test("robots fails closed for unknown and known-unavailable sites", async () => {
  assert.equal(
    (
      await managedWebsiteRobotsResponse(websiteRequest(), async () => ({
        status: "not_found",
      }))
    ).status,
    404,
  );
  const unavailable = await managedWebsiteRobotsResponse(
    websiteRequest(),
    async () => ({
      status: "unavailable",
      reason: "site_inactive",
    }),
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("retry-after"), "60");
  assert.equal(unavailable.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("robots ETag revalidation is bound to the active publication revision", async () => {
  const ready = readyResolution();
  const robotsEtag = ready.etag.replace(/"$/u, '-robots"');
  const response = await managedWebsiteRobotsResponse(
    websiteRequest("/robots.txt", { "if-none-match": robotsEtag }),
    async () => ready,
  );
  assert.equal(response.status, 304);
  assert.equal(await response.text(), "");
});

test("feed and sitemap expose published blog routes without preview content", async () => {
  const ready = readyResolution(blogSnapshot());
  const [feed, sitemap] = await Promise.all([
    managedWebsiteFeedResponse(websiteRequest("/feed.xml"), async () => ready),
    managedWebsiteSitemapResponse(
      websiteRequest("/sitemap.xml"),
      async () => ready,
    ),
  ]);
  assert.equal(feed.status, 200);
  assert.equal(
    feed.headers.get("content-type"),
    "application/rss+xml; charset=utf-8",
  );
  const feedBody = await feed.text();
  assert.match(feedBody, /Veilig &lt;werken&gt;/u);
  assert.match(feedBody, /Praktische uitleg &amp; advies/u);
  assert.doesNotMatch(feedBody, /Privéconcept/u);

  const sitemapBody = await sitemap.text();
  assert.match(sitemapBody, /\/blog\/veilig-werken/u);
  assert.match(sitemapBody, /\/blog\/categorie\/advies/u);
  assert.match(sitemapBody, /\/blog\/tag\/veiligheid/u);
  assert.doesNotMatch(sitemapBody, /priveconcept/u);
});

test("robots and sitemap use the exact canonical publication host", async () => {
  const value = structuredClone(publicationSnapshot());
  value.pages.push({
    ...value.pages[0]!,
    id: "20000000-0000-4000-8000-000000000099",
    path: "/intern",
    title: "Intern",
    seo: { ...value.pages[0]!.seo, indexable: false },
    sections: [],
  });
  const snapshot = websitePublicationSnapshotSchema.parse(value);
  const ready = readyResolution(snapshot);

  const robots = await managedWebsiteRobotsResponse(
    websiteRequest("/robots.txt"),
    async () => ready,
  );
  const robotsText = await robots.text();
  assert.match(robotsText, /Disallow: \/admin/u);
  assert.match(
    robotsText,
    /Sitemap: https:\/\/alpha\.fieldgrid\.nl\/sitemap\.xml/u,
  );

  const sitemap = await managedWebsiteSitemapResponse(
    websiteRequest("/sitemap.xml"),
    async () => ready,
  );
  const sitemapText = await sitemap.text();
  assert.match(sitemapText, /<loc>https:\/\/alpha\.fieldgrid\.nl\/<\/loc>/u);
  assert.doesNotMatch(sitemapText, /intern/u);
});

test("sitemap excludes duplicate routes whose canonical points elsewhere", async () => {
  const value = structuredClone(publicationSnapshot());
  value.pages.push({
    ...value.pages[0]!,
    id: "20000000-0000-4000-8000-000000000097",
    path: "/dubbel",
    title: "Dubbele landingspagina",
    seo: {
      ...value.pages[0]!.seo,
      canonicalPath: "/",
    },
    sections: [],
  });
  const ready = readyResolution(websitePublicationSnapshotSchema.parse(value));
  const sitemap = await managedWebsiteSitemapResponse(
    websiteRequest("/sitemap.xml"),
    async () => ready,
  );
  const sitemapText = await sitemap.text();
  assert.match(sitemapText, /<loc>https:\/\/alpha\.fieldgrid\.nl\/<\/loc>/u);
  assert.doesNotMatch(sitemapText, /\/dubbel/u);
});

test("managed redirects preserve exact status and canonicalize internal targets", async () => {
  for (const statusCode of [301, 302, 308] as const) {
    const value = structuredClone(publicationSnapshot());
    value.redirects = [
      {
        id: `20000000-0000-4000-8000-000000000${statusCode === 301 ? "301" : statusCode === 302 ? "302" : "308"}`,
        locale: "nl-NL",
        sourcePath: `/oud-${statusCode}`,
        destinationType: "path",
        destination: "/",
        statusCode,
      },
    ];
    const snapshot = websitePublicationSnapshotSchema.parse(value);
    const response = await managedWebsiteRedirectResponse(
      websiteRequest(`/oud-${statusCode}?bron=boekmerk`),
      async () => readyResolution(snapshot),
    );
    assert.equal(response?.status, statusCode);
    assert.equal(
      response?.headers.get("location"),
      "https://alpha.fieldgrid.nl/?bron=boekmerk",
    );
  }
});

test("external managed redirects require the immutable snapshot and do not leak query parameters", async () => {
  const value = structuredClone(publicationSnapshot());
  value.redirects = [
    {
      id: "20000000-0000-4000-8000-000000000309",
      locale: "nl-NL",
      sourcePath: "/partner",
      destinationType: "external",
      destination: "https://partner.example/landing",
      statusCode: 302,
    },
  ];
  const response = await managedWebsiteRedirectResponse(
    websiteRequest("/partner?private=value"),
    async () => readyResolution(websitePublicationSnapshotSchema.parse(value)),
  );
  assert.equal(response?.status, 302);
  assert.equal(
    response?.headers.get("location"),
    "https://partner.example/landing",
  );
  assert.equal(
    await managedWebsiteRedirectResponse(websiteRequest("/unknown"), async () =>
      readyResolution(websitePublicationSnapshotSchema.parse(value)),
    ),
    null,
  );
});
