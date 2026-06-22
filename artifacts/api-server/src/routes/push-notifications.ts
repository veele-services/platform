import { Router } from "express";
import type { Request, Response } from "express";
import { parsePositiveInt, requireAdminSecret } from "../lib/admin-api";
import { processNotificationQueue } from "../lib/notification-worker";

const router = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Legacy-compatible route for existing systemd timers/backoffice buttons.
 * New deployments should prefer POST /api/admin/notification-worker.
 */
router.post("/admin/push-notifications", async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res, "push-notifications")) return;

  const limit = parsePositiveInt(
    req.query["limit"] ?? req.body?.limit,
    DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const maxAttempts = parsePositiveInt(
    req.query["maxAttempts"] ?? req.body?.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
    20,
  );

  try {
    const result = await processNotificationQueue({
      channels: ["push"],
      limit,
      maxAttempts,
      logger: req.log,
    });

    res.json({
      ok: true,
      processed: result.processed,
      sent: result.sent,
      skipped: 0,
      failed: result.failed,
      retried: result.retried,
      deactivatedSubscriptions: result.deactivatedSubscriptions,
      rateLimited: result.rateLimited,
    });
  } catch (err) {
    req.log.error({ err }, "push-notifications: onverwachte fout");
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
