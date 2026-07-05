import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should include ${phrase}`);
  }
}

test("tenant provisioning writes explicit organization settings defaults", () => {
  const service = read("lib/db/src/tenant-provisioning.ts");

  assertIncludes(
    service,
    [
      "DEFAULT_ORGANIZATION_SETTINGS",
      "betaaltermijnDagen: 30",
      "availabilityAdvanceDays: 60",
      "smtpEnabled: false",
      'smtpEncryption: "tls"',
      "emailTemplateFooterText",
      "notifRapportGoedgekeurd: true",
      "notifHerinneringDagen: 7",
      "updatedAt: new Date()",
    ],
    "tenant provisioning organization settings defaults",
  );
});

test("organization settings hardening migration repairs default drift", () => {
  const migration = `${read("lib/db/migrations/077_organization_settings_defaults_hardening.sql")}\n${read("lib/db/migrations/078_organization_settings_constraint_repair.sql")}\n${read("lib/db/migrations/079_organization_settings_complete_repair.sql")}`;

  assertIncludes(
    migration,
    [
      "Organization settings defaults hardening",
      "Organization settings constraint repair",
      "Organization settings complete repair",
      "Never edit recorded migration files",
      "ADD COLUMN IF NOT EXISTS availability_advance_days",
      "ADD COLUMN IF NOT EXISTS smtp_from_email",
      "DROP CONSTRAINT IF EXISTS organization_settings_smtp_encryption_check",
      "COALESCE(betaaltermijn_dagen, 30)",
      "WHEN smtp_encryption IN ('none', 'starttls', 'tls') THEN smtp_encryption",
      "ALTER COLUMN email_template_footer_text SET DEFAULT",
      "ALTER COLUMN notif_herinnering_dagen SET NOT NULL",
      "organization_settings_smtp_encryption_check",
      "organization_settings_availability_advance_days_check",
    ],
    "organization settings hardening migration",
  );
});

test("platform onboarding maps provisioning timestamps defensively", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-provisioning.ts");

  assertIncludes(
    action,
    [
      "function isoTimestamp",
      "function requiredIsoTimestamp",
      "value instanceof Date ? value : new Date(value)",
      "savedAt: requiredIsoTimestamp(row.startedAt)",
      "startedAt: requiredIsoTimestamp(row.startedAt)",
      "completedAt: isoTimestamp(row.completedAt)",
    ],
    "platform onboarding timestamp serialization",
  );
});

test("tenant provisioning records useful database error details", () => {
  const service = read("lib/db/src/tenant-provisioning.ts");

  assertIncludes(
    service,
    [
      "function provisioningErrorMessage",
      "details.cause",
      "details.constraint",
      "details.detail",
      "errorMessage: message",
    ],
    "tenant provisioning database error details",
  );
});

test("platform onboarding actions return to run history after failed provisioning", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-provisioning.ts");

  assertIncludes(
    action,
    [
      "catch {",
      "redirect(\"/platform/onboarding#provisioning-runs\")",
      "retryPlatformTenantProvisioning",
      "createPlatformTenant",
    ],
    "platform onboarding failed provisioning redirect",
  );
});
