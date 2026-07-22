import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read(
  "lib/db/migrations/20260721200000_website_module_foundation.sql",
);
const schema = read("lib/db/src/schema/websites.ts");
const sections = read("lib/website-core/src/sections.ts");

const websiteTables = [
  "website_sites",
  "website_domain_bindings",
  "website_custom_deployments",
  "website_pages",
  "website_page_sections",
  "website_navigation_items",
  "website_publications",
  "website_delivery_activations",
];

test("every website relation owns tenant scope and denies direct browser roles", () => {
  for (const table of websiteTables) {
    const block = migration.match(
      new RegExp(
        `CREATE TABLE IF NOT EXISTS public\\.${table} \\([\\s\\S]*?\\n\\);`,
        "u",
      ),
    )?.[0];
    assert.ok(block, `${table} is missing`);
    assert.match(
      block,
      /tenant_id uuid NOT NULL/u,
      `${table} must own tenant_id`,
    );
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`,
        "u",
      ),
    );
  }

  assert.match(
    migration,
    /REVOKE ALL ON TABLE[\s\S]*FROM anon, authenticated/u,
  );
  assert.doesNotMatch(
    migration,
    /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]*TO (?:anon|authenticated)/iu,
  );
  assert.doesNotMatch(migration, /CREATE POLICY website_/u);
});

test("tenant ownership is enforced with composite database foreign keys", () => {
  for (const constraint of [
    "website_domain_bindings_tenant_site_fk",
    "website_domain_bindings_tenant_domain_fk",
    "website_custom_deployments_tenant_site_fk",
    "website_pages_tenant_site_fk",
    "website_pages_parent_fk",
    "website_page_sections_tenant_page_fk",
    "website_navigation_items_tenant_site_fk",
    "website_navigation_items_parent_fk",
    "website_navigation_items_page_fk",
    "website_publications_tenant_site_fk",
    "website_delivery_activations_tenant_site_fk",
  ]) {
    assert.match(migration, new RegExp(`CONSTRAINT ${constraint}`, "u"));
  }
  assert.match(
    schema,
    /foreignKey\(\{[\s\S]*columns: \[table\.tenantId, table\.siteId\]/u,
  );
  assert.match(
    schema,
    /name: "website_domain_bindings_tenant_domain_fk",[\s\S]*columns: \[table\.tenantId, table\.tenantDomainId\]/u,
  );
});

test("custom deployments are allowlist keys rather than tenant-controlled proxy URLs", () => {
  assert.match(migration, /route_key ~ '\^\[A-Za-z0-9\]/u);
  assert.match(migration, /position\(':\/\/' in route_key\) = 0/u);
  assert.match(migration, /health_path ~ '\^\//u);
  assert.match(migration, /expected_host = lower\(trim\(expected_host\)\)/u);
  assert.match(
    migration,
    /platform-reserved domains cannot host tenant websites/u,
  );
  assert.doesNotMatch(schema, /upstreamUrl|originUrl|proxyUrl|secret|token/u);
});

test("delivery changes are exact-revision, atomic and append-only", () => {
  assert.match(
    migration,
    /website delivery transitions must use activate_website_delivery/u,
  );
  assert.match(
    migration,
    /current_site\.delivery_revision <> p_expected_revision/u,
  );
  assert.match(migration, /website delivery revision conflict/u);
  assert.match(migration, /delivery_revision = delivery_revision \+ 1/u);
  assert.match(
    migration,
    /previous_managed_publication_id[\s\S]*SET status = 'superseded'/u,
  );
  assert.match(migration, /INSERT INTO public\.website_delivery_activations/u);
  assert.match(migration, /INSERT INTO public\.audit_log/u);
  assert.match(
    migration,
    /website delivery activation history is append-only/u,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.activate_website_delivery/u,
  );
});

test("activation fails closed on entitlement, domain, target and enterprise conditions", () => {
  for (const phrase of [
    "website tenant is not active",
    "website module entitlement is required",
    "an active primary website domain is required",
    "managed website publication is not ready",
    "custom Next.js delivery requires an enterprise tenant",
    "custom Next.js deployment is not approved for the active website host",
  ]) {
    assert.match(
      migration,
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
    );
  }
  assert.match(migration, /target_row\.expected_host <> primary_hostname/u);
  assert.doesNotMatch(migration, /automatic fallback|fallback.*managed_cms/iu);
});

test("publications and approved custom releases cannot be rewritten", () => {
  assert.match(migration, /ready website publications are immutable/u);
  assert.match(migration, /approved custom website deployments are immutable/u);
  assert.match(
    migration,
    /active managed website publication cannot be retired/u,
  );
  assert.match(
    migration,
    /active custom Next\.js deployment cannot be retired/u,
  );
  assert.match(migration, /ON DELETE RESTRICT/u);
});

test("section input has strict schemas and blocks HTML, classes and unsafe protocols", () => {
  assert.match(sections, /Only HTTPS URLs are allowed/u);
  assert.match(sections, /websiteRichTextDocumentSchema/u);
  assert.match(sections, /z\.literal\("paragraph"\)/u);
  assert.doesNotMatch(
    sections,
    /dangerouslySetInnerHTML|z\.record|className|tailwind|javascript:/iu,
  );
});
