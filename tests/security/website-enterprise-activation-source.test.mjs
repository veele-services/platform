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

test("custom candidate registration is idempotent and reports bounded UI feedback", () => {
  const actions = read(
    "artifacts/backoffice/src/app/actions/platform-websites.ts",
  );
  const registrar = read(
    "artifacts/backoffice/src/components/platform/PlatformWebsiteDeploymentRegistrar.tsx",
  );
  const service = read("lib/db/src/website-enterprise-activation-service.ts");
  const page = read(
    "artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx",
  );

  assert.match(
    service,
    /ON CONFLICT \(site_id, provider_key, release_id\) DO NOTHING/u,
  );
  assert.match(service, /created: false/u);
  assert.match(
    service,
    /deployment\.route_key !== input\.routeKey[\s\S]*deployment\.expected_host !== input\.expectedHost[\s\S]*deployment\.health_path !== input\.healthPath/u,
  );
  assert.match(
    actions,
    /registerPlatformWebsiteDeploymentAction[\s\S]*try \{[\s\S]*deployment\.created[\s\S]*catch \(error\)/u,
  );
  assert.match(registrar, /useActionState/u);
  assert.match(registrar, /role=\{state\.success \? "status" : "alert"\}/u);
  assert.match(registrar, /minLength=\{3\}/u);
  assert.match(registrar, /maxLength=\{160\}/u);
  assert.match(registrar, /pattern="\[A-Za-z0-9\]\[A-Za-z0-9\._:\/# -\]\*"/u);
  assert.match(registrar, /dit hoeft geen Git-commit of release-SHA te zijn/u);
  assert.match(page, /Alleen voor een afzonderlijke custom Next\.js-website/u);
  assert.match(page, /registeredDeployment/u);
  assert.match(
    page,
    /een platformsessie wordt niet tussen[\s\S]*hosts[\s\S]*gedeeld/u,
  );
  assert.doesNotMatch(
    page,
    /href=\{`https:\/\/\$\{site\.canonicalHostname\}\/admin\/website\/review`\}/u,
  );
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
