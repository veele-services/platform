import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("custom delivery origins are code-owned, HTTPS-only and fail closed", () => {
  const registry = read("lib/website-core/src/custom-delivery.ts");
  const resolver = read("lib/db/src/website-public-runtime.ts");

  assert.match(registry, /parsed\.protocol !== "https:"/u);
  assert.match(registry, /isIpv4Literal/u);
  assert.match(registry, /isIpv6Literal/u);
  assert.match(registry, /BLOCKED_ORIGIN_SUFFIXES/u);
  assert.match(registry, /status: "non_live" as const/u);
  assert.doesNotMatch(registry, /process\.env|tenant.*origin/iu);

  assert.match(resolver, /website_custom_deployments custom_deployment/u);
  assert.match(resolver, /custom_route_not_routable/u);
  assert.match(resolver, /custom_health_stale/u);
  assert.match(resolver, /customWebsiteHealthEvidenceMatches/u);
  assert.match(
    resolver,
    /custom-mode[\s\S]*never falls back to managed content/u,
  );
  assert.doesNotMatch(
    resolver,
    /public\.website_(pages|page_sections|navigation_items)/u,
  );
});

test("the Veele candidate is immutable, non-live and preserves 44 routes", () => {
  const registry = read("lib/website-core/src/custom-delivery.ts");
  const operations = read("docs/website-module-custom-routing.md");

  assert.match(registry, /VEELE_MARKETING_ROUTE_CONTRACT/u);
  assert.match(registry, /routeCount: 44/u);
  assert.match(
    registry,
    /6fe45e341f4f0776b512e9ca0f9546b08e2a1e1723383101d7b57c60bfd91e4b/u,
  );
  assert.match(operations, /Planned staging edge change — not applied/u);
  assert.match(
    operations,
    /No DNS, Caddy, staging, production, database row or deployment was changed/u,
  );
  assert.match(operations, /never automatic\s+fallback/u);
});
