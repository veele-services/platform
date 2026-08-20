import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(
  "artifacts/api-server/src/lib/notification-worker.ts",
  "utf8",
);
const migration = readFileSync(
  "lib/db/migrations/20260820111234_notification_worker_lifecycle_evidence.sql",
  "utf8",
);
const aclMigration = readFileSync(
  "lib/db/migrations/20260820115431_notification_delivery_server_only_acl.sql",
  "utf8",
);
const runtime = readFileSync(
  "scripts/fieldgrid-notification-worker-runtime.mts",
  "utf8",
);
const settings = readFileSync(
  "artifacts/backoffice/src/app/actions/settings.ts",
  "utf8",
);
const workerRoute = readFileSync(
  "artifacts/api-server/src/routes/notification-worker.ts",
  "utf8",
);

test("worker rechecks tenant, module, event and recipient lifecycle after claim", () => {
  for (const signal of [
    "tenant_inactive",
    "module_disabled",
    "notification_disabled",
    "recipient_inactive",
    "checkDeliveryLifecycle",
    "afterClaim",
  ]) {
    assert.match(worker, new RegExp(signal, "u"));
  }
  assert.match(worker, /await checkDeliveryLifecycle\(item\)/u);
  assert.match(worker, /await markDeliveryStarted\(item, workerId\)/u);
  assert.match(worker, /customer_portal_preferences/u);
  assert.match(worker, /JOIN auth\.users auth_user/u);
  assert.match(worker, /lower\(auth_user\.email\) = lower\(\$8::text\)/u);
});

test("claim, attempt evidence and terminal finalization are transactionally coupled", () => {
  assert.match(
    worker,
    /notification_delivery_attempts[\s\S]*status = 'processing'/u,
  );
  assert.match(worker, /await client\.query\("BEGIN"\)/u);
  assert.match(worker, /terminal_attempt_id = CASE/u);
  assert.match(worker, /notification_attempt_evidence_not_owned/u);
  assert.doesNotMatch(worker, /poginglog kon niet worden geschreven/u);
  assert.match(
    migration,
    /notification_delivery_queue_terminal_evidence_check/u,
  );
  assert.match(migration, /notification_delivery_queue_evidence_match/u);
});

test("uncertain provider effects never become an automatic blind redelivery", () => {
  assert.match(worker, /delivery_started_at IS NOT NULL/u);
  assert.match(worker, /provider_outcome_unknown/u);
  assert.match(worker, /status = 'outcome_pending'/u);
  assert.match(worker, /queueIds: string\[\]/u);
  assert.match(worker, /confirmedNoDelivery/u);
  assert.doesNotMatch(
    worker,
    /WHERE status IN \('failed', 'outcome_pending', 'partial'\)/u,
  );
  assert.match(worker, /delivery_key/u);
});

test("push outcomes retain safe endpoint-level evidence", () => {
  assert.match(worker, /targetOutcomes/u);
  assert.match(worker, /outcome: "permanent_failure"/u);
  assert.match(worker, /outcome: "transient_failure"/u);
  assert.match(worker, /retryTargets/u);
  assert.match(worker, /const retryAt =/u);
  assert.match(worker, /priorSuccessfulDelivery/u);
  assert.match(worker, /unavailableRetryTargets/u);
  assert.doesNotMatch(
    worker,
    /targetOutcomes\.push\(\{[\s\S]{0,180}endpoint:/u,
  );
  assert.doesNotMatch(worker, /targetOutcomes\.push\(\{[\s\S]{0,180}token:/u);
});

test("forward migration and runtime proof enforce tenant ACL and failure recovery", () => {
  assert.match(migration, /is_management_for_tenant\(tenant_id\)/u);
  assert.match(aclMigration, /FOR SELECT/u);
  assert.match(aclMigration, /REVOKE INSERT, UPDATE, DELETE/u);
  assert.doesNotMatch(aclMigration, /GRANT SELECT, INSERT/u);
  assert.match(migration, /delivery_key text/u);
  assert.match(migration, /UNIQUE INDEX[\s\S]*queue_attempt/u);
  for (const evidence of [
    "runtime-suspended-after-claim",
    "runtime-attempt-log-failure",
    "runtime-finalization-failure",
    "runtime-worker-a",
    "runtime-exact-queue-target",
    "exhaustedResult.partial",
    "vanishedResult.partial",
    "webResult.partial",
    "fcmResult.partial",
    "set local role authenticated",
  ]) {
    assert.match(runtime, new RegExp(evidence.replaceAll(".", "\\."), "u"));
  }
});

test("manual e-mail notifications enter the durable worker before provider delivery", () => {
  const manualFunction = settings.slice(
    settings.indexOf("export async function sendManualNotification"),
    settings.indexOf("export async function uploadOrgLogo"),
  );
  assert.match(manualFunction, /status: "pending"/u);
  assert.match(manualFunction, /triggerQueuedDelivery\(\s*"email"/u);
  assert.match(
    manualFunction,
    /returning\(\{ id: notificationDeliveryQueueTable\.id \}\)/u,
  );
  assert.match(
    manualFunction,
    /triggerQueuedDelivery\(\s*"email",\s*queueIds/u,
  );
  assert.match(settings, /body: JSON\.stringify\(\{[\s\S]*queueIds/u);
  assert.match(worker, /\$6::uuid\[\] IS NULL OR id = ANY\(\$6::uuid\[\]\)/u);
  assert.match(workerRoute, /queueIds,/u);
  assert.doesNotMatch(manualFunction, /sendEmailWithResult/u);
});
