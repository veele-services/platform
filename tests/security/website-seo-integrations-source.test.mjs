import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("managed SEO integrations expose no arbitrary script or JSON-LD input", () => {
  const siteContract = read("lib/website-core/src/site.ts");
  const runtimeSeo = read("artifacts/website-runtime/src/lib/seo.tsx");
  const analytics = read(
    "artifacts/website-runtime/src/components/WebsiteAnalyticsConsent.tsx",
  );
  assert.match(siteContract, /z\.enum\(\[\s*"organization"/u);
  assert.match(siteContract, /provider: z\.literal\("plausible"\)/u);
  assert.doesNotMatch(siteContract, /scriptUrl|rawJsonLd|customHtml/u);
  assert.match(
    analytics,
    /script\.src = "https:\/\/plausible\.io\/js\/script\.js"/u,
  );
  assert.doesNotMatch(analytics, /innerHTML|eval\(|new Function/u);
  assert.ok(runtimeSeo.includes('.replaceAll("<", "\\\\u003c")'));
  assert.match(runtimeSeo, /type="application\/ld\+json"/u);
});

test("SEO settings are revisioned and compiled into immutable publications", () => {
  const migration = read(
    "lib/db/migrations/20260721270000_website_seo_integrations.sql",
  );
  const publication = read("lib/db/src/website-publication-service.ts");
  const runtimeContract = read("lib/website-core/src/runtime-publication.ts");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS seo_settings jsonb/u);
  assert.match(migration, /NEW\.seo_settings[\s\S]*OLD\.seo_settings/u);
  assert.match(publication, /site\.seo_settings/u);
  assert.match(runtimeContract, /seoSettings: websiteSeoSettingsSchema/u);
});

test("custom delivery requires exact SEO health evidence", () => {
  const customDelivery = read("lib/website-core/src/custom-delivery.ts");
  assert.match(customDelivery, /CUSTOM_WEBSITE_HEALTH_SCHEMA_VERSION = 2/u);
  for (const capability of [
    "canonical",
    "robots",
    "sitemap",
    "structuredData",
  ]) {
    assert.match(
      customDelivery,
      new RegExp(`${capability}: z\\.literal\\(true\\)`, "u"),
    );
  }
});
