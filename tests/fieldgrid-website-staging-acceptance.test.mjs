import assert from "node:assert/strict";
import { test } from "node:test";

import { safeStagingUrl, validateWebsiteStagingAcceptanceConfig } from "../scripts/fieldgrid-website-staging-acceptance.mjs";

const expectedStagingSha = "a".repeat(40);
const validInput = {
  expectedStagingSha,
  websiteHealthUrl: "https://website.staging.fieldgrid.nl/healthz",
  managedUrl: "https://managed-proof.staging.fieldgrid.nl/",
  customUrl: "https://custom-proof.staging.fieldgrid.nl/",
};
const validEnvironment = {
  APP_ENV: "staging",
  TARGET_ENVIRONMENT: "staging",
  GITHUB_REF_NAME: "staging",
  GITHUB_SHA: expectedStagingSha,
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
