import assert from "node:assert/strict";
import { test } from "node:test";
import { selectTenantApplicationHost } from "../../lib/db/src/tenant-application-host";

test("activation host selection rejects cross-environment managed domains", () => {
  const candidates = [
    {
      domain: "veeleservices.fieldgrid.nl",
      type: "fieldgrid_subdomain",
      verificationStatus: "active",
      tlsStatus: "active",
    },
    {
      domain: "veeleservices.staging.fieldgrid.nl",
      type: "fieldgrid_subdomain",
      verificationStatus: "verified",
      tlsStatus: "pending",
    },
  ];
  assert.equal(
    selectTenantApplicationHost(candidates, "staging"),
    "veeleservices.staging.fieldgrid.nl",
  );
  assert.equal(
    selectTenantApplicationHost(candidates, "production"),
    "veeleservices.fieldgrid.nl",
  );
});

test("custom activation hosts require active verification and TLS", () => {
  const pending = {
    domain: "www.veeleservices.nl",
    type: "custom_domain",
    verificationStatus: "verified",
    tlsStatus: "pending",
  };
  assert.equal(selectTenantApplicationHost([pending], "production"), null);
  assert.equal(
    selectTenantApplicationHost(
      [
        {
          ...pending,
          verificationStatus: "active",
          tlsStatus: "active",
        },
      ],
      "production",
    ),
    "www.veeleservices.nl",
  );
});

test("managed environment host wins over a primary custom domain", () => {
  assert.equal(
    selectTenantApplicationHost(
      [
        {
          domain: "www.veeleservices.nl",
          type: "custom_domain",
          verificationStatus: "active",
          tlsStatus: "active",
        },
        {
          domain: "veeleservices.staging.fieldgrid.nl",
          type: "fieldgrid_subdomain",
          verificationStatus: "verified",
          tlsStatus: "pending",
        },
      ],
      "staging",
    ),
    "veeleservices.staging.fieldgrid.nl",
  );
});
