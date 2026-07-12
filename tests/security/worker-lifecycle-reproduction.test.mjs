import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const next = source.indexOf("\nexport async function ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const worker = read("artifacts/api-server/src/lib/notification-worker.ts");
const workerRoute = read("artifacts/api-server/src/routes/notification-worker.ts");
const paymentReminders = read("artifacts/api-server/src/routes/payment-reminders.ts");
const notificationSchema = read("lib/db/src/schema/notifications.ts");
const queueMigration = read("lib/db/migrations/042_notification_worker_queue.sql");

test("REPRO P0-ASYNC-001: notification worker claims by channel/status without tenant lifecycle or module checks", () => {
  const claim = worker.slice(worker.indexOf("async function claimQueueItems"), worker.indexOf("async function completeQueueItem"));
  assert.match(claim, /FROM notification_delivery_queue/u);
  assert.match(claim, /WHERE channel = \$1/u);
  assert.match(claim, /status IN \('pending', 'retry'\)/u);
  assert.match(claim, /FOR UPDATE SKIP LOCKED/u);
  assert.match(claim, /q\.tenant_id/u);
  assert.doesNotMatch(claim, /JOIN\s+tenants|FROM\s+tenants|tenant.*status|is_active/iu);
  assert.doesNotMatch(claim, /module/u);
  assert.doesNotMatch(worker, /requireJobTenantModule/u);
});

test("REPRO P0-ASYNC-002: payment reminders have a finance module guard but no tenant suspension guard", () => {
  assert.match(paymentReminders, /requireJobTenantModule\(invoice\.customerTenantId, "finance"\)/u);
  assert.match(paymentReminders, /moduleDisabled\+\+/u);
  assert.doesNotMatch(paymentReminders, /tenant.*suspend|suspend.*tenant|status.*suspended/iu);
});

test("REPRO P0-ASYNC-003: worker route can return ok after retryable delivery failures", () => {
  const processQueue = functionBlock(worker, "processNotificationQueue");
  assert.match(processQueue, /ok: true/u);
  assert.match(processQueue, /outcome = failureOutcome\([\s\S]+true,[\s\S]+errorMessage\(error\)/u);
  assert.match(processQueue, /result\.retried \+= 1/u);
  assert.match(workerRoute, /const result = await processNotificationQueue/u);
  assert.match(workerRoute, /res\.json\(result\)/u);
});

test("REPRO P0-ASYNC-004: retry and final failure are status changes, not a separate DLQ", () => {
  assert.match(notificationSchema, /status: varchar\("status"[\s\S]+\.default\("pending"\)/u);
  assert.match(queueMigration, /CHECK \(status IN \('pending', 'processing', 'sent', 'failed', 'retry'\)\)/u);
  assert.match(worker, /status: retryAt \? "retry" : "failed"/u);
  assert.doesNotMatch(worker, /dead.?letter|dlq/iu);
  assert.doesNotMatch(notificationSchema, /dead.?letter|dlq/iu);
});

test("REPRO P0-ASYNC-005: queue idempotency is producer-side only and not passed to outbound providers", () => {
  assert.match(notificationSchema, /uniqueIndex\("notification_delivery_queue_idempotency_idx"\)\.on\(table\.idempotencyKey\)/u);
  assert.match(queueMigration, /CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_queue_idempotency_idx/u);

  const deliverEmail = worker.slice(worker.indexOf("async function deliverEmailItem"), worker.indexOf("async function deliverPushItem"));
  assert.match(deliverEmail, /sendEmailWithResult\(\{\s*to: item\.recipient_email/u);
  assert.doesNotMatch(deliverEmail, /idempotency/i);
});

test("REPRO P0-ASYNC-006: endpoint succeeds once, then retry-failed can requeue eligible failed work", () => {
  const retryFailed = functionBlock(worker, "retryFailedNotifications");
  assert.match(retryFailed, /WHERE status = 'failed'/u);
  assert.match(retryFailed, /AND attempts < max_attempts/u);
  assert.match(retryFailed, /SET status = 'retry'/u);
  assert.match(retryFailed, /return \{ ok: true, requeued: result\.rowCount \?\? 0 \}/u);
});

test("REPRO P0-ASYNC-007: push delivery marks success if one endpoint succeeds while others fail", () => {
  const deliverPush = worker.slice(worker.indexOf("async function deliverPushItem"), worker.indexOf("async function deliverQueueItem"));
  assert.match(deliverPush, /if \(successCount > 0\) \{/u);
  assert.match(deliverPush, /status: "sent"/u);
  assert.match(deliverPush, /error: errors\.length > 0 \? errors\.slice\(0, 3\)\.join\("; "\) : null/u);
});

test("REPRO P0-ASYNC-008: worker writes attempt audit rows after completion but does not atomically bind them", () => {
  const processQueue = functionBlock(worker, "processNotificationQueue");
  assert.match(processQueue, /await completeQueueItem\(item, workerId, outcome, log\);/u);
  assert.match(processQueue, /await recordAttempt\(item, workerId, outcome, log\);/u);
  assert.match(worker, /catch \(error\) \{[\s\S]+poginglog kon niet worden geschreven/u);
});
