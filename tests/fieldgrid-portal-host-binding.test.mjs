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

test("backoffice denies unresolved and ambiguous request hosts before tenant fallback or sign-in", () => {
  const helper = read("artifacts/backoffice/src/lib/auth/tenant.ts");
  const requestHost = read("artifacts/backoffice/src/lib/auth/request-host.ts");
  const login = read("artifacts/backoffice/src/app/(auth)/login/page.tsx");
  const auth = read("artifacts/backoffice/src/app/actions/auth.ts");
  const resolver = helper.indexOf(
    "const tenant = await resolveTenantByHost(normalizedHost)",
  );
  const developmentException = helper.indexOf(
    "isBackofficeDevelopmentFallbackHost(normalizedHost)",
    resolver,
  );
  const blockedReturn = helper.indexOf(
    'return { kind: "blocked" };',
    developmentException,
  );
  const tenantFallback = helper.indexOf(
    "const tenantOptions = await getActiveBackofficeTenantsForUser(user.id)",
  );

  assert.ok(resolver >= 0, "backoffice should resolve the request host");
  assert.ok(
    developmentException > resolver && blockedReturn > developmentException,
    "an unresolved non-development host must be blocked",
  );
  assert.ok(
    blockedReturn < tenantFallback,
    "host denial must precede membership and cookie fallback",
  );
  assert.match(requestHost, /trimmedHost\.includes\(","\)/u);
  assert.match(requestHost, /REQUEST_HOST_PATTERN\.test\(trimmedHost\)/u);
  assert.match(requestHost, /\["localhost", "127\.0\.0\.1", "::1"\]/u);
  assert.match(requestHost, /process\.env\.REPLIT_DOMAINS/u);
  assert.match(
    login,
    /getBackofficeHostTenantResolution\(\)[\s\S]*hostResolution\.kind === "blocked"[\s\S]*notFound\(\)/u,
  );
  assert.match(
    auth,
    /getBackofficeHostTenantResolution\(\)[\s\S]*hostResolution\.kind === "blocked"[\s\S]*Deze aanmeldlocatie is niet beschikbaar\./u,
  );
  assert.ok(
    auth.indexOf("getBackofficeHostTenantResolution()") <
      auth.indexOf("supabase.auth.signInWithPassword"),
    "host denial must happen before credentials are submitted",
  );
});

test("platform access, support, and login are bound to a strict environment-owned host", () => {
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
  assert.match(
    platform,
    /requestHost\.kind === "host"[\s\S]*isEnvironmentOwnedPlatformHost\(requestHost\.host\)/u,
  );
  assert.equal(
    platform.match(/readBackofficeRequestHost\(/gu)?.length,
    2,
    "both server-component and Request guards must use strict host parsing",
  );

  const currentPlatformUser = platform.indexOf(
    "export async function getCurrentPlatformUser()",
  );
  const currentHostGuard = platform.indexOf(
    "if (!(await isCurrentHostPlatformHost())) return null;",
    currentPlatformUser,
  );
  const currentIdentityLookup = platform.indexOf(
    "const userId = await getCurrentUserId();",
    currentPlatformUser,
  );
  assert.ok(
    currentPlatformUser >= 0 &&
      currentHostGuard > currentPlatformUser &&
      currentIdentityLookup > currentHostGuard,
    "platform identity must be rejected by host before session lookup",
  );

  const requestPlatformUser = platform.indexOf(
    "export async function getCurrentPlatformUserFromRequest(",
  );
  const requestHostGuard = platform.indexOf(
    "if (!isRequestHostPlatformHost(request)) return null;",
    requestPlatformUser,
  );
  const requestIdentityLookup = platform.indexOf(
    "const userId = await getCurrentUserIdFromRequest(request);",
    requestPlatformUser,
  );
  assert.ok(
    requestPlatformUser >= 0 &&
      requestHostGuard > requestPlatformUser &&
      requestIdentityLookup > requestHostGuard,
    "platform API identity must be rejected by host before session lookup",
  );

  const supportGrant = platform.indexOf(
    "export async function getActiveSupportGrant(tenantId: string)",
  );
  assert.ok(
    platform.indexOf(
      "if (!(await isCurrentHostPlatformHost())) return null;",
      supportGrant,
    ) > supportGrant,
    "support grants must not authorize actions from tenant or unknown hosts",
  );

  const loginEnvironmentGuard = login.indexOf(
    "if (!isFieldgridHostAllowedForRuntimeEnvironment(host)) notFound();",
  );
  const loginClassification = login.indexOf("isPlatformHost(host)");
  assert.ok(
    loginEnvironmentGuard >= 0 && loginClassification > loginEnvironmentGuard,
  );
});

test("customer portal identity is scoped to the host tenant", () => {
  const customer = read("artifacts/klant-pwa/src/actions/customer.ts");
  const customerLayout = read("artifacts/klant-pwa/src/app/(app)/layout.tsx");

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
  assert.ok(
    customerLayout.indexOf("if (!profile)") >= 0 &&
      customerLayout.indexOf(
        "await customerOnboardingRequiredForCurrentMembership()",
      ) > customerLayout.indexOf("if (!profile)"),
    "unauthenticated customers must be denied before the onboarding membership lookup",
  );
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
