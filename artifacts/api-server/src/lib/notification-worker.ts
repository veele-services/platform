import { and, eq } from "drizzle-orm";
import {
  db,
  nativePushDeviceTokensTable,
  pool,
  pushSubscriptionsTable,
} from "@workspace/db";
import {
  sanitizeBackofficeHref,
  sanitizeCustomerPortalHref,
  sanitizePersonnelPortalHref,
} from "@workspace/db/portal-routes";
import { sendEmailWithResult } from "./email";
import { logger as defaultLogger } from "./logger";
import { sendFcmPush } from "./native-push";
import {
  sendWebPush,
  type WebPushPayload,
  type WebPushUrgency,
} from "./web-push";
import type { NotificationWorkerChannel } from "./admin-api";

type QueueRow = {
  id: string;
  tenant_id: string;
  event_key: string | null;
  dispatch_id: string | null;
  channel: NotificationWorkerChannel;
  recipient_type: string;
  personnel_id: string | null;
  customer_id: string | null;
  recipient_email: string | null;
  subject: string | null;
  title: string;
  body: string | null;
  html: string | null;
  payload: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  rate_limit_key: string | null;
  delivery_key: string;
  attempt_id: string;
};

type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
type NativePushDeviceToken = typeof nativePushDeviceTokensTable.$inferSelect;

type WorkerLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
};

type WorkerConfig = {
  limit: number;
  emailRatePerRun: number;
  pushRatePerRun: number;
  maxAttempts: number;
  lockSeconds: number;
  baseRetrySeconds: number;
  maxRetrySeconds: number;
  sendDelayMs: number;
};

type QueueOutcomeStatus = "sent" | "failed" | "retry" | "skipped" | "partial";

export type QueueOutcome = {
  status: QueueOutcomeStatus;
  error: string | null;
  retryAt: Date | null;
  response: Record<string, unknown>;
  deactivatedSubscriptions: number;
  deactivatedNativeTokens: number;
  providerMessageId: string | null;
};

export type NotificationDeliveryOverride = (
  item: Readonly<{
    id: string;
    tenantId: string;
    channel: NotificationWorkerChannel;
    attemptNo: number;
    deliveryKey: string;
  }>,
) => Promise<QueueOutcome>;

export type NotificationWorkerResult = {
  ok: true;
  workerId: string;
  claimed: number;
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
  partial: number;
  outcomePending: number;
  rateLimited: boolean;
  deactivatedSubscriptions: number;
  deactivatedNativeTokens: number;
  byChannel: Record<
    NotificationWorkerChannel,
    {
      claimed: number;
      sent: number;
      failed: number;
      retried: number;
      skipped: number;
      partial: number;
      rateLimited: boolean;
    }
  >;
};

export type NotificationWorkerOptions = Partial<WorkerConfig> & {
  channels?: NotificationWorkerChannel[];
  logger?: WorkerLogger;
  workerId?: string;
  deliveryOverride?: NotificationDeliveryOverride;
  afterClaim?: (
    items: ReadonlyArray<{ id: string; tenantId: string }>,
  ) => Promise<void>;
  webPushSender?: typeof sendWebPush;
  fcmPushSender?: typeof sendFcmPush;
};

const DEFAULT_CONFIG: WorkerConfig = {
  limit: 100,
  emailRatePerRun: 50,
  pushRatePerRun: 100,
  maxAttempts: 5,
  lockSeconds: 300,
  baseRetrySeconds: 60,
  maxRetrySeconds: 3600,
  sendDelayMs: 0,
};

function envInt(name: string, fallback: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function buildConfig(options: NotificationWorkerOptions): WorkerConfig {
  return {
    limit:
      options.limit ??
      envInt("NOTIFICATION_WORKER_LIMIT", DEFAULT_CONFIG.limit, 500),
    emailRatePerRun:
      options.emailRatePerRun ??
      envInt(
        "NOTIFICATION_WORKER_EMAIL_RATE_PER_RUN",
        DEFAULT_CONFIG.emailRatePerRun,
        250,
      ),
    pushRatePerRun:
      options.pushRatePerRun ??
      envInt(
        "NOTIFICATION_WORKER_PUSH_RATE_PER_RUN",
        DEFAULT_CONFIG.pushRatePerRun,
        500,
      ),
    maxAttempts:
      options.maxAttempts ??
      envInt(
        "NOTIFICATION_WORKER_MAX_ATTEMPTS",
        DEFAULT_CONFIG.maxAttempts,
        20,
      ),
    lockSeconds:
      options.lockSeconds ??
      envInt(
        "NOTIFICATION_WORKER_LOCK_SECONDS",
        DEFAULT_CONFIG.lockSeconds,
        3600,
      ),
    baseRetrySeconds:
      options.baseRetrySeconds ??
      envInt(
        "NOTIFICATION_WORKER_BASE_RETRY_SECONDS",
        DEFAULT_CONFIG.baseRetrySeconds,
        3600,
      ),
    maxRetrySeconds:
      options.maxRetrySeconds ??
      envInt(
        "NOTIFICATION_WORKER_MAX_RETRY_SECONDS",
        DEFAULT_CONFIG.maxRetrySeconds,
        86400,
      ),
    sendDelayMs:
      options.sendDelayMs ??
      envInt(
        "NOTIFICATION_WORKER_SEND_DELAY_MS",
        DEFAULT_CONFIG.sendDelayMs,
        5000,
      ),
  };
}

function createWorkerId(): string {
  return `notification-worker-${process.pid}-${Date.now()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeProviderError(error: string): string {
  return error
    .replace(/https?:\/\/\S+/giu, "[provider-url]")
    .replace(/bearer\s+\S+/giu, "Bearer [redacted]")
    .slice(0, 500);
}

function calculateRetryAt(item: QueueRow, config: WorkerConfig): Date | null {
  if (item.attempts >= item.max_attempts) return null;

  const exponent = Math.max(0, item.attempts - 1);
  const seconds = Math.min(
    config.maxRetrySeconds,
    config.baseRetrySeconds * 2 ** exponent,
  );
  return new Date(Date.now() + seconds * 1000);
}

function failureOutcome(
  item: QueueRow,
  config: WorkerConfig,
  retryable: boolean,
  error: string,
  response: Record<string, unknown> = {},
): QueueOutcome {
  const retryAt = retryable ? calculateRetryAt(item, config) : null;
  return {
    status: retryAt ? "retry" : "failed",
    error,
    retryAt,
    response,
    deactivatedSubscriptions: 0,
    deactivatedNativeTokens: 0,
    providerMessageId: null,
  };
}

function skippedOutcome(reason: string): QueueOutcome {
  return {
    status: "skipped",
    error: reason,
    retryAt: null,
    response: { reason },
    deactivatedSubscriptions: 0,
    deactivatedNativeTokens: 0,
    providerMessageId: null,
  };
}

async function claimQueueItems(
  channel: NotificationWorkerChannel,
  limit: number,
  workerId: string,
  config: WorkerConfig,
): Promise<QueueRow[]> {
  if (limit <= 0) return [];
  type ClaimedQueueRow = Omit<QueueRow, "attempt_id"> & {
    current_attempt_id: string | null;
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<ClaimedQueueRow>(
      `
      WITH candidates AS (
        SELECT id
        FROM notification_delivery_queue
        WHERE channel = $1
          AND channel IN ('email', 'push')
          AND attempts < COALESCE(NULLIF(max_attempts, 0), $4)
          AND (
            (status IN ('pending', 'retry') AND next_attempt_at <= now())
            OR
            (
              status = 'processing'
              AND delivery_started_at IS NULL
              AND locked_at < now() - ($3::integer * interval '1 second')
            )
          )
        ORDER BY
          CASE WHEN status = 'retry' THEN 0 ELSE 1 END,
          next_attempt_at ASC,
          created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE notification_delivery_queue q
      SET status = 'processing',
          processing_started_at = now(),
          locked_at = now(),
          locked_by = $5,
          last_attempt_at = now(),
          attempts = q.attempts + 1,
          delivery_started_at = NULL,
          terminal_attempt_id = NULL,
          max_attempts = COALESCE(NULLIF(q.max_attempts, 0), $4),
          updated_at = now()
      FROM candidates c
      WHERE q.id = c.id
      RETURNING
        q.id,
        q.tenant_id,
        q.event_key,
        q.dispatch_id,
        q.channel,
        q.recipient_type,
        q.personnel_id,
        q.customer_id,
        q.recipient_email,
        q.subject,
        q.title,
        q.body,
        q.html,
        q.payload,
        q.response,
        q.attempts,
        q.max_attempts,
        q.rate_limit_key,
        q.delivery_key,
        q.current_attempt_id
    `,
      [channel, limit, config.lockSeconds, config.maxAttempts, workerId],
    );

    const claimed = result.rows;
    if (claimed.length === 0) {
      await client.query("COMMIT");
      return [];
    }

    const staleAttemptIds = claimed
      .map((item) => item.current_attempt_id)
      .filter((id): id is string => Boolean(id));
    if (staleAttemptIds.length > 0) {
      await client.query(
        `UPDATE notification_delivery_attempts attempt
        SET status = 'abandoned',
            error = 'stale_claim_recovered_before_delivery',
            response = jsonb_build_object('reason', 'stale_claim_recovered_before_delivery'),
            finished_at = now()
         WHERE attempt.id = ANY($1::uuid[]) AND attempt.status = 'processing'`,
        [staleAttemptIds],
      );
    }

    const attemptInput = claimed.map((item) => ({
      queueId: item.id,
      tenantId: item.tenant_id,
      channel: item.channel,
      attemptNo: item.attempts,
      deliveryKey: item.delivery_key,
    }));
    const inserted = await client.query<{ id: string; queue_id: string }>(
      `
        INSERT INTO notification_delivery_attempts (
          queue_id, tenant_id, channel, attempt_no, worker_id, status,
          response, delivery_key, started_at, finished_at
        )
        SELECT input.queue_id, input.tenant_id, input.channel, input.attempt_no,
               $2, 'processing', '{}'::jsonb, input.delivery_key, now(), now()
        FROM jsonb_to_recordset($1::jsonb) AS input(
          queue_id uuid, tenant_id uuid, channel varchar, attempt_no integer, delivery_key text
        )
        RETURNING id, queue_id`,
      [
        JSON.stringify(
          attemptInput.map((item) => ({
            queue_id: item.queueId,
            tenant_id: item.tenantId,
            channel: item.channel,
            attempt_no: item.attemptNo,
            delivery_key: item.deliveryKey,
          })),
        ),
        workerId,
      ],
    );
    const attemptByQueue = new Map(
      inserted.rows.map((row) => [row.queue_id, row.id]),
    );
    await client.query(
      `UPDATE notification_delivery_queue queue
       SET current_attempt_id = input.attempt_id
       FROM jsonb_to_recordset($1::jsonb) AS input(queue_id uuid, attempt_id uuid)
       WHERE queue.id = input.queue_id`,
      [
        JSON.stringify(
          inserted.rows.map((row) => ({
            queue_id: row.queue_id,
            attempt_id: row.id,
          })),
        ),
      ],
    );
    await client.query("COMMIT");
    return claimed.map((item) => ({
      ...item,
      attempt_id: attemptByQueue.get(item.id)!,
    }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function reconcileUncertainDeliveries(
  config: WorkerConfig,
): Promise<number> {
  const result = await pool.query(
    `
      WITH stale AS (
        SELECT queue.id, queue.current_attempt_id
        FROM notification_delivery_queue queue
        WHERE queue.status = 'processing'
          AND queue.delivery_started_at IS NOT NULL
          AND queue.locked_at < now() - ($1::integer * interval '1 second')
        FOR UPDATE SKIP LOCKED
      ), attempt_evidence AS (
        UPDATE notification_delivery_attempts attempt
        SET status = 'outcome_pending',
            error = 'provider_outcome_unknown',
            response = jsonb_build_object('reason', 'provider_outcome_unknown'),
            finished_at = now()
        FROM stale
        WHERE attempt.id = stale.current_attempt_id
        RETURNING attempt.id
      )
      UPDATE notification_delivery_queue queue
      SET status = 'outcome_pending',
          locked_at = NULL,
          locked_by = NULL,
          processing_started_at = NULL,
          last_error = 'provider_outcome_unknown',
          error_details = jsonb_build_object('reason', 'provider_outcome_unknown'),
          updated_at = now()
      FROM stale
      WHERE queue.id = stale.id
      RETURNING queue.id
    `,
    [config.lockSeconds],
  );
  return result.rowCount ?? 0;
}

async function markDeliveryStarted(
  item: QueueRow,
  workerId: string,
): Promise<void> {
  const result = await pool.query(
    `UPDATE notification_delivery_queue
     SET delivery_started_at = now(), updated_at = now()
     WHERE id = $1 AND locked_by = $2 AND current_attempt_id = $3 AND status = 'processing'`,
    [item.id, workerId, item.attempt_id],
  );
  if (result.rowCount !== 1) {
    throw new Error("notification_delivery_lock_lost_before_provider");
  }
}

async function completeQueueItem(
  item: QueueRow,
  workerId: string,
  outcome: QueueOutcome,
): Promise<void> {
  const errorDetails =
    outcome.error === null
      ? {}
      : {
          message: outcome.error,
          attempt: item.attempts,
          channel: item.channel,
        };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const attempt = await client.query(
      `UPDATE notification_delivery_attempts
       SET status = $4::varchar,
           error = $5,
           response = $6::jsonb,
           provider_message_id = $7,
           finished_at = now()
       WHERE id = $1 AND queue_id = $2 AND worker_id = $3 AND status = 'processing'`,
      [
        item.attempt_id,
        item.id,
        workerId,
        outcome.status,
        outcome.error,
        JSON.stringify(outcome.response),
        outcome.providerMessageId,
      ],
    );
    if (attempt.rowCount !== 1) {
      throw new Error("notification_attempt_evidence_not_owned");
    }

    const result = await client.query(
      `
      UPDATE notification_delivery_queue
      SET status = $4::varchar,
          locked_at = NULL,
          locked_by = NULL,
          processing_started_at = NULL,
          delivery_started_at = NULL,
          last_error = $5,
          error_details = $6::jsonb,
          response = $7::jsonb,
          next_attempt_at = COALESCE($8::timestamptz, next_attempt_at),
          sent_at = CASE WHEN $4::text IN ('sent', 'partial') THEN now() ELSE sent_at END,
          terminal_attempt_id = CASE
            WHEN $4::text IN ('sent', 'failed', 'skipped', 'partial') THEN $3::uuid
            ELSE NULL
          END,
          updated_at = now()
      WHERE id = $1
        AND locked_by = $2
        AND current_attempt_id = $3
    `,
      [
        item.id,
        workerId,
        item.attempt_id,
        outcome.status,
        outcome.error,
        JSON.stringify(errorDetails),
        JSON.stringify(outcome.response),
        outcome.retryAt ? outcome.retryAt.toISOString() : null,
      ],
    );

    if (result.rowCount !== 1) {
      throw new Error("notification_queue_finalization_not_owned");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type LifecycleDecision = { allowed: true } | { allowed: false; reason: string };

async function checkDeliveryLifecycle(
  item: QueueRow,
): Promise<LifecycleDecision> {
  const managementRecipientUserId =
    item.recipient_type === "management" &&
    typeof item.payload?.["recipientUserId"] === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      item.payload["recipientUserId"],
    )
      ? item.payload["recipientUserId"]
      : null;
  const result = await pool.query<{ denial_reason: string | null }>(
    `SELECT CASE
       WHEN tenant.id IS NULL THEN 'tenant_missing'
       WHEN tenant.is_active IS NOT TRUE OR tenant.status NOT IN ('trial', 'active') THEN 'tenant_inactive'
       WHEN NOT EXISTS (
         SELECT 1 FROM tenant_modules entitlement
         JOIN modules module ON module.id = entitlement.module_id
         WHERE entitlement.tenant_id = $1
           AND entitlement.is_enabled = true
           AND module.key = 'notifications'
       ) THEN 'module_disabled'
       WHEN $2::text IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM notification_event_settings setting
         WHERE setting.event_key = $2
           AND CASE WHEN $3::text = 'email' THEN setting.email_enabled ELSE setting.push_enabled END
       ) THEN 'notification_disabled'
       WHEN $4::text = 'personnel' AND NOT EXISTS (
         SELECT 1 FROM personnel person
         WHERE person.id = $5 AND person.tenant_id = $1 AND person.is_active = true
       ) THEN 'recipient_inactive'
       WHEN $4::text = 'personnel' AND NOT EXISTS (
         SELECT 1 FROM personnel person
         WHERE person.id = $5 AND person.tenant_id = $1 AND person.is_active = true
           AND CASE
             WHEN $3::text = 'email' THEN person.notification_email_enabled
             ELSE person.notification_push_enabled
           END
       ) THEN 'notification_disabled'
       WHEN $4::text = 'customer' AND NOT EXISTS (
         SELECT 1 FROM customers customer
         WHERE customer.id = $6 AND customer.tenant_id = $1
           AND customer.is_active = true AND customer.status = 'active'
       ) THEN 'recipient_inactive'
       WHEN $4::text = 'customer' AND NOT EXISTS (
         SELECT 1
         FROM customers customer
         LEFT JOIN customer_portal_preferences preference
           ON preference.customer_id = customer.id
         WHERE customer.id = $6 AND customer.tenant_id = $1
           AND CASE
             WHEN $3::text = 'email' THEN COALESCE(preference.email_notifications, true)
             ELSE COALESCE(preference.push_notifications, false)
           END
       ) THEN 'notification_disabled'
       WHEN $4::text = 'management' AND $7::uuid IS NULL THEN 'recipient_invalid'
       WHEN $4::text = 'management' AND NOT EXISTS (
         SELECT 1 FROM tenant_users tenant_user
         WHERE tenant_user.tenant_id = $1
           AND tenant_user.user_id = $7
           AND tenant_user.status = 'active'
       ) THEN 'recipient_inactive'
       WHEN $4::text = 'management' AND NOT EXISTS (
         SELECT 1
         FROM tenant_users tenant_user
         JOIN auth.users auth_user ON auth_user.id = tenant_user.user_id
         WHERE tenant_user.tenant_id = $1
           AND tenant_user.user_id = $7
           AND tenant_user.status = 'active'
           AND lower(auth_user.email) = lower($8::text)
       ) THEN 'recipient_invalid'
       WHEN $4::text NOT IN ('management', 'personnel', 'customer') THEN 'recipient_invalid'
       ELSE NULL
     END AS denial_reason
     FROM (VALUES (1)) marker(value)
     LEFT JOIN tenants tenant ON tenant.id = $1`,
    [
      item.tenant_id,
      item.event_key,
      item.channel,
      item.recipient_type,
      item.personnel_id,
      item.customer_id,
      managementRecipientUserId,
      item.recipient_email,
    ],
  );
  const reason = result.rows[0]?.denial_reason ?? null;
  return reason ? { allowed: false, reason } : { allowed: true };
}

function withBasePath(path: string, basePath: string): string {
  if (path === basePath || path.startsWith(`${basePath}/`)) return path;
  return path === "/" ? basePath : `${basePath}${path}`;
}

function normalizePortalHref(recipientType: string, href: unknown): string {
  const rawHref = typeof href === "string" ? href : null;
  const basePath =
    recipientType === "personnel"
      ? "/personeel"
      : recipientType === "customer"
        ? "/klant"
        : "";

  if (recipientType === "personnel") {
    return withBasePath(sanitizePersonnelPortalHref(rawHref), basePath);
  }
  if (recipientType === "customer") {
    return withBasePath(sanitizeCustomerPortalHref(rawHref), basePath);
  }
  return sanitizeBackofficeHref(rawHref);
}

function normalizeUrgency(value: unknown): WebPushUrgency {
  if (value === "high") return "high";
  if (value === "low") return "low";
  if (value === "very-low") return "very-low";
  return "normal";
}

function buildPayload(item: QueueRow): WebPushPayload {
  const payload = toRecord(item.payload);
  const href = normalizePortalHref(
    item.recipient_type,
    item.recipient_type === "management"
      ? (payload["backofficeHref"] ?? payload["href"])
      : payload["href"],
  );
  const priority =
    typeof payload["priority"] === "string" ? payload["priority"] : "normal";
  const urgency = normalizeUrgency(payload["urgency"] ?? priority);

  return {
    ...payload,
    title: item.title,
    body: item.body ?? "",
    href,
    priority,
    urgency,
    tag: item.delivery_key,
    queueId: item.id,
  };
}

function retryTargetIds(
  item: QueueRow,
  targetType: "web_push" | "fcm",
): Set<string> | null {
  const candidates = item.response?.["retryTargets"];
  if (!Array.isArray(candidates)) return null;
  return new Set(
    candidates.flatMap((candidate) => {
      const record = toRecord(candidate);
      return record["targetType"] === targetType &&
        typeof record["targetId"] === "string"
        ? [record["targetId"]]
        : [];
    }),
  );
}

async function getActiveSubscriptions(
  item: QueueRow,
): Promise<PushSubscription[]> {
  let subscriptions: PushSubscription[] = [];
  if (item.recipient_type === "personnel" && item.personnel_id) {
    subscriptions = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.isActive, true),
          eq(pushSubscriptionsTable.tenantId, item.tenant_id),
          eq(pushSubscriptionsTable.personnelId, item.personnel_id),
        ),
      );
  }

  if (item.recipient_type === "customer" && item.customer_id) {
    subscriptions = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.isActive, true),
          eq(pushSubscriptionsTable.tenantId, item.tenant_id),
          eq(pushSubscriptionsTable.customerId, item.customer_id),
        ),
      );
  }
  const retryIds = retryTargetIds(item, "web_push");
  return retryIds
    ? subscriptions.filter((subscription) => retryIds.has(subscription.id))
    : subscriptions;
}

async function getActiveNativeTokens(
  item: QueueRow,
): Promise<NativePushDeviceToken[]> {
  let tokens: NativePushDeviceToken[] = [];
  if (item.recipient_type === "personnel" && item.personnel_id) {
    tokens = await db
      .select()
      .from(nativePushDeviceTokensTable)
      .where(
        and(
          eq(nativePushDeviceTokensTable.isActive, true),
          eq(nativePushDeviceTokensTable.tenantId, item.tenant_id),
          eq(nativePushDeviceTokensTable.provider, "fcm"),
          eq(nativePushDeviceTokensTable.personnelId, item.personnel_id),
        ),
      );
  }

  if (item.recipient_type === "customer" && item.customer_id) {
    tokens = await db
      .select()
      .from(nativePushDeviceTokensTable)
      .where(
        and(
          eq(nativePushDeviceTokensTable.isActive, true),
          eq(nativePushDeviceTokensTable.tenantId, item.tenant_id),
          eq(nativePushDeviceTokensTable.provider, "fcm"),
          eq(nativePushDeviceTokensTable.customerId, item.customer_id),
        ),
      );
  }
  const retryIds = retryTargetIds(item, "fcm");
  return retryIds ? tokens.filter((token) => retryIds.has(token.id)) : tokens;
}

async function deliverEmailItem(
  item: QueueRow,
  config: WorkerConfig,
): Promise<QueueOutcome> {
  if (!item.recipient_email) {
    return failureOutcome(
      item,
      config,
      false,
      "Geen ontvangeradres ingesteld.",
    );
  }

  if (!item.subject || !item.html) {
    return failureOutcome(
      item,
      config,
      false,
      "Geen onderwerp of HTML body ingesteld.",
    );
  }

  const result = await sendEmailWithResult({
    to: item.recipient_email,
    subject: item.subject,
    html: item.html,
    tenantId: item.tenant_id,
    purpose: "notification_worker",
    idempotencyKey: item.delivery_key,
  });

  if (result.success) {
    return {
      status: "sent",
      error: null,
      retryAt: null,
      response: { provider: result.providerType ?? "platform_email" },
      deactivatedSubscriptions: 0,
      deactivatedNativeTokens: 0,
      providerMessageId: result.providerMessageId ?? null,
    };
  }

  return failureOutcome(
    item,
    config,
    true,
    result.error ?? "E-mail delivery mislukt.",
    { provider: "platform_email" },
  );
}

async function deliverPushItem(
  item: QueueRow,
  config: WorkerConfig,
  providers: Pick<NotificationWorkerOptions, "webPushSender" | "fcmPushSender">,
): Promise<QueueOutcome> {
  const [subscriptions, nativeTokens] = await Promise.all([
    getActiveSubscriptions(item),
    getActiveNativeTokens(item),
  ]);

  if (subscriptions.length === 0 && nativeTokens.length === 0) {
    return failureOutcome(
      item,
      config,
      false,
      "Geen actieve push subscriptions of native device tokens gevonden.",
    );
  }

  const payload = buildPayload(item);
  let successCount = 0;
  let transientErrors = 0;
  let permanentErrors = 0;
  let configurationErrors = 0;
  let deactivatedSubscriptions = 0;
  let deactivatedNativeTokens = 0;
  const errors: string[] = [];
  const priorTargetOutcomes = Array.isArray(item.response?.["targetOutcomes"])
    ? item.response["targetOutcomes"].map(toRecord)
    : [];
  const targetOutcomes: Array<Record<string, unknown>> = [];
  const urgency = normalizeUrgency(payload.urgency ?? payload.priority);

  for (const subscription of subscriptions) {
    const result = await (providers.webPushSender ?? sendWebPush)(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      payload,
      3600,
      urgency,
    );

    if (result.success) {
      successCount += 1;
      targetOutcomes.push({
        targetType: "web_push",
        targetId: subscription.id,
        outcome: "sent",
        httpStatus: result.status,
      });
    } else {
      errors.push(
        `subscription ${subscription.id}: ${safeProviderError(result.error)}`,
      );

      if (result.permanent) {
        permanentErrors += 1;
        deactivatedSubscriptions += 1;
        await db
          .update(pushSubscriptionsTable)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(pushSubscriptionsTable.id, subscription.id));
        targetOutcomes.push({
          targetType: "web_push",
          targetId: subscription.id,
          outcome: "permanent_failure",
          httpStatus: result.status,
          deactivated: true,
        });
      } else {
        transientErrors += 1;
        targetOutcomes.push({
          targetType: "web_push",
          targetId: subscription.id,
          outcome: "transient_failure",
          httpStatus: result.status,
        });
      }
    }
  }

  for (const device of nativeTokens) {
    const result = await (providers.fcmPushSender ?? sendFcmPush)(
      device.token,
      payload,
      urgency,
      device.appId,
    );

    if (result.success) {
      successCount += 1;
      targetOutcomes.push({
        targetType: "fcm",
        targetId: device.id,
        outcome: "sent",
        httpStatus: result.status,
        providerMessageId: result.messageId,
      });
      continue;
    }

    errors.push(
      `native token ${device.id}: ${safeProviderError(result.error)}`,
    );

    if (result.configurationMissing) {
      configurationErrors += 1;
      targetOutcomes.push({
        targetType: "fcm",
        targetId: device.id,
        outcome: "configuration_failure",
        httpStatus: result.status,
      });
      continue;
    }

    if (result.permanent) {
      permanentErrors += 1;
      deactivatedNativeTokens += 1;
      await db
        .update(nativePushDeviceTokensTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(nativePushDeviceTokensTable.id, device.id));
      targetOutcomes.push({
        targetType: "fcm",
        targetId: device.id,
        outcome: "permanent_failure",
        httpStatus: result.status,
        deactivated: true,
      });
    } else {
      transientErrors += 1;
      targetOutcomes.push({
        targetType: "fcm",
        targetId: device.id,
        outcome: "transient_failure",
        httpStatus: result.status,
      });
    }
  }

  const retryTargets = targetOutcomes.flatMap((outcome) =>
    outcome["outcome"] === "transient_failure" &&
    typeof outcome["targetType"] === "string" &&
    typeof outcome["targetId"] === "string"
      ? [
          {
            targetType: outcome["targetType"],
            targetId: outcome["targetId"],
          },
        ]
      : [],
  );
  const response = {
    webSubscriptionCount: subscriptions.length,
    nativeTokenCount: nativeTokens.length,
    successCount,
    transientErrors,
    permanentErrors,
    configurationErrors,
    deactivatedSubscriptions,
    deactivatedNativeTokens,
    targetOutcomes: [...priorTargetOutcomes, ...targetOutcomes],
    retryTargets,
  };

  const retryAt = transientErrors > 0 ? calculateRetryAt(item, config) : null;
  if (retryAt) {
    return {
      status: "retry",
      error:
        errors.slice(0, 5).join("; ") ||
        "Push delivery wordt opnieuw geprobeerd.",
      retryAt,
      response,
      deactivatedSubscriptions,
      deactivatedNativeTokens,
      providerMessageId: null,
    };
  }

  if (successCount > 0) {
    const priorPermanentFailure = priorTargetOutcomes.some((outcome) =>
      ["permanent_failure", "configuration_failure"].includes(
        String(outcome["outcome"] ?? ""),
      ),
    );
    return {
      status: errors.length > 0 || priorPermanentFailure ? "partial" : "sent",
      error: errors.length > 0 ? errors.slice(0, 3).join("; ") : null,
      retryAt: null,
      response,
      deactivatedSubscriptions,
      deactivatedNativeTokens,
      providerMessageId: null,
    };
  }

  return {
    ...failureOutcome(
      item,
      config,
      transientErrors > 0,
      errors.slice(0, 5).join("; ") || "Push delivery mislukt.",
      response,
    ),
    deactivatedSubscriptions,
    deactivatedNativeTokens,
  };
}

async function deliverQueueItem(
  item: QueueRow,
  config: WorkerConfig,
  options: NotificationWorkerOptions,
): Promise<QueueOutcome> {
  if (item.channel === "email") {
    return deliverEmailItem(item, config);
  }

  if (item.channel === "push") {
    return deliverPushItem(item, config, options);
  }

  return failureOutcome(
    item,
    config,
    false,
    `Kanaal ${String(item.channel)} wordt niet door deze worker verwerkt.`,
  );
}

export async function processNotificationQueue(
  options: NotificationWorkerOptions = {},
): Promise<NotificationWorkerResult> {
  const config = buildConfig(options);
  const log = options.logger ?? defaultLogger;
  const workerId = options.workerId ?? createWorkerId();
  const channels: NotificationWorkerChannel[] = options.channels?.length
    ? options.channels
    : ["email", "push"];
  const result: NotificationWorkerResult = {
    ok: true,
    workerId,
    claimed: 0,
    processed: 0,
    sent: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
    partial: 0,
    outcomePending: 0,
    rateLimited: false,
    deactivatedSubscriptions: 0,
    deactivatedNativeTokens: 0,
    byChannel: {
      email: {
        claimed: 0,
        sent: 0,
        failed: 0,
        retried: 0,
        skipped: 0,
        partial: 0,
        rateLimited: false,
      },
      push: {
        claimed: 0,
        sent: 0,
        failed: 0,
        retried: 0,
        skipped: 0,
        partial: 0,
        rateLimited: false,
      },
    },
  };

  let remaining = Math.max(1, config.limit);
  log.info(
    { workerId, channels, limit: config.limit },
    "notification-worker: run gestart",
  );

  result.outcomePending = await reconcileUncertainDeliveries(config);
  if (result.outcomePending > 0) {
    log.warn(
      { workerId, count: result.outcomePending },
      "notification-worker: onzekere provideruitkomsten wachten op reconciliatie",
    );
  }

  for (const channel of channels) {
    const channelRateLimit =
      channel === "email" ? config.emailRatePerRun : config.pushRatePerRun;
    const channelLimit = Math.min(remaining, channelRateLimit);
    const channelResult = result.byChannel[channel];

    if (channelRateLimit < remaining) {
      result.rateLimited = true;
      channelResult.rateLimited = true;
    }

    if (channelLimit <= 0) continue;

    const items = await claimQueueItems(
      channel,
      channelLimit,
      workerId,
      config,
    );
    channelResult.claimed += items.length;
    result.claimed += items.length;

    if (items.length > 0 && options.afterClaim) {
      await options.afterClaim(
        items.map((item) => ({ id: item.id, tenantId: item.tenant_id })),
      );
    }

    for (const item of items) {
      let outcome: QueueOutcome;

      try {
        const lifecycle = await checkDeliveryLifecycle(item);
        if (!lifecycle.allowed) {
          outcome = skippedOutcome(lifecycle.reason);
        } else {
          await markDeliveryStarted(item, workerId);
          outcome = options.deliveryOverride
            ? await options.deliveryOverride({
                id: item.id,
                tenantId: item.tenant_id,
                channel: item.channel,
                attemptNo: item.attempts,
                deliveryKey: item.delivery_key,
              })
            : await deliverQueueItem(item, config, options);
        }
      } catch (error) {
        outcome = failureOutcome(item, config, true, errorMessage(error), {
          unexpectedError: true,
        });
      }

      await completeQueueItem(item, workerId, outcome);

      result.processed += 1;
      result.deactivatedSubscriptions += outcome.deactivatedSubscriptions;
      result.deactivatedNativeTokens += outcome.deactivatedNativeTokens;

      if (outcome.status === "sent") {
        result.sent += 1;
        channelResult.sent += 1;
      } else if (outcome.status === "retry") {
        result.retried += 1;
        channelResult.retried += 1;
      } else if (outcome.status === "skipped") {
        result.skipped += 1;
        channelResult.skipped += 1;
      } else if (outcome.status === "partial") {
        result.partial += 1;
        channelResult.partial += 1;
      } else {
        result.failed += 1;
        channelResult.failed += 1;
      }

      if (config.sendDelayMs > 0) {
        await sleep(config.sendDelayMs);
      }
    }

    remaining = Math.max(0, remaining - items.length);
  }

  log.info(
    {
      workerId,
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      retried: result.retried,
      rateLimited: result.rateLimited,
    },
    "notification-worker: run klaar",
  );

  return result;
}

export async function retryFailedNotifications(options: {
  queueIds: string[];
  reason: string;
  confirmedNoDelivery?: boolean;
  logger?: WorkerLogger;
}): Promise<{ ok: true; reviewed: number; requeued: number }> {
  const log = options.logger ?? defaultLogger;
  const queueIds = [...new Set(options.queueIds)].slice(0, 100);
  if (
    queueIds.length === 0 ||
    queueIds.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          id,
        ),
    )
  ) {
    throw new Error("notification_retry_requires_exact_queue_ids");
  }
  const reason = options.reason.trim();
  if (reason.length < 10 || reason.length > 500) {
    throw new Error("notification_retry_requires_bounded_review_reason");
  }
  const result = await pool.query<{ id: string }>(
    `
      WITH candidates AS (
        SELECT id
        FROM notification_delivery_queue
        WHERE id = ANY($1::uuid[])
          AND channel IN ('email', 'push')
          AND (
            status IN ('failed', 'partial')
            OR (status = 'outcome_pending' AND $3::boolean = true)
          )
        FOR UPDATE SKIP LOCKED
      )
      UPDATE notification_delivery_queue q
      SET status = 'retry',
          next_attempt_at = now(),
          locked_at = NULL,
          locked_by = NULL,
          processing_started_at = NULL,
          delivery_started_at = NULL,
          terminal_attempt_id = NULL,
          last_error = NULL,
          error_details = COALESCE(q.error_details, '{}'::jsonb) ||
            jsonb_build_object(
              'manualRetry',
              jsonb_build_object(
                'reason', $2::text,
                'confirmedNoDelivery', $3::boolean,
                'reviewedAt', now()
              )
            ),
          max_attempts = GREATEST(q.max_attempts, q.attempts + 1),
          updated_at = now()
      FROM candidates c
      WHERE q.id = c.id
      RETURNING q.id
    `,
    [queueIds, reason, options.confirmedNoDelivery === true],
  );

  log.info(
    {
      reviewed: queueIds.length,
      requeued: result.rowCount,
      confirmedNoDelivery: options.confirmedNoDelivery === true,
    },
    "notification-worker: expliciet beoordeelde queue-items opnieuw klaargezet",
  );

  return {
    ok: true,
    reviewed: queueIds.length,
    requeued: result.rowCount ?? 0,
  };
}
