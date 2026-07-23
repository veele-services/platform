import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const templates = read("lib/website-core/src/templates.ts");
const sections = read("lib/website-core/src/sections.ts");
const site = read("lib/website-core/src/site.ts");
const authoring = read("lib/db/src/website-authoring-service.ts");
const publication = read("lib/website-core/src/publication-builder.ts");
const picker = read(
  "artifacts/backoffice/src/components/website/WebsiteSettingsForm.tsx",
);
const migration = read(
  "lib/db/migrations/20260721280000_website_template_presets.sql",
);

test("Phase 8 exposes five managed presets and no custom delivery template", () => {
  for (const key of [
    "trust_conversion",
    "premium_local_authority",
    "fast_service_emergency",
    "multi_service_company",
    "content_seo_growth",
  ]) {
    assert.match(templates, new RegExp(`${key}: [A-Z_]+_TEMPLATE_V1`, "u"));
  }
  assert.doesNotMatch(
    templates.match(
      /WEBSITE_TEMPLATE_REGISTRY = \{[\s\S]*?\} as const/u,
    )?.[0] ?? "",
    /custom_nextjs/u,
  );
  assert.match(picker, /WEBSITE_TEMPLATE_KEYS\.map/u);
  assert.match(picker, /Custom Next\.js[\s\S]*geen templateoptie/u);
});

test("preset initialization is one tenant-scoped transaction with copied identities", () => {
  const initialization =
    authoring.match(
      /export async function initializeManagedWebsite[\s\S]*?(?=export async function updateWebsiteSettings)/u,
    )?.[0] ?? "";
  assert.match(initialization, /return inTransaction\(async \(client\) =>/u);
  assert.match(initialization, /template_key, template_version/u);
  assert.match(
    initialization,
    /const pageIdByKey = new Map<string, string>\(\)/u,
  );
  assert.match(
    initialization,
    /INSERT INTO public\.website_pages[\s\S]*input\.tenantId[\s\S]*site\.id/u,
  );
  assert.match(
    initialization,
    /INSERT INTO public\.website_page_sections \([\s\S]*tenant_id, site_id, page_id/u,
  );
  assert.doesNotMatch(
    initialization,
    /section\.id,[\s\S]{0,220}INSERT INTO public\.website_page_sections/u,
  );
  assert.match(
    initialization,
    /WHERE tenant_id = \$1 AND status <> 'disabled'/u,
  );
  assert.doesNotMatch(
    initialization,
    /activateManagedWebsitePublication|custom_nextjs|production|staging/u,
  );
});

test("template placeholders block publication until explicitly reviewed", () => {
  assert.match(migration, /requires_review boolean NOT NULL DEFAULT false/u);
  assert.match(authoring, /requires_review,[\s\S]*true/u);
  assert.match(authoring, /requires_review = \$11/u);
  assert.match(
    publication,
    /candidate\.isVisible && candidate\.requiresReview/u,
  );
  assert.match(publication, /template_content_requires_review/u);
  assert.match(publication, /team_consent_required/u);
  assert.match(sections, /consentConfirmed: z\.boolean\(\)\.default\(false\)/u);
  assert.match(picker, /Er wordt niets gepubliceerd/u);
});

test("visual expansion remains bounded and schema-driven", () => {
  for (const key of [
    "emergency_hero",
    "service_area",
    "project_showcase",
    "blog_preview",
    "stats",
    "team",
    "logo_wall",
  ]) {
    assert.match(sections, new RegExp(`${key}: \\{`, "u"));
  }
  assert.match(
    site,
    /contentWidth: z\.enum\(\["compact", "standard", "wide"\]\)/u,
  );
  assert.match(site, /buttonStyle: z\.enum\(\["solid", "soft", "outline"\]\)/u);
  assert.match(
    site,
    /surfaceStyle: z\.enum\(\["flat", "bordered", "elevated"\]\)/u,
  );
  assert.doesNotMatch(`${site}\n${sections}`, /customCss|rawHtml|scriptUrl/u);
});
