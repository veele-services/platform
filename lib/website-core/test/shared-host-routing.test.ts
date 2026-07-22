import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIELDGRID_SHARED_HOST_PATHS,
  classifySharedHost,
  filterWebsiteCookieHeader,
  normalizeWebsiteRequestHost,
  resolveSharedHostRoute,
} from "../src/shared-host-routing";

test("shared tenant hosts are explicit and unknown or operational hosts fail closed", () => {
  assert.equal(classifySharedHost("acme.fieldgrid.nl"), "production_tenant");
  assert.equal(classifySharedHost("acme.staging.fieldgrid.nl"), "staging_tenant");
  assert.equal(classifySharedHost("www.acme.nl", ["www.acme.nl"]), "verified_custom_domain");
  assert.equal(classifySharedHost("www.acme.nl"), "unsupported");
  assert.equal(classifySharedHost("platform.fieldgrid.nl"), "unsupported");
  assert.equal(classifySharedHost("staging.fieldgrid.nl"), "unsupported");
  assert.equal(classifySharedHost("staging.fieldgrid.nl", ["staging.fieldgrid.nl"]), "unsupported");
  assert.equal(classifySharedHost("127.0.0.1", ["127.0.0.1"]), "unsupported");
  assert.equal(classifySharedHost("unknown.example"), "unsupported");
});

test("public website Host headers are normalized only from unambiguous authorities", () => {
  assert.equal(normalizeWebsiteRequestHost("ACME.fieldgrid.nl:443"), "acme.fieldgrid.nl");
  assert.equal(normalizeWebsiteRequestHost("acme.staging.fieldgrid.nl"), "acme.staging.fieldgrid.nl");
  assert.equal(normalizeWebsiteRequestHost("website.acme.nl."), "website.acme.nl");

  for (const host of [
    "platform.fieldgrid.nl",
    "acme.fieldgrid.nl,evil.example",
    "https://acme.fieldgrid.nl",
    "user@acme.fieldgrid.nl",
    "acme.fieldgrid.nl/path",
    "127.0.0.1",
    "localhost",
    "acme.fieldgrid.nl:99999",
  ]) {
    assert.equal(normalizeWebsiteRequestHost(host), "", host);
  }
});

test("route precedence preserves every application base path before website fallback", () => {
  const host = "acme.fieldgrid.nl";
  for (const [pathname, owner] of [
    ["/admin", "backoffice"],
    ["/admin/_next/static/app.js", "backoffice"],
    ["/admin/api/reports/one/pdf", "backoffice"],
    ["/personeel", "personnel"],
    ["/personeel/opdrachten/one", "personnel"],
    ["/klant", "customer"],
    ["/klant/facturen", "customer"],
    ["/api/platform/security/export", "platform_api"],
    ["/api/healthz", "platform_api"],
    ["/", "website"],
    ["/_next/static/website.js", "website"],
    ["/diensten", "website"],
    ["/administrator", "website"],
  ] as const) {
    assert.deepEqual(resolveSharedHostRoute({ host, pathname }), {
      hostKind: "production_tenant",
      owner,
      upstreamPath: pathname,
      preservePrefix: true,
    });
  }
  assert.deepEqual(FIELDGRID_SHARED_HOST_PATHS, {
    backoffice: "/admin",
    personnel: "/personeel",
    customer: "/klant",
  });
});

test("staging and verified custom domains use the identical path contract", () => {
  assert.equal(
    resolveSharedHostRoute({ host: "acme.staging.fieldgrid.nl", pathname: "/admin/login" }).owner,
    "backoffice",
  );
  assert.equal(
    resolveSharedHostRoute({
      host: "service.acme.nl",
      pathname: "/klant",
      verifiedCustomDomains: ["service.acme.nl"],
    }).owner,
    "customer",
  );
  assert.equal(resolveSharedHostRoute({ host: "service.acme.nl", pathname: "/" }).owner, "reject");
});

test("ambiguous paths fail closed before any upstream receives them", () => {
  const host = "acme.fieldgrid.nl";
  for (const pathname of ["admin", "//admin", "/admin\\login", "/%2fadmin", "/admin?next=/"] as const) {
    assert.equal(resolveSharedHostRoute({ host, pathname }).owner, "reject");
  }
});

test("public website forwarding strips every application cookie and preserves unrelated cookies", () => {
  const filtered = filterWebsiteCookieHeader(
    "fieldgrid-auth-acme-fieldgrid-nl.0=secret-a; analytics_id=public-1; " +
      "fg_backoffice_recovery_grant=secret-b; backoffice_tenant_id=tenant-a; locale=nl",
  );
  assert.equal(filtered, "analytics_id=public-1; locale=nl");
  assert.equal(filterWebsiteCookieHeader("fieldgrid-auth-acme-fieldgrid-nl=secret"), null);
  assert.equal(filterWebsiteCookieHeader(null), null);
});
