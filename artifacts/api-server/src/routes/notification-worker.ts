import { Router } from "express";
import type { Request, Response } from "express";
import {
  parseNotificationWorkerChannels,
  parsePositiveInt,
  requireAdminSecret,
} from "../lib/admin-api";
import {
  processNotificationQueue,
  retryFailedNotifications,
} from "../lib/notification-worker";

const router = Router();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_MAX_ATTEMPTS = 5;

router.post(
  "/admin/notification-worker",
  async (req: Request, res: Response) => {
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
  },
);

router.post(
  "/admin/notification-worker/retry-failed",
  async (req: Request, res: Response) => {
    if (!requireAdminSecret(req, res, "notification-worker-retry")) return;

    const queueIds = req.body?.queueIds;
    const reason = req.body?.reason;
    const confirmedNoDelivery = req.body?.confirmedNoDelivery === true;
    if (
      !Array.isArray(queueIds) ||
      queueIds.length === 0 ||
      queueIds.length > 100 ||
      queueIds.some((id) => typeof id !== "string") ||
      typeof reason !== "string"
    ) {
      res.status(400).json({
        error:
          "Exacte queueIds en een beoordelingsreden zijn verplicht voor handmatige retry.",
      });
      return;
    }

    try {
      const result = await retryFailedNotifications({
        queueIds,
        reason,
        confirmedNoDelivery,
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
