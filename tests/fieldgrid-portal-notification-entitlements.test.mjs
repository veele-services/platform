import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("personnel notification reads and mutations require the notifications module", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/notifications.ts");
  const layout = read("artifacts/personeel-pwa/src/app/(app)/layout.tsx");
  const header = read(
    "artifacts/personeel-pwa/src/components/MobileHeader.tsx",
  );
  const dashboard = read("artifacts/personeel-pwa/src/app/(app)/page.tsx");
  const workOrderHeader = read(
    "artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderHeader.tsx",
  );

  assert.match(
    actions,
    /isTenantModuleEnabled\(identity\.tenantId,\s*"notifications"\)/u,
  );
  assert.doesNotMatch(
    actions.slice(actions.indexOf("export async function getMyNotifications")),
    /getCurrentPersonnelIdentity\(\)/u,
  );
  assert.match(
    layout,
    /notificationsEnabled\s*\?\s*await getMyNotificationSummary\(\)\s*:\s*undefined/u,
  );
  assert.match(header, /notificationSummary\s*\?\s*\(\s*<Popover>/u);
  assert.match(
    dashboard,
    /notificationsEnabled\s*\?\s*getMyNotificationSummary\(\)/u,
  );
  assert.match(
    dashboard,
    /\{notificationsEnabled\s*\?\s*\(\s*<QuickLink[\s\S]*?href="\/meldingen"/u,
  );
  assert.match(
    workOrderHeader,
    /notificationsEnabled\s*\?\s*getMyNotificationSummary\(\)/u,
  );
});

test("customer notifications respect module access, tenant scope and safe destinations", () => {
  const actions = read("artifacts/klant-pwa/src/actions/notifications.ts");
  const features = read("artifacts/klant-pwa/src/lib/portal-features.ts");
  const layout = read("artifacts/klant-pwa/src/app/(app)/layout.tsx");
  const page = read("artifacts/klant-pwa/src/app/(app)/meldingen/page.tsx");
  const more = read("artifacts/klant-pwa/src/app/(app)/meer/page.tsx");

  assert.match(features, /notifications:\s*"notifications"/u);
  assert.match(
    actions,
    /isTenantModuleEnabled\(identity\.tenantId,\s*"notifications"\)/u,
  );
  for (const marker of [
    'isTenantModuleEnabled(tenantId, "documents")',
    'isTenantModuleEnabled(tenantId, "finance")',
    'isTenantModuleEnabled(tenantId, "knowledgebase")',
    'isTenantModuleEnabled(tenantId, "reporting")',
    'isTenantModuleEnabled(tenantId, "releases")',
    'notification.category === "invoice"',
    'notification.category === "report"',
    'notification.category === "releases"',
    '"/facturen"',
    '"/documenten"',
    '"/help"',
    '"/rapporten"',
    '"/releases"',
  ]) {
    assert.ok(
      actions.includes(marker),
      `missing entitlement marker: ${marker}`,
    );
  }
  assert.match(
    actions,
    /eq\(customerNotificationsTable\.customerId,\s*identity\.customerId\)[\s\S]*?eq\(customerNotificationsTable\.tenantId,\s*identity\.tenantId\)/u,
  );
  assert.match(actions, /href:\s*sanitizeCustomerPortalHref\(row\.href\)/u);
  assert.match(
    actions,
    /markCustomerNotificationReadAndOpen[\s\S]*?mapPersistedNotification\(row\)[\s\S]*?redirect\(notification\.href\)/u,
  );
  assert.match(
    layout,
    /featureFlags\.notifications\s*\?\s*await getMyCustomerNotificationSummary\(\)\s*:\s*undefined/u,
  );
  assert.match(page, /if \(!featureFlags\.notifications\) notFound\(\)/u);
  assert.match(page, /action=\{markCustomerNotificationReadAndOpen\}/u);
  assert.match(
    more,
    /href:\s*"\/meldingen"[\s\S]*?moduleKey:\s*"notifications"/u,
  );
});

test("personnel notifications hide destinations for disabled target modules", () => {
  const actions = read("artifacts/personeel-pwa/src/actions/notifications.ts");

  for (const marker of [
    'isTenantModuleEnabled(tenantId, "documents")',
    'isTenantModuleEnabled(tenantId, "inventory")',
    'isTenantModuleEnabled(tenantId, "knowledgebase")',
    'isTenantModuleEnabled(tenantId, "materials")',
    'isTenantModuleEnabled(tenantId, "releases")',
    'pathname === "/documenten"',
    'pathname === "/help"',
    'pathname === "/releases"',
    'pathname === "/scan/inventory"',
    "/materiaal",
    "/inventaris",
  ]) {
    assert.ok(
      actions.includes(marker),
      `missing personnel entitlement marker: ${marker}`,
    );
  }
  assert.match(
    actions,
    /getMyNotifications[\s\S]*?getNotificationEntitlements\(identity\.tenantId\)[\s\S]*?isNotificationAccessible\(notification,\s*entitlements\)/u,
  );
  assert.match(
    actions,
    /getMyNotificationSummary[\s\S]*?getNotificationEntitlements\(identity\.tenantId\)[\s\S]*?visibleUnread/u,
  );
});

test("customer header uses canonical overlays, marks items read and keeps compact touch targets", () => {
  const header = read("artifacts/klant-pwa/src/components/MobileHeader.tsx");
  const submit = read(
    "artifacts/klant-pwa/src/app/(app)/meldingen/NotificationOpenButton.tsx",
  );

  for (const marker of [
    "Popover",
    "PopoverContent",
    "DropdownMenu",
    "DropdownMenuContent",
    "markCustomerNotificationRead(id)",
    "router.push(href)",
    "Math.max(0, current.unreadCount - 1)",
    "min-h-11 items-center gap-2.5",
  ]) {
    assert.ok(header.includes(marker), `missing header marker: ${marker}`);
  }
  assert.doesNotMatch(header, /fixed inset-0/u);
  assert.match(submit, /useFormStatus/u);
  assert.match(submit, /disabled=\{pending\}/u);
  assert.match(submit, /aria-busy=\{pending\}/u);
});
