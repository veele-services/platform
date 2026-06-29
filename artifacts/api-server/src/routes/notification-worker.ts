import { Router } from "express";
import type { Request, Response } from "express";
import {
  parseNotificationWorkerChannels,
  parsePositiveInt,
  requireAdminSecret,
  type NotificationWorkerChannel,
} from "../lib/admin-api";
import {
  processNotificationQueue,
  retryFailedNotifications,
} from "../lib/notification-worker";

const router = Router();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_MAX_ATTEMPTS = 5;

router.post("/admin/notification-worker", async (req: Request, res: Response) => {
  if (!requireAdminSecret(req, res, "notification-worker")) return;

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
  const channels = parseNotificationWorkerChannels(
    req.query["channels"] ?? req.body?.channels,
  );

  try {
    const result = await processNotificationQueue({
      channels,
      limit,
      maxAttempts,
      logger: req.log,
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "notification-worker: onverwachte fout");
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post(
  "/admin/notification-worker/retry-failed",
  async (req: Request, res: Response) => {
    if (!requireAdminSecret(req, res, "notification-worker-retry")) return;

    const channels = parseNotificationWorkerChannels(
      req.query["channels"] ?? req.body?.channels,
    );
    const channel =
      channels.length === 1 ? channels[0] : undefined;
    const limit = parsePositiveInt(
      req.query["limit"] ?? req.body?.limit,
      DEFAULT_LIMIT,
      MAX_LIMIT,
    );

    try {
      const result = await retryFailedNotifications({
        channel: channel as NotificationWorkerChannel | undefined,
        limit,
        logger: req.log,
      });

      res.json(result);
    } catch (err) {
      req.log.error({ err }, "notification-worker-retry: onverwachte fout");
      res.status(500).json({ error: "Interne fout" });
    }
  },
);

export default router;
