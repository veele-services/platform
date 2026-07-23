import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WebsitePublicationValidationError,
  buildWebsiteDraftPreviewSnapshot,
  buildWebsitePublicationSnapshot,
  serializeWebsitePublication,
  websitePublicationCacheIdentity,
  type WebsitePublicationSource,
} from "../src/index";

const siteId = "20000000-0000-4000-8000-000000000001";
const homeId = "30000000-0000-4000-8000-000000000001";
const contactId = "30000000-0000-4000-8000-000000000002";
const draftId = "30000000-0000-4000-8000-000000000003";
const heroId = "40000000-0000-4000-8000-000000000001";
const hiddenId = "40000000-0000-4000-8000-000000000002";
const homeNavId = "50000000-0000-4000-8000-000000000001";
const contactNavId = "50000000-0000-4000-8000-000000000002";
const externalNavId = "50000000-0000-4000-8000-000000000003";

const seo = {
  title: "Voorbeeldbedrijf",
  description: "Een geldige beschrijving voor de openbare voorbeeldwebsite.",
  socialImageMediaId: null,
  indexable: true,
} as const;

function sourceFixture(): WebsitePublicationSource {
  return {
    site: {
      id: siteId,
      authoringRevision: 7,
      deliveryRevision: 3,
      defaultLocale: "nl-NL",
      theme: {
        schemaVersion: 1,
        colors: {
          background: "#ffffff",
          foreground: "#0f172a",
          primary: "#0f766e",
          primaryForeground: "#ffffff",
          accent: "#ccfbf1",
          accentForeground: "#134e4a",
        },
        headingFont: "manrope",
        bodyFont: "inter",
        radius: "medium",
        spacing: "comfortable",
        logoMediaId: null,
        faviconMediaId: null,
      },
      contact: {
        companyName: "Voorbeeldbedrijf",
        email: "info@example.test",
        phone: "+31100000000",
        street: null,
        postalCode: null,
        city: null,
        countryCode: "NL",
        openingHours: [],
      },
      socialLinks: [],
      defaultSeo: seo,
    },
    canonicalHostname: "voorbeeld.fieldgrid.nl",
    pages: [
      {
        id: contactId,
        locale: "nl-NL",
        path: "/contact",
        pageType: "contact",
        title: "Contact",
        seo,
        status: "published",
        isHomepage: false,
        sections: [],
      },
      {
        id: draftId,
        locale: "nl-NL",
        path: "/concept",
        pageType: "standard",
        title: "Concept",
        seo,
        status: "draft",
        isHomepage: false,
        sections: [],
      },
      {
        id: homeId,
        locale: "nl-NL",
        path: "/",
        pageType: "home",
        title: "Home",
        seo,
        status: "published",
        isHomepage: true,
        sections: [
          {
            id: hiddenId,
            sectionKey: "unsupported_hidden_section",
            schemaVersion: 99,
            variantKey: "unsafe",
            position: 1,
            content: { html: "<script>alert(1)</script>" },
            isVisible: false,
          },
          {
            id: heroId,
            sectionKey: "hero",
            schemaVersion: 1,
            variantKey: "split",
            position: 0,
            content: {
              title: "Betrouwbare service",
              primaryAction: {
                kind: "page",
                label: "Neem contact op",
                pageId: contactId,
              },
              badges: [],
            },
            isVisible: true,
          },
        ],
      },
    ],
    navigation: [
      {
        id: externalNavId,
        label: "Branchevereniging",
        location: "footer_primary",
        parentId: null,
        pageId: null,
        linkType: "external",
        href: "https://example.test/branche",
        target: "blank",
        position: 0,
        isVisible: true,
      },
      {
        id: contactNavId,
        label: "Contact",
        location: "header",
        parentId: null,
        pageId: contactId,
        linkType: "page",
        href: null,
        target: "self",
        position: 1,
        isVisible: true,
      },
      {
        id: homeNavId,
        label: "Home",
        location: "header",
        parentId: null,
        pageId: homeId,
        linkType: "page",
        href: null,
        target: "self",
        position: 0,
        isVisible: true,
      },
    ],
  };
}

function diagnosticsFor(action: () => unknown) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof WebsitePublicationValidationError);
    return true;
  });
  try {
    action();
  } catch (error) {
    return (error as WebsitePublicationValidationError).diagnostics;
  }
  return [];
}

test("compiler creates a deterministic next-revision snapshot from published content", () => {
  const source = sourceFixture();
  const snapshot = buildWebsitePublicationSnapshot(source);
  assert.equal(snapshot.deliveryRevision, 4);
  assert.deepEqual(
    snapshot.pages.map((page) => page.path),
    ["/", "/contact"],
  );
  assert.deepEqual(
    snapshot.pages[0]?.sections.map((section) => section.id),
    [heroId],
  );
  assert.deepEqual(
    snapshot.navigation.map((item) => [item.id, item.href]),
    [
      [externalNavId, "https://example.test/branche"],
      [homeNavId, "/"],
      [contactNavId, "/contact"],
    ],
  );

  source.pages.reverse();
  source.navigation.reverse();
  for (const page of source.pages) page.sections.reverse();
  assert.equal(
    serializeWebsitePublication(snapshot),
    serializeWebsitePublication(buildWebsitePublicationSnapshot(source)),
  );
});

test("draft preview compiler includes drafts without changing publication semantics", () => {
  const source = sourceFixture();
  const preview = buildWebsiteDraftPreviewSnapshot(source);
  const publication = buildWebsitePublicationSnapshot(source);

  assert.deepEqual(
    preview.pages.map((page) => page.path),
    ["/", "/concept", "/contact"],
  );
  assert.deepEqual(
    publication.pages.map((page) => page.path),
    ["/", "/contact"],
  );
});

test("compiler rejects navigation and section actions to unpublished pages", () => {
  const navigationSource = sourceFixture();
  navigationSource.navigation[0] = {
    ...navigationSource.navigation[0]!,
    linkType: "page",
    pageId: draftId,
    href: null,
    target: "self",
  };
  assert.ok(
    diagnosticsFor(() =>
      buildWebsitePublicationSnapshot(navigationSource),
    ).some((entry) => entry.code === "unpublished_navigation_page"),
  );

  const actionSource = sourceFixture();
  const hero = actionSource.pages
    .find((page) => page.id === homeId)!
    .sections.find((section) => section.id === heroId)!;
  hero.content = {
    title: "Verouderde link",
    primaryAction: {
      kind: "page",
      label: "Concept",
      pageId: draftId,
    },
    badges: [],
  };
  assert.ok(
    diagnosticsFor(() => buildWebsitePublicationSnapshot(actionSource)).some(
      (entry) => entry.message.includes("unpublished page"),
    ),
  );
});

test("compiler rejects missing homepage, duplicate positions and navigation cycles", () => {
  const homepageSource = sourceFixture();
  homepageSource.pages.find((page) => page.id === homeId)!.isHomepage = false;
  assert.ok(
    diagnosticsFor(() => buildWebsitePublicationSnapshot(homepageSource)).some(
      (entry) => entry.code === "default_homepage",
    ),
  );

  const duplicateSource = sourceFixture();
  duplicateSource.navigation[1]!.position = 0;
  assert.ok(
    diagnosticsFor(() => buildWebsitePublicationSnapshot(duplicateSource)).some(
      (entry) => entry.code === "duplicate_position",
    ),
  );

  const cycleSource = sourceFixture();
  cycleSource.navigation[1]!.parentId = homeNavId;
  cycleSource.navigation[2]!.parentId = contactNavId;
  assert.ok(
    diagnosticsFor(() => buildWebsitePublicationSnapshot(cycleSource)).some(
      (entry) => entry.message.includes("cycle"),
    ),
  );
});

test("compiler rejects visible unknown sections and unsafe external navigation", () => {
  const sectionSource = sourceFixture();
  sectionSource.pages
    .find((page) => page.id === homeId)!
    .sections.find((section) => section.id === hiddenId)!.isVisible = true;
  assert.ok(
    diagnosticsFor(() => buildWebsitePublicationSnapshot(sectionSource)).some(
      (entry) => entry.path.includes(hiddenId),
    ),
  );

  const externalSource = sourceFixture();
  externalSource.navigation[0]!.href = "http://example.test/onveilig";
  assert.ok(
    diagnosticsFor(() => buildWebsitePublicationSnapshot(externalSource)).some(
      (entry) => entry.message.includes("HTTPS"),
    ),
  );
});

test("compiler rejects duplicate, over-deep and credentialed navigation", () => {
  const duplicateLabel = sourceFixture();
  duplicateLabel.navigation.find((item) => item.id === contactNavId)!.label =
    "HOME";
  assert.ok(
    diagnosticsFor(() => buildWebsitePublicationSnapshot(duplicateLabel)).some(
      (entry) => entry.code === "duplicate_navigation_label",
    ),
  );

  const duplicateDestination = sourceFixture();
  duplicateDestination.navigation.find(
    (item) => item.id === contactNavId,
  )!.pageId = homeId;
  assert.ok(
    diagnosticsFor(() =>
      buildWebsitePublicationSnapshot(duplicateDestination),
    ).some((entry) => entry.code === "duplicate_navigation_destination"),
  );

  const overDeep = sourceFixture();
  overDeep.navigation.push({
    id: "50000000-0000-4000-8000-000000000004",
    label: "Meer",
    location: "header",
    parentId: null,
    pageId: null,
    linkType: "dropdown",
    href: null,
    target: "self",
    position: 2,
    isVisible: true,
  });
  overDeep.navigation.find((item) => item.id === contactNavId)!.parentId =
    "50000000-0000-4000-8000-000000000004";
  overDeep.navigation.find((item) => item.id === homeNavId)!.parentId =
    contactNavId;
  assert.ok(
    diagnosticsFor(() => buildWebsitePublicationSnapshot(overDeep)).some(
      (entry) => entry.code === "invalid_navigation_hierarchy",
    ),
  );

  const credentials = sourceFixture();
  credentials.navigation[0]!.href = "https://user:secret@example.test/onveilig";
  assert.ok(
    diagnosticsFor(() => buildWebsitePublicationSnapshot(credentials)).some(
      (entry) => entry.code === "unsafe_external_navigation",
    ),
  );
});

test("cache identity is tenant-, site-, revision- and content-bound", () => {
  const contentHash = "a".repeat(64);
  const identity = websitePublicationCacheIdentity({
    tenantId: "10000000-0000-4000-8000-000000000001",
    siteId,
    deliveryRevision: 4,
    contentHash,
  });
  assert.equal(
    identity.cacheKey,
    `website-publication:v1:10000000-0000-4000-8000-000000000001:${siteId}:r4:${contentHash}`,
  );
  assert.equal(identity.etag, `"fgw-v1-r4-${contentHash}"`);
  assert.throws(() =>
    websitePublicationCacheIdentity({
      tenantId: "10000000-0000-4000-8000-000000000001",
      siteId,
      deliveryRevision: 0,
      contentHash,
    }),
  );
});
