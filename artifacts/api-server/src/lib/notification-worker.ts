import { and, eq } from "drizzle-orm";
import { db, pool, pushSubscriptionsTable } from "@workspace/db";
import { sendEmailWithResult } from "./email";
import { logger as defaultLogger } from "./logger";
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
  attempts: number;
  max_attempts: number;
  rate_limit_key: string | null;
};

type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;

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

type QueueOutcomeStatus = "sent" | "failed" | "retry";

type QueueOutcome = {
  status: QueueOutcomeStatus;
  error: string | null;
  retryAt: Date | null;
  response: Record<string, unknown>;
  deactivatedSubscriptions: number;
};

export type NotificationWorkerResult = {
  ok: true;
  workerId: string;
  claimed: number;
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  rateLimited: boolean;
  deactivatedSubscriptions: number;
  byChannel: Record<NotificationWorkerChannel, {
    claimed: number;
    sent: number;
    failed: number;
    retried: number;
    rateLimited: boolean;
  }>;
};

export type NotificationWorkerOptions = Partial<WorkerConfig> & {
  channels?: NotificationWorkerChannel[];
  logger?: WorkerLogger;
  workerId?: string;
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
      envInt("NOTIFICATION_WORKER_MAX_ATTEMPTS", DEFAULT_CONFIG.maxAttempts, 20),
    lockSeconds:
      options.lockSeconds ??
      envInt("NOTIFICATION_WORKER_LOCK_SECONDS", DEFAULT_CONFIG.lockSeconds, 3600),
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
      envInt("NOTIFICATION_WORKER_SEND_DELAY_MS", DEFAULT_CONFIG.sendDelayMs, 5000),
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
  };
}

async function claimQueueItems(
  channel: NotificationWorkerChannel,
  limit: number,
  workerId: string,
  config: WorkerConfig,
): Promise<QueueRow[]> {
  if (limit <= 0) return [];

  const result = await pool.query<QueueRow>(
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
        q.attempts,
        q.max_attempts,
        q.rate_limit_key
    `,
    [channel, limit, config.lockSeconds, config.maxAttempts, workerId],
  );

  return result.rows;
}

async function completeQueueItem(
  item: QueueRow,
  workerId: string,
  outcome: QueueOutcome,
  log: WorkerLogger,
): Promise<void> {
  const errorDetails =
    outcome.error === null
      ? {}
      : {
          message: outcome.error,
          attempt: item.attempts,
          channel: item.channel,
        };

  const result = await pool.query(
    `
      UPDATE notification_delivery_queue
      SET status = $3,
          locked_at = NULL,
          locked_by = NULL,
          processing_started_at = NULL,
          last_error = $4,
          error_details = $5::jsonb,
          response = $6::jsonb,
          next_attempt_at = COALESCE($7::timestamptz, next_attempt_at),
          sent_at = CASE WHEN $3 = 'sent' THEN now() ELSE sent_at END,
          updated_at = now()
      WHERE id = $1
        AND locked_by = $2
    `,
    [
      item.id,
      workerId,
      outcome.status,
      outcome.error,
      JSON.stringify(errorDetails),
      JSON.stringify(outcome.response),
      outcome.retryAt ? outcome.retryAt.toISOString() : null,
    ],
  );

  if (result.rowCount === 0) {
    log.warn(
      { queueId: item.id, workerId, status: outcome.status },
      "notification-worker: queue item lock was not owned by this worker",
    );
  }
}

async function recordAttempt(
  item: QueueRow,
  workerId: string,
  outcome: QueueOutcome,
  log: WorkerLogger,
): Promise<void> {
  try {
    await pool.query(
      `
        INSERT INTO notification_delivery_attempts (
          queue_id,
          tenant_id,
          channel,
          attempt_no,
          worker_id,
          status,
          error,
          response,
          started_at,
          finished_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now(), now())
      `,
      [
        item.id,
        item.tenant_id,
        item.channel,
        item.attempts,
        workerId,
        outcome.status,
        outcome.error,
        JSON.stringify(outcome.response),
      ],
    );
  } catch (error) {
    log.error(
      { err: error, queueId: item.id },
      "notification-worker: poginglog kon niet worden geschreven",
    );
  }
}

function normalizePortalHref(recipientType: string, href: unknown): string {
  const basePath =
    recipientType === "personnel"
      ? "/personeel"
      : recipientType === "customer"
        ? "/klant"
        : "";
  const fallback = basePath ? `${basePath}/meldingen` : "/meldingen";

  if (typeof href !== "string" || href.trim().length === 0) {
    return fallback;
  }

  const trimmed = href.trim();
  if (/^https?:\/\//iu.test(trimmed)) {
    return trimmed;
  }

  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (!basePath || path === basePath || path.startsWith(`${basePath}/`)) {
    return path;
  }

  return `${basePath}${path}`;
}

function normalizeUrgency(value: unknown): WebPushUrgency {
  if (value === "high") return "high";
  if (value === "low") return "low";
  if (value === "very-low") return "very-low";
  return "normal";
}

function buildPayload(item: QueueRow): WebPushPayload {
  const payload = toRecord(item.payload);
  const href = normalizePortalHref(item.recipient_type, payload["href"]);
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
    tag: item.dispatch_id ?? item.id,
    queueId: item.id,
  };
}

async function getActiveSubscriptions(item: QueueRow): Promise<PushSubscription[]> {
  if (item.recipient_type === "personnel" && item.personnel_id) {
    return db
      .select()
      .from(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.isActive, true),
          eq(pushSubscriptionsTable.personnelId, item.personnel_id),
        ),
      );
  }

  if (item.recipient_type === "customer" && item.customer_id) {
    return db
      .select()
      .from(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.isActive, true),
          eq(pushSubscriptionsTable.customerId, item.customer_id),
        ),
      );
  }

  return [];
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
  });

  if (result.success) {
    return {
      status: "sent",
      error: null,
      retryAt: null,
      response: { provider: "resend" },
      deactivatedSubscriptions: 0,
    };
  }

  return failureOutcome(
    item,
    config,
    true,
    result.error ?? "E-mail delivery mislukt.",
    { provider: "resend" },
  );
}

async function deliverPushItem(
  item: QueueRow,
  config: WorkerConfig,
): Promise<QueueOutcome> {
  const subscriptions = await getActiveSubscriptions(item);

  if (subscriptions.length === 0) {
    return failureOutcome(
      item,
      config,
      false,
      "Geen actieve push subscriptions gevonden.",
    );
  }

  const payload = buildPayload(item);
  let successCount = 0;
  let transientErrors = 0;
  let permanentErrors = 0;
  let deactivatedSubscriptions = 0;
  const errors: string[] = [];

  for (const subscription of subscriptions) {
    const result = await sendWebPush(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      payload,
      3600,
      normalizeUrgency(payload.urgency ?? payload.priority),
    );

    if (result.success) {
      successCount += 1;
    } else {
      errors.push(`subscription ${subscription.id}: ${result.error}`);

      if (result.permanent) {
        permanentErrors += 1;
        deactivatedSubscriptions += 1;
        await db
          .update(pushSubscriptionsTable)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(pushSubscriptionsTable.id, subscription.id));
      } else {
        transientErrors += 1;
      }
    }
  }

  const response = {
    subscriptionCount: subscriptions.length,
    successCount,
    transientErrors,
    permanentErrors,
    deactivatedSubscriptions,
  };

  if (successCount > 0) {
    return {
      status: "sent",
      error: errors.length > 0 ? errors.slice(0, 3).join("; ") : null,
      retryAt: null,
      response,
      deactivatedSubscriptions,
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
  };
}

async function deliverQueueItem(
  item: QueueRow,
  config: WorkerConfig,
): Promise<QueueOutcome> {
  if (item.channel === "email") {
    return deliverEmailItem(item, config);
  }

  if (item.channel === "push") {
    return deliverPushItem(item, config);
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
    rateLimited: false,
    deactivatedSubscriptions: 0,
    byChannel: {
      email: { claimed: 0, sent: 0, failed: 0, retried: 0, rateLimited: false },
      push: { claimed: 0, sent: 0, failed: 0, retried: 0, rateLimited: false },
    },
  };

  let remaining = Math.max(1, config.limit);
  log.info(
    { workerId, channels, limit: config.limit },
    "notification-worker: run gestart",
  );

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

    const items = await claimQueueItems(channel, channelLimit, workerId, config);
    channelResult.claimed += items.length;
    result.claimed += items.length;

    for (const item of items) {
      let outcome: QueueOutcome;

      try {
        outcome = await deliverQueueItem(item, config);
      } catch (error) {
        outcome = failureOutcome(
          item,
          config,
          true,
          errorMessage(error),
          { unexpectedError: true },
        );
      }

      await completeQueueItem(item, workerId, outcome, log);
      await recordAttempt(item, workerId, outcome, log);

      result.processed += 1;
      result.deactivatedSubscriptions += outcome.deactivatedSubscriptions;

      if (outcome.status === "sent") {
        result.sent += 1;
        channelResult.sent += 1;
      } else if (outcome.status === "retry") {
        result.retried += 1;
        channelResult.retried += 1;
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
  channel?: NotificationWorkerChannel;
  limit?: number;
  logger?: WorkerLogger;
} = {}): Promise<{ ok: true; requeued: number }> {
  const log = options.logger ?? defaultLogger;
  const limit = Math.min(Math.max(1, options.limit ?? 100), 500);
  const channel = options.channel;
  const result = await pool.query<{ id: string }>(
    `
      WITH candidates AS (
        SELECT id
        FROM notification_delivery_queue
        WHERE status = 'failed'
          AND channel IN ('email', 'push')
          AND ($1::text IS NULL OR channel = $1)
          AND attempts < max_attempts
        ORDER BY updated_at ASC, created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE notification_delivery_queue q
      SET status = 'retry',
          next_attempt_at = now(),
          locked_at = NULL,
          locked_by = NULL,
          processing_started_at = NULL,
          last_error = NULL,
          updated_at = now()
      FROM candidates c
      WHERE q.id = c.id
      RETURNING q.id
    `,
    [channel ?? null, limit],
  );

  log.info(
    { requeued: result.rowCount, channel: channel ?? "all" },
    "notification-worker: failed queue items opnieuw klaargezet",
  );

  return { ok: true, requeued: result.rowCount ?? 0 };
}
