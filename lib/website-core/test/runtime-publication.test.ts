import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWebsitePublicationForRuntime,
  websitePublicationSnapshotSchema,
} from "../src/index";

const ids = {
  site: "10000000-0000-4000-8000-000000000001",
  page: "10000000-0000-4000-8000-000000000002",
  section: "10000000-0000-4000-8000-000000000003",
};

function snapshot() {
  return websitePublicationSnapshotSchema.parse({
    schemaVersion: 1,
    siteId: ids.site,
    deliveryRevision: 3,
    canonicalHostname: "alpha.fieldgrid.nl",
    defaultLocale: "nl-NL",
    theme: {
      schemaVersion: 1,
      colors: {
        background: "#ffffff",
        foreground: "#0b1f3a",
        primary: "#075985",
        primaryForeground: "#ffffff",
        accent: "#e0f2fe",
        accentForeground: "#0b1f3a",
      },
      headingFont: "inter",
      bodyFont: "inter",
      radius: "medium",
      spacing: "comfortable",
      logoMediaId: null,
      faviconMediaId: null,
    },
    contact: {
      companyName: "Alpha Service",
      email: "info@alpha.example",
      phone: "+31101234567",
      street: null,
      postalCode: null,
      city: "Rotterdam",
      countryCode: "NL",
      openingHours: [],
    },
    socialLinks: [],
    defaultSeo: {
      title: "Alpha Service",
      description: "Betrouwbare lokale service.",
      socialImageMediaId: null,
      indexable: true,
    },
    pages: [
      {
        id: ids.page,
        locale: "nl-NL",
        path: "/",
        pageType: "home",
        title: "Home",
        seo: {
          title: "Alpha Service",
          description: "Betrouwbare lokale service.",
          socialImageMediaId: null,
          indexable: true,
        },
        sections: [
          {
            id: ids.section,
            type: "hero",
            schemaVersion: 1,
            variant: "centered",
            visible: true,
            content: { title: "Welkom", badges: [] },
          },
        ],
      },
    ],
    navigation: [],
  });
}

test("runtime publication accepts an exact immutable snapshot", () => {
  const result = parseWebsitePublicationForRuntime(snapshot());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.snapshot.pages[0]?.sections.length, 1);
    assert.deepEqual(result.diagnostics, []);
  }
});

test("runtime publication omits an unsupported section without losing the page", () => {
  const value = structuredClone(snapshot()) as Record<string, any>;
  value.pages[0].sections.push({
    id: "10000000-0000-4000-8000-000000000004",
    type: "future_script_section",
    schemaVersion: 99,
    visible: true,
    content: { html: "<script>alert(1)</script>" },
  });

  const result = parseWebsitePublicationForRuntime(value);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.snapshot.pages[0]?.sections.length, 1);
    assert.deepEqual(result.diagnostics, [
      { code: "invalid_section", pageId: ids.page, sectionIndex: 1 },
    ]);
    assert.doesNotMatch(
      JSON.stringify(result.snapshot),
      /future_script|<script>/u,
    );
  }
});

test("runtime publication rejects an unsupported envelope version", () => {
  const value = { ...snapshot(), schemaVersion: 2 };
  assert.deepEqual(parseWebsitePublicationForRuntime(value), {
    success: false,
    diagnostics: [{ code: "invalid_envelope" }],
  });
});
