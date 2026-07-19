import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const portalTenantHelpers = [
  "artifacts/klant-pwa/src/lib/auth/tenant.ts",
  "artifacts/personeel-pwa/src/lib/auth/tenant.ts",
];

test("customer and personnel portals resolve tenant context from the request host", () => {
  for (const path of portalTenantHelpers) {
    const helper = read(path);

    assert.match(helper, /from "next\/headers"/u, `${path} should read request headers`);
    assert.match(helper, /x-forwarded-host/u, `${path} should honor proxy host headers`);
    assert.match(helper, /normalizeHost/u, `${path} should normalize hosts through shared db helper`);
    assert.match(helper, /isPlatformHost/u, `${path} should block platform hosts as portal tenants`);
    assert.match(helper, /isFieldgridSubdomain/u, `${path} should safely block unknown Fieldgrid subdomains`);
    assert.match(helper, /tenantDomainsTable/u, `${path} should resolve verified tenant domains`);
    assert.match(helper, /TENANT_RUNTIME_ACTIVE_STATUSES/u, `${path} should require runtime-active tenants`);
    assert.match(helper, /ne\(tenantDomainsTable\.type, "platform_reserved"\)/u, `${path} should ignore platform-reserved domains`);
  }
});

test("customer portal identity is scoped to the host tenant", () => {
  const customer = read("artifacts/klant-pwa/src/actions/customer.ts");

  assert.match(customer, /requireCurrentCustomerPortalTenantId/u);
  assert.match(customer, /const tenantId = await requireCurrentCustomerPortalTenantId\(\);/u);
  assert.match(customer, /if \(!tenantId\) return null;/u);
  assert.match(customer, /eq\(customerUsersTable\.tenantId, tenantId\)/u);
  assert.match(customer, /eq\(customersTable\.tenantId, tenantId\)/u);
  assert.match(customer, /eq\(customersTable\.tenantId, customerUsersTable\.tenantId\)/u);
  assert.match(customer, /eq\(customerUsersTable\.userId, user\.id\)/u);
  assert.match(customer, /eq\(customerUsersTable\.status, "active"\)/u);
  assert.doesNotMatch(customer, /isNull\(customerUsersTable\.userId\)/u);
});

test("personnel portal profile and mutations are scoped to the host tenant", () => {
  const personnel = read("artifacts/personeel-pwa/src/actions/personnel.ts");

  assert.match(personnel, /getCurrentPortalTenantId/u);
  assert.match(personnel, /const tenantId = await getCurrentPortalTenantId\(\);/u);

  const supabaseTenantFilters = [...personnel.matchAll(/\.eq\("tenant_id", tenantId\)/gu)].length;
  const drizzleTenantFilters = [...personnel.matchAll(/eq\(personnelTable\.tenantId, tenantId\)/gu)].length;

  assert.ok(supabaseTenantFilters >= 1, "Supabase personnel identity lookup should filter by host tenant");
  assert.ok(drizzleTenantFilters >= 5, "Drizzle personnel mutations should filter by host tenant");
  assert.match(personnel, /\.eq\("user_id", user\.id\)/u);
  assert.doesNotMatch(personnel, /\.eq\("email", user\.email/u);
  assert.match(personnel, /persistMyNotificationSettings\(user\.id, tenantId,/u);
});
