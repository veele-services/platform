import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const migration = read(
  "lib/db/migrations/20260721200000_website_module_foundation.sql",
);
const schema = read("lib/db/src/schema/websites.ts");
const modules = read("lib/db/src/schema/modules.ts");
const modulePermissions = read("lib/db/src/module-permissions.ts");
const sections = read("lib/website-core/src/sections.ts");
const templates = read("lib/website-core/src/templates.ts");

test("website module is explicit, disabled by default and permission-gated", () => {
  assert.match(modules, /"website"/u);
  assert.match(migration, /VALUES \([\s\S]*'website'[\s\S]*false\s*\)/u);
  assert.doesNotMatch(migration, /INSERT INTO public\.plan_modules/u);
  assert.doesNotMatch(migration, /INSERT INTO public\.tenant_modules/u);

  for (const resource of [
    "website",
    "website_settings",
    "website_pages",
    "website_navigation",
    "website_blog",
    "website_forms",
    "website_submissions",
    "website_media",
  ]) {
    assert.match(
      modulePermissions,
      new RegExp(`${resource}:\\s*"website"`, "u"),
    );
    assert.match(migration, new RegExp(`'${resource}'`, "u"));
  }
});

test("Phase 1A migration stays limited while the current schema retains its foundation", () => {
  for (const table of [
    "websiteSitesTable",
    "websiteDomainBindingsTable",
    "websiteCustomDeploymentsTable",
    "websitePagesTable",
    "websitePageSectionsTable",
    "websiteNavigationItemsTable",
    "websitePublicationsTable",
    "websiteDeliveryActivationsTable",
  ]) {
    assert.match(schema, new RegExp(`\\b${table}\\b`, "u"));
  }

  assert.doesNotMatch(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.(website_blog|website_forms|website_media)/u,
  );
});

test("managed templates and custom Next.js delivery remain separate concepts", () => {
  assert.match(templates, /key: "trust_conversion"/u);
  assert.match(templates, /label: "Trust & Conversion"/u);
  assert.match(templates, /WEBSITE_TEMPLATE_REGISTRY/u);
  assert.doesNotMatch(templates, /key: "custom_nextjs"/u);
  assert.match(
    migration,
    /delivery_mode IN \('managed_cms', 'custom_nextjs'\)/u,
  );
  assert.match(
    migration,
    /custom Next\.js delivery requires an enterprise tenant/u,
  );
});

test("section foundation is fixed, schema-driven and contains no renderer escape hatch", () => {
  for (const sectionKey of [
    "hero",
    "trust_bar",
    "services_grid",
    "feature_grid",
    "process_steps",
    "testimonials",
    "faq",
    "cta_banner",
    "contact_form",
  ]) {
    assert.match(sections, new RegExp(`${sectionKey}: \\{`, "u"));
  }

  assert.match(sections, /\.strict\(\)/u);
  assert.doesNotMatch(
    sections,
    /dangerouslySetInnerHTML|className:\s*z\.|html:\s*z\.|script:\s*z\./u,
  );
});

test("all six architecture documents are part of the implementation branch", () => {
  for (const name of [
    "analysis",
    "plan",
    "data-model",
    "sections",
    "templates",
    "admin",
  ]) {
    const document = read(`docs/website-module-${name}.md`);
    assert.match(document, /custom_nextjs/u);
    assert.match(document, /managed_cms/u);
  }
});
