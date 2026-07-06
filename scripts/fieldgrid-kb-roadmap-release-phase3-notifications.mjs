#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const outputDir =
  process.env.FIELDGRID_KB_ROADMAP_RELEASE_PHASE3_OUT_DIR ||
  join(process.cwd(), "outputs", "kb-roadmap-release-phase3-notifications");

const eventKeys = [
  "kb_article_published",
  "kb_article_updated",
  "kb_article_featured",
  "roadmap_request_submitted",
  "roadmap_status_changed",
  "roadmap_comment_added",
  "roadmap_item_done",
  "release_published",
  "release_featured",
  "release_highlight_active",
];

const report = {
  createdAt: new Date().toISOString(),
  mode: checkOnly ? "check" : "full",
  checks: [
    checkTemplates(),
    checkSharedEmitter(),
    checkKnowledgebaseHooks(),
    checkRoadmapHooks(),
    checkReleaseHooks(),
    checkAdminToggles(),
  ],
};

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "phase3-notifications.json");
await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

const failures = report.checks.flatMap((check) =>
  check.failures.map((failure) => ({ check: check.id, ...failure })),
);

if (failures.length > 0) {
  console.error(`Knowledgebase/roadmap/releases phase 3 notification gate failed. Report: ${reportPath}`);
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Knowledgebase/roadmap/releases phase 3 notification gate passed. Report: ${reportPath}`);

function read(path) {
  return readFileSync(path, "utf8");
}

function fileExists(path) {
  return existsSync(path);
}

function failure(message, evidence = null) {
  return { message, evidence };
}

function check(id, label, failures) {
  return { id, label, status: failures.length === 0 ? "passed" : "failed", failures };
}

function expectFileContains(path, expectations) {
  const failures = [];
  if (!fileExists(path)) return [failure(`Missing file: ${path}`)];
  const text = read(path);
  for (const expectation of expectations) {
    const found = typeof expectation.pattern === "string"
      ? text.includes(expectation.pattern)
      : expectation.pattern.test(text);
    if (!found) failures.push(failure(expectation.message, path));
  }
  return failures;
}

function checkTemplates() {
  const path = "lib/db/migrations/088_kb_roadmap_release_notification_events.sql";
  const failures = [];
  if (!fileExists(path)) return check("templates", "Notification event templates exist", [failure(`Missing file: ${path}`)]);
  const text = read(path);
  for (const eventKey of eventKeys) {
    if (!text.includes(`'${eventKey}'`)) {
      failures.push(failure(`Missing notification_event_settings seed for ${eventKey}.`, path));
    }
  }
  if (!/ON CONFLICT\s*\(event_key\)\s*DO UPDATE/iu.test(text)) {
    failures.push(failure("Template migration must be idempotent with ON CONFLICT.", path));
  }
  return check("templates", "Notification event templates exist and are idempotent", failures);
}

function checkSharedEmitter() {
  const path = "artifacts/backoffice/src/lib/content-notification-events.ts";
  return check("shared-emitter", "Shared content notification emitter scopes and queues events", expectFileContains(path, [
    { pattern: "notificationEventSettingsTable", message: "Emitter must use admin notification toggles/templates." },
    { pattern: "domainEventsTable", message: "Emitter must record domain events." },
    { pattern: "notificationDeliveryQueueTable", message: "Emitter must enqueue delivery worker rows." },
    { pattern: "triggerNotificationWorker", message: "Emitter must trigger the existing notification worker." },
    { pattern: "getEffectiveUserPermissions", message: "Emitter must filter management recipients by effective permissions." },
    { pattern: "listEnabledKnowledgebaseModuleKeysForTenant", message: "Emitter must filter by tenant module entitlements." },
    { pattern: "hasTenantNotificationAudience", message: "Emitter must not write platform-admin-only content into tenant notification events." },
    { pattern: "personnelNotificationsTable", message: "Emitter must support personnel in-app notifications." },
    { pattern: "customerNotificationsTable", message: "Emitter must support customer in-app notifications." },
    { pattern: "content_notification_event_emitted", message: "Emitter must audit emitted content notification events." },
  ]));
}

function checkKnowledgebaseHooks() {
  const path = "artifacts/backoffice/src/app/actions/knowledgebase.ts";
  return check("knowledgebase-hooks", "Knowledgebase publish/update/featured actions emit events", expectFileContains(path, [
    { pattern: "kb_article_published", message: "KB publish event missing." },
    { pattern: "kb_article_updated", message: "KB update event missing." },
    { pattern: "kb_article_featured", message: "KB featured event missing." },
    { pattern: "requiredModuleKeys: uniqueStrings([\"knowledgebase\"", message: "KB events must require the knowledgebase module." },
    { pattern: "requiredPermissionKeys: [\"kb:view\"]", message: "KB events must require kb:view." },
  ]));
}

function checkRoadmapHooks() {
  const path = "artifacts/backoffice/src/app/actions/roadmap.ts";
  return check("roadmap-hooks", "Roadmap submit/status/comment/done actions emit events", expectFileContains(path, [
    { pattern: "roadmap_request_submitted", message: "Roadmap request submitted event missing." },
    { pattern: "roadmap_status_changed", message: "Roadmap status changed event missing." },
    { pattern: "roadmap_comment_added", message: "Roadmap comment event missing." },
    { pattern: "roadmap_item_done", message: "Roadmap done event missing." },
    { pattern: "roadmapNotificationScope", message: "Roadmap events must resolve visible tenant scope." },
    { pattern: "requiredModuleKeys: [\"roadmap\"]", message: "Roadmap events must require the roadmap module." },
    { pattern: "requiredPermissionKeys: [\"roadmap:view\"]", message: "Roadmap events must require roadmap:view." },
  ]));
}

function checkReleaseHooks() {
  const path = "artifacts/backoffice/src/app/actions/releases.ts";
  return check("release-hooks", "Release publish/featured/highlight actions emit events", expectFileContains(path, [
    { pattern: "release_published", message: "Release published event missing." },
    { pattern: "release_featured", message: "Release featured event missing." },
    { pattern: "release_highlight_active", message: "Release highlight active event missing." },
    { pattern: "releaseNotificationScope", message: "Release events must resolve module/audience scope." },
    { pattern: "requiredModuleKeys: [\"releases\"]", message: "Release events must require the releases module." },
    { pattern: "requiredPermissionKeys: [\"releases:view\"]", message: "Release events must require releases:view." },
  ]));
}

function checkAdminToggles() {
  return check("admin-toggles", "Existing notification settings UI can manage event toggles", expectFileContains(
    "artifacts/backoffice/src/app/actions/settings.ts",
    [
      { pattern: "listNotificationEventSettings", message: "Notification event settings list action missing." },
      { pattern: "updateNotificationEventSetting", message: "Notification event settings update action missing." },
      { pattern: "emailEnabled", message: "Email toggle support missing." },
      { pattern: "pushEnabled", message: "Push toggle support missing." },
      { pattern: "inAppEnabled", message: "In-app toggle support missing." },
    ],
  ));
}
