import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyStagingSmokeAutomationBearer } from "../../artifacts/backoffice/src/lib/auth/staging-smoke-automation.ts";
import { isStagingSmokeAutomationRequest } from "../../artifacts/backoffice/src/lib/auth/staging-smoke-path.ts";

const secret = "fieldgrid-staging-smoke-secret-32-bytes";
const stagingEnvironment = {
  APP_ENV: "staging",
  TARGET_ENVIRONMENT: "staging",
};

test("staging smoke automation bearer accepts only the configured secret", () => {
  const valid = new Request(
    "https://staging.fieldgrid.nl/admin/api/platform/staging-smoke",
    { headers: { authorization: `Bearer ${secret}` } },
  );
  assert.equal(
    classifyStagingSmokeAutomationBearer(valid, secret, stagingEnvironment),
    "valid",
  );

  for (const authorization of [
    "Bearer wrong-fieldgrid-staging-smoke-secret",
    `Bearer ${secret},Bearer ${secret}`,
    "Basic opaque",
    "Bearer ",
  ]) {
    const invalid = new Request(
      "https://staging.fieldgrid.nl/admin/api/platform/staging-smoke",
      { headers: { authorization } },
    );
    assert.equal(
      classifyStagingSmokeAutomationBearer(invalid, secret, stagingEnvironment),
      "invalid",
    );
  }
});

test("staging smoke automation bearer leaves an absent header to platform-admin cookie auth", () => {
  const request = new Request(
    "https://staging.fieldgrid.nl/admin/api/platform/staging-smoke",
  );
  assert.equal(
    classifyStagingSmokeAutomationBearer(request, secret, {}),
    "absent",
  );
});

test("staging smoke automation bearer fails closed outside an exact staging environment", () => {
  const request = new Request(
    "https://staging.fieldgrid.nl/admin/api/platform/staging-smoke",
    { headers: { authorization: `Bearer ${secret}` } },
  );
  for (const environment of [
    {},
    { APP_ENV: "staging" },
    { TARGET_ENVIRONMENT: "staging" },
    { APP_ENV: "production", TARGET_ENVIRONMENT: "production" },
    { APP_ENV: "staging", TARGET_ENVIRONMENT: "production" },
  ]) {
    assert.equal(
      classifyStagingSmokeAutomationBearer(request, secret, environment),
      "invalid",
    );
  }
});

test("middleware exemption is exact to normalized GET/HEAD staging-smoke requests", () => {
  assert.equal(
    isStagingSmokeAutomationRequest(
      "GET",
      "/api/platform/staging-smoke",
      `Bearer ${secret}`,
    ),
    true,
  );
  assert.equal(
    isStagingSmokeAutomationRequest(
      "HEAD",
      "/api/platform/staging-smoke",
      "Basic malformed",
    ),
    true,
  );
  for (const [method, path, authorization] of [
    ["GET", "/api/platform/staging-smoke", null],
    ["POST", "/api/platform/staging-smoke", `Bearer ${secret}`],
    ["GET", "/api/platform/staging-smoke/extra", `Bearer ${secret}`],
    ["GET", "/platform/staging-smoke", `Bearer ${secret}`],
    ["GET", "/api/platform/security/export", `Bearer ${secret}`],
    ["GET", "/", `Bearer ${secret}`],
  ]) {
    assert.equal(
      isStagingSmokeAutomationRequest(method, path, authorization),
      false,
    );
  }
});
