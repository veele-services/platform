#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  FIXTURE,
  assertDisposableDatabaseForReset,
  connect,
  databaseUrl,
} from "./fieldgrid-runtime-safety-lib.mjs";

const parsedDatabase = new URL(databaseUrl());
assert.ok(
  ["127.0.0.1", "localhost", "::1", "postgres"].includes(
    parsedDatabase.hostname,
  ),
);

const { processNotificationQueue, retryFailedNotifications } =
  await import("../artifacts/api-server/src/lib/notification-worker.ts");
const { pool } = await import("../lib/db/src/connection.ts");

const client = await connect();
await assertDisposableDatabaseForReset(client);
const tenantA = FIXTURE.tenants.a;
const tenantB = FIXTURE.tenants.b;
const prefix = "runtime-notification-hardening";
const createdQueueIds: string[] = [];
const logger = { info() {}, warn() {}, error() {} };

type Channel = "email" | "push";

function delivered(status: "sent" | "partial" = "sent") {
  return {
    status,
    error: status === "partial" ? "partial_runtime_delivery" : null,
    retryAt: null,
    response: { runtime: true },
    deactivatedSubscriptions: 0,
    deactivatedNativeTokens: 0,
    providerMessageId: "runtime-provider-message",
  } as const;
}

async function enqueue(input: {
  tenantId?: string;
  channel?: Channel;
  recipientType?: "management" | "personnel" | "customer";
  personnelId?: string | null;
  customerId?: string | null;
  eventKey?: string | null;
  maxAttempts?: number;
}) {
  const id = randomUUID();
  createdQueueIds.push(id);
  const result = await client.query(
    `insert into public.notification_delivery_queue (
       id, tenant_id, event_key, channel, recipient_type, personnel_id, customer_id,
       recipient_email, subject, title, body, html, payload, status, max_attempts
     ) values ($1,$2,$3,$4,$5::varchar,$6,$7,
       case when $5::varchar='management' then 'admin@tenant-a.runtime.fieldgrid.test' else 'runtime@example.test' end,
       'Runtime notification',
       $8,'Runtime body','<p>Runtime body</p>',$9::jsonb,'pending',$10)
     returning id, delivery_key`,
    [
      id,
      input.tenantId ?? tenantA,
      input.eventKey ?? null,
      input.channel ?? "email",
      input.recipientType ?? "management",
      input.personnelId ?? null,
      input.customerId ?? null,
      `${prefix}:${id}`,
      JSON.stringify(
        input.recipientType === "management" || !input.recipientType
          ? { recipientUserId: FIXTURE.users.tenantAAdmin }
          : {},
      ),
      input.maxAttempts ?? 5,
    ],
  );
  return result.rows[0] as { id: string; delivery_key: string };
}

async function queueState(id: string) {
  const result = await client.query(
    `select status, attempts, delivery_key, delivery_started_at, current_attempt_id,
            terminal_attempt_id, response, last_error
     from public.notification_delivery_queue where id = $1`,
    [id],
  );
  return result.rows[0];
}

async function attempts(id: string) {
  const result = await client.query(
    `select status, attempt_no, delivery_key, provider_message_id, response
     from public.notification_delivery_attempts where queue_id = $1 order by attempt_no`,
    [id],
  );
  return result.rows;
}

async function runEmail(options: Record<string, unknown> = {}) {
  return processNotificationQueue({
    channels: ["email"],
    limit: 20,
    emailRatePerRun: 20,
    sendDelayMs: 0,
    lockSeconds: 1,
    baseRetrySeconds: 0,
    maxRetrySeconds: 1,
    logger,
    deliveryOverride: async () => delivered(),
    ...options,
  });
}

async function makeStaleProcessing(queueId: string, deliveryStarted: boolean) {
  const state = await queueState(queueId);
  const attemptId = randomUUID();
  await client.query(
    `update public.notification_delivery_queue
     set status='processing', attempts=1, locked_by='dead-worker',
         locked_at=now()-interval '10 seconds', processing_started_at=now()-interval '10 seconds',
         delivery_started_at=case when $2 then now()-interval '9 seconds' else null end
     where id=$1`,
    [queueId, deliveryStarted],
  );
  await client.query(
    `insert into public.notification_delivery_attempts
       (id, queue_id, tenant_id, channel, attempt_no, worker_id, status, delivery_key)
     values ($1,$2,$3,'email',1,'dead-worker','processing',$4)`,
    [attemptId, queueId, tenantA, state.delivery_key],
  );
  await client.query(
    `update public.notification_delivery_queue set current_attempt_id=$2 where id=$1`,
    [queueId, attemptId],
  );
}

try {
  await client.query(
    `delete from public.notification_delivery_queue where title like $1`,
    [`${prefix}:%`],
  );

  const olderBacklog = await enqueue({});
  const targetedDispatch = await enqueue({});
  const targetedDispatchResult = await runEmail({
    workerId: "runtime-exact-queue-target",
    queueIds: [targetedDispatch.id],
    limit: 1,
  });
  assert.equal(targetedDispatchResult.claimed, 1);
  assert.equal(targetedDispatchResult.sent, 1);
  assert.equal((await queueState(targetedDispatch.id)).status, "sent");
  assert.equal((await queueState(olderBacklog.id)).status, "pending");
  await client.query(
    `delete from public.notification_delivery_queue where id=$1`,
    [olderBacklog.id],
  );

  const suspended = await enqueue({});
  let suspendedDeliveries = 0;
  const suspendedResult = await runEmail({
    workerId: "runtime-suspended-after-claim",
    afterClaim: async () => {
      await client.query(
        `update public.tenants set is_active=false, status='suspended' where id=$1`,
        [tenantA],
      );
    },
    deliveryOverride: async () => {
      suspendedDeliveries += 1;
      return delivered();
    },
  });
  assert.equal(suspendedDeliveries, 0);
  assert.equal(suspendedResult.skipped, 1);
  assert.equal((await queueState(suspended.id)).last_error, "tenant_inactive");
  await client.query(
    `update public.tenants set is_active=true, status='active' where id=$1`,
    [tenantA],
  );

  const moduleDisabled = await enqueue({});
  let moduleDeliveries = 0;
  await runEmail({
    workerId: "runtime-module-disabled-after-claim",
    afterClaim: async () => {
      await client.query(
        `update public.tenant_modules entitlement set is_enabled=false, disabled_at=now()
         from public.modules module
         where entitlement.module_id=module.id and entitlement.tenant_id=$1 and module.key='notifications'`,
        [tenantA],
      );
    },
    deliveryOverride: async () => {
      moduleDeliveries += 1;
      return delivered();
    },
  });
  assert.equal(moduleDeliveries, 0);
  assert.equal(
    (await queueState(moduleDisabled.id)).last_error,
    "module_disabled",
  );
  await client.query(
    `update public.tenant_modules entitlement set is_enabled=true, enabled_at=now(), disabled_at=null
     from public.modules module
     where entitlement.module_id=module.id and entitlement.tenant_id=$1 and module.key='notifications'`,
    [tenantA],
  );

  const recipientDisabled = await enqueue({
    recipientType: "personnel",
    personnelId: FIXTURE.personnel.a,
  });
  await runEmail({
    workerId: "runtime-recipient-disabled-after-claim",
    afterClaim: async () => {
      await client.query(
        `update public.personnel set is_active=false where id=$1`,
        [FIXTURE.personnel.a],
      );
    },
  });
  assert.equal(
    (await queueState(recipientDisabled.id)).last_error,
    "recipient_inactive",
  );
  await client.query(`update public.personnel set is_active=true where id=$1`, [
    FIXTURE.personnel.a,
  ]);

  const preferenceDisabled = await enqueue({
    recipientType: "personnel",
    personnelId: FIXTURE.personnel.a,
  });
  await runEmail({
    workerId: "runtime-recipient-preference-disabled-after-claim",
    afterClaim: async () => {
      await client.query(
        `update public.personnel set notification_email_enabled=false where id=$1`,
        [FIXTURE.personnel.a],
      );
    },
  });
  assert.equal(
    (await queueState(preferenceDisabled.id)).last_error,
    "notification_disabled",
  );
  await client.query(
    `update public.personnel set notification_email_enabled=true where id=$1`,
    [FIXTURE.personnel.a],
  );

  const customerPreferenceBefore = await client.query(
    `select email_notifications, push_notifications
     from public.customer_portal_preferences where customer_id=$1`,
    [FIXTURE.customers.a],
  );
  await client.query(
    `insert into public.customer_portal_preferences
       (customer_id, email_notifications, push_notifications)
     values ($1, false, false)
     on conflict (customer_id) do update set email_notifications=false`,
    [FIXTURE.customers.a],
  );
  const customerPreferenceDisabled = await enqueue({
    recipientType: "customer",
    customerId: FIXTURE.customers.a,
  });
  await runEmail({ workerId: "runtime-customer-preference-disabled" });
  assert.equal(
    (await queueState(customerPreferenceDisabled.id)).last_error,
    "notification_disabled",
  );
  if (customerPreferenceBefore.rows[0]) {
    await client.query(
      `update public.customer_portal_preferences
       set email_notifications=$2, push_notifications=$3 where customer_id=$1`,
      [
        FIXTURE.customers.a,
        customerPreferenceBefore.rows[0].email_notifications,
        customerPreferenceBefore.rows[0].push_notifications,
      ],
    );
  } else {
    await client.query(
      `delete from public.customer_portal_preferences where customer_id=$1`,
      [FIXTURE.customers.a],
    );
  }

  const event = await client.query(
    `select event_key from public.notification_event_settings where email_enabled=true order by event_key limit 1`,
  );
  assert.ok(event.rows[0]?.event_key);
  const notificationDisabled = await enqueue({
    eventKey: event.rows[0].event_key,
  });
  await runEmail({
    workerId: "runtime-notification-disabled-after-claim",
    afterClaim: async () => {
      await client.query(
        `update public.notification_event_settings set email_enabled=false where event_key=$1`,
        [event.rows[0].event_key],
      );
    },
  });
  assert.equal(
    (await queueState(notificationDisabled.id)).last_error,
    "notification_disabled",
  );
  await client.query(
    `update public.notification_event_settings set email_enabled=true where event_key=$1`,
    [event.rows[0].event_key],
  );

  const crossTenant = await enqueue({
    tenantId: tenantA,
    recipientType: "personnel",
    personnelId: FIXTURE.personnel.b,
  });
  let crossTenantDeliveries = 0;
  await runEmail({
    deliveryOverride: async () => {
      crossTenantDeliveries += 1;
      return delivered();
    },
  });
  assert.equal(crossTenantDeliveries, 0);
  assert.equal(
    (await queueState(crossTenant.id)).last_error,
    "recipient_inactive",
  );

  const staleSafe = await enqueue({});
  await makeStaleProcessing(staleSafe.id, false);
  await runEmail({ workerId: "runtime-stale-safe-recovery" });
  assert.equal((await queueState(staleSafe.id)).status, "sent");
  assert.deepEqual(
    (await attempts(staleSafe.id)).map((row) => row.status),
    ["abandoned", "sent"],
  );

  const uncertain = await enqueue({});
  await makeStaleProcessing(uncertain.id, true);
  let uncertainDeliveries = 0;
  const uncertainResult = await runEmail({
    deliveryOverride: async () => {
      uncertainDeliveries += 1;
      return delivered();
    },
  });
  assert.equal(uncertainDeliveries, 0);
  assert.equal(uncertainResult.outcomePending, 1);
  assert.equal((await queueState(uncertain.id)).status, "outcome_pending");
  assert.equal((await attempts(uncertain.id))[0].status, "outcome_pending");
  assert.equal(
    (
      await retryFailedNotifications({
        queueIds: [uncertain.id],
        reason: "Provideruitkomst is nog niet handmatig bevestigd.",
        logger,
      })
    ).requeued,
    0,
  );
  assert.equal((await queueState(uncertain.id)).status, "outcome_pending");
  assert.equal(
    (
      await retryFailedNotifications({
        queueIds: [uncertain.id],
        reason: "Provider bevestigde dat geen bezorging heeft plaatsgevonden.",
        confirmedNoDelivery: true,
        logger,
      })
    ).requeued,
    1,
  );
  assert.equal((await queueState(uncertain.id)).status, "retry");
  await client.query(
    `delete from public.notification_delivery_queue where id=$1`,
    [uncertain.id],
  );

  const transient = await enqueue({});
  await runEmail({
    workerId: "runtime-transient-provider",
    deliveryOverride: async () => {
      throw new Error("transient provider failure");
    },
  });
  assert.equal((await queueState(transient.id)).status, "retry");
  assert.equal((await attempts(transient.id))[0].status, "retry");
  await client.query(
    `delete from public.notification_delivery_queue where id=$1`,
    [transient.id],
  );

  const maxAttempts = await enqueue({ maxAttempts: 1 });
  await runEmail({
    workerId: "runtime-max-attempts",
    deliveryOverride: async () => {
      throw new Error("permanent after max attempts");
    },
  });
  const maxState = await queueState(maxAttempts.id);
  assert.equal(maxState.status, "failed");
  assert.ok(maxState.terminal_attempt_id);

  const stable = await enqueue({});
  const deliveryKeys: string[] = [];
  await runEmail({
    workerId: "runtime-idempotency-first",
    deliveryOverride: async (item: { deliveryKey: string }) => {
      deliveryKeys.push(item.deliveryKey);
      throw new Error("retry once");
    },
  });
  await runEmail({
    workerId: "runtime-idempotency-second",
    deliveryOverride: async (item: { deliveryKey: string }) => {
      deliveryKeys.push(item.deliveryKey);
      return delivered();
    },
  });
  assert.equal(deliveryKeys.length, 2);
  assert.equal(deliveryKeys[0], deliveryKeys[1]);

  const duplicate = await enqueue({});
  let duplicateDeliveries = 0;
  const slowDelivery = async () => {
    duplicateDeliveries += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return delivered();
  };
  await Promise.all([
    runEmail({ workerId: "runtime-worker-a", deliveryOverride: slowDelivery }),
    runEmail({ workerId: "runtime-worker-b", deliveryOverride: slowDelivery }),
  ]);
  assert.equal(duplicateDeliveries, 1);
  assert.equal((await attempts(duplicate.id)).length, 1);

  const attemptFailure = await enqueue({});
  await client.query(`
    create or replace function public.fieldgrid_runtime_reject_notification_attempt()
    returns trigger language plpgsql as $$
    begin
      if new.worker_id = 'runtime-attempt-log-failure' then
        raise exception 'runtime attempt insert failure' using errcode='P0001';
      end if;
      return new;
    end $$;
    create trigger fieldgrid_runtime_reject_notification_attempt
      before insert on public.notification_delivery_attempts
      for each row execute function public.fieldgrid_runtime_reject_notification_attempt();
  `);
  let attemptFailureDeliveries = 0;
  await assert.rejects(
    runEmail({
      workerId: "runtime-attempt-log-failure",
      deliveryOverride: async () => {
        attemptFailureDeliveries += 1;
        return delivered();
      },
    }),
  );
  assert.equal(attemptFailureDeliveries, 0);
  assert.deepEqual(await queueState(attemptFailure.id), {
    status: "pending",
    attempts: 0,
    delivery_key: (await queueState(attemptFailure.id)).delivery_key,
    delivery_started_at: null,
    current_attempt_id: null,
    terminal_attempt_id: null,
    response: {},
    last_error: null,
  });
  await client.query(
    `delete from public.notification_delivery_queue where id=$1`,
    [attemptFailure.id],
  );
  await client.query(
    `drop trigger fieldgrid_runtime_reject_notification_attempt on public.notification_delivery_attempts`,
  );
  await client.query(
    `drop function public.fieldgrid_runtime_reject_notification_attempt()`,
  );

  const finalizationFailure = await enqueue({});
  await client.query(`
    create or replace function public.fieldgrid_runtime_reject_notification_finalization()
    returns trigger language plpgsql as $$
    begin
      if new.status = 'sent' and old.locked_by = 'runtime-finalization-failure' then
        raise exception 'runtime queue finalization failure' using errcode='P0001';
      end if;
      return new;
    end $$;
    create trigger fieldgrid_runtime_reject_notification_finalization
      before update on public.notification_delivery_queue
      for each row execute function public.fieldgrid_runtime_reject_notification_finalization();
  `);
  let finalizationDeliveries = 0;
  await assert.rejects(
    runEmail({
      workerId: "runtime-finalization-failure",
      deliveryOverride: async () => {
        finalizationDeliveries += 1;
        return delivered();
      },
    }),
  );
  assert.equal(finalizationDeliveries, 1);
  assert.equal((await queueState(finalizationFailure.id)).status, "processing");
  assert.equal(
    (await attempts(finalizationFailure.id))[0].status,
    "processing",
  );
  await client.query(
    `drop trigger fieldgrid_runtime_reject_notification_finalization on public.notification_delivery_queue`,
  );
  await client.query(
    `drop function public.fieldgrid_runtime_reject_notification_finalization()`,
  );
  await client.query(
    `update public.notification_delivery_queue
     set locked_at=now()-interval '10 seconds', delivery_started_at=now()-interval '9 seconds'
     where id=$1`,
    [finalizationFailure.id],
  );
  const reconciled = await runEmail({
    workerId: "runtime-finalization-reconciliation",
    deliveryOverride: async () => {
      finalizationDeliveries += 1;
      return delivered();
    },
  });
  assert.equal(reconciled.outcomePending, 1);
  assert.equal(finalizationDeliveries, 1);
  assert.equal(
    (await queueState(finalizationFailure.id)).status,
    "outcome_pending",
  );

  const webQueue = await enqueue({
    channel: "push",
    recipientType: "personnel",
    personnelId: FIXTURE.personnel.a,
  });
  const webGood = randomUUID();
  const webInvalid = randomUUID();
  await client.query(
    `insert into public.push_subscriptions
       (id, tenant_id, owner_type, personnel_id, endpoint, p256dh, auth, is_active)
     values ($1,$3,'personnel',$4,$5,'runtime','runtime',true),
            ($2,$3,'personnel',$4,$6,'runtime','runtime',true)`,
    [
      webGood,
      webInvalid,
      tenantA,
      FIXTURE.personnel.a,
      `https://push.runtime/${webGood}`,
      `https://push.runtime/${webInvalid}`,
    ],
  );
  const webResult = await processNotificationQueue({
    channels: ["push"],
    limit: 10,
    pushRatePerRun: 10,
    sendDelayMs: 0,
    lockSeconds: 1,
    logger,
    webPushSender: async (subscription) =>
      subscription.endpoint.endsWith(webInvalid)
        ? { success: false, status: 410, error: "gone", permanent: true }
        : { success: true, status: 201 },
    fcmPushSender: async () => ({
      success: false,
      status: 0,
      error: "unexpected",
      permanent: false,
    }),
  });
  assert.equal(webResult.partial, 1);
  const webState = await queueState(webQueue.id);
  assert.equal(webState.status, "partial");
  assert.equal(webState.response.targetOutcomes.length, 2);
  assert.equal(
    (
      await client.query(
        `select is_active from public.push_subscriptions where id=$1`,
        [webInvalid],
      )
    ).rows[0].is_active,
    false,
  );
  await client.query(`delete from public.push_subscriptions where id=$1`, [
    webGood,
  ]);

  const targetedRetryQueue = await enqueue({
    channel: "push",
    recipientType: "personnel",
    personnelId: FIXTURE.personnel.a,
  });
  const targetedGood = randomUUID();
  const targetedTransient = randomUUID();
  await client.query(
    `insert into public.push_subscriptions
       (id, tenant_id, owner_type, personnel_id, endpoint, p256dh, auth, is_active)
     values ($1,$3,'personnel',$4,$5,'runtime','runtime',true),
            ($2,$3,'personnel',$4,$6,'runtime','runtime',true)`,
    [
      targetedGood,
      targetedTransient,
      tenantA,
      FIXTURE.personnel.a,
      `https://push.runtime/${targetedGood}`,
      `https://push.runtime/${targetedTransient}`,
    ],
  );
  const firstTargetCalls: string[] = [];
  const targetedFirst = await processNotificationQueue({
    channels: ["push"],
    limit: 10,
    pushRatePerRun: 10,
    sendDelayMs: 0,
    lockSeconds: 1,
    baseRetrySeconds: 0,
    maxRetrySeconds: 1,
    logger,
    webPushSender: async (subscription) => {
      firstTargetCalls.push(subscription.endpoint);
      return subscription.endpoint.endsWith(targetedTransient)
        ? { success: false, status: 503, error: "temporary", permanent: false }
        : { success: true, status: 201 };
    },
    fcmPushSender: async () => ({
      success: false,
      status: 0,
      error: "unexpected",
      permanent: false,
    }),
  });
  assert.equal(targetedFirst.retried, 1);
  assert.equal(
    (await queueState(targetedRetryQueue.id)).response.retryTargets.length,
    1,
  );
  const secondTargetCalls: string[] = [];
  await processNotificationQueue({
    channels: ["push"],
    limit: 10,
    pushRatePerRun: 10,
    sendDelayMs: 0,
    lockSeconds: 1,
    baseRetrySeconds: 0,
    maxRetrySeconds: 1,
    logger,
    webPushSender: async (subscription) => {
      secondTargetCalls.push(subscription.endpoint);
      return { success: true, status: 201 };
    },
    fcmPushSender: async () => ({
      success: false,
      status: 0,
      error: "unexpected",
      permanent: false,
    }),
  });
  assert.equal(firstTargetCalls.length, 2);
  assert.deepEqual(secondTargetCalls, [
    `https://push.runtime/${targetedTransient}`,
  ]);
  assert.equal((await queueState(targetedRetryQueue.id)).status, "sent");
  assert.deepEqual(
    (await attempts(targetedRetryQueue.id)).map((row) => row.status),
    ["retry", "sent"],
  );
  await client.query(
    `delete from public.push_subscriptions where id in ($1,$2)`,
    [targetedGood, targetedTransient],
  );

  const exhaustedQueue = await enqueue({
    channel: "push",
    recipientType: "personnel",
    personnelId: FIXTURE.personnel.a,
    maxAttempts: 2,
  });
  const exhaustedGood = randomUUID();
  const exhaustedTransient = randomUUID();
  await client.query(
    `insert into public.push_subscriptions
       (id, tenant_id, owner_type, personnel_id, endpoint, p256dh, auth, is_active)
     values ($1,$3,'personnel',$4,$5,'runtime','runtime',true),
            ($2,$3,'personnel',$4,$6,'runtime','runtime',true)`,
    [
      exhaustedGood,
      exhaustedTransient,
      tenantA,
      FIXTURE.personnel.a,
      `https://push.runtime/${exhaustedGood}`,
      `https://push.runtime/${exhaustedTransient}`,
    ],
  );
  const exhaustedCalls: string[] = [];
  const exhaustedSender = async (subscription: { endpoint: string }) => {
    exhaustedCalls.push(subscription.endpoint);
    return subscription.endpoint.endsWith(exhaustedTransient)
      ? {
          success: false as const,
          status: 503,
          error: "temporary",
          permanent: false,
        }
      : { success: true as const, status: 201 };
  };
  await processNotificationQueue({
    channels: ["push"],
    queueIds: [exhaustedQueue.id],
    limit: 1,
    pushRatePerRun: 1,
    baseRetrySeconds: 0,
    maxRetrySeconds: 1,
    sendDelayMs: 0,
    logger,
    webPushSender: exhaustedSender,
  });
  const exhaustedResult = await processNotificationQueue({
    channels: ["push"],
    queueIds: [exhaustedQueue.id],
    limit: 1,
    pushRatePerRun: 1,
    baseRetrySeconds: 0,
    maxRetrySeconds: 1,
    sendDelayMs: 0,
    logger,
    webPushSender: exhaustedSender,
  });
  assert.equal(exhaustedResult.partial, 1);
  assert.equal((await queueState(exhaustedQueue.id)).status, "partial");
  assert.equal(
    exhaustedCalls.filter((endpoint) => endpoint.endsWith(exhaustedGood))
      .length,
    1,
  );
  assert.deepEqual(
    (await attempts(exhaustedQueue.id)).map((row) => row.status),
    ["retry", "partial"],
  );
  await client.query(
    `delete from public.push_subscriptions where id in ($1,$2)`,
    [exhaustedGood, exhaustedTransient],
  );

  const vanishedQueue = await enqueue({
    channel: "push",
    recipientType: "personnel",
    personnelId: FIXTURE.personnel.a,
  });
  const vanishedGood = randomUUID();
  const vanishedTransient = randomUUID();
  await client.query(
    `insert into public.push_subscriptions
       (id, tenant_id, owner_type, personnel_id, endpoint, p256dh, auth, is_active)
     values ($1,$3,'personnel',$4,$5,'runtime','runtime',true),
            ($2,$3,'personnel',$4,$6,'runtime','runtime',true)`,
    [
      vanishedGood,
      vanishedTransient,
      tenantA,
      FIXTURE.personnel.a,
      `https://push.runtime/${vanishedGood}`,
      `https://push.runtime/${vanishedTransient}`,
    ],
  );
  await processNotificationQueue({
    channels: ["push"],
    queueIds: [vanishedQueue.id],
    limit: 1,
    pushRatePerRun: 1,
    baseRetrySeconds: 0,
    maxRetrySeconds: 1,
    sendDelayMs: 0,
    logger,
    webPushSender: async (subscription) =>
      subscription.endpoint.endsWith(vanishedTransient)
        ? { success: false, status: 503, error: "temporary", permanent: false }
        : { success: true, status: 201 },
  });
  await client.query(`delete from public.push_subscriptions where id=$1`, [
    vanishedTransient,
  ]);
  const vanishedResult = await processNotificationQueue({
    channels: ["push"],
    queueIds: [vanishedQueue.id],
    limit: 1,
    pushRatePerRun: 1,
    baseRetrySeconds: 0,
    maxRetrySeconds: 1,
    sendDelayMs: 0,
    logger,
  });
  assert.equal(vanishedResult.partial, 1);
  const vanishedState = await queueState(vanishedQueue.id);
  assert.equal(vanishedState.status, "partial");
  assert.equal(vanishedState.response.targetOutcomes.length, 2);
  assert.equal(vanishedState.response.unavailableRetryTargets.length, 1);
  await client.query(`delete from public.push_subscriptions where id=$1`, [
    vanishedGood,
  ]);

  await client.query(
    `update public.push_subscriptions set is_active=true where id=$1`,
    [webInvalid],
  );
  const permanentQueue = await enqueue({
    channel: "push",
    recipientType: "personnel",
    personnelId: FIXTURE.personnel.a,
  });
  const permanentResult = await processNotificationQueue({
    channels: ["push"],
    limit: 10,
    pushRatePerRun: 10,
    sendDelayMs: 0,
    lockSeconds: 1,
    logger,
    webPushSender: async () => ({
      success: false,
      status: 410,
      error: "gone",
      permanent: true,
    }),
    fcmPushSender: async () => ({
      success: false,
      status: 0,
      error: "unexpected",
      permanent: false,
    }),
  });
  assert.equal(permanentResult.failed, 1);
  assert.equal((await queueState(permanentQueue.id)).status, "failed");
  await client.query(`delete from public.push_subscriptions where id=$1`, [
    webInvalid,
  ]);

  const fcmQueue = await enqueue({
    channel: "push",
    recipientType: "personnel",
    personnelId: FIXTURE.personnel.a,
  });
  const fcmGood = randomUUID();
  const fcmInvalid = randomUUID();
  await client.query(
    `insert into public.native_push_device_tokens
       (id, tenant_id, owner_type, personnel_id, provider, platform, token, is_active)
     values ($1,$3,'personnel',$4,'fcm','android',$5,true),
            ($2,$3,'personnel',$4,'fcm','android',$6,true)`,
    [
      fcmGood,
      fcmInvalid,
      tenantA,
      FIXTURE.personnel.a,
      `runtime-token-${fcmGood}`,
      `runtime-token-${fcmInvalid}`,
    ],
  );
  const fcmResult = await processNotificationQueue({
    channels: ["push"],
    limit: 10,
    pushRatePerRun: 10,
    sendDelayMs: 0,
    lockSeconds: 1,
    logger,
    webPushSender: async () => ({
      success: false,
      status: 0,
      error: "unexpected",
      permanent: false,
    }),
    fcmPushSender: async (token) =>
      token.endsWith(fcmInvalid)
        ? {
            success: false,
            status: 404,
            error: "unregistered",
            permanent: true,
          }
        : { success: true, status: 200, messageId: "runtime-fcm-message" },
  });
  assert.equal(fcmResult.partial, 1);
  assert.equal(
    (await queueState(fcmQueue.id)).response.targetOutcomes.length,
    2,
  );
  assert.equal(
    (
      await client.query(
        `select is_active from public.native_push_device_tokens where id=$1`,
        [fcmInvalid],
      )
    ).rows[0].is_active,
    false,
  );
  await client.query(
    `delete from public.native_push_device_tokens where id in ($1,$2)`,
    [fcmGood, fcmInvalid],
  );

  const rlsA = await enqueue({ tenantId: tenantA });
  const rlsB = await enqueue({ tenantId: tenantB });
  const rlsBAttempt = randomUUID();
  await client.query(
    `insert into public.notification_delivery_attempts
       (id, queue_id, tenant_id, channel, attempt_no, worker_id, status, delivery_key)
     values ($1,$2,$3,'email',1,'runtime-rls-b','processing',$4)`,
    [rlsBAttempt, rlsB.id, tenantB, rlsB.delivery_key],
  );
  const rlsClient = await connect();
  try {
    await rlsClient.query("begin");
    await rlsClient.query("set local role authenticated");
    await rlsClient.query("set local row_security = on");
    const claims = JSON.stringify({
      sub: FIXTURE.users.tenantAAdmin,
      email: "admin@tenant-a.runtime.fieldgrid.test",
      role: "authenticated",
      aud: "authenticated",
      tenant_id: tenantA,
    });
    await rlsClient.query(
      "select set_config('request.jwt.claim.sub', $1, true)",
      [FIXTURE.users.tenantAAdmin],
    );
    await rlsClient.query("select set_config('request.jwt.claims', $1, true)", [
      claims,
    ]);
    assert.equal(
      (
        await rlsClient.query(
          `select count(*)::int as count from public.notification_delivery_queue where id=$1`,
          [rlsA.id],
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await rlsClient.query(
          `select count(*)::int as count from public.notification_delivery_queue where id=$1`,
          [rlsB.id],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await rlsClient.query(
          `select count(*)::int as count from public.notification_delivery_attempts where id=$1`,
          [rlsBAttempt],
        )
      ).rows[0].count,
      0,
    );
    await assert.rejects(
      rlsClient.query(
        `update public.notification_delivery_queue set title='forbidden' where id=$1`,
        [rlsA.id],
      ),
      /permission denied/u,
    );
    await rlsClient.query("rollback");
  } finally {
    await rlsClient.end();
  }

  const terminalEvidence = await client.query(
    `select count(*)::int as missing
     from public.notification_delivery_queue queue
     left join public.notification_delivery_attempts attempt
       on attempt.id=queue.terminal_attempt_id and attempt.queue_id=queue.id
     where queue.id=any($1::uuid[])
       and queue.status in ('sent','failed','skipped','partial')
       and attempt.id is null`,
    [createdQueueIds],
  );
  assert.equal(terminalEvidence.rows[0].missing, 0);

  console.log("FG-NOTIFICATION-WORKER runtime proof passed");
} finally {
  await client
    .query(
      `drop trigger if exists fieldgrid_runtime_reject_notification_attempt on public.notification_delivery_attempts`,
    )
    .catch(() => {});
  await client
    .query(
      `drop function if exists public.fieldgrid_runtime_reject_notification_attempt()`,
    )
    .catch(() => {});
  await client
    .query(
      `drop trigger if exists fieldgrid_runtime_reject_notification_finalization on public.notification_delivery_queue`,
    )
    .catch(() => {});
  await client
    .query(
      `drop function if exists public.fieldgrid_runtime_reject_notification_finalization()`,
    )
    .catch(() => {});
  await client
    .query(
      `update public.tenants set is_active=true, status='active' where id=$1`,
      [tenantA],
    )
    .catch(() => {});
  await client
    .query(`update public.personnel set is_active=true where id=$1`, [
      FIXTURE.personnel.a,
    ])
    .catch(() => {});
  await client
    .query(
      `update public.personnel set notification_email_enabled=true where id=$1`,
      [FIXTURE.personnel.a],
    )
    .catch(() => {});
  await client
    .query(
      `delete from public.notification_delivery_queue where id=any($1::uuid[])`,
      [createdQueueIds],
    )
    .catch(() => {});
  await client.end();
  await pool.end();
}
