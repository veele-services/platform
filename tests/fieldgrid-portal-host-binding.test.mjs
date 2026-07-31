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
const runtimeHostResolvers = [
  ...portalTenantHelpers,
  "artifacts/api-server/src/middleware/auth.ts",
  "artifacts/backoffice/src/lib/auth/tenant.ts",
  "artifacts/backoffice/src/lib/auth/tenant-resolver.ts",
];

test("customer and personnel portals resolve tenant context from the request host", () => {
  for (const path of portalTenantHelpers) {
    const helper = read(path);

    assert.match(
      helper,
      /from "next\/headers"/u,
      `${path} should read request headers`,
    );
    assert.match(
      helper,
      /x-forwarded-host/u,
      `${path} should honor proxy host headers`,
    );
    assert.match(
      helper,
      /normalizeHost/u,
      `${path} should normalize hosts through shared db helper`,
    );
    assert.match(
      helper,
      /isPlatformHost/u,
      `${path} should block platform hosts as portal tenants`,
    );
    assert.match(
      helper,
      /isFieldgridSubdomain/u,
      `${path} should safely block unknown Fieldgrid subdomains`,
    );
    assert.match(
      helper,
      /isTenantDomainAllowedForRuntimeEnvironment/u,
      `${path} should reject cross-environment Fieldgrid domains`,
    );
    assert.match(
      helper,
      /tlsStatus/u,
      `${path} should require active TLS for custom domains`,
    );
    assert.match(
      helper,
      /tenantDomainsTable/u,
      `${path} should resolve verified tenant domains`,
    );
    assert.match(
      helper,
      /TENANT_RUNTIME_ACTIVE_STATUSES/u,
      `${path} should require runtime-active tenants`,
    );
    assert.match(
      helper,
      /ne\(tenantDomainsTable\.type, "platform_reserved"\)/u,
      `${path} should ignore platform-reserved domains`,
    );
  }
});

test("every runtime surface validates environment ownership before platform-host classification", () => {
  for (const path of runtimeHostResolvers) {
    const helper = read(path);
    const environmentGuard = helper.indexOf(
      "!isFieldgridHostAllowedForRuntimeEnvironment(normalizedHost)",
    );
    const platformClassification = helper.indexOf(
      "if (isPlatformHost(normalizedHost))",
    );
    assert.ok(
      environmentGuard >= 0 && platformClassification > environmentGuard,
      `${path} should reject cross-environment platform hosts before classification`,
    );
  }
});

test("platform support and login reject cross-environment fixed hosts", () => {
  const platform = read("artifacts/backoffice/src/lib/auth/platform.ts");
  const login = read("artifacts/backoffice/src/app/(auth)/login/page.tsx");

  const platformEnvironmentGuard = platform.indexOf(
    "isFieldgridHostAllowedForRuntimeEnvironment(normalizedHost)",
  );
  const platformClassification = platform.indexOf(
    "isPlatformHost(normalizedHost)",
  );
  assert.ok(
    platformEnvironmentGuard >= 0 &&
      platformClassification > platformEnvironmentGuard,
  );
  assert.equal(
    platform.match(/return isEnvironmentOwnedPlatformHost\(host\);/gu)?.length,
    2,
  );

  const loginEnvironmentGuard = login.indexOf(
    "if (!isFieldgridHostAllowedForRuntimeEnvironment(host)) notFound();",
  );
  const loginClassification = login.indexOf("isPlatformHost(host)");
  assert.ok(
    loginEnvironmentGuard >= 0 &&
      loginClassification > loginEnvironmentGuard,
  );
});

test("customer portal identity is scoped to the host tenant", () => {
  const customer = read("artifacts/klant-pwa/src/actions/customer.ts");

  assert.match(customer, /requireCurrentCustomerPortalTenantId/u);
  assert.match(
    customer,
    /const tenantId = await requireCurrentCustomerPortalTenantId\(\);/u,
  );
  assert.match(customer, /if \(!tenantId\) return \[\];/u);
  assert.match(customer, /eq\(customerUsersTable\.tenantId, tenantId\)/u);
  assert.match(customer, /eq\(customersTable\.tenantId, tenantId\)/u);
  assert.match(
    customer,
    /eq\(customersTable\.tenantId, customerUsersTable\.tenantId\)/u,
  );
  assert.match(customer, /eq\(customerUsersTable\.userId, user\.id\)/u);
  assert.match(customer, /eq\(customerUsersTable\.status, "active"\)/u);
  assert.doesNotMatch(customer, /isNull\(customerUsersTable\.userId\)/u);
});

test("personnel portal profile and mutations are scoped to the host tenant", () => {
  const personnel = read("artifacts/personeel-pwa/src/actions/personnel.ts");
  const personnelLayout = read(
    "artifacts/personeel-pwa/src/app/(app)/layout.tsx",
  );

  assert.match(personnel, /getCurrentPortalTenantId/u);
  assert.match(
    personnel,
    /const tenantId = await getCurrentPortalTenantId\(\);/u,
  );

  const supabaseTenantFilters = [
    ...personnel.matchAll(/\.eq\("tenant_id", tenantId\)/gu),
  ].length;
  const drizzleTenantFilters = [
    ...personnel.matchAll(/eq\(personnelTable\.tenantId, tenantId\)/gu),
  ].length;

  assert.ok(
    supabaseTenantFilters >= 1,
    "Supabase personnel identity lookup should filter by host tenant",
  );
  assert.ok(
    drizzleTenantFilters >= 5,
    "Drizzle personnel mutations should filter by host tenant",
  );
  assert.match(personnel, /\.eq\("user_id", user\.id\)/u);
  assert.doesNotMatch(personnel, /\.eq\("email", user\.email/u);
  assert.match(
    personnel,
    /persistMyNotificationSettings\(user\.id, tenantId,/u,
  );
  assert.ok(
    personnelLayout.indexOf("if (!personnel)") >= 0 &&
      personnelLayout.indexOf(
        "await personnelOnboardingRequiredForCurrentMembership()",
      ) > personnelLayout.indexOf("if (!personnel)"),
    "inactive personnel must be denied before the onboarding membership lookup",
  );
});
