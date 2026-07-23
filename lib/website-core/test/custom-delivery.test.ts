import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  FIELDGRID_CUSTOM_WEBSITE_ROUTE_REGISTRY,
  VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE,
  VEELE_MARKETING_ROUTE_CONTRACT,
  VEELE_MARKETING_ROUTE_CONTRACT_SHA256,
  createCustomWebsiteRouteRegistry,
  createStagingCustomWebsiteRouteRegistry,
  customWebsiteHealthEvidenceMatches,
  customWebsiteOriginAddressesArePublic,
} from "../src/custom-delivery";

const identity = {
  providerKey: "fieldgrid_vps",
  routeKey: "fixture_marketing_primary",
  releaseId: "git:0123456789abcdef",
  expectedHost: "fixture.staging.fieldgrid.nl",
  healthPath: "/api/health",
} as const;

test("Veele is registered as an immutable non-live 44-route candidate", () => {
  assert.equal(VEELE_MARKETING_ROUTE_CONTRACT.length, 44);
  assert.equal(new Set(VEELE_MARKETING_ROUTE_CONTRACT).size, 44);
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(VEELE_MARKETING_ROUTE_CONTRACT))
      .digest("hex"),
    VEELE_MARKETING_ROUTE_CONTRACT_SHA256,
  );
  assert.equal(VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE.status, "non_live");
  assert.equal(
    VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE.source.tree,
    "4bbc345fd18393f2de32bb29a25fb5e909e2792b",
  );
  assert.equal(
    FIELDGRID_CUSTOM_WEBSITE_ROUTE_REGISTRY.resolve({
      providerKey: VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE.providerKey,
      routeKey: VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE.routeKey,
      releaseId: VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE.releaseId,
      expectedHost: "veeleservices.staging.fieldgrid.nl",
      healthPath: VEELE_MARKETING_CUSTOM_DEPLOYMENT_CANDIDATE.healthPath,
    })?.status,
    "non_live",
  );
});

test("a route is selected only by its exact code-approved identity", () => {
  const registry = createCustomWebsiteRouteRegistry([
    {
      ...identity,
      expectedHosts: [identity.expectedHost],
      status: "routable",
      upstreamOrigin: "https://fixture-custom.fieldgrid.nl",
    },
  ]);

  const selected = registry.resolve(identity);
  assert.equal(selected?.status, "routable");
  if (selected?.status === "routable") {
    assert.equal(
      selected.upstreamOrigin,
      "https://fixture-custom.fieldgrid.nl",
    );
  }

  for (const override of [
    { routeKey: "other_route" },
    { releaseId: "git:other" },
    { expectedHost: "other.staging.fieldgrid.nl" },
    { healthPath: "/healthz" },
  ]) {
    assert.equal(registry.resolve({ ...identity, ...override }), null);
  }
});

test("route registration rejects URL-shaped keys and unsafe origins", () => {
  assert.throws(() =>
    createCustomWebsiteRouteRegistry([
      {
        ...identity,
        routeKey: "https://tenant.example",
        expectedHosts: [identity.expectedHost],
        status: "routable",
        upstreamOrigin: "https://public.fieldgrid.nl",
      },
    ]),
  );

  for (const upstreamOrigin of [
    "http://public.example",
    "https://user:secret@public.example",
    "https://127.0.0.1",
    "https://10.0.0.8",
    "https://169.254.169.254",
    "https://[::1]",
    "https://service.internal",
    "https://localhost",
    "https://service.test",
    "https://service.example",
    "https://public.example/private",
    "https://public.example?target=private",
  ]) {
    assert.throws(
      () =>
        createCustomWebsiteRouteRegistry([
          {
            ...identity,
            expectedHosts: [identity.expectedHost],
            status: "routable",
            upstreamOrigin,
          },
        ]),
      upstreamOrigin,
    );
  }
});

test("staging route configuration rejects a production upstream", () => {
  const registration = {
    providerKey: identity.providerKey,
    routeKey: identity.routeKey,
    releaseId: identity.releaseId,
    expectedHosts: [identity.expectedHost],
    healthPath: identity.healthPath,
    status: "routable",
    upstreamOrigin: "https://fixture-custom.staging.fieldgrid.nl",
  } as const;
  assert.equal(
    createStagingCustomWebsiteRouteRegistry(
      JSON.stringify([registration]),
    ).registrations[0]?.status,
    "routable",
  );
  assert.throws(
    () =>
      createStagingCustomWebsiteRouteRegistry(
        JSON.stringify([
          {
            ...registration,
            upstreamOrigin: "https://fixture-custom.fieldgrid.nl",
          },
        ]),
      ),
    /upstreams must be staging-only/u,
  );
});

test("health evidence is strict and bound to route, release, host and TLS", () => {
  const evidence = {
    schemaVersion: 3,
    status: "healthy",
    providerKey: identity.providerKey,
    routeKey: identity.routeKey,
    releaseId: identity.releaseId,
    expectedHost: identity.expectedHost,
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
  };
  assert.equal(customWebsiteHealthEvidenceMatches(evidence, identity), true);
  assert.equal(
    customWebsiteHealthEvidenceMatches(
      { ...evidence, releaseId: "git:stale" },
      identity,
    ),
    false,
  );
  assert.equal(
    customWebsiteHealthEvidenceMatches(
      { ...evidence, origin: "https://private.example" },
      identity,
    ),
    false,
  );
  assert.equal(
    customWebsiteHealthEvidenceMatches(
      { ...evidence, tls: { valid: false } },
      identity,
    ),
    false,
  );
  assert.equal(
    customWebsiteHealthEvidenceMatches(
      { ...evidence, network: { publicAddressesOnly: false } },
      identity,
    ),
    false,
  );
  assert.equal(
    customWebsiteHealthEvidenceMatches(
      { ...evidence, seo: { ...evidence.seo, sitemap: false } },
      identity,
    ),
    false,
  );
});

test("health preflight rejects private, loopback, link-local and special-use DNS results", () => {
  assert.equal(
    customWebsiteOriginAddressesArePublic([
      "93.184.216.34",
      "2606:2800:220:1:248:1893:25c8:1946",
    ]),
    true,
  );
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "::1",
    "fc00::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "1::2::3",
  ]) {
    assert.equal(
      customWebsiteOriginAddressesArePublic([address]),
      false,
      address,
    );
  }
  assert.equal(customWebsiteOriginAddressesArePublic([]), false);
  assert.equal(customWebsiteOriginAddressesArePublic(["not-an-ip"]), false);
});
