import { Router } from "express";
import { db } from "@workspace/db";
import { paymentsTable, invoicesTable, assignmentsTable, auditLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";

const router = Router();

/**
 * POST /api/webhooks/mollie?secret=<MOLLIE_WEBHOOK_SECRET>
 *
 * Mollie sends a form-encoded POST with a single field: `id` (the payment ID).
 * We re-fetch the payment from Mollie to verify the status (re-verification pattern).
 *
 * Security: Mollie does not use webhook signatures. Security is guaranteed by:
 *   1. A pre-shared secret token in the query-string (`?secret=…`), validated before
 *      any processing. Configure MOLLIE_WEBHOOK_SECRET in env and append it to the
 *      webhook URL registered in the Mollie dashboard.
 *   2. Always re-fetching the payment status from the Mollie API (never trusting the body).
 *   3. The Mollie API key is required to retrieve the payment.
 *
 * Spec: https://docs.mollie.com/docs/webhooks
 */
router.post("/webhooks/mollie", async (req: Request, res: Response) => {
  // ── Secret token guard (fail-closed) ────────────────────────────────────────
  // MOLLIE_WEBHOOK_SECRET is REQUIRED. If it is not configured, ALL webhook
  // calls are rejected and an error is logged so operators are alerted.
  // Set it in the environment and append ?secret=<value> to the Mollie webhook URL.
  const expectedSecret = process.env.MOLLIE_WEBHOOK_SECRET;
  if (!expectedSecret) {
    req.log.error(
      "MOLLIE_WEBHOOK_SECRET is not configured — Mollie webhook rejected (fail-closed). " +
      "Set this env var and register the URL as /api/webhooks/mollie?secret=<value> in Mollie.",
    );
    // Return 200 so Mollie does not retry; the problem is our misconfiguration, not Mollie's.
    res.status(200).send("ok");
    return;
  }

  const providedSecret = (req.query as Record<string, string | undefined>)["secret"];
  if (providedSecret !== expectedSecret) {
    req.log.warn(
      { ip: req.ip, hasSecret: !!providedSecret },
      "Mollie webhook rejected — invalid or missing secret token",
    );
    res.status(200).send("ok");
    return;
  }

  const mollieKey = process.env.MOLLIE_API_KEY;
  if (!mollieKey) {
    req.log.error("MOLLIE_API_KEY not configured — cannot process webhook");
    res.status(200).send("ok"); // Always 200 to prevent Mollie retries on config errors
    return;
  }

  const molliePaymentId = (req.body as Record<string, string>)["id"];
  if (!molliePaymentId || !molliePaymentId.startsWith("tr_")) {
    req.log.warn({ body: req.body }, "Mollie webhook received invalid or missing payment ID");
    res.status(200).send("ok");
    return;
  }

  req.log.info({ molliePaymentId }, "Mollie webhook received");

  // Re-fetch payment from Mollie to get the authoritative status
  let mollieStatus: string;
  try {
    const response = await fetch(`https://api.mollie.com/v2/payments/${molliePaymentId}`, {
      headers: { Authorization: `Bearer ${mollieKey}` },
    });

    if (!response.ok) {
      req.log.error({ molliePaymentId, status: response.status }, "Failed to fetch payment from Mollie");
      res.status(200).send("ok");
      return;
    }

    type MolliePayment = { id: string; status: string; paidAt?: string };
    const data = (await response.json()) as MolliePayment;
    mollieStatus = data.status;

    req.log.info({ molliePaymentId, mollieStatus }, "Fetched payment status from Mollie");

    // Find local payment record
    const [payment] = await db
      .select({ id: paymentsTable.id, invoiceId: paymentsTable.invoiceId, status: paymentsTable.status })
      .from(paymentsTable)
      .where(eq(paymentsTable.molliePaymentId, molliePaymentId))
      .limit(1);

    if (!payment) {
      req.log.warn({ molliePaymentId }, "No local payment record found for Mollie payment ID");
      res.status(200).send("ok");
      return;
    }

    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
    const previousStatus = payment.status;

    // audit_log.user_id is UUID NOT NULL; use dedicated system actor UUID
    // for webhook/background events with no Supabase auth user.
    const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";

    // Update local payment status
    await db
      .update(paymentsTable)
      .set({
        status: mollieStatus,
        paidAt: mollieStatus === "paid" ? paidAt : undefined,
      })
      .where(eq(paymentsTable.molliePaymentId, molliePaymentId));

    // Log every status transition (open, paid, canceled, expired, failed, …)
    await db.insert(auditLogTable).values({
      userId:     SYSTEM_ACTOR_UUID,
      action:     "mollie_payment_status_changed",
      resource:   "payments",
      resourceId: payment.id,
      metadata:   {
        molliePaymentId,
        invoiceId: payment.invoiceId,
        previousStatus,
        newStatus: mollieStatus,
      },
    });

    // If paid: advance invoice and assignment
    if (mollieStatus === "paid") {
      const [invoice] = await db
        .select({ id: invoicesTable.id, status: invoicesTable.status, assignmentId: invoicesTable.assignmentId })
        .from(invoicesTable)
        .where(eq(invoicesTable.id, payment.invoiceId))
        .limit(1);

      if (invoice && invoice.status === "sent") {
        const paidDateStr = paidAt.toISOString().slice(0, 10);

        await db
          .update(invoicesTable)
          .set({ status: "paid", paidDate: paidDateStr, updatedAt: new Date() })
          .where(eq(invoicesTable.id, invoice.id));

        // Advance assignment: invoiced → paid → closed
        await db
          .update(assignmentsTable)
          .set({ status: "paid", updatedAt: new Date() })
          .where(eq(assignmentsTable.id, invoice.assignmentId));

        await db
          .update(assignmentsTable)
          .set({ status: "closed", updatedAt: new Date() })
          .where(eq(assignmentsTable.id, invoice.assignmentId));

        await db.insert(auditLogTable).values({
          userId:     SYSTEM_ACTOR_UUID,
          action:     "mollie_payment_received",
          resource:   "invoices",
          resourceId: invoice.id,
          metadata:   { molliePaymentId, paidAt: paidAt.toISOString() },
        });

        req.log.info({ invoiceId: invoice.id, molliePaymentId }, "Invoice marked as paid via Mollie webhook");
      }
    }
  } catch (err) {
    req.log.error({ err, molliePaymentId }, "Unexpected error in Mollie webhook handler");
  }

  // Always return 200 — Mollie will retry on non-200
  res.status(200).send("ok");
});

export default router;
