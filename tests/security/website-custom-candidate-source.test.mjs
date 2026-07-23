import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("Veele custom health is exact, staging-only and fail-closed", () => {
  const health = read(
    "artifacts/marketing-website/lib/fieldgrid-custom-health.ts",
  );
  const route = read(
    "artifacts/marketing-website/app/api/health/route.ts",
  );

  assert.match(health, /environment\.APP_ENV !== "staging"/u);
  assert.match(health, /\.staging\.fieldgrid\.nl/u);
  assert.match(health, /schemaVersion: 3/u);
  assert.match(health, /providerKey: "fieldgrid_vps"/u);
  assert.match(health, /forms: \{ platformEndpoint: true \}/u);
  assert.match(health, /status: "unavailable"/u);
  assert.match(route, /status: result\.ready \? 200 : 503/u);
  assert.doesNotMatch(route, /process\.env/u);
});

test("Veele forms use only the durable Fieldgrid public endpoint", () => {
  const form = read(
    "artifacts/marketing-website/components/marketing/lead-form.tsx",
  );
  const mapping = read(
    "artifacts/marketing-website/lib/fieldgrid-forms.ts",
  );
  const sections = read(
    "artifacts/marketing-website/components/marketing/page-sections.tsx",
  );
  const configRoute = read(
    "artifacts/marketing-website/app/fieldgrid-runtime/form-config/route.ts",
  );

  assert.match(mapping, /\/api\/website-forms\/\$\{formId\}\/submissions/u);
  assert.match(mapping, /fetch\("\/fieldgrid-runtime\/form-config"/u);
  assert.match(
    configRoute,
    /process\.env\.FIELDGRID_WEBSITE_FORM_ID/u,
  );
  assert.match(form, /"Idempotency-Key": submissionId/u);
  assert.match(form, /buildFieldgridFormSubmission/u);
  assert.doesNotMatch(form, /\/api\/contact|\/api\/offerte/u);
  assert.doesNotMatch(sections, /process\.env/u);
  assert.doesNotMatch(mapping, /DATABASE_URL|SERVICE_ROLE|Authorization/u);
});

test("custom candidate build identity is injected only for staging", () => {
  const deploy = read(".github/workflows/deploy.yml");

  for (const variable of [
    "NEXT_PUBLIC_MARKETING_SITE_URL",
    "FIELDGRID_WEBSITE_FORM_ID",
    "FIELDGRID_CUSTOM_ROUTE_KEY",
    "FIELDGRID_CUSTOM_EXPECTED_HOST",
  ]) {
    assert.match(
      deploy,
      new RegExp(
        `github\\.ref_name == 'staging' && vars\\.${variable}`,
        "u",
      ),
    );
  }
  assert.match(
    deploy,
    /FIELDGRID_CUSTOM_RELEASE_ID: \$\{\{ github\.ref_name == 'staging' && format\('git-commit:\{0\}', github\.sha\)/u,
  );
});
