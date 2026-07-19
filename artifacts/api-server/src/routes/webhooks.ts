import { Router } from "express";
import {
  applyProviderPaymentSnapshot,
  bindProviderPayment,
  fetchMolliePayment,
  maskPaymentProviderId,
  pool,
} from "@workspace/db";
import type { Request, Response } from "express";
import { verifyMollieSignature } from "../lib/mollie";

const router = Router();

/**
 * Classic Mollie payment callback plus a Fieldgrid edge-authentication layer.
 *
 * Mollie's form `id` is only a wake-up hint. The fetched payment envelope is
 * authoritative and is verified against the immutable local intent before the
 * canonical database settlement command may mutate financial state.
 * Fieldgrid deployments additionally require an HMAC over the exact raw form
 * body at the trusted ingress. This is intentionally not Mollie Next-gen event
 * signing; adopting that protocol requires a separate JSON endpoint.
 */
router.post("/webhooks/mollie", async (req: Request, res: Response) => {
  const webhookSecret = process.env.MOLLIE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    req.log.error(
      "MOLLIE_WEBHOOK_SECRET is missing; payment callback is fail-closed",
    );
    res.status(503).send("payment webhook unavailable");
    return;
  }

  const signature = req.headers["x-mollie-signature"];
  const rawBody = req.rawBody?.toString("utf8") ?? "";
  if (
    typeof signature !== "string" ||
    !verifyMollieSignature(rawBody, signature, webhookSecret)
  ) {
    req.log.warn(
      { ip: req.ip },
      "Mollie callback rejected because edge signature is missing or invalid",
    );
    res.status(400).send("invalid signature");
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const paymentId = body?.id;
  if (
    typeof paymentId !== "string" ||
    !/^tr_[A-Za-z0-9_-]{1,47}$/u.test(paymentId)
  ) {
    req.log.warn("Mollie callback contained no canonical payment ID");
    res.status(400).send("invalid payment reference");
    return;
  }
  const paymentReference = maskPaymentProviderId(paymentId);

  const local = await pool.query(
    "select id from public.payments where mollie_payment_id = $1 limit 1",
    [paymentId],
  );
  try {
    const snapshot = await fetchMolliePayment(paymentId);
    if (!local.rows[0]) {
      // A callback may win the race with the create-response binding. The
      // provider metadata contains only the already-durable local intent ID;
      // bindProviderPayment verifies every immutable field before correlation.
      await bindProviderPayment(snapshot.metadata.paymentIntentId, snapshot);
    }
    const result = await applyProviderPaymentSnapshot(snapshot);
    req.log.info(
      { paymentReference, providerStatus: snapshot.status, ...result },
      "Verified provider payment observation processed",
    );
    // Mismatches are durably quarantined for reconciliation. Retrying the same
    // contradictory provider envelope cannot make it safe, so acknowledge it.
    res.status(200).send("ok");
  } catch (error) {
    req.log.error(
      {
        paymentReference,
        error: error instanceof Error ? error.message : String(error),
      },
      "Verified payment observation could not be processed",
    );
    res
      .status(502)
      .send(
        process.env.NODE_ENV === "test" && error instanceof Error
          ? `payment provider status unavailable: ${error.message}`
          : "payment provider status unavailable",
      );
  }
});

export default router;
