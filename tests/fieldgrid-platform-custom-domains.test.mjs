import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("phase 6 migration adds auditable Enterprise custom-domain state", () => {
  const migration = read("lib/db/migrations/073_platform_custom_domains.sql");
  const schema = read("lib/db/src/schema/tenant-domains.ts");
  const plans = read("lib/db/src/schema/plans.ts");

  assertContains(
    migration,
    [
      "verification_token",
      "dns_txt_name",
      "dns_target",
      "dns_last_checked_at",
      "tls_status",
      "activated_at",
      "disabled_plan",
      "tenant_domains_custom_caddy_idx",
      "tenant_domain_checks",
      "'custom_domains'",
      "'enterprise'",
    ],
    "custom-domain migration",
  );
  assertContains(
    schema,
    [
      "verificationToken",
      "dnsTxtName",
      "tlsStatus",
      "createdByPlatformUserId",
      "verifiedByPlatformUserId",
      "tenantDomainChecksTable",
    ],
    "tenant domain schema",
  );
  assert.ok(plans.includes('"custom_domains"'), "plan limits should expose custom_domains");
});

test("phase 6 platform actions enforce Enterprise gating and DNS verification", () => {
  const actions = read("artifacts/backoffice/src/app/actions/platform-tenants.ts");

  assertContains(
    actions,
    [
      "canTenantUseCustomDomains",
      "customDomainTxtName",
      "customDomainVerificationValue",
      "resolveTxtValues",
      "resolveAValues",
      "resolveCnameValues",
      "tenantCustomDomainGate",
      "tenant_domain_dns_checked",
      "tenant_domain_tls_checked",
      "Custom domains zijn beschikbaar voor Enterprise tenants.",
      "\"pending_dns\"",
      "type: \"fieldgrid_subdomain\"",
    ],
    "platform tenant custom-domain actions",
  );
  assert.match(actions, /td\.verification_status IN \('verified', 'active'\)/u);
});

test("phase 6 tenant detail renders DNS instructions and operator actions", () => {
  const page = read("artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx");

  assertContains(
    page,
    [
      "tenantHasCustomDomains",
      "Custom domains zijn Enterprise-only",
      "DNS instructies",
      "FIELDGRID_PUBLIC_IPV4",
      "FIELDGRID_PUBLIC_IPV6",
      "customDomainVerificationValue",
      "Check DNS",
      "Check TLS",
      "Activeer",
      "Uitschakelen",
    ],
    "tenant custom-domain UI",
  );
});

test("phase 6 runtime accepts verified and active tenant domains", () => {
  const resolvers = [
    "artifacts/backoffice/src/lib/auth/tenant-resolver.ts",
    "artifacts/klant-pwa/src/lib/auth/tenant.ts",
    "artifacts/personeel-pwa/src/lib/auth/tenant.ts",
    "artifacts/api-server/src/middleware/auth.ts",
  ];

  for (const path of resolvers) {
    const source = read(path);
    assert.ok(
      source.includes('inArray(tenantDomainsTable.verificationStatus, ["verified", "active"])'),
      `${path} should route both verified and active tenant domains`,
    );
    assert.ok(!source.includes('eq(tenantDomainsTable.verificationStatus, "verified")'), `${path} should not route only verified domains`);
  }
});

test("phase 6 Caddy ask endpoint is deny-by-default", () => {
  const route = read("artifacts/api-server/src/routes/caddy.ts");
  const app = read("artifacts/api-server/src/app.ts");
  const db = read("lib/db/src/custom-domains.ts");

  assertContains(
    route,
    [
      "/internal/caddy/ask-domain",
      "isCustomDomainAllowedForCaddy",
      "Cache-Control",
      "res.status(allowed ? 200 : 403).end()",
      "res.status(403).end()",
    ],
    "Caddy ask route",
  );
  assertContains(app, ["import caddyRouter", "app.use(caddyRouter)", "app.use(\"/api\", router)"], "API app");
  assertContains(
    db,
    [
      "ROUTABLE_TENANT_DOMAIN_STATUSES",
      "CUSTOM_DOMAIN_TYPE",
      "isCustomDomainAllowedForCaddy",
      "canTenantUseCustomDomains",
      "isTenantRuntimeActive",
      "inArray(tenantDomainsTable.verificationStatus, [...ROUTABLE_TENANT_DOMAIN_STATUSES])",
    ],
    "custom-domain DB helper",
  );
});

test("phase 6 roadmap documents the first custom-domain PR scope", () => {
  const roadmap = read("docs/fieldgrid-platform-admin-roadmap.md");

  assertContains(
    roadmap,
    [
      "Fase 6 - Enterprise custom domains",
      "DNS-instructies tonen",
      "DNS publiek controleren",
      "Caddy toestemming geven voor TLS",
      "Host resolver accepteert verified custom domains",
      "Niet in eerste PR",
    ],
    "platform admin roadmap",
  );
});
