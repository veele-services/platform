import { Router } from "express";
import type { Request, Response } from "express";
import {
  db,
  notificationDeliveryQueueTable,
  pushSubscriptionsTable,
} from "@workspace/db";
import { and, asc, eq, lt } from "drizzle-orm";
import {
  sendWebPush,
  type WebPushPayload,
  type WebPushUrgency,
} from "../lib/web-push";

const router = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const DEFAULT_MAX_ATTEMPTS = 5;

type QueueItem = typeof notificationDeliveryQueueTable.$inferSelect;
type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;

function requireAdminSecret(req: Request, res: Response): boolean {
  const expectedSecret = process.env["ADMIN_API_SECRET"];
  if (!expectedSecret) {
    req.log.error("ADMIN_API_SECRET not configured - push-notifications route disabled");
    res.status(503).json({ error: "Route niet beschikbaar" });
    return false;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expectedSecret) {
    req.log.warn({ ip: req.ip }, "push-notifications: ongeldige token");
    res.status(401).json({ error: "Ongeautoriseerd" });
    return false;
  }

  return true;
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
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

function buildPayload(item: QueueItem): WebPushPayload {
  const payload =
    item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
      ? item.payload
      : {};
  const href = normalizePortalHref(item.recipientType, payload["href"]);
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
    tag: item.dispatchId ?? item.id,
    queueId: item.id,
  };
}

async function getActiveSubscriptions(item: QueueItem): Promise<PushSubscription[]> {
  if (item.recipientType === "personnel" && item.personnelId) {
    return db
      .select()
      .from(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.isActive, true),
          eq(pushSubscriptionsTable.personnelId, item.personnelId),
        ),
      );
  }

  if (item.recipientType === "customer" && item.customerId) {
    return db
      .select()
      .from(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.isActive, true),
          eq(pushSubscriptionsTable.customerId, item.customerId),
        ),
      );
  }

  return [];
}

async function updateQueueItem(
  item: QueueItem,
  status: "queued" | "sent" | "failed" | "skipped",
  lastError: string | null,
) {
  await db
    .update(notificationDeliveryQueueTable)
    .set({
      status,
      attempts: item.attempts + 1,
      lastError,
      sentAt: status === "sent" ? new Date() : null,
    })
    .where(eq(notificationDeliveryQueueTable.id, item.id));
}

/**
 * POST /api/admin/push-notifications
 *
 * Delivers queued Web Push notifications from notification_delivery_queue.
 * The route is designed for a systemd timer and is protected by
 * ADMIN_API_SECRET, just like payment-reminders and expired-quotes.
 */
router.post("/admin/push-notifications", async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res)) return;

  const limit = parsePositiveInt(req.query["limit"] ?? req.body?.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const maxAttempts = parsePositiveInt(
    req.query["maxAttempts"] ?? req.body?.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
    20,
  );

  try {
    const items = await db
      .select()
      .from(notificationDeliveryQueueTable)
      .where(
        and(
          eq(notificationDeliveryQueueTable.channel, "push"),
          eq(notificationDeliveryQueueTable.status, "queued"),
          lt(notificationDeliveryQueueTable.attempts, maxAttempts),
        ),
      )
      .orderBy(asc(notificationDeliveryQueueTable.createdAt))
      .limit(limit);

    req.log.info({ count: items.length, limit, maxAttempts }, "push-notifications: verwerken gestart");

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let retried = 0;
    let deactivatedSubscriptions = 0;

    for (const item of items) {
      const subscriptions = await getActiveSubscriptions(item);

      if (subscriptions.length === 0) {
        await updateQueueItem(item, "skipped", "Geen actieve push subscriptions gevonden.");
        skipped += 1;
        continue;
      }

      const payload = buildPayload(item);
      let successCount = 0;
      let transientErrors = 0;
      let permanentErrors = 0;
      const errors: string[] = [];

      for (const subscription of subscriptions) {
        const result = await sendWebPush({
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        }, payload, 3600, normalizeUrgency(payload.urgency ?? payload.priority));

        if (result.success) {
          successCount += 1;
          continue;
        }

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

      if (successCount > 0) {
        await updateQueueItem(
          item,
          "sent",
          errors.length > 0 ? errors.slice(0, 3).join("; ") : null,
        );
        sent += 1;
        continue;
      }

      const nextAttempt = item.attempts + 1;
      const errorText = errors.slice(0, 5).join("; ") || "Push delivery mislukt.";

      if (transientErrors > 0 && nextAttempt < maxAttempts) {
        await updateQueueItem(item, "queued", errorText);
        retried += 1;
        continue;
      }

      await updateQueueItem(
        item,
        permanentErrors > 0 && transientErrors === 0 ? "skipped" : "failed",
        errorText,
      );
      if (permanentErrors > 0 && transientErrors === 0) skipped += 1;
      else failed += 1;
    }

    req.log.info(
      { sent, skipped, failed, retried, deactivatedSubscriptions },
      "push-notifications: klaar",
    );

    res.json({
      ok: true,
      processed: items.length,
      sent,
      skipped,
      failed,
      retried,
      deactivatedSubscriptions,
    });
  } catch (err) {
    req.log.error({ err }, "push-notifications: onverwachte fout");
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
