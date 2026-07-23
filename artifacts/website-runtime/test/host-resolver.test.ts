import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveManagedWebsiteByHost,
  resolveWebsiteDeliveryByHost,
  type WebsiteRuntimeQuery,
} from "@workspace/db/website-public-runtime";
import {
  VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE,
  createCustomWebsiteRouteRegistry,
} from "@workspace/website-core";
import { databaseRow, TEST_IDS } from "./fixtures";

const CUSTOM_IDENTITY = {
  providerKey: "fieldgrid_vps",
  routeKey: "fixture_marketing_primary",
  releaseId: "git:0123456789abcdef",
  expectedHost: "alpha.fieldgrid.nl",
  healthPath: "/api/health",
} as const;

const customRoutes = createCustomWebsiteRouteRegistry([
  {
    ...CUSTOM_IDENTITY,
    expectedHosts: [CUSTOM_IDENTITY.expectedHost],
    status: "routable",
    upstreamOrigin: "https://fixture-custom.fieldgrid.nl",
  },
]);

function customDatabaseRow(overrides: Parameters<typeof databaseRow>[0] = {}) {
  return databaseRow({
    delivery_mode: "custom_nextjs",
    active_custom_deployment_id: TEST_IDS.customDeployment,
    custom_deployment_id: TEST_IDS.customDeployment,
    custom_deployment_status: "ready",
    custom_provider_key: CUSTOM_IDENTITY.providerKey,
    custom_route_key: CUSTOM_IDENTITY.routeKey,
    custom_release_id: CUSTOM_IDENTITY.releaseId,
    custom_expected_host: CUSTOM_IDENTITY.expectedHost,
    custom_health_path: CUSTOM_IDENTITY.healthPath,
    custom_approved_at: "2026-07-22T09:00:00.000Z",
    custom_approved_by: "20000000-0000-4000-8000-000000000099",
    custom_last_checked_at: "2026-07-22T09:04:00.000Z",
    custom_last_health: {
      schemaVersion: 3,
      status: "healthy",
      providerKey: CUSTOM_IDENTITY.providerKey,
      routeKey: CUSTOM_IDENTITY.routeKey,
      releaseId: CUSTOM_IDENTITY.releaseId,
      expectedHost: CUSTOM_IDENTITY.expectedHost,
      tls: { valid: true },
      network: { publicAddressesOnly: true },
      seo: {
        canonical: true,
        robots: true,
        sitemap: true,
        structuredData: true,
      },
      assets: { healthy: true },
      forms: { platformEndpoint: true },
    },
    ...overrides,
  });
}

test("host resolver loads only the active publication boundary", async () => {
  let sql = "";
  let values: readonly unknown[] = [];
  const query: WebsiteRuntimeQuery = async (statement, parameters) => {
    sql = statement;
    values = parameters;
    return { rows: [databaseRow()] };
  };

  const result = await resolveManagedWebsiteByHost(
    "ALPHA.fieldgrid.nl:443",
    query,
  );
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.tenantId, TEST_IDS.tenant);
    assert.equal(result.deliveryRevision, 3);
    assert.match(result.etag, /^"fgw-v1-r3-[a-f0-9]{64}"$/u);
  }
  assert.deepEqual(values, ["alpha.fieldgrid.nl"]);
  assert.match(sql, /website_publications publication/u);
  assert.match(sql, /website_custom_deployments custom_deployment/u);
  assert.doesNotMatch(
    sql,
    /website_pages|website_page_sections|website_navigation_items/u,
  );
});

test("the shared resolver selects one exact allowlisted custom deployment", async () => {
  let sql = "";
  const result = await resolveWebsiteDeliveryByHost("ALPHA.fieldgrid.nl:443", {
    query: async (statement) => {
      sql = statement;
      return { rows: [customDatabaseRow()] };
    },
    customRoutes,
    now: new Date("2026-07-22T09:05:00.000Z"),
  });

  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.deliveryMode, "custom_nextjs");
    assert.equal(result.website.deliveryRevision, 3);
    if (result.deliveryMode === "custom_nextjs") {
      assert.equal(result.website.deploymentId, TEST_IDS.customDeployment);
      assert.equal(
        result.website.route.upstreamOrigin,
        "https://fixture-custom.fieldgrid.nl",
      );
    }
  }
  assert.doesNotMatch(
    sql,
    /website_pages|website_page_sections|website_navigation_items/u,
  );
});

test("custom mode fails closed without fallback for stale or mismatched targets", async () => {
  for (const [overrides, reason] of [
    [
      { custom_last_checked_at: "2026-07-22T08:00:00.000Z" },
      "custom_health_stale",
    ],
    [
      { custom_expected_host: "other.fieldgrid.nl" },
      "custom_deployment_identity_mismatch",
    ],
    [
      {
        custom_last_health: {
          schemaVersion: 3,
          status: "healthy",
          providerKey: CUSTOM_IDENTITY.providerKey,
          routeKey: CUSTOM_IDENTITY.routeKey,
          releaseId: "git:stale",
          expectedHost: CUSTOM_IDENTITY.expectedHost,
          tls: { valid: true },
          network: { publicAddressesOnly: true },
          seo: {
            canonical: true,
            robots: true,
            sitemap: true,
            structuredData: true,
          },
          assets: { healthy: true },
          forms: { platformEndpoint: true },
        },
      },
      "custom_health_invalid",
    ],
    [{ custom_route_key: "unregistered_route" }, "custom_route_not_routable"],
    [{ tenant_plan_key: "professional" }, "custom_enterprise_required"],
  ] as const) {
    const result = await resolveWebsiteDeliveryByHost("alpha.fieldgrid.nl", {
      query: async () => ({ rows: [customDatabaseRow(overrides)] }),
      customRoutes,
      now: new Date("2026-07-22T09:05:00.000Z"),
    });
    assert.deepEqual(result, { status: "unavailable", reason });
  }
});

test("the registered Veele candidate remains non-live even with healthy evidence", async () => {
  const hostname = "veeleservices.staging.fieldgrid.nl";
  const candidate = VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE;
  const result = await resolveWebsiteDeliveryByHost(hostname, {
    query: async () => ({
      rows: [
        customDatabaseRow({
          request_hostname: hostname,
          tenant_domain_hostname: hostname,
          canonical_hostname: hostname,
          canonical_domain_hostname: hostname,
          custom_provider_key: candidate.providerKey,
          custom_route_key: candidate.routeKey,
          custom_release_id: candidate.releaseId,
          custom_expected_host: hostname,
          custom_health_path: candidate.healthPath,
          custom_last_health: {
            schemaVersion: 3,
            status: "healthy",
            providerKey: candidate.providerKey,
            routeKey: candidate.routeKey,
            releaseId: candidate.releaseId,
            expectedHost: hostname,
            tls: { valid: true },
            network: { publicAddressesOnly: true },
            seo: {
              canonical: true,
              robots: true,
              sitemap: true,
              structuredData: true,
            },
            assets: { healthy: true },
            forms: { platformEndpoint: true },
          },
        }),
      ],
    }),
    now: new Date("2026-07-22T09:05:00.000Z"),
  });
  assert.deepEqual(result, {
    status: "unavailable",
    reason: "custom_route_not_routable",
  });
});

test("unknown and malformed hosts fail closed", async () => {
  let calls = 0;
  const query: WebsiteRuntimeQuery = async () => {
    calls += 1;
    return { rows: [] };
  };
  assert.deepEqual(
    await resolveManagedWebsiteByHost("unknown.fieldgrid.nl", query),
    {
      status: "not_found",
    },
  );
  assert.deepEqual(
    await resolveManagedWebsiteByHost("platform.fieldgrid.nl", query),
    {
      status: "not_found",
    },
  );
  assert.equal(calls, 1);
});

test("disabled domains, custom mode and stale publication revisions are unavailable", async () => {
  for (const [overrides, reason] of [
    [{ binding_status: "disabled" }, "domain_inactive"],
    [{ delivery_mode: "custom_nextjs" }, "delivery_mode_mismatch"],
    [
      { publication_target_delivery_revision: 2 },
      "publication_revision_mismatch",
    ],
    [{ module_enabled: false }, "module_disabled"],
  ] as const) {
    const result = await resolveManagedWebsiteByHost(
      "alpha.fieldgrid.nl",
      async () => ({
        rows: [databaseRow(overrides)],
      }),
    );
    assert.deepEqual(result, { status: "unavailable", reason });
  }
});

test("snapshot, canonical host and cache identities must match the selected row", async () => {
  for (const overrides of [
    { canonical_hostname: "other.fieldgrid.nl" },
    { canonical_domain_disabled_at: "2026-07-22T01:00:00.000Z" },
    { publication_cache_key: "website-publication:wrong" },
    { publication_schema_version: 2 },
  ]) {
    const result = await resolveManagedWebsiteByHost(
      "alpha.fieldgrid.nl",
      async () => ({
        rows: [databaseRow(overrides)],
      }),
    );
    assert.equal(result.status, "unavailable");
  }
});
