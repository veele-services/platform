import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { safeStagingUrl, validateWebsiteStagingAcceptanceConfig } from "../scripts/fieldgrid-website-staging-acceptance.mjs";

const expectedStagingSha = "a".repeat(40);
const validInput = {
  expectedStagingSha,
  websiteHealthUrl: "https://website.staging.fieldgrid.nl/healthz",
  marketingHealthUrl: "https://veele-origin.staging.fieldgrid.nl/healthz",
  managedUrl: "https://managed-proof.staging.fieldgrid.nl/",
  customUrl: "https://veele.staging.fieldgrid.nl/",
};
const validEnvironment = {
  APP_ENV: "staging",
  TARGET_ENVIRONMENT: "staging",
  GITHUB_REF_NAME: "staging",
  GITHUB_SHA: expectedStagingSha,
  FIELDGRID_CUSTOM_ROUTE_KEY: "veele_staging_primary",
  FIELDGRID_CUSTOM_EXPECTED_HOST: "veele.staging.fieldgrid.nl",
};

test("website staging acceptance requires exact staging-only inputs", () => {
  assert.deepEqual(validateWebsiteStagingAcceptanceConfig(validInput, validEnvironment), []);
  assert.equal(safeStagingUrl("https://managed-proof.staging.fieldgrid.nl/", "managed").hostname, "managed-proof.staging.fieldgrid.nl");
});

test("website staging acceptance rejects production, credentials and stale refs", () => {
  const errors = validateWebsiteStagingAcceptanceConfig(
    {
      ...validInput,
      expectedStagingSha: "b".repeat(40),
      managedUrl: "https://user:secret@managed.fieldgrid.nl/?token=secret",
      customUrl: validInput.managedUrl,
    },
    { ...validEnvironment, APP_ENV: "production" },
  );
  assert.match(errors.join(" "), /APP_ENV must be staging/u);
  assert.match(errors.join(" "), /checkout SHA differs/u);
  assert.match(errors.join(" "), /credential-free HTTPS staging/u);
});

test("website staging acceptance requires separate managed and custom hosts", () => {
  const errors = validateWebsiteStagingAcceptanceConfig({ ...validInput, customUrl: validInput.managedUrl }, validEnvironment);
  assert.match(errors.join(" "), /hosts must differ/u);
});

test("website staging acceptance requires the exact marketing process health path", () => {
  const errors = validateWebsiteStagingAcceptanceConfig(
    {
      ...validInput,
      marketingHealthUrl:
        "https://veele-origin.staging.fieldgrid.nl/api/health",
    },
    validEnvironment,
  );
  assert.match(errors.join(" "), /marketing health URL must end at \/healthz/u);
});

test("website staging acceptance proves candidate identity and form configuration read-only", () => {
  const script = readFileSync(
    new URL("../scripts/fieldgrid-website-staging-acceptance.mjs", import.meta.url),
    "utf8",
  );
  const workflow = readFileSync(
    new URL("../.github/workflows/website-staging-acceptance.yml", import.meta.url),
    "utf8",
  );

  assert.match(script, /pathUrl\(marketingHealthUrl, "\/api\/health"\)/u);
  assert.match(script, /pathUrl\(customUrl, "\/fieldgrid-runtime\/form-config"\)/u);
  assert.match(script, /candidateIdentityMatched: true/u);
  assert.match(script, /formEndpointConfigured: true/u);
  assert.match(script, /endpointRecorded: false/u);
  assert.doesNotMatch(script, /method:\s*"POST"/u);
  assert.match(workflow, /MARKETING_PUBLIC_HEALTH_URL/u);
  assert.match(workflow, /FIELDGRID_CUSTOM_EXPECTED_HOST/u);
});
