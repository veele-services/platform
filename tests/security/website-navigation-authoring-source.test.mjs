import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const migration = read(
  "lib/db/migrations/20260721230000_website_navigation_invariants.sql",
);
const navigation = read("lib/website-core/src/navigation.ts");
const builder = read("lib/website-core/src/publication-builder.ts");
const publication = read("lib/website-core/src/publication.ts");
const service = read("lib/db/src/website-navigation-service.ts");
const actions = read("artifacts/backoffice/src/app/actions/website.ts");
const route = read(
  "artifacts/backoffice/src/app/(dashboard)/website/navigation/page.tsx",
);
const editor = read(
  "artifacts/backoffice/src/components/website/WebsiteNavigationEditor.tsx",
);

test("database navigation hierarchy is bounded and deterministically ordered", () => {
  assert.match(
    migration,
    /UNIQUE \(tenant_id, site_id, location, position\)[\s\S]*DEFERRABLE INITIALLY IMMEDIATE/u,
  );
  assert.match(migration, /position >= 0 AND position < 500/u);
  assert.match(migration, /website_guard_navigation_hierarchy/u);
  assert.match(migration, /parent\.tenant_id = NEW\.tenant_id/u);
  assert.match(migration, /parent\.site_id = NEW\.site_id/u);
  assert.match(migration, /parent_location IS DISTINCT FROM NEW\.location/u);
  assert.match(migration, /navigation hierarchy exceeds two levels/u);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.website_guard_navigation_hierarchy\(\)/u,
  );
  assert.doesNotMatch(migration, /GRANT .*authenticated|CREATE POLICY/iu);
});

test("shared draft contract rejects unsafe, duplicate and over-deep navigation", () => {
  assert.match(navigation, /websiteExternalNavigationHrefSchema/u);
  assert.match(navigation, /url\.protocol !== "https:"/u);
  assert.match(navigation, /url\.username \|\| url\.password/u);
  assert.match(navigation, /Navigatie ondersteunt maximaal twee niveaus/u);
  assert.match(navigation, /Labels binnen hetzelfde menuniveau moeten uniek/u);
  assert.match(
    navigation,
    /Dezelfde bestemming mag binnen één menuniveau maar één keer voorkomen/u,
  );
  assert.match(
    navigation,
    /Een zichtbaar submenu vereist een zichtbaar hoofdonderdeel/u,
  );
  assert.match(navigation, /positionWebsiteNavigationItems/u);
});

test("navigation replacement is tenant scoped and exact-revision atomic", () => {
  assert.match(service, /WHERE site\.tenant_id = \$1 AND site\.id = \$2/u);
  assert.match(
    service,
    /WHERE tenant_id = \$1 AND site_id = \$2[\s\S]*id = ANY\(\$3::uuid\[\]\)/u,
  );
  assert.match(service, /page\.locale !== site\.default_locale/u);
  assert.match(service, /page\.status === "archived"/u);
  assert.match(service, /FOR UPDATE OF site/u);
  assert.match(service, /FOR UPDATE/u);
  assert.match(service, /expectedAuthoringRevision/u);
  assert.match(
    service,
    /SET CONSTRAINTS website_navigation_items_position_unique DEFERRED/u,
  );
  assert.match(
    service,
    /fieldgrid\.website_child_authoring_touch', 'suppressed'/u,
  );
  assert.match(service, /authoring_revision = authoring_revision \+ 1/u);
  assert.match(service, /website_navigation_replaced/u);
  assert.match(service, /tenant_id <> \$2 OR site_id <> \$3/u);
});

test("navigation route and actions repeat granular RBAC", () => {
  assert.match(route, /hasPermission\("website_navigation", "read"\)/u);
  assert.match(route, /hasPermission\("website_navigation", "write"\)/u);
  assert.match(
    actions,
    /getWebsiteNavigationAction[\s\S]*requirePermission\("website_navigation", "read"\)/u,
  );
  assert.match(
    actions,
    /replaceWebsiteNavigationAction[\s\S]*requirePermission\("website_navigation", "write"\)/u,
  );
  assert.match(actions, /requireCurrentTenantId\(\)/u);
  assert.match(actions, /requireActorId\(\)/u);
});

test("editor provides accessible hierarchy and deterministic ordering controls", () => {
  assert.match(editor, /crypto\.randomUUID\(\)/u);
  assert.match(editor, /GripVertical/u);
  assert.match(editor, /aria-label=\{`\$\{item\.label\} omhoog`\}/u);
  assert.match(editor, /aria-label=\{`\$\{item\.label\} omlaag`\}/u);
  assert.match(editor, /Submenu/u);
  assert.match(editor, /Menugroep/u);
  assert.match(editor, /Conceptpagina blokkeert publicatie/u);
  assert.match(editor, /orderedItems\(items\)/u);
  assert.doesNotMatch(
    editor,
    /dangerouslySetInnerHTML|innerHTML\s*=|createClient|supabase/iu,
  );
});

test("save and publication diagnostics cannot alter delivery infrastructure", () => {
  assert.match(builder, /navigation_cycle/u);
  assert.match(builder, /duplicate_navigation_label/u);
  assert.match(builder, /duplicate_navigation_destination/u);
  assert.match(publication, /Navigation supports at most two levels/u);
  assert.match(publication, /Navigation destinations must be unique/u);
  assert.doesNotMatch(
    `${service}\n${editor}\n${route}`,
    /activateManagedWebsitePublication|activate_website_delivery|website_custom_deployments|route_key|provider_key|upstream|production|staging/iu,
  );
  assert.match(editor, /Opslaan publiceert of deployt nooit/u);
  assert.match(editor, /Custom Next\.js blijft live/u);
});
