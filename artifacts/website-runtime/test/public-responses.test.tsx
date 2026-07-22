import assert from "node:assert/strict";
import test from "node:test";
import { websitePublicationSnapshotSchema } from "@workspace/website-core";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  managedWebsiteRobotsResponse,
  managedWebsiteSitemapResponse,
} from "../src/lib/public-responses";
import { ManagedWebsiteView } from "../src/lib/render-document";
import { requestPathOwner } from "../src/lib/request";
import {
  publicationSnapshot,
  readyResolution,
  websiteRequest,
} from "./fixtures";

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
    <ManagedWebsiteView resolution={ready} page={snapshot.pages[0]!} />,
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
