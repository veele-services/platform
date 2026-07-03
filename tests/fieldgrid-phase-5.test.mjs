import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("phase 5 defines a central support break-glass TTL policy", () => {
  const platformAccess = read("lib/db/src/platform-access.ts");

  assertContains(
    platformAccess,
    [
      "FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE",
      "FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES = 240",
      "FIELDGRID_SUPPORT_BREAK_GLASS_MIN_REASON_LENGTH",
      "validateSupportBreakGlassGrant",
      "ttlMinutes > FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES",
      "Break-glass supporttoegang mag maximaal",
    ],
    "platform access support policy",
  );
});

test("support grant creation applies break-glass validation and audit metadata", () => {
  const platformActions = read("artifacts/backoffice/src/app/actions/platform.ts");

  assertContains(
    platformActions,
    [
      "validateSupportBreakGlassGrant",
      "breakGlassValidation",
      "grantType: FIELDGRID_SUPPORT_BREAK_GLASS_GRANT_TYPE",
      "ttlMinutes: breakGlassValidation.ttlMinutes",
      "maxTtlMinutes: FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES",
      "support_mode_entered",
      "ttlSeconds",
    ],
    "platform support actions",
  );
});

test("platform security dashboard is read-only and categorized", () => {
  const platformActions = read("artifacts/backoffice/src/app/actions/platform.ts");
  const securityPage = read("artifacts/backoffice/src/app/(platform)/platform/security/page.tsx");

  assertContains(
    platformActions,
    [
      "listPlatformSecurityDashboard",
      "supportEvents",
      "downloadEvents",
      "denialEvents",
      "platformEvents",
      "isDownloadSecurityEvent",
      "isDenialSecurityEvent",
    ],
    "platform security dashboard action",
  );

  assertContains(
    securityPage,
    [
      "Securitydashboard",
      "Support access events",
      "Downloads",
      "Denials",
      "Platform changes",
      "Read-only overzicht",
      "break-glass risk label",
    ],
    "platform security dashboard page",
  );
});

test("phase 5 documentation captures staging-safe support security scope", () => {
  const phase5 = read("docs/fieldgrid-phase-5-support-security.md");

  assertContains(
    phase5,
    [
      "fase 5 support break-glass",
      "validateSupportBreakGlassGrant",
      "maximaal 240 minuten TTL",
      "read-only platform securitydashboard",
      "FG-SUPPORT-005",
      "FG-AUDIT-001",
      "geen migraties",
      "geen bestaande support grants ingekort",
    ],
    "phase 5 docs",
  );
});
