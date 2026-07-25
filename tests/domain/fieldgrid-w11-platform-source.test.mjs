import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const dashboard = read(
  "artifacts/backoffice/src/app/(platform)/platform/page.tsx",
);
const tenantList = read(
  "artifacts/backoffice/src/app/(platform)/platform/tenants/page.tsx",
);
const tenantDetail = read(
  "artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx",
);
const tenantActions = read(
  "artifacts/backoffice/src/app/actions/platform-tenants.ts",
);
const filters = read(
  "artifacts/backoffice/src/components/platform/PlatformTenantFilters.tsx",
);
const detailNav = read(
  "artifacts/backoffice/src/components/platform/PlatformTenantDetailNav.tsx",
);
const lifecycle = read(
  "artifacts/backoffice/src/components/platform/PlatformLifecycleAction.tsx",
);
const support = read(
  "artifacts/backoffice/src/components/platform/PlatformSupportAccessPanel.tsx",
);

test("platform dashboard renders only summary surfaces and dedicated-route actions", () => {
  const pageRender = dashboard.slice(
    dashboard.indexOf("export default async function PlatformAdminPage"),
  );

  assert.doesNotMatch(pageRender, /<OnboardingWizard/);
  assert.doesNotMatch(pageRender, /<table/);
  assert.match(pageRender, /<PlatformDashboardOverview/);
  assert.match(pageRender, /href="\/platform\/onboarding"/);
  assert.match(pageRender, /href="\/platform\/tenants"/);
  assert.match(pageRender, /href="\/platform\/users"/);
  assert.match(dashboard, /Actieve onboarding/);
  assert.doesNotMatch(pageRender, /RecentTicketsAndNotifications/);
});

test("tenant filters use canonical controls, active chips and durable problem views", () => {
  for (const view of [
    "domain_problems",
    "past_due",
    "provisioning_blocked",
    "expiring_trial",
  ]) {
    assert.match(filters, new RegExp(view));
    assert.match(tenantActions, new RegExp(`filters\\.view === "${view}"`));
  }

  assert.match(filters, /from "@\/components\/ui\/select"/);
  assert.match(filters, /from "@\/components\/ui\/sheet"/);
  assert.match(filters, /Opgeslagen weergaven/);
  assert.match(filters, /Actief:/);
  assert.match(tenantList, /<PlatformTenantFilters result=\{result\}/);
  assert.match(tenantList, /after:absolute after:inset-0/);
  assert.doesNotMatch(tenantList, /<select/);
});

test("tenant detail groups navigation while keeping old leaf tab URLs compatible", () => {
  for (const label of [
    "Overzicht",
    "Plan en scope",
    "Domein en merk",
    "Gebruikers en toegang",
    "Operations",
    "Communicatie",
  ]) {
    assert.match(detailNav, new RegExp(label));
  }

  assert.match(detailNav, /from "@\/components\/ui\/select"/);
  assert.match(detailNav, /href=\{href\(group\.defaultTab\)\}/);
  assert.match(detailNav, /aria-current=\{active \? "page"/);
  assert.doesNotMatch(detailNav, /TabsTrigger/);
  assert.match(tenantDetail, /plan: "subscription"/);
  assert.match(tenantDetail, /communication: "tickets"/);
  assert.match(tenantDetail, /<PlatformTenantDetailNav/);
});

test("tenant detail starts only the active heavy loaders", () => {
  assert.match(
    tenantDetail,
    /const tenant = await getPlatformTenantDetail\(tenantId\)/,
  );
  assert.match(tenantDetail, /if \(!tenant\) notFound\(\)/);
  assert.match(
    tenantDetail,
    /activeTab === "modules"\s*\?\s*listPlatformTenantModules\(tenantId\)\s*:\s*Promise\.resolve\(\[\]\)/,
  );
  assert.match(
    tenantDetail,
    /activeTab === "users"\s*\?\s*listPlatformTenantUsersAndOwner\(tenantId\)\s*:\s*Promise\.resolve\(null\)/,
  );
  assert.match(
    tenantDetail,
    /activeTab === "support"\s*\?\s*listSupportAccessGrants\(\)\s*:\s*Promise\.resolve\(\[\]\)/,
  );
  assert.match(
    tenantDetail,
    /activeTab === "audit"[\s\S]*listPlatformSecurityDashboard[\s\S]*Promise\.resolve\(null\)/,
  );
  assert.doesNotMatch(
    tenantDetail,
    /Promise\.all\(\[\s*getPlatformTenantDetail[\s\S]*listPlatformTenantDomains[\s\S]*listSupportAccessGrants/,
  );
});

test("platform lifecycle and support access fail through explicit review controls", () => {
  assert.match(lifecycle, /AlertDialog/);
  assert.match(lifecycle, /Organisatie pauzeren\?/);
  assert.match(lifecycle, /Organisatie archiveren\?/);
  assert.match(support, /30 minuten/);
  assert.match(support, /1 uur/);
  assert.match(support, /4 uur/);
  assert.match(support, /Tot einde werkdag/);
  assert.match(support, /Zelf eindtijd kiezen/);
  assert.match(support, /Auditwaarschuwing/);
  assert.match(support, /Tijdzone:/);
  assert.match(support, /Supporttoegang direct intrekken\?/);
  assert.match(support, /useActionState/);
  assert.match(support, /router\.refresh\(\)/);
  assert.doesNotMatch(support, /<select/);
  assert.doesNotMatch(support, /type="checkbox"/);
});
