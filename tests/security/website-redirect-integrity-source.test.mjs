import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const migration = read(
  "lib/db/migrations/20260721240000_website_redirect_invariants.sql",
);
const contract = read("lib/website-core/src/redirects.ts");
const builder = read("lib/website-core/src/publication-builder.ts");
const publication = read("lib/website-core/src/publication.ts");
const service = read("lib/db/src/website-redirect-service.ts");
const authoring = read("lib/db/src/website-authoring-service.ts");
const actions = read("artifacts/backoffice/src/app/actions/website.ts");
const route = read(
  "artifacts/backoffice/src/app/(dashboard)/website/redirects/page.tsx",
);
const editor = read(
  "artifacts/backoffice/src/components/website/WebsiteRedirectEditor.tsx",
);
const pageForm = read(
  "artifacts/backoffice/src/components/website/WebsitePageForm.tsx",
);
const runtime = read("artifacts/website-runtime/src/middleware.ts");
const responses = read("artifacts/website-runtime/src/lib/public-responses.ts");

test("database owns redirect tenancy, routes, RLS and revision invalidation", () => {
  assert.match(
    migration,
    /FOREIGN KEY \(tenant_id, site_id\)[\s\S]*REFERENCES public\.website_sites\(tenant_id, id\)/u,
  );
  assert.match(
    migration,
    /UNIQUE INDEX IF NOT EXISTS website_redirects_source_idx[\s\S]*tenant_id, site_id, locale, source_path/u,
  );
  assert.match(migration, /website_assert_route_integrity/u);
  assert.match(migration, /active page path collides with redirect source/u);
  assert.match(migration, /redirect loops and chains are not allowed/u);
  assert.match(
    migration,
    /internal redirect destination must resolve to an active page/u,
  );
  assert.match(
    migration,
    /CREATE CONSTRAINT TRIGGER trg_website_redirect_integrity/u,
  );
  assert.match(
    migration,
    /TG_OP = 'UPDATE'[\s\S]*NEW\.locale IS DISTINCT FROM OLD\.locale[\s\S]*NEW\.path IS DISTINCT FROM OLD\.path[\s\S]*website_assert_route_integrity\([\s\S]*OLD\.tenant_id,[\s\S]*OLD\.site_id,[\s\S]*OLD\.locale,[\s\S]*OLD\.path/u,
  );
  assert.match(
    migration,
    /trg_website_redirects_touch_authoring[\s\S]*website_touch_child_authoring_revision/u,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.website_redirects ENABLE ROW LEVEL SECURITY/u,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.website_redirects FROM anon, authenticated/u,
  );
  assert.doesNotMatch(migration, /CREATE POLICY|GRANT .*authenticated/iu);
});

test("shared redirect contract rejects unsafe or ambiguous destinations", () => {
  assert.match(contract, /WEBSITE_REDIRECT_STATUS_CODES = \[301, 302, 308\]/u);
  assert.match(contract, /websiteCanonicalPathSchema/u);
  assert.match(contract, /De homepage kan geen redirectbron zijn/u);
  assert.match(contract, /url\.protocol !== "https:"/u);
  assert.match(contract, /url\.username \|\| url\.password/u);
  assert.match(contract, /Redirectketens en -lussen zijn niet toegestaan/u);
  assert.match(contract, /websiteRouteKey/u);
});

test("redirect replacement is tenant-scoped, exact-revision and atomic", () => {
  assert.match(service, /WHERE site\.tenant_id = \$1 AND site\.id = \$2/u);
  assert.match(service, /FOR UPDATE OF site/u);
  assert.match(service, /expectedAuthoringRevision/u);
  assert.match(service, /status <> 'archived'/u);
  assert.match(
    service,
    /SET CONSTRAINTS trg_website_redirect_integrity DEFERRED/u,
  );
  assert.match(
    service,
    /fieldgrid\.website_child_authoring_touch', 'suppressed'/u,
  );
  assert.match(service, /authoring_revision = authoring_revision \+ 1/u);
  assert.match(service, /website_redirects_replaced/u);
  assert.match(service, /tenant_id <> \$2 OR site_id <> \$3/u);
});

test("page path updates require and audit an explicit redirect decision", () => {
  assert.match(authoring, /websitePathChangeDecisionSchema/u);
  assert.match(authoring, /pathChangeDecision/u);
  assert.match(authoring, /current\.locale !== page\.locale/u);
  assert.match(
    authoring,
    /INSERT INTO public\.website_redirects[\s\S]*status_code[\s\S]*308/u,
  );
  assert.match(authoring, /destination_type = 'path'[\s\S]*destination = \$6/u);
  assert.match(authoring, /retargetedRedirectCount/u);
  assert.match(pageForm, /create_redirect/u);
  assert.match(pageForm, /Wijzig bewust zonder redirect/u);
});

test("publication and runtime fail closed on redirect diagnostics", () => {
  assert.match(builder, /redirect_page_collision/u);
  assert.match(builder, /unpublished_redirect_destination/u);
  assert.match(
    publication,
    /Publication redirects cannot form loops or chains/u,
  );
  assert.match(
    publication,
    /Internal redirects must resolve to a published page/u,
  );
  assert.match(runtime, /managedWebsiteRedirectResponse/u);
  assert.match(runtime, /runtime: "nodejs"/u);
  assert.match(responses, /status: redirect\.statusCode/u);
  assert.match(responses, /resolution\.snapshot\.defaultLocale/u);
  assert.match(responses, /X-Robots-Tag/u);
});

test("redirect route and actions repeat granular RBAC without delivery mutations", () => {
  assert.match(route, /hasPermission\("website_navigation", "read"\)/u);
  assert.match(route, /hasPermission\("website_navigation", "write"\)/u);
  assert.match(
    actions,
    /getWebsiteRedirectsAction[\s\S]*requirePermission\("website_navigation", "read"\)/u,
  );
  assert.match(
    actions,
    /replaceWebsiteRedirectsAction[\s\S]*requirePermission\("website_navigation", "write"\)/u,
  );
  assert.match(actions, /requireCurrentTenantId\(\)/u);
  assert.match(actions, /requireActorId\(\)/u);
  assert.doesNotMatch(
    `${service}\n${editor}\n${route}`,
    /activateManagedWebsitePublication|activate_website_delivery|website_custom_deployments|provider_key|route_key|upstream|production|staging/iu,
  );
  assert.match(editor, /Opslaan publiceert, activeert of deployt nooit/u);
});
