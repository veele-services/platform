import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(content, phrases, label) {
  const normalizedContent = content.replace(/\s+/gu, " ");
  for (const phrase of phrases) {
    assert.ok(
      normalizedContent.includes(phrase.replace(/\s+/gu, " ")),
      `${label} should include ${phrase}`,
    );
  }
}

test("platform onboarding v2 adds preflight, workspace and rollback actions", () => {
  const action = read(
    "artifacts/backoffice/src/app/actions/platform-provisioning.ts",
  );

  assertIncludes(
    action,
    [
      "ONBOARDING_WIZARD_STEPS",
      "readOnboardingPreflight",
      "Duplicate slug",
      "Duplicate domain",
      "fieldgridSubdomain",
      "getPlatformOnboardingWorkspace",
      "rollbackPlatformTenantProvisioning",
      "tenantFirstRunStateTable",
      "firstRunReadiness",
      "preflightStatus",
    ],
    "platform onboarding v2 actions",
  );
});

test("platform onboarding v2 has a dedicated mobile-safe platform route", () => {
  const page = read(
    "artifacts/backoffice/src/app/(platform)/platform/onboarding/page.tsx",
  );
  const registry = read(
    "artifacts/backoffice/src/lib/navigation/route-registry.ts",
  );
  const dashboard = read(
    "artifacts/backoffice/src/app/(platform)/platform/page.tsx",
  );

  assertIncludes(
    `${page}\n${registry}\n${dashboard}`,
    [
      "Onboarding en provisioning 2.0",
      "Fieldgrid subdomain",
      "Preflight",
      "Duplicate slug/domain",
      "Tenant provisionen",
      "Concept opslaan",
      "Provisioning runs",
      "Rollback provisioning",
      'href="/platform/onboarding"',
      "Organisatie inrichten",
    ],
    "platform onboarding v2 route",
  );
});

test("platform onboarding v2 docs capture acceptance and runtime boundary", () => {
  const doc = read("docs/fieldgrid-platform-admin-phase-5-onboarding-v2.md");

  assertIncludes(
    doc,
    [
      "/platform/onboarding",
      "demo-x.fieldgrid.nl",
      "Duplicate slug/domain",
      "Save/resume",
      "owner invite",
      "first-run",
      "staging-smoke",
    ],
    "platform onboarding v2 docs",
  );
});
