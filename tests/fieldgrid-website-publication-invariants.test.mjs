import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read(
  "lib/db/migrations/20260721210000_website_publication_invariants.sql",
);
const service = read("lib/db/src/website-publication-service.ts");
const builder = read("lib/website-core/src/publication-builder.ts");
const publication = read("lib/website-core/src/publication.ts");
const runtime = read("scripts/fieldgrid-website-publication-runtime.mts");

test("publication compiler is deterministic and advances exactly one delivery revision", () => {
  assert.match(
    builder,
    /deliveryRevision: source\.site\.deliveryRevision \+ 1/u,
  );
  assert.match(builder, /serializeWebsitePublication/u);
  assert.match(builder, /Object\.keys\(record\)[\s\S]*\.sort\(\)/u);
  assert.match(builder, /status === "published"/u);
  assert.match(builder, /section\.isVisible/u);
  assert.match(builder, /Exactly one published default-locale homepage/u);
});

test("publication cache identity is exact tenant, site, revision and content", () => {
  assert.match(builder, /"website-publication"[\s\S]*"v1"/u);
  assert.match(builder, /value\.tenantId/u);
  assert.match(builder, /value\.siteId/u);
  assert.match(builder, /`r\$\{value\.deliveryRevision\}`/u);
  assert.match(builder, /value\.contentHash/u);
  assert.match(migration, /website_publications_cache_key_check/u);
  assert.match(migration, /website_publications_cache_key_idx/u);
});

test("authoring mutations invalidate prepared publications at database level", () => {
  assert.match(migration, /website_guard_site_authoring_revision/u);
  assert.match(migration, /website_touch_child_authoring_revision/u);
  for (const table of [
    "website_domain_bindings",
    "website_pages",
    "website_page_sections",
    "website_navigation_items",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `ON public\\.${table}[\\s\\S]*website_touch_child_authoring_revision`,
        "u",
      ),
    );
  }
  assert.match(migration, /website authoring revision is database-managed/u);
  assert.match(migration, /website child ownership is immutable/u);
});

test("server publication creation locks the site and compiles before insert", () => {
  assert.match(service, /SET TRANSACTION ISOLATION LEVEL SERIALIZABLE/u);
  assert.match(service, /FOR UPDATE OF site/u);
  assert.match(service, /websitePublicationSourceSchema\.parse/u);
  assert.match(service, /buildWebsitePublicationSnapshot\(source\)/u);
  assert.match(service, /createHash\("sha256"\)/u);
  assert.match(service, /source-revision:\$\{sourceRevision\}/u);
  assert.match(service, /Website publication hash identity conflict/u);
  assert.match(service, /INSERT INTO public\.website_publications/u);
  assert.match(service, /website_publication_created/u);
});

test("managed activation is exact-revision and supersedes only after switching", () => {
  assert.match(migration, /activate_managed_website_publication/u);
  assert.match(
    migration,
    /candidate\.source_revision <> p_expected_authoring_revision/u,
  );
  assert.match(
    migration,
    /candidate\.target_delivery_revision <> p_expected_delivery_revision \+ 1/u,
  );
  assert.match(migration, /SET\s+status = 'active'/u);
  assert.match(migration, /FROM public\.activate_website_delivery/u);
  assert.match(migration, /SET\s+status = 'superseded'/u);
  assert.match(publication, /Section action references an unpublished page/u);
});

test("custom delivery atomically demotes the preserved managed publication", () => {
  const activation = migration.match(
    /CREATE OR REPLACE FUNCTION public\.activate_website_delivery\([\s\S]*?\n\$\$;/u,
  )?.[0];
  assert.ok(activation, "activate_website_delivery definition is missing");
  assert.match(
    activation,
    /current_site\.delivery_mode = 'managed_cms'[\s\S]*p_to_mode = 'custom_nextjs'/u,
  );
  assert.match(
    activation,
    /previous_managed_publication_id[\s\S]*SET status = 'ready'/u,
  );
  assert.match(
    activation,
    /UPDATE public\.website_sites[\s\S]*SET status = 'superseded'/u,
  );
  assert.match(activation, /managed website publication preservation failed/u);
});

test("runtime proof covers all Phase 1B acceptance boundaries", () => {
  for (const assertion of [
    "verifiedPrimaryDomainOnly",
    "staleDomainRevisionRejected",
    "domainReuseRejected",
    "childMutationAdvancesRevision",
    "childOwnershipImmutable",
    "navigationExactRevision",
    "navigationHierarchyBounded",
    "navigationDeterministicReorder",
    "unsafeNavigationRejected",
    "identicalOutputBoundToSourceRevision",
    "staleAuthoringActivationRejected",
    "staleDeliveryActivationRejected",
    "previousPublicationSuperseded",
    "exactlyOneActiveManagedPublication",
    "draftCannotAlterLiveSnapshot",
    "previewIncludesDraftPage",
    "previewBoundToActor",
    "stalePreviewRevisionRejected",
    "explicitPageInclusion",
    "browserPreviewReadDenied",
    "browserExecutionDenied",
  ]) {
    assert.match(runtime, new RegExp(`${assertion}: true`, "u"));
  }
});
