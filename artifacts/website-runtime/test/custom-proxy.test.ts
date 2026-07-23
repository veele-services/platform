import assert from "node:assert/strict";
import test from "node:test";

import type { ReadyCustomWebsiteResolution } from "@workspace/db/website-public-runtime";
import { buildCustomWebsiteRewrite } from "../src/lib/custom-proxy";

const resolution: ReadyCustomWebsiteResolution = {
  status: "ready",
  tenantId: "10000000-0000-4000-8000-000000000001",
  siteId: "10000000-0000-4000-8000-000000000002",
  deploymentId: "10000000-0000-4000-8000-000000000003",
  requestHostname: "alpha.staging.fieldgrid.nl",
  canonicalHostname: "alpha.staging.fieldgrid.nl",
  deliveryRevision: 7,
  providerKey: "fieldgrid_vps",
  routeKey: "alpha_marketing",
  releaseId: "git:0123456789abcdef",
  healthPath: "/api/health",
  checkedAt: "2026-07-23T12:00:00.000Z",
  route: {
    providerKey: "fieldgrid_vps",
    routeKey: "alpha_marketing",
    releaseId: "git:0123456789abcdef",
    expectedHosts: ["alpha.staging.fieldgrid.nl"],
    healthPath: "/api/health",
    status: "routable",
    upstreamOrigin: "https://alpha-origin.staging.fieldgrid.nl",
  },
};

test("custom rewrite preserves path/query and forwards only allowlisted headers", () => {
  const headers = new Headers({
    accept: "text/html",
    authorization: "Bearer private",
    cookie: "sb-access-token=private",
    "user-agent": "Fieldgrid test",
    "x-forwarded-host": "attacker.example",
    "x-private-token": "private",
  });
  const rewrite = buildCustomWebsiteRewrite(
    new URL("https://alpha.staging.fieldgrid.nl/diensten?utm_source=fieldgrid"),
    headers,
    resolution,
  );

  assert.equal(
    rewrite.destination.href,
    "https://alpha-origin.staging.fieldgrid.nl/diensten?utm_source=fieldgrid",
  );
  assert.equal(rewrite.requestHeaders.get("accept"), "text/html");
  assert.equal(rewrite.requestHeaders.get("user-agent"), "Fieldgrid test");
  assert.equal(
    rewrite.requestHeaders.get("x-forwarded-host"),
    "alpha.staging.fieldgrid.nl",
  );
  assert.equal(rewrite.requestHeaders.get("x-forwarded-proto"), "https");
  assert.equal(rewrite.requestHeaders.has("authorization"), false);
  assert.equal(rewrite.requestHeaders.has("cookie"), false);
  assert.equal(rewrite.requestHeaders.has("x-private-token"), false);
});

test("custom rewrite cannot escape the code-owned upstream origin", () => {
  const rewrite = buildCustomWebsiteRewrite(
    new URL("https://alpha.staging.fieldgrid.nl//evil.example/path"),
    new Headers(),
    resolution,
  );
  assert.equal(
    rewrite.destination.origin,
    "https://alpha-origin.staging.fieldgrid.nl",
  );
});
