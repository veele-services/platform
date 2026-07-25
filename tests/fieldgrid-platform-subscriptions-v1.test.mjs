import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  const normalizedContent = content.replace(/\s+/gu, " ");
  for (const phrase of phrases) {
    assert.ok(
      normalizedContent.includes(phrase.replace(/\s+/gu, " ")),
      `${label} should contain ${phrase}`,
    );
  }
}

test("phase 7 migration adds subscription productization fields safely", () => {
  const migration = read("lib/db/migrations/074_platform_subscriptions_productization.sql");
  const schema = read("lib/db/src/schema/plans.ts");

  assertContains(
    migration,
    [
      "ALTER TABLE plans ADD COLUMN IF NOT EXISTS support_level",
      "ALTER TABLE plans ADD COLUMN IF NOT EXISTS support_description",
      "ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_seats",
      "ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS billing_reference",
      "ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS manual_billing_notes",
      "plans_support_level_check",
      "tenant_subscriptions_period_end_idx",
      "'max_seats'",
    ],
    "phase 7 migration",
  );
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE tenants/iu);

  assertContains(
    schema,
    [
      '"max_seats"',
      "supportLevel",
      "supportDescription",
      "maxSeats",
      "billingReference",
      "manualBillingNotes",
    ],
    "phase 7 schema",
  );
});

test("phase 7 keeps active subscription status leading for entitlements", () => {
  const helper = read("lib/db/src/tenant-entitlements.ts");

  assertContains(
    helper,
    [
      "ACTIVE_SUBSCRIPTION_STATUSES",
      "const [subscription]",
      "DEFAULT_PLAN_KEY",
      'source: "subscription"',
      'source: tenant ? "tenant_plan_key" : "default"',
      "custom_domains",
    ],
    "tenant entitlement helper",
  );
});

test("phase 7 platform actions expose subscriptions dashboard and audited updates", () => {
  const actions = read("artifacts/backoffice/src/app/actions/platform-tenants.ts");

  assertContains(
    actions,
    [
      "PlatformSubscriptionDashboard",
      "PlatformSubscriptionListRow",
      "listPlatformSubscriptionDashboard",
      "updatePlatformTenantSubscription",
      "tenant_subscription_updated",
      "tenant_plan_updated",
      "disabledCustomDomains",
      "manualBillingNotes",
      "billingReference",
      "disabled_plan",
    ],
    "platform subscription actions",
  );
});

test("phase 7 subscriptions page is functional and mobile-card based", () => {
  const page = read("artifacts/backoffice/src/app/(platform)/platform/subscriptions/page.tsx");

  assertContains(
    page,
    [
      "listPlatformSubscriptionDashboard",
      "SubscriptionCard",
      "Plan wijzigen",
      "Handmatige billingnotities",
      "custom domeinen",
      "handmatig beheerd en geaudit",
      "supportLevel",
      "maxSeats",
      "past_due",
      "updatePlatformTenantSubscription",
    ],
    "subscriptions page",
  );
  assert.doesNotMatch(page, /PlatformRouteState/u);
});

test("phase 7 tenant detail shows downgrade impact and billing fields", () => {
  const tenantPage = read("artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx");

  assertContains(
    tenantPage,
    [
      "customDomainCount",
      "Downgrade naar Starter/Professional",
      "Handmatige billingnotities",
      "Billing referentie",
      "subscriptionStatusTone",
      "supportLevel",
      "maxSeats",
      "billingReference",
    ],
    "tenant subscription detail",
  );
});
