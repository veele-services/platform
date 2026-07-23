import assert from "node:assert/strict";
import test from "node:test";
import {
  websiteAnalyticsSchema,
  websiteSeoSchema,
  websiteSeoSettingsSchema,
  websiteSiteSettingsSchema,
} from "../src/index";

test("legacy managed settings receive safe SEO integration defaults", () => {
  const parsed = websiteSiteSettingsSchema.parse({
    schemaVersion: 1,
    name: "Voorbeeldbedrijf",
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
      email: null,
      phone: null,
      street: null,
      postalCode: null,
      city: null,
      countryCode: "NL",
      openingHours: [],
    },
    socialLinks: [],
    defaultSeo: {
      title: "Voorbeeldbedrijf",
      description: "Een veilige openbare website.",
      socialImageMediaId: null,
      indexable: true,
    },
    analytics: { provider: "none" },
  });
  assert.equal(parsed.defaultSeo.canonicalPath, null);
  assert.equal(parsed.defaultSeo.socialImageUrl, null);
  assert.deepEqual(parsed.seoSettings, {
    schemaVersion: 1,
    structuredData: {
      enabled: true,
      organizationType: "organization",
    },
    webmasterVerification: { google: null, bing: null },
  });
});

test("canonical and social fields reject external paths and unsafe URLs", () => {
  const base = {
    title: "Veilige SEO",
    description: "Gecontroleerde metadata zonder vrije markup.",
    canonicalPath: null,
    socialImageMediaId: null,
    socialImageUrl: null,
    indexable: true,
  };
  assert.ok(
    websiteSeoSchema.safeParse({
      ...base,
      canonicalPath: "/diensten/onderhoud",
      socialImageUrl: "https://cdn.example.test/social.jpg",
    }).success,
  );
  for (const value of [
    { ...base, canonicalPath: "https://evil.example/path" },
    { ...base, canonicalPath: "/api/private" },
    { ...base, socialImageUrl: "http://cdn.example.test/social.jpg" },
    {
      ...base,
      socialImageUrl: "https://user:password@cdn.example.test/social.jpg",
    },
  ]) {
    assert.equal(websiteSeoSchema.safeParse(value).success, false);
  }
});

test("analytics and webmaster fields cannot become script or markup injection", () => {
  assert.deepEqual(
    websiteAnalyticsSchema.parse({
      provider: "plausible",
      publicSiteId: "WWW.VOORBEELD.NL",
    }),
    { provider: "plausible", publicSiteId: "www.voorbeeld.nl" },
  );
  for (const publicSiteId of [
    "https://voorbeeld.nl/script.js",
    "voorbeeld.nl,evil.example",
    '"><script>alert(1)</script>',
  ]) {
    assert.equal(
      websiteAnalyticsSchema.safeParse({
        provider: "plausible",
        publicSiteId,
      }).success,
      false,
    );
  }
  assert.equal(
    websiteSeoSettingsSchema.safeParse({
      schemaVersion: 1,
      structuredData: {
        enabled: true,
        organizationType: "local_business",
      },
      webmasterVerification: {
        google: '"><script>alert(1)</script>',
        bing: null,
      },
    }).success,
    false,
  );
});

test("structured-data configuration is an allowlist, not arbitrary JSON-LD", () => {
  assert.equal(
    websiteSeoSettingsSchema.safeParse({
      schemaVersion: 1,
      structuredData: {
        enabled: true,
        organizationType: "LocalBusiness",
        rawJsonLd: '{"@context":"https://evil.example"}',
      },
      webmasterVerification: { google: null, bing: null },
    }).success,
    false,
  );
  assert.throws(() =>
    websiteSeoSettingsSchema.parse({
      schemaVersion: 1,
      structuredData: {
        enabled: true,
        organizationType: "arbitrary_type",
      },
      webmasterVerification: { google: null, bing: null },
    }),
  );
});
