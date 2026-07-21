import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read(
  "lib/db/migrations/20260721210000_website_publication_invariants.sql",
);
const foundation = read(
  "lib/db/migrations/20260721200000_website_module_foundation.sql",
);
const service = read("lib/db/src/website-publication-service.ts");
const builder = read("lib/website-core/src/publication-builder.ts");

test("Phase 1B privileged functions are fixed-search-path and non-browser executable", () => {
  for (const name of [
    "set_primary_website_domain",
    "website_assert_delivery_target",
    "website_touch_child_authoring_revision",
    "activate_managed_website_publication",
  ]) {
    const definition = migration.match(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
        "u",
      ),
    )?.[0];
    assert.ok(definition, `${name} definition is missing`);
    if (name !== "website_assert_delivery_target") {
      assert.match(definition, /SECURITY DEFINER/u);
    }
    assert.match(definition, /SET search_path = pg_catalog, public, pg_temp/u);
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role`,
        "u",
      ),
    );
  }
});

test("trusted transition flags are restored before privileged functions return", () => {
  for (const flag of [
    "fieldgrid.website_authoring_touch",
    "fieldgrid.website_child_authoring_touch",
    "fieldgrid.website_delivery_transition",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `set_config\\(\\s*'${flag.replaceAll(".", "\\.")}'[\\s\\S]*COALESCE\\(previous_`,
        "u",
      ),
    );
  }
});

test("Phase 1B does not weaken website table RLS or browser ACL", () => {
  assert.match(
    foundation,
    /REVOKE ALL ON TABLE[\s\S]*FROM anon, authenticated/u,
  );
  assert.doesNotMatch(
    migration,
    /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL|EXECUTE)[\s\S]*TO (?:anon|authenticated)/iu,
  );
  assert.doesNotMatch(migration, /CREATE POLICY website_/u);
});

test("primary domain transitions are exact-tenant, verified and ambiguity-free", () => {
  assert.match(
    migration,
    /WHERE tenant_id = p_tenant_id AND id = p_tenant_domain_id/u,
  );
  assert.match(migration, /verification_status <> 'verified'/u);
  assert.match(migration, /tenant_domain\.verified_at IS NULL/u);
  assert.match(migration, /already bound to another site/u);
  assert.match(migration, /website primary domain transition is a no-op/u);
  assert.match(migration, /website authoring revision conflict/u);
});

test("publication service tenant-scopes every authoring read and durable write", () => {
  for (const table of [
    "website_sites",
    "website_domain_bindings",
    "website_pages",
    "website_page_sections",
    "website_navigation_items",
    "website_publications",
  ]) {
    assert.match(service, new RegExp(`public\\.${table}`, "u"));
  }
  assert.match(service, /site\.tenant_id = \$1 AND site\.id = \$2/u);
  assert.match(service, /tenant_id = \$1 AND site_id = \$2/gmu);
  assert.match(service, /source-revision:\$\{sourceRevision\}/u);
  assert.doesNotMatch(service, /SELECT \* FROM public\.website_/u);
});

test("website authoring children cannot move between tenant or site owners", () => {
  assert.match(migration, /TG_OP = 'UPDATE'/u);
  assert.match(migration, /NEW\.tenant_id IS DISTINCT FROM OLD\.tenant_id/u);
  assert.match(migration, /NEW\.site_id IS DISTINCT FROM OLD\.site_id/u);
  assert.match(migration, /website child ownership is immutable/u);
});

test("publication payloads reject unsafe and unpublished destinations", () => {
  assert.match(builder, /External navigation must use an HTTPS URL/u);
  assert.match(builder, /Navigation references a page that is not published/u);
  assert.match(builder, /websiteSectionSchema\.safeParse/u);
  assert.match(builder, /Publication contains a non-JSON value/u);
  assert.doesNotMatch(
    builder,
    /dangerouslySetInnerHTML|eval\(|new Function|javascript:|data:/iu,
  );
});

test("Phase 1B remains server-only and performs no routing or deployment", () => {
  assert.doesNotMatch(
    service,
    /express|Router|fetch\(|deploy|proxy|upstream|custom_nextjs/iu,
  );
  assert.doesNotMatch(
    migration,
    /INSERT INTO public\.website_custom_deployments|UPDATE public\.website_custom_deployments/u,
  );
});
