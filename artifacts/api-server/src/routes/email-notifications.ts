import { Router } from "express";
import type { Request, Response } from "express";
import { db, notificationDeliveryQueueTable } from "@workspace/db";
import { and, asc, eq, lt } from "drizzle-orm";
import { sendEmailWithResult } from "../lib/email";

const router = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const DEFAULT_MAX_ATTEMPTS = 5;

type QueueItem = typeof notificationDeliveryQueueTable.$inferSelect;

function requireAdminSecret(req: Request, res: Response): boolean {
  const expectedSecret = process.env["ADMIN_API_SECRET"];
  if (!expectedSecret) {
    req.log.error("ADMIN_API_SECRET not configured - email-notifications route disabled");
    res.status(503).json({ error: "Route niet beschikbaar" });
    return false;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expectedSecret) {
    req.log.warn({ ip: req.ip }, "email-notifications: ongeldige token");
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
 * POST /api/admin/email-notifications
 *
 * Delivers queued e-mail notifications from notification_delivery_queue.
 * Intended for a systemd timer, protected by ADMIN_API_SECRET.
 */
router.post("/admin/email-notifications", async (req: Request, res: Response) => {
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
          eq(notificationDeliveryQueueTable.channel, "email"),
          eq(notificationDeliveryQueueTable.status, "queued"),
          lt(notificationDeliveryQueueTable.attempts, maxAttempts),
        ),
      )
      .orderBy(asc(notificationDeliveryQueueTable.createdAt))
      .limit(limit);

    req.log.info({ count: items.length, limit, maxAttempts }, "email-notifications: verwerken gestart");

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let retried = 0;

    for (const item of items) {
      if (!item.recipientEmail) {
        await updateQueueItem(item, "skipped", "Geen ontvangeradres ingesteld.");
        skipped += 1;
        continue;
      }

      if (!item.subject || !item.html) {
        await updateQueueItem(item, "skipped", "Geen onderwerp of HTML body ingesteld.");
        skipped += 1;
        continue;
      }

      const result = await sendEmailWithResult({
        to: item.recipientEmail,
        subject: item.subject,
        html: item.html,
      });

      if (result.success) {
        await updateQueueItem(item, "sent", null);
        sent += 1;
        continue;
      }

      const nextAttempt = item.attempts + 1;
      if (nextAttempt < maxAttempts) {
        await updateQueueItem(item, "queued", result.error ?? "E-mail delivery mislukt.");
        retried += 1;
        continue;
      }

      await updateQueueItem(item, "failed", result.error ?? "E-mail delivery mislukt.");
      failed += 1;
    }

    req.log.info({ sent, skipped, failed, retried }, "email-notifications: klaar");

    res.json({
      ok: true,
      processed: items.length,
      sent,
      skipped,
      failed,
      retried,
    });
  } catch (err) {
    req.log.error({ err }, "email-notifications: onverwachte fout");
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
