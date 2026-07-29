import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("enterprise website operations are platform-only and exact-state guarded", () => {
  const actions = read(
    "artifacts/backoffice/src/app/actions/platform-websites.ts",
  );
  const service = read("lib/db/src/website-enterprise-activation-service.ts");
  const contract = read("lib/website-core/src/enterprise-activation.ts");

  assert.equal((actions.match(/requirePlatformAdmin\(\)/gu) ?? []).length, 8);
  assert.match(actions, /initializePlatformManagedWebsiteAction/u);
  assert.match(actions, /initializeManagedWebsite/u);
  assert.match(actions, /createInitialWebsiteSettings/u);
  assert.match(service, /expectedDeliveryRevision/u);
  assert.match(service, /expectedMode/u);
  assert.match(service, /expectedTargetId/u);
  assert.match(service, /configuredFieldgridCustomWebsiteRouteRegistry/u);
  assert.match(service, /activate_website_delivery/u);
  assert.match(contract, /productionEnabled: false/u);
  assert.match(contract, /WEBSITE_ACTIVATION_ENVIRONMENT = "staging"/u);
});

test("custom health probing resists SSRF and records no private response data", () => {
  const service = read("lib/db/src/website-enterprise-activation-service.ts");
  const proxy = read("artifacts/website-runtime/src/lib/custom-proxy.ts");
  const migration = read(
    "lib/db/migrations/20260721290000_website_enterprise_activation.sql",
  );

  assert.match(service, /from "node:dns\/promises"/u);
  assert.match(service, /customWebsiteOriginAddressesArePublic/u);
  assert.match(service, /rejectUnauthorized: true/u);
  assert.match(service, /body\.length > 32_768/u);
  assert.match(service, /request\.setTimeout\(8_000/u);
  assert.doesNotMatch(service, /console\.(?:log|error|warn)/u);
  assert.match(proxy, /FORWARDED_REQUEST_HEADERS/u);
  assert.match(proxy, /const forwarded = new Headers\(\)/u);
  assert.match(
    proxy,
    /FORWARDED_REQUEST_HEADERS\.has\(name\.toLowerCase\(\)\)/u,
  );
  assert.doesNotMatch(proxy, /"authorization"|"cookie"/u);
  assert.match(
    migration,
    /'origin'[\s\S]*'upstreamOrigin'[\s\S]*'responseBody'/u,
  );
});

test("activation evidence is append-only, tenant-scoped and staging-only", () => {
  const migration = read(
    "lib/db/migrations/20260721290000_website_enterprise_activation.sql",
  );
  assert.match(migration, /environment = 'staging'/u);
  assert.match(migration, /website_delivery_operations_tenant_site_fk/u);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/u);
  assert.match(migration, /BEFORE UPDATE OR DELETE/u);
  assert.match(migration, /append-only/u);
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*anon, authenticated/u);
});

test("runtime and deployment controls are staging-only and production-safe", () => {
  const resolver = read("lib/db/src/website-public-runtime.ts");
  const deploy = read(".github/workflows/deploy.yml");
  const acceptance = read("scripts/fieldgrid-website-staging-acceptance.mjs");

  assert.match(resolver, /APP_ENV !== "staging"/u);
  assert.match(
    read("lib/website-core/src/custom-delivery.ts"),
    /custom website upstreams must be staging-only/u,
  );
  assert.match(
    deploy,
    /github\.ref_name == 'staging' && vars\.WEBSITE_SERVICE_NAME/u,
  );
  assert.match(
    deploy,
    /github\.ref_name == 'staging' && vars\.MARKETING_SERVICE_NAME/u,
  );
  assert.match(
    deploy,
    /github\.ref_name == 'staging' && vars\.FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON/u,
  );
  assert.match(acceptance, /productionChanged: false/u);
  assert.match(acceptance, /deploymentPerformed: false/u);
  assert.match(acceptance, /secretsRecorded: false/u);
});
