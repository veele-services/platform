import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("migration assigns immutable-format unique six-character tenant codes", () => {
  const migration = source(
    "lib/db/migrations/20260725170000_personnel_tenant_login_codes.sql",
  );

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS personnel_login_code varchar\(6\)/u,
  );
  assert.match(
    migration,
    /SET DEFAULT public\.fieldgrid_generate_personnel_login_code\(\)/u,
  );
  assert.match(migration, /personnel_login_code SET NOT NULL/u);
  assert.match(
    migration,
    /CHECK \(personnel_login_code ~ '\^\[A-HJ-NP-Z2-9\]\{6\}\$'\)/u,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS tenants_personnel_login_code_idx/u,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.fieldgrid_generate_personnel_login_code\(\)[\s\S]*FROM PUBLIC, anon, authenticated/u,
  );
});

test("generic Fieldgrid login requires code and stores only host-only routing context", () => {
  const loginPage = source(
    "artifacts/personeel-pwa/src/app/(auth)/login/page.tsx",
  );
  const action = source("artifacts/personeel-pwa/src/actions/auth.ts");
  const tenant = source("artifacts/personeel-pwa/src/lib/auth/tenant.ts");

  assert.match(loginPage, /Kies je organisatie/u);
  assert.match(loginPage, /name="tenantCode"/u);
  assert.match(loginPage, /maxLength=\{6\}/u);
  assert.match(action, /httpOnly: true/u);
  assert.match(action, /path: PORTAL_BASE/u);
  assert.match(action, /sameSite: "lax"/u);
  assert.doesNotMatch(action, /domain:/u);
  assert.match(tenant, /eq\(tenantsTable\.personnelLoginCode, code\)/u);
});

test("email-password login remains tenant-bound after routing-code selection", () => {
  const action = source("artifacts/personeel-pwa/src/actions/auth.ts");

  assert.match(action, /eq\(personnelTable\.tenantId, tenantId\)/u);
  assert.match(action, /eq\(personnelTable\.userId, data\.user\.id\)/u);
  assert.match(
    action,
    /await supabase\.auth\.signOut\(\);[\s\S]*Ongeldige inloggegevens voor deze organisatie/u,
  );
});

test("enterprise tenants use their own host while general tenants use code entry", () => {
  const entry = source(
    "artifacts/backoffice/src/lib/personnel-portal-entry.ts",
  );
  const android = source("artifacts/personeel-pwa/android/app/build.gradle");

  assert.match(entry, /tenant\.planKey === "enterprise"/u);
  assert.match(
    entry,
    /import \{ tenantApplicationOrigin \} from "@\/lib\/tenant-application-origin"/u,
  );
  assert.match(entry, /await tenantApplicationOrigin\(tenantId\)/u);
  assert.doesNotMatch(entry, /https:\/\/\$\{domain\.domain\}/u);
  assert.match(entry, /organisatie\/\$\{tenant\.personnelLoginCode\}/u);
  assert.match(android, /nl\.veeleservices\.personeel/u);
  assert.match(android, /nl\.fieldgrid\.personeel/u);
});

test("tenant-code deep link sets context before activation or reset route", () => {
  const route = source(
    "artifacts/personeel-pwa/src/app/organisatie/[code]/route.ts",
  );
  const personnelAuth = source("artifacts/personeel-pwa/src/actions/auth.ts");
  const backofficeAuth = source("artifacts/backoffice/src/app/actions/auth.ts");
  const middleware = source("artifacts/personeel-pwa/src/middleware.ts");

  assert.match(route, /resolveActivePersonnelTenantIdByCode/u);
  assert.match(route, /requireTenantModule\(tenantId, "personnel_portal"\)/u);
  assert.match(route, /response\.cookies\.set\(PERSONNEL_TENANT_COOKIE/u);
  assert.match(route, /normalizePersonnelPortalNextPath/u);
  for (const authSource of [personnelAuth, backofficeAuth]) {
    assert.match(authSource, /buildPersonnelTenantEntryUrl\(/u);
    assert.match(authSource, /"\/wachtwoord-vergeten"/u);
  }
  assert.match(middleware, /startsWith\("\/organisatie\/"\)/u);
});
