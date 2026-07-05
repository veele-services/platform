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

test("phase 9 stores platform notification dispatches and recipient snapshots", () => {
  const schema = read("lib/db/src/schema/platform-notifications.ts");
  const migration = read("lib/db/migrations/076_platform_notifications.sql");
  const exports = read("lib/db/src/schema/index.ts");

  assertContains(
    schema,
    [
      "platformNotificationDispatchesTable",
      "platformNotificationRecipientsTable",
      "PLATFORM_NOTIFICATION_TEMPLATE_KEYS",
      "PLATFORM_NOTIFICATION_AUDIENCE_TYPES",
      "PLATFORM_NOTIFICATION_CHANNELS",
      "tenantOwnerInvitesTable",
      "platformUsersTable",
    ],
    "platform notification schema",
  );
  assertContains(
    migration,
    [
      "CREATE TABLE IF NOT EXISTS platform_notification_dispatches",
      "CREATE TABLE IF NOT EXISTS platform_notification_recipients",
      "platform_notification_dispatches_channels_check",
      "platform_notification_recipients_scope_check",
      "ALTER TABLE platform_notification_dispatches ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE platform_notification_recipients ENABLE ROW LEVEL SECURITY",
    ],
    "platform notification migration",
  );
  assert.ok(exports.includes('export * from "./platform-notifications";'), "schema index should export platform notifications");
});

test("phase 9 action materializes recipients from platform data and writes audit", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-notifications.ts");

  assertContains(
    action,
    [
      "listPlatformNotificationCenter",
      "createPlatformNotificationDispatch",
      "buildRecipients",
      "readinessStatusSql",
      "tenantOwnerInvitesTable",
      "platformUsersTable",
      "platform_notification_dispatch_created",
      "auditLogTable",
      "selectedTenantIds",
      "Geen ontvangers",
    ],
    "platform notification action",
  );
  assert.ok(!action.includes("recipientEmail = formValue"), "recipients should not come from free-form email input");
});

test("phase 9 renders notification compose, visible recipient selection and history", () => {
  const page = read("artifacts/backoffice/src/app/(platform)/platform/notifications/page.tsx");

  assertContains(
    page,
    [
      "Meldingen",
      "Nieuwe melding",
      "Ontvangerselectie zichtbaar",
      "Specifieke tenant owners",
      "Tenants per plan",
      "Tenants per module",
      "Readiness issues",
      "Verzendhistorie",
      "Cross-tenant guard",
      "Push later",
    ],
    "platform notifications page",
  );
  assert.ok(!page.includes('name="recipientEmail"'), "page should not expose free-form recipient email targeting");
});
