import assert from "node:assert/strict";
import test from "node:test";
import { buildFieldgridCustomHealthEvidence } from "../lib/fieldgrid-custom-health";
import {
  buildFieldgridFormSubmission,
  getFieldgridFormSubmissionEndpoint,
} from "../lib/fieldgrid-forms";

const validEnvironment = {
  APP_ENV: "staging",
  FIELDGRID_CUSTOM_ROUTE_KEY: "veeleservices_staging_primary",
  FIELDGRID_CUSTOM_RELEASE_ID:
    "git-commit:d32e4658650ef03522e83e38905b4d24bc961eeb",
  FIELDGRID_CUSTOM_EXPECTED_HOST: "veeleservices.staging.fieldgrid.nl",
  NEXT_PUBLIC_MARKETING_SITE_URL: "https://veeleservices.staging.fieldgrid.nl",
  FIELDGRID_WEBSITE_FORM_ID: "11111111-1111-4111-8111-111111111111",
} as const;

test("custom health is exact schema v3 for a complete staging identity", () => {
  assert.deepEqual(buildFieldgridCustomHealthEvidence(validEnvironment), {
    ready: true,
    body: {
      schemaVersion: 3,
      status: "healthy",
      providerKey: "fieldgrid_vps",
      routeKey: "veeleservices_staging_primary",
      releaseId: "git-commit:d32e4658650ef03522e83e38905b4d24bc961eeb",
      expectedHost: "veeleservices.staging.fieldgrid.nl",
      tls: { valid: true },
      network: { publicAddressesOnly: true },
      seo: {
        canonical: true,
        robots: true,
        sitemap: true,
        structuredData: true,
      },
      assets: { healthy: true },
      forms: { platformEndpoint: true },
    },
  });
});

test("custom health fails closed outside staging or on identity drift", () => {
  for (const environment of [
    { ...validEnvironment, APP_ENV: "production" },
    {
      ...validEnvironment,
      FIELDGRID_CUSTOM_EXPECTED_HOST: "www.veeleservices.nl",
    },
    {
      ...validEnvironment,
      NEXT_PUBLIC_MARKETING_SITE_URL:
        "https://andere-tenant.staging.fieldgrid.nl",
    },
    {
      ...validEnvironment,
      FIELDGRID_WEBSITE_FORM_ID: "",
    },
  ]) {
    assert.deepEqual(buildFieldgridCustomHealthEvidence(environment), {
      ready: false,
      body: { schemaVersion: 3, status: "unavailable" },
    });
  }
});

test("marketing form payload maps only to the platform allowlist", () => {
  assert.equal(
    getFieldgridFormSubmissionEndpoint("11111111-1111-4111-8111-111111111111"),
    "/api/website-forms/11111111-1111-4111-8111-111111111111/submissions",
  );
  assert.equal(getFieldgridFormSubmissionEndpoint("not-a-uuid"), null);

  assert.deepEqual(
    buildFieldgridFormSubmission({
      kind: "offerte",
      name: "Testpersoon",
      organisation: "Testbedrijf",
      email: "test@example.invalid",
      phone: "+31 20 000 0000",
      message: "Graag ontvangen wij een offerte.",
      website: "",
      submissionId: "submission-id",
    }),
    {
      data: {
        name: "Testpersoon",
        email: "test@example.invalid",
        phone: "+31 20 000 0000",
        company: "Testbedrijf",
        subject: "Offerteaanvraag",
        message: "Graag ontvangen wij een offerte.",
      },
      _submissionId: "submission-id",
      _companyWebsite: "",
    },
  );
});
