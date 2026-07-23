import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const service = read("lib/db/src/website-authoring-service.ts");
const actions = read("artifacts/backoffice/src/app/actions/website.ts");
const overview = read(
  "artifacts/backoffice/src/app/(dashboard)/website/page.tsx",
);
const settingsPage = read(
  "artifacts/backoffice/src/app/(dashboard)/website/settings/page.tsx",
);
const pagesPage = read(
  "artifacts/backoffice/src/app/(dashboard)/website/pages/page.tsx",
);
const pageEditor = read(
  "artifacts/backoffice/src/app/(dashboard)/website/pages/[id]/page.tsx",
);
const settingsForm = read(
  "artifacts/backoffice/src/components/website/WebsiteSettingsForm.tsx",
);
const pageForm = read(
  "artifacts/backoffice/src/components/website/WebsitePageForm.tsx",
);
const sidebar = read("artifacts/backoffice/src/components/layout/Sidebar.tsx");

test("website admin reads and writes stay explicitly tenant scoped", () => {
  assert.match(service, /WHERE tenant_id = \$1 AND id = \$2/u);
  assert.match(service, /WHERE page\.tenant_id = \$1 AND page\.site_id = \$2/u);
  assert.match(service, /WHERE page\.tenant_id = \$1 AND page\.id = \$2/u);
  assert.match(
    service,
    /WHERE tenant_id = \$1 AND site_id = \$2 AND id = \$3/u,
  );
  assert.doesNotMatch(
    service,
    /FROM public\.website_(?:sites|pages|page_sections)[\s\S]{0,160}WHERE id = \$1/u,
  );
});

test("direct server-action invocation enforces module-backed granular permissions", () => {
  for (const permission of [
    'requirePermission("website", "read")',
    'requirePermission("website_settings", "read")',
    'requirePermission("website_settings", "write")',
    'requirePermission("website_pages", "read")',
    'requirePermission("website_pages", "write")',
  ]) {
    assert.match(
      actions,
      new RegExp(permission.replace(/[()]/gu, "\\$&"), "u"),
    );
  }
  assert.match(actions, /requireCurrentTenantId\(\)/u);
  assert.match(actions, /requireActorId\(\)/u);
  assert.match(sidebar, /permission: "website:read"/u);
});

test("every authoring mutation rejects stale revisions", () => {
  assert.match(
    service,
    /expectedAuthoringRevision: z\.number\(\)\.int\(\)\.positive\(\)/u,
  );
  assert.match(
    service,
    /expectedPageRevision: z\.number\(\)\.int\(\)\.positive\(\)/u,
  );
  assert.match(service, /FOR UPDATE/u);
  assert.match(service, /authoring_revision = \$3/u);
  assert.match(service, /authoring_revision = \$4/u);
  assert.match(service, /authoring_revision = authoring_revision \+ 1/u);
  assert.match(service, /Website is intussen gewijzigd/u);
  assert.match(service, /Pagina is intussen gewijzigd/u);
});

test("site initialization fails closed on tenant lifecycle and entitlement", () => {
  assert.match(service, /tenant\.is_active/u);
  assert.match(service, /\["trial", "active"\]\.includes\(tenant\.status\)/u);
  assert.match(service, /module\.key = 'website'/u);
  assert.match(service, /entitlement\.is_enabled = true/u);
  assert.match(service, /if \(!tenant\.module_enabled\)/u);
  assert.match(service, /delivery_mode[\s\S]*'managed_cms'/u);
});

test("page and settings payloads use strict shared schemas and reserved-path checks", () => {
  assert.match(service, /websiteSiteSettingsSchema/u);
  assert.match(service, /websiteSeoSchema/u);
  assert.match(service, /websitePageDraftSchema = z[\s\S]*\.strict\(\)/u);
  assert.match(service, /api\|_next\|health\|preview\|assets/u);
  assert.match(service, /De homepage moet pad \/ en een lege slug gebruiken/u);
  assert.doesNotMatch(settingsForm, /dangerouslySetInnerHTML|contentEditable/u);
  assert.doesNotMatch(pageForm, /dangerouslySetInnerHTML|contentEditable/u);
});

test("route components repeat read authorization and expose no custom infrastructure", () => {
  assert.match(overview, /hasPermission\("website", "read"\)/u);
  assert.match(settingsPage, /hasPermission\("website_settings", "read"\)/u);
  assert.match(pagesPage, /hasPermission\("website_pages", "read"\)/u);
  assert.match(pageEditor, /hasPermission\("website_pages", "read"\)/u);

  const tenantUi = `${overview}\n${settingsPage}\n${pagesPage}\n${pageEditor}`;
  assert.doesNotMatch(
    tenantUi,
    /routeKey|providerKey|upstream|originUrl|health response|secret|token/iu,
  );
  assert.match(
    tenantUi,
    /wordt niet live|niet automatisch gepubliceerd|alleen het concept/iu,
  );
});

test("Phase 3A does not activate a publication or delivery target", () => {
  const phase3a = `${service}\n${actions}`;
  assert.doesNotMatch(
    phase3a,
    /activateManagedWebsitePublication|activate_website_delivery|active_publication_id\s*=/u,
  );
  assert.doesNotMatch(
    phase3a,
    /INSERT INTO public\.website_custom_deployments|UPDATE public\.website_custom_deployments|production|staging/u,
  );
});
