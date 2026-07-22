import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifySharedHost,
  filterWebsiteCookieHeader,
  resolveSharedHostRoute,
} from "../../lib/website-core/src/shared-host-routing.ts";

test("website shared-host routing is deterministic across production, staging and custom fixtures", () => {
  const fixtures = [
    ["alpha.fieldgrid.nl", [], "production_tenant"],
    ["alpha.staging.fieldgrid.nl", [], "staging_tenant"],
    ["www.alpha.example", ["www.alpha.example"], "verified_custom_domain"],
  ];
  for (const [host, verifiedCustomDomains, expected] of fixtures) {
    assert.equal(classifySharedHost(host, verifiedCustomDomains), expected);
    assert.equal(resolveSharedHostRoute({ host, pathname: "/admin/login", verifiedCustomDomains }).owner, "backoffice");
    assert.equal(resolveSharedHostRoute({ host, pathname: "/personeel", verifiedCustomDomains }).owner, "personnel");
    assert.equal(resolveSharedHostRoute({ host, pathname: "/klant", verifiedCustomDomains }).owner, "customer");
    assert.equal(resolveSharedHostRoute({ host, pathname: "/api/platform/health", verifiedCustomDomains }).owner, "platform_api");
    assert.equal(resolveSharedHostRoute({ host, pathname: "/diensten", verifiedCustomDomains }).owner, "website");
  }
});

test("website shared-host routing fails closed and strips app cookies from public forwarding", () => {
  assert.equal(resolveSharedHostRoute({ host: "platform.fieldgrid.nl", pathname: "/" }).owner, "reject");
  assert.equal(resolveSharedHostRoute({ host: "unverified.example", pathname: "/admin" }).owner, "reject");
  assert.equal(resolveSharedHostRoute({ host: "alpha.fieldgrid.nl", pathname: "/administer" }).owner, "website");
  assert.equal(
    filterWebsiteCookieHeader("fieldgrid-auth-alpha-fieldgrid-nl=secret; website_locale=nl; veele_perms=secret"),
    "website_locale=nl",
  );
  assert.equal(classifySharedHost("staging.fieldgrid.nl", ["staging.fieldgrid.nl"]), "unsupported");
  assert.equal(resolveSharedHostRoute({ host: "alpha.fieldgrid.nl", pathname: "//admin" }).owner, "reject");
  assert.equal(resolveSharedHostRoute({ host: "alpha.fieldgrid.nl", pathname: "/%2fadmin" }).owner, "reject");
});
