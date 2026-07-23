import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateWebsiteActivationPreflight,
  websiteActivationCommandSchema,
  websiteActivationErrorCode,
} from "../src/enterprise-activation";

const passingInput = {
  tenantActive: true,
  enterprisePlan: true,
  websiteEntitled: true,
  siteActive: true,
  primaryDomainActive: true,
  stagingHostname: true,
  exactCurrentState: true,
  candidateIdentityMatches: true,
  candidateApproved: true,
  routeRoutable: true,
  healthFresh: true,
  tlsValid: true,
  publicAddressesOnly: true,
  seoHealthy: true,
  assetsHealthy: true,
  platformFormsConnected: true,
};

test("enterprise activation is ready only when every staging preflight passes", () => {
  const ready = evaluateWebsiteActivationPreflight(passingInput);
  assert.equal(ready.status, "ready");
  assert.equal(ready.environment, "staging");
  assert.equal(ready.productionEnabled, false);
  assert.equal(ready.checks.length, 16);

  for (const key of Object.keys(passingInput)) {
    const blocked = evaluateWebsiteActivationPreflight({
      ...passingInput,
      [key]: false,
    });
    assert.equal(blocked.status, "blocked", key);
    assert.equal(
      blocked.checks.find((check) => check.key === key)?.status,
      "fail",
      key,
    );
  }
});

test("activation commands require exact state, change reference and reason", () => {
  const command = websiteActivationCommandSchema.parse({
    tenantId: "10000000-0000-4000-8000-000000000001",
    siteId: "10000000-0000-4000-8000-000000000002",
    deploymentId: "10000000-0000-4000-8000-000000000003",
    expectedDeliveryRevision: 4,
    expectedMode: "managed_cms",
    expectedTargetId: "10000000-0000-4000-8000-000000000004",
    changeReference: "FG-WEB-9/activate",
    reason: "Activate the exact reviewed staging deployment.",
  });
  assert.equal(command.expectedDeliveryRevision, 4);
  assert.throws(() =>
    websiteActivationCommandSchema.parse({
      ...command,
      changeReference: "x",
    }),
  );
  assert.throws(() =>
    websiteActivationCommandSchema.parse({
      ...command,
      reason: "short",
    }),
  );
});

test("activation failures are reduced to bounded non-secret error codes", () => {
  assert.equal(
    websiteActivationErrorCode(new Error("website delivery revision conflict")),
    "delivery_revision_conflict",
  );
  assert.equal(
    websiteActivationErrorCode(new Error("private value abc")),
    "activation_failed",
  );
});
