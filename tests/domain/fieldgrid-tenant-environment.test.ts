import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertTenantDomainMatchesEnvironment,
  defaultTenantDomainForSlug,
  isTenantDomainAllowedForEnvironment,
  resolveFieldgridDeploymentEnvironment,
  tenantSlugFromManagedDomain,
} from "../../lib/db/src/tenant-environment";

test("managed tenant domains are derived from the explicit environment", () => {
  assert.equal(
    defaultTenantDomainForSlug("veeleservices", "staging"),
    "veeleservices.staging.fieldgrid.nl",
  );
  assert.equal(
    defaultTenantDomainForSlug("veeleservices", "production"),
    "veeleservices.fieldgrid.nl",
  );
});

test("staging and production tenant domains cannot cross environments", () => {
  assert.equal(
    assertTenantDomainMatchesEnvironment(
      "veeleservices.staging.fieldgrid.nl",
      "staging",
    ),
    "veeleservices.staging.fieldgrid.nl",
  );
  assert.equal(
    assertTenantDomainMatchesEnvironment(
      "veeleservices.fieldgrid.nl",
      "production",
    ),
    "veeleservices.fieldgrid.nl",
  );

  assert.throws(
    () =>
      assertTenantDomainMatchesEnvironment(
        "veeleservices.fieldgrid.nl",
        "staging",
      ),
    /staging/u,
  );
  assert.throws(
    () =>
      assertTenantDomainMatchesEnvironment(
        "veeleservices.staging.fieldgrid.nl",
        "production",
      ),
    /production/u,
  );
});

test("managed tenant domains reject custom, nested and reserved hosts", () => {
  for (const domain of [
    "veeleservices.nl",
    "nested.veeleservices.staging.fieldgrid.nl",
    "website-runtime.staging.fieldgrid.nl",
    "veeleservices-origin.staging.fieldgrid.nl",
    "staging.fieldgrid.nl",
  ]) {
    assert.throws(
      () => assertTenantDomainMatchesEnvironment(domain, "staging"),
      /tenantdomein/u,
    );
  }
});

test("tenant slug extraction uses the exact environment suffix", () => {
  assert.equal(
    tenantSlugFromManagedDomain(
      "veeleservices.staging.fieldgrid.nl",
      "staging",
    ),
    "veeleservices",
  );
  assert.equal(
    tenantSlugFromManagedDomain(
      "veeleservices.staging.fieldgrid.nl",
      "production",
    ),
    null,
  );
});

test("environment resolution fails closed", () => {
  assert.equal(resolveFieldgridDeploymentEnvironment(" staging "), "staging");
  assert.equal(
    resolveFieldgridDeploymentEnvironment("production"),
    "production",
  );
  assert.throws(
    () => resolveFieldgridDeploymentEnvironment("development"),
    /APP_ENV/u,
  );
  assert.throws(
    () => resolveFieldgridDeploymentEnvironment(undefined),
    /APP_ENV/u,
  );
});

test("runtime host policy rejects cross-environment records", () => {
  assert.equal(
    isTenantDomainAllowedForEnvironment(
      "veeleservices.staging.fieldgrid.nl",
      "staging",
    ),
    true,
  );
  assert.equal(
    isTenantDomainAllowedForEnvironment(
      "veeleservices.fieldgrid.nl",
      "staging",
    ),
    false,
  );
  assert.equal(
    isTenantDomainAllowedForEnvironment(
      "veeleservices.staging.fieldgrid.nl",
      "production",
    ),
    false,
  );
  assert.equal(
    isTenantDomainAllowedForEnvironment("www.veeleservices.nl", "production"),
    true,
  );
});
