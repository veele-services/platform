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
      'smtpEncryption: "starttls"',
      "emailTemplateFooterText",
      "notifRapportGoedgekeurd: true",
      "notifHerinneringDagen: 7",
      "updatedAt: new Date()",
    ],
    "tenant provisioning organization settings defaults",
  );
});

test("organization settings hardening migration repairs default drift", () => {
  const migration = read("lib/db/migrations/077_organization_settings_defaults_hardening.sql");

  assertIncludes(
    migration,
    [
      "Organization settings defaults hardening",
      "ADD COLUMN IF NOT EXISTS availability_advance_days",
      "COALESCE(betaaltermijn_dagen, 30)",
      "ALTER COLUMN email_template_footer_text SET DEFAULT",
      "ALTER COLUMN notif_herinnering_dagen SET NOT NULL",
      "organization_settings_smtp_encryption_check",
      "organization_settings_availability_advance_days_check",
    ],
    "organization settings hardening migration",
  );
});
