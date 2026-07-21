import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TRUST_CONVERSION_TEMPLATE_V1,
  WEBSITE_DELIVERY_MODES,
  WEBSITE_MVP_SECTION_KEYS,
  WEBSITE_SECTION_KEYS,
  WEBSITE_SECTION_REGISTRY,
  WEBSITE_TEMPLATE_KEYS,
  heroContentSchema,
  websiteActionSchema,
  websitePublicationSnapshotSchema,
  websiteTemplateSchema,
} from "../src/index";

test("Trust & Conversion is a valid deterministic managed-CMS preset", () => {
  const parsed = websiteTemplateSchema.parse(TRUST_CONVERSION_TEMPLATE_V1);
  assert.equal(parsed.key, "trust_conversion");
  assert.deepEqual(parsed.allowedSections, [...WEBSITE_MVP_SECTION_KEYS]);
  assert.deepEqual(
    parsed.pages.map((page) => page.path),
    ["/", "/diensten", "/over-ons", "/reviews", "/blog", "/contact"],
  );
  assert.deepEqual(
    parsed.pages[0]?.sections.map((section) => section.type),
    [...WEBSITE_MVP_SECTION_KEYS],
  );
});

test("custom Next.js is a delivery mode and never a template or section", () => {
  assert.ok(WEBSITE_DELIVERY_MODES.includes("custom_nextjs"));
  assert.ok(!WEBSITE_TEMPLATE_KEYS.includes("custom_nextjs" as never));
  assert.ok(!WEBSITE_SECTION_KEYS.includes("custom_nextjs" as never));
});

test("registry contains every MVP section and rejects arbitrary presentation input", () => {
  assert.deepEqual(Object.keys(WEBSITE_SECTION_REGISTRY), [
    ...WEBSITE_MVP_SECTION_KEYS,
  ]);
  assert.throws(() =>
    heroContentSchema.parse({
      title: "Onveilig",
      className: "fixed inset-0",
      html: "<script>alert(1)</script>",
    }),
  );
  assert.throws(() =>
    websiteActionSchema.parse({
      kind: "external",
      label: "Onveilig",
      href: "javascript:alert(1)",
    }),
  );
});

test("publication contract rejects unknown fields and duplicate public paths", () => {
  const base = {
    schemaVersion: 1,
    siteId: "20000000-0000-4000-8000-000000000001",
    deliveryRevision: 1,
    canonicalHostname: "voorbeeld.sites.fieldgrid.nl",
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
    defaultSeo: {
      title: "Voorbeeldbedrijf",
      description:
        "Een geldige beschrijving voor de openbare voorbeeldwebsite.",
      socialImageMediaId: null,
      indexable: true,
    },
    navigation: [],
  } as const;
  const page = {
    id: "30000000-0000-4000-8000-000000000001",
    locale: "nl-NL",
    path: "/",
    pageType: "home",
    title: "Home",
    seo: base.defaultSeo,
    sections: [],
  } as const;

  assert.ok(
    websitePublicationSnapshotSchema.safeParse({ ...base, pages: [page] })
      .success,
  );
  assert.ok(
    !websitePublicationSnapshotSchema.safeParse({
      ...base,
      pages: [page, { ...page, id: "30000000-0000-4000-8000-000000000002" }],
    }).success,
  );
  assert.ok(
    !websitePublicationSnapshotSchema.safeParse({
      ...base,
      pages: [page],
      script: "alert(1)",
    }).success,
  );
});
