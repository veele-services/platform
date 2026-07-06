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

test("phase 12 adds platform user invite and management policies", () => {
  const platform = read("artifacts/backoffice/src/app/actions/platform.ts");

  assertContains(
    platform,
    [
      "invitePlatformUserFromForm",
      "updatePlatformUserFromForm",
      "platform_user_invited",
      "platform_user_updated",
      "actor.role !== \"owner\"",
      "target?.role === \"owner\"",
      "Er moet altijd minimaal een actieve platform-owner overblijven.",
      "lastSeenAt",
      "mfaStatus",
      "createAdminClient",
    ],
    "platform user actions",
  );
});

test("phase 12 platform users page supports invite, role/status edits and last seen", () => {
  const page = read("artifacts/backoffice/src/app/(platform)/platform/users/page.tsx");

  assertContains(
    page,
    [
      "Platformgebruikers",
      "Uitnodigen",
      "Rol wijzigen",
      "Status wijzigen",
      "Laatst gezien",
      "MFA",
      "invitePlatformUserAction",
      "updatePlatformUserAction",
      "owner",
      "admin",
      "support",
    ],
    "platform users page",
  );
});

test("phase 12 adds platform settings dashboard and audit requests", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-settings.ts");
  const page = read("artifacts/backoffice/src/app/(platform)/platform/settings/page.tsx");

  assertContains(
    action,
    [
      "getPlatformSettingsDashboard",
      "updatePlatformEmailProviderSettings",
      "sendPlatformEmailTestAction",
      "updatePlatformSmtpSettings",
      "requestPlatformSettingChange",
      "platform_email_provider_updated",
      "platform_setting_change_requested",
      "PLATFORM_HOSTS",
      "fieldgridDnsTargetValue",
      "FIELDGRID_CUSTOM_DOMAIN_CNAME_TARGET",
      "FIELDGRID_SUPPORT_BREAK_GLASS_MAX_TTL_MINUTES",
      "custom domain DNS target",
      "Caddy ask mode",
      "E-mailprovider",
      "<mail>@<slug>.fieldgrid.nl",
      "enterpriseCustomMailDomainsOnly",
      "default branding",
      "smoke targets",
    ],
    "platform settings action",
  );
  assertContains(
    page,
    [
      "Instellingen",
      "E-mailprovider",
      "Resend API",
      "Testmail versturen",
      "Wijzigverzoek",
      "smtp.provider.nl",
      "Enterprise",
      "Platformhosts",
      "support TTL default",
      "custom domain DNS target",
      "Caddy ask mode",
      "E-mailprovider",
      "default branding",
      "smoke targets",
    ],
    "platform settings page",
  );
});

test("phase 12 documentation records rollout and audit behavior", () => {
  const docs = read("docs/fieldgrid-platform-admin-phase-12-users-settings.md");

  assertContains(
    docs,
    [
      "/platform/users",
      "/platform/settings",
      "support kan platformgebruikers niet beheren",
      "admin kan geen owner",
      "platform_user_invited",
      "platform_setting_change_requested",
      "zonder secrets te lekken",
    ],
    "phase 12 documentation",
  );
});
